/**
 * ParamDock (T13 follow-up).
 *
 * Note what these assert and why: the body element must EXIST in both states and
 * merely carry `--hidden` when collapsed. `<ParamsPane>` staying mounted is the
 * requirement — unmounting it would drop the `PaneApi` behind the `[` / `]` / `R`
 * shortcuts — so "collapsed" must never mean "removed from the DOM".
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ParamDock } from '../../src/ui/components/ParamDock';
import { createMockEngine } from '../../src/ui/dev/mockEngine';

afterEach(cleanup);

const toggle = (): HTMLElement => screen.getByRole('button', { name: /scene controls/i });

describe('ParamDock', () => {
  beforeEach(() => localStorage.clear());

  it('starts collapsed', () => {
    render(<ParamDock engine={createMockEngine('chrome')} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.dock__body')?.className).toContain('--hidden');
  });

  it('expands on click and reports aria-expanded', () => {
    render(<ParamDock engine={createMockEngine('chrome')} />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.dock__body')?.className).not.toContain('--hidden');
  });

  it('keeps the pane body mounted while collapsed', () => {
    // Guards the reason the body is hidden with CSS rather than unmounted.
    render(<ParamDock engine={createMockEngine('chrome')} />);
    expect(document.querySelector('#dock-body')).not.toBeNull();
  });

  it('remembers the expanded state across mounts', () => {
    const { unmount } = render(<ParamDock engine={createMockEngine('chrome')} />);
    fireEvent.click(toggle());
    unmount();
    render(<ParamDock engine={createMockEngine('chrome')} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('points the toggle at the body it controls', () => {
    render(<ParamDock engine={createMockEngine('chrome')} />);
    expect(toggle().getAttribute('aria-controls')).toBe('dock-body');
  });
});
