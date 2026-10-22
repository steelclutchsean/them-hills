import * as THREE from 'three';
import type { ClaimRecord, SaveV1 } from '@/save/schema';
import type { MinigameViz } from '@/game/minigames/types';
import type { Watercourse } from '@/game/watercourse';
import { PALETTE } from '@/render/palette';
import { addGoldFlake, machineTimber } from '@/render/painterly';
import { markReflective } from '@/render/reflection';

// Claim machines on the dry bank. Each one keeps a historical silhouette:
// a rocking cradle, a trestled sluice, a two-part long tom, an iron monitor.
// The wood is sun-bleached so the shape still reads from the work camera.

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

function iron(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xb7b3ad,
    roughness: 0.28,
    metalness: 0.94,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
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

const outflowMat = new THREE.MeshBasicMaterial({
  color: 0xd7f4ef,
  transparent: true,
  opacity: 0.88,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const foamMat = new THREE.MeshBasicMaterial({ color: PALETTE.foam });

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
    addGoldFlake(holder, i % 3 === 0 ? 0.12 : 0.086, 0, 0, 0);
    holder.position.set(x0 + ((i % 3) - 1) * 0.08, y, z0 + i * dz);
    parent.add(holder);
  }
}

function cyl(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    stamp(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 8)),
    mat,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A semicircle of boards under the cradle, hanging below the pivot. */
function addCurvedRocker(parent: THREE.Object3D, x: number, mat: THREE.Material): void {
  const radius = 0.84;
  const segments = 8;
  const arc = (Math.PI * radius) / (segments - 1);
  for (let i = 0; i < segments; i++) {
    const t = (i / (segments - 1)) * Math.PI;
    const board = box(0.08, 0.055, arc + 0.06, mat, x, -Math.sin(t) * radius, Math.cos(t) * radius);
    board.rotation.x = Math.PI / 2 - t;
    parent.add(board);
  }
}

/** A-frame under a trough. `top` is the cap height in parent space. */
function trestle(
  parent: THREE.Object3D,
  z: number,
  top: number,
  spread: number,
  mat: THREE.Material,
): void {
  const height = Math.max(0.24, top);
  for (const side of [-1, 1]) {
    const leg = cyl(0.04, 0.05, height, mat, side * spread, height * 0.48, z);
    leg.rotation.z = side * -0.28;
    parent.add(leg);
  }
  parent.add(box(spread * 2.15, 0.055, 0.07, mat, 0, height, z));
  const brace = box(0.045, height * 0.72, 0.045, mat, 0, height * 0.42, z);
  brace.rotation.z = 0.72;
  parent.add(brace);
}

function strut(
  parent: THREE.Object3D,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  radius: number,
  mat: THREE.Material,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const mesh = new THREE.Mesh(stamp(new THREE.CylinderGeometry(radius, radius * 1.2, len, 6)), mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx / len, dy / len, dz / len),
  );
  mesh.castShadow = true;
  parent.add(mesh);
}

function outlet(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.42), outflowMat);
  sheet.position.set(x, y, z);
  sheet.name = 'spill';
  parent.add(sheet);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), outflowMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, 0.04, z + 0.28);
  parent.add(pool);
  const foam = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), foamMat);
  foam.scale.set(2.1, 0.32, 1.15);
  foam.position.set(x, 0.07, z + 0.12);
  parent.add(foam);
}

function buildProp(kind: MachineKind): THREE.Group {
  const g = new THREE.Group();
  const wood = machineTimber(1.6, 2.4);
  const cleat = machineTimber(1.1, 1.3, 0.72);
  const metal = iron();
  if (kind === 'rocker') buildRocker(g, wood, cleat, metal);
  else if (kind === 'sluice') buildSluice(g, wood, cleat, metal);
  else if (kind === 'longtom') buildTom(g, wood, cleat, metal);
  else buildMonitor(g, metal);
  return g;
}

