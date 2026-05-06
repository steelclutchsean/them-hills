// Physics world: thin wrapper over Rapier so the rest of the game doesn't import RAPIER directly
// outside of areas that need its types. Initialization is async because Rapier ships as WASM.

import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

export interface PhysicsWorld {
  rapier: RAPIER.World;
  step(): void;
}

const FIXED_TIMESTEP = 1 / 60;

let initialized = false;

export async function ensureRapierReady(): Promise<void> {
  if (initialized) return;
  await RAPIER.init();
  initialized = true;
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  await ensureRapierReady();
  const gravity = new RAPIER.Vector3(0, -9.81, 0);
  const world = new RAPIER.World(gravity);
  world.timestep = FIXED_TIMESTEP;
  return {
    rapier: world,
    step: () => world.step(),
  };
}
