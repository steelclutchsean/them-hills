import * as THREE from 'three';

// Silas Voss's stamp mill and Ada Quinn's company wagon. Neither is a
// character mesh — the portraits carry the faces. The fire is a set piece
// beside the inn and stays hidden until that event.

export interface TownArc {
  millPos: THREE.Vector3;
  companyPos: THREE.Vector3;
  firePos: THREE.Vector3;
  nearMill(pos: THREE.Vector3): boolean;
  nearCompany(pos: THREE.Vector3): boolean;
  nearFire(pos: THREE.Vector3): boolean;
  update(time: number, act: number, fire: boolean): void;
}

export function createTownArc(
  scene: THREE.Scene,
  groundY: (x: number, z: number) => number,
): TownArc {
  const millPos = new THREE.Vector3(-28, groundY(-28, 16), 16);
  const companyPos = new THREE.Vector3(-6, groundY(-6, 24), 24);
  const firePos = new THREE.Vector3(-11, groundY(-11, 14), 14);

  const mill = new THREE.Group();
  mill.name = 'stamp-mill';
  mill.position.copy(millPos);
  const timber = new THREE.MeshStandardMaterial({ color: 0x6a4324, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.55, metalness: 0.45 });
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), timber);
  frameL.position.set(-0.7, 1.2, 0);
  const frameR = frameL.clone();
  frameR.position.x = 0.7;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.16), timber);
  beam.position.set(0, 2.35, 0);
  const stampGeom = new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6);
  for (let i = 0; i < 3; i++) {
    const stamp = new THREE.Mesh(stampGeom, iron);
    stamp.position.set(-0.38 + i * 0.38, 1.15, 0.05);
    stamp.name = `stamp-${i}`;
    mill.add(stamp);
  }
  const mortar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 0.7), iron);
  mortar.position.set(0, 0.2, 0);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xd7c4a2, roughness: 0.8 }),
  );
  sign.position.set(0, 2.05, 0.12);
  mill.add(frameL, frameR, beam, mortar, sign);
  scene.add(mill);

  const company = new THREE.Group();
  company.name = 'company-wagon';
  company.position.copy(companyPos);
  company.visible = false;
  const wagon = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.7, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.86 }),
  );
  wagon.position.y = 0.55;
  const canvas = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.55, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.9 }),
  );
  canvas.position.y = 1.1;
  const wheelGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10);
  wheelGeom.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.7, 0.5], [0.7, 0.5], [-0.7, -0.5], [0.7, -0.5]] as const) {
    const wheel = new THREE.Mesh(wheelGeom, iron);
    wheel.position.set(x, 0.28, z);
    company.add(wheel);
  }
  company.add(wagon, canvas);
  scene.add(company);

  const fire = new THREE.Group();
  fire.name = 'town-fire';
  fire.position.copy(firePos);
  fire.visible = false;
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xff6a1a,
    emissive: 0xff4a10,
    emissiveIntensity: 1,
    roughness: 0.5,
  });
  for (let i = 0; i < 4; i++) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.18 + i * 0.04, 0.7 + i * 0.15, 6), glowMat);
    flame.position.set((i - 1.5) * 0.35, 0.4 + i * 0.05, (i % 2) * 0.2);
    flame.name = `flame-${i}`;
    fire.add(flame);
  }
  const light = new THREE.PointLight(0xff6a2a, 0, 9, 2);
  light.name = 'fire-light';
  light.position.set(0, 1.2, 0);
  light.castShadow = false;
  fire.add(light);
  scene.add(fire);

  const near = (a: THREE.Vector3, b: THREE.Vector3, r: number) =>
    Math.hypot(a.x - b.x, a.z - b.z) < r;

  return {
    millPos,
    companyPos,
    firePos,
    nearMill: (pos) => near(pos, millPos, 2.6),
    nearCompany: (pos) => company.visible && near(pos, companyPos, 2.8),
    nearFire: (pos) => fire.visible && near(pos, firePos, 3.2),
    update(time, act, burning) {
      company.visible = act >= 3;
      fire.visible = burning;
      mill.children.forEach((child, i) => {
        if (!child.name.startsWith('stamp')) return;
        child.position.y = 1.05 + Math.abs(Math.sin(time * 6 + i)) * 0.45;
      });
      const lamp = fire.getObjectByName('fire-light') as THREE.PointLight | undefined;
      if (lamp) lamp.intensity = burning ? 18 + Math.sin(time * 17) * 6 : 0;
      fire.children.forEach((child) => {
        if (!child.name.startsWith('flame')) return;
        child.scale.y = 0.85 + Math.sin(time * 14 + child.position.x) * 0.2;
      });
    },
  };
}
