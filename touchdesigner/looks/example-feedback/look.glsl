// example-feedback — TD GLSL TOP body
// GLSL TOP inputs: sTD2DInputs[0] = null_spectrum_top (64-bin spectrum row)
//                  sTD2DInputs[1] = feedback1 (Feedback TOP, previous frame)
// Uniforms (CHOP-referenced from null_features — see ../../BUILD.md §4):
//   uLoud      = op('null_features')['loudNorm']   -> FrameFeatures.loudNorm
//   uHigh      = op('null_features')['high']        -> FrameFeatures.bands.high
//   uBeatPhase = op('null_features')['beatPhase']   -> FrameFeatures.beat.phase
//   uTime      = absTime.seconds                    -> FrameFeatures.t (audio-clock after port)
//
// No #version directive; TDOutputSwizzle on output (SKILL.md §4a).

uniform float uLoud, uHigh, uBeatPhase, uTime;
layout(location = 0) out vec4 fragColor;

void main() {
    vec2 uv    = vUV.st;
    // previous frame, slightly zoomed in and decayed -> trails
    vec4 prev  = texture(sTD2DInputs[1], (uv - 0.5) * 0.995 + 0.5) * 0.94;
    // spectrum row (64 bins across x)
    float spec = texture(sTD2DInputs[0], vec2(uv.x, 0.0)).r;
    // an expanding ring whose radius rides normalized loudness
    float ring = smoothstep(0.02, 0.0, abs(length(uv - 0.5) - uLoud * 0.4));
    // hue drifts with beat phase + slow time; high band adds spectral detail
    vec3  col  = TDHSVToRGB(vec3(fract(uBeatPhase + uTime * 0.05), 0.8, 1.0)) * ring;
    col += spec * uHigh;
    fragColor = TDOutputSwizzle(vec4(col, 1.0) + prev);
}
