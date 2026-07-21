import { BoxGeometry, Group, Mesh, type Scene } from 'three';
import { color, positionLocal, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import type { FrameFeatures, ParamDef, SceneContext, SceneModule } from '../../contracts';
import type { FeatureUniforms } from '../bridge/FeatureUniforms';
import { SPECTRUM_BINS } from '../bridge/FeatureUniforms';

/** Phosphor accent (oscilloscope CRT green, dark-theme variant) — see 02-design. */
const PHOSPHOR = 0x4ade80;
const BAR_WIDTH = 0.12;
const BAR_SPACING = 0.16;

/**
 * `dev-spectrum` — the single proof-of-life placeholder (real scenes are
 * T06/T09). 64 bars, one per spectrum bin, each with a TSL node material whose
 * vertex height is driven by {@link FeatureUniforms.spectrumAt} — so a rendered
 * frame proves the bridge, registry, governor, and post chain end to end against
 * the fixture feature stream. Throwaway: it lives in `src/render/dev`, not
 * `src/scenes`.
 *
 * @param bridge the render core's feature→uniform bridge (scenes bind here)
 */
export function createDevSpectrumScene(bridge: FeatureUniforms): SceneModule {
  const params: ParamDef[] = [
    { type: 'number', key: 'gain', label: 'Gain', min: 0.25, max: 4, step: 0.05, default: 2, modulatable: true },
    { type: 'number', key: 'spin', label: 'Spin', min: 0, max: 2, step: 0.05, default: 0.3, modulatable: true },
  ];

  let group: Group | null = null;
  const geometries: BoxGeometry[] = [];
  const materials: MeshBasicNodeMaterial[] = [];

  return {
    id: 'dev-spectrum',
    name: 'Dev Spectrum',
    params,

    async init(ctx: SceneContext): Promise<void> {
      const scene = ctx.scene as Scene;
      const g = new Group();
      const half = (SPECTRUM_BINS * BAR_SPACING) / 2;

      for (let i = 0; i < SPECTRUM_BINS; i += 1) {
        const geometry = new BoxGeometry(BAR_WIDTH, 1, BAR_WIDTH);
        const material = new MeshBasicNodeMaterial();
        material.colorNode = color(PHOSPHOR);
        // Height driven live from the spectrum texture (proves the TSL bridge):
        // scale the unit box vertically by the bin energy, and lift it so it
        // grows up from a baseline rather than from its center.
        const h = bridge.spectrumAt(i).mul(4).add(0.05);
        material.positionNode = positionLocal.mul(vec3(1, h, 1)).add(vec3(0, h.mul(0.5), 0));

        const mesh = new Mesh(geometry, material);
        mesh.position.x = i * BAR_SPACING - half;
        g.add(mesh);

        geometries.push(geometry);
        materials.push(material);
      }

      scene.add(g);
      group = g;
    },

    update(f: FrameFeatures, values: Record<string, unknown>, dt: number): void {
      if (!group) return;
      const spin = typeof values['spin'] === 'number' ? values['spin'] : 0.3;
      const gain = typeof values['gain'] === 'number' ? values['gain'] : 2;
      group.rotation.y += dt * spin;
      // Whole-field breathing from normalized loudness × gain (visible proof the
      // fixture stream reaches the scene each frame).
      const s = 1 + f.loudNorm * 0.15 * (gain / 2);
      group.scale.setScalar(s);
    },

    resize(): void {
      // Camera aspect is handled by the render core; nothing per-bar to do.
    },

    dispose(): void {
      if (group) {
        group.parent?.remove(group);
        group = null;
      }
      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
      geometries.length = 0;
      materials.length = 0;
    },
  };
}
