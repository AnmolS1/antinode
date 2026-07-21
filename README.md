# Antinode

> It listens, and gives the sound a shape.

![CI](https://github.com/AnmolS1/antinode/actions/workflows/ci.yml/badge.svg)

Antinode is a real-time music visualizer for the browser. It taps live audio —
a file, a shared tab, your mic or a loopback device — analyzes it in an
AudioWorklet, and drives GPU-rendered scenes that react to loudness, spectrum,
onsets, and beat. WebGL2 is the baseline everywhere; WebGPU is used where the
browser supports it.

## Dev quickstart

```sh
npm i
npm run dev          # → http://localhost:5173
```

Other scripts:

```sh
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint (flat config)
npm test             # vitest (jsdom)
npm run build        # tsc --noEmit && vite build
npm run test:e2e     # playwright (browsers required)
```

## Plan of record

See `antinode-plan/` — read `04-handoff.md` first, then `00-overview.md`, then
`01-task-graph.md`.

## Browser support

| Browser            | WebGL2 (baseline) | WebGPU        |
| ------------------ | ----------------- | ------------- |
| Chrome             | ✅                | ✅            |
| Firefox            | ✅                | Where enabled |
| Waterfox (ESR)     | ✅                | Where enabled |
| Safari (macOS/iOS) | ✅                | Where enabled |

WebGL2 is the guaranteed path on every supported browser; WebGPU is used
automatically when available and falls back cleanly when it is not.

**No video export** — ever (Spotify's sync clause); Antinode renders reactively
in real time only.

## License

MIT — see [LICENSE](./LICENSE).
