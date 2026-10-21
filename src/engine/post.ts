import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RENDER_QUALITY } from '@/engine/quality';

// HDR chain: scene → grade (saturation + vignette) → bloom → OutputPass
// (tone map + sRGB). Materials skip tone mapping while rendering into the
// half-float target; OutputPass is the only place it happens.

const GradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.18 },
    uVignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      // Sierra poster grade: teal shade, warm highlights.
      vec3 shadowTint = vec3(0.9, 0.98, 1.02);
      vec3 highTint = vec3(1.05, 0.98, 0.92);
      float lift = smoothstep(0.05, 0.7, luma);
      col *= mix(shadowTint, highTint, lift);
      col = pow(max(col, vec3(0.0)), vec3(0.9));
      vec2 p = vUv * 2.0 - 1.0;
      float vig = smoothstep(1.25, 0.28, dot(p, p));
      col *= mix(1.0 - uVignette, 1.0, vig);
      // Break up sky banding after the tone mapper quantizes to 8-bit.
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      col += (dither - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface PostPipeline {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  setSize(width: number, height: number): void;
  render(): void;
  dispose(): void;
}

export function createPostPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostPipeline {
  const composer = new EffectComposer(renderer);
  // SwiftShader (and other software GL) fails MSAA on half-float targets and
  // presents a black frame. Hardware keeps the sample count from quality.ts.
  const softwareGl = rendererIsSoftware(renderer);
  const samples = softwareGl ? 0 : RENDER_QUALITY.msaaSamples;
  if (samples > 0) {
    enableMsaa(composer, samples);
  } else if (softwareGl) {
    console.log('[post] MSAA off (software WebGL)');
  }

  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(GradeShader));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(RENDER_QUALITY.bloomResolution, RENDER_QUALITY.bloomResolution),
    RENDER_QUALITY.bloomStrength,
    RENDER_QUALITY.bloomRadius,
    RENDER_QUALITY.bloomThreshold,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    setSize(width, height) {
      composer.setSize(width, height);
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
    },
  };
}

function rendererIsSoftware(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return false;
  const info = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
  return /swiftshader|llvmpipe|softpipe/i.test(info);
}

function enableMsaa(composer: EffectComposer, samples: number): void {
  const w = composer.renderTarget1.width;
  const h = composer.renderTarget1.height;
  const make = (): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples,
    });
  composer.renderTarget1.dispose();
  composer.renderTarget2.dispose();
  const a = make();
  const b = make();
  composer.renderTarget1 = a;
  composer.renderTarget2 = b;
  composer.writeBuffer = a;
  composer.readBuffer = b;
}
