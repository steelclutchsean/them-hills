import * as THREE from 'three';

// Sky dome parented to the camera so the horizon stays wrapped around the
// player on a 200m map. Depth is pushed to the far plane; the material does
// not participate in fog, so terrain can fade into a matching horizon color.

export interface SkyGrade {
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sunDirection: THREE.Vector3;
  /** 0..1, drives the cloud layer. */
  cloudCover: number;
  /** 0..1, stars and moon. */
  starStrength: number;
  ground: THREE.Color;
}

export interface Atmosphere {
  mesh: THREE.Mesh;
  /** Mutates uniforms. `grade` is read, not retained. */
  update(grade: SkyGrade, time: number): void;
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vDir = worldPos.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
    gl_Position.z = gl_Position.w * 0.9999;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uCloudCover;
  uniform float uStarStrength;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 dir = normalize(vDir);
    vec3 sunDir = normalize(uSunDir);
    float h = dir.y;
    float up = smoothstep(-0.02, 0.55, h);

    // Zenith is a cleaner, slightly deeper version of the horizon so the
    // dome has a gradient even when the palette is a flat noon blue.
    vec3 zenith = uHorizon * vec3(0.42, 0.55, 0.92);
    vec3 sky = mix(uHorizon, zenith, pow(clamp(up, 0.0, 1.0), 0.8));
    sky = mix(uHorizon * 0.78, sky, smoothstep(-0.28, 0.04, h));

    float sunDot = max(dot(dir, sunDir), 0.0);
    float glow = pow(sunDot, 36.0);
    float disc = smoothstep(0.9994, 0.99986, sunDot);
    // A low sun keeps a peach sky. The disc stays hot so god rays have a source.
    float lowSun = smoothstep(0.5, 0.04, sunDir.y);
    sky += uSunColor * glow * mix(0.9, 0.18, lowSun);
    sky += vec3(1.0, 0.94, 0.72) * disc * 8.0;

    // Warm band when the sun sits on the horizon.
    float sunset = smoothstep(0.42, 0.0, sunDir.y) * smoothstep(-0.25, 0.08, sunDir.y);
    float band = exp(-abs(h) * 6.5);
    sky += uSunColor * band * sunset * 0.42;

    // The dawn sky is HDR-bright, so a mix toward a dim blue never shifts the hue.
    // Scale the existing light instead: warm next to the sun, blue away from it.
    float away = smoothstep(0.02, 0.4, 1.0 - sunDot);
    float coolAmt = away * lowSun * smoothstep(-0.08, 0.16, h);
    sky *= mix(vec3(1.0), vec3(0.16, 0.42, 2.2), coolAmt);

    // Low haze tight to the sun, so the shafts have a volume to light
    // and the cool corner keeps the blue multiply above.
    float fogH = exp(-max(h, 0.0) * 3.2);
    float fogAmt = fogH * lowSun * smoothstep(0.52, 0.88, sunDot);
    sky += vec3(1.05, 0.72, 0.42) * fogAmt * 0.95;

    // Projected cloud plane. Coverage comes from the weather grade.
    vec2 plane = dir.xz / max(h, 0.12);
    float n1 = noise(plane * 0.22 + vec2(uTime * 0.003, uTime * 0.001));
    float n2 = noise(plane * 0.55 - vec2(uTime * 0.002, 0.4));
    float cn = n1 * 0.65 + n2 * 0.35;
    float edge = 1.0 - clamp(uCloudCover, 0.0, 1.0);
    float clouds = smoothstep(edge, edge + 0.22, cn);
    clouds *= smoothstep(0.0, 0.22, h);
    vec3 cloudCol = mix(uHorizon, vec3(1.0), 0.62);
    cloudCol *= 0.72 + 0.55 * pow(sunDot, 0.6);
    sky = mix(sky, cloudCol, clouds * 0.9);
    // Clouds are lit by the warm horizon color. Put the blue back on the
    // side of the sky that faces away from the sun.
    sky *= mix(vec3(1.0), vec3(0.32, 0.55, 1.75), coolAmt * 0.75);

    if (uStarStrength > 0.02) {
      vec2 cell = floor(dir.xy * 220.0 + dir.z * 140.0);
      float s = hash(cell);
      float star = step(0.9972, s) * smoothstep(0.08, 0.4, h);
      sky += star * uStarStrength * (0.65 + 0.55 * hash(cell + 3.7));

      vec3 moonDir = normalize(vec3(-sunDir.x, -sunDir.y, -sunDir.z));
      float md = max(dot(dir, moonDir), 0.0);
      float moon = smoothstep(0.99945, 0.99982, md);
      sky += vec3(0.82, 0.88, 1.0) * (moon * 2.4 + pow(md, 28.0) * 0.35) * uStarStrength;
    }

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export function createAtmosphere(camera: THREE.Camera): Atmosphere {
  const uniforms = {
    uHorizon: { value: new THREE.Color(0x9bb8d3) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
    uSunColor: { value: new THREE.Color(0xfff2d2) },
    uCloudCover: { value: 0.32 },
    uStarStrength: { value: 0 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'Atmosphere',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 20), material);
  mesh.name = 'atmosphere';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  camera.add(mesh);

  return {
    mesh,
    update(grade, time) {
      (uniforms.uHorizon.value as THREE.Color).copy(grade.horizon);
      (uniforms.uSunDir.value as THREE.Vector3).copy(grade.sunDirection);
      (uniforms.uSunColor.value as THREE.Color).copy(grade.sunColor);
      uniforms.uCloudCover.value = grade.cloudCover;
      uniforms.uStarStrength.value = grade.starStrength;
      uniforms.uTime.value = time;
    },
  };
}
