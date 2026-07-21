import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import type { ParamDef } from '../../src/contracts';
import { createMockEngine, signalFrame } from '../../src/ui/dev/mockEngine';
import { ParamsPane, type PaneApi } from '../../src/ui/params/ParamsPane';
import { createDevParamHost, DEV_DEFAULT_ROUTES } from '../../src/ui/params/devHost';
import { decodePresetFromHash } from '../../src/ui/params/presets';

const DEV_DEFS: ParamDef[] = [
  { type: 'number', key: 'gain', label: 'Gain', min: 0.25, max: 4, step: 0.05, default: 2, modulatable: true },
  { type: 'number', key: 'spin', label: 'Spin', min: 0, max: 2, step: 0.05, default: 0.3, modulatable: true },
];

const OTHER_DEFS: ParamDef[] = [
  { type: 'boolean', key: 'wire', label: 'Wireframe', default: true },
];

function makeHost() {
  const engine = createMockEngine('chrome');
  engine.emit(signalFrame(1)); // a lively frame so bass > 0
  const host = createDevParamHost({
    sceneId: 'dev-spectrum',
    defs: DEV_DEFS,
    latest: engine.latest,
    defaultRoutes: DEV_DEFAULT_ROUTES,
  });
  return { engine, host };
}

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe('ParamsPane (Tweakpane view)', () => {
  it('auto-generates controls from the scene ParamDefs plus global/preset folders', () => {
    const { engine, host } = makeHost();
    const { container } = render(<ParamsPane engine={engine} host={host} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Gain');
    expect(text).toContain('Spin');
    expect(text).toContain('Global');
    expect(text).toContain('Presets');
    // the pane mounted into our container (the .dock mount seam)
    expect(container.querySelector('[data-testid="params-pane"]')).toBeTruthy();
  });

  it('exposes an imperative API and builds a decodable share hash', async () => {
    const { engine, host } = makeHost();
    let api: PaneApi | null = null;
    render(<ParamsPane engine={engine} host={host} onReady={(a) => (api = a)} />);
    expect(api).not.toBeNull();
    const hash = await (api as unknown as PaneApi).share();
    expect(hash.startsWith('#p=')).toBe(true);
    const decoded = await decodePresetFromHash(hash);
    expect(decoded?.sceneId).toBe('dev-spectrum');
    expect(decoded?.paramValues['gain']).toBe(2);
    // default routes were captured into the snapshot
    expect(decoded?.modRoutes['gain']?.[0]?.source).toBe('bass');
  });

  it('rebuilds when the scene changes', () => {
    const { engine, host } = makeHost();
    const { container } = render(<ParamsPane engine={engine} host={host} />);
    expect(container.textContent).toContain('Gain');
    act(() => host.loadScene('other', OTHER_DEFS));
    const text = container.textContent ?? '';
    expect(text).toContain('Wireframe');
    expect(text).not.toContain('Gain');
  });

  it('randomize through the API keeps params in range', () => {
    const { engine, host } = makeHost();
    let api: PaneApi | null = null;
    render(<ParamsPane engine={engine} host={host} onReady={(a) => (api = a)} />);
    (api as unknown as PaneApi).randomize();
    const gain = host.getBase('gain') as number;
    expect(gain).toBeGreaterThanOrEqual(0.25);
    expect(gain).toBeLessThanOrEqual(4);
  });
});

describe('dev ParamHost + mod-matrix integration', () => {
  it('resolves modulated params from live features (sound → param)', () => {
    const engine = createMockEngine('chrome');
    engine.emit(signalFrame(1)); // bass ~0.7
    const host = createDevParamHost({
      sceneId: 'dev-spectrum',
      defs: DEV_DEFS,
      latest: engine.latest,
      defaultRoutes: DEV_DEFAULT_ROUTES,
    });
    // gain has a bass route (amount 0.6); a bassy frame should push it above base.
    host.tick(engine.latest(), 1 / 60);
    const gain = host.resolved()['gain'] as number;
    expect(gain).toBeGreaterThan(2);
    expect(gain).toBeLessThanOrEqual(4); // within ParamDef range
  });

  it('previewValue reflects the resolved value for the meters', () => {
    const engine = createMockEngine('chrome');
    engine.emit(signalFrame(1));
    const host = createDevParamHost({
      sceneId: 'dev-spectrum',
      defs: DEV_DEFS,
      latest: engine.latest,
      defaultRoutes: DEV_DEFAULT_ROUTES,
    });
    expect(host.previewValue('gain')).toBeGreaterThan(2);
  });

  it('setBase with no routes is the identity (silence)', () => {
    const engine = createMockEngine('chrome');
    engine.emit(signalFrame(1));
    const host = createDevParamHost({ sceneId: 'dev-spectrum', defs: DEV_DEFS, latest: engine.latest });
    host.setBase('gain', 1.5);
    host.tick(engine.latest(), 1 / 60);
    expect(host.resolved()['gain']).toBe(1.5); // no default routes injected
  });
});
