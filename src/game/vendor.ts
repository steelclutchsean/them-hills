import * as THREE from 'three';
import type { VendorId } from '@/save/schema';

// Vendors are simple stationary NPCs the player walks up to in order to sell
// their gold. v0 ships two:
//
//   Town Assayer — 85% / 92% / 100% of spot for flake / picker / nugget
//   Tourist Pawn Shop — 60% / 65% / 70% (deliberate "noob trap" — fast cash, bad rate)
//
// Both are placed near spawn (west of origin, opposite the stream at +X) so the
// loop is: spawn → walk east 10m to stream → prospect → walk west ~25m to vendor
// → sell. The visual is a procedural wooden post with a painted canvas sign so
// the player can read the vendor name without UI overhead.

const VENDOR_INTERACT_RADIUS = 1.8;

export interface VendorMultipliers {
  flake: number;
  picker: number;
  nugget: number;
}

export interface Vendor {
  id: VendorId;
  name: string;
  position: THREE.Vector3;
  multipliers: VendorMultipliers;
  visual: THREE.Group;
  marker: THREE.Mesh;
}

export interface VendorRegistry {
  vendors: readonly Vendor[];
  findNearest(playerPos: THREE.Vector3): { vendor: Vendor; distance: number } | null;
  update(time: number, focusedVendorId: VendorId | null): void;
}

export function createVendors(
  scene: THREE.Scene,
  getGroundY: (x: number, z: number) => number,
): VendorRegistry {
  const vendors: Vendor[] = [
    makeVendor(
      'assayer',
      'Town Assayer',
      new THREE.Vector3(-15, getGroundY(-15, 0), 0),
      { flake: 0.85, picker: 0.92, nugget: 1.0 },
      0xd4a647,
    ),
    makeVendor(
      'pawn_shop',
      'Tourist Pawn Shop',
      new THREE.Vector3(-12, getGroundY(-12, 7), 7),
      { flake: 0.6, picker: 0.65, nugget: 0.7 },
      0x9b3a2b,
    ),
  ];

  for (const v of vendors) {
    scene.add(v.visual);
  }

  return {
    vendors,
    findNearest(playerPos) {
      let best: { vendor: Vendor; distance: number } | null = null;
      for (const v of vendors) {
        const dx = playerPos.x - v.position.x;
        const dz = playerPos.z - v.position.z;
        const d = Math.hypot(dx, dz);
        if (d < VENDOR_INTERACT_RADIUS && (best === null || d < best.distance)) {
          best = { vendor: v, distance: d };
        }
      }
      return best;
    },
    update(time, focusedVendorId) {
      for (const v of vendors) {
        const isFocused = v.id === focusedVendorId;
        const mat = v.marker.material as THREE.MeshStandardMaterial;
        const targetEmissive = isFocused ? 1.4 : 0.4;
        mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.15;
        const pulse = isFocused ? 1.0 + 0.08 * Math.sin(time * 6) : 1.0;
        v.marker.scale.setScalar(pulse);
      }
    },
  };
}

function makeVendor(
  id: VendorId,
  name: string,
  position: THREE.Vector3,
  multipliers: VendorMultipliers,
  signColor: number,
): Vendor {
  const group = new THREE.Group();
  group.name = `vendor_${id}`;
  group.position.copy(position);

  // Wooden post
  const matWood = new THREE.MeshStandardMaterial({
    color: 0x4a3826,
    flatShading: true,
    roughness: 0.92,
  });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 8), matWood);
  post.position.y = 0.9;
  post.castShadow = true;
  group.add(post);

  // Crossbar (top of the post, supporting the sign)
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), matWood);
  crossbar.position.y = 1.78;
  crossbar.castShadow = true;
  group.add(crossbar);

  // Sign hanging below the crossbar
  const signTexture = makeSignTexture(name, signColor);
  const matSign = new THREE.MeshStandardMaterial({
    map: signTexture,
    color: 0xffffff,
    flatShading: false,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), matSign);
  sign.position.y = 1.5;
  // Slight rotation so signs aren't perfectly axis-aligned to camera
  sign.castShadow = true;
  group.add(sign);

  // Floating glow ring above sign — analogous to panning-site markers
  const ringGeom = new THREE.TorusGeometry(0.25, 0.04, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xc89b3b,
    emissive: 0x553311,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    flatShading: true,
  });
  const marker = new THREE.Mesh(ringGeom, ringMat);
  marker.position.y = 2.05;
  group.add(marker);

  return { id, name, position: position.clone(), multipliers, visual: group, marker };
}

// Render text + label onto an offscreen canvas, returned as a Three.js texture
// for use as a sign material map. No font loading required — uses the system
// serif/sans fallback.
function makeSignTexture(label: string, accent: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[vendor] canvas context unavailable');

  // Wood-grain background
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#5e442e');
  bg.addColorStop(1, '#3a2818');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  const accentHex = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  // Label
  ctx.fillStyle = '#f5d088';
  ctx.font = 'bold 60px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