function buildRocker(
  g: THREE.Group,
  wood: THREE.Material,
  cleat: THREE.Material,
  metal: THREE.Material,
): void {
  const body = new THREE.Group();
  body.name = 'rocker-body';
  // Pivot sits on the rocker crowns. The arcs hang to the ground and rock with the cradle.
  body.position.y = 0.96;
  addCurvedRocker(body, -0.48, wood);
  addCurvedRocker(body, 0.48, wood);
  body.add(box(1.12, 0.07, 1.4, wood, 0, 0.08, 0.05));
  body.add(box(0.07, 0.32, 1.4, wood, -0.54, 0.26, 0.05));
  body.add(box(0.07, 0.32, 1.4, wood, 0.54, 0.26, 0.05));
  body.add(box(1.12, 0.4, 0.07, wood, 0, 0.28, -0.64));
  body.add(box(1.12, 0.12, 0.06, wood, 0, 0.14, 0.74));
  body.add(box(0.96, 0.05, 0.05, cleat, 0, 0.14, -0.2));
  body.add(box(0.96, 0.05, 0.05, cleat, 0, 0.14, 0.12));
  body.add(box(0.96, 0.05, 0.05, cleat, 0, 0.14, 0.44));
  body.add(water(0.92, 1.1, 0, 0.16, 0.06));
  body.add(box(1.2, 0.028, 0.045, metal, 0, 0.42, 0.02));
  const hopper = new THREE.Group();
  hopper.position.set(0, 0.52, -0.78);
  hopper.add(box(0.86, 0.07, 0.52, wood, 0, 0, 0));
  hopper.add(box(0.07, 0.34, 0.52, wood, -0.42, 0.16, 0));
  hopper.add(box(0.07, 0.34, 0.52, wood, 0.42, 0.16, 0));
  hopper.add(box(0.86, 0.3, 0.07, wood, 0, 0.18, -0.22));
  body.add(hopper);
  const handle = box(0.07, 0.07, 1.45, wood, 0, 0.62, -1.28);
  handle.rotation.x = -0.62;
  body.add(handle);
  body.add(box(0.42, 0.06, 0.06, wood, 0, 1.02, -1.72));
  flakes(body, 5, 0, -0.12, 0.18, 0.5);
  g.add(body);
}

function buildSluice(
  g: THREE.Group,
  wood: THREE.Material,
  cleat: THREE.Material,
  metal: THREE.Material,
): void {
  const race = new THREE.Group();
  race.name = 'sluice-body';
  // Positive X rotation drops the creek end (+Z) so the race runs downhill.
  race.rotation.x = 0.2;
  race.position.set(0, 0.78, 0.15);
  const length = 4.7;
  race.add(box(0.9, 0.06, length, wood, 0, 0, 0));
  race.add(box(0.06, 0.26, length, wood, -0.45, 0.15, 0));
  race.add(box(0.06, 0.26, length, wood, 0.45, 0.15, 0));
  race.add(box(0.9, 0.32, 0.07, wood, 0, 0.18, -length / 2));
  for (let i = 0; i < 9; i++) {
    const z = -1.75 + i * 0.44;
    race.add(box(0.76, 0.07, 0.06, cleat, 0, 0.08, z));
    race.add(box(0.76, 0.02, 0.035, metal, 0, 0.125, z));
  }
  race.add(water(0.74, length - 0.45, 0, 0.1, 0.18));
  race.add(box(0.72, 0.2, 0.36, wood, 0, 0.26, -length / 2 - 0.02));
  flakes(race, 6, 0, -1.45, 0.5, 0.38);
  g.add(race);
  trestle(g, -1.9, 1.18, 0.58, wood);
  trestle(g, -0.15, 0.78, 0.52, wood);
  trestle(g, 1.55, 0.4, 0.46, wood);
  outlet(g, 0, 0.2, 2.55);
}

