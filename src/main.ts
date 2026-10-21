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
import { buildWatercourses, courseById, nearestWaterPoint } from '@/game/watercourse';
import {
  createWaterReflection,
  markSceneReflections,
  markTreeMirror,
  reflectionUniforms,
  skipReflection,
} from '@/render/reflection';
import { dressTown, seatBarrels, updateTownDressing, updateTownLights } from '@/game/structures';
import { bearingFromYaw, createCameraRig } from '@/game/camera-rig';
import { createCamp } from '@/game/camp';
import { createCharacter } from '@/game/character';
import {
  ADA_DIALOGUE,
  FIRE_DIALOGUE,
  INNKEEPER_DIALOGUE,
  JUMPER_DIALOGUE,
  OLD_PETE_DIALOGUE,
  SILAS_DIALOGUE,
  getCurrentNode,
  resolveBody,
  resolveOptions,
  startDialogue,
  type DialogueSession,
} from '@/game/dialogue';
import { applyArcAction, bankOre, placerEventFactor, tickArc, timberInPlace } from '@/game/campaign';
import { createTownArc } from '@/game/town-arc';
import { createWorldDress } from '@/game/world-dress';
import {
  digDrift,
  driftBuried,
  driftClock,
  driftKeepOut,
  driftNearFall,
  driftPhase,
  frameDriftInterior,
  frameDriftShow,
  frameDriftWalk,
  pinDrift,
  playDriftBlast,
  playDriftCaveIn,
  setDriftBearer,
  setDriftFuse,
  updateNorthLode,
} from '@/game/north-lode';
import { frameBudget, noteFrameTime } from '@/engine/frame-budget';
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
import {
  prepareImpostors,
  scatterAssets,
  scatterLogs,
  fadeFoliageNear,
  setScatterDensity,
  updateScatterWind,
} from '@/game/scatter';
import { createMotes } from '@/game/motes';
import { createLightShafts } from '@/game/shafts';
import { emitGameplay, bindGameplayAudio, onGameplay } from '@/game/events';
import { createClaimMarkers } from '@/game/claim-markers';
import { createCrew } from '@/game/crew';
import { createGeologyMarks } from '@/game/geology-marks';
import { readGround, richestPlacer, stakeable, type BoulderPoint } from '@/game/geology';
import {
  bestCamp,
  buildListings,
  claimYieldFactor,
  creekYieldFactor,
  journalLines,
  lodeYieldFactor,
  methodLabel,
  openingGuide,
  townQuote,
} from '@/game/fieldwork';
import { createPlacedMachines, layout, workStance, type MachineKind } from '@/game/machines/placed';
import {
  SKY_SECONDS_PER_DAY,
  createSkyController,
  formatClock,
  getSkyHour,
  worldTimeForSkyHour,
} from '@/game/sky';
import {
  createStream,
  createStreamRegistry,
  syncWaterMatrices,
  type PanningSite,
  type StreamConfig,
} from '@/game/stream';
import { CAMP_REST_TIME_ADVANCE, comfortFor } from '@/game/survival';
import { createTerrain } from '@/game/terrain';
import { createWeatherController } from '@/game/weather';
import { createVendors, type Vendor } from '@/game/vendor';
import { createCameraModeController, frameToolShot } from '@/engine/camera-modes';
import { createGameLoop } from '@/engine/loop';
import { createRenderer } from '@/engine/renderer';
import { createInputManager } from '@/input/manager';
import { createPhysicsWorld, RAPIER } from '@/physics/world';
import {
  deleteSave,
  describeManualSlots,
  initSaveSystem,
  loadSlot,
  saveCurrentState,
  saveToSlot,
} from '@/save/store';
import type { SaveV1, SettingsState } from '@/save/schema';
import { createDefaultSave } from '@/save/schema';
import type { ActionId } from '@/input/actions';
import { gameStore } from '@/state/store';
import { mountHud, type HudUpdate } from '@/ui/hud';
import { mountMinimap, type MinimapLandmark, type MinimapStream } from '@/ui/minimap';
import { createSettingsPanel } from '@/ui/settings';
import { defaultSettings } from '@/save/schema';
import { attachGameplayCues } from '@/audio/cues';
import { createAudioSystem } from '@/audio/system';
import {
  glRendererString,
  getQualityName,
  initQuality,
  QUALITY_PRESETS,
  RENDER_QUALITY,
  setQuality,
} from '@/engine/quality';
import {
  getReviewPose,
  readReviewOverride,
  reviewShot,
  reviewWorldTime,
  setReviewPose,
} from '@/dev/review-shots';
import { createCreekProbe } from '@/render/creek-probe';
import { pulseGold, setFoliageWindTime } from '@/render/painterly';
import { createSmokePilot } from '@/dev/smoke-pilot';
import { mountOverlays, reportBoot } from '@/ui/overlays';
import { presentProspectFind, presentToolImpact } from '@/game/presentation';

/** Planar mirror size. The cube probe is what the water actually samples for trees. */
function mirrorBudget(softwareGl: boolean): { size: number; stride: number } {
  if (!softwareGl) return { size: 288, stride: 1 };
  if (RENDER_QUALITY.ao) return { size: 128, stride: 3 };
  if (RENDER_QUALITY.godrays) return { size: 144, stride: 2 };
  return { size: 112, stride: 4 };
}

/** Cube of the banks. Software updates it a face-set at a time so the frame returns. */
function probeBudget(softwareGl: boolean): { size: number; stride: number } {
  if (!softwareGl) return { size: 96, stride: 2 };
  if (RENDER_QUALITY.ao) return { size: 64, stride: 4 };
  if (RENDER_QUALITY.godrays) return { size: 96, stride: 4 };
  return { size: 48, stride: 5 };
}

