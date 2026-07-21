/**
 * Steering flow — the headphones answer, treated as first-class. Shown when a source
 * is active but silent. Chromium gets a one-click switch to tab capture; every other
 * browser gets a guided loopback setup (BlackHole / VB-Cable / PipeWire monitor) as
 * illustrated 3-step cards, plus a "drop a file instead" escape hatch. Never blames the
 * user; one sentence explains *why* browsers limit tab audio.
 */
import type { SourceCapability } from '../../contracts/source';
import type { OS } from '../util';
import { guessOS } from '../util';

interface Recipe {
  device: string;
  os: OS;
  osLabel: string;
  link: { href: string; text: string };
  steps: string[];
}

const RECIPES: Record<Exclude<OS, 'unknown'>, Recipe> = {
  macos: {
    device: 'BlackHole',
    os: 'macos',
    osLabel: 'macOS',
    link: { href: 'https://existential.audio/blackhole/', text: 'Get BlackHole' },
    steps: [
      'Install BlackHole (2ch).',
      'In Audio MIDI Setup, create a Multi-Output Device combining BlackHole + your headphones — so you still hear the music.',
      'Set that Multi-Output as output, then pick “BlackHole 2ch” in the device list.',
    ],
  },
  windows: {
    device: 'VB-Cable',
    os: 'windows',
    osLabel: 'Windows',
    link: { href: 'https://vb-audio.com/Cable/', text: 'Get VB-Cable' },
    steps: [
      'Install VB-Audio Virtual Cable.',
      'Set “CABLE Input” as the playback device, and enable “Listen to this device” so it still reaches your headphones.',
      'Pick “CABLE Output” in the device list.',
    ],
  },
  linux: {
    device: 'PipeWire monitor',
    os: 'linux',
    osLabel: 'Linux',
    link: { href: 'https://docs.pipewire.org/', text: 'PipeWire docs' },
    steps: [
      'PipeWire is running by default on most modern distros.',
      'Find your output’s monitor, e.g. “Monitor of Built-in Audio Analog Stereo”.',
      'Pick that Monitor source in the device list — audio keeps playing normally.',
    ],
  },
};

function LoopbackGuide({ os }: { os: OS }) {
  const recipe = RECIPES[os === 'unknown' ? 'macos' : os];
  return (
    <div className="loopback">
      <h4 className="loopback__title">
        Loopback setup — <span className="loopback__os">{recipe.osLabel}</span> ({recipe.device})
      </h4>
      <ol className="loopback__steps">
        {recipe.steps.map((step, i) => (
          <li key={step} className="loopback__step">
            <span className="loopback__node" aria-hidden="true">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <a className="link" href={recipe.link.href} target="_blank" rel="noreferrer noopener">
        {recipe.link.text} ↗
      </a>
    </div>
  );
}

export function SteeringFlow({
  capabilities,
  onTabCapture,
  onLoopbackDevice,
  onFile,
  onDismiss,
  os = guessOS(),
}: {
  capabilities: SourceCapability[];
  onTabCapture: () => void;
  onLoopbackDevice: () => void;
  onFile: () => void;
  onDismiss: () => void;
  os?: OS;
}) {
  const canTabCapture = capabilities.find((c) => c.kind === 'display')?.available === true;

  return (
    <div
      className="steering panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="steering-title"
    >
      <h2 id="steering-title" className="panel__title">
        Hearing nothing?
      </h2>
      <p className="panel__hint">
        That is expected on headphones — browsers only let a page capture your microphone,
        not the audio playing on your system. Here is how to route the sound in.
      </p>

      {canTabCapture ? (
        <div className="steering__primary">
          <p>The quickest fix in this browser: capture the tab that is playing.</p>
          <button type="button" className="btn btn--primary" data-action="tab-capture" onClick={onTabCapture}>
            Switch to tab capture
          </button>
        </div>
      ) : (
        <LoopbackGuide os={os} />
      )}

      <div className="steering__secondary">
        <button type="button" className="btn btn--ghost" onClick={onLoopbackDevice}>
          Pick a loopback device
        </button>
        <button type="button" className="btn btn--ghost" onClick={onFile}>
          Drop a file instead
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