function buildTom(
  g: THREE.Group,
  wood: THREE.Material,
  cleat: THREE.Material,
  metal: THREE.Material,
): void {
  const upper = new THREE.Group();
  upper.rotation.x = 0.05;
  upper.position.set(0, 1.14, -1.2);
  upper.add(box(1.02, 0.06, 1.9, wood, 0, 0, 0));
  upper.add(box(0.065, 0.34, 1.9, wood, -0.5, 0.18, 0));
  upper.add(box(0.065, 0.34, 1.9, wood, 0.5, 0.18, 0));
  upper.add(box(1.02, 0.4, 0.07, wood, 0, 0.2, -0.92));
  g.add(upper);

  const grizzly = new THREE.Group();
  grizzly.name = 'grizzly';
  // Animate pins this group at y=1.02. Sit it on the near head of the tom,
  // tipped toward the bank, so the camera sees the face of the plate.
  grizzly.position.set(0, 1.02, -2.35);
  grizzly.rotation.x = -1.05;
  const plate = new THREE.MeshStandardMaterial({
    color: 0xe4e0d8,
    roughness: 0.32,
    metalness: 0.82,
    emissive: 0xa8a49c,
    emissiveIntensity: 0.45,
  });
  grizzly.add(box(1.05, 0.04, 0.78, plate, 0, 0.15, 0));
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x100c09 });
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 12), holeMat);
      hole.position.set(-0.28 + col * 0.28, 0.17, -0.16 + row * 0.32);
      grizzly.add(hole);
    }
  }
  g.add(grizzly);

  const lower = new THREE.Group();
  lower.rotation.x = 0.13;
  lower.position.set(0, 0.56, 1.95);
  const length = 4.3;
  lower.add(box(0.8, 0.05, length, wood, 0, 0, 0));
  lower.add(box(0.055, 0.22, length, wood, -0.39, 0.12, 0));
  lower.add(box(0.055, 0.22, length, wood, 0.39, 0.12, 0));
  for (let i = 0; i < 8; i++) {
    lower.add(box(0.66, 0.06, 0.05, cleat, 0, 0.07, -1.55 + i * 0.44));
    lower.add(box(0.66, 0.018, 0.03, metal, 0, 0.11, -1.55 + i * 0.44));
  }
  lower.add(water(0.66, length - 0.35, 0, 0.09, 0.2));
  flakes(lower, 7, 0, -1.15, 0.4, 0.34);
  g.add(lower);

  trestle(g, -1.75, 1.08, 0.6, wood);
  trestle(g, -0.45, 0.96, 0.54, wood);
  trestle(g, 1.15, 0.58, 0.48, wood);
  trestle(g, 3.15, 0.3, 0.42, wood);
  outlet(g, 0, 0.16, 4.15);
}

function buildMonitor(g: THREE.Group, metal: THREE.Material): void {
  const canvas = new THREE.MeshStandardMaterial({
    color: 0xe4d3ae,
    roughness: 0.9,
    metalness: 0,
    emissive: 0xd4c096,
    emissiveIntensity: 0.42,
  });
  const earth = new THREE.MeshStandardMaterial({ color: 0xb08968, roughness: 0.96 });
  const hub: [number, number, number] = [0, 1.18, -0.05];
  strut(g, -0.62, 0, -0.42, hub[0], hub[1], hub[2], 0.045, metal);
  strut(g, 0.62, 0, -0.42, hub[0], hub[1], hub[2], 0.045, metal);
  strut(g, 0, 0, 0.55, hub[0], hub[1], hub[2], 0.045, metal);
  const ring = new THREE.Mesh(stamp(new THREE.TorusGeometry(0.22, 0.032, 8, 18)), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(hub[0], hub[1], hub[2]);
  ring.castShadow = true;
  g.add(ring);
  g.add(box(0.05, 0.32, 0.06, metal, -0.16, 1.36, -0.02));
  g.add(box(0.05, 0.32, 0.06, metal, 0.16, 1.36, -0.02));
  const pin = cyl(0.028, 0.028, 0.4, metal, 0, 1.46, -0.02);
  pin.rotation.z = Math.PI / 2;
  g.add(pin);

  const nozzle = new THREE.Mesh(stamp(new THREE.CylinderGeometry(0.11, 0.055, 1.25, 12)), metal);
  nozzle.name = 'nozzle';
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 1.46, 0.58);
  nozzle.castShadow = true;
  const bell = new THREE.Mesh(stamp(new THREE.CylinderGeometry(0.2, 0.1, 0.3, 12)), metal);
  bell.position.y = 0.72;
  bell.castShadow = true;
  nozzle.add(bell);
  g.add(nozzle);

  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.15, 0.06, -0.7),
        new THREE.Vector3(-0.95, 0.18, -0.2),
        new THREE.Vector3(-0.55, 0.48, 0.05),
        new THREE.Vector3(-0.18, 0.95, -0.08),
        new THREE.Vector3(0, 1.42, -0.08),
      ]),
      28,
      0.062,
      8,
      false,
    ),
    canvas,
  );
  hose.name = 'hose';
  hose.castShadow = true;
  g.add(hose);

  const spray = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.6, 8, 1, true),
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
  spray.position.set(0, 1.42, 1.85);
  spray.visible = false;
  g.add(spray);
  const berm = new THREE.Mesh(stamp(new THREE.BoxGeometry(1.6, 0.6, 0.85)), earth);
  berm.position.set(0, 0.24, 2.15);
  berm.name = 'berm';
  berm.castShadow = true;
  berm.receiveShadow = true;
  g.add(berm);
  flakes(g, 6, 0, 2.05, 0.12, 0.68);
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
