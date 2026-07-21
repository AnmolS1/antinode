/**
 * Small framework-free helpers for the shell: safe localStorage, loopback-device
 * detection, OS guess (for the loopback guide), and the canvas PNG snapshot.
 */
import type { SourceKind } from '../contracts/source';

const STORAGE_KEY = 'antinode:source';

/** What we remember between sessions (localStorage `antinode:source`). */
export interface RememberedSource {
  kind: SourceKind;
  deviceId?: string;
}

export function loadRememberedSource(): RememberedSource | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj['kind'] !== 'string') return null;
    const remembered: RememberedSource = { kind: obj['kind'] as SourceKind };
    if (typeof obj['deviceId'] === 'string') remembered.deviceId = obj['deviceId'];
    return remembered;
  } catch {
    return null;
  }
}

export function saveRememberedSource(source: RememberedSource): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(source));
  } catch {
    /* private mode / storage disabled — remembering is best-effort. */
  }
}

const LOOPBACK_PATTERNS = [/blackhole/i, /vb-?cable/i, /vb-audio/i, /\bcable\b/i, /monitor/i, /loopback/i, /soundflower/i];

/** Name-match heuristic: is this enumerated device a system-audio loopback? */
export function isLoopbackDevice(label: string): boolean {
  return LOOPBACK_PATTERNS.some((re) => re.test(label));
}

export type OS = 'macos' | 'windows' | 'linux' | 'unknown';

/** Best-effort OS guess for tailoring the loopback setup guide. */
export function guessOS(ua: string = globalThis.navigator?.userAgent ?? ''): OS {
  if (/mac os x|macintosh/i.test(ua)) return 'macos';
  if (/windows/i.test(ua)) return 'windows';
  if (/linux|x11/i.test(ua)) return 'linux';
  return 'unknown';
}

/**
 * Snapshot the render canvas ONLY to a PNG download — never the now-playing card,
 * album art, or any chrome (02-design / Spotify compliance). Because the chrome
 * lives in a separate `#ui-root` DOM subtree, reading `#stage` alone guarantees the
 * UI layer is excluded. Returns false if there is nothing to snapshot.
 */
export function snapshotCanvas(
  canvas: HTMLCanvasElement | null = document.querySelector<HTMLCanvasElement>('#stage'),
  filename = `antinode-${Date.now()}.png`,
): boolean {
  if (!canvas || typeof canvas.toDataURL !== 'function') return false;
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    return false;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  return true;
}

/** mm:ss for track progress/duration (mono-rendered). */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
