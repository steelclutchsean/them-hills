import * as THREE from 'three';
import {
  getGlobalYieldMultiplier,
  getNextUpgrade,
  mineAccessTier,
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
import { createMineEntrance, type MineConfig, type MineInfo } from '@/game/mine';
import { createOldPete } from '@/game/old-pete';
import { createProspectingController } from '@/game/prospecting';
import { createClassifyMeterView } from '@/game/minigames/classify-meter';
import { createCollectView } from '@/game/minigames/collect-view';
import { createDigMeterView } from '@/game/minigames/dig-meter';
import { createEffectSystem } from '@/game/minigames/effects';
import { createExtractMeterView } from '@/game/minigames/extract-meter';
import { createPanView } from '@/game/minigames/pan-view';
import { createStrikeMeterView } from '@/game/minigames/strike-meter';
import {
  createClassifierMesh,
  createPickaxeMesh,
  createShovelMesh,
  triggerToolBounce,
  triggerToolSwing,
  updateToolBounce,
  updateToolSwing,
} from '@/game/minigames/tool-models';
import { scatterAssets, updateScatterWind } from '@/game/scatter';
import { createMotes } from '@/game/motes';
import { createLightShafts } from '@/game/shafts';
import { emitGameplay, bindGameplayAudio } from '@/game/events';
import { createClaimMarkers } from '@/game/claim-markers';
import { readGround, richestPlacer, stakeable, type BoulderPoint } from '@/game/geology';
import {
  buildListings,
  claimYieldFactor,
  creekYieldFactor,
  journalLines,
  lodeYieldFactor,
  methodLabel,
  openingGuide,
  townQuote,
} from '@/game/fieldwork';
import { SKY_SECONDS_PER_DAY, createSkyController, formatClock, getSkyHour } from '@/game/sky';
import {
  createStream,
  createStreamRegistry,
  type PanningSite,
  type StreamConfig,
} from '@/game/stream';
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
import { mountHud, type HudUpdate } from '@/ui/hud';
import { mountMinimap, type MinimapLandmark, type MinimapStream } from '@/ui/minimap';
import { createSettingsPanel } from '@/ui/settings';
import { defaultSettings } from '@/save/schema';
import { createAudioSystem } from '@/audio/system';
import {
  glRendererString,
  getQualityName,
  initQuality,
  RENDER_QUALITY,
  setQuality,
} from '@/engine/quality';
import { readReviewOverride, reviewShot, reviewWorldTime, setReviewPose } from '@/dev/review-shots';
import { setFoliageWindTime } from '@/render/painterly';
import { createSmokePilot } from '@/dev/smoke-pilot';
import { mountOverlays, reportBoot } from '@/ui/overlays';
import { presentProspectFind, presentToolImpact } from '@/game/presentation';

async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) document.body.dataset.debug = '1';
  const skipIntro = params.get('smoke') === '1' || params.has('shot') || params.has('hour');
  await reportBoot(6, 'Checking your claim…');

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
  if (params.has('shot')) setQuality('high');
  else initQuality(glRendererString(renderer.renderer.getContext()));
  renderer.applyGraphics();
  const motes = createMotes(110);
  motes.resize();
  renderer.scene.add(motes.points);
  const shafts = createLightShafts();
  renderer.scene.add(shafts.group);

  // ---- Sky / day-night ----
  const sky = createSkyController({
    scene: renderer.scene,
    camera: renderer.camera,
    ambient: renderer.ambient,
    hemi: renderer.hemi,
    sun: renderer.sun,
    renderer: renderer.renderer,
    onGrade: (grade) => {
      // PMREM rebuild is a hitch. Let the first frames present without it.
      if (presentedFrames >= 2) renderer.updateEnvironment(grade);
    },
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

  await reportBoot(28, 'Shaping the ground…');

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

  // Grass is built after the first frames so its shader and the 5k
  // instances don't sit on the critical path to the first picture.
  let grass: ReturnType<typeof createGrassField> | null = null;
  function spawnGrass(): void {
    if (grass) return;
    grass = createGrassField(terrain, {
      count: RENDER_QUALITY.grassTall,
      extent: 95,
      reject: (x, z) => streams.isInStreamZone(x, z, 0.5),
      seed: 0xa9,
      baseColor: { r: [0.22, 0.32], g: [0.28, 0.36], b: [0.08, 0.12] },
      tipColor: { r: [0.82, 0.94], g: [0.68, 0.8], b: [0.22, 0.32] },
    });
    renderer.scene.add(grass.mesh);
  }

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

  // ---- Mine entrances ----
  // Four mines spread around the map. The original "north" stays as the
  // starter mine (shovel T3 gates all of them). Yield bonuses range
  // 3.0× → 5.0× so deeper exploration rewards stronger pans.
  // Buckeye Run flows east-west along z=-55, ±2.4m halfWidth, and the
  // south mine was previously placed AT z=-55 (the same line) which
  // dropped the stream box straight through the cave interior. Shift
  // the south mine well south of the Buckeye corridor.
  const MINE_CONFIGS: readonly MineConfig[] = [
    { id: 'north', displayName: 'North Mine', x: -45, z: -45, yieldBonus: 3.0, unlockTier: 3 },
    { id: 'south', displayName: 'South Mine', x: 40, z: -78, yieldBonus: 4.0, unlockTier: 3 },
    { id: 'east', displayName: 'East Mine', x: 65, z: 20, yieldBonus: 5.0, unlockTier: 3 },
    { id: 'west', displayName: 'West Mine', x: -55, z: 35, yieldBonus: 3.5, unlockTier: 3 },
  ];
  const mines: MineInfo[] = MINE_CONFIGS.map((cfg) =>
    createMineEntrance(renderer.scene, physics.rapier, (x, z) => terrain.getHeightAt(x, z), cfg),
  );
  // Auto-open any mine the player already qualifies for at boot, so they
  // don't get re-blocked after returning to a save where they'd unlocked
  // these mines previously.
  const loadedShovelTier = mineAccessTier(gameStore.getState().save.equipment.ownedTiers);
  for (const m of mines) m.tryUnlock(loadedShovelTier);

  // ---- Boulders (along stream banks, in-stream, near mines) ----
  const boulders = placeBoulders({
    scene: renderer.scene,
    terrain,
    streams: STREAM_CONFIGS,
    minePositions: mines.map((m) => m.position),
    seed: 0xb0,
  });
  console.log(`[boulders] placed ${boulders.count} boulders`);
  const boulderPoints: BoulderPoint[] = boulders.colliders.map((c) => ({
    x: c.pos.x,
    z: c.pos.z,
    r: c.radius,
  }));
  const claimMarkers = createClaimMarkers(renderer.scene);
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
        count: Math.round(140 * RENDER_QUALITY.scatter),
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
        count: Math.round(70 * RENDER_QUALITY.scatter),
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
        count: Math.round(40 * RENDER_QUALITY.scatter),
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
        count: Math.round(220 * RENDER_QUALITY.scatter),
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
        count: Math.round(90 * RENDER_QUALITY.scatter),
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
        count: Math.round(110 * RENDER_QUALITY.scatter),
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
        count: RENDER_QUALITY.grassCover,
        extent: 95,
        seed: 0xb1,
        bladeHeight: 0.11,
        bladeHalfBase: 0.018,
        scaleRange: { min: 0.7, max: 1.4 },
        windAmplitude: 0.025,
        // Ground-cover blades are short, so go a bit darker / less vivid
        // than the tall layer — they read as moss/lawn underlayer rather
        // than fresh prairie growth.
        baseColor: { r: [0.2, 0.3], g: [0.26, 0.34], b: [0.08, 0.12] },
        tipColor: { r: [0.78, 0.9], g: [0.64, 0.76], b: [0.2, 0.3] },
        reject: (x, z) => streams.isInStreamZone(x, z, 0.5) || exclusion.isExcluded(x, z),
      });
      renderer.scene.add(grassCover.mesh);
      grassCovers.push(grassCover);
      console.log(`[grass-cover] ready; ${allPositions.length} exclusion zones`);
    })
    .catch((err) => console.error('[scatter] failed', err));

  await reportBoot(62, 'Calling the prospector…');

  // ---- Character ----
  const review = readReviewOverride();
  if (review) console.log('[review] shot override', review);
  const spawnX = review?.x ?? persistedPlayer.position.x;
  const spawnZ = review?.z ?? persistedPlayer.position.z;
  const spawnYaw = review?.yaw ?? persistedPlayer.rotation.yaw;
  const groundY = terrain.getHeightAt(spawnX, spawnZ);
  const spawnY = Math.max(persistedPlayer.position.y, groundY + 1.5);
  const character = await createCharacter({
    world: physics.rapier,
    initialPosition: { x: spawnX, y: spawnY, z: spawnZ },
    initialYaw: spawnYaw,
    initialStamina: persistedPlayer.meters.stamina,
  });
  renderer.scene.add(character.group);

  // ---- Input ----
  const input = createInputManager();
  input.start();

  // ---- Camera rig ----
  const cameraRig = createCameraRig({
    camera: renderer.camera,
    initialYaw: spawnYaw,
    initialPitch: review?.pitch ?? 0.25,
  });
  if (review?.arm) cameraRig.setArmLength(review.arm);
  if (review?.pose) setReviewPose(review.pose);

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
  const strikeMeter = createStrikeMeterView();
  renderer.camera.add(strikeMeter.group);
  const extractMeter = createExtractMeterView();
  renderer.camera.add(extractMeter.group);
  // Shared particle pool + camera-shake for all minigame stages.
  // Parent the particle group to the camera so bursts render in
  // viewmodel space; the shake offset is applied to the camera each
  // frame AFTER cameraMode positions it.
  const fx = createEffectSystem();
  renderer.camera.add(fx.particlesGroup);
  renderer.scene.add(fx.worldGroup);
  // Per-stage swing trackers — tool meshes animate on rising-edge
  // detection of `lastSwingFlashSec` (a value that drops to ~0 on each
  // fresh swing). Initial value > 0 ensures the first frame doesn't
  // false-fire.
  let lastDigSwingFlash = 999;
  let lastClassifyTapFlash = 999;
  let lastStrikeSwingFlash = 999;
  let lastPanSwirls = 0;
  let prospectWasActive = false;

  // ---- Audio system ----
  // Browser audio policy requires a user gesture before AudioContext can
  // produce sound, so we wire tryEnable() into the existing canvas click
  // handler (and the first keydown) — first interaction unlocks audio
  // for the rest of the session.
  const audio = bindGameplayAudio(createAudioSystem());
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
      void Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
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
    // Mines — all four
    { x: -45, z: -45, label: 'North Mine', color: '#886644', shape: 'mine' },
    { x: 40, z: -78, label: 'South Mine', color: '#886644', shape: 'mine' },
    { x: 65, z: 20, label: 'East Mine', color: '#886644', shape: 'mine' },
    { x: -55, z: 35, label: 'West Mine', color: '#886644', shape: 'mine' },
  ];
  const minimap = mountMinimap({
    streams: minimapStreams,
    landmarks: minimapLandmarks,
  });

  // ---- Settings panel ----
  // Apply persisted settings to the live runtime at boot so the player
  // doesn't have to open + tweak the panel on every load.
  const initialSettings = gameStore.getState().save.settings ?? defaultSettings();
  audio.setMasterVolume(initialSettings.audio.master);
  audio.setAmbientVolume(initialSettings.audio.ambient);
  audio.setSfxVolume(initialSettings.audio.sfx);
  input.setMouseSensitivityMultiplier(initialSettings.look.mouseSensitivity);
  renderer.camera.fov = initialSettings.graphics.fovDegrees;
  renderer.camera.updateProjectionMatrix();
  renderer.renderer.shadowMap.enabled = initialSettings.graphics.shadowsEnabled;
  renderer.sun.castShadow = initialSettings.graphics.shadowsEnabled;

  const settings = createSettingsPanel({
    initial: initialSettings,
    updateSetting: (key, patch) => gameStore.getState().updateSettingsSlice(key, patch),
    apply: {
      masterVolume: (v) => audio.setMasterVolume(v),
      ambientVolume: (v) => audio.setAmbientVolume(v),
      sfxVolume: (v) => audio.setSfxVolume(v),
      mouseSensitivity: (v) => input.setMouseSensitivityMultiplier(v),
      fov: (v) => {
        renderer.camera.fov = v;
        renderer.camera.updateProjectionMatrix();
      },
      shadowsEnabled: (v) => {
        renderer.renderer.shadowMap.enabled = v;
        renderer.sun.castShadow = v;
      },
    },
  });

  // ---- Prospecting ----
  const prospect = createProspectingController({
    audio,
    effects: {
      burst: (origin, color, count = 12, style) => fx.burst({ origin, color, count, style }),
      shake: (intensity, durationSec) => fx.shake(intensity, durationSec),
    },
  });

  // Edge-detection state (input manager doesn't expose just-pressed; tracked here).
  let interactWasDown = false;
  let pauseWasDown = false;
  let helpWasDown = false;
  let mapWasDown = false;
  let inventoryWasDown = false;
  let journalWasDown = false;
  let useToolWasDown = false;
  let digWasDown = false;
  let panWasDown = false;
  let hintText = '';
  let sawRain = false;
  let threatAcc = 0;
  let hintUntil = 0;
  let worldTime =
    review?.hour != null ? reviewWorldTime(review.hour) : gameStore.getState().save.world.gameTime;
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

  // ---- Playtest pilot (`?smoke=1`) ----
  const smoke = createSmokePilot();
  const smokeSite = (() => {
    for (const stream of streams.streams) {
      const site = stream.sites[0];
      if (site) return { x: site.position.x, z: site.position.z };
    }
    return null;
  })();
  const assayer = vendors.vendors.find((v) => v.id === 'assayer');
  const smokeVendor = {
    x: assayer?.position.x ?? -15,
    z: assayer?.position.z ?? 0,
  };
  let frameLuma = 0;

  function publishProbe(): void {
    const save = gameStore.getState().save;
    const gold = save.inventory.carry.gold;
    const pos = character.getPosition();
    const view = smoke.view();
    const previous = window.__themHills;
    window.__themHills = {
      ready: true,
      phase: view.phase,
      position: { x: pos.x, y: pos.y, z: pos.z },
      carryGrams: gold.flake_g + gold.picker_g + gold.nugget_g,
      wallet: save.wallet.balance,
      saveCount: save.metadata.saveCount,
      loopComplete: view.loopComplete,
      error: view.error,
      frameLuma,
      peakCarryGrams: view.peakCarryGrams,
      save: async () => {
        await saveCurrentState(buildSaveSnapshot());
        publishProbe();
      },
      graphics: getQualityName(),
      saveVersion: save.version,
      panTier: save.equipment.ownedTiers.pan,
      claimCount: save.fieldwork.claims.length,
      exportLegacyV4: () => {
        const snap = gameStore.getState().serialize();
        const owned = { ...snap.equipment.ownedTiers };
        delete (owned as { pick?: number }).pick;
        delete (owned as { rocker?: number }).rocker;
        delete (owned as { longTom?: number }).longTom;
        delete (owned as { hydraulic?: number }).hydraulic;
        const { fieldwork: _field, ...rest } = snap;
        void _field;
        return {
          ...rest,
          version: 4,
          equipment: { ...snap.equipment, ownedTiers: owned },
          player: { ...snap.player, position: { x: 4, y: 2, z: -3 } },
          wallet: { ...snap.wallet, balance: 500 },
          inventory: {
            ...snap.inventory,
            carry: {
              ...snap.inventory.carry,
              gold: { flake_g: 1.25, picker_g: 0.2, nugget_g: 0 },
            },
          },
        };
      },
      buyUpgrade: (category: string) => {
        const cat = category as EquipmentCategory;
        const ownedTier = gameStore.getState().save.equipment.ownedTiers[cat];
        const next = getNextUpgrade(cat, ownedTier);
        if (!next || next.questGated) return false;
        const before = gameStore.getState().save.fieldwork.method;
        const ok = gameStore.getState().purchaseUpgrade(cat, next.cost, next.toTier, worldTime);
        const after = gameStore.getState().save.fieldwork.method;
        if (ok && before !== after) emitGameplay('method-change', { method: after });
        return ok;
      },
      stakeClaim: () => {
        const spot = richestPlacer(
          STREAM_CONFIGS,
          gameStore.getState().save.fieldwork.payShift,
          boulderPoints,
        );
        const result = gameStore.getState().stakePlacer(spot.x, spot.z, spot.read, worldTime);
        if (result.ok && result.claimId) {
          emitGameplay('claim-staked', {
            claimId: result.claimId,
            habitat: result.habitat ?? spot.read.habitat,
          });
        }
        return { ok: result.ok, reason: result.reason };
      },
      applyShot: (name: string) => {
        const shot = reviewShot(name);
        if (!shot) return false;
        const y = terrain.getHeightAt(shot.x, shot.z) + 1.5;
        character.placeAt(shot.x, y, shot.z);
        cameraRig.setYawPitch(shot.yaw, shot.pitch);
        cameraRig.setArmLength(shot.arm);
        setReviewPose(shot.pose);
        worldTime = reviewWorldTime(shot.hour);
        return true;
      },
    };
    if (previous) previous.frameLuma = frameLuma;
  }

  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd56a,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 26, 10, 1, true), beaconMat);
  beacon.name = 'guide-beacon';
  beacon.frustumCulled = false;
  beacon.visible = false;
  renderer.scene.add(beacon);

  let simRunning = skipIntro;
  let presentedFrames = 0;
  const overlays = mountOverlays({
    onResume: () => {
      void Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
    },
    onSettings: () => settings.open(),
    onQuality: (name) => {
      setQuality(name);
      publishProbe();
      requestAnimationFrame(() => {
        renderer.applyGraphics();
        grass?.setCount(RENDER_QUALITY.grassTall);
        for (const cover of grassCovers) cover.setCount(RENDER_QUALITY.grassCover);
        motes.resize();
      });
    },
  });

  // ---- Game loop ----
  const loop = createGameLoop({
    // Shader compile on a software GPU can stall a frame for seconds.
    // The playtest pilot needs that stall to still advance the sim, or
    // the 6s pan and 9s collect never finish inside the test budget.
    maxFrameDt: smoke.active ? 1 : 0.25,
    update: (dt) => {
      input.poll();
      if (!simRunning) {
        publishProbe();
        return;
      }
      worldTime += dt;

      const carried = gameStore.getState().save.inventory.carry.gold;
      const drive = smoke.drive(dt, {
        carryGrams: carried.flake_g + carried.picker_g + carried.nugget_g,
        wallet: gameStore.getState().save.wallet.balance,
        prospect: prospect.getSnapshot(),
        vendorOpen: activeVendor !== null,
        placeAt: (x, y, z) => character.placeAt(x, y, z),
        groundY: (x, z) => terrain.getHeightAt(x, z),
        site: smokeSite,
        vendor: smokeVendor,
      });

      const interactDown = input.isActive('INTERACT') || drive.interact;
      const useToolDown = input.isActive('USE_TOOL') || drive.useTool;
      const interactJustPressed = interactDown && !interactWasDown;
      interactWasDown = interactDown;

      const pauseDown = input.isActive('PAUSE');
      let pauseJustPressed = pauseDown && !pauseWasDown;
      pauseWasDown = pauseDown;

      // 1. Camera look — consumed always so input doesn't pool, but only
      // applied to the rig when no prospect minigame is active and the
      // settings panel isn't open (in both cases we don't want mouse
      // motion to turn the world view).
      const rawLook = input.getLookDelta(dt);
      const lookDelta = drive.look ?? rawLook;
      const prospectingNow = prospect.isActive();
      if (!prospectingNow && !settings.isOpen() && !overlays.isBlocking()) {
        cameraRig.applyLook(lookDelta);
      }

      // 2. Determine whether character can move (locked during any session)
      const prospecting = prospectingNow;
      const inVendorSession = activeVendor !== null;
      const inStoreSession = storeOpen;
      const inDialogueSession = dialogue !== null;
      const inSession = prospecting || inVendorSession || inStoreSession || inDialogueSession;

      // Settings panel: PAUSE toggles open/close from the in-world state.
      // While the panel is open the player can't move and the press is
      // consumed so the downstream session handlers don't double-fire.
      const helpJust = input.isActive('HELP') && !helpWasDown;
      helpWasDown = input.isActive('HELP');
      const mapJust = input.isActive('MAP') && !mapWasDown;
      mapWasDown = input.isActive('MAP');
      const inventoryJust = input.isActive('INVENTORY') && !inventoryWasDown;
      inventoryWasDown = input.isActive('INVENTORY');
      const journalJust = input.isActive('JOURNAL') && !journalWasDown;
      journalWasDown = input.isActive('JOURNAL');
      if (!inSession) {
        if (helpJust) overlays.toggle('help');
        if (mapJust) overlays.toggle('map');
        if (inventoryJust) overlays.toggle('inventory');
        if (journalJust) overlays.toggle('journal');
      }

      if (pauseJustPressed) {
        if (settings.isOpen()) {
          settings.close();
          pauseJustPressed = false;
        } else if (overlays.current() !== 'none') {
          overlays.close();
          pauseJustPressed = false;
        } else if (!inSession) {
          overlays.toggle('pause');
          pauseJustPressed = false;
        }
      }
      const settingsOpen = settings.isOpen();
      const uiBlocked = settingsOpen || overlays.isBlocking();
      const moveInput =
        !inSession && !uiBlocked && drive.move
          ? drive.move
          : inSession || uiBlocked
            ? { x: 0, y: 0 }
            : input.getMoveInput();
      const jumpDown = inSession || uiBlocked ? false : input.isActive('JUMP');
      const sprintDown = inSession || uiBlocked ? false : input.isActive('SPRINT');

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
        hideAllProspectViewmodels();
      }
      prospectWasActive = prospecting;

      function hideAllProspectViewmodels(): void {
        shovelMesh.visible = false;
        pickaxeMesh.visible = false;
        for (const m of Object.values(classifierMeshes)) m.visible = false;
        digMeter.setVisible(false);
        classifyMeter.setVisible(false);
        panView.setVisible(false);
        collectView.setVisible(false);
        strikeMeter.setVisible(false);
        extractMeter.setVisible(false);
      }

      // Tick the FX system every frame (particle motion + shake decay)
      // regardless of prospect state — the cost is tiny and it lets
      // particles finish out cleanly if a stage ends mid-burst.
      fx.update(dt);
      // Per-frame tool animations. No-op when no anim is queued.
      updateToolSwing(shovelMesh, dt);
      updateToolSwing(pickaxeMesh, dt);
      for (const m of Object.values(classifierMeshes)) updateToolBounce(m, dt);

      if (prospecting) {
        cameraMode.updateProspectView(charPosForCamera);
        // Shake rides ON TOP of the base camera placement during the
        // prospect view. It's a per-frame offset and never permanent.
        fx.applyShakeTo(renderer.camera);
        const snap = prospect.getSnapshot();
        if (snap) {
          const v = snap.viz;
          // Always start from a hidden baseline, then turn on what the
          // current stage needs. Simpler than the per-branch if/else
          // hide-everything-except-mine pattern.
          hideAllProspectViewmodels();

          if (v?.kind === 'dig') {
            const usePickaxe = v.isPickaxe;
            shovelMesh.visible = !usePickaxe;
            pickaxeMesh.visible = usePickaxe;
            digMeter.update(v);
            digMeter.setVisible(true);
            // Rising-edge: lastSwingFlashSec drops on a new swing.
            if (v.lastSwingFlashSec < lastDigSwingFlash) {
              triggerToolSwing(usePickaxe ? pickaxeMesh : shovelMesh);
              presentToolImpact(fx, charPosForCamera, 0x8a6240, 12, 'dirt');
            }
            lastDigSwingFlash = v.lastSwingFlashSec;
          } else if (v?.kind === 'classify') {
            const tierKey: 1 | 2 | 3 = v.layerCount === 1 ? 1 : v.layerCount === 3 ? 2 : 3;
            for (const [k, m] of Object.entries(classifierMeshes)) {
              m.visible = Number(k) === tierKey;
            }
            classifyMeter.update(v);
            classifyMeter.setVisible(true);
            // Rising-edge: bounce the visible classifier sieve on each tap.
            if (v.lastTapFlashSec < lastClassifyTapFlash) {
              triggerToolBounce(classifierMeshes[tierKey]);
            }
            lastClassifyTapFlash = v.lastTapFlashSec;
          } else if (v?.kind === 'pan') {
            panView.update(v);
            panView.setVisible(true);
            if (v.swirlCount > lastPanSwirls) {
              presentToolImpact(fx, charPosForCamera, 0xb7d4e2, 10, 'droplet');
            }
            lastPanSwirls = v.swirlCount;
          } else if (v?.kind === 'collect') {
            collectView.update(v);
            collectView.setVisible(true);
          } else if (v?.kind === 'strike') {
            // Mining context: hold the pickaxe regardless of shovel tier
            // (the player is, by definition, in a mine — they have at
            // least Shovel T3 to be inside). isPickaxe flag still drives
            // the tier-based difficulty.
            pickaxeMesh.visible = true;
            strikeMeter.update(v);
            strikeMeter.setVisible(true);
            if (v.lastSwingFlashSec < lastStrikeSwingFlash) {
              triggerToolSwing(pickaxeMesh);
            }
            lastStrikeSwingFlash = v.lastSwingFlashSec;
          } else if (v?.kind === 'extract') {
            pickaxeMesh.visible = true;
            extractMeter.update(v);
            extractMeter.setVisible(true);
          }
        }
      } else {
        cameraRig.placeCamera(charPosForCamera, physics.rapier, character.getColliderHandle(), dt);
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
      // Find the mine the player is closest to (only one can be "near" at
      // a time given the interact-radius gating). null if not near any.
      let nearestMine: MineInfo | null = null;
      if (!inSession && nearestVendor === null && !nearStore && !nearInn && !nearPete) {
        for (const m of mines) {
          if (m.isPlayerNear(charPos)) {
            nearestMine = m;
            break;
          }
        }
      }
      const nearMine = nearestMine !== null;
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
      // Cave site lookup: pick the nearest of all mines' cave sites. Each
      // mine returns null when locked, so this naturally skips them.
      let candidateCaveSite: { site: PanningSite; distance: number } | null = null;
      if (!inSession && nearestVendor === null && !nearStore && !nearInn && !nearPete) {
        for (const m of mines) {
          const c = m.findNearestSite(charPos);
          if (c && (candidateCaveSite === null || c.distance < candidateCaveSite.distance)) {
            candidateCaveSite = c;
          }
        }
      }
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
      for (const m of mines) m.update(worldTime, m === nearestMine);
      camp.update(worldTime, nearCamp);
      claimMarkers.sync(gameStore.getState().save.fieldwork.claims, (x, z) => terrain.getHeightAt(x, z));

      const raining = weather.getView().state === 'rain';
      if (raining && !sawRain) {
        gameStore.getState().onRain(worldTime);
        emitGameplay('creek-rise', { shift: 0.07 });
      }
      sawRain = raining;
      threatAcc += dt;
      if (threatAcc > 1) {
        threatAcc = 0;
        for (const ev of gameStore.getState().tickThreats(worldTime)) {
          if (ev.kind === 'jumper' || ev.kind === 'theft') {
            emitGameplay('claim-jumper', { claimId: ev.claimId });
          }
          hintText = ev.detail;
          hintUntil = worldTime + 6;
        }
      }

      // 8. Survival meter drain + daily site respawn + audio ambient
      const inStreamWater = streams.isPlayerInAnyStream(charPos);
      // Hunger and thirst wait until the player has actually started a
      // prospect. Wandering while lost shouldn't empty the meters.
      if (gameStore.getState().save.progression.stats.totalPansPerformed > 0) {
        const fed = gameStore.getState().save.fieldwork.fedUntil;
        gameStore.getState().tickMeters(dt, inStreamWater, worldTime < fed);
      }
      // Midnight respawn: when the in-game day index advances, regenerate
      // every stream's sites at fresh positions with a new maxDigs roll.
      // Tied to worldTime (in-game seconds, not IRL clock).
      const dayNow = Math.floor(worldTime / SKY_SECONDS_PER_DAY);
      if (dayNow !== currentDay) {
        currentDay = dayNow;
        streams.setEpoch(currentDay);
        gameStore.getState().onNewDay(worldTime);
        const hour = getSkyHour(worldTime);
        console.log(
          `[sites] respawned at in-game midnight (day ${currentDay}, worldTime=${worldTime.toFixed(1)}s, hour=${hour.toFixed(2)})`,
        );
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
      // True if the player is inside ANY of the four mines' cave interiors.
      let inCave = false;
      for (const m of mines) {
        if (m.isPlayerInside(charPos)) {
          inCave = true;
          break;
        }
      }
      if (inCave) {
        renderer.ambient.intensity = 0.04;
        renderer.hemi.intensity = 0.015;
      }

      // Sky wrote the sun's arc position. Slide the shadow frustum onto the
      // player, then publish one lighting block for every custom shader.
      const sunDirWorld = renderer.followSun(charPos);
      renderer.syncFrame(worldTime, sunDirWorld);
      updateScatterWind(worldTime, charPos);
      setFoliageWindTime(worldTime);
      shafts.update(sunDirWorld, charPos, true);
      motes.update(worldTime, charPos, sunDirWorld.y);

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
      grass?.update(grassLight);
      for (const cover of grassCovers) cover.update(grassLight);

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
              } else if (action.kind === 'giveLesson') {
                gameStore.getState().giveLesson(worldTime);
                dialogue!.pendingBody = undefined;
                dialogue!.currentNodeId = 'lesson';
                dialogue!.selectionIdx = 0;
                emitGameplay('rumor', { id: 'lesson' });
                audio.playQuestChime();
              } else if (action.kind === 'hearRumor') {
                const rumor = gameStore.getState().hearNextRumor(worldTime);
                dialogue!.pendingBody = rumor?.body ?? "That's all the news I have for now.";
                dialogue!.currentNodeId = 'rumor';
                dialogue!.selectionIdx = 0;
                if (rumor) {
                  emitGameplay('rumor', { id: rumor.id });
                  if (rumor.id === 'buckeye') emitGameplay('area-unlock', { streamId: 'buckeye_run' });
                }
                audio.playConfirm();
              } else if (action.kind === 'hireHand') {
                const ok = gameStore.getState().hireHand(worldTime);
                if (ok) {
                  dialogue!.currentNodeId = 'hired';
                  dialogue!.selectionIdx = 0;
                  emitGameplay('hire', { hands: gameStore.getState().save.fieldwork.hands });
                  audio.playConfirm();
                }
              } else if (action.kind === 'fileLode') {
                const filed = gameStore.getState().fileLode(action.mineId, action.x, action.z, worldTime);
                if (filed.ok) {
                  dialogue!.currentNodeId = 'lodeFiled';
                  dialogue!.selectionIdx = 0;
                  emitGameplay('claim-staked', { claimId: `lode_${action.mineId}`, habitat: 'bedrock' });
                  audio.playConfirm();
                } else {
                  dialogue!.pendingBody = filed.reason;
                  dialogue!.currentNodeId = 'rumor';
                  dialogue!.selectionIdx = 0;
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
          const listings = buildListings(gameStore.getState().save);
          if (listings.length > 0) {
            storeSelectionIdx = ((storeSelectionIdx % listings.length) + listings.length) % listings.length;
          }
          if (toolNextJustPressed && listings.length > 0) {
            storeSelectionIdx = (storeSelectionIdx + 1) % listings.length;
            audio.playUITap();
          }
          if (toolPrevJustPressed && listings.length > 0) {
            storeSelectionIdx = (storeSelectionIdx - 1 + listings.length) % listings.length;
            audio.playUITap();
          }
          if (interactJustPressed && listings.length > 0) {
            const row = listings[storeSelectionIdx];
            if (row && row.affordable && row.nextCost !== null && !row.questGated) {
              const before = gameStore.getState().save.fieldwork.method;
              let ok = false;
              if (row.kind === 'upgrade') {
                const category = row.id as EquipmentCategory;
                const ownedTier = gameStore.getState().save.equipment.ownedTiers[category];
                const next = getNextUpgrade(category, ownedTier);
                if (next) {
                  ok = gameStore.getState().purchaseUpgrade(category, next.cost, next.toTier, worldTime);
                }
              } else if (row.kind === 'supply') {
                ok = gameStore.getState().buySupply(row.id, worldTime);
                if (ok) emitGameplay('supply-bought', { id: row.id });
              } else if (row.kind === 'sell') {
                ok = gameStore.getState().sellSupply(row.id, worldTime);
              } else if (row.kind === 'improve') {
                ok = gameStore.getState().buyImprovement(row.id, worldTime);
              } else if (row.kind === 'hire') {
                ok = gameStore.getState().hireHand(worldTime);
                if (ok) emitGameplay('hire', { hands: gameStore.getState().save.fieldwork.hands });
              }
              const after = gameStore.getState().save.fieldwork.method;
              if (ok && before !== after) emitGameplay('method-change', { method: after });
              if (ok) {
                audio.playConfirm();
                console.log(`[store] ${row.kind} ${row.id}`);
              } else {
                console.log(`[store] could not buy ${row.id}`);
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
                townQuote(
                  gameStore.getState().save.economy.spotPrice.current,
                  gameStore.getState().save.fieldwork.townBias,
                  weather.getView().state,
                  getSkyHour(worldTime),
                ),
                worldTime,
              );
            gameStore.getState().markFirstSale();
            emitGameplay('sell', { vendorId: activeVendor!.id, earned: result.earned });
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
            useToolDown,
            axes: lookDelta,
          });
          if (result) {
            gameStore.getState().addGoldToCarry(result.reward);
            gameStore.getState().applyGoldToQuests(result.reward);
            gameStore.getState().touchSite(result.siteId, worldTime);
            for (let extra = 0; extra < result.extraDigs; extra++) {
              gameStore.getState().touchSite(result.siteId, worldTime);
            }
            gameStore.getState().workClaimsNear(
              character.getPosition().x,
              character.getPosition().z,
              worldTime,
              nearestMine?.id ?? null,
            );
            const totalG = result.reward.flake_g + result.reward.picker_g + result.reward.nugget_g;
            presentProspectFind({
              audio,
              effects: fx,
              position: character.getPosition(),
              grams: totalG,
            });
            gameStore.getState().markTutorialComplete();
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
      } else if (nearMine && nearestMine && interactJustPressed) {
        const shovelTier = mineAccessTier(gameStore.getState().save.equipment.ownedTiers);
        if (nearestMine.tryUnlock(shovelTier)) {
          console.log(`[mine] ${nearestMine.id} opened — pickaxe knocked the boards loose`);
        } else if (nearestMine.isOpen()) {
          console.log(`[mine] ${nearestMine.id} already open — walk inside`);
        } else {
          console.log(`[mine] ${nearestMine.id} sealed — needs a pickaxe (Shovel T3)`);
        }
      } else if (nearCamp && interactJustPressed) {
        gameStore.getState().restAtCamp(worldTime);
        worldTime += CAMP_REST_TIME_ADVANCE;
        console.log(
          `[camp] rested — meters refilled, time advanced ${(CAMP_REST_TIME_ADVANCE / 3600).toFixed(0)}h`,
        );
      } else if (nearestSite && interactJustPressed) {
        // Mine cave sites get a higher dig-count range than stream sites
        // (more gold per location). Detect by the optional bonusYield field
        // that mines tag onto their PanningSite.
        const isMineSite = nearestSite.site.bonusYield !== undefined;
        const digsRange = isMineSite ? { min: 8, max: 15 } : { min: 3, max: 15 };
        const site = gameStore.getState().getOrCreateSite(nearestSite.site.id, digsRange);
        // Skip if this site has already been depleted (digsRemaining=0).
        // Defensive — the proximity probe in stream.ts also hides depleted
        // markers, so this branch should rarely fire.
        if (site.digsRemaining <= 0) {
          console.log(`[prospect] site ${nearestSite.site.id} is depleted`);
        } else {
          const actionCount = gameStore.getState().incrementPanCount();
          const firstEver = actionCount === 1;
          // M6: only Gear is the "global" tool multiplier now — the rest
          // (pan/shovel/classifier/snuffer/detector) apply per-stage
          // inside the prospect controller.
          const ownedNow = gameStore.getState().save.equipment.ownedTiers;
          const fieldNow = gameStore.getState().save.fieldwork;
          const globalMult = getGlobalYieldMultiplier(ownedNow);
          const survivalMult = computeSurvivalYieldFactor(gameStore.getState().save.player.meters);
          const siteBonus = nearestSite.site.bonusYield ?? 1.0;
          const siteRead = readGround(
            STREAM_CONFIGS,
            nearestSite.site.position.x,
            nearestSite.site.position.z,
            fieldNow.payShift,
            boulderPoints,
          );
          const geo = isMineSite
            ? lodeYieldFactor(fieldNow.claims, nearestMine?.id ?? null)
            : creekYieldFactor(gameStore.getState().save, siteRead) *
              claimYieldFactor(
                fieldNow.claims,
                nearestSite.site.position.x,
                nearestSite.site.position.z,
                siteRead.habitat,
              );
          let method = fieldNow.method;
          if (method === 'hydraulic' && fieldNow.hands < 1) {
            method = 'pan';
            hintText = 'The monitor needs a hired hand on the hose.';
            hintUntil = worldTime + 4;
          }
          const tutorial = !gameStore.getState().save.progression.tutorialCompleted && !isMineSite;
          const yieldMultiplier = globalMult * survivalMult * siteBonus * geo;
          prospect.start({
            siteId: nearestSite.site.id,
            context: isMineSite ? 'mining' : 'panning',
            digsRemaining: site.digsRemaining,
            maxDigs: site.maxDigs,
            actionCount,
            firstEver,
            yieldMultiplier,
            toolTiers: ownedNow,
            method,
            tutorial,
            asPick: ownedNow.pick >= 1,
          });
          audio.playSplash();
          emitGameplay('prospect-start', { siteId: nearestSite.site.id });
          const bonusTag = siteBonus !== 1 ? ` × site${siteBonus.toFixed(2)}` : '';
          console.log(
            `[prospect] start ${nearestSite.site.id} (digs=${site.digsRemaining}/${site.maxDigs}, firstEver=${firstEver}, yield=${yieldMultiplier.toFixed(2)} = gear${globalMult.toFixed(2)} × survival${survivalMult.toFixed(2)}${bonusTag})`,
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
      const accessTier = mineAccessTier(gameStore.getState().save.equipment.ownedTiers);
      const minePromptText =
        nearestMine && nearestMine.isOpen()
          ? 'Mine is open — walk inside'
          : accessTier >= 3
            ? 'Open the mine'
            : 'Mine sealed — buy a pick or a pickaxe';
      const groundHere = readGround(
        STREAM_CONFIGS,
        charPos.x,
        charPos.z,
        gameStore.getState().save.fieldwork.payShift,
        boulderPoints,
      );
      const stakeCost = gameStore.getState().save.fieldwork.claims.length === 0
        ? 0
        : gameStore.getState().save.fieldwork.claims.length === 1
          ? 60
          : 180;
      const canStake =
        !nearestSite &&
        groundHere.streamId !== null &&
        stakeable(groundHere.habitat) &&
        gameStore.getState().save.fieldwork.claims.length < 3 &&
        gameStore.getState().save.wallet.balance >= stakeCost;
      if (!inSession && canStake && interactJustPressed) {
        const filed = gameStore.getState().stakePlacer(charPos.x, charPos.z, groundHere, worldTime);
        hintText = filed.ok ? `Filed: ${filed.reason}` : filed.reason;
        hintUntil = worldTime + 4.5;
        if (filed.ok && filed.claimId) {
          emitGameplay('claim-staked', {
            claimId: filed.claimId,
            habitat: filed.habitat ?? groundHere.habitat,
          });
          audio.playConfirm();
        }
      }
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
                      ? {
                          text: `Prospect the ${groundHere.label}`,
                          glyph: interactGlyph,
                        }
                      : canStake
                        ? {
                            text: `Stake this ${groundHere.label} (${stakeCost === 0 ? 'free' : `$${stakeCost}`})`,
                            glyph: interactGlyph,
                          }
                        : null;

      const digDown = input.isActive('DIG');
      const digJust = digDown && !digWasDown;
      digWasDown = digDown;
      const panDown = input.isActive('PAN');
      const panJust = panDown && !panWasDown;
      panWasDown = panDown;
      const useJust = useToolDown && !useToolWasDown;
      useToolWasDown = useToolDown;
      if (!inSession && !uiBlocked && panJust && groundHere.dist < 3.5) {
        const sampled = gameStore.getState().recordSample(groundHere, charPos.x, charPos.z, worldTime);
        hintText = sampled.line;
        hintUntil = worldTime + 5;
        emitGameplay('sample', { colors: sampled.colors, habitat: sampled.habitat });
        if (sampled.unlocked) emitGameplay('area-unlock', { streamId: sampled.unlocked });
        audio.playConfirm();
      }
      if (!inSession && !uiBlocked && !inStoreSession && toolNextJustPressed) {
        const before = gameStore.getState().save.fieldwork.method;
        const next = gameStore.getState().cycleMethod(1);
        if (next !== before) {
          emitGameplay('method-change', { method: next });
          hintText = `Working with a ${methodLabel(next).toLowerCase()}.`;
          hintUntil = worldTime + 2.5;
          audio.playUITap();
        }
      }
      if (!inSession && !uiBlocked && !inStoreSession && toolPrevJustPressed) {
        const before = gameStore.getState().save.fieldwork.method;
        const next = gameStore.getState().cycleMethod(-1);
        if (next !== before) {
          emitGameplay('method-change', { method: next });
          hintText = `Working with a ${methodLabel(next).toLowerCase()}.`;
          hintUntil = worldTime + 2.5;
          audio.playUITap();
        }
      }
      if (
        !inSession &&
        !promptInfo &&
        (interactJustPressed || useJust || digJust || (panJust && groundHere.dist >= 3.5))
      ) {
        hintText = streams.isInStreamZone(charPos.x, charPos.z, 6)
          ? 'Nothing to work here. Follow the creek to a gold ring, then press E.'
          : 'Nothing here. Coyote Creek is east — follow the gold beam.';
        hintUntil = worldTime + 3.5;
      }
      const shownPrompt =
        promptInfo ?? (hintText && worldTime < hintUntil ? { text: hintText, glyph: '…' } : null);

      const carryGramsNow =
        save.inventory.carry.gold.flake_g +
        save.inventory.carry.gold.picker_g +
        save.inventory.carry.gold.nugget_g;
      let guide: { title: string; detail: string } | null = null;
      let beam: { x: number; z: number } | null = null;
      if (!params.has('shot')) {
        const opening = openingGuide(save);
        if (opening) {
          guide = { title: opening.title, detail: opening.detail };
          if (opening.beam === 'creek') {
            const coyote = streams.streams.find((s) => s.id === 'coyote_creek');
            let bestD = Infinity;
            for (const site of coyote?.sites ?? []) {
              const d = Math.hypot(site.position.x - charPos.x, site.position.z - charPos.z);
              if (d < bestD) {
                bestD = d;
                beam = { x: site.position.x, z: site.position.z };
              }
            }
          } else if (opening.beam === 'assayer') {
            beam = { x: smokeVendor.x, z: smokeVendor.z };
          } else if (opening.beam === 'pete') {
            beam = { x: oldPete.position.x, z: oldPete.position.z };
          } else if (opening.beam === 'store') {
            beam = { x: generalStore.position.x, z: generalStore.position.z };
          }
        }
      }
      if (beam) {
        beacon.visible = true;
        beacon.position.set(beam.x, terrain.getHeightAt(beam.x, beam.z) + 13, beam.z);
      } else {
        beacon.visible = false;
      }
      if (overlays.current() === 'inventory') {
        const g = save.inventory.carry.gold;
        const vault = save.inventory.vault.gold;
        const vaultG = vault.flake_g + vault.picker_g + vault.nugget_g;
        overlays.setInventory([
          `Flake ${g.flake_g.toFixed(3)} g · Picker ${g.picker_g.toFixed(3)} g · Nugget ${g.nugget_g.toFixed(3)} g`,
          `Wallet $${save.wallet.balance.toFixed(2)}`,
          vaultG > 0 ? `Cache ${vaultG.toFixed(3)} g` : 'Cache empty',
          `Shovel T${save.equipment.ownedTiers.shovel} · Pan T${save.equipment.ownedTiers.pan} · Classifier T${save.equipment.ownedTiers.classifier} · Snuffer T${save.equipment.ownedTiers.snuffer}`,
          `${methodLabel(save.fieldwork.method)} in hand · ${save.fieldwork.claims.length} claim${save.fieldwork.claims.length === 1 ? '' : 's'}`,
          'Press E on a gold ring. Press F in the creek to count colors. J is the journal.',
        ]);
      }
      if (overlays.current() === 'journal') {
        overlays.setJournal(journalLines(save));
      }

      let vendorOverlay: ReturnType<typeof buildVendorOverlay> | null = null;
      if (activeVendor) {
        vendorOverlay = buildVendorOverlay(
          activeVendor,
          save.inventory.carry.gold,
          townQuote(
            save.economy.spotPrice.current,
            save.fieldwork.townBias,
            weather.getView().state,
            getSkyHour(worldTime),
          ),
        );
      }

      let storeOverlay: HudUpdate['store'] = null;
      if (storeOpen) {
        storeOverlay = {
          rows: buildListings(save).map((row) => ({
            category: row.id,
            displayName: row.displayName,
            ownedTier: 0,
            ownedLabel: row.ownedLabel,
            nextLabel: row.nextLabel,
            nextCost: row.nextCost,
            affordable: row.affordable,
            questGated: row.questGated,
          })),
          selectedIndex: storeSelectionIdx,
          walletBalance: save.wallet.balance,
        };
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
        prompt: shownPrompt,
        guide,
        toolsLabel: `${methodLabel(save.fieldwork.method)} · Shovel T${save.equipment.ownedTiers.shovel} · Pan T${save.equipment.ownedTiers.pan}`,
        vendor: vendorOverlay,
        store: storeOverlay,
        dialogue: dialogueOverlay,
        questTracker,
        prospect: prospect.getSnapshot(),
      });
      publishProbe();
    },
    render: () => {
      renderer.render();
      presentedFrames += 1;
      if (presentedFrames === 2) spawnGrass();
      frameLuma = samplePresentedLuma(renderer.renderer);
      if (window.__themHills) window.__themHills.frameLuma = frameLuma;
    },
  });
  publishProbe();

  await reportBoot(90, 'Compiling the view…');
  if (skipIntro) {
    overlays.hide();
  } else {
    overlays.showTitle(() => {
      simRunning = true;
      overlays.hide();
      void Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
    });
  }
  loop.start();

  // ---- Persistence ----
  const freezeSave = params.get('freezeSave') === '1';
  if (!freezeSave) {
    const autosaveTimer = window.setInterval(() => {
      saveCurrentState(buildSaveSnapshot()).catch((e) => console.error('[save] autosave failed', e));
    }, 60_000);

    window.addEventListener('beforeunload', () => {
      window.clearInterval(autosaveTimer);
      saveCurrentState(buildSaveSnapshot()).catch(() => undefined);
    });
  }

  console.log('[bootstrap] Them Hills ready (overhaul phase 1 — lighting pipeline)');
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
function samplePresentedLuma(renderer: THREE.WebGLRenderer): number {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  if (w < 4 || h < 4) return 0;
  const px = new Uint8Array(4);
  let max = 0;
  const samples: ReadonlyArray<readonly [number, number]> = [
    [0.5, 0.72],
    [0.5, 0.5],
    [0.28, 0.4],
    [0.72, 0.4],
    [0.5, 0.22],
  ];
  for (const [u, v] of samples) {
    gl.readPixels(
      Math.floor(u * (w - 1)),
      Math.floor(v * (h - 1)),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      px,
    );
    max = Math.max(max, (px[0] ?? 0) + (px[1] ?? 0) + (px[2] ?? 0));
  }
  return max / 3;
}

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
