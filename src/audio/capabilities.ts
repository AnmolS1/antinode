import type { SourceCapability, SourceKind } from '../contracts';

/**
 * Feature probe of the current environment. Split out from
 * {@link detectCapabilities} so tests can drive every browser combination
 * without a real navigator.
 */
export interface CapabilityProbe {
  /** Page served over a secure context (required for capture APIs). */
  secureContext: boolean;
  /** `navigator.mediaDevices.getUserMedia` present. */
  getUserMedia: boolean;
  /** `navigator.mediaDevices.getDisplayMedia` present. */
  getDisplayMedia: boolean;
  /** Engine is Chromium-family (the only family that ships getDisplayMedia audio). */
  chromium: boolean;
}

interface UaBrand {
  brand: string;
  version: string;
}
interface UaData {
  brands?: UaBrand[];
}

/** Read a {@link CapabilityProbe} from live globals (safe when absent). */
export function probeEnvironment(): CapabilityProbe {
  const nav: Navigator | undefined =
    typeof navigator !== 'undefined' ? navigator : undefined;
  const md = nav?.mediaDevices as MediaDevices | undefined;
  const secure = typeof isSecureContext !== 'undefined' ? isSecureContext : false;

  let chromium = false;
  if (nav) {
    const uaData = (nav as Navigator & { userAgentData?: UaData }).userAgentData;
    if (uaData?.brands && uaData.brands.length > 0) {
      chromium = uaData.brands.some((b) =>
        /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand),
      );
    } else {
      const ua = nav.userAgent ?? '';
      chromium = /Chrome|Chromium|Edg\//.test(ua) && !/Firefox|FxiOS/.test(ua);
    }
  }

  return {
    secureContext: secure,
    getUserMedia: typeof md?.getUserMedia === 'function',
    getDisplayMedia: typeof md?.getDisplayMedia === 'function',
    chromium,
  };
}

function cap(kind: SourceKind, available: boolean, reason?: string): SourceCapability {
  return reason === undefined ? { kind, available } : { kind, available, reason };
}

/**
 * The capture ladder with per-browser honesty. Order matches the plan's ladder:
 * file → display (tab/system) → input (mic/loopback) → procedural.
 */
export function detectCapabilities(
  probe: CapabilityProbe = probeEnvironment(),
): SourceCapability[] {
  const out: SourceCapability[] = [];

  // 1. File — universal; no permissions, no secure-context requirement.
  out.push(cap('file', true));

  // 2. Tab / system audio via getDisplayMedia — Chromium-only for audio.
  if (!probe.secureContext) {
    out.push(cap('display', false, 'Tab/system audio capture needs a secure (https) context.'));
  } else if (!probe.getDisplayMedia) {
    out.push(cap('display', false, 'This browser does not support display capture.'));
  } else if (!probe.chromium) {
    out.push(
      cap(
        'display',
        false,
        'Tab/system audio capture is Chromium-only — Firefox and Safari have never shipped audio in getDisplayMedia. Use a loopback device instead.',
      ),
    );
  } else {
    out.push(cap('display', true));
  }

  // 3. Input — mic OR a loopback device (BlackHole / VB-Cable) via the mic picker.
  if (!probe.secureContext) {
    out.push(cap('input', false, 'Microphone/loopback capture needs a secure (https) context.'));
  } else if (!probe.getUserMedia) {
    out.push(cap('input', false, 'This browser does not support audio input capture.'));
  } else {
    out.push(cap('input', true));
  }

  // 4. Procedural — always available (Spotify-metadata floor mode).
  out.push(cap('procedural', true));

  return out;
}
