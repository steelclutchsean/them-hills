import * as THREE from 'three';
import type { VendorId } from '@/save/schema';
import { buildShop } from '@/game/structures';

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
  const built = buildShop({ sign: name, accent: signColor });
  const group = built.root;
  group.name = `vendor_${id}`;
  group.position.copy(position);
  return { id, name, position: position.clone(), multipliers, visual: group, marker: built.marker };
}
