import * as THREE from 'three';
import type { ClaimRecord } from '@/save/schema';
import { createCrewVariant } from '@/game/character-asset';
import type { PlacedMachine } from '@/game/machines/placed';
import { PALETTE } from '@/render/palette';
import { markReflective } from '@/render/reflection';

// Hired hands and claim jumpers. Hands shovel, rock, or work a hose.
// A jumper steals until you close in, then squares up before you can answer.

export interface CrewUpdate {
  caughtClaimId: string | null;
  escapedClaimId: string | null;
}

export interface Crew {
  update(dt: number, args: CrewArgs): CrewUpdate;
  nearestJumper(x: number, z: number): { claimId: string; distance: number; ready: boolean } | null;
  startChase(claimId: string): void;
}

interface CrewArgs {
  claims: readonly ClaimRecord[];
  hands: number;
  playerX: number;
  playerZ: number;
  groundY: (x: number, z: number) => number;
  machines: readonly PlacedMachine[];
  time: number;
}

type Work = 'walk' | 'shovel' | 'rock' | 'hose' | 'steal' | 'square' | 'idle';

interface JumperState {
  mesh: THREE.Group;
  phase: 'scout' | 'sneak' | 'bluster' | 'steal' | 'approach' | 'square' | 'flee';
  /** Chosen while they are still circling. */
  intent: 'sneak' | 'bluster';
  fleeFor: number;
  closeFor: number;
  approachFor: number;
  scoutFor: number;
}

