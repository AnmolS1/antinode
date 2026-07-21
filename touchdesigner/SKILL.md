# TouchDesigner Skill File
## Focus: Audio-Reactive Visuals & Generative Art

**Current stable build:** 2025.32280 (Jan 2026). GLSL version: 4.60. Rendering backend: Vulkan.

Read this file before answering any TouchDesigner question. Apply all relevant sections. Do not guess at operator names or parameter strings — use the exact names documented here.

---

## 1. Operator Family Quick Reference

| Family | What it does | Audio-reactive role |
|--------|-------------|---------------------|
| **CHOP** | Channel data streams (1D, time-based) | The *primary* domain for all audio analysis and signal routing |
| **TOP** | 2D GPU textures | Visual output, feedback loops, GLSL shaders |
| **SOP** | 3D geometry | Point clouds, mesh displacement |
| **MAT** | Materials/shaders for 3D | GLSL vertex/pixel shaders on geometry |
| **DAT** | Text/tables/scripts | Python scripting, parameter tables |
| **COMP** | Containers, UI, render setup | Scene organization, reusable modules |

**Operator naming convention:** snake_case, lowercase. `op('audioanalysis1')`, `op('null_bass')`. Avoid spaces in names.

---

## 2. Cooking Model (Critical for Performance)

TouchDesigner is a **pull system** — operators only cook (compute) when something downstream needs their output. Understanding this is essential for optimization.

