import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GOVERNOR_CONFIG,
  QUALITY_LADDER,
  QualityGovernor,
  decideStep,
  percentile,
  type GovernorState,
} from '../../src/render/governor/QualityGovernor';

describe('percentile', () => {
  it('returns 0 for an empty series', () => {
    expect(percentile([], 0.75)).toBe(0);
  });

  it('computes p75 by nearest-rank, order-independently', () => {
    const values = [10, 8, 6, 4, 2]; // sorted: 2,4,6,8,10
    // ceil(0.75*5)=4 → index 3 → 8
    expect(percentile(values, 0.75)).toBe(8);
  });

  it('clamps p to [0,1]', () => {
    expect(percentile([1, 2, 3], 2)).toBe(3);
    expect(percentile([1, 2, 3], -1)).toBe(1);
  });
});

describe('decideStep', () => {
  const cfg = DEFAULT_GOVERNOR_CONFIG;
  const fresh = (): GovernorState => ({ level: 0, overCount: 0, underCount: 0 });

  it('steps down only after sustained over-budget pressure', () => {
    let s = fresh();
    const over = cfg.budgetMs + 5;
    for (let i = 0; i < cfg.stepDownAfter - 1; i += 1) {
      s = decideStep(s, over, cfg);
      expect(s.level).toBe(0);
    }
    s = decideStep(s, over, cfg);
    expect(s.level).toBe(1);
    expect(s.overCount).toBe(0);
  });

  it('does not exceed maxLevel', () => {
    let s = fresh();
    for (let i = 0; i < 200; i += 1) s = decideStep(s, cfg.budgetMs + 50, cfg);
    expect(s.level).toBe(cfg.maxLevel);
  });

  it('recovers hysteretically after sustained headroom', () => {
    let s: GovernorState = { level: 2, overCount: 0, underCount: 0 };
    const under = cfg.recoverMs - 2;
    for (let i = 0; i < cfg.stepUpAfter - 1; i += 1) {
      s = decideStep(s, under, cfg);
      expect(s.level).toBe(2);
    }
    s = decideStep(s, under, cfg);
    expect(s.level).toBe(1);
  });

  it('the neutral band relaxes counters without changing level', () => {
    const s: GovernorState = { level: 1, overCount: 2, underCount: 0 };
    const neutral = (cfg.budgetMs + cfg.recoverMs) / 2;
    const next = decideStep(s, neutral, cfg);
    expect(next.level).toBe(1);
    expect(next.overCount).toBe(1);
  });
});

describe('QualityGovernor', () => {
  it('does not steer until the window is warm', () => {
    const g = new QualityGovernor({ windowSize: 10 });
    for (let i = 0; i < 9; i += 1) expect(g.sample(100)).toBe(false);
    expect(g.levelIndex).toBe(0);
  });

  it('steps down under sustained load and recovers when it clears', () => {
    const g = new QualityGovernor({
      windowSize: 4,
      config: { stepDownAfter: 1, stepUpAfter: 1 },
    });
    // Warm + push well over budget.
    for (let i = 0; i < 8; i += 1) g.sample(40);
    expect(g.levelIndex).toBeGreaterThan(0);
    const loaded = g.levelIndex;

    // Now feed comfortably fast frames; level should come back down.
    for (let i = 0; i < 8; i += 1) g.sample(5);
    expect(g.levelIndex).toBeLessThan(loaded);
    expect(g.fps).toBeGreaterThan(0);
  });

  it('exposes the active ladder multipliers', () => {
    const g = new QualityGovernor();
    expect(g.level).toEqual(QUALITY_LADDER[0]);
  });
});
