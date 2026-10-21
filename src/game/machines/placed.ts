import * as THREE from 'three';
import type { ClaimRecord, SaveV1 } from '@/save/schema';
import type { MinigameViz } from '@/game/minigames/types';
import type { Watercourse } from '@/game/watercourse';
import { PALETTE } from '@/render/palette';
import { addGoldFlake, cutTimber } from '@/render/painterly';
import { markReflective } from '@/render/reflection';

// Claim machines on the dry bank, built like the town timber: painted grain,
// iron straps, water in the box, gold sitting in the riffles.

export type MachineKind = 'rocker' | 'sluice' | 'longtom' | 'monitor';

export interface PlacedMachine {
  kind: MachineKind;
  claimId: string;
  x: number;
  z: number;
  /** Faces the creek. Player stands behind the hopper. */
  yaw: number;
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

const ALONG: Record<MachineKind, number> = {
  rocker: -1.4,
  sluice: 2.4,
  longtom: -5.4,
  monitor: 6.2,
};

const REACH: Record<MachineKind, number> = {
  rocker: 1.95,
  sluice: 2.55,
  longtom: 2.95,
  monitor: 2.7,
};

export function createPlacedMachines(
  scene: THREE.Scene,
  courses: readonly Watercourse[],
): PlacedMachines {
  const root = new THREE.Group();
  root.name = 'claim-machines';
  markReflective(root);
  scene.add(root);
  const built = new Map<string, THREE.Group>();
  let live: PlacedMachine[] = [];

  return {
    sync(save, groundY, viz, time) {
      const want = layout(save, courses);
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
        // Local +Z runs toward the creek, the same way the player looks.
        group.rotation.y = machine.yaw + Math.PI;
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

export function layout(save: SaveV1, courses: readonly Watercourse[]): PlacedMachine[] {
  const claim = [...save.fieldwork.claims].reverse().find((c) => c.kind === 'placer');
  if (!claim || courses.length === 0) return [];
  const pad = bankPad(courses, claim);
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
    x: pad.x + pad.tx * ALONG[kind],
    z: pad.z + pad.tz * ALONG[kind],
    yaw: pad.yaw,
  }));
}

/** Where the prospector stands to work a machine. */
export function workStance(machine: PlacedMachine): { x: number; z: number; yaw: number } {
  const fx = -Math.sin(machine.yaw);
  const fz = -Math.cos(machine.yaw);
  const side = machine.kind === 'monitor' ? 0.55 : 0.2;
  return {
    x: machine.x - fx * REACH[machine.kind] + -fz * side,
    z: machine.z - fz * REACH[machine.kind] + fx * side,
    yaw: machine.yaw,
  };
}

function bankPad(
  courses: readonly Watercourse[],
  claim: ClaimRecord,
): { x: number; z: number; yaw: number; tx: number; tz: number } {
  let best = courses[0]!;
  let query = best.nearest(claim.x, claim.z);
  for (const course of courses) {
    const next = course.nearest(claim.x, claim.z);
    if (next.dist < query.dist) {
      best = course;
      query = next;
    }
  }
  const s = query.sample;
  const side =
    Math.abs(query.lateral) > 0.2 ? Math.sign(query.lateral) : s.bar === 0 ? 1 : Math.sign(s.bar);
  const out = side === 0 ? 1 : side;
  const dist = s.halfWidth + 3.8;
  return {
    x: s.x + s.tz * out * dist,
    z: s.z - s.tx * out * dist,
    yaw: Math.atan2(s.tz * out, -s.tx * out),
    tx: s.tx,
    tz: s.tz,
  };
}

function key(m: PlacedMachine): string {
  return `${m.claimId}:${m.kind}`;
}

function timber(sx: number, sy: number, dark = false): THREE.MeshStandardMaterial {
  return cutTimber(sx, sy, dark);
}

function iron(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x8d8680,
    roughness: 0.32,
    metalness: 0.92,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
  });
}

