import { describe, expect, it } from 'vitest';

import { parseBackendPreference } from '../../src/render/renderer/bootstrap';
import { clampDt, MAX_DT_MS } from '../../src/render/loop/FrameLoop';
import { FeedbackHelper } from '../../src/render/feedback/FeedbackHelper';

describe('parseBackendPreference', () => {
  it('defaults to letting the renderer choose (no forceWebGL)', () => {
    expect(parseBackendPreference('')).toEqual({ forceWebGL: false });
    expect(parseBackendPreference('?foo=bar')).toEqual({ forceWebGL: false });
  });

  it('forces WebGL2 on ?gl=1', () => {
    expect(parseBackendPreference('?gl=1').forceWebGL).toBe(true);
    expect(parseBackendPreference('gl=1').forceWebGL).toBe(true); // leading ? optional
  });

  it('honors the ?gpu=0 alias', () => {
    expect(parseBackendPreference('?gpu=0').forceWebGL).toBe(true);
  });

  it('does not force for gl=0 or gpu=1', () => {
    expect(parseBackendPreference('?gl=0').forceWebGL).toBe(false);
    expect(parseBackendPreference('?gpu=1').forceWebGL).toBe(false);
  });
});

describe('clampDt', () => {
  it('passes through normal deltas', () => {
    expect(clampDt(16)).toBe(16);
  });

  it('caps a background-tab return spike', () => {
    expect(clampDt(5000)).toBe(MAX_DT_MS);
  });

  it('floors negative / non-finite deltas at 0', () => {
    expect(clampDt(-10)).toBe(0);
    expect(clampDt(Number.NaN)).toBe(0);
  });

  it('respects a custom ceiling', () => {
    expect(clampDt(100, 33)).toBe(33);
  });
});

describe('FeedbackHelper', () => {
  it('swaps read/write targets', () => {
    const fb = new FeedbackHelper(64, 64);
    const read0 = fb.read;
    const write0 = fb.write;
    expect(read0).not.toBe(write0);
    fb.swap();
    expect(fb.read).toBe(write0);
    expect(fb.write).toBe(read0);
    fb.dispose();
  });

  it('resizes both targets', () => {
    const fb = new FeedbackHelper(32, 32);
    fb.setSize(128, 96);
    expect(fb.read.width).toBe(128);
    expect(fb.read.height).toBe(96);
    expect(fb.write.width).toBe(128);
    fb.dispose();
  });
});
