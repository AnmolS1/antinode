import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';

import { parseBackendPreference } from '../../src/render/renderer/bootstrap';
import { clampDt, MAX_DT_MS } from '../../src/render/loop/FrameLoop';
import { FeedbackHelper } from '../../src/render/feedback/FeedbackHelper';
import { CAMERA_BASELINE, resetCameraToBaseline } from '../../src/render/camera';

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

describe('resetCameraToBaseline', () => {
  // Regression: scenes share one camera. Heritage reframes it for its 2023 look
  // (`camera.position.set(20,200,-80); camera.lookAt(0,0,0); fov=45`) and does not
  // restore it. Without a reset before the next scene's init, Standing Wave (and
  // any origin-framed scene) inherits that framing and its geometry projects to a
  // speck off-screen — the "switch away and back → black" bug. This asserts the
  // reset fully undoes a Heritage-style reframe.
  it('restores canonical fov / clip planes / position / orientation after a Heritage-style reframe', () => {
    const cam = new PerspectiveCamera(60, 1.5, 0.1, 100);
    // Corrupt it exactly as Heritage does.
    cam.fov = 45;
    cam.far = 10_000;
    cam.position.set(20, 200, -80);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);

    resetCameraToBaseline(cam);

    expect(cam.fov).toBe(CAMERA_BASELINE.fov);
    expect(cam.near).toBe(CAMERA_BASELINE.near);
    expect(cam.far).toBe(CAMERA_BASELINE.far);
    expect(cam.position.toArray()).toEqual([0, 0, CAMERA_BASELINE.z]);
    // Orientation back to identity (looking down -z), so a scene at the origin frames.
    expect(cam.quaternion.x).toBeCloseTo(0, 12);
    expect(cam.quaternion.y).toBeCloseTo(0, 12);
    expect(cam.quaternion.z).toBeCloseTo(0, 12);
    expect(cam.quaternion.w).toBeCloseTo(1, 12);
    // The view matrix is the plain z=+5 eye (its inverse translates by -5 in z).
    expect(cam.matrixWorldInverse.elements[14]).toBeCloseTo(-CAMERA_BASELINE.z, 12);
  });

  it('leaves aspect untouched (owned by the size/quality path)', () => {
    const cam = new PerspectiveCamera(60, 1, 0.1, 100);
    cam.aspect = 2.3;
    resetCameraToBaseline(cam);
    expect(cam.aspect).toBe(2.3);
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