const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(PALETTE.waterShallow) },
    uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
    uFoam: { value: new THREE.Color(PALETTE.foam) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uShallow;
    uniform vec3 uDeep;
    uniform vec3 uFoam;
    varying vec2 vUv;
    void main() {
      float flow = vUv.y * 6.0 - uTime * 1.4;
      float rip = sin(flow * 9.0 + vUv.x * 18.0) * 0.5 + 0.5;
      float foam = smoothstep(0.62, 0.95, sin(flow * 4.0) * sin(vUv.x * 36.0 + uTime));
      vec3 col = mix(uDeep, uShallow, rip);
      col = mix(col, uFoam, foam * 0.8);
      float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
      gl_FragColor = vec4(col, 0.78 * edge);
    }
  `,
});

function stamp(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geom.getAttribute('uv');
  if (uv && !geom.getAttribute('uv2')) geom.setAttribute('uv2', uv);
  return geom;
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(stamp(new THREE.BoxGeometry(w, h, d)), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function water(w: number, len: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, len), waterMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.name = 'race-water';
  mesh.castShadow = false;
  return mesh;
}

function flakes(
  parent: THREE.Group,
  count: number,
  x0: number,
  z0: number,
  dz: number,
  y: number,
): void {
  for (let i = 0; i < count; i++) {
    const holder = new THREE.Group();
    holder.name = `flake-${i}`;
    addGoldFlake(holder, i % 3 === 0 ? 0.085 : 0.058, 0, 0, 0);
    holder.position.set(x0 + ((i % 3) - 1) * 0.08, y, z0 + i * dz);
    parent.add(holder);
  }
}

function buildProp(kind: MachineKind): THREE.Group {
  const g = new THREE.Group();
  const wood = timber(1.4, 2.2);
  const dark = timber(1, 1.6, true);
  const metal = iron();
  if (kind === 'rocker') buildRocker(g, wood, dark, metal);
  else if (kind === 'sluice') buildSluice(g, wood, dark, metal);
  else if (kind === 'longtom') buildTom(g, wood, dark, metal);
  else buildMonitor(g, wood, dark, metal);
  return g;
}

function buildRocker(
  g: THREE.Group,
  wood: THREE.Material,
  dark: THREE.Material,
  metal: THREE.Material,
): void {
  const body = new THREE.Group();
  body.name = 'rocker-body';
  body.position.y = 0.62;
  body.add(box(0.92, 0.08, 1.15, wood, 0, 0, 0));
  body.add(box(0.06, 0.28, 1.15, dark, -0.43, 0.16, 0));
  body.add(box(0.06, 0.28, 1.15, dark, 0.43, 0.16, 0));
  body.add(box(0.92, 0.22, 0.06, dark, 0, 0.14, -0.54));
  body.add(box(0.86, 0.04, 0.04, dark, 0, 0.08, -0.2));
  body.add(box(0.86, 0.04, 0.04, dark, 0, 0.08, 0.05));
  body.add(box(0.86, 0.04, 0.04, dark, 0, 0.08, 0.3));
  body.add(water(0.78, 0.9, 0, 0.1, 0.02));
  body.add(box(0.72, 0.2, 0.36, dark, 0, 0.32, -0.48));
  body.add(box(0.9, 0.025, 0.04, metal, 0, 0.22, -0.15));
  flakes(body, 5, 0, -0.15, 0.16, 0.36);
  const handle = box(0.08, 0.08, 0.7, dark, 0.55, 0.2, 0);
  body.add(handle);
  g.add(body);
  for (const side of [-0.34, 0.34]) {
    const rocker = new THREE.Mesh(
      stamp(new THREE.TorusGeometry(0.34, 0.035, 6, 14, Math.PI)),
      dark,
    );
    rocker.rotation.y = Math.PI / 2;
    rocker.position.set(side, 0.34, 0);
    rocker.castShadow = true;
    g.add(rocker);
  }
  g.add(box(0.08, 0.04, 0.9, metal, -0.34, 0.04, 0));
  g.add(box(0.08, 0.04, 0.9, metal, 0.34, 0.04, 0));
}

function buildSluice(
  g: THREE.Group,
  wood: THREE.Material,
  dark: THREE.Material,
  metal: THREE.Material,
): void {
  const race = new THREE.Group();
  race.name = 'sluice-body';
  race.rotation.x = -0.07;
  race.position.y = 0.58;
  race.add(box(0.62, 0.05, 3.15, wood, 0, 0, 0.15));
  race.add(box(0.05, 0.2, 3.15, dark, -0.3, 0.1, 0.15));
  race.add(box(0.05, 0.2, 3.15, dark, 0.3, 0.1, 0.15));
  for (let i = 0; i < 7; i++) {
    race.add(box(0.54, 0.045, 0.045, dark, 0, 0.07, -0.9 + i * 0.36));
    race.add(box(0.5, 0.02, 0.02, metal, 0, 0.1, -0.9 + i * 0.36));
  }
  race.add(water(0.5, 2.7, 0, 0.09, 0.25));
  flakes(race, 6, 0, -0.7, 0.34, 0.2);
  const hopper = box(0.7, 0.28, 0.48, dark, 0, 0.22, -1.35);
  race.add(hopper);
  const mound = new THREE.Mesh(stamp(new THREE.SphereGeometry(0.16, 8, 6)), timber(1, 1, true));
  mound.scale.set(1.2, 0.45, 0.8);
  mound.position.set(0, 0.32, -1.32);
  race.add(mound);
  g.add(race);
  g.add(box(0.08, 0.52, 0.08, dark, -0.24, 0.26, -1.15));
  g.add(box(0.08, 0.38, 0.08, dark, 0.24, 0.19, -1.15));
  g.add(box(0.08, 0.28, 0.08, dark, -0.24, 0.14, 1.45));
  g.add(box(0.08, 0.2, 0.08, dark, 0.24, 0.1, 1.45));
  g.add(box(0.04, 0.08, 3.2, metal, -0.28, 0.62, 0.15));
  g.add(box(0.04, 0.08, 3.2, metal, 0.28, 0.5, 0.15));
}

function buildTom(
  g: THREE.Group,
  wood: THREE.Material,
  dark: THREE.Material,
  metal: THREE.Material,
): void {
  const race = new THREE.Group();
  race.rotation.x = -0.05;
  race.position.y = 0.5;
  race.add(box(0.7, 0.05, 4.05, wood, 0, 0, -0.2));
  race.add(box(0.05, 0.22, 4.05, dark, -0.34, 0.12, -0.2));
  race.add(box(0.05, 0.22, 4.05, dark, 0.34, 0.12, -0.2));
  race.add(water(0.56, 3.2, 0, 0.08, -0.35));
  flakes(race, 7, 0, -1.2, 0.36, 0.22);
  for (let i = 0; i < 8; i++) race.add(box(0.6, 0.04, 0.04, dark, 0, 0.07, -1.5 + i * 0.38));
  g.add(race);
  const hopper = box(0.78, 0.36, 0.62, dark, 0, 0.78, 1.45);
  g.add(hopper);
  const grizzly = new THREE.Group();
  grizzly.name = 'grizzly';
  grizzly.position.set(0, 1.02, 1.45);
  for (let i = 0; i < 6; i++) {
    const rod = new THREE.Mesh(stamp(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6)), metal);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 0, -0.22 + i * 0.09);
    rod.castShadow = true;
    grizzly.add(rod);
  }
  g.add(grizzly);
  g.add(box(0.08, 0.62, 0.08, dark, -0.28, 0.31, 1.2));
  g.add(box(0.08, 0.62, 0.08, dark, 0.28, 0.31, 1.2));
  g.add(box(0.08, 0.28, 0.08, dark, -0.28, 0.14, -1.9));
  g.add(box(0.08, 0.22, 0.08, dark, 0.28, 0.11, -1.9));
}

function buildMonitor(
  g: THREE.Group,
  wood: THREE.Material,
  dark: THREE.Material,
  metal: THREE.Material,
): void {
  const legL = new THREE.Mesh(stamp(new THREE.CylinderGeometry(0.045, 0.055, 1.35, 6)), dark);
  legL.position.set(-0.28, 0.62, -0.15);
  legL.rotation.z = 0.18;
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.28;
  legR.rotation.z = -0.18;
  g.add(legL, legR);
  g.add(box(0.7, 0.08, 0.08, wood, 0, 1.15, -0.1));
  const nozzle = new THREE.Mesh(stamp(new THREE.CylinderGeometry(0.05, 0.09, 0.85, 10)), metal);
  nozzle.name = 'nozzle';
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 1.05, 0.35);
  nozzle.castShadow = true;
  g.add(nozzle);
  const hose = new THREE.Mesh(stamp(new THREE.TorusGeometry(0.42, 0.035, 8, 16, Math.PI)), dark);
  hose.rotation.y = Math.PI / 2;
  hose.rotation.z = 0.4;
  hose.position.set(-0.35, 0.7, -0.15);
  hose.castShadow = true;
  hose.name = 'hose';
  g.add(hose);
  const spray = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 1.4, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: PALETTE.foam,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  spray.name = 'spray';
  spray.rotation.x = Math.PI / 2;
  spray.position.set(0, 1.02, 1.15);
  spray.visible = false;
  g.add(spray);
  const berm = new THREE.Mesh(stamp(new THREE.BoxGeometry(1.4, 0.55, 0.7)), timber(2, 1, true));
  berm.position.set(0, 0.22, 1.7);
  berm.name = 'berm';
  berm.castShadow = true;
  berm.receiveShadow = true;
  g.add(berm);
  flakes(g, 6, 0, 1.55, 0.12, 0.62);
}

function animate(
  group: THREE.Group,
  kind: MachineKind,
  viz: MinigameViz | null,
  time: number,
): void {
  waterMat.uniforms.uTime!.value = time;
  const showGold = (until: number) => {
    group.traverse((obj) => {
      if (!obj.name.startsWith('flake-')) return;
      const index = Number(obj.name.slice(6));
      obj.visible = index < until;
    });
  };
  if (kind === 'rocker') {
    const body = group.getObjectByName('rocker-body');
    const rock = viz?.kind === 'rocker' ? viz.rock : (Math.sin(time * 1.7) + 1) / 2;
    if (body) body.rotation.z = (rock - 0.5) * 0.42;
    const caught = viz?.kind === 'rocker' ? 2 + viz.gold * 4 : 4;
    showGold(caught);
  } else if (kind === 'sluice') {
    const slots = viz?.kind === 'sluice' ? viz.slots : null;
    group.traverse((obj) => {
      if (!obj.name.startsWith('flake-')) return;
      const index = Number(obj.name.slice(6));
      obj.visible = slots ? (slots[index] ?? 0) > 0 : true;
    });
  } else if (kind === 'longtom') {
    const grizzly = group.getObjectByName('grizzly');
    const shake = viz?.kind === 'longtom' ? viz.shake : (Math.sin(time * 2.4) + 1) / 2;
    if (grizzly) grizzly.position.y = 1.02 + (shake - 0.5) * 0.06;
    const slots = viz?.kind === 'longtom' ? viz.slots : null;
    group.traverse((obj) => {
      if (!obj.name.startsWith('flake-')) return;
      const index = Number(obj.name.slice(6));
      obj.visible = slots ? (slots[Math.min(slots.length - 1, index)] ?? 0) > 0 : index < 5;
    });
  } else {
    const nozzle = group.getObjectByName('nozzle');
    const spray = group.getObjectByName('spray');
    const aim = viz?.kind === 'monitor' ? viz.aim : 0.55;
    const spraying = viz?.kind === 'monitor' ? viz.spray : false;
    if (nozzle) nozzle.rotation.z = (aim - 0.5) * 0.7;
    if (spray) {
      spray.visible = spraying || viz === null;
      spray.rotation.z = (aim - 0.5) * 0.7;
      const mat = (spray as THREE.Mesh).material;
      if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = spraying ? 0.38 : 0.16;
    }
    showGold(viz?.kind === 'monitor' ? 1 + viz.gold * 5 : 3);
  }
}
