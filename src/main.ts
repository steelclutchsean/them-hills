import * as THREE from 'three';
import {
  ALL_CATEGORIES,
  EQUIPMENT,
  computeYieldMultiplier,
  getNextUpgrade,
  type EquipmentCategory,
} from '@/economy/equipment';
import { createSpotPriceService } from '@/economy/spot-price';
import { buildTrackerView } from '@/quests/quests';
import { ASSETS } from '@/game/assets';
import { placeBoulders } from '@/game/boulders';
import { bearingFromYaw, createCameraRig } from '@/game/camera-rig';
import { createCamp } from '@/game/camp';
import { createCharacter } from '@/game/character';
import {
  INNKEEPER_DIALOGUE,
  OLD_PETE_DIALOGUE,
  getCurrentNode,
  resolveBody,
  resolveOptions,
  startDialogue,
  type DialogueSession,
} from '@/game/dialogue';
import { createGeneralStore } from '@/game/general-store';
import { createGrassField } from '@/game/grass-field';
import { createHeadlamp } from '@/game/headlamp';
import { createInn } from '@/game/inn';
import { createMineEntrance } from '@/game/mine';
import { createOldPete } from '@/game/old-pete';
import { createProspectingController } from '@/game/prospecting';
import { createClassifyMeterView } from '@/game/minigames/classify-meter';
import { createCollectView } from '@/game/minigames/collect-view';
import { createDigMeterView } from '@/game/minigames/dig-meter';
import { createPanView } from '@/game/minigames/pan-view';
import {
  createClassifierMesh,
  createPickaxeMesh,
  createShovelMesh,
} from '@/game/minigames/tool-models';
import { scatterAssets } from '@/game/scatter';
import { SKY_SECONDS_PER_DAY, createSkyController, formatClock, getSkyHour } from '@/game/sky';
import { createStream, createStreamRegistry, type StreamConfig } from '@/game/stream';
import { CAMP_REST_TIME_ADVANCE, computeSurvivalYieldFactor } from '@/game/survival';
import { createTerrain, type ChannelConfig } from '@/game/terrain';
import { createWeatherController } from '@/game/weather';
import { createVendors, type Vendor } from '@/game/vendor';
import { createCameraModeController } from '@/engine/camera-modes';
import { createGameLoop } from '@/engine/loop';
import { createRenderer } from '@/engine/renderer';
import { createInputManager } from '@/input/manager';
import { createPhysicsWorld, RAPIER } from '@/physics/world';
import { initSaveSystem, loadSave, saveCurrentState } from '@/save/store';
import type { SaveV1 } from '@/save/schema';
import { gameStore } from '@/state/store';
import { mountHud } from '@/ui/hud';
import { mountMinimap, type MinimapLandmark, type MinimapStream } from '@/ui/minimap';
import { createAudioSystem } from '@/audio/system';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const hudEl = document.getElementById('hud') as HTMLElement | null;
  if (!canvas || !hudEl) {
    throw new Error('[bootstrap] required DOM nodes missing');
  }

  // ---- Save system ----
  await initSaveSystem();
  const loaded = await loadSave();
  if (loaded) {
    console.log(
      `[save] Loaded existing save (saveCount=${loaded.metadata.saveCount}, build=${loaded.metadata.buildVersion})`,
    );
    gameStore.getState().hydrate(loaded);
  } else {
    console.log('[save] No existing save — starting fresh');
  }
  const persistedPlayer = gameStore.getState().save.player;

  // ---- Spot price service ----
  // Real-time gold spot price via CoinGecko PAXG. 15-minute refresh, falls
  // back through cached → baseline if the network or API fails.
  const econInit = gameStore.getState().save.economy.spotPrice;
  const spotService = createSpotPriceService({
    baseline: econInit.baseline,
    initialCurrent: econInit.current,
    initialFetchedAt: econInit.lastFetchedAt,
    sessionCap: econInit.sessionCap,
    onUpdate: ({ price, source, fetchedAt }) => {
      gameStore.getState().setSpotPrice(price, source);
      console.log(
        `[spot-price] ${source} = $${price.toFixed(2)}/ozt (fetched ${new Date(fetchedAt).toISOString()})`,
      );
    },
  });
  spotService.start();

  // ---- Renderer ----
  const renderer = createRenderer(canvas);

  // ---- Sky / day-night ----
  const sky = createSkyController({
    scene: renderer.scene,
    ambient: renderer.ambient,
    sun: renderer.sun,
    renderer: renderer.renderer,
  });

  // ---- Weather ----
  const weatherInit = gameStore.getState().save.world.weather;
  const weather = createWeatherController({
    scene: renderer.scene,
    initialState: weatherInit.state,
    initialIntensity: weatherInit.intensity,
    lastChangedAt: weatherInit.lastChangedAt,
  });

  // ---- Physics ----
  const physics = await createPhysicsWorld();

  // ---- Streams (config-driven; the terrain reads matching channel carves) ----
  // Both streams now span most of the 200m map (halfLength 90 → 180m visible)
  // so the fog hides the ends and the water reads as endless. They cross at
  // (centerX of NS, centerZ of EW), forming a natural confluence.
  const STREAM_CONFIGS: StreamConfig[] = [
    {
      id: 'coyote_creek',
      displayName: 'Coyote Creek',
      centerX: 22,
      centerZ: 0,
      halfWidth: 2.5,
      halfLength: 90,
      orientation: 'NS',
      siteCount: 28,
    },
    {
      id: 'buckeye_run',
      displayName: 'Buckeye Run',
      centerX: 0,
      centerZ: -55,
      halfWidth: 2.4,
      halfLength: 90,
      orientation: 'EW',
      siteCount: 24,
      shallowColor: 0x9bcfb5,
      deepColor: 0x355c4a,
      foamColor: 0xeaf5e8,
    },
  ];
  const CHANNEL_CONFIGS: ChannelConfig[] = STREAM_CONFIGS.map((s) => ({
    centerX: s.centerX,
    centerZ: s.centerZ,
    halfWidth: s.halfWidth + 0.2, // slightly wider than the water plane so the bed transitions smoothly
    halfLength: s.halfLength + 2.75,
    orientation: s.orientation,
    depth: 1.2,
  }));

  // ---- Terrain ----
  const terrain = createTerrain(physics.rapier, CHANNEL_CONFIGS);
  renderer.scene.add(terrain.mesh);

  // ---- Streams + sites ----
  const streamList = STREAM_CONFIGS.map((cfg) => createStream(terrain, cfg));
  for (const s of streamList) renderer.scene.add(s.group);
  const streams = createStreamRegistry(streamList);

  // Site respawn: every in-game midnight, all streams regenerate fresh
  // sites at new positions. The epoch number = day index (worldTime in
  // real-seconds, SKY_SECONDS_PER_DAY = real-seconds per in-game day).
  // Sites also vanish in-day once their digsRemaining hits 0 — see
  // state/store touchSite + stream.ts marker visibility.
  let currentDay = Math.floor(gameStore.getState().save.world.gameTime / SKY_SECONDS_PER_DAY);
  streams.setEpoch(currentDay);

  // ---- Grass field (instanced blades) ----
  const grass = createGrassField(terrain, {
    count: 5000,
    extent: 95,
    reject: (x, z) => streams.isInStreamZone(x, z, 0.5),
    seed: 0xa9,
  });
  renderer.scene.add(grass.mesh);

  // Ground-cover grass layer is created AFTER the scatter promises settle
  // (since it needs every placement's exclusion radius). The array starts
  // empty and the per-frame tick iterates it, so we don't have to gate the
  // game loop on async asset loading.
  const grassCovers: ReturnType<typeof createGrassField>[] = [];

  // ---- Vendors ----
  const vendors = createVendors(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

  // ---- General Store ----
  const generalStore = createGeneralStore(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

  // ---- Camp ----
  const camp = createCamp(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

  // ---- Inn ----
  const inn = createInn(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

  // ---- Old Pete ----
  const oldPete = createOldPete(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

  // ---- Mine entrance ----
  const mine = createMineEntrance(renderer.scene, physics.rapier, (x, z) =>
    terrain.getHeightAt(x, z),
  );
  // If the player loaded a save where they already had shovel T3, the mine
  // should already be open at boot — otherwise the boards block the way back
  // out for someone who unlocked it last session.
  mine.tryUnlock(gameStore.getState().save.equipment.ownedTiers.shovel);

  // ---- Boulders (along stream banks, in-stream, near mine) ----
  const boulders = placeBoulders({
    scene: renderer.scene,
    terrain,
    streams: STREAM_CONFIGS,
    minePos: mine.position,
    seed: 0xb0,
  });
  console.log(`[boulders] placed ${boulders.count} boulders`);
  // Static ball colliders for each boulder so the player can't walk through
  // them. Bank-side, in-stream, and mine-ring boulders all block — in-stream
  // ones become wadeable obstacles you path around.
  for (const bc of boulders.colliders) {
    physics.rapier.createCollider(
      RAPIER.ColliderDesc.ball(bc.radius).setTranslation(bc.pos.x, bc.pos.y, bc.pos.z),
    );
  }

  // ---- Headlamp ----
  const headlamp = createHeadlamp(renderer.scene);

  // ---- Environment scatter (async, non-blocking) ----
  // Trees and rocks fill in over a few seconds while the player gets oriented.
  // None of these have physics colliders yet — visual only — so the camera
  // ray-cast and the character controller are unaffected.
  const inSpawnClearing = (x: number, z: number): boolean => Math.hypot(x, z) < 5;
  const reject = (x: number, z: number): boolean =>
    streams.isInStreamZone(x, z, 1.5) || inSpawnClearing(x, z);

  // Coyote-Creek-flanking pebble bands. Buckeye Run gets its own seed below.
  const COYOTE = STREAM_CONFIGS[0]!;

  const populate = Promise.all([
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 140,
        models: [
          ...ASSETS.trees.common,
          ...ASSETS.trees.pine,
          ...ASSETS.trees.twisted,
          ...ASSETS.trees.dead,
        ],
        scale: { min: 0.7, max: 1.4 },
        reject,
        exclusionRadius: (s) => 1.4 * s,
        shadows: { cast: true, receive: true },
      },
      0xa1,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 70,
        models: ASSETS.rocks.medium,
        scale: { min: 0.6, max: 1.6 },
        yOffset: -0.05,
        reject,
        exclusionRadius: (s) => 0.9 * s,
        shadows: { cast: true, receive: true },
      },
      0xa2,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 40,
        models: [...ASSETS.rocks.pebbleRound, ...ASSETS.rocks.pebbleSquare],
        scale: { min: 0.5, max: 1.1 },
        yOffset: -0.02,
        sampleXZ: (rng) => {
          const sideSign = rng.next() < 0.5 ? -1 : 1;
          return {
            x: COYOTE.centerX + sideSign * rng.range(2.7, 4.8),
            z: COYOTE.centerZ + rng.range(-COYOTE.halfLength, COYOTE.halfLength),
          };
        },
      },
      0xa3,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 220,
        models: ASSETS.vegetation.grass,
        scale: { min: 0.6, max: 1.2 },
        reject,
        exclusionRadius: (s) => 0.4 * s,
      },
      0xa4,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 90,
        models: [
          ...ASSETS.vegetation.bushes,
          ...ASSETS.vegetation.ferns,
          ...ASSETS.vegetation.plants,
        ],
        scale: { min: 0.6, max: 1.2 },
        reject,
        exclusionRadius: (s) => 0.7 * s,
        shadows: { cast: true, receive: true },
      },
      0xa5,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 110,
        models: [...ASSETS.vegetation.flowers, ...ASSETS.vegetation.mushrooms],
        scale: { min: 0.7, max: 1.3 },
        reject,
        exclusionRadius: (s) => 0.3 * s,
      },
      0xa6,
    ),
  ]);
  populate
    .then((results) => {
      const total = results.reduce((sum, r) => sum + r.placed, 0);
      console.log(`[scatter] environment populated (${total} instances)`);

      // Build a spatial grid of every scatter placement and create the
      // ground-cover grass layer that fills *between* the megakit detail.
      const allPositions = results.flatMap((r) => r.positions);
      const exclusion = buildExclusionGrid(allPositions);
      const grassCover = createGrassField(terrain, {
        count: 28000,
        extent: 95,
        seed: 0xb1,
        bladeHeight: 0.11,
        bladeHalfBase: 0.018,
        scaleRange: { min: 0.7, max: 1.4 },
        windAmplitude: 0.025,
        // Ground-cover blades are short, so go a bit darker / less vivid
        // than the tall layer — they read as moss/lawn underlayer rather
        // than fresh prairie growth.
        baseColor: { r: [0.1, 0.16], g: [0.26, 0.38], b: [0.07, 0.12] },
        tipColor: { r: [0.36, 0.46], g: [0.5, 0.62], b: [0.16, 0.22] },
        reject: (x, z) => streams.isInStreamZone(x, z, 0.5) || exclusion.isExcluded(x, z),
      });
      renderer.scene.add(grassCover.mesh);
      grassCovers.push(grassCover);
      console.log(`[grass-cover] ready; ${allPositions.length} exclusion zones`);
    })
    .catch((err) => console.error('[scatter] failed', err));

  // ---- Character ----
  const spawnX = persistedPlayer.position.x;
  const spawnZ = persistedPlayer.position.z;
  const groundY = terrain.getHeightAt(spawnX, spawnZ);
  const spawnY = Math.max(persistedPlayer.position.y, groundY + 1.5);
  const character = await createCharacter({
    world: physics.rapier,
    initialPosition: { x: spawnX, y: spawnY, z: spawnZ },
    initialYaw: persistedPlayer.rotation.yaw,
    initialStamina: persistedPlayer.meters.stamina,
  });
  renderer.scene.add(character.group);

  // ---- Input ----
  const input = createInputManager();
  input.start();

  // ---- Camera rig ----
  const cameraRig = createCameraRig({
    camera: renderer.camera,
    initialYaw: persistedPlayer.rotation.yaw,
    initialPitch: 0.25,
  });

  // ---- Prospect first-person camera + tool mount ----
  // The prospect lifecycle swaps the third-person rig out for a fixed
  // first-person view at the character's head, looking at the ground. Tool
  // meshes + minigame UI parent to the camera so they render as viewmodels.
  // Camera must be in the scene tree for its children to render.
  renderer.scene.add(renderer.camera);
  const cameraMode = createCameraModeController(renderer.camera);
  const shovelMesh = createShovelMesh();
  const pickaxeMesh = createPickaxeMesh();
  shovelMesh.visible = false;
  pickaxeMesh.visible = false;
  renderer.camera.add(shovelMesh);
  renderer.camera.add(pickaxeMesh);
  // Classifier viewmodels — one per tier so we can swap by tier on entry
  // without rebuilding geometry mid-frame. Each one hidden by default.
  const classifierMeshes: Record<1 | 2 | 3, THREE.Group> = {
    1: createClassifierMesh(1),
    2: createClassifierMesh(2),
    3: createClassifierMesh(3),
  };
  for (const m of Object.values(classifierMeshes)) {
    m.visible = false;
    renderer.camera.add(m);
  }
  const digMeter = createDigMeterView();
  renderer.camera.add(digMeter.group);
  const classifyMeter = createClassifyMeterView();
  renderer.camera.add(classifyMeter.group);
  const panView = createPanView();
  renderer.camera.add(panView.group);
  const collectView = createCollectView();
  renderer.camera.add(collectView.group);
  let prospectWasActive = false;

  // ---- Audio system ----
  // Browser audio policy requires a user gesture before AudioContext can
  // produce sound, so we wire tryEnable() into the existing canvas click
  // handler (and the first keydown) — first interaction unlocks audio
  // for the rest of the session.
  const audio = createAudioSystem();
  let audioEnabledOnce = false;
  function nudgeAudioEnabled(): void {
    audio.tryEnable();
    if (audio.isEnabled() && !audioEnabledOnce) {
      audioEnabledOnce = true;
      console.log('[audio] enabled');
    }
  }
  window.addEventListener('keydown', nudgeAudioEnabled, { once: false });

  canvas.addEventListener('click', () => {
    nudgeAudioEnabled();
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  // ---- HUD ----
  const hud = mountHud(hudEl);

  // ---- Mini-map ----
  // Landmark positions are pulled from each system's known anchor; if any
  // of these later become configurable, this list should be derived from
  // them rather than re-typed.
  const minimapStreams: MinimapStream[] = STREAM_CONFIGS.map((s) => ({
    centerX: s.centerX,
    centerZ: s.centerZ,
    halfWidth: s.halfWidth,
    halfLength: s.halfLength,
    orientation: s.orientation,
    color: `#${(s.shallowColor ?? 0x9bd1d8).toString(16).padStart(6, '0')}`,
  }));
  const minimapLandmarks: MinimapLandmark[] = [
    // Vendors
    { x: -15, z: 0, label: 'Assayer', color: '#d4a647', shape: 'square' },
    { x: -12, z: 7, label: 'Pawn Shop', color: '#d4a647', shape: 'square' },
    // General store + inn + camp + Pete
    { x: -10, z: -3, label: 'Store', color: '#8fc466', shape: 'square' },
    { x: -13, z: 10, label: 'Inn', color: '#d47a2a', shape: 'square' },
    { x: -7, z: 5, label: 'Camp', color: '#ff8844', shape: 'dot' },
    { x: -4, z: 6, label: 'Old Pete', color: '#a57850', shape: 'dot' },
    // Mine
    { x: -45, z: -45, label: 'Mine', color: '#886644', shape: 'mine' },
  ];
  const minimap = mountMinimap({
    streams: minimapStreams,
    landmarks: minimapLandmarks,
  });

  // ---- Prospecting ----
  const prospect = createProspectingController({ audio });

  // Edge-detection state (input manager doesn't expose just-pressed; tracked here).
  let interactWasDown = false;
  let pauseWasDown = false;
  let worldTime = gameStore.getState().save.world.gameTime;
  let footstepTimer = 0;

  // Active vendor session (mutually exclusive with prospecting). When non-null,
  // the player is at a vendor's sale screen — movement frozen, INTERACT confirms
  // the sale, PAUSE leaves without selling.
  let activeVendor: Vendor | null = null;

  // Active General Store session. When true, the upgrade UI is open. The
  // player can cycle through tool categories with TOOL_NEXT/TOOL_PREV and
  // buy with INTERACT. PAUSE leaves.
  let storeOpen = false;
  let storeSelectionIdx = 0;
  let toolNextWasDown = false;
  let toolPrevWasDown = false;

  // Active dialogue session (Innkeeper today; expandable to other NPCs).
  // Mutually exclusive with vendor/store/prospecting sessions. TOOL_NEXT /
  // TOOL_PREV cycles options, INTERACT picks, PAUSE leaves.
  let dialogue: DialogueSession | null = null;

  // ---- Save snapshot helper ----
  function buildSaveSnapshot(): SaveV1 {
    const base = gameStore.getState().serialize();
    const charSer = character.serialize();
    const weatherView = weather.getView();
    return {
      ...base,
      player: {
        ...base.player,
        position: charSer.position,
        rotation: charSer.rotation,
        meters: { ...base.player.meters, stamina: charSer.stamina },
      },
      world: {
        ...base.world,
        gameTime: worldTime,
        weather: {
          state: weatherView.state,
          intensity: weatherView.intensity,
          lastChangedAt: worldTime,
        },
      },
    };
  }

  // ---- Game loop ----
  const loop = createGameLoop({
    update: (dt) => {
      worldTime += dt;
      input.poll();

      const interactDown = input.isActive('INTERACT');
      const interactJustPressed = interactDown && !interactWasDown;
      interactWasDown = interactDown;

      const pauseDown = input.isActive('PAUSE');
      const pauseJustPressed = pauseDown && !pauseWasDown;
      pauseWasDown = pauseDown;

      // 1. Camera look — consumed always so input doesn't pool, but only
      // applied to the rig when no prospect minigame is active (the
      // first-person prospect view is intentionally fixed).
      const lookDelta = input.getLookDelta(dt);
      const prospectingNow = prospect.isActive();
      if (!prospectingNow) {
        cameraRig.applyLook(lookDelta);
      }

      // 2. Determine whether character can move (locked during any session)
      const prospecting = prospectingNow;
      const inVendorSession = activeVendor !== null;
      const inStoreSession = storeOpen;
      const inDialogueSession = dialogue !== null;
      const inSession = prospecting || inVendorSession || inStoreSession || inDialogueSession;
      const moveInput = inSession ? { x: 0, y: 0 } : input.getMoveInput();
      const jumpDown = inSession ? false : input.isActive('JUMP');
      const sprintDown = inSession ? false : input.isActive('SPRINT');

      // Edge-detection for store-cycle inputs (only used inside store session)
      const toolNextDown = input.isActive('TOOL_NEXT');
      const toolNextJustPressed = toolNextDown && !toolNextWasDown;
      toolNextWasDown = toolNextDown;
      const toolPrevDown = input.isActive('TOOL_PREV');
      const toolPrevJustPressed = toolPrevDown && !toolPrevWasDown;
      toolPrevWasDown = toolPrevDown;

      // 3. Character intent
      character.preStep(dt, moveInput, jumpDown, sprintDown, cameraRig.getYaw());

      // 4. Physics
      physics.step();

      // 5. Character visuals — pass prospecting activity so animations match the active step
      const prospectSnap = prospect.getSnapshot();
      const activity = prospectSnap
        ? { step: prospectSnap.step, progress: prospectSnap.progress }
        : null;
      character.postStep(dt, worldTime, activity);

      // 6. Camera position. During a prospect minigame, swap the spring-arm
      // rig for the fixed first-person prospect view + tool viewmodel.
      const charPosForCamera = character.getPosition();
      if (prospecting && !prospectWasActive) {
        // Edge: just entered prospect view. Snap camera, capture rig yaw.
        cameraMode.enterProspectView(charPosForCamera, cameraRig.getYaw());
      } else if (!prospecting && prospectWasActive) {
        // Edge: just exited prospect view. Hide everything prospect-related.
        cameraMode.exitProspectView();
        shovelMesh.visible = false;
        pickaxeMesh.visible = false;
        for (const m of Object.values(classifierMeshes)) m.visible = false;
        digMeter.setVisible(false);
        classifyMeter.setVisible(false);
        panView.setVisible(false);
        collectView.setVisible(false);
      }
      prospectWasActive = prospecting;

      if (prospecting) {
        cameraMode.updateProspectView(charPosForCamera);
        // Drive per-stage viewmodels from the latest snapshot. Each stage
        // shows its own tool + meter; everything else stays hidden.
        const snap = prospect.getSnapshot();
        if (snap) {
          const v = snap.viz;
          // DIG ----------------------------------------------------------
          if (v?.kind === 'dig') {
            const usePickaxe = v.isPickaxe;
            shovelMesh.visible = !usePickaxe;
            pickaxeMesh.visible = usePickaxe;
            for (const m of Object.values(classifierMeshes)) m.visible = false;
            digMeter.update(v);
            digMeter.setVisible(true);
            classifyMeter.setVisible(false);
          } else if (v?.kind === 'classify') {
            // CLASSIFY ---------------------------------------------------
            shovelMesh.visible = false;
            pickaxeMesh.visible = false;
            const tierKey: 1 | 2 | 3 = v.layerCount === 1 ? 1 : v.layerCount === 3 ? 2 : 3;
            for (const [k, m] of Object.entries(classifierMeshes)) {
              m.visible = Number(k) === tierKey;
            }
            classifyMeter.update(v);
            classifyMeter.setVisible(true);
            digMeter.setVisible(false);
            panView.setVisible(false);
          } else if (v?.kind === 'pan') {
            // PAN --------------------------------------------------------
            shovelMesh.visible = false;
            pickaxeMesh.visible = false;
            for (const m of Object.values(classifierMeshes)) m.visible = false;
            panView.update(v);
            panView.setVisible(true);
            digMeter.setVisible(false);
            classifyMeter.setVisible(false);
            collectView.setVisible(false);
          } else if (v?.kind === 'collect') {
            // COLLECT ----------------------------------------------------
            shovelMesh.visible = false;
            pickaxeMesh.visible = false;
            for (const m of Object.values(classifierMeshes)) m.visible = false;
            collectView.update(v);
            collectView.setVisible(true);
            digMeter.setVisible(false);
            classifyMeter.setVisible(false);
            panView.setVisible(false);
          } else {
            shovelMesh.visible = false;
            pickaxeMesh.visible = false;
            for (const m of Object.values(classifierMeshes)) m.visible = false;
            digMeter.setVisible(false);
            classifyMeter.setVisible(false);
            panView.setVisible(false);
            collectView.setVisible(false);
          }
        }
      } else {
        cameraRig.placeCamera(charPosForCamera, physics.rapier, character.getColliderHandle());
      }

      // 7. Proximity: precedence is vendor > general store > inn > Pete > mine > camp > site.
      const charPos = character.getPosition();
      const nearestVendor = !inSession ? vendors.findNearest(charPos) : null;
      const nearStore = !inSession && nearestVendor === null && generalStore.isPlayerNear(charPos);
      const nearInn =
        !inSession && nearestVendor === null && !nearStore && inn.isPlayerNear(charPos);
      const nearPete =
        !inSession &&
        nearestVendor === null &&
        !nearStore &&
        !nearInn &&
        oldPete.isPlayerNear(charPos);
      const nearMine =
        !inSession &&
        nearestVendor === null &&
        !nearStore &&
        !nearInn &&
        !nearPete &&
        mine.isPlayerNear(charPos);
      const nearCamp =
        !inSession &&
        nearestVendor === null &&
        !nearStore &&
        !nearInn &&
        !nearPete &&
        !nearMine &&
        camp.isPlayerNear(charPos);
      // Closest panning site across both streams and the cave (if unlocked).
      const candidateStreamSite =
        !inSession &&
        nearestVendor === null &&
        !nearStore &&
        !nearInn &&
        !nearPete &&
        !nearMine &&
        !nearCamp
          ? streams.findNearestSite(charPos)
          : null;
      const candidateCaveSite =
        !inSession && nearestVendor === null && !nearStore && !nearInn && !nearPete
          ? mine.findNearestSite(charPos)
          : null;
      const nearestSite =
        candidateStreamSite && candidateCaveSite
          ? candidateStreamSite.distance < candidateCaveSite.distance
            ? candidateStreamSite
            : candidateCaveSite
          : (candidateStreamSite ?? candidateCaveSite);

      streams.update(
        worldTime,
        charPos,
        prospecting ? (prospect.getSnapshot()?.siteId ?? null) : (nearestSite?.site.id ?? null),
        (siteId) => {
          const s = gameStore.getState().save.world.sites[siteId];
          return s !== undefined && s.digsRemaining <= 0;
        },
      );
      vendors.update(worldTime, activeVendor?.id ?? nearestVendor?.vendor.id ?? null);
      generalStore.update(worldTime, storeOpen || nearStore);
      inn.update(worldTime, dialogue !== null || nearInn);
      oldPete.update(worldTime, (dialogue !== null && dialogue.treeId === 'old_pete') || nearPete);
      mine.update(worldTime, nearMine);
      camp.update(worldTime, nearCamp);

      // 8. Survival meter drain + daily site respawn + audio ambient
      const inStreamWater = streams.isPlayerInAnyStream(charPos);
      gameStore.getState().tickMeters(dt, inStreamWater);
      // Midnight respawn: when the in-game day index advances, regenerate
      // every stream's sites at fresh positions with a new maxDigs roll.
      const dayNow = Math.floor(worldTime / SKY_SECONDS_PER_DAY);
      if (dayNow !== currentDay) {
        currentDay = dayNow;
        streams.setEpoch(currentDay);
      }
      // Distance to the nearest stream water rectangle; 0 if standing in water.
      let nearestStreamDist = Infinity;
      for (const sCfg of STREAM_CONFIGS) {
        const dCross =
          sCfg.orientation === 'NS'
            ? Math.abs(charPos.x - sCfg.centerX)
            : Math.abs(charPos.z - sCfg.centerZ);
        const dAlong =
          sCfg.orientation === 'NS'
            ? Math.abs(charPos.z - sCfg.centerZ)
            : Math.abs(charPos.x - sCfg.centerX);
        const dx = Math.max(0, dCross - sCfg.halfWidth);
        const dz = Math.max(0, dAlong - sCfg.halfLength);
        const d = Math.hypot(dx, dz);
        if (d < nearestStreamDist) nearestStreamDist = d;
      }
      audio.update({
        distanceToNearestStream: nearestStreamDist,
        weatherIntensity: weather.getView().intensity,
      });

      // 8b. Footstep cadence — gated on movement state and surface. Wading
      // footsteps when the player is inside a stream rectangle; grass tone
      // everywhere else. Surface treats "anywhere on the map outside a
      // stream" as grass for now; biome-aware footsteps can come later.
      const charState = character.getState();
      const playerMoving = charState === 'walking' || charState === 'running';
      footstepTimer += dt;
      const stepInterval = charState === 'running' ? 0.32 : 0.5;
      if (playerMoving && footstepTimer >= stepInterval) {
        audio.playFootstep(inStreamWater ? 'water' : 'grass');
        footstepTimer = 0;
      } else if (!playerMoving) {
        footstepTimer = 0;
      }

      // 9. Weather + sky + headlamp + grass + shadows. Sites no longer
      // regen continuously — they vanish on full depletion and respawn
      // wholesale at the next in-game midnight (handled above).
      weather.update(worldTime, dt, charPos);
      sky.update(worldTime, weather.getView());

      // Cave darkness override: when the player is inside the mine cave,
      // clamp ambient near-zero so the interior reads as actually dark.
      // sky.update() rewrites ambient.intensity fresh each frame, so we don't
      // need to restore on exit — the override only sticks while inside.
      const inCave = mine.isPlayerInside(charPos);
      if (inCave) renderer.ambient.intensity = 0.06;

      // Capture world-space sun direction BEFORE we offset the light for
      // shadow-follow. terrain/grass lambert math needs the original
      // direction; the light's *position* is then translated to keep the
      // shadow camera frustum centered on the player.
      const sunDirWorld = renderer.sun.position.clone().normalize();
      renderer.sun.position.x += charPos.x;
      renderer.sun.position.z += charPos.z;
      renderer.sun.target.position.set(charPos.x, 0, charPos.z);
      renderer.sun.target.updateMatrixWorld();

      headlamp.update({
        playerPos: charPos,
        skyHour: getSkyHour(worldTime),
        weather: weather.getView(),
        ownedHeadlamp: gameStore.getState().save.equipment.ownedTiers.headlamp >= 2,
        isInCave: inCave,
      });
      const grassLight = {
        time: worldTime,
        sunColor: renderer.sun.color,
        sunIntensity: renderer.sun.intensity,
        ambientColor: renderer.ambient.color,
        ambientIntensity: renderer.ambient.intensity,
      };
      grass.update(grassLight);
      for (const cover of grassCovers) cover.update(grassLight);
      terrain.updateLighting({
        sunDirection: sunDirWorld,
        sunColor: renderer.sun.color,
        sunIntensity: renderer.sun.intensity,
        ambientColor: renderer.ambient.color,
        ambientIntensity: renderer.ambient.intensity,
      });
      streams.updateLighting({
        sunDirection: sunDirWorld,
        sunColor: renderer.sun.color,
        sunIntensity: renderer.sun.intensity,
        ambientColor: renderer.ambient.color,
        ambientIntensity: renderer.ambient.intensity,
      });

      // 10. Session state machine — dialogue → store → vendor → prospecting → camp → idle.
      if (inDialogueSession) {
        if (pauseJustPressed) {
          dialogue = null;
          console.log('[dialogue] left');
        } else {
          const node = getCurrentNode(dialogue!);
          const opts = node ? resolveOptions(dialogue!, gameStore.getState().save) : [];
          // Visible-options list can shrink when the player's state changes
          // mid-conversation (e.g. quest completes during the chat). Clamp
          // the selection index so it never points off the end.
          if (dialogue!.selectionIdx >= opts.length) {
            dialogue!.selectionIdx = 0;
          }
          if (toolNextJustPressed && opts.length > 0) {
            dialogue!.selectionIdx = (dialogue!.selectionIdx + 1) % opts.length;
            audio.playUITap();
          }
          if (toolPrevJustPressed && opts.length > 0) {
            dialogue!.selectionIdx = (dialogue!.selectionIdx - 1 + opts.length) % opts.length;
            audio.playUITap();
          }
          if (interactJustPressed && node) {
            const resolved = opts[dialogue!.selectionIdx];
            if (resolved && resolved.enabled) {
              audio.playUITap();
              const action = resolved.source.action;
              if (action.kind === 'leave') {
                dialogue = null;
                console.log('[dialogue] goodbye');
              } else if (action.kind === 'goto') {
                dialogue!.currentNodeId = action.nodeId;
                dialogue!.selectionIdx = 0;
                if (action.nodeId === 'tips') dialogue!.tipIndex += 1;
              } else if (action.kind === 'restAtInn') {
                const ok = gameStore.getState().payAndRestAtInn(action.cost, worldTime);
                if (ok) {
                  // Advance to the next 07:00 sky-time so the player wakes
                  // refreshed. If we're already past midnight but before 7am,
                  // skip just the remaining hours; otherwise jump to tomorrow.
                  const cur = getSkyHour(worldTime);
                  const TARGET_HOUR = 7;
                  let delta = (TARGET_HOUR - cur + 24) % 24;
                  if (delta < 0.5) delta += 24;
                  worldTime += (delta / 24) * SKY_SECONDS_PER_DAY;
                  dialogue!.currentNodeId = 'rested';
                  dialogue!.selectionIdx = 0;
                  console.log(
                    `[dialogue] inn rest — wallet -$${action.cost.toFixed(2)}, advanced ${delta.toFixed(1)} sky-hours`,
                  );
                } else {
                  console.log('[dialogue] inn rest declined: insufficient funds');
                }
              } else if (action.kind === 'acceptQuest') {
                gameStore.getState().acceptQuest(action.questId, worldTime);
                dialogue!.currentNodeId = action.acceptedNode ?? 'questAccepted';
                dialogue!.selectionIdx = 0;
                audio.playConfirm();
                console.log(`[quest] accepted ${action.questId}`);
              } else if (action.kind === 'turnInQuest') {
                const reward = gameStore.getState().turnInQuest(action.questId, worldTime);
                if (reward > 0) {
                  dialogue!.currentNodeId = action.completeNode ?? 'questComplete';
                  dialogue!.selectionIdx = 0;
                  audio.playQuestChime();
                  console.log(`[quest] turned in ${action.questId} for $${reward.toFixed(2)}`);
                }
              }
            }
          }
        }
      } else if (inStoreSession) {
        if (pauseJustPressed) {
          storeOpen = false;
          console.log('[store] left general store');
        } else {
          if (toolNextJustPressed) {
            storeSelectionIdx = (storeSelectionIdx + 1) % ALL_CATEGORIES.length;
            audio.playUITap();
          }
          if (toolPrevJustPressed) {
            storeSelectionIdx =
              (storeSelectionIdx - 1 + ALL_CATEGORIES.length) % ALL_CATEGORIES.length;
            audio.playUITap();
          }
          if (interactJustPressed) {
            const category = ALL_CATEGORIES[storeSelectionIdx]!;
            const ownedTier = gameStore.getState().save.equipment.ownedTiers[category];
            const next = getNextUpgrade(category, ownedTier);
            if (next && !next.questGated) {
              const ok = gameStore
                .getState()
                .purchaseUpgrade(category, next.cost, next.toTier, worldTime);
              if (ok) {
                audio.playConfirm();
                console.log(
                  `[store] purchased ${category} ${next.label} for $${next.cost.toFixed(2)}`,
                );
              } else {
                console.log(`[store] insufficient funds for ${category} ${next.label}`);
              }
            }
          }
        }
      } else if (inVendorSession) {
        if (pauseJustPressed) {
          console.log(`[vendor] left ${activeVendor!.id}`);
          activeVendor = null;
        } else if (interactJustPressed) {
          const carry = gameStore.getState().save.inventory.carry.gold;
          const totalG = carry.flake_g + carry.picker_g + carry.nugget_g;
          if (totalG > 1e-6) {
            audio.playConfirm();
            const result = gameStore
              .getState()
              .sellAllCarry(
                activeVendor!.id,
                activeVendor!.multipliers,
                gameStore.getState().save.economy.spotPrice.current,
                worldTime,
              );
            console.log(
              `[vendor] sold ${totalG.toFixed(3)}g at ${activeVendor!.id} for $${result.earned.toFixed(2)}`,
            );
          }
          activeVendor = null;
        }
      } else if (prospecting) {
        if (pauseJustPressed) {
          prospect.cancel();
          console.log('[prospect] cancelled');
        } else {
          const result = prospect.update(dt, {
            interactDown,
            useToolDown: input.isActive('USE_TOOL'),
            axes: lookDelta,
          });
          if (result) {
            gameStore.getState().addGoldToCarry(result.reward);
            gameStore.getState().applyGoldToQuests(result.reward);
            gameStore.getState().touchSite(result.siteId, worldTime);
            const totalG = result.reward.flake_g + result.reward.picker_g + result.reward.nugget_g;
            const scoreFmt = result.stageScores.map((s) => s.toFixed(2)).join(' / ');
            console.log(
              `[prospect] reward at ${result.siteId}: ${totalG.toFixed(3)}g ` +
                `(flake=${result.reward.flake_g.toFixed(3)}, picker=${result.reward.picker_g.toFixed(3)}, nugget=${result.reward.nugget_g.toFixed(3)}) ` +
                `skill=${result.skillBonus.toFixed(2)} stages=[${scoreFmt}]`,
            );
          }
        }
      } else if (nearestVendor && interactJustPressed) {
        activeVendor = nearestVendor.vendor;
        console.log(`[vendor] opened ${activeVendor.id}`);
      } else if (nearStore && interactJustPressed) {
        storeOpen = true;
        console.log('[store] opened general store');
      } else if (nearInn && interactJustPressed) {
        dialogue = startDialogue('innkeeper', INNKEEPER_DIALOGUE);
        console.log('[dialogue] opened innkeeper');
      } else if (nearPete && interactJustPressed) {
        dialogue = startDialogue('old_pete', OLD_PETE_DIALOGUE);
        console.log('[dialogue] opened old_pete');
      } else if (nearMine && interactJustPressed) {
        const shovelTier = gameStore.getState().save.equipment.ownedTiers.shovel;
        if (mine.tryUnlock(shovelTier)) {
          console.log('[mine] opened — pickaxe knocked the boards loose');
        } else if (mine.isOpen()) {
          console.log('[mine] already open — walk inside');
        } else {
          console.log('[mine] sealed — needs a pickaxe (Shovel T3)');
        }
      } else if (nearCamp && interactJustPressed) {
        gameStore.getState().restAtCamp();
        worldTime += CAMP_REST_TIME_ADVANCE;
        console.log(
          `[camp] rested — meters refilled, time advanced ${(CAMP_REST_TIME_ADVANCE / 3600).toFixed(0)}h`,
        );
      } else if (nearestSite && interactJustPressed) {
        const site = gameStore.getState().getOrCreateSite(nearestSite.site.id);
        // Skip if this site has already been depleted (digsRemaining=0).
        // Defensive — the proximity probe in stream.ts also hides depleted
        // markers, so this branch should rarely fire.
        if (site.digsRemaining <= 0) {
          console.log(`[prospect] site ${nearestSite.site.id} is depleted`);
        } else {
          const actionCount = gameStore.getState().incrementPanCount();
          const firstEver = actionCount === 1;
          const equipMult = computeYieldMultiplier(gameStore.getState().save.equipment.ownedTiers);
          const survivalMult = computeSurvivalYieldFactor(gameStore.getState().save.player.meters);
          const siteBonus = nearestSite.site.bonusYield ?? 1.0;
          const yieldMultiplier = equipMult * survivalMult * siteBonus;
          prospect.start({
            siteId: nearestSite.site.id,
            digsRemaining: site.digsRemaining,
            maxDigs: site.maxDigs,
            actionCount,
            firstEver,
            yieldMultiplier,
            toolTiers: gameStore.getState().save.equipment.ownedTiers,
          });
          audio.playSplash();
          const bonusTag = siteBonus !== 1 ? ` × site${siteBonus.toFixed(2)}` : '';
          console.log(
            `[prospect] start ${nearestSite.site.id} (digs=${site.digsRemaining}/${site.maxDigs}, firstEver=${firstEver}, yield=${yieldMultiplier.toFixed(2)} = equip${equipMult.toFixed(2)} × survival${survivalMult.toFixed(2)}${bonusTag})`,
          );
        }
      }

      // 11. HUD
      const save = gameStore.getState().save;
      const interactGlyph =
        input.lastInputDevice() === 'gamepad'
          ? input.gamepadGlyphStyle() === 'playstation'
            ? '□'
            : 'X'
          : 'E';
      const minePromptText = mine.isOpen()
        ? 'Mine is open — walk inside'
        : 'Mine sealed — needs a pickaxe';
      const promptInfo = inSession
        ? null
        : nearestVendor
          ? { text: `Sell at ${nearestVendor.vendor.name}`, glyph: interactGlyph }
          : nearStore
            ? { text: 'Open General Store', glyph: interactGlyph }
            : nearInn
              ? { text: 'Talk to Innkeeper', glyph: interactGlyph }
              : nearPete
                ? { text: 'Talk to Old Pete', glyph: interactGlyph }
                : nearMine
                  ? { text: minePromptText, glyph: interactGlyph }
                  : nearCamp
                    ? { text: 'Rest at Camp (4h)', glyph: interactGlyph }
                    : nearestSite
                      ? { text: 'Prospect', glyph: interactGlyph }
                      : null;

      let vendorOverlay: ReturnType<typeof buildVendorOverlay> | null = null;
      if (activeVendor) {
        vendorOverlay = buildVendorOverlay(
          activeVendor,
          save.inventory.carry.gold,
          save.economy.spotPrice.current,
        );
      }

      let storeOverlay: ReturnType<typeof buildStoreOverlay> | null = null;
      if (storeOpen) {
        storeOverlay = buildStoreOverlay(
          save.equipment.ownedTiers,
          save.wallet.balance,
          storeSelectionIdx,
        );
      }

      let dialogueOverlay: ReturnType<typeof buildDialogueOverlay> | null = null;
      if (dialogue) {
        dialogueOverlay = buildDialogueOverlay(dialogue, save);
      }

      const questTracker = buildTrackerView(save);

      minimap.update({ x: charPos.x, z: charPos.z, yaw: cameraRig.getYaw() });

      hud.update({
        device: input.lastInputDevice(),
        gamepadGlyph: input.gamepadGlyphStyle(),
        actions: input.snapshot(),
        position: { x: charPos.x, y: charPos.y, z: charPos.z },
        characterState: character.getState(),
        stamina: character.getStamina(),
        hunger: save.player.meters.hunger,
        thirst: save.player.meters.thirst,
        inStreamWater,
        clockText: formatClock(getSkyHour(worldTime)),
        weather: weather.getView(),
        headlampOn: headlamp.isOn(),
        inventory: save.inventory.carry.gold,
        walletBalance: save.wallet.balance,
        spotPricePerOzt: save.economy.spotPrice.current,
        spotPriceSource: save.economy.spotPrice.source,
        bearingDeg: bearingFromYaw(cameraRig.getYaw()),
        prompt: promptInfo,
        vendor: vendorOverlay,
        store: storeOverlay,
        dialogue: dialogueOverlay,
        questTracker,
        prospect: prospect.getSnapshot(),
      });
    },
    render: () => renderer.render(),
  });
  loop.start();

  // ---- Persistence ----
  const autosaveTimer = window.setInterval(() => {
    saveCurrentState(buildSaveSnapshot()).catch((e) => console.error('[save] autosave failed', e));
  }, 60_000);

  window.addEventListener('beforeunload', () => {
    window.clearInterval(autosaveTimer);
    saveCurrentState(buildSaveSnapshot()).catch(() => undefined);
  });

  console.log('[bootstrap] Them Hills ready (Phase 9a — Two streams)');
  console.log(
    '  Coyote Creek runs N-S ~10m east of spawn. Buckeye Run runs E-W ~35m south — greener water.',
  );
  console.log(
    '  Steps: HOLD to dig → TAP rapidly to classify → TAP with rhythm to pan → TAP to collect.',
  );
  console.log('  Press Esc / Menu to cancel.');
}

// Compute the data the vendor sale overlay shows: gross dollar value of the
// player's current carry at this vendor's multipliers, plus a label describing
// the multipliers so the player understands the deal before confirming.
const GRAMS_PER_OZT = 31.1035;
function buildVendorOverlay(
  vendor: Vendor,
  carry: { flake_g: number; picker_g: number; nugget_g: number },
  spotPricePerOzt: number,
): {
  name: string;
  multiplierLabel: string;
  grossDollars: number;
  canSell: boolean;
} {
  const oztFlake = carry.flake_g / GRAMS_PER_OZT;
  const oztPicker = carry.picker_g / GRAMS_PER_OZT;
  const oztNugget = carry.nugget_g / GRAMS_PER_OZT;
  const gross =
    oztFlake * spotPricePerOzt * vendor.multipliers.flake +
    oztPicker * spotPricePerOzt * vendor.multipliers.picker +
    oztNugget * spotPricePerOzt * vendor.multipliers.nugget;
  const totalG = carry.flake_g + carry.picker_g + carry.nugget_g;
  const m = vendor.multipliers;
  const multiplierLabel =
    `${(m.flake * 100).toFixed(0)}% flake, ` +
    `${(m.picker * 100).toFixed(0)}% picker, ` +
    `${(m.nugget * 100).toFixed(0)}% nugget`;
  return {
    name: vendor.name,
    multiplierLabel,
    grossDollars: gross,
    canSell: totalG > 1e-6,
  };
}

// Snapshot of the General Store UI for the HUD: one row per category showing
// owned tier, next-upgrade cost (if any), and an "AFFORD" flag.
function buildStoreOverlay(
  ownedTiers: Record<EquipmentCategory, number>,
  walletBalance: number,
  selectionIdx: number,
): {
  rows: {
    category: EquipmentCategory;
    displayName: string;
    ownedTier: number;
    nextLabel: string;
    nextCost: number | null;
    affordable: boolean;
    questGated: boolean;
  }[];
  selectedIndex: number;
  walletBalance: number;
} {
  const rows = ALL_CATEGORIES.map((category) => {
    const ownedTier = ownedTiers[category];
    const next = getNextUpgrade(category, ownedTier);
    const nextCost = next ? next.cost : null;
    const affordable = next !== null && !next.questGated && walletBalance >= next.cost;
    return {
      category,
      displayName: EQUIPMENT[category].displayName,
      ownedTier,
      nextLabel: next ? next.label : 'Maxed',
      nextCost,
      affordable,
      questGated: next?.questGated === true,
    };
  });
  return { rows, selectedIndex: selectionIdx, walletBalance };
}

// Spatial-grid index of every scatter placement, used by the ground-cover
// grass field to skip positions inside trees, rocks, bushes, etc. Cells are
// 3m on a side; isExcluded() checks the candidate cell + its 8 neighbors so
// large radii at cell corners still get caught.
function buildExclusionGrid(
  positions: { x: number; z: number; radius: number }[],
  cellSize = 3,
): { isExcluded(x: number, z: number): boolean } {
  const grid = new Map<string, { x: number; z: number; radius: number }[]>();
  const key = (cx: number, cz: number): string => `${cx},${cz}`;
  for (const p of positions) {
    const cx = Math.floor(p.x / cellSize);
    const cz = Math.floor(p.z / cellSize);
    const k = key(cx, cz);
    let bucket = grid.get(k);
    if (!bucket) {
      bucket = [];
      grid.set(k, bucket);
    }
    bucket.push(p);
  }
  return {
    isExcluded(x, z) {
      const cx = Math.floor(x / cellSize);
      const cz = Math.floor(z / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(key(cx + dx, cz + dz));
          if (!bucket) continue;
          for (const p of bucket) {
            const ex = p.x - x;
            const ez = p.z - z;
            if (ex * ex + ez * ez < p.radius * p.radius) return true;
          }
        }
      }
      return false;
    },
  };
}

// Snapshot of the dialogue UI for the HUD: speaker, body line, and the list
// of options with enabled state + optional disabled hints.
function buildDialogueOverlay(
  session: DialogueSession,
  save: SaveV1,
): {
  speaker: string;
  body: string;
  options: { text: string; enabled: boolean; hint?: string }[];
  selectedIndex: number;
} | null {
  const node = getCurrentNode(session);
  if (!node) return null;
  return {
    speaker: node.speaker,
    body: resolveBody(session),
    options: resolveOptions(session, save),
    selectedIndex: session.selectionIdx,
  };
}

bootstrap().catch((e: unknown) => {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error('[bootstrap] fatal', err);
  document.body.innerHTML = `<pre style="color:#f55; padding: 24px; font-family: monospace; white-space: pre-wrap;">Bootstrap failed:\n${err.stack ?? err.message}</pre>`;
});
