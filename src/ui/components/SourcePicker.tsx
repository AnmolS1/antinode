/**
 * The capture-ladder source picker — the product's front door. Each ladder rung is a
 * card: label, works-with-headphones badge, and per-browser availability from
 * `engine.capabilities()`. Unavailable rungs are shown but disabled, always with the
 * honest `reason` ("Firefox has never shipped tab audio capture…"). Never blame the
 * user; the copy explains what to do instead.
 */
import { useRef } from 'react';

import type { SourceCapability, SourceKind } from '../../contracts/source';

export interface PickOptions {
  file?: File;
}

interface RungMeta {
  kind: SourceKind;
  label: string;
  blurb: string;
  /** Headphone story: 'yes' clean, 'loopback' needs a loopback device, 'no' speakers only. */
  headphones: 'yes' | 'loopback' | 'no';
  rung: number;
}

const RUNGS: RungMeta[] = [
  {
    kind: 'file',
    label: 'Drop a file',
    blurb: 'Perfect signal. Pick any audio file — the heritage mode, kept forever.',
    headphones: 'yes',
    rung: 1,
  },
  {
    kind: 'display',
    label: 'Tab / system audio',
    blurb: 'Bit-clean capture of the tab that is playing. Chromium only.',
    headphones: 'yes',
    rung: 2,
  },
  {
    kind: 'input',
    label: 'Microphone or loopback device',
    blurb: 'A loopback device (BlackHole, VB-Cable) is bit-clean in every browser. Mic works too.',
    headphones: 'loopback',
    rung: 3,
  },
  {
    kind: 'procedural',
    label: 'Metadata mode',
    blurb: 'Progress-locked motion when no audio can be captured. Needs a connected Spotify seat.',
    headphones: 'yes',
    rung: 5,
  },
];

const HEADPHONE_BADGE: Record<RungMeta['headphones'], string> = {
  yes: 'Works with headphones',
  loopback: 'Headphones via loopback device',
  no: 'Speakers only',
};

export function SourcePicker({
  capabilities,
  onPick,
  heading = 'Choose a source',
}: {
  capabilities: SourceCapability[];
  onPick: (kind: SourceKind, opts?: PickOptions) => void;
  heading?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  const capOf = (kind: SourceKind): SourceCapability =>
    capabilities.find((c) => c.kind === kind) ?? { kind, available: false, reason: 'Unavailable.' };

  const handle = (kind: SourceKind): void => {
    if (kind === 'file') {
      fileInput.current?.click();
      return;
    }
    onPick(kind);
  };

  return (
    <section className="picker" aria-label={heading}>
      <h2 className="picker__heading">{heading}</h2>
      <ul className="picker__list" role="list">
        {RUNGS.map((meta) => {
          const cap = capOf(meta.kind);
          const disabled = !cap.available;
          const reasonId = `why-${meta.kind}`;
          return (
            <li key={meta.kind} className="picker__item">
              <button
                type="button"
                className="rung"
                data-kind={meta.kind}
                disabled={disabled}
                aria-disabled={disabled}
                aria-describedby={disabled ? reasonId : undefined}
                onClick={() => handle(meta.kind)}
              >
                <span className="rung__index" aria-hidden="true">
                  {meta.rung}
                </span>
                <span className="rung__body">
                  <span className="rung__label">{meta.label}</span>
                  <span className="rung__blurb">{meta.blurb}</span>
                  <span className="rung__badge" data-hp={meta.headphones}>
                    {HEADPHONE_BADGE[meta.headphones]}
                  </span>
                </span>
              </button>
              {disabled && (
                <p id={reasonId} className="rung__reason" role="note">
                  {cap.reason ?? 'Not available in this browser.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick('file', { file });
          e.target.value = '';
        }}
      />
    </section>
  );
}
