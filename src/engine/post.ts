import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RENDER_QUALITY } from '@/engine/quality';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// The water shader reads this on the next frame. It is the HDR scene, before
// grade and bloom, so a screen-space reflection stays in the same space as
// the creek. Software GL uses it because the planar mirror does not.
export const sceneGrabUniforms = {
  uScene: { value: null as THREE.Texture | null },
  uSceneDepth: { value: null as THREE.Texture | null },
  uHasScene: { value: 0 },
};

// HDR chain: scene → grade (saturation + vignette) → bloom → OutputPass
// (tone map + sRGB). Materials skip tone mapping while rendering into the
// half-float target; OutputPass is the only place it happens.

const GradeShader = {
  name: 'Grade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.18 },
    uVignette: { value: 0.22 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
    uFocusAmt: { value: 0 },
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
    uniform vec2 uFocus;
    uniform float uFocusAmt;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float nearFocus = smoothstep(0.72, 0.08, distance(vUv, uFocus));
      float sat = mix(uSaturation * 0.62, uSaturation * 1.22, mix(1.0, nearFocus, uFocusAmt));
      col = mix(vec3(luma), col, sat);
      col *= mix(1.0, mix(0.82, 1.18, nearFocus), uFocusAmt);
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

const GodrayShader = {
  name: 'Godrays',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: {
      value: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1) as THREE.Texture,
    },
    uSun: { value: new THREE.Vector2(0.5, 0.8) },
    uIntensity: { value: 0.22 },
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
    uniform sampler2D tDepth;
    uniform vec2 uSun;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 toSun = uSun - vUv;
      float span = length(toSun);
      // Far from the sun the cool corner stays the grade it already has.
      float sunSide = 1.0 - smoothstep(0.2, 0.58, span);
      float onScreen = smoothstep(-0.2, 0.02, uSun.x) * smoothstep(1.2, 0.98, uSun.x)
                     * smoothstep(-0.25, 0.0, uSun.y) * smoothstep(1.2, 0.98, uSun.y);
      if (sunSide < 0.001 || onScreen < 0.001 || uIntensity < 0.001) {
        gl_FragColor = vec4(col, 1.0);
        return;
      }
      // March from this pixel to the sun. Sky (depth at the far plane, or a
      // bright dawn sample) carries the shaft. A tree or the ridge is darker
      // and closer, and it cuts the rest of the march so the gaps stay bright.
      vec2 sunUv = clamp(uSun, vec2(0.02), vec2(0.98));
      float sunLum = dot(texture2D(tDiffuse, sunUv).rgb, vec3(0.2126, 0.7152, 0.0722));
      float gate = max(0.45, sunLum * 0.38);
      vec2 delta = toSun / 24.0;
      vec2 p = vUv;
      float illum = 0.0;
      float energy = 1.0;
      for (int i = 0; i < 24; i++) {
        p += delta;
        if (p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02) break;
        vec2 q = clamp(p, vec2(0.0), vec2(1.0));
        float dep = texture2D(tDepth, q).r;
        float lum = dot(texture2D(tDiffuse, q).rgb, vec3(0.2126, 0.7152, 0.0722));
        float sky = max(smoothstep(0.992, 0.9992, dep), smoothstep(gate * 0.5, gate, lum));
        illum += sky * energy;
        energy *= mix(0.02, 0.97, sky);
      }
      illum /= 8.0;
      float shafts = smoothstep(0.28, 1.05, illum);
      col += vec3(1.22, 0.74, 0.32) * shafts * uIntensity * onScreen * sunSide * 2.4;
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
  applyQuality(): void;
  setSun(x: number, y: number, elevation: number): void;
  setFocus(x: number, y: number, amount: number): void;
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

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  attachDepth(composer.renderTarget1);
  attachDepth(composer.renderTarget2);

  const sceneGrab = new THREE.WebGLRenderTarget(640, 360, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  sceneGrabUniforms.uScene.value = sceneGrab.texture;
  const sceneDepth = new THREE.WebGLRenderTarget(640, 360, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
  });
  sceneGrabUniforms.uSceneDepth.value = sceneDepth.texture;
  const grab = new SceneGrabPass(sceneGrab, sceneDepth);
  composer.addPass(grab);

  const gtao = new GTAOPass(
    scene,
    camera,
    Math.max(1, window.innerWidth >> (softwareGl ? 3 : 2)),
    Math.max(1, window.innerHeight >> (softwareGl ? 3 : 2)),
  );
  gtao.blendIntensity = 0.7;
  (
    gtao as GTAOPass & {
      updateGtaoMaterial(parameters: {
        samples?: number;
        radius?: number;
        thickness?: number;
      }): void;
    }
  ).updateGtaoMaterial({
    // Two samples on software GL. Four was enough to push the nine shot pages past 240s.
    samples: softwareGl ? 2 : 12,
    radius: 0.4,
    thickness: 0.5,
  });
  gtao.enabled = false;
  // The beauty pass already drew the shadow map this frame. The AO normal
  // pass does not read it, and a second shadow render was most of the
  // extra draws on the town camera.
  const renderGtao = gtao.render.bind(gtao);
  gtao.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    const shadow = renderer.shadowMap;
    const autoUpdate = shadow.autoUpdate;
    shadow.autoUpdate = false;
    shadow.needsUpdate = false;
    try {
      renderGtao(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      shadow.autoUpdate = autoUpdate;
    }
  };
  composer.addPass(gtao);

  const godrays = new ShaderPass(GodrayShader);
  godrays.enabled = false;
  const renderGodrays = godrays.render.bind(godrays);
  godrays.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
    const depth = godrays.uniforms.tDepth;
    // The grab copied the beauty depth before GTAO replaced the buffer.
    if (depth) depth.value = sceneGrabUniforms.uSceneDepth.value ?? readBuffer.depthTexture ?? depth.value;
    renderGodrays(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  };
  composer.addPass(godrays);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

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
      attachDepth(composer.renderTarget1);
      attachDepth(composer.renderTarget2);
      const grabW = Math.max(320, width >> 1);
      const grabH = Math.max(180, height >> 1);
      sceneGrab.setSize(grabW, grabH);
      sceneDepth.setSize(grabW, grabH);
      const shift = softwareGl ? 3 : 2;
      gtao.setSize(Math.max(1, width >> shift), Math.max(1, height >> shift));
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.dispose();
    },
    applyQuality() {
      // High captures run GTAO even on SwiftShader. The normal pass uses one
      // override material, so it does not rebuild the scene's programs.
      // Low stays off so the prospect playtest keeps its frame budget.
      gtao.enabled = RENDER_QUALITY.ao;
      godrays.enabled = RENDER_QUALITY.godrays;
    },
    setSun(x, y, elevation) {
      const sun = godrays.uniforms.uSun?.value as THREE.Vector2 | undefined;
      if (sun) sun.set(x, y);
      const golden = elevation > 0.01 && elevation < 0.32;
      const lift = golden ? 0.95 : elevation > 0.05 ? 0.34 : elevation > -0.04 ? 0.16 : 0;
      const intensity = godrays.uniforms.uIntensity;
      if (intensity) intensity.value = lift;
    },
    setFocus(x, y, amount) {
      const center = grade.uniforms.uFocus?.value as THREE.Vector2 | undefined;
      if (center) center.set(x, y);
      const amt = grade.uniforms.uFocusAmt;
      if (amt) amt.value = amount;
    },
  };
}

