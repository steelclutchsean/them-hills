import { createCameraRig } from '@/game/camera-rig';
import { createCharacter } from '@/game/character';
import { createProspectingController } from '@/game/prospecting';
import { createStream } from '@/game/stream';
import { createTerrain } from '@/game/terrain';
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

  // ---- Renderer ----
  const renderer = createRenderer(canvas);

  // ---- Physics ----
  const physics = await createPhysicsWorld();

  // ---- Terrain ----
  const terrain = createTerrain(physics.rapier);
  renderer.scene.add(terrain.mesh);

  // ---- Stream + sites ----
  const stream = createStream(terrain);
  renderer.scene.add(stream.group);

  // ---- Character ----
  const spawnX = persistedPlayer.position.x;
  const spawnZ = persistedPlayer.position.z;
  const groundY = terrain.getHeightAt(spawnX, spawnZ);
  const spawnY = Math.max(persistedPlayer.position.y, groundY + 1.5);
  const character = createCharacter({
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

  // ---- Save snapshot helper ----
  function buildSaveSnapshot(): SaveV1 {
    const base = gameStore.getState().serialize();
    const charSer = character.serialize();
    return {
      ...base,
      player: {
        ...base.player,
        position: charSer.position,
        rotation: charSer.rotation,
        meters: { ...base.player.meters, stamina: charSer.stamina },
      },
      world: { ...base.world, gameTime: worldTime },
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

      // 2. Determine whether character can move (locked while prospecting)
      const prospecting = prospect.isActive();
      const moveInput = prospecting ? { x: 0, y: 0 } : input.getMoveInput();
      const jumpDown = prospecting ? false : input.isActive('JUMP');
      const sprintDown = prospecting ? false : input.isActive('SPRINT');

      // 3. Character intent
      character.preStep(dt, moveInput, jumpDown, sprintDown, cameraRig.getYaw());

      // 4. Physics
      physics.step();

      // 5. Character visuals
      character.postStep(dt);

      // 6. Camera position
      cameraRig.placeCamera(character.getPosition(), physics.rapier, character.getColliderHandle());

      // 7. Stream visuals + nearest-site detection
      const charPos = character.getPosition();
      const nearest = !prospecting ? stream.findNearestSite(charPos) : null;
      stream.update(
        worldTime,
        charPos,
        prospecting ? (prospect.getSnapshot()?.siteId ?? null) : (nearest?.site.id ?? null),
      );

      // 8. Site richness regen (slow, only when not actively working)
      gameStore.getState().regenSites(dt, worldTime);

      // 9. Prospecting state machine
      if (!prospecting && nearest && interactJustPressed) {
        const site = gameStore.getState().getOrCreateSite(nearest.site.id);
        const actionCount = gameStore.getState().incrementPanCount();
        const firstEver = actionCount === 1;
        prospect.start({
          siteId: nearest.site.id,
          siteRichness: site.richnessRemaining,
          actionCount,
          firstEver,
        });
        console.log(
          `[prospect] start ${nearest.site.id} (richness=${site.richnessRemaining.toFixed(2)}, firstEver=${firstEver})`,
        );
      } else if (prospecting && pauseJustPressed) {
        prospect.cancel();
        console.log('[prospect] cancelled');
      } else if (prospecting) {
        const result = prospect.update(dt, interactDown);
        if (result) {
          gameStore.getState().addGoldToCarry(result.reward);
          gameStore.getState().touchSite(result.siteId, result.richnessDepletion, worldTime);
          const totalG = result.reward.flake_g + result.reward.picker_g + result.reward.nugget_g;
          console.log(
            `[prospect] reward at ${result.siteId}: ${totalG.toFixed(3)}g ` +
              `(flake=${result.reward.flake_g.toFixed(3)}, picker=${result.reward.picker_g.toFixed(3)}, nugget=${result.reward.nugget_g.toFixed(3)})`,
          );
        }
      }

      // 10. HUD
      const save = gameStore.getState().save;
      const promptInfo =
        !prospecting && nearest
          ? {
              text: 'Prospect',
              glyph:
                input.lastInputDevice() === 'gamepad'
                  ? input.gamepadGlyphStyle() === 'playstation'
                    ? '□'
                    : 'X'
                  : 'E',
            }
          : null;
      hud.update({
        device: input.lastInputDevice(),
        gamepadGlyph: input.gamepadGlyphStyle(),
        actions: input.snapshot(),
        position: { x: charPos.x, y: charPos.y, z: charPos.z },
        characterState: character.getState(),
        stamina: character.getStamina(),
        inventory: save.inventory.carry.gold,
        spotPricePerOzt: save.economy.spotPrice.current,
        prompt: promptInfo,
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

  console.log('[bootstrap] Them Hills ready (Phase 2 — Core Loop)');
  console.log(
    '  Walk to the stream (~10m east of spawn), approach a glowing ring, press E / X / □ to prospect.',
  );
  console.log(
    '  Steps: HOLD to dig → TAP rapidly to classify → TAP with rhythm to pan → TAP to collect.',
  );
  console.log('  Press Esc / Menu to cancel.');
}

bootstrap().catch((e: unknown) => {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error('[bootstrap] fatal', err);
  document.body.innerHTML = `<pre style="color:#f55; padding: 24px; font-family: monospace; white-space: pre-wrap;">Bootstrap failed:\n${err.stack ?? err.message}</pre>`;
});
