/**
 * Fixture WAV generator for the T10 QA matrix — no dependencies, deterministic.
 *
 * These are fully synthetic, copyright-safe test tones. Regenerate with:
 *   node e2e/fixtures/generate.mjs
 *
 * Outputs (16-bit PCM mono, 44100 Hz):
 *   tone.wav    — a steady two-partial tone (220 + 440 Hz). Loud, non-silent, so
 *                 the SignalCheck loudNorm gate opens and the scenes get a signal.
 *   strobe.wav  — a 10 Hz impulse train (sharp transients). "Strobe bait": far
 *                 more onsets than 3/s so the engine flashGuard MUST clamp them.
 *                 Used by the flash-safety E2E.
 */
/* global Buffer, console */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 44100;
const here = dirname(fileURLToPath(import.meta.url));

/** Encode mono float samples [-1,1] to a 16-bit PCM WAV Buffer. */
function encodeWav(samples, sampleRate = SR) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// ── tone.wav — 2.0 s steady dual-partial tone ────────────────────────────────
{
  const dur = 2.0;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    s[i] = 0.5 * Math.sin(2 * Math.PI * 220 * t) + 0.25 * Math.sin(2 * Math.PI * 440 * t);
  }
  writeFileSync(join(here, 'tone.wav'), encodeWav(s));
}

// ── strobe.wav — 2.0 s, 10 Hz impulse train (onset bait) ─────────────────────
{
  const dur = 2.0;
  const n = Math.floor(SR * dur);
  const s = new Float32Array(n);
  const period = Math.floor(SR / 10); // 10 impulses per second
  const decay = 400; // samples of exponential tail per impulse
  for (let i = 0; i < n; i += 1) {
    const phase = i % period;
    if (phase < decay) {
      const env = Math.exp(-phase / 60);
      // Broadband-ish click: sum of a few high partials modulated by the envelope.
      s[i] = env * (Math.sin(2 * Math.PI * 1200 * (i / SR)) + 0.6 * Math.sin(2 * Math.PI * 3000 * (i / SR)));
    }
  }
  writeFileSync(join(here, 'strobe.wav'), encodeWav(s));
}

console.log('wrote tone.wav and strobe.wav to', here);
