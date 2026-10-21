import * as THREE from 'three';
import { RENDER_QUALITY } from '@/engine/quality';
import { PALETTE } from '@/render/palette';

// A handful of soft cones aimed at the sun. They are real geometry, so
// trees and the ground occlude them, which reads closer to light in the
// air than a fullscreen lens flare.

export interface LightShafts {
  group: THREE.Group;
  update(sunDir: THREE.Vector3, anchor: THREE.Vector3, enabled: boolean): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const OFFSETS = [
  new THREE.Vector3(4, 0, 2),
  new THREE.Vector3(-5, 0, 3),
  new THREE.Vector3(2, 0, -6),
  new THREE.Vector3(-3, 0, -4),
  new THREE.Vector3(7, 0, -1),
];

export function createLightShafts(): LightShafts {
  const group = new THREE.Group();
  group.name = 'light-shafts';
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.dust,
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const geom = new THREE.CylinderGeometry(0.35, 1.5, 28, 5, 1, true);
  for (let i = 0; i < OFFSETS.length; i++) {
    const cone = new THREE.Mesh(geom, mat);
    cone.frustumCulled = false;
    cone.renderOrder = 1;
    group.add(cone);
  }
  const aim = new THREE.Vector3();

  return {
    group,
    update(sunDir, anchor, enabled) {
      const show = enabled && RENDER_QUALITY.shafts && sunDir.y > 0.12;
      group.visible = show;
      if (!show) return;
      aim.copy(sunDir).normalize();
      const cones = group.children;
      for (let i = 0; i < cones.length; i++) {
        const cone = cones[i] as THREE.Mesh;
        const offset = OFFSETS[i]!;
        cone.position.set(anchor.x + offset.x, anchor.y + 6, anchor.z + offset.z);
        cone.quaternion.setFromUnitVectors(UP, aim);
      }
    },
  };
}
