# BUILD.md — assembling `antinode-lookdev.toe`

The look-dev patch. Its whole job: make TouchDesigner **speak the same language as the
web engine** so a shader prototyped here ports to a TSL scene by mechanical translation
(see `PORTING.md`), not a rewrite.

A `.toe` is a binary and stays untracked (`*.toe` is gitignored — repo `.gitignore` line 39).
This document *is* the source of record: any TD session can rebuild the patch from it in
~15 min. Build steps below reference the operator canon in `SKILL.md` — read that first.

- **Target build:** TouchDesigner 2025.32280+ (GLSL 4.60, Vulkan backend).
- **Project cook rate:** 60 FPS. Set Realtime ON.
- **Contract this patch mirrors:** `FrameFeatures` in `../src/contracts/features.ts`
  (`{ t, rms, loudNorm, bands{bass,lowMid,mid,high}, spectrum[64], flux, onset, beat{bpm,phase,confidence}, silent }`).
  The channel names and uniforms below are chosen to match those leaf fields exactly so a
  port is find-and-replace. `PORTING.md` has the authoritative mapping table.

---

## 0. Network overview

```
audio_analysis/  (COMP)
  Audio Device In CHOP (BlackHole 2ch)
    → audioAnalysis (palette comp)          → rename/Math/Lag chain → null_features
    → Audio Spectrum CHOP → Resample(64)     → CHOP to TOP          → null_spectrum_top
control/         (COMP)   ← uniforms are CHOP-referenced from null_features
visuals/         (COMP)
  glsl_scratch (GLSL TOP)  inputs: [0]=null_spectrum_top TOP, [1]=feedback1 TOP
    → feedback1 (Feedback TOP) ─┐ (wired back to glsl_scratch input 1)
    → out_composite (Null TOP)  ┘
output/          (COMP)
  scene_switch (Switch TOP)  index 0 = blank_safe (black Constant TOP)
    → window1 (Window COMP, Perform Mode)
```

Layer/naming discipline follows `SKILL.md` §6a–6b (snake_case, `null_`/`out_` prefixes).

---

## 1. Audio device in — same signal the browser hears

Add an **Audio Device In CHOP** (`SKILL.md` §3a).

- **Device:** `BlackHole 2ch`. This is the loopback the web app recommends as capture
  source #3 (see `00-overview.md` capture ladder). Using it here means look-dev hears
  **exactly** what a browser tab-capture / loopback user would — same bit-clean signal,
  not a re-EQ'd monitor path.
- **Sample Rate:** match the source (48000 typical; 44100 if your interface is set there).
- Route monitoring, if you want it, through a **separate** Audio Device Out CHOP in
  parallel — never through the analysis chain (`SKILL.md` §3a).

> macOS setup: create a Multi-Output Device (BlackHole + your headphones) in Audio MIDI
> Setup so you can still hear the track while BlackHole carries it to TD. This mirrors the
> exact OS step the web UI's guided loopback setup walks a user through.

---

## 2. Feature channels — named exactly like `FrameFeatures`

Goal: a single `null_features` CHOP whose channels are named identically to the contract's
scalar leaf fields, so the GLSL uniforms (and later the TSL port) read the same tokens.

Drop the **`audioAnalysis`** palette component (Palette → Tools → `audioAnalysis`,
`SKILL.md` §3b) and wire the Audio Device In CHOP to its left input. It internally provides
`low`, `mid`, `high`, `kick`, etc. Then build the rename/Math/Lag normalization chain so
the output channels are:

| TD channel | Source (audioAnalysis / derived) | Web contract field | Notes |
|---|---|---|---|
| `bass`     | `low`                              | `bands.bass`   | 20–150 Hz |
| `lowMid`   | band-split 150–500 Hz (Audio Band EQ → Envelope) | `bands.lowMid` | audioAnalysis has no `lowMid`; add a manual band (`SKILL.md` §3b method 2) |
| `mid`      | `mid`                              | `bands.mid`    | 500 Hz–2 kHz |
| `high`     | `high`                             | `bands.high`   | 2 kHz+ |
| `rms`      | Analyze CHOP (Function: RMS) on the full-band signal | `rms` | perceptual loudness |
| `loudNorm` | `rms` → Math normalize → the same rolling-percentile idea (see §2b) | `loudNorm` | 0–1 |
| `flux`     | Audio Spectrum → per-bin delta → positive-half-wave → Analyze (Average) | `flux` | positive spectral change |
| `beatPhase`| `kick`/beat → phase ramp 0→1 per beat (see §2c) | `beat.phase` | **note nesting** |

Chain per channel (from `SKILL.md` §3b–3c), in order:

```
[band source] → Envelope → Resample(60) → Math (normalize 0–1) → Lag → Rename → (Merge) → null_features
```