export function createCrew(scene: THREE.Scene): Crew {
  const root = new THREE.Group();
  root.name = 'crew';
  markReflective(root);
  scene.add(root);
  const hands: THREE.Group[] = [];
  const jumpers = new Map<string, JumperState>();

  return {
    update(dt, args) {
      let caughtClaimId: string | null = null;
      let escapedClaimId: string | null = null;
      while (hands.length < args.hands) {
        const mesh = person(0x3d5270, PALETTE.bark);
        mesh.name = `hand-${hands.length}`;
        root.add(mesh);
        hands.push(mesh);
      }
      for (let i = 0; i < hands.length; i++) {
        const mesh = hands[i]!;
        mesh.visible = i < args.hands;
        if (!mesh.visible) continue;
        const claim = args.claims[i % Math.max(1, args.claims.length)];
        const spots = args.machines.filter((m) => !claim || m.claimId === claim.id);
        const home = claim ? { x: claim.x, z: claim.z } : { x: 0, z: 0 };
        const route =
          spots.length > 0
            ? spots.map((m) => ({ x: m.x, z: m.z, kind: m.kind }))
            : [{ x: home.x, z: home.z, kind: 'rocker' as const }];
        const leg = Math.floor(args.time * 0.18 + i) % route.length;
        const next = route[(leg + 1) % route.length] ?? route[0]!;
        const cur = route[leg] ?? route[0]!;
        const f = (args.time * 0.18 + i) % 1;
        const traveling = f < 0.72;
        const x = traveling ? cur.x + (next.x - cur.x) * (f / 0.72) : next.x;
        const z = traveling ? cur.z + (next.z - cur.z) * (f / 0.72) : next.z;
        mesh.position.set(x, args.groundY(x, z), z);
        const faceX = traveling ? next.x - cur.x : args.playerX - x;
        const faceZ = traveling ? next.z - cur.z : args.playerZ - z;
        if (Math.hypot(faceX, faceZ) > 0.05) mesh.rotation.y = Math.atan2(faceX, faceZ);
        const work: Work = traveling
          ? 'walk'
          : next.kind === 'monitor'
            ? 'hose'
            : next.kind === 'rocker'
              ? 'rock'
              : 'shovel';
        pose(mesh, args.time, work, i);
      }

      const live = new Set(args.claims.filter((c) => c.jumperSince !== null).map((c) => c.id));
      for (const [id, state] of jumpers) {
        if (live.has(id) || state.phase === 'flee') continue;
        root.remove(state.mesh);
        jumpers.delete(id);
      }
      for (const claim of args.claims) {
        if (claim.jumperSince === null) continue;
        let state = jumpers.get(claim.id);
        if (!state) {
          const mesh = person(0x8c2f2f, 0x24180f);
          mesh.name = `jumper-${claim.id}`;
          const sack = new THREE.Mesh(
            new THREE.SphereGeometry(0.13, 7, 6),
            new THREE.MeshStandardMaterial({ color: PALETTE.timberDark, roughness: 0.8 }),
          );
          sack.name = 'sack';
          sack.position.set(0.28, 0.95, 0.18);
          sack.castShadow = true;
          mesh.add(sack);
          // Fill from the front and a warm rim from behind. These stay on the
          // group (not the proxy) so the hero swap does not throw them away.
          const fill = new THREE.PointLight(0xfff4e4, 6, 3.2, 2);
          fill.name = 'jumper-fill';
          fill.position.set(0, 1.7, 0.9);
          fill.castShadow = false;
          fill.layers.enable(1);
          const rim = new THREE.PointLight(0xffb56a, 4, 2.8, 2);
          rim.name = 'jumper-rim';
          rim.position.set(-0.25, 1.95, -0.9);
          rim.castShadow = false;
          rim.layers.enable(1);
          mesh.add(fill, rim);
          root.add(mesh);
          const intent: 'sneak' | 'bluster' = claim.id.charCodeAt(claim.id.length - 1) % 2 === 0 ? 'sneak' : 'bluster';
          state = { mesh, phase: 'scout', intent, fleeFor: 0, closeFor: 0, approachFor: 0, scoutFor: 0 };
          jumpers.set(claim.id, state);
        }
        const machine = args.machines.find((m) => m.claimId === claim.id);
        const fx = machine ? -Math.sin(machine.yaw) : 0;
        const fz = machine ? -Math.cos(machine.yaw) : 1;
        const homeX = machine ? machine.x - fx * 0.75 : claim.x;
        const homeZ = machine ? machine.z - fz * 0.75 : claim.z;
        const dist = Math.hypot(
          state.mesh.position.x - args.playerX,
          state.mesh.position.z - args.playerZ,
        );
        if (state.phase === 'scout') {
          state.scoutFor += dt;
          const ang = args.time * 0.7 + claim.x;
          const radius = 2.3;
          const x = homeX + Math.cos(ang) * radius;
          const z = homeZ + Math.sin(ang) * radius;
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = ang + Math.PI / 2;
          pose(state.mesh, args.time, 'square', 0);
          if (state.scoutFor > 5.5) state.phase = state.intent;
        } else if (state.phase === 'sneak') {
          const coverX = homeX + 6.5;
          const coverZ = homeZ - 2.4;
          if (state.scoutFor < 6) {
            state.mesh.position.set(coverX, args.groundY(coverX, coverZ), coverZ);
          }
          state.scoutFor += dt;
          const dx = homeX - state.mesh.position.x;
          const dz = homeZ - state.mesh.position.z;
          const len = Math.max(0.001, Math.hypot(dx, dz));
          const step = Math.min(len, 1.05 * dt);
          const x = state.mesh.position.x + (dx / len) * step;
          const z = state.mesh.position.z + (dz / len) * step;
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = Math.atan2(dx, dz);
          pose(state.mesh, args.time, 'walk', 3);
          if (dist < 5.5) state.phase = 'approach';
          else if (len < 1.2) state.phase = 'steal';
        } else if (state.phase === 'bluster') {
          const dx = args.playerX - state.mesh.position.x;
          const dz = args.playerZ - state.mesh.position.z;
          const len = Math.max(0.001, Math.hypot(dx, dz));
          const step = Math.min(Math.max(0, len - 2.2), 2.3 * dt);
          const x = state.mesh.position.x + (dx / len) * step;
          const z = state.mesh.position.z + (dz / len) * step;
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = Math.atan2(dx, dz);
          pose(state.mesh, args.time, 'walk', 4);
          if (len < 3.2) state.phase = 'square';
        } else if (state.phase === 'steal' && dist < 8) state.phase = 'approach';
        if (state.phase === 'steal') {
          const x = homeX;
          const z = homeZ;
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = machine ? machine.yaw + Math.PI : 0;
          pose(state.mesh, args.time, 'steal', 0);
        } else if (state.phase === 'approach') {
          state.approachFor += dt;
          const dx = args.playerX - state.mesh.position.x;
          const dz = args.playerZ - state.mesh.position.z;
          const len = Math.max(0.001, Math.hypot(dx, dz));
          const step = Math.min(len - 2.4, 2.4 * dt);
          const x = state.mesh.position.x + (dx / len) * Math.max(0, step);
          const z = state.mesh.position.z + (dz / len) * Math.max(0, step);
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = Math.atan2(dx, dz);
          pose(state.mesh, args.time, 'walk', 1);
          if (state.approachFor > 1.15 || len < 2.7) state.phase = 'square';
        } else if (state.phase === 'square') {
          const dx = args.playerX - state.mesh.position.x;
          const dz = args.playerZ - state.mesh.position.z;
          state.mesh.rotation.y = Math.atan2(dx, dz);
          state.mesh.position.y = args.groundY(state.mesh.position.x, state.mesh.position.z);
          pose(state.mesh, args.time, 'square', 0);
        } else if (state.phase === 'flee') {
          state.fleeFor += dt;
          const dx = state.mesh.position.x - args.playerX;
          const dz = state.mesh.position.z - args.playerZ;
          const len = Math.max(0.001, Math.hypot(dx, dz));
          const x = state.mesh.position.x + (dx / len) * 3.1 * dt;
          const z = state.mesh.position.z + (dz / len) * 3.1 * dt;
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = Math.atan2(dx, dz);
          pose(state.mesh, args.time, 'walk', 2);
          if (len < 4.2) state.closeFor += dt;
          else state.closeFor = Math.max(0, state.closeFor - dt);
          if (state.closeFor > 2.4) {
            caughtClaimId = claim.id;
            root.remove(state.mesh);
            jumpers.delete(claim.id);
          } else if (state.fleeFor > 11 && len > 9) {
            escapedClaimId = claim.id;
            root.remove(state.mesh);
            jumpers.delete(claim.id);
          }
        }
      }
      return { caughtClaimId, escapedClaimId };
    },
    nearestJumper(x, z) {
      let best: { claimId: string; distance: number; ready: boolean } | null = null;
      for (const [id, state] of jumpers) {
        if (state.phase === 'flee') continue;
        const d = Math.hypot(state.mesh.position.x - x, state.mesh.position.z - z);
        const ready = state.phase === 'square' || state.phase === 'bluster';
        if (!best || d < best.distance) best = { claimId: id, distance: d, ready };
      }
      return best;
    },
    startChase(claimId) {
      const state = jumpers.get(claimId);
      if (state && state.phase !== 'flee') state.phase = 'flee';
    },
  };
}

