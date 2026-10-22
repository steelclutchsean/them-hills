import * as THREE from 'three';

// One radial sprite for every point cloud. A PointsMaterial with no map
// draws a hard square, which reads as confetti in a lantern beam.

let disc: THREE.Texture | null = null;

export function softDiscTexture(): THREE.Texture {
  if (disc) return disc;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[particles] no 2d context');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.16)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.04)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 64);
  disc = new THREE.CanvasTexture(canvas);
  disc.colorSpace = THREE.SRGBColorSpace;
  return disc;
}