Merge all renamed channels into one **Merge CHOP**, then a single **Null CHOP** named
`null_features` (the reference point, `SKILL.md` §3d / §6b).

### 2a. Lag CHOP settings (asymmetric — fast attack, slow decay)

`SKILL.md` §8b: "asymmetric lag is king." Lag CHOP **Lag Up** = attack, **Lag Down** =
release, in **seconds**. The web engine applies the *same* asymmetric smoothing in the
AudioWorklet (`00-overview.md`: "smoothed with asymmetric lag — fast attack, slow decay,
the TD skill file's §8 wisdom, ported"). Match these so a TD look feels identical after port.

> ✅ **CONFIRMED against T02.** These are the shipped `LAG_CONSTANTS` from
> `../src/audio/dsp/lag.ts` — the exact smoothing scenes actually see. Attack (Lag Up) = 0
> everywhere (instant onset, `SKILL.md` §8b); release (Lag Down) in seconds. T02 implements a
> framed one-pole (`alpha = 1 - exp(-dt/tau)`; rising snaps, falling uses release); a TD Lag
> CHOP is the same time-constant-in-seconds semantics, so map release → **Lag Down** and 0 →
> **Lag Up**. Because the engine has **already applied** this before scenes see
> `FrameFeatures`, the port must **not** double-smooth (see `PORTING.md` signal table).

| Channel | Lag Up (attack, s) | Lag Down (release, s) | Source |
|---|---|---|---|
| `bass`     | 0.00 | 0.35 | `LAG_CONSTANTS` |
| `lowMid`   | 0.00 | 0.28 | `LAG_CONSTANTS` |
| `mid`      | 0.00 | 0.20 | `LAG_CONSTANTS` |
| `high`     | 0.00 | 0.12 | `LAG_CONSTANTS` |
| `loudNorm` | 0.00 | 0.25 | `LAG_CONSTANTS` |
| `flux`     | 0.00 | 0.09 | `LAG_CONSTANTS` |
| `rms`      | 0.00 | ~0.18 | **raw** — not in `LAG_CONSTANTS` (contract: "raw RMS loudness"). Engine leaves it unsmoothed; this is a **look-dev-only** convenience value, tune to taste. |
| `beatPhase`| —    | —    | do **not** lag a phase ramp — it must stay linear 0→1 |

### 2b. `loudNorm` — rolling-percentile normalization

The contract's `loudNorm` is "loudness mapped through a running percentile normalizer, 0–1".
TD has no built-in percentile op; approximate for look-dev with an **Audio Dynamics CHOP**
(or Analyze CHOP → running Max/Min over a window → Math remap of `rms` into that range).
This is an *approximation* — flag it in `PORTING.md` honest-limits; the web engine's
percentile normalizer is the real thing and scenes should be tuned against it.

### 2c. `onset` (boolean) and `beatPhase`

- `onset` in the contract is a **boolean** (thresholded, flashGuard rate-limited), not a
  level. Build it with a **Logic CHOP** on the kick bin (`SKILL.md` §3b kick pattern:
  Audio Spectrum → Trim → Analyze Max → Math → Logic, bounds ~1.2–2.0). Output is 0/1.
  Feed it into the GLSL as `uOnset` (float 0.0/1.0). Do **not** treat it as a continuous
  channel.
- `beatPhase` is a 0→1 ramp within each beat (contract `beat.phase`). Drive a ramp/LFO
  reset on each Logic onset, or use the audioAnalysis rhythm output. Keep it linear.

---

## 3. Spectrum texture — same 64-bin layout as the web `DataTexture`

The contract's `spectrum` is **64 log-spaced** bins, normalized+smoothed, delivered to
scenes as a `DataTexture`. Reproduce that texture so a shader samples it identically here
and after port.

```
Audio Spectrum CHOP  →  Resample CHOP (Output Length = 64)  →  CHOP to TOP  →  null_spectrum_top
```

- **CHOP to TOP** lays the 64 channels/samples as a 1-D texture row — the same layout the
  web side uploads into its `DataTexture`. Wire `null_spectrum_top` into GLSL TOP input `[0]`.
- ⚠️ **Bin-spacing caveat:** Audio Spectrum → Resample(64) is **linear** across the FFT
  by default; the contract is **log-spaced**. For faithful look-dev, remap to log spacing
  (a Lookup CHOP with a log index curve, or sample the spectrum with a log index in the
  shader). Documented as a fidelity limit in `PORTING.md`. Without it the visual still works
  but the per-bin position won't match the web scene exactly.

---

## 4. GLSL TOP scratchpad — the identical interface the web scenes see

Add a **GLSL TOP** named `glsl_scratch` (`SKILL.md` §4a). **Prototype every shader against
the same uniform/sampler interface the web engine exposes**, so the shader body ports with
find-and-replace.

**Inputs:**
- `sTD2DInputs[0]` = `null_spectrum_top` (the 64-bin spectrum texture).
- `sTD2DInputs[1]` = `feedback1` (Feedback TOP — previous frame; §5).

**Uniforms** (declare on the GLSL TOP Vectors/Floats pages; each value is a **CHOP-reference
expression** into `null_features`, given verbatim). These map 1:1 to `FrameFeatures` — see
the mapping (incl. the non-obvious `uLoud`→`loudNorm`, `uBeatPhase`→`beat.phase`) in
`PORTING.md`:

| Uniform | Type | Parameter expression (verbatim) | Contract field |
|---|---|---|---|
| `uBass`      | float | `op('null_features')['bass']`      | `bands.bass` |
| `uLowMid`    | float | `op('null_features')['lowMid']`    | `bands.lowMid` |
| `uMid`       | float | `op('null_features')['mid']`       | `bands.mid` |
| `uHigh`      | float | `op('null_features')['high']`      | `bands.high` |
| `uRms`       | float | `op('null_features')['rms']`       | `rms` |
| `uLoud`      | float | `op('null_features')['loudNorm']`  | `loudNorm` |
| `uFlux`      | float | `op('null_features')['flux']`      | `flux` |
| `uBeatPhase` | float | `op('null_features')['beatPhase']` | `beat.phase` |
| `uOnset`     | float | `op('null_onset')['onset']`        | `onset` (bool→0/1) |
| `uTime`      | float | `absTime.seconds`                  | `t` (**see caveat**) |

> ⚠️ `uTime` caveat: `SKILL.md` §7a wires TD time from `absTime.seconds` (**wall-clock**,
> seconds since TD launched). The contract's `t` is **audio-clock** seconds. For look-dev
> this is close enough, but it is a real divergence — the port reads `f.t`, not wall time.
> Listed in `PORTING.md` honest-limits.

**Minimal scratch shader** (obeys `SKILL.md` §4a: no `#version`, call `TDOutputSwizzle`):

```glsl
uniform float uBass, uLowMid, uMid, uHigh, uRms, uLoud, uFlux, uBeatPhase, uOnset, uTime;
layout(location = 0) out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;                                  // 0..1, auto-provided (GLSL TOP only)
    float spec = texture(sTD2DInputs[0], vec2(uv.x, 0.0)).r;   // 64-bin spectrum row
    vec4  prev = texture(sTD2DInputs[1], uv) * 0.96;           // last frame (feedback)
    vec3  col  = TDHSVToRGB(vec3(uBeatPhase, 0.7, uLoud));     // hue rides beat phase
    col += spec * uHigh;                               // spectrum drives detail
    col += vec3(uOnset);                               // flash on onset
    fragColor = TDOutputSwizzle(vec4(col, 1.0) + prev);
}
```

---

## 5. Feedback loop

Per `SKILL.md` §4c: wire `glsl_scratch` output → **Feedback TOP** (`feedback1`) → back into
`glsl_scratch` **input slot 1** (`sTD2DInputs[1]`). This is the exact ping-pong that
`PORTING.md` maps to T03's `FeedbackHelper`. Composite to a **Null TOP** `out_composite`.

---

## 6. Perform mode + safe blank scene

Per `SKILL.md` §8c:

- **Switch TOP** `scene_switch` selecting between scenes; **index 0 = `blank_safe`**, a
  black **Constant TOP**. Never demo into a live-editing scene destructively.
- **Window COMP** `window1` → the scratch composite; demo in **Perform Mode** (`F1`,
  `SKILL.md` §6c) to cut UI cook overhead.

---

## 7. Verification checklist (for the TD-equipped rebuild — Anmol or a TD session)

Acceptance requires a human/TD-equipped pass. Leave unchecked until run in a real TD build.

- [ ] Rebuilt from this doc in TD **2025.32280+** in ~15 min.
- [ ] `Audio Device In CHOP` device = BlackHole 2ch, channels show live level (not flat —
      see `SKILL.md` §9 flat-line fix).
- [ ] `null_features` exposes exactly: `bass lowMid mid high rms loudNorm flux beatPhase`
      (names identical to the contract leaf fields — run the grep check in `PORTING.md` §5).
- [ ] `null_spectrum_top` is a 64-wide texture row.
- [ ] `glsl_scratch` compiles (no pink/error — `SKILL.md` §9), all 10 uniforms resolve,
      `sTD2DInputs[0]`/`[1]` bound.
- [ ] Feedback loop shows trails (not black — `SKILL.md` §9 feedback fix).
- [ ] Switch index 0 = black safe scene; Window COMP runs in Perform Mode.
