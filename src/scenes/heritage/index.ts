/**
 * Heritage — the 2023 sphere, faithfully (T06).
 *
 * A TSL port of the original CRA visualizer (`src/index.js` @ `v0-2023-cra`):
 * an outer wireframe icosahedron whose vertices displace along a spectrum-driven
 * `aFrequency` attribute, wrapped around a solid inner shell that scale-pulses
 * with loudness. The look is preserved; only the plumbing is modernized —
 * GLSL→TSL, `WebGLRenderer`→`WebGPURenderer`, hand-rolled RAF→the T03 frame
 * loop, and the raw-FFT audio path→T02's normalized features via the T03 bridge.
 *
 * The CPU mapping (dedup, spectrum upsample, zigzag, transfer curve) lives in
 * `./mapping` (Three-free, unit-tested); the GLSL→TSL shaders live in `./nodes`.
 *
 * Retired 2023 quirks (documented, deliberately not ported): the fixed
 * `setPixelRatio(1.5)` (now governor-managed DPR) and the `Math.max(600,
 * innerHeight)` canvas sizing (now framework-owned in RenderCore).
 */
import { BufferAttribute, Group, IcosahedronGeometry, Mesh, PerspectiveCamera, type Scene } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import type { FrameFeatures, ParamDef, SceneContext, SceneModule } from '../../contracts';
import type { FeatureUniforms } from '../../render/bridge/FeatureUniforms';
import {
  COMPAT_LEN,
  detectIndex,
  fillFrequencies,
  HERITAGE_DEFAULT_INTENSITY,
  innerScaleFromLoud,
  spectrumCompat,
} from './mapping';
import { buildHeritageGraph } from './nodes';

/** Outer wireframe radius (`new IcosahedronGeometry(40, 4)`). */
const OUTER_RADIUS = 40;
/** Inner shell radius (`new IcosahedronGeometry(39.5, 4)`). */
const INNER_RADIUS = 39.5;
/** Subdivision detail — must match both spheres (shared dedup topology). */
const GEO_DETAIL = 4;

/** Camera framing from the 2023 build (`camera.position.set(20, 200, -80)`). */
const CAM_POS = { x: 20, y: 200, z: -80 };
const CAM_FOV = 45;
const CAM_NEAR = 0.1;
/** Far plane 10000 (radius-40 geometry sits ~216 units from the camera). */
const CAM_FAR = 10000;

/** Idle rotation rate: old `uTime += 0.015` per rAF frame ≈ 0.9 rad/s @ 60 fps. */
const ROT_BASE = 0.015 * 60;
/** Beat-locked spin: rotation added per full beat (opt-in modernization). */
const BEAT_SPIN_GAIN = 0.5;

/**
 * Create the Heritage {@link SceneModule}.
 *
 * @param bridge the render core's feature→uniform bridge; the outer `uScale`
 *   reads `bridge.uLoud` (see `./nodes`). Per-vertex displacement is CPU-written
 *   from {@link FrameFeatures.spectrum} each frame (the 2023 approach), so the
 *   scene does not sample the bridge's spectrum texture.
 */
