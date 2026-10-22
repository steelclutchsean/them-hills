import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { RENDER_QUALITY } from '@/engine/quality';
import { reflectionUniforms } from '@/render/reflection';
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
      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);
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
  const gtaoPass = gtao as GTAOPass & {
    width: number;
    height: number;
    pdRenderTarget: THREE.WebGLRenderTarget;
    blendMaterial: THREE.ShaderMaterial;
    updateGtaoMaterial(parameters: { samples?: number; radius?: number; thickness?: number }): void;
  };
  // The AO buffer is a fraction of the frame. A straight multiply paints
  // that grid onto the ridgeline. Sample it nearest and weight the four
  // taps by the full-resolution depth so the silhouette stays on the mesh edge.
  gtaoPass.pdRenderTarget.texture.magFilter = THREE.NearestFilter;
  gtaoPass.pdRenderTarget.texture.minFilter = THREE.NearestFilter;
  gtaoPass.pdRenderTarget.texture.generateMipmaps = false;
  const blend = gtaoPass.blendMaterial;
  blend.uniforms.tDepth = { value: null };
  blend.uniforms.uAoSize = { value: new THREE.Vector2(1, 1) };
  const clip = camera as THREE.PerspectiveCamera;
  blend.uniforms.uNear = { value: clip.near };
  blend.uniforms.uFar = { value: clip.far };
  blend.fragmentShader = /* glsl */ `
    uniform float intensity;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uAoSize;
    uniform float uNear;
    uniform float uFar;
    varying vec2 vUv;
    float linearEye(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    void main() {
      vec2 size = max(uAoSize, vec2(1.0));
      vec2 p = vUv * size - 0.5;
      vec2 base = floor(p);
      vec2 f = fract(p);
      float d0 = linearEye(texture2D(tDepth, vUv).r);
      vec2 c00 = clamp(base + vec2(0.5, 0.5), vec2(0.5), size - 0.5) / size;
      vec2 c10 = clamp(base + vec2(1.5, 0.5), vec2(0.5), size - 0.5) / size;
      vec2 c01 = clamp(base + vec2(0.5, 1.5), vec2(0.5), size - 0.5) / size;
      vec2 c11 = clamp(base + vec2(1.5, 1.5), vec2(0.5), size - 0.5) / size;
      float w00 = (1.0 - f.x) * (1.0 - f.y) * exp(-abs(linearEye(texture2D(tDepth, c00).r) - d0) * 0.08);
      float w10 = f.x * (1.0 - f.y) * exp(-abs(linearEye(texture2D(tDepth, c10).r) - d0) * 0.08);
      float w01 = (1.0 - f.x) * f.y * exp(-abs(linearEye(texture2D(tDepth, c01).r) - d0) * 0.08);
      float w11 = f.x * f.y * exp(-abs(linearEye(texture2D(tDepth, c11).r) - d0) * 0.08);
      float wsum = w00 + w10 + w01 + w11;
      vec3 acc = texture2D(tDiffuse, c00).rgb * w00
        + texture2D(tDiffuse, c10).rgb * w10
        + texture2D(tDiffuse, c01).rgb * w01
        + texture2D(tDiffuse, c11).rgb * w11;
      vec3 texel = wsum > 0.0001 ? acc / wsum : texture2D(tDiffuse, vUv).rgb;
      gl_FragColor = vec4(mix(vec3(1.0), texel, intensity), 1.0);
    }
  `;
  blend.needsUpdate = true;
  gtaoPass.updateGtaoMaterial({
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
    const depth = readBuffer.depthTexture;
    if (depth) blend.uniforms.tDepth!.value = depth;
    const aoSize = blend.uniforms.uAoSize!.value as THREE.Vector2;
    aoSize.set(Math.max(1, gtaoPass.width), Math.max(1, gtaoPass.height));
    blend.uniforms.uNear!.value = clip.near;
    blend.uniforms.uFar!.value = clip.far;
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
    if (depth)
      depth.value = sceneGrabUniforms.uSceneDepth.value ?? readBuffer.depthTexture ?? depth.value;
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
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      attachDepth(composer.renderTarget1);
      attachDepth(composer.renderTarget2);
      const grabW = Math.max(320, width >> 1);
      const grabH = Math.max(180, height >> 1);
      sceneGrab.setSize(grabW, grabH);
      sceneDepth.setSize(grabW, grabH);
      const shift = softwareGl ? 3 : 2;
      gtao.setSize(Math.max(1, width >> shift), Math.max(1, height >> shift));
      gtaoPass.pdRenderTarget.texture.magFilter = THREE.NearestFilter;
      gtaoPass.pdRenderTarget.texture.minFilter = THREE.NearestFilter;
    },
    render() {
      // The creek flip divides gl_FragCoord by this. That coord is in the
      // composer target, which is not the drawing buffer when the pixel
      // ratio and the composer disagree.
      reflectionUniforms.uResolution.value.set(
        composer.renderTarget1.width,
        composer.renderTarget1.height,
      );
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
      // Shafts are geometry in the canopy gaps. The radial blur stays off.
      godrays.enabled = false;
    },
    setSun(x, y, _elevation) {
      const sun = godrays.uniforms.uSun?.value as THREE.Vector2 | undefined;
      if (sun) sun.set(x, y);
      const intensity = godrays.uniforms.uIntensity;
      if (intensity) intensity.value = 0;
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

  override render(
    renderer: THREE.WebGLRenderer,
    _write: THREE.WebGLRenderTarget,
    read: THREE.WebGLRenderTarget,
  ): void {
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
