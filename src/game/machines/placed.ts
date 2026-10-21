import * as THREE from 'three';
import type { ClaimRecord, SaveV1 } from '@/save/schema';
import type { MinigameViz } from '@/game/minigames/types';

// Physical machines on a claim. Owning the tool plants it on the newest
// placer claim. The minigame view is separate; these are the world props
// hands walk up to.

export type MachineKind = 'rocker' | 'sluice' | 'longtom' | 'monitor';

export interface PlacedMachine {
  kind: MachineKind;
  claimId: string;
  x: number;
  z: number;
}

export interface PlacedMachines {
  sync(
    save: SaveV1,
    groundY: (x: number, z: number) => number,
    viz: MinigameViz | null,
    time: number,
  ): void;
  list(): readonly PlacedMachine[];
  nearest(x: number, z: number, radius: number): PlacedMachine | null;
}

const OFFSET: Record<MachineKind, { x: number; z: number }> = {
  rocker: { x: 2.3, z: 0.4 },
  sluice: { x: 0.5, z: 2.5 },
  longtom: { x: -2.4, z: 0.7 },
  monitor: { x: 0.3, z: -2.7 },
};

export function createPlacedMachines(scene: THREE.Scene): PlacedMachines {
  const root = new THREE.Group();
  root.name = 'claim-machines';
  scene.add(root);
  const built = new Map<string, THREE.Group>();
  let live: PlacedMachine[] = [];

  return {
    sync(save, groundY, viz, time) {
      const want = layout(save);
      live = want;
      const keys = new Set(want.map((m) => key(m)));
      for (const [id, group] of built) {
        if (keys.has(id)) continue;
        root.remove(group);
        built.delete(id);
      }
      for (const machine of want) {
        const id = key(machine);
        let group = built.get(id);
        if (!group) {
          group = buildProp(machine.kind);
          group.name = `machine-${machine.kind}`;
          root.add(group);
          built.set(id, group);
        }
        const y = groundY(machine.x, machine.z);
        group.position.set(machine.x, y, machine.z);
        animate(group, machine.kind, viz, time);
      }
    },
    list: () => live,
    nearest(x, z, radius) {
      let best: PlacedMachine | null = null;
      let bestD = radius;
      for (const machine of live) {
        const d = Math.hypot(machine.x - x, machine.z - z);
        if (d < bestD) {
          best = machine;
          bestD = d;
        }
      }
      return best;
    },
  };
}

export function layout(save: SaveV1): PlacedMachine[] {
  const claim = [...save.fieldwork.claims].reverse().find((c) => c.kind === 'placer');
  if (!claim) return [];
  const owned = save.equipment.ownedTiers;
  const imp = claim.improvements;
  const kinds: MachineKind[] = [];
  if (owned.rocker >= 1 || imp.rocker) kinds.push('rocker');
  if (owned.sluice >= 2 || imp.sluice) kinds.push('sluice');
  if (owned.longTom >= 1 || imp.longTom) kinds.push('longtom');
  if (owned.hydraulic >= 1 || imp.hydraulic) kinds.push('monitor');
  return kinds.map((kind) => ({
    kind,
    claimId: claim.id,
    x: claim.x + OFFSET[kind].x,
    z: claim.z + OFFSET[kind].z,
  }));
}

function key(m: PlacedMachine): string {
  return `${m.claimId}:${m.kind}`;
}

function wood(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true });
}

function buildProp(kind: MachineKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'rocker') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.38, 0.48), wood(0x8a5a32));
    body.position.y = 0.36;
    body.name = 'rocker-body';
    const legL = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 5, 10, Math.PI), wood(0x5c3b22));
    legL.rotation.y = Math.PI / 2;
    legL.position.set(-0.24, 0.16, 0);
    const legR = legL.clone();
    legR.position.x = 0.24;
    g.add(body, legL, legR);
  } else if (kind === 'sluice') {
    const trough = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 1.7), wood(0x6e4b2c));
    trough.position.y = 0.28;
    trough.rotation.z = 0.04;
    g.add(trough);
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.04), wood(0xc2a36a));
      bar.position.set(0, 0.38, -0.6 + i * 0.28);
      g.add(bar);
    }
  } else if (kind === 'longtom') {
    const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.4), wood(0x5c3d24));
    hopper.position.set(0, 0.5, 0.7);
    g.add(hopper);
    const trough = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 2.2), wood(0x4e3420));
    trough.position.set(0, 0.32, -0.4);
    g.add(trough);
    const grizzly = new THREE.Group();
    grizzly.name = 'grizzly';
    for (let i = 0; i < 4; i++) {
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.48, 5),
        new THREE.MeshStandardMaterial({ color: 0xb7b7b7, metalness: 0.4, roughness: 0.4 }),
      );
      rod.rotation.z = Math.PI / 2;
      rod.position.set(-0.15 + i * 0.1, 0.62, 0.35);
      grizzly.add(rod);
    }
    g.add(grizzly);
  } else {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), wood(0x333333));
    stand.position.y = 0.35;
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.09, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.45, roughness: 0.35 }),
    );
    nozzle.name = 'nozzle';
    nozzle.rotation.z = -0.8;
    nozzle.position.set(0.2, 0.62, 0);
    g.add(stand, nozzle);
  }
  return g;
}

function animate(group: THREE.Group, kind: MachineKind, viz: MinigameViz | null, time: number): void {
  if (kind === 'rocker') {
    const body = group.getObjectByName('rocker-body');
    const rock = viz?.kind === 'rocker' ? viz.rock : (Math.sin(time * 1.6) + 1) / 2;
    if (body) body.rotation.z = (rock - 0.5) * 0.45;
  } else if (kind === 'longtom') {
    const grizzly = group.getObjectByName('grizzly');
    const shake = viz?.kind === 'longtom' ? viz.shake : (Math.sin(time * 3) + 1) / 2;
    if (grizzly) grizzly.position.y = (shake - 0.5) * 0.04;
  } else if (kind === 'monitor') {
    const nozzle = group.getObjectByName('nozzle');
    const aim = viz?.kind === 'monitor' ? viz.aim : 0.5 + Math.sin(time * 0.6) * 0.08;
    if (nozzle) nozzle.rotation.z = -0.55 - aim * 0.6;
  }
}
