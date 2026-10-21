import * as THREE from 'three';
import { forceTopDraw } from '@/game/minigames/_util';
import type { MinigameViz } from '@/game/minigames/types';

// Camera-space machines. These are not the pan. Each one is the thing
// the player is working: a rocking box, a riffle trough, a long tom
// with a grizzly, or a monitor aimed at a bank.

export interface MachineView<T> {
  group: THREE.Group;
  update(viz: T): void;
  setVisible(v: boolean): void;
}

function mat(color: number, roughness = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05, flatShading: true });
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

export function createRockerView(): MachineView<Extract<MinigameViz, { kind: 'rocker' }>> {
  const group = new THREE.Group();
  group.position.set(0, -0.22, -0.78);
  const rockers = new THREE.Group();
  const left = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 14, Math.PI), mat(0x6b4423));
  left.rotation.y = Math.PI / 2;
  left.position.set(-0.16, -0.02, 0);
  const right = left.clone();
  right.position.x = 0.16;
  rockers.add(left, right);
  const body = new THREE.Group();
  body.add(box(0.42, 0.2, 0.28, 0x8a5a32));
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.04, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x8eb8c9, transparent: true, opacity: 0.85 }),
  );
  water.position.y = 0.02;
  const gold = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), mat(0xf0d060, 0.4));
  gold.position.set(0.05, 0.02, 0.02);
  body.add(water, gold);
  rockers.add(body);
  group.add(rockers);
  forceTopDraw(group);
  return {
    group,
    update(viz) {
      const tilt = (viz.rock - 0.5) * 0.9;
      rockers.rotation.z = tilt;
      water.position.x = -tilt * 0.12;
      water.scale.y = 0.4 + viz.water * 0.9;
      gold.visible = viz.gold > 0.15;
      gold.scale.setScalar(0.6 + viz.gold);
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}

export function createSluiceView(): MachineView<Extract<MinigameViz, { kind: 'sluice' }>> {
  const group = new THREE.Group();
  group.position.set(0.05, -0.2, -0.82);
  group.rotation.x = -0.45;
  const trough = box(0.22, 0.08, 0.95, 0x6e4b2c);
  group.add(trough);
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.02, 0.86),
    new THREE.MeshBasicMaterial({ color: 0x9ec5d4, transparent: true, opacity: 0.75 }),
  );
  water.position.y = 0.03;
  group.add(water);
  const bars: THREE.Mesh[] = [];
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const bar = box(0.2, 0.025, 0.02, 0xc2a36a);
    bar.position.set(0, 0.05, -0.32 + i * 0.16);
    group.add(bar);
    bars.push(bar);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), mat(0xf0d060, 0.35));
    dot.position.set(0, 0.07, -0.32 + i * 0.16);
    group.add(dot);
    dots.push(dot);
  }
  const shovel = box(0.08, 0.02, 0.16, 0x4a4a4a);
  shovel.position.set(0, 0.12, 0.42);
  group.add(shovel);
  const cursor = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.045, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff1b0, side: THREE.DoubleSide }),
  );
  cursor.rotation.x = -Math.PI / 2;
  group.add(cursor);
  forceTopDraw(group);
  return {
    group,
    update(viz) {
      shovel.visible = viz.phase === 'feed';
      shovel.position.z = 0.2 + viz.indicator * 0.35;
      water.scale.y = 0.4 + viz.flow * 1.4;
      water.material.opacity = viz.phase === 'flow' ? 0.9 : 0.55;
      cursor.visible = viz.phase === 'cleanup';
      const z = -0.32 + viz.slot * 0.16;
      cursor.position.set(0, 0.09, z);
      viz.slots.forEach((has, i) => {
        const dot = dots[i];
        if (dot) dot.visible = has > 0 && viz.phase === 'cleanup';
        const bar = bars[i];
        if (bar) (bar.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(has && viz.phase !== 'feed' ? 0x3a2a08 : 0x000000);
      });
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}

export function createLongTomView(): MachineView<Extract<MinigameViz, { kind: 'longtom' }>> {
  const group = new THREE.Group();
  group.position.set(0, -0.16, -0.95);
  group.rotation.x = -0.35;
  const hopper = box(0.28, 0.16, 0.22, 0x5c3d24);
  hopper.position.set(0, 0.1, 0.48);
  group.add(hopper);
  const fill = box(0.2, 0.06, 0.14, 0x8a6240);
  fill.position.set(0, 0.08, 0.48);
  group.add(fill);
  const grizzly = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 5), mat(0xb7b7b7, 0.35));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(-0.09 + i * 0.06, 0.16, 0.28);
    grizzly.add(rod);
  }
  group.add(grizzly);
  const trough = box(0.24, 0.07, 1.15, 0x4e3420);
  trough.position.z = -0.15;
  group.add(trough);
  const dots: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const bar = box(0.22, 0.02, 0.018, 0x8d7344);
    bar.position.set(0, 0.05, -0.55 + i * 0.16);
    group.add(bar);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), mat(0xf0d060, 0.35));
    dot.position.set(0, 0.07, -0.55 + i * 0.16);
    group.add(dot);
    dots.push(dot);
  }
  const cursor = box(0.05, 0.015, 0.05, 0xf6e7a2);
  group.add(cursor);
  forceTopDraw(group);
  return {
    group,
    update(viz) {
      grizzly.position.y = viz.phase === 'grizzly' ? (viz.shake - 0.5) * 0.06 : 0;
      grizzly.rotation.z = viz.phase === 'grizzly' ? (viz.shake - 0.5) * 0.25 : 0;
      fill.scale.y = 0.3 + viz.hopper;
      cursor.visible = viz.phase === 'cleanup';
      cursor.position.set(0, 0.08, -0.55 + viz.slot * 0.16);
      viz.slots.forEach((has, i) => {
        const dot = dots[i];
        if (dot) dot.visible = viz.phase === 'cleanup' && has > 0;
      });
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}

export function createMonitorView(): MachineView<Extract<MinigameViz, { kind: 'monitor' }>> {
  const group = new THREE.Group();
  group.position.set(0, -0.12, -0.9);
  const stand = box(0.08, 0.28, 0.08, 0x333333);
  stand.position.set(-0.28, -0.02, 0.1);
  group.add(stand);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.34, 8), mat(0x9aa3ad, 0.4));
  nozzle.rotation.z = -Math.PI / 2.4;
  nozzle.position.set(-0.08, 0.08, 0.05);
  group.add(nozzle);
  const bank = box(0.08, 0.7, 0.85, 0x8d6240);
  bank.position.set(0.32, 0.05, 0);
  group.add(bank);
  const streak = box(0.09, 0.08, 0.7, 0x1a1814);
  group.add(streak);
  const cut = box(0.1, 0.06, 0.5, 0xe2c36a);
  group.add(cut);
  const spray = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.42, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xd5e7ef, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  spray.rotation.z = -Math.PI / 2.3;
  spray.position.set(0.08, 0.06, 0.02);
  const reachGhost = spray.clone();
  (reachGhost.material as THREE.MeshBasicMaterial) = new THREE.MeshBasicMaterial({
    color: 0x9bb8c4,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  group.add(spray, reachGhost);
  const gauge = new THREE.Group();
  gauge.position.set(-0.42, 0.22, 0.12);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 20),
    new THREE.MeshBasicMaterial({ map: pressureFace(), transparent: true }),
  );
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.09, 0.004),
    new THREE.MeshBasicMaterial({ color: 0xf2e2c4 }),
  );
  needle.position.y = 0.03;
  const needlePivot = new THREE.Group();
  needlePivot.add(needle);
  gauge.add(face, needlePivot);
  group.add(gauge);
  forceTopDraw(group);
  return {
    group,
    update(viz) {
      const y = -0.22 + viz.aim * 0.55;
      nozzle.rotation.z = -0.9 - viz.aim * 0.7;
      nozzle.position.y = 0.02 + viz.aim * 0.2;
      streak.position.set(0.34, y, 0);
      cut.position.set(0.36, y, 0);
      cut.scale.y = 0.2 + viz.cut * 1.4;
      cut.visible = viz.cut > 0.02;
      spray.visible = true;
      const reach = 0.4 + viz.pressure * 1.85;
      const width = 0.45 + viz.pressure * 0.55;
      const live = viz.spray ? 1 : 0.35;
      spray.scale.set(width * live, reach * live, width * live);
      reachGhost.scale.set(0.55, 0.4 + 1.85, 0.55);
      (spray.material as THREE.MeshBasicMaterial).opacity = viz.spray ? 0.62 : 0.16;
      spray.position.y = nozzle.position.y;
      spray.position.x = 0.06 + reach * live * 0.08;
      reachGhost.position.copy(spray.position);
      reachGhost.rotation.copy(spray.rotation);
      const sweep = -2.2 + viz.pressure * 2.6;
      needlePivot.rotation.z = sweep;
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}

function pressureFace(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[monitor] no gauge context');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#1c140e';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#5c4a36';
  ctx.beginPath();
  ctx.arc(64, 64, 46, Math.PI * 0.2, Math.PI * 1.65);
  ctx.stroke();
  ctx.strokeStyle = '#e6c36a';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(64, 64, 46, -0.95, -0.2);
  ctx.stroke();
  ctx.fillStyle = '#f0e2c8';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('WATER', 64, 74);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
