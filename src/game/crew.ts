import * as THREE from 'three';
import type { ClaimRecord } from '@/save/schema';
import type { PlacedMachine } from '@/game/machines/placed';

// Hired hands and claim jumpers as people in the world. Hands walk the
// machines. Jumpers stand on a claim until you confront them, then run.

export interface CrewUpdate {
  caughtClaimId: string | null;
  escapedClaimId: string | null;
}

export interface Crew {
  update(dt: number, args: CrewArgs): CrewUpdate;
  nearestJumper(x: number, z: number): { claimId: string; distance: number } | null;
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

interface JumperState {
  mesh: THREE.Group;
  phase: 'work' | 'flee';
  fleeFor: number;
  closeFor: number;
}

export function createCrew(scene: THREE.Scene): Crew {
  const root = new THREE.Group();
  root.name = 'crew';
  scene.add(root);
  const hands: THREE.Group[] = [];
  const jumpers = new Map<string, JumperState>();

  return {
    update(dt, args) {
      let caughtClaimId: string | null = null;
      let escapedClaimId: string | null = null;
      while (hands.length < args.hands) {
        const mesh = person(0x3d5270, 0xc2a36a);
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
        const route = [home, ...spots.map((m) => ({ x: m.x, z: m.z }))];
        if (route.length === 0) route.push(home);
        const leg = Math.floor(args.time * 0.22 + i) % route.length;
        const next = route[(leg + 1) % route.length] ?? home;
        const cur = route[leg] ?? home;
        const f = (args.time * 0.22 + i) % 1;
        const x = cur.x + (next.x - cur.x) * f;
        const z = cur.z + (next.z - cur.z) * f;
        mesh.position.set(x, args.groundY(x, z), z);
        mesh.rotation.y = Math.atan2(next.x - cur.x, next.z - cur.z);
        mesh.position.y += Math.abs(Math.sin(args.time * 6 + i)) * 0.04;
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
            new THREE.SphereGeometry(0.12, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x6b4e2e, flatShading: true }),
          );
          sack.position.set(0.22, 0.7, 0);
          mesh.add(sack);
          root.add(mesh);
          state = { mesh, phase: 'work', fleeFor: 0, closeFor: 0 };
          jumpers.set(claim.id, state);
        }
        if (state.phase === 'work') {
          const bob = Math.sin(args.time * 4) * 0.05;
          state.mesh.position.set(claim.x + 0.7, args.groundY(claim.x, claim.z) + bob, claim.z + 0.4);
          state.mesh.rotation.y = Math.atan2(args.playerX - claim.x, args.playerZ - claim.z);
        } else {
          state.fleeFor += dt;
          const dx = state.mesh.position.x - args.playerX;
          const dz = state.mesh.position.z - args.playerZ;
          const len = Math.max(0.001, Math.hypot(dx, dz));
          const step = 3.1 * dt;
          const x = state.mesh.position.x + (dx / len) * step;
          const z = state.mesh.position.z + (dz / len) * step;
          state.mesh.position.set(x, args.groundY(x, z), z);
          state.mesh.rotation.y = Math.atan2(dx, dz);
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
      let best: { claimId: string; distance: number } | null = null;
      for (const [id, state] of jumpers) {
        if (state.phase !== 'work') continue;
        const d = Math.hypot(state.mesh.position.x - x, state.mesh.position.z - z);
        if (!best || d < best.distance) best = { claimId: id, distance: d };
      }
      return best;
    },
    startChase(claimId) {
      const state = jumpers.get(claimId);
      if (state) state.phase = 'flee';
    },
  };
}

function person(shirt: number, hat: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 0.62, 6),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8, flatShading: true }),
  );
  body.position.y = 0.62;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.7, flatShading: true }),
  );
  head.position.y = 1.05;
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.04, 7),
    new THREE.MeshStandardMaterial({ color: hat, roughness: 0.85, flatShading: true }),
  );
  brim.position.y = 1.16;
  g.add(body, head, brim);
  return g;
}
