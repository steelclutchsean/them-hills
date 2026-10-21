import * as THREE from 'three';

// Timbered drift for the north lode only. The volume is still the cave
// box; the read is sets, lanterns, a rail, and quartz you can sort by color.

interface Dressing {
  lights: THREE.PointLight[];
  lamps: THREE.Mesh[];
  caps: THREE.Mesh[];
  cart: THREE.Object3D;
}

const dressed = new WeakMap<THREE.Group, Dressing>();

function wood(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.92 });
}

function lampMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffe1a8,
    emissive: 0xffb45a,
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
}

export function dressNorthLode(group: THREE.Group): void {
  const beam = wood();
  const aged = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.95 });
  const postGeom = new THREE.CylinderGeometry(0.08, 0.1, 2.5, 6);
  const capGeom = new THREE.BoxGeometry(2.3, 0.14, 0.16);
  const caps: THREE.Mesh[] = [];
  const lights: THREE.PointLight[] = [];
  const lamps: THREE.Mesh[] = [];
  const lampMaterial = lampMat();

  for (let i = 0; i < 5; i++) {
    const z = -1.6 - i * 1.55;
    const left = new THREE.Mesh(postGeom, beam);
    left.position.set(-1.05, 1.15, z);
    left.castShadow = true;
    const right = new THREE.Mesh(postGeom, beam);
    right.position.set(1.05, 1.15, z);
    right.castShadow = true;
    const cap = new THREE.Mesh(capGeom, aged);
    cap.position.set(0, 2.45, z);
    cap.castShadow = true;
    caps.push(cap);
    group.add(left, right, cap);
    if (i % 2 === 0) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMaterial);
      lamp.position.set(0, 2.22, z);
      const light = new THREE.PointLight(0xffc27a, 14, 6.5, 2);
      light.position.set(0, 2.15, z);
      light.castShadow = false;
      lamps.push(lamp);
      lights.push(light);
      group.add(lamp, light);
    }
  }

  const quartz: { x: number; y: number; z: number; color: number; emissive: number; name: string }[] = [
    { x: -1.55, y: 1.3, z: -3.2, color: 0xf4f1ea, emissive: 0x000000, name: 'quartz-white' },
    { x: 1.55, y: 1.55, z: -4.4, color: 0x8e8b86, emissive: 0x000000, name: 'quartz-gray' },
    { x: -1.5, y: 1.15, z: -6.1, color: 0xe2b15a, emissive: 0x8a5a12, name: 'quartz-honey' },
    { x: 1.48, y: 1.35, z: -7.4, color: 0xf7f4ee, emissive: 0x000000, name: 'quartz-white' },
    { x: -1.42, y: 1.7, z: -8.2, color: 0xd7a441, emissive: 0xa86b14, name: 'quartz-honey' },
    { x: 0.2, y: 1.4, z: -9.35, color: 0xc9842a, emissive: 0x7a4e10, name: 'quartz-honey' },
  ];
  for (const vein of quartz) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.55 + (vein.z % 0.3), 0.85),
      new THREE.MeshStandardMaterial({
        color: vein.color,
        emissive: vein.emissive,
        emissiveIntensity: vein.emissive === 0 ? 0 : 0.55,
        roughness: 0.45,
      }),
    );
    mesh.name = vein.name;
    mesh.position.set(vein.x, vein.y, vein.z);
    mesh.rotation.y = vein.x < 0 ? 0.15 : -0.15;
    group.add(mesh);
  }

  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.7, metalness: 0.4 });
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.95 });
  const railGeom = new THREE.BoxGeometry(0.06, 0.05, 8.2);
  const leftRail = new THREE.Mesh(railGeom, railMat);
  leftRail.position.set(-0.28, 0.08, -5.2);
  const rightRail = new THREE.Mesh(railGeom, railMat);
  rightRail.position.set(0.28, 0.08, -5.2);
  group.add(leftRail, rightRail);
  const tieGeom = new THREE.BoxGeometry(0.9, 0.05, 0.12);
  for (let i = 0; i < 8; i++) {
    const tie = new THREE.Mesh(tieGeom, tieMat);
    tie.position.set(0, 0.04, -1.8 - i * 1.05);
    group.add(tie);
  }

  const cart = new THREE.Group();
  cart.name = 'ore-cart';
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.28, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x6e4a22, roughness: 0.88 }),
  );
  bed.position.y = 0.28;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.16, 0),
    new THREE.MeshStandardMaterial({ color: 0xc9963a, emissive: 0x5a3a10, emissiveIntensity: 0.25, roughness: 0.6 }),
  );
  rock.position.set(0.05, 0.48, 0);
  cart.add(bed, rock);
  cart.position.set(0, 0.08, -4.2);
  group.add(cart);

  dressed.set(group, { lights, lamps, caps, cart });
}

export function updateNorthLode(group: THREE.Group, time: number, creak: number): void {
  const dress = dressed.get(group);
  if (!dress) return;
  const flicker = 0.82 + Math.sin(time * 9.5) * 0.08 + Math.sin(time * 23) * 0.04;
  dress.lights.forEach((light, i) => {
    light.intensity = 12 + flicker * 4 + Math.sin(time * 7 + i) * 1.2;
  });
  dress.lamps.forEach((lamp) => {
    const mat = lamp.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.55 + flicker * 0.5;
  });
  const talk = creak > 0.55 ? Math.sin(time * 18) * creak * 0.03 : 0;
  dress.caps.forEach((cap, i) => {
    cap.rotation.z = talk * (i % 2 === 0 ? 1 : -1);
  });
  dress.cart.position.z = -4.2 + Math.sin(time * 0.6) * 0.15;
}

/** Darken this cave's shared-material clones so lanterns, not the sun, light the drift. */
export function darkenCaveMeshes(meshes: readonly THREE.Mesh[]): void {
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    const mat = src.clone();
    mat.color.multiplyScalar(0.16);
    mat.roughness = 1;
    mat.emissive = new THREE.Color(0x000000);
    mesh.material = mat;
  }
}
