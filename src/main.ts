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
import { createHeadlamp } from '@/game/headlamp';
import { createInn } from '@/game/inn';
import { createMineEntrance } from '@/game/mine';
import { createOldPete } from '@/game/old-pete';
import { createProspectingController } from '@/game/prospecting';
import { scatterAssets } from '@/game/scatter';
import { SKY_SECONDS_PER_DAY, createSkyController, formatClock, getSkyHour } from '@/game/sky';
import { createStream, createStreamRegistry, type StreamConfig } from '@/game/stream';
import { CAMP_REST_TIME_ADVANCE, computeSurvivalYieldFactor } from '@/game/survival';
import { createTerrain, type ChannelConfig } from '@/game/terrain';
import { createWeatherController } from '@/game/weather';
import { createVendors, type Vendor } from '@/game/vendor';
import { createGameLoop } from '@/engine/loop';
import { createRenderer } from '@/engine/renderer';
import { createInputManager } from '@/input/manager';
import { createPhysicsWorld } from '@/physics/world';
import { initSaveSystem, loadSave, saveCurrentState } from '@/save/store';
import type { SaveV1 } from '@/save/schema';
import { gameStore } from '@/state/store';
import { mountHud } from '@/ui/hud';

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
    halfWidth: s.halfWidth + 0.2, // slightly wider than the water plane so banks rise visibly
    halfLength: s.halfLength + 2.75,
    orientation: s.orientation,
    depth: 0.45,
  }));

  // ---- Terrain ----
  const terrain = createTerrain(physics.rapier, CHANNEL_CONFIGS);
  renderer.scene.add(terrain.mesh);

  // ---- Streams + sites ----
  const streamList = STREAM_CONFIGS.map((cfg) => createStream(terrain, cfg));
  for (const s of streamList) renderer.scene.add(s.group);
  const streams = createStreamRegistry(streamList);

  // Site respawn: every 12 in-game hours, all streams regenerate fresh sites
  // at new positions. SKY_SECONDS_PER_DAY/2 real-seconds = one epoch.
  const SITE_EPOCH_SEC = SKY_SECONDS_PER_DAY / 2;
  const initialEpoch = Math.floor(gameStore.getState().save.world.gameTime / SITE_EPOCH_SEC);
  streams.setEpoch(initialEpoch);

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
  const mine = createMineEntrance(renderer.scene, (x, z) => terrain.getHeightAt(x, z));

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
        count: 50,
        models: [
          ...ASSETS.trees.common,
          ...ASSETS.trees.pine,
          ...ASSETS.trees.twisted,
          ...ASSETS.trees.dead,
        ],
        scale: { min: 0.7, max: 1.4 },
        reject,
      },
      0xa1,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 25,
        models: ASSETS.rocks.medium,
        scale: { min: 0.6, max: 1.6 },
        yOffset: -0.05,
        reject,
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
        count: 80,
        models: ASSETS.vegetation.grass,
        scale: { min: 0.6, max: 1.2 },
        reject,
      },
      0xa4,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 25,
        models: [
          ...ASSETS.vegetation.bushes,
          ...ASSETS.vegetation.ferns,
          ...ASSETS.vegetation.plants,
        ],
        scale: { min: 0.6, max: 1.2 },
        reject,
      },
      0xa5,
    ),
    scatterAssets(
      renderer.scene,
      terrain,
      {
        count: 30,
        models: [...ASSETS.vegetation.flowers, ...ASSETS.vegetation.mushrooms],
        scale: { min: 0.7, max: 1.3 },
        reject,
      },
      0xa6,
    ),
  ]);
  populate
    .then((results) => {
      const total = results.reduce((sum, r) => sum + r.placed, 0);
      console.log(`[scatter] environment populated (${total} instances)`);
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

  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  // ---- HUD ----
  const hud = mountHud(hudEl);

  // ---- Prospecting ----
  const prospect = createProspectingController();

  // Edge-detection state (input manager doesn't expose just-pressed; tracked here).
  let interactWasDown = false;
  let pauseWasDown = false;
  let worldTime = gameStore.getState().save.world.gameTime;

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

      // 1. Camera look (always responsive, even during prospecting)
      const lookDelta = input.getLookDelta(dt);
      cameraRig.applyLook(lookDelta);

      // 2. Determine whether character can move (locked during any session)
      const prospecting = prospect.isActive();
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

      // 6. Camera position
      cameraRig.placeCamera(character.getPosition(), physics.rapier, character.getColliderHandle());

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
      const nearestSite =
        !inSession &&
        nearestVendor === null &&
        !nearStore &&
        !nearInn &&
        !nearPete &&
        !nearMine &&
        !nearCamp
          ? streams.findNearestSite(charPos)
          : null;

      streams.update(
        worldTime,
        charPos,
        prospecting ? (prospect.getSnapshot()?.siteId ?? null) : (nearestSite?.site.id ?? null),
      );
      vendors.update(worldTime, activeVendor?.id ?? nearestVendor?.vendor.id ?? null);
      generalStore.update(worldTime, storeOpen || nearStore);
      inn.update(worldTime, dialogue !== null || nearInn);
      oldPete.update(worldTime, (dialogue !== null && dialogue.treeId === 'old_pete') || nearPete);
      mine.update(worldTime, nearMine);
      camp.update(worldTime, nearCamp);

      // 8. Survival meter drain + stream-site epoch check
      const inStreamWater = streams.isPlayerInAnyStream(charPos);
      gameStore.getState().tickMeters(dt, inStreamWater);
      streams.setEpoch(Math.floor(worldTime / SITE_EPOCH_SEC));

      // 9. Site richness regen + weather + sky + headlamp
      gameStore.getState().regenSites(dt, worldTime);
      weather.update(worldTime, dt, charPos);
      sky.update(worldTime, weather.getView());
      headlamp.update({
        playerPos: charPos,
        skyHour: getSkyHour(worldTime),
        weather: weather.getView(),
        gearTier: gameStore.getState().save.equipment.ownedTiers.gear,
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
          }
          if (toolPrevJustPressed && opts.length > 0) {
            dialogue!.selectionIdx = (dialogue!.selectionIdx - 1 + opts.length) % opts.length;
          }
          if (interactJustPressed && node) {
            const resolved = opts[dialogue!.selectionIdx];
            if (resolved && resolved.enabled) {
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
                console.log(`[quest] accepted ${action.questId}`);
              } else if (action.kind === 'turnInQuest') {
                const reward = gameStore.getState().turnInQuest(action.questId, worldTime);
                if (reward > 0) {
                  dialogue!.currentNodeId = action.completeNode ?? 'questComplete';
                  dialogue!.selectionIdx = 0;
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
          }
          if (toolPrevJustPressed) {
            storeSelectionIdx =
              (storeSelectionIdx - 1 + ALL_CATEGORIES.length) % ALL_CATEGORIES.length;
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
          const result = prospect.update(dt, interactDown);
          if (result) {
            gameStore.getState().addGoldToCarry(result.reward);
            gameStore.getState().applyGoldToQuests(result.reward);
            gameStore.getState().touchSite(result.siteId, result.richnessDepletion, worldTime);
            const totalG = result.reward.flake_g + result.reward.picker_g + result.reward.nugget_g;
            console.log(
              `[prospect] reward at ${result.siteId}: ${totalG.toFixed(3)}g ` +
                `(flake=${result.reward.flake_g.toFixed(3)}, picker=${result.reward.picker_g.toFixed(3)}, nugget=${result.reward.nugget_g.toFixed(3)})`,
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
        // Phase 10a: entrance is locked. 10b will open the interior when the
        // player has a pickaxe (shovel T3).
        const shovelTier = gameStore.getState().save.equipment.ownedTiers.shovel;
        if (mine.isUnlocked(shovelTier)) {
          console.log('[mine] open — interior coming in Phase 10b');
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
        const actionCount = gameStore.getState().incrementPanCount();
        const firstEver = actionCount === 1;
        const equipMult = computeYieldMultiplier(gameStore.getState().save.equipment.ownedTiers);
        const survivalMult = computeSurvivalYieldFactor(gameStore.getState().save.player.meters);
        const yieldMultiplier = equipMult * survivalMult;
        prospect.start({
          siteId: nearestSite.site.id,
          siteRichness: site.richnessRemaining,
          actionCount,
          firstEver,
          yieldMultiplier,
        });
        console.log(
          `[prospect] start ${nearestSite.site.id} (richness=${site.richnessRemaining.toFixed(2)}, firstEver=${firstEver}, yield=${yieldMultiplier.toFixed(2)} = equip${equipMult.toFixed(2)} × survival${survivalMult.toFixed(2)})`,
        );
      }

      // 11. HUD
      const save = gameStore.getState().save;
      const interactGlyph =
        input.lastInputDevice() === 'gamepad'
          ? input.gamepadGlyphStyle() === 'playstation'
            ? '□'
            : 'X'
          : 'E';
      const shovelTierForPrompt = gameStore.getState().save.equipment.ownedTiers.shovel;
      const mineLocked = !mine.isUnlocked(shovelTierForPrompt);
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
                  ? {
                      text: mineLocked ? 'Mine sealed — needs a pickaxe' : 'Enter Mine',
                      glyph: interactGlyph,
                    }
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
