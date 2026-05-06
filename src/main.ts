import { createCameraRig } from '@/game/camera-rig';
import { createCharacter } from '@/game/character';
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

  // ---- Character ----
  // Spawn slightly above terrain so the controller's snap-to-ground settles us.
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

  // ---- Pointer lock on canvas click (mouse-look) ----
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  // ---- HUD ----
  const hud = mountHud(hudEl);

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
    };
  }

  // ---- Game loop ----
  const loop = createGameLoop({
    update: (dt) => {
      input.poll();
      const moveInput = input.getMoveInput();
      const lookDelta = input.getLookDelta(dt);
      const jumpDown = input.isActive('JUMP');
      const sprintDown = input.isActive('SPRINT');

      // 1. Update camera yaw/pitch first so character can read it
      cameraRig.applyLook(lookDelta);

      // 2. Character intent (sets next kinematic translation)
      character.preStep(dt, moveInput, jumpDown, sprintDown, cameraRig.getYaw());

      // 3. Physics resolves
      physics.step();

      // 4. Visual update for character (reads final body translation)
      character.postStep(dt);

      // 5. Camera follows character to its new position
      cameraRig.placeCamera(character.getPosition(), physics.rapier, character.getColliderHandle());

      // 6. HUD
      const pos = character.getPosition();
      hud.update({
        device: input.lastInputDevice(),
        gamepadGlyph: input.gamepadGlyphStyle(),
        actions: input.snapshot(),
        position: { x: pos.x, y: pos.y, z: pos.z },
        characterState: character.getState(),
        stamina: character.getStamina(),
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

  console.log('[bootstrap] Them Hills ready (Phase 1)');
  console.log('  Click canvas to lock mouse for camera control.');
  console.log('  WASD or left stick to move; Shift / L3 to sprint; Space / A to jump.');
}

bootstrap().catch((e: unknown) => {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error('[bootstrap] fatal', err);
  document.body.innerHTML = `<pre style="color:#f55; padding: 24px; font-family: monospace; white-space: pre-wrap;">Bootstrap failed:\n${err.stack ?? err.message}</pre>`;
});