function limb(mesh: THREE.Group, bone: string, proxy: string): THREE.Object3D | null {
  return mesh.getObjectByName(bone) ?? mesh.getObjectByName(proxy) ?? null;
}

/** Add a swing on top of the bone rest so a skinned ranger and the proxy share one pose. */
function swing(obj: THREE.Object3D | null, x: number, z = 0): void {
  if (!obj) return;
  const restX = typeof obj.userData.restX === 'number' ? obj.userData.restX : 0;
  const restZ = typeof obj.userData.restZ === 'number' ? obj.userData.restZ : 0;
  obj.rotation.x = restX + x;
  obj.rotation.z = restZ + z;
}

function pose(mesh: THREE.Group, time: number, work: Work, seed: number): void {
  const armL = limb(mesh, 'upperarm_l', 'arm-l');
  const armR = limb(mesh, 'upperarm_r', 'arm-r');
  const legL = limb(mesh, 'thigh_l', 'leg-l');
  const legR = limb(mesh, 'thigh_r', 'leg-r');
  const shovel = mesh.getObjectByName('shovel');
  const hose = mesh.getObjectByName('hand-hose');
  if (shovel) shovel.visible = work === 'shovel' || work === 'steal';
  if (hose) hose.visible = work === 'hose';
  const swingAmt = Math.sin(time * 7 + seed);
  if (work === 'walk') {
    swing(armL, swingAmt * 0.7);
    swing(armR, -swingAmt * 0.7);
    swing(legL, -swingAmt * 0.55);
    swing(legR, swingAmt * 0.55);
    mesh.position.y += Math.abs(swingAmt) * 0.03;
  } else if (work === 'shovel' || work === 'steal') {
    const dig = Math.sin(time * 3.2 + seed);
    swing(armL, -0.4 + dig * 0.9);
    swing(armR, -0.8 + dig * 0.55);
    swing(legL, 0.1);
    swing(legR, -0.15);
  } else if (work === 'idle') {
    swing(armL, -0.42, 0.18 + Math.sin(time * 1.3 + seed) * 0.04);
    swing(armR, -0.5, -0.22);
    swing(legL, 0.04);
    swing(legR, -0.06);
  } else if (work === 'rock') {
    const rock = Math.sin(time * 2.6 + seed);
    swing(armL, -0.6);
    swing(armR, -0.4, rock * 0.8);
    swing(legL, 0.05);
    swing(legR, -0.05);
  } else if (work === 'hose') {
    swing(armL, -1.1);
    swing(armR, -1.15 + Math.sin(time * 1.4) * 0.12);
    swing(legL, 0.2);
    swing(legR, -0.1);
  } else {
    swing(armL, -2.4, 0.4);
    swing(armR, -2.4, -0.4);
    swing(legL, 0.15);
    swing(legR, -0.2);
  }
}