export function createHeritageScene(bridge: FeatureUniforms): SceneModule {
  const params: ParamDef[] = [
    { type: 'select', key: 'mode', label: 'Palette', options: ['color', 'mono'], default: 'color' },
    { type: 'number', key: 'displacement', label: 'Displacement', min: 0, max: 3, step: 0.05, default: 1, modulatable: true },
    { type: 'number', key: 'rotation', label: 'Rotation Speed', min: 0, max: 3, step: 0.05, default: 1, modulatable: true },
    // `bloomSend` is declared here for the params schema/presets, but the bloom
    // amount lives on the post chain (RenderCore.setBloom), which a scene cannot
    // reach — routing it is a Wave-B gate seam (see report).
    { type: 'number', key: 'bloomSend', label: 'Bloom Send', min: 0, max: 1, step: 0.05, default: 0.15, modulatable: true },
    { type: 'select', key: 'spin', label: 'Spin', options: ['free', 'beat-locked'], default: 'free' },
    // How hard the scene reacts to loudness. 1 reproduces the 2023 response
    // exactly; the default is lower because peaks saturated (owner, 2026-08-02).
    {
      type: 'number',
      key: 'intensity',
      label: 'Intensity',
      min: 0,
      max: 1.5,
      step: 0.05,
      default: HERITAGE_DEFAULT_INTENSITY,
      modulatable: true,
    },
  ];

  let group: Group | null = null;
  let outerGeo: IcosahedronGeometry | null = null;
  let innerGeo: IcosahedronGeometry | null = null;
  let outerMat: MeshBasicNodeMaterial | null = null;
  let innerMat: MeshBasicNodeMaterial | null = null;
  let innerMesh: Mesh | null = null;

  // Precomputed dedup + per-frame scratch (allocated once, reused every frame).
  let slotUnique: Int32Array | null = null;
  let uniqueCount = 0;
  let freqByUnique: Float32Array | null = null;
  let aFreqArray: Float32Array | null = null;
  let aFreqAttr: BufferAttribute | null = null;
  const compat = new Float32Array(COMPAT_LEN);

  let graph: ReturnType<typeof buildHeritageGraph> | null = null;
  let lastPhase = 0;

  return {
    id: 'heritage',
    name: 'Heritage',
    params,
    // Orbit + zoom on the shared camera, owned by RenderCore (see the contract
    // note on SceneModule.cameraControls).
    cameraControls: true,

    async init(ctx: SceneContext): Promise<void> {
      const scene = ctx.scene as Scene;

      // Reconfigure the framework's shared camera to the 2023 framing. The core
      // camera is fov 60 / far 100 / z=5 — radius-40 geometry at ~216 units
      // would clip entirely. We do NOT restore this on dispose: the next scene's
      // `init` reconfigures the shared camera before our `dispose` runs.
      const cam = ctx.camera as PerspectiveCamera;
      cam.fov = CAM_FOV;
      cam.near = CAM_NEAR;
      cam.far = CAM_FAR;
      cam.position.set(CAM_POS.x, CAM_POS.y, CAM_POS.z);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();

      // Geometry + dedup — the coherent-wireframe soul of the look.
      outerGeo = new IcosahedronGeometry(OUTER_RADIUS, GEO_DETAIL);
      innerGeo = new IcosahedronGeometry(INNER_RADIUS, GEO_DETAIL);
      const positions = outerGeo.getAttribute('position').array;
      const dedup = detectIndex(positions);
      slotUnique = dedup.slotUnique;
      uniqueCount = dedup.uniqueCount;
      freqByUnique = new Float32Array(uniqueCount);
      aFreqArray = new Float32Array(slotUnique.length);
      aFreqAttr = new BufferAttribute(aFreqArray, 1);
      outerGeo.setAttribute('aFrequency', aFreqAttr);

      // TSL node graphs (replace the 2023 GLSL ShaderMaterials).
      graph = buildHeritageGraph(bridge);
      outerMat = new MeshBasicNodeMaterial();
      outerMat.wireframe = true;
      outerMat.transparent = true;
      outerMat.positionNode = graph.outerPosition;
      outerMat.colorNode = graph.outerColor;

      innerMat = new MeshBasicNodeMaterial();
      innerMat.colorNode = graph.innerColor;

      const g = new Group();
      innerMesh = new Mesh(innerGeo, innerMat);
      g.add(new Mesh(outerGeo, outerMat));
      g.add(innerMesh);
      scene.add(g);
      group = g;

      // Camera control (orbit + zoom) is opted into via `cameraControls` below
      // and OWNED BY RenderCore on the single shared camera. Heritage used to
      // build its own OrbitControls here; a per-scene instance is exactly how
      // one scene's framing leaks into the next (the 2026-07-22 black-screen bug).
    },

    update(f: FrameFeatures, values: Record<string, unknown>, dt: number): void {
      if (!graph || !aFreqAttr || !slotUnique || !freqByUnique || !aFreqArray) return;

      // 1) Per-vertex displacement input: 64-bin spectrum → 256 compat → zigzag
      //    → scatter to every duplicate slot of each unique vertex.
      spectrumCompat(f.spectrum, compat);
      fillFrequencies(compat, freqByUnique, uniqueCount);
      const su = slotUnique;
      const fu = freqByUnique;
      const af = aFreqArray;
      for (let i = 0; i < su.length; i += 1) {
        af[i] = fu[su[i] ?? 0] ?? 0;
      }
      aFreqAttr.needsUpdate = true;

      // 2) Params → uniforms.
      const disp = values['displacement'];
      graph.uDisp.value = typeof disp === 'number' ? disp : 1;
      const intensity =
        typeof values['intensity'] === 'number' ? values['intensity'] : HERITAGE_DEFAULT_INTENSITY;
      graph.uIntensity.value = intensity;
      graph.uMono.value = values['mode'] === 'mono' ? 1 : 0;

      // 3) Inner-shell scale pulse (old `mesh_2.scale = 1 + frequencyAvg/290`).
      if (innerMesh) innerMesh.scale.setScalar(innerScaleFromLoud(f.loudNorm, intensity));

      // 4) Rotation clock. reducedMotion freezes the idle spin; the audio-driven
      //    displacement still reacts (that is content, not idle motion).
      const rotVal = values['rotation'];
      const rot = typeof rotVal === 'number' ? rotVal : 1;
      if (!f.reducedMotion) {
        if (values['spin'] === 'beat-locked' && f.beat.bpm) {
          let dPhase = f.beat.phase - lastPhase;
          if (dPhase < 0) dPhase += 1; // wrapped past a beat boundary
          graph.uTime.value += dPhase * BEAT_SPIN_GAIN * rot;
        } else {
          graph.uTime.value += dt * ROT_BASE * rot;
        }
      }
      lastPhase = f.beat.phase;

    },

    resize(): void {
      // Renderer size / DPR / camera aspect are framework-owned (RenderCore).
    },

    dispose(): void {
      if (group) {
        group.parent?.remove(group);
        group = null;
      }
      outerGeo?.dispose();
      innerGeo?.dispose();
      outerMat?.dispose();
      innerMat?.dispose();
      outerGeo = null;
      innerGeo = null;
      outerMat = null;
      innerMat = null;
      innerMesh = null;
      graph = null;
      slotUnique = null;
      freqByUnique = null;
      aFreqArray = null;
      aFreqAttr = null;
    },
  };
}