async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) document.body.dataset.debug = '1';
  const skipIntro = params.get('smoke') === '1' || params.has('shot') || params.has('hour');
  if (skipIntro || params.has('freezeSave')) document.body.dataset.capture = '1';
  await reportBoot(6, 'Checking your claim…');

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const hudEl = document.getElementById('hud') as HTMLElement | null;
  if (!canvas || !hudEl) {
    throw new Error('[bootstrap] required DOM nodes missing');
  }

  // ---- Save system ----
  await initSaveSystem();
  const loadedReport = await loadSlot('continue');
  const loaded = loadedReport.save;
  const bootNotice = loadedReport.recovered
    ? 'The claim book was torn. The last good page is restored.'
    : loadedReport.corrupt
      ? 'The claim book could not be read. A fresh page is open.'
      : null;
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
  skipReflection(motes.points);
  const shafts = createLightShafts();
  renderer.scene.add(shafts.group);
  skipReflection(shafts.group);

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
  const courses = buildWatercourses();

  await reportBoot(28, 'Shaping the ground…');

  // ---- Terrain ----
  const terrain = createTerrain(physics.rapier, courses);
  renderer.scene.add(terrain.mesh);

  // ---- Streams + sites ----
  const streamList = STREAM_CONFIGS.map((cfg) =>
    createStream(terrain, cfg, courseById(courses, cfg.id)),
  );
  const waterReflection = createWaterReflection();
  const creekProbe = createCreekProbe();
  const softwareGl = /swiftshader|llvmpipe|softpipe/i.test(
    glRendererString(renderer.renderer.getContext()),
  );
  // Trees only, and only while reflections are on. The full scene filled the
  // target with meadow and blew the medium budget. The water falls back to
  // the screen-space horizon flip when this target is empty.
  const mirror = mirrorBudget(softwareGl);
  waterReflection.setSize(mirror.size);
  waterReflection.setStride(mirror.stride);
  waterReflection.setTreesOnly(true);
  waterReflection.setEnabled(RENDER_QUALITY.reflections);
  const probe = probeBudget(softwareGl);
  creekProbe.setSize(probe.size);
  creekProbe.setStride(probe.stride);
  creekProbe.setEnabled(RENDER_QUALITY.reflections);
  for (const s of streamList) {
    skipReflection(s.group);
    renderer.scene.add(s.group);
  }
  const streams = createStreamRegistry(streamList);
  const worldDress = createWorldDress(renderer.scene, courses, (x, z) => terrain.getHeightAt(x, z));
  let waterStageKey = '';

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
      count: QUALITY_PRESETS.ultra.grassTall,
      extent: 95,
      reject: (x, z) => streams.isInStreamZone(x, z, 0.5),
      seed: 0xa9,
      baseColor: { r: [0.22, 0.32], g: [0.28, 0.36], b: [0.08, 0.12] },
      tipColor: { r: [0.82, 0.94], g: [0.68, 0.8], b: [0.22, 0.32] },
    });
    renderer.scene.add(grass.mesh);
    grass.setCount(RENDER_QUALITY.grassTall);
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
  const townArc = createTownArc(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

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
    courses,
    minePositions: mines.map((m) => m.position),
    seed: 0xb0,
  });
  markTreeMirror(boulders.group);
  for (const s of streamList) {
    s.setRocks(boulders.wakes.filter((w) => w.streamId === s.id).map((w) => w.rock));
  }
  dressTown(renderer.scene, (x, z) => terrain.getHeightAt(x, z));
  seatBarrels(renderer.scene, (x, z) => terrain.getHeightAt(x, z));
  console.log(`[boulders] placed ${boulders.count} boulders`);
  const boulderPoints: BoulderPoint[] = boulders.colliders.map((c) => ({
    x: c.pos.x,
    z: c.pos.z,
    r: c.radius,
  }));
  const claimMarkers = createClaimMarkers(renderer.scene);
  const geologyMarks = createGeologyMarks(
    renderer.scene,
    STREAM_CONFIGS,
    boulderPoints,
    (x, z) => terrain.getHeightAt(x, z),
    (splats) => terrain.setPayStreaks(splats),
  );
  const placedMachines = createPlacedMachines(renderer.scene, courses);
  const crew = createCrew(renderer.scene);
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
  const COYOTE = courseById(courses, 'coyote_creek');
  const ultraScatter = QUALITY_PRESETS.ultra.scatter;
  setScatterDensity(RENDER_QUALITY.scatter / ultraScatter);
  const scatterBudget = (n: number): number => Math.round(n * ultraScatter);

  prepareImpostors(renderer.renderer);
  const populate = Promise.all([
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: scatterBudget(140),
        lod: 'tree',
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
        count: scatterBudget(70),
        lod: 'rock',
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
        count: scatterBudget(40),
        lod: 'rock',
        models: [...ASSETS.rocks.pebbleRound, ...ASSETS.rocks.pebbleSquare],
        scale: { min: 0.5, max: 1.1 },
        yOffset: -0.02,
        sampleXZ: (rng) => {
          const sample = COYOTE.at(rng.next());
          const sideSign = rng.next() < 0.5 ? -1 : 1;
          const cross = sideSign * (sample.halfWidth + rng.range(0.5, 2.2));
          return {
            x: sample.x + -sample.tz * cross,
            z: sample.z + sample.tx * cross,
          };
        },
      },
      0xa3,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: scatterBudget(220),
        lod: 'brush',
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
        count: scatterBudget(120),
        lod: 'brush',
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
        count: scatterBudget(110),
        models: [...ASSETS.vegetation.flowers, ...ASSETS.vegetation.mushrooms],
        scale: { min: 0.7, max: 1.3 },
        reject,
        exclusionRadius: (s) => 0.3 * s,
      },
      0xa6,
    ),
  ]);
  const fallenLogs = scatterLogs(renderer.scene, terrain, scatterBudget(32), reject, 0xa7);
  populate
    .then((results) => {
      const total = results.reduce((sum, r) => sum + r.placed, 0) + fallenLogs.placed;
      console.log(`[scatter] environment populated (${total} instances)`);

      // Build a spatial grid of every scatter placement and create the
      // ground-cover grass layer that fills *between* the megakit detail.
      const allPositions = results.flatMap((r) => r.positions).concat(fallenLogs.positions);
      const exclusion = buildExclusionGrid(allPositions);
      const grassCover = createGrassField(terrain, {
        count: QUALITY_PRESETS.ultra.grassCover,
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
      grassCover.setCount(RENDER_QUALITY.grassCover);
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
  skipReflection(character.group);
  const faceFill = new THREE.PointLight(0xfff3e2, 0, 2.4, 2);
  faceFill.name = 'face-fill';
  const faceRim = new THREE.PointLight(0xb7c6de, 0, 2.2, 2);
  faceRim.name = 'face-rim';
  renderer.scene.add(faceFill, faceRim);
  const faceLook = new THREE.Vector3();
  const faceBehind = new THREE.Vector3();

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
  if (review?.free) cameraRig.setAvoidance(false);
  const chaseFov = renderer.camera.fov;
  let reviewingTool = false;

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
  onGameplay('blast', (payload) => {
    const north = mines.find((mine) => mine.id === 'mine_north');
    if (north) playDriftBlast(north.group, false);
    if (payload.charges > 0) {
      fx.kickFov(8, 0.7);
      fx.rumble(220, 0.45, 0.85);
    }
  });
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
  attachGameplayCues(audio);
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
  let storePick: number | null = null;
  let dialoguePick: number | null = null;
  let vendorClick = false;
  const hud = mountHud(hudEl, {
    onStoreRow: (index) => {
      storePick = index;
    },
    onDialogueOption: (index) => {
      dialoguePick = index;
    },
    onVendorConfirm: () => {
      vendorClick = true;
    },
    onToolbar: (id) => {
      if (!simRunning || prospect.isActive() || activeVendor || storeOpen || dialogue) return;
      if (id === 'settings') settings.open();
      else overlays.toggle(id);
    },
  });

  // ---- Mini-map ----
  // Landmark positions are pulled from each system's known anchor; if any
  // of these later become configurable, this list should be derived from
  // them rather than re-typed.
  const minimapStreams: MinimapStream[] = STREAM_CONFIGS.map((s) => {
    const course = courseById(courses, s.id);
    const points = course.samples.filter((_, i) => i % 3 === 0).map((p) => ({ x: p.x, z: p.z }));
    return {
      centerX: s.centerX,
      centerZ: s.centerZ,
      halfWidth: s.halfWidth,
      halfLength: s.halfLength,
      orientation: s.orientation,
      color: `#${(s.shallowColor ?? 0x9bd1d8).toString(16).padStart(6, '0')}`,
      points,
    };
  });
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
  audio.setMusicVolume(initialSettings.audio.music ?? 0.85);
  audio.setAmbientVolume(initialSettings.audio.ambient);
  audio.setSfxVolume(initialSettings.audio.sfx);
  input.setMouseSensitivityMultiplier(initialSettings.look.mouseSensitivity);
  input.setInvertY(initialSettings.look.invertY === true);
  for (const [action, code] of Object.entries(initialSettings.bindings ?? {})) {
    if (code) input.setKeyboardBinding(action as ActionId, code);
  }
  applyReading(initialSettings);
  if (initialSettings.graphics.preset) setQuality(initialSettings.graphics.preset);
  renderer.camera.fov = initialSettings.graphics.fovDegrees;
  renderer.camera.updateProjectionMatrix();
  renderer.renderer.shadowMap.enabled = initialSettings.graphics.shadowsEnabled;
  renderer.sun.castShadow = initialSettings.graphics.shadowsEnabled;

  const settings = createSettingsPanel({
    initial: {
      ...initialSettings,
      graphics: {
        ...initialSettings.graphics,
        preset: initialSettings.graphics.preset ?? getQualityName(),
      },
    },
    updateSetting: (key, patch) => gameStore.getState().updateSettingsSlice(key, patch),
    setSettings: (patch) => gameStore.getState().setSettings(patch),
    apply: {
      masterVolume: (v) => audio.setMasterVolume(v),
      musicVolume: (v) => audio.setMusicVolume(v),
      ambientVolume: (v) => audio.setAmbientVolume(v),
      sfxVolume: (v) => audio.setSfxVolume(v),
      mouseSensitivity: (v) => input.setMouseSensitivityMultiplier(v),
      invertY: (v) => input.setInvertY(v),
      fov: (v) => {
        renderer.camera.fov = v;
        renderer.camera.updateProjectionMatrix();
      },
      shadowsEnabled: (v) => {
        renderer.renderer.shadowMap.enabled = v;
        renderer.sun.castShadow = v;
      },
      quality: (name) => {
        setQuality(name);
        publishProbe();
        requestAnimationFrame(() => {
          renderer.applyGraphics();
          const mirrorMenu = mirrorBudget(softwareGl);
          waterReflection.setSize(mirrorMenu.size);
          waterReflection.setStride(mirrorMenu.stride);
          waterReflection.setTreesOnly(true);
          waterReflection.setEnabled(RENDER_QUALITY.reflections);
          const probeMenu = probeBudget(softwareGl);
          creekProbe.setSize(probeMenu.size);
          creekProbe.setStride(probeMenu.stride);
          creekProbe.setEnabled(RENDER_QUALITY.reflections);
          setScatterDensity(RENDER_QUALITY.scatter / QUALITY_PRESETS.ultra.scatter);
          grass?.setCount(RENDER_QUALITY.grassTall);
          for (const cover of grassCovers) cover.setCount(RENDER_QUALITY.grassCover);
          motes.resize();
        });
      },
      textScale: (v) => applyReading({ ...gameStore.getState().save.settings, textScale: v }),
      subtitles: (v) => applyReading({ ...gameStore.getState().save.settings, subtitles: v }),
      colorblind: (v) => applyReading({ ...gameStore.getState().save.settings, colorblind: v }),
      binding: (action, code) => input.setKeyboardBinding(action, code),
    },
  });

  function applyReading(next: SettingsState): void {
    document.documentElement.style.setProperty('--text-scale', String(next.textScale ?? 1));
    document.documentElement.dataset.subtitles = next.subtitles ? '1' : '0';
    if (next.colorblind) document.documentElement.dataset.colorblind = '1';
    else delete document.documentElement.dataset.colorblind;
  }

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
  let padMenuX = 0;
  let padMenuY = 0;
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
  let drawCalls = 0;
  let triangles = 0;
  let frameMs = 0;
  let blackRatio = 1;
  let wantBlack = false;
  let interiorShot = params.get('shot') === 'lode';
  let driftLit = false;
  let waterRise = 0;
  let holdView: { x: number; y: number; z: number; lx: number; ly: number; lz: number } | null = null;
  let foliageLook: THREE.Vector3 | null = null;
  const viewFrustum = new THREE.Frustum();
  const viewProj = new THREE.Matrix4();
  const viewBox = new THREE.Box3();
  const viewInstance = new THREE.Matrix4();
  const viewLocal = new THREE.Box3();

  function shownInScene(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  }

  function drawsInScene(obj: THREE.Object3D): boolean {
    const mat = (obj as THREE.Mesh).material;
    if (!mat) return true;
    const list = Array.isArray(mat) ? mat : [mat];
    return list.some((entry) => entry.visible !== false && !(entry.transparent && entry.opacity <= 0.04));
  }

  function expandViewBox(obj: THREE.Object3D, target: THREE.Box3): boolean {
    target.makeEmpty();
    if (!shownInScene(obj) || !drawsInScene(obj)) return false;
    if (obj instanceof THREE.InstancedMesh) {
      if (obj.count <= 0) return false;
      const geom = obj.geometry;
      if (!geom.boundingBox) geom.computeBoundingBox();
      const local = geom.boundingBox;
      if (!local) return false;
      obj.updateWorldMatrix(true, false);
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, viewInstance);
        viewLocal.copy(local).applyMatrix4(viewInstance);
        target.union(viewLocal);
      }
      target.applyMatrix4(obj.matrixWorld);
      return !target.isEmpty();
    }
    if (obj instanceof THREE.Points) {
      const attr = obj.geometry.getAttribute('position');
      if (!attr || attr.count === 0) return false;
      obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingBox) return false;
      obj.updateWorldMatrix(true, false);
      target.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
      return !target.isEmpty();
    }
    obj.updateWorldMatrix(true, true);
    target.setFromObject(obj);
    return !target.isEmpty();
  }

  function meshesInView(names: readonly string[]): { present: string[]; missing: string[] } {
    renderer.camera.updateMatrixWorld();
    viewProj.multiplyMatrices(renderer.camera.projectionMatrix, renderer.camera.matrixWorldInverse);
    viewFrustum.setFromProjectionMatrix(viewProj);
    const present: string[] = [];
    const wanted = new Set(names);
    renderer.scene.traverse((obj) => {
      if (!wanted.has(obj.name)) return;
      if (!expandViewBox(obj, viewBox)) return;
      if (viewFrustum.intersectsBox(viewBox)) present.push(obj.name);
    });
    return { present, missing: names.filter((name) => !present.includes(name)) };
  }

  function shedView(distance: number): { x: number; y: number; z: number; lx: number; ly: number; lz: number } {
    const p = townArc.firePos;
    return {
      x: p.x + 1.4,
      y: p.y + 3.3,
      z: p.z + distance,
      lx: p.x - 0.2,
      ly: p.y + 2.7,
      lz: p.z,
    };
  }

  function rushView(): { x: number; y: number; z: number; lx: number; ly: number; lz: number } {
    // South of the A-frames, at canvas height, looking north into the faces.
    // The general store sits at z=-3, behind this camera.
    return {
      x: 2.0,
      y: terrain.getHeightAt(2.0, 16.2) + 1.45,
      z: 16.2,
      lx: 0.6,
      ly: terrain.getHeightAt(0.6, 22.5) + 1.55,
      lz: 22.5,
    };
  }

  function creekView(): { x: number; y: number; z: number; lx: number; ly: number; lz: number } {
    const y = terrain.getHeightAt(24, 8);
    return { x: 32, y: y + 7.5, z: 18, lx: 24, ly: y + 0.25, lz: 6 };
  }

  function townWideView(): { x: number; y: number; z: number; lx: number; ly: number; lz: number } {
    const x = 42;
    const z = 34;
    const lx = -14;
    const lz = 10;
    return {
      x,
      y: terrain.getHeightAt(x, z) + 22,
      z,
      lx,
      ly: terrain.getHeightAt(lx, lz) + 4,
      lz,
    };
  }

  const sceneRay = new THREE.Raycaster();
  const fanForward = new THREE.Vector3();
  const fanRight = new THREE.Vector3();
  const fanUp = new THREE.Vector3();
  const fanDir = new THREE.Vector3();
  const occluderSkip = /atmosphere|water_|terrain|grass|drift-|shaft-|guide-|fire-smoke|fire-ember|fire-flame|gravel|sky|rush-tent|stamp-mill|fire-shed|company-wagon/i;
  let occluderRoots: THREE.Object3D[] | null = null;

  function solidOccluder(obj: THREE.Object3D): boolean {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.InstancedMesh)) return false;
    let node: THREE.Object3D | null = obj;
    while (node) {
      if (occluderSkip.test(node.name)) return false;
      node = node.parent;
    }
    const mat = (obj as THREE.Mesh).material;
    const list = Array.isArray(mat) ? mat : [mat];
    if (list.some((entry) => entry?.transparent && (entry.opacity ?? 1) < 0.4)) return false;
    return true;
  }

  function occluders(): THREE.Object3D[] {
    if (occluderRoots && occluderRoots.length > 0) return occluderRoots;
    const found: THREE.Object3D[] = [];
    renderer.scene.traverse((obj) => {
      if (obj.name.startsWith('scatter:') || obj.name === 'scatter-logs' || obj.name === 'boulders') found.push(obj);
    });
    occluderRoots = found;
    return found;
  }

  function subjectBlocked(cam: THREE.Vector3, subjects: readonly THREE.Vector3[]): boolean {
    const roots = occluders();
    if (roots.length === 0) return false;
    for (const subject of subjects) {
      fanDir.copy(subject).sub(cam);
      const dist = fanDir.length();
      if (dist < 0.4) continue;
      fanDir.multiplyScalar(1 / dist);
      sceneRay.set(cam, fanDir);
      sceneRay.near = 0.2;
      sceneRay.far = Math.max(0.3, dist - 0.45);
      const hits = sceneRay.intersectObjects(roots, true);
      if (hits.some((hit) => solidOccluder(hit.object))) return true;
    }
    return false;
  }

  /** How many of the central view rays hit a tree, brush, or boulder. */
  function viewClutter(cam: THREE.Vector3, look: THREE.Vector3): number {
    const roots = occluders();
    if (roots.length === 0) return 0;
    fanForward.copy(look).sub(cam);
    const dist = fanForward.length();
    if (dist < 0.5) return 0;
    fanForward.multiplyScalar(1 / dist);
    fanRight.crossVectors(fanForward, fanUp.set(0, 1, 0));
    if (fanRight.lengthSq() < 1e-6) fanRight.set(1, 0, 0);
    fanRight.normalize();
    fanUp.crossVectors(fanRight, fanForward).normalize();
    const offsets: readonly [number, number][] = [
      [0, 0.04],
      [-0.32, 0.1],
      [0.32, 0.1],
      [-0.18, 0.24],
      [0.18, 0.24],
    ];
    let hits = 0;
    for (const [ox, oy] of offsets) {
      fanDir.copy(fanForward).addScaledVector(fanRight, ox).addScaledVector(fanUp, oy).normalize();
      sceneRay.set(cam, fanDir);
      sceneRay.near = 0.15;
      sceneRay.far = 12;
      const hit = sceneRay.intersectObjects(roots, true).find((entry) => solidOccluder(entry.object));
      if (hit) hits++;
    }
    return hits;
  }

  /**
   * Slide a scene camera until each subject is clear and the middle of the
   * frame is not a tree or a boulder. Foliage against the lens still fades.
   */
  function clearSceneCamera(
    cam: THREE.Vector3,
    look: THREE.Vector3,
    subjects: readonly THREE.Vector3[],
    accept?: (pos: THREE.Vector3) => boolean,
  ): void {
    const base = cam.clone().sub(look);
    const planar = Math.max(0.5, Math.hypot(base.x, base.z));
    const yaw0 = Math.atan2(base.x, base.z);
    const height = base.y;
    let best: THREE.Vector3 | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 17; step++) {
      const side = step === 0 ? 0 : (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2);
      const pull = 1 + Math.floor(Math.abs(side) / 3) * 0.22;
      const yaw = yaw0 + side * 0.16;
      const pos = new THREE.Vector3(
        look.x + Math.sin(yaw) * planar * pull,
        look.y + height + Math.abs(side) * 0.45,
        look.z + Math.cos(yaw) * planar * pull,
      );
      pos.y = Math.max(pos.y, terrain.getHeightAt(pos.x, pos.z) + 1.5);
      if (accept && !accept(pos)) continue;
      if (subjects.some((subject) => subject.distanceTo(pos) < 2.6)) continue;
      const blocked = subjectBlocked(pos, subjects);
      const clutter = viewClutter(pos, look);
      const score = (blocked ? 20 : 0) + clutter;
      if (score < bestScore) {
        bestScore = score;
        best = pos.clone();
        if (score === 0) break;
      }
    }
    if (best) cam.copy(best);
  }
  let arcBanner: string | null = null;
  let arcStatusLine: string | null = null;
  const playtestLock = params.has('smoke') || params.has('shot') || params.has('freezeSave');

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
      drawCalls,
      triangles,
      frameMs,
      frameBudget: frameBudget(),
      peakCarryGrams: view.peakCarryGrams,
      save: async () => {
        await saveCurrentState(buildSaveSnapshot());
        publishProbe();
      },
      graphics: getQualityName(),
      mirrorMode: reflectionUniforms.uMirrorMode.value,
      mirrorHorizon: reflectionUniforms.uHorizon.value,
      saveVersion: save.version,
      panTier: save.equipment.ownedTiers.pan,
      claimCount: save.fieldwork.claims.length,
      geologyMarks: geologyMarks.counts().marks,
      sampleHoles: geologyMarks.counts().holes,
      machineCount: placedMachines.list().length,
      activeViz: prospect.getSnapshot()?.viz?.kind ?? null,
      playerPose: character.getPose(),
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
      upgradeCost: (category: string) => {
        const cat = category as EquipmentCategory;
        const ownedTier = gameStore.getState().save.equipment.ownedTiers[cat];
        return getNextUpgrade(cat, ownedTier)?.cost ?? null;
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
      prepareShowcase: () => {
        const snap = gameStore.getState().serialize();
        snap.wallet = { ...snap.wallet, balance: Math.max(snap.wallet.balance, 4000) };
        snap.equipment = {
          ...snap.equipment,
          ownedTiers: {
            ...snap.equipment.ownedTiers,
            rocker: 1,
            sluice: 2,
            longTom: 1,
            hydraulic: 1,
          },
        };
        const heard = snap.fieldwork.rumorsHeard.includes('lesson')
          ? snap.fieldwork.rumorsHeard
          : [...snap.fieldwork.rumorsHeard, 'lesson'];
        snap.fieldwork = {
          ...snap.fieldwork,
          hands: Math.max(1, snap.fieldwork.hands),
          rumorsHeard: heard,
          samples:
            snap.fieldwork.samples.length > 0
              ? snap.fieldwork.samples
              : [
                  {
                    id: 'showcase-sample',
                    streamId: 'coyote_creek',
                    x: 18,
                    z: -40,
                    habitat: 'inside_bend',
                    colors: 8,
                    gameTime: worldTime,
                  },
                ],
        };
        snap.progression = {
          ...snap.progression,
          firstSaleCompleted: true,
          tutorialCompleted: true,
          stats: {
            ...snap.progression.stats,
            totalPansPerformed: Math.max(1, snap.progression.stats.totalPansPerformed),
          },
        };
        gameStore.getState().hydrate(snap);
        if (!gameStore.getState().save.fieldwork.claims.some((c) => c.kind === 'placer')) {
          const spot = richestPlacer(STREAM_CONFIGS, snap.fieldwork.payShift, boulderPoints);
          gameStore.getState().stakePlacer(spot.x, spot.z, spot.read, worldTime);
        }
        const claim = gameStore.getState().save.fieldwork.claims.find((c) => c.kind === 'placer');
        return { x: claim?.x ?? 0, z: claim?.z ?? 0 };
      },
      startMachine: (kind: string) => {
        const allowed: MachineKind[] = ['rocker', 'sluice', 'longtom', 'monitor'];
        if (!allowed.includes(kind as MachineKind)) return false;
        character.group.visible = true;
        const machineKind = kind as MachineKind;
        const saveNow = gameStore.getState().save;
        const claim = saveNow.fieldwork.claims.find((c) => c.kind === 'placer');
        if (!claim) return false;
        if (prospect.isActive()) prospect.cancel();
        standAtMachine(machineKind);
        const method =
          machineKind === 'longtom'
            ? 'long_tom'
            : machineKind === 'monitor'
              ? 'hydraulic'
              : machineKind;
        return prospect.start({
          siteId: `machine:${machineKind}:${claim.id}`,
          context: 'panning',
          digsRemaining: 8,
          maxDigs: 8,
          actionCount: saveNow.progression.stats.totalPansPerformed + 1,
          firstEver: false,
          yieldMultiplier: 1,
          toolTiers: saveNow.equipment.ownedTiers,
          method,
          tutorial: false,
          asPick: false,
        });
      },
      cancelProspect: () => {
        prospect.cancel();
      },
      lookAt: (x: number, z: number) => {
        const machines = layout(gameStore.getState().save, courses);
        const focus = machines.find((m) => m.kind === 'sluice') ?? machines[0];
        const fx = focus ? -Math.sin(focus.yaw) : 0;
        const fz = focus ? -Math.cos(focus.yaw) : 1;
        const px = focus ? focus.x - fx * 6.2 + -fz * 2.6 : x;
        const pz = focus ? focus.z - fz * 6.2 + fx * 2.6 : z;
        const y = terrain.getHeightAt(px, pz) + 0.95;
        character.placeAt(px, y, pz);
        const yaw = Math.atan2(px - (focus?.x ?? x), pz - (focus?.z ?? z));
        character.setYaw(yaw);
        cameraRig.setAvoidance(false);
        cameraRig.setYawPitch(yaw, -0.32);
        cameraRig.setArmLength(5.6);
        worldTime = worldTimeForSkyHour(15.2);
      },
      spawnJumper: () => {
        const saveNow = gameStore.getState().serialize();
        const claim = saveNow.fieldwork.claims.find((c) => c.kind === 'placer');
        if (!claim) return false;
        claim.jumperSince = worldTime;
        gameStore.getState().hydrate(saveNow);
        const machine =
          layout(saveNow, courses).find((m) => m.kind === 'rocker') ?? layout(saveNow, courses)[0];
        if (machine) {
          const fx = -Math.sin(machine.yaw);
          const fz = -Math.cos(machine.yaw);
          // The chase camera looks at the prospector. Stand him on the jumper
          // and hide him so the mid-shot is the jumper's face, not his back.
          const px = machine.x - fx * 0.75;
          const pz = machine.z - fz * 0.75;
          character.placeAt(px, terrain.getHeightAt(px, pz) + 0.95, pz);
          character.setYaw(machine.yaw);
          character.group.visible = false;
          cameraRig.setAvoidance(false);
          cameraRig.setArmLength(5.2);
          cameraRig.setYawPitch(machine.yaw + 0.62, 0.16);
        }
        return true;
      },
      framePose: (yaw: number, pitch: number, arm: number) => {
        cameraRig.setAvoidance(false);
        cameraRig.setYawPitch(yaw, pitch);
        cameraRig.setArmLength(arm);
      },
      applyShot: (name: string) => {
        const shot = reviewShot(name);
        if (!shot) return false;
        interiorShot = name === 'lode';
        holdView = null;
        character.group.visible = true;
        const y = terrain.getHeightAt(shot.x, shot.z) + 1.5;
        character.placeAt(shot.x, y, shot.z);
        if (shot.pose === 'dig' || shot.pose === 'pan') character.setYaw(shot.yaw);
        cameraRig.setAvoidance(!shot.free);
        cameraRig.setYawPitch(shot.yaw, shot.pitch);
        cameraRig.setArmLength(shot.arm);
        setReviewPose(shot.pose);
        worldTime = reviewWorldTime(shot.hour);
        return true;
      },
      previewScene: (who: string) => {
        const north = mines.find((mine) => mine.id === 'mine_north');
        const hideHero = who === 'blast' || who === 'cavein';
        character.group.visible = !hideHero;
        interiorShot = who === 'blast' || who === 'cavein' || who === 'lode';
        holdView = null;
        if (who !== 'silas' && who !== 'ada' && who !== 'pete' && who !== 'fire') dialogue = null;
        if (who === 'blast' && north) {
          playDriftBlast(north.group, true);
          return true;
        }
        if (who === 'fuse' && north) {
          playDriftBlast(north.group, true);
          pinDrift(north.group, 'fuse', 0.8);
          return true;
        }
        if (who === 'flash' && north) {
          playDriftBlast(north.group, false);
          pinDrift(north.group, 'blast', 0.22);
          return true;
        }
        if (who === 'ore' && north) {
          playDriftBlast(north.group, false);
          pinDrift(north.group, 'blast', 2.15);
          return true;
        }
        if (who === 'cavein' && north) {
          playDriftCaveIn(north.group);
          return true;
        }
        if (who === 'fall' && north) {
          playDriftCaveIn(north.group);
          pinDrift(north.group, 'cave', 0.55);
          return true;
        }
        if (who === 'dig' && north) {
          digDrift(north.group);
          return true;
        }
        if (who === 'quench') {
          const snap = gameStore.getState().serialize();
          snap.world = {
            ...snap.world,
            event: { id: 'calm', startedAt: worldTime, until: worldTime, stamp: worldTime },
          };
          gameStore.getState().hydrate(snap);
          townArc.quench();
          arcBanner = null;
          holdView = shedView(6.4);
          return true;
        }
        const scriptEvent = (id: 'flood' | 'drought' | 'rush' | 'fire') => {
          const snap = gameStore.getState().serialize();
          snap.world = {
            ...snap.world,
            event: { id, startedAt: worldTime, until: worldTime + 900, stamp: worldTime },
          };
          gameStore.getState().hydrate(snap);
        };
        if (who === 'pete') {
          dialogue = startDialogue('old_pete', OLD_PETE_DIALOGUE);
          dialogue.currentNodeId = 'vein';
          const y = terrain.getHeightAt(-1.5, 6.4);
          character.placeAt(-1.5, y + 0.2, 6.4);
          character.setYaw(Math.PI);
        } else if (who === 'silas') {
          dialogue = startDialogue('silas', SILAS_DIALOGUE);
          const y = terrain.getHeightAt(townArc.millPos.x + 2.2, townArc.millPos.z + 4.6);
          character.placeAt(townArc.millPos.x + 2.2, y + 0.2, townArc.millPos.z + 4.6);
          character.setYaw(Math.PI);
        } else if (who === 'ada') {
          const snap = gameStore.getState().serialize();
          snap.fieldwork = {
            ...snap.fieldwork,
            campaign: { ...snap.fieldwork.campaign, act: 4, heard: [...snap.fieldwork.campaign.heard, 'ada'] },
          };
          gameStore.getState().hydrate(snap);
          townArc.update(worldTime, 4, 4, false, false);
          dialogue = startDialogue('ada', ADA_DIALOGUE);
          dialogue.currentNodeId = 'offer';
          const y = terrain.getHeightAt(townArc.companyPos.x + 3.2, townArc.companyPos.z);
          character.placeAt(townArc.companyPos.x + 3.2, y + 0.2, townArc.companyPos.z);
          character.setYaw(-Math.PI / 2);
        } else if (who === 'fire') {
          scriptEvent('fire');
          dialogue = null;
          arcBanner = 'fire';
          holdView = shedView(6.4);
        } else if (who === 'overview') {
          scriptEvent('rush');
          const dressed = worldDress.snap('rush');
          waterRise = dressed.rise;
          streams.setStage(dressed.rise, dressed.spread);
          grass?.setDry(dressed.dry);
          for (const cover of grassCovers) cover.setDry(dressed.dry);
          waterStageKey = `${dressed.rise.toFixed(3)}|${dressed.spread.toFixed(3)}`;
          arcBanner = 'rush';
          dialogue = null;
          holdView = townWideView();
        } else if (who === 'flood' || who === 'drought' || who === 'rush') {
          scriptEvent(who);
          const dressed = worldDress.snap(who);
          waterRise = dressed.rise;
          streams.setStage(dressed.rise, dressed.spread);
          grass?.setDry(dressed.dry);
          for (const cover of grassCovers) cover.setDry(dressed.dry);
          waterStageKey = `${dressed.rise.toFixed(3)}|${dressed.spread.toFixed(3)}`;
          arcBanner = who;
          if (who === 'rush') holdView = rushView();
          else holdView = creekView();
        } else {
          return false;
        }
        return true;
      },
      enterDrift: () => {
        const north = mines.find((mine) => mine.id === 'mine_north');
        if (!north) return false;
        interiorShot = false;
        holdView = null;
        dialogue = null;
        north.tryUnlock(3);
        character.group.visible = true;
        character.placeAt(north.position.x, north.position.y + 0.15, north.position.z - 3.2);
        character.setYaw(0);
        return true;
      },
      standInDrift: (localZ: number) => {
        const north = mines.find((mine) => mine.id === 'mine_north');
        if (!north) return false;
        north.tryUnlock(3);
        holdView = null;
        interiorShot = false;
        character.placeAt(north.position.x, north.position.y + 0.15, north.position.z + localZ);
        character.setYaw(0);
        return true;
      },
      driftLocalZ: () => {
        const north = mines.find((mine) => mine.id === 'mine_north');
        if (!north) return 0;
        return character.getPosition().z - north.position.z;
      },
      driftPhase: () => {
        const north = mines.find((mine) => mine.id === 'mine_north');
        return north ? driftPhase(north.group) : 'missing';
      },
      driftClock: () => {
        const north = mines.find((mine) => mine.id === 'mine_north');
        return north ? driftClock(north.group) : 0;
      },
      sceneView: (need: string[]) => {
        wantBlack = true;
        const hit = meshesInView(need);
        return { black: blackRatio, present: hit.present, missing: hit.missing };
      },
      waterRise,
      crewReady: () => {
        const line = renderer.scene.getObjectByName('bucket-line');
        if (!line || line.children.length === 0) return false;
        return line.children.every((child) => child.userData.hero === true);
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
  skipReflection(beacon);
  beacon.frustumCulled = false;
  beacon.visible = false;
  renderer.scene.add(beacon);

  let simRunning = skipIntro;
  if (skipIntro) document.body.dataset.sim = '1';
  let cinemaTime = 0;
  let presentedFrames = 0;
  const overlays = mountOverlays({
    onResume: () => {
      void Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
    },
    onSettings: () => settings.open(),
    onQuality: (name) => {
      setQuality(name);
      gameStore
        .getState()
        .updateSettingsSlice('graphics', { preset: name, shadowsEnabled: name !== 'low' });
      publishProbe();
      requestAnimationFrame(() => {
        renderer.applyGraphics();
        const mirrorNow = mirrorBudget(softwareGl);
        waterReflection.setSize(mirrorNow.size);
        waterReflection.setStride(mirrorNow.stride);
        waterReflection.setTreesOnly(true);
        waterReflection.setEnabled(RENDER_QUALITY.reflections);
        const probeNow = probeBudget(softwareGl);
        creekProbe.setSize(probeNow.size);
        creekProbe.setStride(probeNow.stride);
        creekProbe.setEnabled(RENDER_QUALITY.reflections);
        setScatterDensity(RENDER_QUALITY.scatter / QUALITY_PRESETS.ultra.scatter);
        grass?.setCount(RENDER_QUALITY.grassTall);
        for (const cover of grassCovers) cover.setCount(RENDER_QUALITY.grassCover);
        motes.resize();
      });
    },
    onSaveSlot: (slot) => {
      void saveToSlot(slot, buildSaveSnapshot()).then(() => refreshBooks());
    },
    onLoadSlot: (slot) => {
      void loadSlot(slot).then((page) => {
        if (!page.save) return;
        gameStore.getState().hydrate(page.save);
        const p = page.save.player;
        character.placeAt(p.position.x, p.position.y, p.position.z);
        character.setYaw(p.rotation.yaw);
        worldTime = page.save.world.gameTime;
        applyReading(page.save.settings);
        input.setInvertY(page.save.settings.look.invertY === true);
        input.setMouseSensitivityMultiplier(page.save.settings.look.mouseSensitivity);
      });
    },
  });

  markSceneReflections(renderer.scene);

  function refreshBooks(): void {
    void describeManualSlots().then((rows) => {
      overlays.setSlotNotes(rows.map((row) => row.label));
    });
  }

  const sunNdc = new THREE.Vector3();
  const _audioForward = new THREE.Vector3();
  const focusNdc = new THREE.Vector3();
  let panMounted: 'camera' | 'world' = 'camera';
  function mountPan(mode: 'camera' | 'world'): void {
    if (panMounted === mode) return;
    panMounted = mode;
    if (mode === 'world') renderer.scene.add(panView.group);
    else renderer.camera.add(panView.group);
    panView.setMount(mode);
  }

  function machineAnchor(step: string | null): THREE.Vector3 | null {
    const kind =
      step === 'rocker'
        ? 'rocker'
        : step === 'sluice'
          ? 'sluice'
          : step === 'tom'
            ? 'longtom'
            : step === 'monitor'
              ? 'monitor'
              : null;
    if (!kind) return null;
    const machine = placedMachines.list().find((m) => m.kind === kind);
    if (!machine) return null;
    return new THREE.Vector3(
      machine.x,
      terrain.getHeightAt(machine.x, machine.z) + 0.55,
      machine.z,
    );
  }

  function standAtMachine(kind: MachineKind): void {
    const machine = layout(gameStore.getState().save, courses).find((m) => m.kind === kind);
    if (!machine) return;
    const stance = workStance(machine);
    const y = terrain.getHeightAt(stance.x, stance.z) + 0.95;
    character.placeAt(stance.x, y, stance.z);
    character.setYaw(stance.yaw);
    cameraRig.setYawPitch(stance.yaw, -0.15);
  }

  // Title card sits over a live golden-hour drift. The sim clock does not move.
  const titleRight = new THREE.Vector3();
  const titleLook = new THREE.Vector3();
  const titleBeats: { p: [number, number, number]; l: [number, number, number] }[] = [
    { p: [44, 8.5, -12], l: [28, 1.4, 12] },
    { p: [36, 5.5, 26], l: [28, 1.2, 8] },
    { p: [8, 10, 40], l: [-6, 2.4, 18] },
    { p: [-24, 7, 4], l: [-8, 2.2, 22] },
    { p: [16, 11, 48], l: [30, 1.6, 8] },
  ];
  function paintTitle(dt: number): void {
    cinemaTime += dt;
    document.body.dataset.cinema = '1';
    const beats = titleBeats;
    const scaled = ((cinemaTime % 52) / 52) * beats.length;
    const i = Math.floor(scaled) % beats.length;
    const j = (i + 1) % beats.length;
    const t = scaled - Math.floor(scaled);
    const s = t * t * (3 - 2 * t);
    const a = beats[i] ?? beats[0];
    const b = beats[j] ?? beats[0];
    if (!a || !b) return;
    const px = a.p[0] + (b.p[0] - a.p[0]) * s;
    const py = a.p[1] + (b.p[1] - a.p[1]) * s;
    const pz = a.p[2] + (b.p[2] - a.p[2]) * s;
    const lx = a.l[0] + (b.l[0] - a.l[0]) * s;
    const ly = a.l[1] + (b.l[1] - a.l[1]) * s;
    const lz = a.l[2] + (b.l[2] - a.l[2]) * s;
    const camY = Math.max(py, terrain.getHeightAt(px, pz) + 3.2);
    renderer.camera.position.set(px, camY, pz);
    renderer.camera.lookAt(lx, ly, lz);
    renderer.camera.updateMatrixWorld();
    titleRight.set(1, 0, 0).applyQuaternion(renderer.camera.quaternion);
    renderer.camera.lookAt(lx + titleRight.x * 5.5, ly, lz + titleRight.z * 5.5);
    renderer.camera.fov = 48;
    renderer.camera.updateProjectionMatrix();

    character.postStep(dt, cinemaTime, null, {
      menu: true,
      ground: (x, z) => terrain.getHeightAt(x, z),
    });

    const golden = worldTimeForSkyHour(17.55);
    sky.update(golden, { state: 'clear', intensity: 0 });
    titleLook.set(lx, ly, lz);
    const sunDir = renderer.followSun(titleLook);
    renderer.syncFrame(golden, sunDir);
    updateScatterWind(cinemaTime, titleLook, renderer.camera.position, renderer.sun.intensity);
    updateTownDressing(cinemaTime, renderer.camera);
    updateTownLights(sunDir.y);
    setFoliageWindTime(cinemaTime);
    pulseGold(cinemaTime);
    shafts.update(sunDir, titleLook, true, renderer.camera);
    motes.update(cinemaTime, titleLook, sunDir.y);
    const grassLight = {
      time: cinemaTime,
      sunColor: renderer.sun.color,
      sunIntensity: renderer.sun.intensity,
      ambientColor: renderer.ambient.color,
      ambientIntensity: renderer.ambient.intensity,
    };
    grass?.update(grassLight);
    for (const cover of grassCovers) cover.update(grassLight);
    renderer.camera.updateMatrixWorld();
    const titleWater = nearestWaterPoint(
      courses,
      renderer.camera.position.x,
      renderer.camera.position.z,
    );
    syncWaterMatrices(renderer.camera, renderer.renderer);
    creekProbe.update(renderer.renderer, renderer.scene, titleWater.x, titleWater.y, titleWater.z);
    waterReflection.update(renderer.renderer, renderer.scene, renderer.camera, titleWater.y);
  }

  // ---- Game loop ----
  const loop = createGameLoop({
    // Shader compile on a software GPU can stall a frame for seconds.
    // The playtest pilot needs that stall to still advance the sim, or
    // the 6s pan and 9s collect never finish inside the test budget.
    maxFrameDt: smoke.active ? 1 : 0.25,
    update: (dt) => {
      frameMs = dt * 1000;
      input.poll();
      if (document.hidden) {
        publishProbe();
        return;
      }
      if (simRunning && fx.soakHitStop(dt)) {
        publishProbe();
        return;
      }
      if (!simRunning) {
        paintTitle(dt);
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
      let interactJustPressed = interactDown && !interactWasDown;
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
          refreshBooks();
          overlays.toggle('pause');
          pauseJustPressed = false;
        }
      }
      const settingsOpen = settings.isOpen();
      const uiBlocked = settingsOpen || overlays.isBlocking();
      if (uiBlocked && interactJustPressed) {
        if (settingsOpen) settings.activate();
        else overlays.activate();
        interactJustPressed = false;
      }
      const padMenu = input.gamepadMenu();
      if (settingsOpen) {
        if (padMenu.y !== 0 && padMenuY === 0) settings.move(padMenu.y > 0 ? 1 : -1);
        if (padMenu.x !== 0 && padMenuX === 0) settings.nudge(padMenu.x);
      } else if (overlays.current() !== 'none') {
        if (padMenu.y !== 0 && padMenuY === 0) overlays.move(padMenu.y > 0 ? 1 : -1);
      }
      padMenuX = padMenu.x;
      padMenuY = padMenu.y;
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
      const comfortPos = character.getPosition();
      const comfortSave = gameStore.getState().save;
      const comfortHour = getSkyHour(worldTime);
      const comfort = comfortFor({
        hunger: comfortSave.player.meters.hunger,
        thirst: comfortSave.player.meters.thirst,
        fed: worldTime < comfortSave.fieldwork.fedUntil,
        coffee: worldTime < comfortSave.fieldwork.coffeeUntil,
        nearCamp: camp.isPlayerNear(comfortPos),
        campTier: bestCamp(comfortSave.fieldwork.claims),
        night: comfortHour < 6 || comfortHour >= 20,
      });
      character.preStep(dt, moveInput, jumpDown, sprintDown, cameraRig.getYaw(), {
        regenBonus: comfort.staminaRegen,
        drainScale: comfort.staminaDrainScale,
      });

      // 4. Physics
      physics.step();

      // 5. Character visuals — pass prospecting activity so animations match the active step
      const prospectSnap = prospect.getSnapshot();
      const activity = prospectSnap
        ? { step: prospectSnap.step, progress: prospectSnap.progress }
        : null;
      const menuPose = overlays.isBlocking() || settings.isOpen();
      const carryGold = gameStore.getState().save.inventory.carry.gold;
      character.postStep(dt, worldTime, activity, {
        menu: menuPose,
        carrying: carryGold.flake_g + carryGold.picker_g + carryGold.nugget_g > 0.05,
        ground: (x, z) => terrain.getHeightAt(x, z),
      });
      const northBody = mines.find((mine) => mine.id === 'mine_north');
      const held = character.getPosition();
      if (northBody && driftKeepOut(northBody.group, northBody.position, held)) {
        character.placeAt(held.x, held.y, held.z);
      }

      // 6. Camera position. During a prospect minigame, swap the spring-arm
      // rig for the fixed first-person prospect view + tool viewmodel.
      const charPosForCamera = character.getPosition();
      if (prospecting && !prospectWasActive) {
        // Edge: just entered prospect view. Snap camera, capture rig yaw.
        cameraMode.enterProspectView(charPosForCamera, cameraRig.getYaw());
      } else if (!prospecting && prospectWasActive) {
        // Edge: just exited prospect view. Hide everything prospect-related.
        cameraMode.exitProspectView();
        mountPan('camera');
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
        const snapForCam = prospect.getSnapshot();
        const stepForCam = snapForCam?.step ?? null;
        const machineFocus = machineAnchor(stepForCam);
        cameraMode.updateProspectView(
          charPosForCamera,
          stepForCam,
          machineFocus ?? character.getToolFocus(),
        );
        const snap = prospect.getSnapshot();
        if (snap) {
          const v = snap.viz;
          // Always start from a hidden baseline, then turn on what the
          // current stage needs. Simpler than the per-branch if/else
          // hide-everything-except-mine pattern.
          hideAllProspectViewmodels();

          if (v?.kind === 'dig') {
            const usePickaxe = v.isPickaxe;
            // The prospector holds the shovel. The meter stays a screen overlay.
            shovelMesh.visible = false;
            pickaxeMesh.visible = usePickaxe;
            mountPan('camera');
            digMeter.update(v);
            digMeter.setVisible(true);
            // Rising-edge: lastSwingFlashSec drops on a new swing.
            if (v.lastSwingFlashSec < lastDigSwingFlash) {
              triggerToolSwing(usePickaxe ? pickaxeMesh : shovelMesh);
              presentToolImpact(fx, charPosForCamera, 0x8a6240, 12, 'dirt');
              character.spendStamina(0.05 * comfort.digCost);
            }
            lastDigSwingFlash = v.lastSwingFlashSec;
          } else if (v?.kind === 'classify') {
            mountPan('camera');
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
            mountPan('world');
            const focus = character.getToolFocus();
            panView.group.position.copy(focus);
            panView.group.rotation.set(-0.5, character.getYaw(), 0);
            panView.update(v);
            panView.setVisible(true);
            if (v.swirlCount > lastPanSwirls) {
              presentToolImpact(fx, charPosForCamera, 0xb7d4e2, 10, 'droplet');
            }
            lastPanSwirls = v.swirlCount;
          } else if (v?.kind === 'collect') {
            mountPan('camera');
            collectView.update(v);
            collectView.setVisible(true);
          } else if (v?.kind === 'strike') {
            mountPan('camera');
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
            mountPan('camera');
            pickaxeMesh.visible = true;
            extractMeter.update(v);
            extractMeter.setVisible(true);
          }
        }
      } else {
        const reviewPose = getReviewPose();
        if (reviewPose === 'dig' || reviewPose === 'pan') {
          frameToolShot(
            renderer.camera,
            charPosForCamera,
            character.getYaw(),
            reviewPose,
            character.getToolFocus(),
          );
          reviewingTool = true;
        } else {
          if (reviewingTool) {
            renderer.camera.fov = chaseFov;
            renderer.camera.updateProjectionMatrix();
            reviewingTool = false;
          }
          cameraRig.placeCamera(
            charPosForCamera,
            physics.rapier,
            character.getColliderHandle(),
            dt,
          );
          const northCam = mines.find((m) => m.id === 'mine_north');
          const driftShow = northCam
            ? frameDriftShow(northCam.group, northCam.position, renderer.camera)
            : false;
          if (!driftShow && northCam) {
            if (northCam.isPlayerInside(charPosForCamera)) {
              frameDriftWalk(northCam.position, charPosForCamera, renderer.camera);
            } else if (interiorShot) {
              frameDriftInterior(northCam.position, renderer.camera);
            }
          }
          frameDialogue(dialogue, townArc, character.getPosition(), renderer.camera, chaseFov);
          if (holdView) {
            renderer.camera.position.set(holdView.x, holdView.y, holdView.z);
            renderer.camera.lookAt(holdView.lx, holdView.ly, holdView.lz);
          }
          const sceneLook = new THREE.Vector3();
          const sceneSubjects: THREE.Vector3[] = [];
          if (holdView) {
            sceneLook.set(holdView.lx, holdView.ly, holdView.lz);
            sceneSubjects.push(sceneLook.clone());
            if (arcBanner === 'fire') {
              sceneSubjects.push(new THREE.Vector3(townArc.firePos.x, townArc.firePos.y + 3.4, townArc.firePos.z));
            }
          } else if (dialogue) {
            const who =
              dialogue.treeId === 'silas'
                ? 'silas'
                : dialogue.treeId === 'ada'
                  ? 'ada'
                  : dialogue.treeId === 'old_pete'
                    ? 'pete'
                    : dialogue.treeId === 'innkeeper'
                      ? 'mae'
                      : null;
            const npc = who ? townArc.actor(who) : null;
            if (npc) {
              const player = character.getPosition();
              sceneSubjects.push(player.clone().setY(player.y + 1.3), npc.clone().setY(npc.y + 1.4));
              if (who === 'silas') {
                const mill = townArc.millPos;
                sceneSubjects.push(new THREE.Vector3(mill.x - 4.4, mill.y + 2.8, mill.z + 0.2));
                sceneSubjects.push(new THREE.Vector3(mill.x, mill.y + 2.4, mill.z + 0.4));
                renderer.camera.position.set(mill.x + 7.2, mill.y + 3.1, mill.z + 11.2);
                sceneLook.set(mill.x - 0.6, mill.y + 2.5, mill.z + 1.0);
              } else {
                sceneLook.copy(player).add(npc).multiplyScalar(0.5);
                sceneLook.y += 1.3;
              }
            }
          }
          if (sceneSubjects.length > 0) {
            const mill = townArc.millPos;
            const keepFront =
              dialogue?.treeId === 'silas'
                ? (pos: THREE.Vector3) => pos.z > mill.z + 7 && pos.x > mill.x + 1.5
                : undefined;
            clearSceneCamera(renderer.camera.position, sceneLook, sceneSubjects, keepFront);
            renderer.camera.lookAt(sceneLook);
            foliageLook = sceneLook.clone();
          } else {
            foliageLook = null;
          }
        }
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
      const nearMill = !inSession && !nearPete && townArc.nearMill(charPos);
      const nearCompany = !inSession && !nearPete && !nearMill && townArc.nearCompany(charPos);
      const nearFire = !inSession && townArc.nearFire(charPos);
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
      placedMachines.sync(
        gameStore.getState().save,
        (x, z) => terrain.getHeightAt(x, z),
        prospect.getSnapshot()?.viz ?? null,
        worldTime,
      );
      const nearJumperInfo = !inSession ? crew.nearestJumper(charPos.x, charPos.z) : null;
      const jumperClose = nearJumperInfo !== null && nearJumperInfo.distance < 7.5;
      const nearJumper =
        nearJumperInfo !== null && nearJumperInfo.ready && nearJumperInfo.distance < 3.6;
      const nearMachineInfo =
        !inSession && !nearJumper ? placedMachines.nearest(charPos.x, charPos.z, 2.5) : null;
      // Closest panning site across both streams and the cave (if unlocked).
      const candidateStreamSite =
        !inSession &&
        nearestVendor === null &&
        !nearStore &&
        !nearInn &&
        !nearPete &&
        !nearMine &&
        !nearCamp &&
        !nearJumper &&
        nearMachineInfo === null
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
      claimMarkers.sync(gameStore.getState().save.fieldwork.claims, (x, z) =>
        terrain.getHeightAt(x, z),
      );
      const liveSave = gameStore.getState().save;
      geologyMarks.sync(liveSave.fieldwork.payShift, liveSave.fieldwork.samples);
      const crewEvent = crew.update(dt, {
        claims: liveSave.fieldwork.claims,
        hands: liveSave.fieldwork.hands,
        playerX: charPos.x,
        playerZ: charPos.z,
        groundY: (x, z) => terrain.getHeightAt(x, z),
        machines: placedMachines.list(),
        time: worldTime,
      });
      if (crewEvent.caughtClaimId) {
        const caught = gameStore
          .getState()
          .resolveJumper(crewEvent.caughtClaimId, 'caught', worldTime);
        if (caught.ok)
          emitGameplay('jumper-confront', { claimId: crewEvent.caughtClaimId, how: 'caught' });
        hintText = 'You caught them. The sack stayed.';
        hintUntil = worldTime + 5;
      } else if (crewEvent.escapedClaimId) {
        const escaped = gameStore
          .getState()
          .resolveJumper(crewEvent.escapedClaimId, 'escaped', worldTime);
        if (escaped.ok)
          emitGameplay('jumper-confront', { claimId: crewEvent.escapedClaimId, how: 'escaped' });
        hintText = 'They slipped off with a little color.';
        hintUntil = worldTime + 5;
      }

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
      let streamPoint = { x: charPos.x, y: charPos.y, z: charPos.z };
      let courseDist = Infinity;
      for (const course of courses) {
        const q = course.nearest(charPos.x, charPos.z);
        if (q.dist < courseDist) {
          courseDist = q.dist;
          streamPoint = { x: q.sample.x, y: q.sample.waterY || charPos.y, z: q.sample.z };
        }
      }
      if (courseDist < nearestStreamDist) nearestStreamDist = courseDist;
      let inCaveAudio = false;
      for (const m of mines) {
        if (m.isPlayerInside(charPos)) {
          inCaveAudio = true;
          break;
        }
      }
      const cam = renderer.camera;
      const ear = cam.getWorldDirection(_audioForward);
      const uiOpen =
        inDialogueSession ||
        inVendorSession ||
        inStoreSession ||
        settings.isOpen() ||
        overlays.current() !== 'none';
      audio.update({
        dt,
        distanceToNearestStream: nearestStreamDist,
        weatherIntensity: weather.getView().intensity,
        hour: getSkyHour(worldTime),
        inWater: inStreamWater,
        inCave: inCaveAudio,
        prospecting,
        player: { x: charPos.x, y: charPos.y, z: charPos.z },
        stream: streamPoint,
        listener: {
          x: cam.position.x,
          y: cam.position.y,
          z: cam.position.z,
          fx: ear.x,
          fy: ear.y,
          fz: ear.z,
          ux: 0,
          uy: 1,
          uz: 0,
        },
        attention: inDialogueSession ? 'dialogue' : uiOpen ? 'menu' : 'world',
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
        audio.playFootstep(charState === 'running' ? 'run' : 'walk');
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
      const northMine = mines.find((m) => m.id === 'mine_north');
      const inNorth = !!northMine && northMine.isPlayerInside(charPos);
      const driftShowPhase = northMine ? driftPhase(northMine.group) : '';
      const driftShowActive =
        !holdView &&
        !dialogue &&
        (driftShowPhase === 'fuse' || driftShowPhase === 'blast' || driftShowPhase === 'cave');
      driftLit = inNorth || interiorShot || driftShowActive;
      const atmo = renderer.camera.getObjectByName('atmosphere');
      if (inCave && !driftLit) {
        renderer.ambient.intensity = 0.04;
        renderer.hemi.intensity = 0.015;
      }
      if (driftLit) {
        renderer.sun.intensity = 0;
        renderer.hemi.intensity = 0;
        renderer.ambient.color.setRGB(8 / 255, 8 / 255, 10 / 255);
        renderer.ambient.intensity = 1;
        renderer.renderer.toneMappingExposure = 0.74;
        if (renderer.scene.fog instanceof THREE.FogExp2) {
          renderer.scene.fog.color.set(0x050508);
          renderer.scene.fog.density = 0.055;
        }
        renderer.renderer.setClearColor(0x050508);
        if (atmo) atmo.visible = false;
      } else if (atmo) {
        atmo.visible = true;
      }
      if (northMine) {
        if (inNorth) {
          const local = charPos.clone().sub(northMine.position);
          local.y += 1.25;
          setDriftBearer(northMine.group, local);
        } else {
          setDriftBearer(northMine.group, null);
        }
        const viz = prospect.getSnapshot()?.viz;
        if (viz?.kind === 'blast' && (viz.phase === 'fuse' || viz.phase === 'retreat')) {
          setDriftFuse(northMine.group, viz.phase === 'retreat' ? 1 : viz.fuse);
        }
        updateNorthLode(
          northMine.group,
          worldTime,
          gameStore.getState().save.fieldwork.lode.creak,
          dt,
        );
      }
      const arcSave = gameStore.getState().save;
      townArc.update(
        worldTime,
        dt,
        arcSave.fieldwork.campaign.act,
        arcSave.world.event.id === 'fire',
        arcSave.fieldwork.campaign.savedTown,
      );
      const dressed = worldDress.update(arcSave.world.event.id, worldTime, dt);
      waterRise = dressed.rise;
      const stageKey = `${dressed.rise.toFixed(3)}|${dressed.spread.toFixed(3)}`;
      if (stageKey !== waterStageKey) {
        waterStageKey = stageKey;
        streams.setStage(dressed.rise, dressed.spread);
      }
      grass?.setDry(dressed.dry);
      for (const cover of grassCovers) cover.setDry(dressed.dry);

      // Sky wrote the sun's arc position. Slide the shadow frustum onto the
      // player, then publish one lighting block for every custom shader.
      const sunDirWorld = renderer.followSun(charPos);
      renderer.syncFrame(worldTime, sunDirWorld);
      updateScatterWind(worldTime, charPos, renderer.camera.position, renderer.sun.intensity);
      fadeFoliageNear(foliageLook ? renderer.camera.position : null, 12, foliageLook);
      updateTownDressing(worldTime, renderer.camera);
      updateTownLights(sunDirWorld.y);
      setFoliageWindTime(worldTime);
      pulseGold(worldTime);
      shafts.update(sunDirWorld, charPos, !driftLit, renderer.camera);
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
        if (dialogue && dialoguePick !== null) {
          const pick = dialoguePick;
          dialoguePick = null;
          if (pick === dialogue.selectionIdx) interactJustPressed = true;
          else dialogue.selectionIdx = pick;
        }
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
                  if (rumor.id === 'buckeye')
                    emitGameplay('area-unlock', { streamId: 'buckeye_run' });
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
                const filed = gameStore
                  .getState()
                  .fileLode(action.mineId, action.x, action.z, worldTime);
                if (filed.ok) {
                  dialogue!.currentNodeId = 'lodeFiled';
                  dialogue!.selectionIdx = 0;
                  emitGameplay('claim-staked', {
                    claimId: `lode_${action.mineId}`,
                    habitat: 'bedrock',
                  });
                  audio.playConfirm();
                } else {
                  dialogue!.pendingBody = filed.reason;
                  dialogue!.currentNodeId = 'rumor';
                  dialogue!.selectionIdx = 0;
                }
              } else if (
                action.kind === 'scareJumper' ||
                action.kind === 'payJumper' ||
                action.kind === 'chaseJumper'
              ) {
                const claimId = dialogue!.targetId;
                if (!claimId) {
                  dialogue = null;
                } else if (action.kind === 'chaseJumper') {
                  crew.startChase(claimId);
                  emitGameplay('jumper-confront', { claimId, how: 'chase' });
                  hintText = 'Run them down. Stay on them.';
                  hintUntil = worldTime + 6;
                  dialogue = null;
                } else {
                  const how = action.kind === 'payJumper' ? 'pay' : 'scare';
                  const resolved = gameStore.getState().resolveJumper(claimId, how, worldTime);
                  if (!resolved.ok && how === 'pay') {
                    dialogue!.currentNodeId = 'broke';
                    dialogue!.selectionIdx = 0;
                  } else if (resolved.ok) {
                    emitGameplay('jumper-confront', { claimId, how });
                    dialogue!.currentNodeId = how === 'pay' ? 'paid' : 'scared';
                    dialogue!.selectionIdx = 0;
                    audio.playConfirm();
                  }
                }
              } else if (
                action.kind === 'beginLode' ||
                action.kind === 'millOre' ||
                action.kind === 'buyPowder' ||
                action.kind === 'buyTimber' ||
                action.kind === 'buyOutCompany' ||
                action.kind === 'standWithTown' ||
                action.kind === 'meetCompany' ||
                action.kind === 'fightFire'
              ) {
                const arc = applyArcAction(gameStore.getState().save, action, worldTime);
                gameStore.getState().hydrate(arc.save);
                if (action.kind === 'fightFire') townArc.quench();
                if (action.kind === 'standWithTown' && arc.save.fieldwork.campaign.savedTown) {
                  townArc.rebuild();
                }
                if (dialogue) {
                  dialogue.currentNodeId = arc.node;
                  dialogue.selectionIdx = 0;
                }
                if (arc.hint) {
                  hintText = arc.hint;
                  hintUntil = worldTime + 4.5;
                }
                audio.playConfirm();
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
            storeSelectionIdx =
              ((storeSelectionIdx % listings.length) + listings.length) % listings.length;
          }
          if (toolNextJustPressed && listings.length > 0) {
            storeSelectionIdx = (storeSelectionIdx + 1) % listings.length;
            audio.playUITap();
          }
          if (toolPrevJustPressed && listings.length > 0) {
            storeSelectionIdx = (storeSelectionIdx - 1 + listings.length) % listings.length;
            audio.playUITap();
          }
          let storeBuy = false;
          if (storePick !== null && listings.length > 0) {
            const pick = Math.max(0, Math.min(listings.length - 1, storePick));
            storePick = null;
            if (pick === storeSelectionIdx) storeBuy = true;
            else {
              storeSelectionIdx = pick;
              audio.playUITap();
            }
          }
          if ((interactJustPressed || storeBuy) && listings.length > 0) {
            const row = listings[storeSelectionIdx];
            if (row && row.affordable && row.nextCost !== null && !row.questGated) {
              const before = gameStore.getState().save.fieldwork.method;
              let ok = false;
              if (row.kind === 'upgrade') {
                const category = row.id as EquipmentCategory;
                const ownedTier = gameStore.getState().save.equipment.ownedTiers[category];
                const next = getNextUpgrade(category, ownedTier);
                if (next) {
                  ok = gameStore
                    .getState()
                    .purchaseUpgrade(category, next.cost, next.toTier, worldTime);
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
        const confirmSale = interactJustPressed || vendorClick;
        vendorClick = false;
        if (pauseJustPressed) {
          console.log(`[vendor] left ${activeVendor!.id}`);
          activeVendor = null;
        } else if (confirmSale) {
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
            fx.rumble(170, 0.35, 0.7);
            fx.shake(0.02, 0.22);
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
            gameStore
              .getState()
              .workClaimsNear(
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
              nuggetGrams: result.reward.nugget_g,
            });
            gameStore.getState().markTutorialComplete();
            if (result.siteId === 'mine_north_cave' && gameStore.getState().save.fieldwork.campaign.act >= 2) {
              gameStore.getState().hydrate(bankOre(gameStore.getState().save, result.skillBonus, worldTime));
            }
            if (
              result.method === 'rocker' ||
              result.method === 'sluice' ||
              result.method === 'long_tom' ||
              result.method === 'hydraulic'
            ) {
              const runKind =
                result.method === 'long_tom'
                  ? 'long_tom'
                  : result.method === 'hydraulic'
                    ? 'hydraulic'
                    : result.method;
              gameStore.getState().noteMachineRun(runKind, worldTime);
              emitGameplay('machine-run', { kind: result.method });
            }
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
      } else if (nearFire && interactJustPressed) {
        dialogue = startDialogue('fire', FIRE_DIALOGUE);
      } else if (nearMill && interactJustPressed) {
        dialogue = startDialogue('silas', SILAS_DIALOGUE);
      } else if (nearCompany && interactJustPressed) {
        dialogue = startDialogue('ada', ADA_DIALOGUE);
      } else if (nearMine && nearestMine && interactJustPressed) {
        const shovelTier = mineAccessTier(gameStore.getState().save.equipment.ownedTiers);
        if (nearestMine.tryUnlock(shovelTier)) {
          console.log(`[mine] ${nearestMine.id} opened — pickaxe knocked the boards loose`);
        } else if (nearestMine.isOpen()) {
          console.log(`[mine] ${nearestMine.id} already open — walk inside`);
        } else {
          console.log(`[mine] ${nearestMine.id} sealed — needs a pickaxe (Shovel T3)`);
        }
      } else if (nearJumper && nearJumperInfo && interactJustPressed) {
        dialogue = startDialogue('jumper', JUMPER_DIALOGUE);
        dialogue.targetId = nearJumperInfo.claimId;
        console.log(`[jumper] confront ${nearJumperInfo.claimId}`);
      } else if (nearMachineInfo && interactJustPressed) {
        const ownedNow = gameStore.getState().save.equipment.ownedTiers;
        const fieldNow = gameStore.getState().save.fieldwork;
        const method =
          nearMachineInfo.kind === 'longtom'
            ? 'long_tom'
            : nearMachineInfo.kind === 'monitor'
              ? 'hydraulic'
              : nearMachineInfo.kind;
        if (method === 'hydraulic' && fieldNow.hands < 1) {
          hintText = 'The monitor needs a hired hand on the hose.';
          hintUntil = worldTime + 4;
        } else {
          const actionCount = gameStore.getState().incrementPanCount();
          const globalMult = getGlobalYieldMultiplier(ownedNow);
          prospect.start({
            siteId: `machine:${nearMachineInfo.kind}:${nearMachineInfo.claimId}`,
            context: 'panning',
            digsRemaining: 8,
            maxDigs: 8,
            actionCount,
            firstEver: actionCount === 1,
            yieldMultiplier: globalMult * comfort.yield,
            toolTiers: ownedNow,
            method,
            tutorial: false,
            asPick: ownedNow.pick >= 1,
          });
          emitGameplay('prospect-start', { siteId: `machine:${nearMachineInfo.kind}` });
          console.log(`[machine] start ${nearMachineInfo.kind}`);
        }
      } else if (nearCamp && interactJustPressed) {
        gameStore.getState().restAtCamp(worldTime);
        worldTime += CAMP_REST_TIME_ADVANCE;
        console.log(
          `[camp] rested — meters refilled, time advanced ${(CAMP_REST_TIME_ADVANCE / 3600).toFixed(0)}h`,
        );
      } else if (
        interactJustPressed &&
        mines.some((m) => m.id === 'mine_north' && m.isPlayerInside(charPos)) &&
        mines.some((m) => m.id === 'mine_north' && driftBuried(m.group) && driftNearFall(m.position.z, charPos.z))
      ) {
        const north = mines.find((m) => m.id === 'mine_north');
        const dug = north ? digDrift(north.group) : 1;
        audio.playDigSwing(0.6);
        hintText = dug >= 1 ? 'You are through the fall.' : 'Dig. The rock is still in the drift.';
        hintUntil = worldTime + 2.5;
      } else if (
        interactJustPressed &&
        mines.some((m) => m.id === 'mine_north' && m.isPlayerInside(charPos)) &&
        !nearestSite
      ) {
        const lagged = timberInPlace(gameStore.getState().save, worldTime);
        if (lagged.ok) {
          gameStore.getState().hydrate(lagged.save);
          audio.playConfirm();
        }
        hintText = lagged.reason;
        hintUntil = worldTime + 4;
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
          const survivalMult = comfort.yield;
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
          const northLode =
            isMineSite && nearestSite.site.id === 'mine_north_cave' && fieldNow.campaign.act >= 2;
          const eventCut = isMineSite ? 1 : placerEventFactor(gameStore.getState().save);
          const yieldMultiplier = globalMult * survivalMult * siteBonus * geo * eventCut;
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
            lode: northLode,
            powder: fieldNow.lode.charges,
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
      const arc = tickArc(gameStore.getState().save, dt, {
        allowEvents: simRunning && !playtestLock && !document.hidden,
        inNorth: mines.some((m) => m.id === 'mine_north' && m.isPlayerInside(character.getPosition())),
        gameTime: worldTime,
      });
      if (arc.changed) gameStore.getState().hydrate(arc.save);
      arcBanner = arc.banner;
      arcStatusLine = arc.status;
      if (arc.creakPulse) {
        fx.shake(0.03, 0.25);
        emitGameplay('timber-creak', {});
        hintText = 'The timbers are talking.';
        hintUntil = worldTime + 3;
      }
      if (arc.collapsed) {
        const north = mines.find((m) => m.id === 'mine_north');
        if (north) playDriftCaveIn(north.group);
        fx.shake(0.14, 0.7);
        emitGameplay('cave-in', {});
        hintText = 'The cap came down. Dig through, or back out.';
        hintUntil = worldTime + 5;
      } else if (arc.blackout) {
        fx.shake(0.04, 0.25);
        hintText = 'Bad air. Walk for the portal.';
        hintUntil = worldTime + 4;
      }
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
      const stakeCost =
        gameStore.getState().save.fieldwork.claims.length === 0
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
      const insideNorth = mines.some((m) => m.id === 'mine_north' && m.isPlayerInside(charPos));
      const promptInfo = inSession || holdView
        ? null
        : nearestVendor
          ? { text: `Sell at ${nearestVendor.vendor.name}`, glyph: interactGlyph }
          : nearStore
            ? { text: 'Open General Store', glyph: interactGlyph }
            : nearInn
              ? { text: 'Talk to Innkeeper', glyph: interactGlyph }
              : nearPete
                ? { text: 'Talk to Old Pete', glyph: interactGlyph }
                : nearFire
                  ? { text: 'Join the bucket line', glyph: interactGlyph }
                  : nearMill
                    ? { text: 'Talk to Silas Voss', glyph: interactGlyph }
                    : nearCompany
                      ? { text: 'Talk to Ada Quinn', glyph: interactGlyph }
                      : nearMine
                  ? { text: minePromptText, glyph: interactGlyph }
                  : nearCamp
                    ? { text: 'Rest at Camp (4h)', glyph: interactGlyph }
                    : nearJumper
                      ? { text: 'He squares up — confront him', glyph: interactGlyph }
                      : jumperClose
                        ? { text: 'A jumper is coming off your dirt', glyph: '' }
                        : nearMachineInfo
                          ? {
                              text:
                                nearMachineInfo.kind === 'rocker'
                                  ? 'Work the rocker'
                                  : nearMachineInfo.kind === 'sluice'
                                    ? 'Feed the sluice'
                                    : nearMachineInfo.kind === 'longtom'
                                      ? 'Run the long tom'
                                      : 'Aim the monitor',
                              glyph: interactGlyph,
                            }
                          : driftLit &&
                              mines.some(
                                (m) =>
                                  m.id === 'mine_north' &&
                                  driftBuried(m.group) &&
                                  driftNearFall(m.position.z, charPos.z),
                              )
                            ? { text: 'Dig through the fall', glyph: interactGlyph }
                            : driftLit
                            ? insideNorth
                              ? { text: 'Lag a timber set ($40)', glyph: interactGlyph }
                              : null
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
        const sampled = gameStore
          .getState()
          .recordSample(groundHere, charPos.x, charPos.z, worldTime);
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
      const shownPrompt = inSession
        ? null
        : (promptInfo ??
          (hintText && worldTime < hintUntil ? { text: hintText, glyph: '…' } : null));

      const carryGramsNow =
        save.inventory.carry.gold.flake_g +
        save.inventory.carry.gold.picker_g +
        save.inventory.carry.gold.nugget_g;
      let guide: { title: string; detail: string } | null = null;
      let beam: { x: number; z: number } | null = null;
      if (!params.has('shot')) {
        const liveStep = prospect.getSnapshot()?.step ?? null;
        const working =
          liveStep === 'rocker'
            ? { title: 'Rock the box', detail: 'Tap when the box reaches either end.' }
            : liveStep === 'sluice'
              ? {
                  title: 'Run the sluice',
                  detail: 'Shovel the hopper, hold the flow, then pick the gold from the riffles.',
                }
              : liveStep === 'tom'
                ? {
                    title: 'Wash a yard',
                    detail: 'Shake the grizzly when it rises, then clean the lower box.',
                  }
                : liveStep === 'monitor'
                  ? {
                      title: 'Cut the streak',
                      detail: 'Aim the monitor at the dark band and hold the spray.',
                    }
                  : null;
        const opening = working ? { ...working, beam: 'creek' as const } : openingGuide(save);
        if (opening) {
          guide = { title: opening.title, detail: opening.detail };
          const machineBeam =
            opening.beam === 'rocker' ||
            opening.beam === 'sluice' ||
            opening.beam === 'tom' ||
            opening.beam === 'monitor'
              ? opening.beam === 'tom'
                ? 'longtom'
                : opening.beam
              : null;
          if (machineBeam || opening.beam === 'claim') {
            const placed = placedMachines.list();
            const target = machineBeam ? placed.find((m) => m.kind === machineBeam) : placed[0];
            if (target) beam = { x: target.x, z: target.z };
            else {
              const claim = save.fieldwork.claims.find((c) => c.kind === 'placer');
              if (claim) beam = { x: claim.x, z: claim.z };
            }
          } else if (opening.beam === 'creek') {
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
          } else if (opening.beam === 'lode') {
            const north = mines.find((m) => m.id === 'mine_north');
            if (north) beam = { x: north.position.x, z: north.position.z - 4 };
          } else if (opening.beam === 'mill') {
            beam = { x: townArc.millPos.x, z: townArc.millPos.z };
          } else if (opening.beam === 'company') {
            beam = { x: townArc.companyPos.x, z: townArc.companyPos.z };
          }
        }
      }
      if (beam && Math.hypot(beam.x - charPos.x, beam.z - charPos.z) > 14) {
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
        comfort: comfort.label,
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
        banner: arcBanner,
        arcStatus: arcStatusLine,
        toolsLabel: `${methodLabel(save.fieldwork.method)} · Shovel T${save.equipment.ownedTiers.shovel} · Pan T${save.equipment.ownedTiers.pan}`,
        lookLocked: document.pointerLockElement === canvas || uiBlocked,
        subtitles: gameStore.getState().save.settings.subtitles === true,
        vendor: vendorOverlay,
        store: storeOverlay,
        dialogue: dialogueOverlay,
        questTracker,
        prospect: prospect.getSnapshot(),
      });
      const settingsFov = gameStore.getState().save.settings.graphics.fovDegrees;
      const baseFov = cameraMode.authorFov() ?? (reviewingTool ? renderer.camera.fov : settingsFov);
      fx.applyCameraFeel(renderer.camera, baseFov);
      renderer.camera.updateMatrixWorld();
      sunNdc.copy(renderer.camera.position).addScaledVector(sunDirWorld, 80);
      sunNdc.project(renderer.camera);
      renderer.setPostSun(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5, sunDirWorld.y);
      const panClose = getReviewPose() === 'pan' || prospect.getSnapshot()?.step === 'pan';
      if (panClose) {
        focusNdc.copy(character.getToolFocus()).project(renderer.camera);
        renderer.setGradeFocus(focusNdc.x * 0.5 + 0.5, focusNdc.y * 0.5 + 0.5, 0.4);
        const skull = character.group.getObjectByName('modeled-head');
        if (skull) skull.getWorldPosition(faceLook);
        else {
          faceLook.copy(character.group.position);
          faceLook.y += 0.72;
        }
        faceBehind.copy(faceLook).sub(renderer.camera.position);
        if (faceBehind.lengthSq() > 1e-4) faceBehind.normalize();
        // Sit the fill in front of the face, not in the pan. A light at the
        // camera blows the bowl out and leaves the features flat.
        faceFill.position.copy(faceLook).addScaledVector(faceBehind, -0.55);
        faceFill.position.y += 0.08;
        faceFill.intensity = 0.85;
        faceRim.position.copy(faceLook).addScaledVector(faceBehind, 0.32);
        faceRim.position.y += 0.14;
        faceRim.intensity = 2.4;
      } else {
        renderer.setGradeFocus(0.5, 0.5, 0);
        faceFill.intensity = 0;
        faceRim.intensity = 0;
      }
      const waterSpot = nearestWaterPoint(
        courses,
        renderer.camera.position.x,
        renderer.camera.position.z,
      );
      syncWaterMatrices(renderer.camera, renderer.renderer);
      creekProbe.update(renderer.renderer, renderer.scene, waterSpot.x, waterSpot.y, waterSpot.z);
      waterReflection.update(renderer.renderer, renderer.scene, renderer.camera, waterSpot.y);
      publishProbe();
    },
    render: () => {
      renderer.renderer.info.reset();
      renderer.render();
      presentedFrames += 1;
      if (presentedFrames === 2) spawnGrass();
      frameLuma = samplePresentedLuma(renderer.renderer);
      if (wantBlack) {
        blackRatio = measurePresentedBlack(renderer.renderer);
        wantBlack = false;
      }
      drawCalls = renderer.renderer.info.render.calls;
      triangles = renderer.renderer.info.render.triangles;
      const shed = noteFrameTime(frameMs, playtestLock);
      if (shed === 'godrays' && RENDER_QUALITY.godrays) {
        RENDER_QUALITY.godrays = false;
        renderer.applyGraphics();
      } else if (shed === 'ao' && RENDER_QUALITY.ao) {
        RENDER_QUALITY.ao = false;
        renderer.applyGraphics();
      }
      if (window.__themHills) {
        window.__themHills.frameLuma = frameLuma;
        window.__themHills.drawCalls = drawCalls;
        window.__themHills.triangles = triangles;
        window.__themHills.frameMs = frameMs;
        window.__themHills.frameBudget = frameBudget();
        window.__themHills.waterRise = waterRise;
        window.__themHills.blackRatio = blackRatio;
        window.__themHills.mirrorMode = reflectionUniforms.uMirrorMode.value;
        window.__themHills.mirrorHorizon = reflectionUniforms.uHorizon.value;
      }
    },
  });
  publishProbe();

  await reportBoot(90, 'Compiling the view…');
  if (skipIntro) {
    overlays.hide();
  } else {
    overlays.showTitle({
      hasContinue: loaded !== null,
      notice: bootNotice,
      onContinue: () => startPlaying(),
      onNewGame: () => {
        void deleteSave().then(() => {
          const fresh = createDefaultSave();
          gameStore.getState().hydrate(fresh);
          const p = fresh.player.position;
          character.placeAt(p.x, p.y, p.z);
          character.setYaw(fresh.player.rotation.yaw);
          worldTime = fresh.world.gameTime;
          startPlaying();
        });
      },
      onSettings: () => settings.open(),
    });
  }
  function startPlaying(): void {
    simRunning = true;
    document.body.dataset.sim = '1';
    delete document.body.dataset.cinema;
    overlays.hide();
    settings.close();
    if (canvas) void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
  }

  loop.start();

  document.addEventListener('pointerlockchange', () => {
    document.body.dataset.look = document.pointerLockElement === canvas ? 'locked' : 'free';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.exitPointerLock?.();
      if (!freezeSave && simRunning) {
        saveCurrentState(buildSaveSnapshot()).catch((e) =>
          console.error('[save] hide save failed', e),
        );
      }
    }
  });

  // ---- Persistence ----
  const freezeSave = params.get('freezeSave') === '1';
  if (!freezeSave) {
    const autosaveTimer = window.setInterval(() => {
      saveCurrentState(buildSaveSnapshot()).catch((e) =>
        console.error('[save] autosave failed', e),
      );
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
function measurePresentedBlack(renderer: THREE.WebGLRenderer): number {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  if (w < 4 || h < 4) return 1;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let dark = 0;
  let n = 0;
  const step = 8;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const o = (y * w + x) * 4;
      const r = buf[o] ?? 0;
      const g = buf[o + 1] ?? 0;
      const b = buf[o + 2] ?? 0;
      n += 1;
      if (Math.max(r, g, b) < 18) dark += 1;
    }
  }
  return n === 0 ? 1 : dark / n;
}

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
  portrait: string;
  cinematic: boolean;
  options: { text: string; enabled: boolean; hint?: string }[];
  selectedIndex: number;
} | null {
  const node = getCurrentNode(session);
  if (!node) return null;
  const cinematic = session.treeId !== 'jumper';
  return {
    speaker: node.speaker,
    portrait: cinematic ? '' : node.speaker,
    cinematic,
    body: resolveBody(session),
    options: resolveOptions(session, save),
    selectedIndex: session.selectionIdx,
  };
}

function frameDialogue(
  session: DialogueSession | null,
  arc: { actor(id: 'pete' | 'mae' | 'silas' | 'ada' | 'fire'): THREE.Vector3 | null },
  player: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  chaseFov: number,
): void {
  const id =
    session?.treeId === 'old_pete'
      ? 'pete'
      : session?.treeId === 'innkeeper'
        ? 'mae'
        : session?.treeId === 'silas'
          ? 'silas'
          : session?.treeId === 'ada'
            ? 'ada'
            : session?.treeId === 'fire'
              ? 'fire'
              : null;
  const npc = id ? arc.actor(id) : null;
  if (!npc) {
    if (camera.fov === 36) {
      camera.fov = chaseFov;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const mid = player.clone().add(npc).multiplyScalar(0.5);
  const across = new THREE.Vector3().subVectors(npc, player);
  across.y = 0;
  if (across.lengthSq() < 0.04) across.set(1, 0, 0);
  across.normalize();
  const side = new THREE.Vector3(-across.z, 0, across.x);
  // The mill's back wall faces -Z. Stand on the open side, above the roof line.
  if (id === 'silas') {
    side.z = Math.abs(side.z) + 0.35;
    side.x += 0.65;
    side.normalize();
  }
  const dist = id === 'silas' ? 12.5 : id === 'ada' ? 7.2 : 4.8;
  const eye = id === 'silas' ? 4.4 : 2.4;
  const lookLift = id === 'silas' ? 2.15 : 1.25;
  camera.position.set(mid.x + side.x * dist, mid.y + eye, mid.z + side.z * dist);
  camera.lookAt(mid.x, mid.y + lookLift, mid.z);
  camera.fov = id === 'silas' ? 40 : 42;
  camera.updateProjectionMatrix();
}

bootstrap().catch((e: unknown) => {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error('[bootstrap] fatal', err);
  document.body.innerHTML = `<pre style="color:#f55; padding: 24px; font-family: monospace; white-space: pre-wrap;">Bootstrap failed:\n${err.stack ?? err.message}</pre>`;
});