- An operator cooks when: its inputs change, its parameters change, the timeline advances (for time-dependent ops), or a script forces it.
- Cooking propagates **downstream**: one noisy upstream op can force every connected op to recook every frame.
- **Static ops** placed after dynamic ones can be cached (don't recook if inputs unchanged). Reorder networks to push static ops as late as possible.
- **Middle-click** any node → see Cook Time (ms) and cook count. Use Performance Monitor (`Alt+F`) for full network profiling.
- **Null CHOP in Selective mode** stops downstream cooking when its input isn't changing — use this to gate audio channels that are idle.
- **Viewer toggle**: turning off viewers for expensive CHOPs (e.g. a TOP-to-CHOP with many channels) meaningfully reduces cook cost.

---

## 3. Audio Analysis Pipeline (Canon Approach)

### 3a. Signal Acquisition
```
Audio File In CHOP   ← for file playback
Audio Device In CHOP ← for live input (mic, interface, Ableton via virtual cable)
```
Set sample rate on the CHOP to match your audio source (typically 44100 or 48000 Hz).
Connect to **Audio Device Out CHOP** in parallel if monitoring is needed — never route the analysis chain through the output chain.

### 3b. Frequency Band Splitting (Two Methods)

**Method 1 — audioAnalysis Palette Component (recommended for beginners/rapid prototyping)**
- Found in Palette Browser → Tools → `audioAnalysis`
- Internally uses Audio Spectrum + Envelope + Resample CHOPs
- Outputs named channels: `low`, `mid`, `high`, `kick`, `snare`, `rhythm`, and others
- Drag into network, connect your Audio CHOP to its left input
- Toggle "Send Audio to Default Out" if you want monitoring

**Method 2 — Manual Band Split (recommended for precise control)**
```
Audio File In / Device In CHOP
    → Audio Band EQ CHOP  (low: 20–200 Hz)
    → Audio Band EQ CHOP  (mid: 200–4000 Hz)
    → Audio Band EQ CHOP  (high: 4000–20000 Hz)
    (each EQ connected in parallel from the source, not in series)
```
Then per band:
```
Audio Band EQ CHOP
    → Envelope CHOP       (extracts amplitude envelope)
    → Resample CHOP       (match to project FPS for frame-accurate data)
    → Math CHOP           (scale/normalize: output range 0–1 or 0–5)
    → Lag CHOP            (smooth: attack=0, release=0.1–0.4 seconds)
    → Filter CHOP         (optional: Gaussian, width ~0.3s for further smoothing)
    → Rename CHOP         (name channel: "bass", "mid", "high")
    → Null CHOP           ← reference point for downstream ops
```

**For kick/beat detection specifically:**
```
Audio Spectrum CHOP  (set Output Length to "Set Length Manually")
    → Trim CHOP          (isolate kick frequency bin, typically 40–80 Hz samples)
    → Analyze CHOP       (Function: Maximum)
    → Math CHOP          (normalize to 0–1)
    → Logic CHOP         (Convert Input: "Off when Outside Bounds", bounds 1.2–2.0)
    → Null CHOP
```

### 3c. Signal Shaping CHOPs (Know These Cold)

| CHOP | Purpose | Key Parameters |
|------|---------|----------------|
| **Envelope CHOP** | Tracks amplitude of audio signal | Window length (attack/release shape); Normalize Power |
| **Lag CHOP** | Asymmetric smoothing (separate up/down times) | Up lag: 0 for sharp attack; Down lag: 0.1–0.5 for natural decay |
| **Filter CHOP** | Symmetric temporal smoothing | Type: Gaussian (default, best for visual smoothing); Width: 0.3s typical |
| **Math CHOP** | Rescale channels | From Range / To Range — remap 0–1 audio to 0–5 for dramatic effect |
| **Analyze CHOP** | Collapse channel to single value | Functions: RMS, Maximum, Average — RMS for perceptual loudness |
| **Resample CHOP** | Match sample rates | Set to project FPS (60) for frame-accurate downstream use |
| **Rename CHOP** | Name channels for CHOP references | Essential for readable parameter expressions |
| **Merge CHOP** | Combine multiple CHOP chains | Combine bass/mid/high into one CHOP for instancing |
| **Null CHOP (Selective mode)** | Suppress unnecessary downstream cooking | Use to gate quiet/static channels |
| **Select CHOP** | Extract a named channel from a CHOP | `op('merge1')['bass']` pattern |
| **Shuffle CHOP** | Reorganize channel structure | Method: "Sequence Channels by Name" for multi-channel video data |

### 3d. Referencing Audio Data in Parameters
Two methods — prefer CHOP references over Python for performance:

**Drag-and-drop export (fastest):** Drag a channel from a CHOP viewer onto any parameter → choose "Export CHOP" or "CHOP Reference."

**Expression syntax in parameter field:**
```python
op('null_bass')[0]         # sample 0 of channel 0
op('null_bass')['bass']    # named channel
op('null_audio').chan[0]   # alternative form
```

**In Python scripts (use sparingly, not every frame):**
```python
bass_val = op('null_bass')['bass'][0]
op('geo1').par.ty = bass_val * 2.0
```

---

## 4. GLSL in TouchDesigner

### 4a. GLSL TOP (2D Fragment Shaders)
The primary tool for custom 2D generative visuals.

**Do not include a `#version` directive** — TD injects it automatically (targets GLSL 4.60).
**Always call `TDOutputSwizzle()`** on your output color to handle channel ordering correctly.

**Minimal correct fragment shader:**
```glsl
// Uniforms declared in the GLSL TOP's Vectors/Floats parameter pages
uniform float uTime;
uniform float uBass;

layout(location = 0) out vec4 fragColor;

void main() {
    vec2 uv = vUV.st;                    // vUV is auto-provided (0..1 range)
    // -- your code --
    fragColor = TDOutputSwizzle(vec4(uv, uBass, 1.0));
}
```

**Key auto-provided variables:**
| Variable | Type | Description |
|----------|------|-------------|
| `vUV` | `vec4` | UV coords, use `.st` for 2D (range 0–1) |
| `gl_FragCoord` | `vec4` | Pixel position in screen space |
| `sTD2DInputs[n]` | `sampler2D` | Input TOP textures (0-indexed) |
| `sTDNoiseMap` | `sampler2D` | Built-in 256×256 random noise texture |

**Sampling input textures:**
```glsl
vec4 col = texture(sTD2DInputs[0], vUV.st);
vec4 feedback = texture(sTD2DInputs[1], vUV.st); // if Feedback TOP wired to input 1
```

**Built-in TD noise functions (all return -1 to 1):**
```glsl
float TDPerlinNoise(vec2 v);   // or vec3, vec4
float TDSimplexNoise(vec2 v);  // or vec3, vec4 — prefer for generative work
vec3  TDHSVToRGB(vec3 c);      // HSV → RGB (useful for colorful generative palettes)
vec3  TDRGBToHSV(vec3 c);
```
Use `TDSimplexNoise` with Quality mode enabled in the GLSL TOP parameters for better appearance (no axis-aligned banding), at slight performance cost.

**Passing audio data into GLSL shaders:**
1. Create a Null CHOP at the end of your audio chain
2. Wire it into a **CHOP to TOP** (converts CHOP channels → pixel rows in a texture)
3. Wire that TOP into a GLSL TOP input slot (`sTD2DInputs[0]`)
4. In shader: `float bass = texture(sTD2DInputs[0], vec2(0.0, 0.0)).r;`

Or more simply: declare a uniform float in the GLSL TOP parameters, then use a CHOP reference expression in that parameter field: `op('null_bass')['bass']`

**Porting Shadertoy shaders:** Replace `iTime` → `uTime`, `iResolution` → `uResolution` (declare as `uniform vec2`), `iChannel0` → `sTD2DInputs[0]`, `mainImage(out vec4 o, vec2 f)` → standard `void main()` with `fragColor`.

### 4b. GLSL MAT (3D Vertex + Fragment Shaders)
Used for geometry displacement — critical for audio-reactive 3D.

**Vertex shader boilerplate (position displacement):**
```glsl
// Vertex shader
uniform float uBass;
out vec3 vNorm;
out vec2 vTexCoord;

void main() {
    vNorm = TDNorm(P + N * uBass * 0.5);   // displace along normal
    vTexCoord = uv[0].st;
    gl_Position = TDSOPToProj(vec4(P + N * uBass * 0.5, 1.0));
}
```
Do not manually transform `gl_Position` without using `TDSOPToProj()` — it handles the model/view/projection matrix chain.

### 4c. Feedback Loops (Essential for Generative Visuals)
```
GLSL TOP → Feedback TOP (feed back to GLSL TOP input slot 1) → composite/blend
```
The Feedback TOP captures the previous frame's output. Inside the shader, read `sTD2DInputs[1]` for the previous frame. Apply slight scale (<1.0), blur, or color shift each frame to create trails, flow fields, reaction-diffusion effects.

**Classic feedback pattern:**
```glsl
vec4 prev = texture(sTD2DInputs[1], vUV.st) * 0.97; // decay factor
vec4 curr = /* new content */;
fragColor = TDOutputSwizzle(prev + curr);
```

### 4d. Generative Technique Vocabulary

**FBM (Fractional Brownian Motion):** Layer multiple octaves of noise at increasing frequency/decreasing amplitude. Essential for organic textures.
```glsl
float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        val += amp * TDSimplexNoise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return val;
}
```

**Domain Warping:** Feed FBM output back into itself as UV offset. Creates highly organic, fluid-like distortion. Drive warp strength with bass/mid audio.

**Voronoi / Cellular Noise:** Use distance to nearest feature point. Built via custom GLSL or sample from Noise TOP piped in as texture.

**SDF (Signed Distance Fields):** Define shapes mathematically. `length(uv - center) - radius` for circle, etc. Combine with `smoothstep` for anti-aliasing.

---

## 5. Generative Visual Patterns (Network-Level)

### 5a. Particle Systems
**particlesGPU COMP** (built-in, GPU-accelerated, preferred over legacy Particle SOP):
- Lives under COMP → particlesGPU
- Force channels mapped from CHOPs: wire audio CHOPs to `Force` inputs
- Use **instancing** on a Geometry COMP for high-count, high-performance particles
- Instancing: set instance data in the Geometry COMP's Instance page, feed position/scale/color from CHOP or SOP data

**Audio-reactive instancing pattern:**
```
Noise CHOP (provides per-instance random base)
    + Merge CHOP (add bass/mid channels)
    → Math CHOP (scale)
    → wire into Geometry COMP Instance page (tx, ty, tz, sx, sy)
```

**POPs (Particle Operators, experimental as of 2025):** New system introduced ~2025 builds. More flexible than particlesGPU for complex behaviors. Use if on build 2025.30060+.

### 5b. Point Clouds from Geometry
```
SOP (any geometry source)
    → Convert SOP (to Points)
    → Render to a Camera COMP → Render TOP
```
Displace individual points using a GLSL MAT with vertex shader. Wire audio uniforms to control displacement magnitude.

### 5c. Rutt-Etra Style Displacement
Classic: use a 2D image (or audio-driven Noise TOP) to displace the Z of a grid.
```
Grid SOP
    → GLSL MAT (vertex shader reads texture, offsets Z by luminance × audioScale)
```

### 5d. Feedback-Based Organic Growth
```
GLSL TOP (reaction-diffusion or flow field)
    → Feedback TOP
    → Level TOP (reduce brightness, or use Lookup TOP for colorization)
    → back into GLSL TOP input
```
Drive diffusion rate or flow speed with audio frequency bands.

---

## 6. Project Architecture & Organization

### 6a. Recommended Layer Structure
```
/project1/
    audio_analysis/     ← COMP containing entire CHOP audio chain
        in1 CHOP
        audioanalysis1
        null_bass, null_mid, null_high (Null CHOPs, named)
        out1 CHOP
    control/            ← COMP: all parameter mappings, Math/Lag post-processing
    visuals/            ← COMP: all TOP/SOP/render networks
    output/             ← final composite, Window COMP or NDI Out
```

### 6b. Naming Conventions
- Null CHOPs that are reference points: prefix `null_` (e.g. `null_bass`)
- Final output TOPs before composite: prefix `out_`
- Container COMPs: descriptive snake_case (`audio_analysis`, `particle_system`)
- Avoid default names like `chopexec1`, `math3`

### 6c. Performance Guidelines
- **Python expressions in parameters are fast** when pre-compiled (TD shows "Optimized" on hover). Avoid long Python functions called every frame.
- **Replace Python loops with CHOP networks** — CHOPs run on optimized C++, often 10–100× faster.
- **Avoid scripts running every frame** — use `executeDAT` with specific triggers, or callbacks on CHOP value changes.
- **Pre-cache static operator references** in extensions: `self.bass = op('null_bass')` once, then reuse.
- **Resolution discipline:** work at the lowest resolution viable; upscale at final composite only.
- **Perform Mode** (`F1`) hides the network UI and reduces CPU overhead — always demo in Perform Mode.
- **Viewer discipline:** turn off viewers on high-channel CHOPs (e.g. TOP-to-CHOP, Shuffle CHOP) — just seeing the channels costs meaningful GPU time.

---

## 7. Python in TouchDesigner

### 7a. Core Patterns
```python
# Reference an operator
n = op('null_bass')

# Read a CHOP channel value
val = n['bass']         # named channel, current sample
val = n[0]              # channel index 0, current sample

# Set a parameter
op('geo1').par.ty = val * 2.0
op('null1').par.display = 1

# Access parent/sibling ops (relative paths preferred)
sibling = parent().op('other_null')
child   = op('container1/noise1')

# Common absolute time reference
t = absTime.seconds     # float, seconds since TD started — use for uTime uniform
f = absTime.frame       # current frame number
```

### 7b. Extensions (for Large Projects)
Attach a Python class to a COMP. Centralizes logic, avoids scattered script DATs.
```python
# In an extension DAT on a COMP:
class AudioReactiveExt:
    def __init__(self, ownerComp):
        self.owner = ownerComp
        self.bass  = op('null_bass')
        self.mid   = op('null_mid')

    def update(self):
        b = self.bass['bass']
        self.owner.op('geo1').par.sy = b * 3.0
```
Call `ext.AudioReactiveExt.update()` from a `chopexecDAT` or `executeDAT`.

### 7c. When to Use Python vs CHOPs
| Task | Use |
|------|-----|
| Real-time continuous data scaling/remapping | Math CHOP |
| Smoothing over time | Lag / Filter CHOP |
| Conditional logic on CHOP channels | Logic CHOP |
| Event triggers (beat detected) | CHOP Execute DAT |
| Scene switching, state machines | Python / Extensions |
| OSC/MIDI routing | OSC In CHOP → CHOP exec |
| Complex algorithmic generation (one-time) | Python script |

---

## 8. Audio-to-Visual Mapping Strategies

### 8a. Fundamental Mappings
| Audio feature | Visual parameter | Notes |
|--------------|-----------------|-------|
| Bass (20–200 Hz) amplitude | Scale, camera shake, beat pulse | Sharp attack, slow decay via Lag |
| Mid (200–4k Hz) amplitude | Color saturation, particle speed | Moderate smoothing |
| High (4k–20k Hz) amplitude | Particle count, brightness, sparkle | Fast response OK |
| Kick detection | Sudden offset/flash trigger | Use Logic CHOP threshold |
| Full-spectrum RMS | Global intensity, blur amount | Use Analyze CHOP → RMS |
| Audio spectrum (all bins) | Color gradient mapping, waveform visualization | Use Audio Spectrum TOP |

### 8b. Making Mappings Feel Good
- **Asymmetric lag is king:** sharp attack (lag up = 0), slow decay (lag down = 0.1–0.4). Mimics how humans perceive sound energy.
- **Normalize before mapping:** always Math CHOP to 0–1 before applying. Then scale at the destination parameter. Keeps mappings predictable when audio levels change.
- **Clamp aggressive peaks:** Audio Dynamics CHOP or a Math CHOP clamp prevents visual strobing at loud transients.
- **Layer multiple bands:** don't just use bass. Mid-driven hue rotation + high-driven particle spawn + bass-driven scale = layered reactivity.
- **Use Lag differently per band:** bass gets slow decay, highs get nearly no smoothing for "presence."

### 8c. Live Performance Patterns
```
Audio chain (stable, never touch live)
    → Control COMP (Math/Lag, all tweakable parameters exposed to UI)
    → Scene COMPs (individual scenes as containers, Switch TOP to select)
    → Output COMP (final comp, Window COMP or NDI Out)
```
- Keep a **safe/blank fallback scene** wired into the Switch TOP at index 0
- Use **Cue system** or Animation COMP for timed transitions
- Save multiple `.toe` scene variants; don't modify live patches destructively

---

## 9. Common Gotchas

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| GLSL TOP shows pink/error | Shader compile error | Check textport for GLSL error; check `TDOutputSwizzle()` is called |
| Audio CHOP shows flat line | Wrong device selected, or Audio Device In not "active" | Check parameters → Device dropdown; toggle Active |
| Feedback loop shows black | Feedback TOP not correctly wired back to GLSL TOP input | Wire output of Feedback TOP to an input slot of GLSL TOP |
| Network suddenly slow | A viewer on an expensive CHOP | Turn off all CHOP viewers; use Performance Monitor |
| Parameter expression not updating | Python expression flagged "Un-optimized" | Simplify expression; pre-cache op references |
| Geometry not rendering | Camera and Render TOP not in same network level | Both must be in same COMP; Light COMP too |
| `vUV` undefined in GLSL MAT | vUV is only auto-provided in GLSL TOP, not MAT | Declare custom varyings and pass UV from vertex shader |

---

## 10. Key Resources (Current as of 2025)

- **Official docs:** `docs.derivative.ca` — authoritative for operator parameters
- **Derivative forum:** `forum.derivative.ca` — community fixes; search before answering common issues
- **Interactive & Immersive HQ:** `interactiveimmersive.io` — highest-quality tutorial site
- **AllTouchDesigner:** `alltd.org` — broad tutorial library including GLSL series
- **Rikiya89 GLSL daily practice (GitHub):** production-quality GLSL TOP shader examples including audio-reactive variants
- **Palette Browser (in-app):** `audioAnalysis` component is the canonical starting point for audio work
