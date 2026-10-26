// Full-screen raymarch renderer with bloom and a final grade/grain pass.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { fullscreenVert, blackholeFrag, finalFrag } from '../shaders/index.js';

const DEG = Math.PI / 180;

/** Galaxy plane normal and galactic-centre direction of the procedural sky (world frame). */
const GALAXY_NORMAL = new THREE.Vector3(0.32, 0.86, -0.4).normalize();
const GALAXY_CENTER = new THREE.Vector3(-0.85, 0.12, -0.5)
  .projectOnPlane(GALAXY_NORMAL)
  .normalize();
/** Direction of the bright alignment star used for the Einstein ring view. */
export const BEACON_DIR = new THREE.Vector3(-0.55, 0.18, -0.81).normalize();

export class BlackHoleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderScale = 1;

    this.uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3(0, 0, 25) },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamForward: { value: new THREE.Vector3(0, 0, -1) },
      uTanHalfFov: { value: Math.tan(27.5 * DEG) },
      uWorldToDisk: { value: new THREE.Matrix3() },
      uDiskToWorld: { value: new THREE.Matrix3() },
      uLensing: { value: 1 },
      uSpin: { value: 0 },
      uDiskInner: { value: 3 },
      uDiskOuter: { value: 13 },
      uDiskTemp: { value: 5000 },
      uDiskDensity: { value: 1 },
      uCamDilation: { value: 1 },
      uStretch: { value: 1 },
      uMaxSteps: { value: 260 },
      uStepScale: { value: 1 },
      uOctaves: { value: 4 },
      uBeaconDir: { value: BEACON_DIR.clone() },
      uGalaxyNormal: { value: GALAXY_NORMAL.clone() },
      uGalaxyCenter: { value: GALAXY_CENTER.clone() },
      uProbeOn: { value: 0 },
      uProbePos: { value: new THREE.Vector3() },
      uProbeAxis: { value: new THREE.Vector3(1, 0, 0) },
      uProbeSize: { value: new THREE.Vector2(0.3, 0.14) },
      uProbeG: { value: 1 },
      uProbeBlink: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: blackholeFrag,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.8);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uExposure: { value: 1.05 },
        uGrain: { value: 0.035 },
        uLetterbox: { value: 0 },
      },
      vertexShader: fullscreenVert,
      fragmentShader: finalFrag,
    });
    this.composer.addPass(this.finalPass);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Applies a quality level from scene/quality.js. */
  setQuality(level) {
    this.renderScale = level.renderScale;
    this.uniforms.uMaxSteps.value = level.maxSteps;
    this.uniforms.uStepScale.value = level.stepScale;
    this.uniforms.uOctaves.value = level.octaves;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const pr = this.basePixelRatio * this.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const bw = Math.round(w * pr);
    const bh = Math.round(h * pr);
    this.uniforms.uResolution.value.set(bw, bh);
    this.finalPass.uniforms.uResolution.value.set(bw, bh);
  }

  /**
   * Updates per-frame uniforms.
   * @param {object} s
   * @param {number[]} s.camPos camera position in rs units (world frame)
   * @param {number[]} s.right camera basis vectors
   * @param {number} s.fov vertical field of view, degrees
   * @param {number} s.tilt disk tilt, degrees
   */
  setView(s) {
    const u = this.uniforms;
    u.uCamPos.value.fromArray(s.camPos);
    u.uCamRight.value.fromArray(s.right);
    u.uCamUp.value.fromArray(s.up);
    u.uCamForward.value.fromArray(s.forward);
    u.uTanHalfFov.value = Math.tan((s.fov * DEG) / 2);
    const m4 = new THREE.Matrix4().makeRotationX(s.tilt * DEG);
    u.uDiskToWorld.value.setFromMatrix4(m4);
    u.uWorldToDisk.value.copy(u.uDiskToWorld.value).transpose();
  }

  render(realTime) {
    this.finalPass.uniforms.uTime.value = realTime;
    this.composer.render();
  }
}
