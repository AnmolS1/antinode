/**
 * First-run / landing: one screen — name + standing-wave glyph + one sentence, with the
 * source picker as the hero CTA and a quiet per-browser capability note. The muted idle
 * canvas plays behind this (the app is its own demo; no screenshots).
 */
import type { SourceCapability, SourceKind } from '../../contracts/source';
import { Footer } from './Footer';
import { Glyph } from './Glyph';
import { SourcePicker, type PickOptions } from './SourcePicker';

function capabilityNote(capabilities: SourceCapability[]): string {
  const canTab = capabilities.find((c) => c.kind === 'display')?.available === true;
  return canTab
    ? 'This browser can capture tab audio directly — one click and you are in.'
    : 'On headphones, route sound in with a loopback device or just drop a file — guided setup is built in.';
}

export function Landing({
  capabilities,
  onPick,
}: {
  capabilities: SourceCapability[];
  onPick: (kind: SourceKind, opts?: PickOptions) => void;
}) {
  return (
    <main className="hero">
      <div className="hero__mark">
        <Glyph size={96} excited title="Antinode standing-wave mark" />
      </div>
      <h1 className="hero__wordmark">Antinode</h1>
      <p className="hero__tagline">It listens, and gives the sound a shape.</p>
      <SourcePicker capabilities={capabilities} onPick={onPick} heading="Pick a source to begin" />
      <p className="hero__note mono">{capabilityNote(capabilities)}</p>
      <Footer />
    </main>
  );
}