function attachDepth(target: THREE.WebGLRenderTarget): void {
  if (target.depthTexture && target.depthTexture.image.width === target.width) return;
  target.depthTexture = new THREE.DepthTexture(target.width, target.height);
}

/** Copy the HDR scene into a texture the creek can read next frame. No swap. */
class SceneGrabPass extends Pass {
  private quad: FullScreenQuad;
  private colorMaterial: THREE.ShaderMaterial;
  private depthMaterial: THREE.ShaderMaterial;

  constructor(
    private readonly target: THREE.WebGLRenderTarget,
    private readonly depthTarget: THREE.WebGLRenderTarget,
  ) {
    super();
    this.needsSwap = false;
    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    this.colorMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
    });
    this.depthMaterial = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null } },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDepth;
        varying vec2 vUv;
        void main() {
          float d = texture2D(tDepth, vUv).r;
          gl_FragColor = vec4(d, d, d, 1.0);
        }
      `,
    });
    this.quad = new FullScreenQuad(this.colorMaterial);
  }

  override render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    this.colorMaterial.uniforms.tDiffuse!.value = read.texture;
    this.quad.material = this.colorMaterial;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    if (read.depthTexture) {
      this.depthMaterial.uniforms.tDepth!.value = read.depthTexture;
      this.quad.material = this.depthMaterial;
      renderer.setRenderTarget(this.depthTarget);
      this.quad.render(renderer);
    }
    sceneGrabUniforms.uHasScene.value = 1;
  }

  override dispose(): void {
    this.colorMaterial.dispose();
    this.depthMaterial.dispose();
    this.quad.dispose();
    this.target.dispose();
    this.depthTarget.dispose();
  }
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
