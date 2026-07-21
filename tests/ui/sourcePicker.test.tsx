import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

import { SourcePicker } from '../../src/ui/components/SourcePicker';
import {
  BROWSER_PROFILES,
  capabilitiesFor,
  type BrowserProfile,
} from '../../src/ui/dev/mockEngine';

afterEach(cleanup);

/** Which rungs each profile must show as available (capability gating, per matrix). */
const AVAILABLE: Record<BrowserProfile, Record<string, boolean>> = {
  chrome: { file: true, display: true, input: true, procedural: true },
  firefox: { file: true, display: false, input: true, procedural: true },
  waterfox: { file: true, display: false, input: true, procedural: true },
  safari: { file: true, display: false, input: true, procedural: true },
};

function rung(kind: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(`button[data-kind="${kind}"]`);
  if (!el) throw new Error(`rung ${kind} not found`);
  return el;
}

describe('SourcePicker capability gating (4 canned browser profiles)', () => {
  it('covers all four profiles', () => {
    expect(BROWSER_PROFILES).toHaveLength(4);
  });

  for (const profile of BROWSER_PROFILES) {
    it(`gates rungs correctly on ${profile}`, () => {
      render(<SourcePicker capabilities={capabilitiesFor(profile)} onPick={() => {}} />);
      const expected = AVAILABLE[profile];
      for (const [kind, available] of Object.entries(expected)) {
        const btn = rung(kind);
        expect(btn.disabled).toBe(!available);
      }
      cleanup();
    });
  }

  it('disabled rungs always say why (honest reason text)', () => {
    render(<SourcePicker capabilities={capabilitiesFor('firefox')} onPick={() => {}} />);
    const display = rung('display');
    expect(display.disabled).toBe(true);
    // reason is wired via aria-describedby and rendered as a visible note
    const describedby = display.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const note = document.getElementById(describedby ?? '');
    expect(note?.textContent ?? '').toMatch(/tab audio capture/i);
  });

  it('fires onPick for an available rung', () => {
    const onPick = vi.fn();
    render(<SourcePicker capabilities={capabilitiesFor('chrome')} onPick={onPick} />);
    fireEvent.click(rung('display'));
    expect(onPick).toHaveBeenCalledWith('display');
  });

  it('does not fire onPick for a disabled rung', () => {
    const onPick = vi.fn();
    const { container } = render(
      <SourcePicker capabilities={capabilitiesFor('safari')} onPick={onPick} />,
    );
    fireEvent.click(within(container).getByRole('button', { name: /tab \/ system audio/i }));
    expect(onPick).not.toHaveBeenCalled();
  });
});
