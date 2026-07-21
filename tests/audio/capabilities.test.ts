import { describe, it, expect } from 'vitest';
import { detectCapabilities } from '../../src/audio/capabilities';
import type { CapabilityProbe } from '../../src/audio/capabilities';
import type { SourceCapability, SourceKind } from '../../src/contracts';

function byKind(caps: SourceCapability[], kind: SourceKind): SourceCapability {
  const c = caps.find((x) => x.kind === kind);
  if (!c) throw new Error(`missing capability ${kind}`);
  return c;
}

const chromium: CapabilityProbe = {
  secureContext: true,
  getUserMedia: true,
  getDisplayMedia: true,
  chromium: true,
};

describe('detectCapabilities ladder honesty', () => {
  it('file and procedural are always available', () => {
    const caps = detectCapabilities({
      secureContext: false,
      getUserMedia: false,
      getDisplayMedia: false,
      chromium: false,
    });
    expect(byKind(caps, 'file').available).toBe(true);
    expect(byKind(caps, 'procedural').available).toBe(true);
  });

  it('enables display audio only on secure Chromium with getDisplayMedia', () => {
    const caps = detectCapabilities(chromium);
    expect(byKind(caps, 'display').available).toBe(true);
    expect(byKind(caps, 'display').reason).toBeUndefined();
  });

  it('explains why Firefox/Safari cannot capture tab audio', () => {
    const firefox: CapabilityProbe = { ...chromium, chromium: false };
    const cap = byKind(detectCapabilities(firefox), 'display');
    expect(cap.available).toBe(false);
    expect(cap.reason).toMatch(/Chromium-only/i);
  });

  it('gates input on a secure context and getUserMedia', () => {
    expect(byKind(detectCapabilities(chromium), 'input').available).toBe(true);
    const insecure = byKind(
      detectCapabilities({ ...chromium, secureContext: false }),
      'input',
    );
    expect(insecure.available).toBe(false);
    expect(insecure.reason).toMatch(/secure/i);
    const noGum = byKind(detectCapabilities({ ...chromium, getUserMedia: false }), 'input');
    expect(noGum.available).toBe(false);
  });

  it('never sets reason when available (exactOptionalPropertyTypes)', () => {
    for (const cap of detectCapabilities(chromium)) {
      if (cap.available) expect('reason' in cap).toBe(false);
    }
  });

  it('lists the ladder in order', () => {
    const kinds = detectCapabilities(chromium).map((c) => c.kind);
    expect(kinds).toEqual(['file', 'display', 'input', 'procedural']);
  });
});