export function spawnNpc(shirt: number, hat: number, variant = 0): THREE.Group {
  return person(shirt, hat, variant);
}

export function poseNpc(mesh: THREE.Group, time: number, work: 'idle' | 'walk' | 'shovel', seed = 0): void {
  pose(mesh, time, work, seed);
}

function person(shirt: number, hat: number, variant = 0): THREE.Group {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: shirt,
    roughness: 0.78,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9926a, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.timberDark, roughness: 0.86 });
  const hatMat = new THREE.MeshStandardMaterial({ color: hat, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.52, 7), cloth);
  body.position.y = 0.78;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), skin);
  head.position.y = 1.16;
  head.castShadow = true;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 8), hatMat);
  brim.position.y = 1.26;
  brim.castShadow = true;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 8), hatMat);
  crown.position.y = 1.32;
  g.add(body, head, brim, crown);

  const legGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.42, 6);
  const legL = new THREE.Mesh(legGeo, dark);
  legL.name = 'leg-l';
  legL.position.set(-0.08, 0.28, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, dark);
  legR.name = 'leg-r';
  legR.position.set(0.08, 0.28, 0);
  legR.castShadow = true;
  g.add(legL, legR);

  const armGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.42, 6);
  const armL = new THREE.Group();
  armL.name = 'arm-l';
  armL.position.set(-0.24, 0.98, 0);
  const armLMesh = new THREE.Mesh(armGeo, cloth);
  armLMesh.position.y = -0.2;
  armLMesh.castShadow = true;
  armL.add(armLMesh);
  const shovel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.03), dark);
  shovel.position.set(0.02, -0.35, 0.16);
  shovel.rotation.x = 0.5;
  shovel.name = 'shovel';
  shovel.visible = false;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x8d8478, metalness: 0.45, roughness: 0.4 }),
  );
  blade.position.set(0.02, -0.64, 0.28);
  shovel.add(blade);
  armL.add(shovel);
  const armR = new THREE.Group();
  armR.name = 'arm-r';
  armR.position.set(0.24, 0.98, 0);
  const armRMesh = new THREE.Mesh(armGeo, cloth);
  armRMesh.position.y = -0.2;
  armRMesh.castShadow = true;
  armR.add(armRMesh);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 10, Math.PI), dark);
  hose.name = 'hand-hose';
  hose.position.set(-0.05, -0.28, 0.12);
  hose.visible = false;
  armR.add(hose);
  g.add(armL, armR);
  for (const child of g.children) child.userData.proxy = true;
  queueHero(g, shirt, hat, variant);
  return g;
}

const heroQueue: { mesh: THREE.Group; shirt: number; hat: number; variant: number }[] = [];
let heroDrain: Promise<void> | null = null;

function queueHero(mesh: THREE.Group, shirt: number, hat: number, variant = 0): void {
  heroQueue.push({ mesh, shirt, hat, variant });
  heroDrain ??= drainHeroes();
}

async function drainHeroes(): Promise<void> {
  try {
    while (heroQueue.length > 0) {
      const batch = heroQueue.splice(0);
      for (const item of batch) {
        if (item.mesh.userData.hero === true) continue;
        try {
          const hero = await createCrewVariant(item.shirt, item.hat, item.variant);
          const extras = item.mesh.children.filter((child) => child.userData.proxy !== true);
          item.mesh.clear();
          item.mesh.add(hero);
          for (const extra of extras) item.mesh.add(extra);
          item.mesh.userData.hero = true;
        } catch (err) {
          console.warn('[crew] ranger variant failed, keeping the proxy', err);
        }
      }
    }
  } finally {
    heroDrain = null;
    if (heroQueue.length > 0) heroDrain = drainHeroes();
  }
}
