import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { App } from '../../src/ui/App';
import { createMockEngine, signalFrame } from '../../src/ui/dev/mockEngine';

afterEach(cleanup);

/** Drive App to the live visualizer phase (pick source -> signal locks). */
async function toLive(engine: ReturnType<typeof createMockEngine>) {
  render(<App engine={engine} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /metadata mode/i }));
  });
  act(() => {
    engine.emit(signalFrame(1));
  });
}

describe('Keyboard map fires actions (live chrome)', () => {
  it('? opens the shortcut overlay and Escape closes it', async () => {
    const engine = createMockEngine('chrome');
    await toLive(engine);
    expect(screen.getByRole('group', { name: 'Scene' })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(document.body, { key: '?' });
    });
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeTruthy();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: /keyboard shortcuts/i })).toBeNull();
  });

  it('number keys select the matching scene via the engine', async () => {
    const engine = createMockEngine('chrome');
    const setScene = vi.spyOn(engine, 'setScene');
    await toLive(engine);

    act(() => {
      fireEvent.keyDown(document.body, { key: '2' });
    });
    expect(setScene).toHaveBeenCalledWith('heritage');
    expect(engine.activeScene()).toBe('heritage');
  });

  it('Space toggles the UI pin', async () => {
    const engine = createMockEngine('chrome');
    await toLive(engine);

    expect(screen.getByRole('button', { name: /pin ui/i })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document.body, { key: ' ' });
    });
    expect(screen.getByRole('button', { name: /unpin ui/i })).toBeTruthy();
  });

  it('does not bind shortcuts before reaching the live phase', () => {
    const engine = createMockEngine('chrome');
    const setScene = vi.spyOn(engine, 'setScene');
    render(<App engine={engine} />);
    act(() => {
      fireEvent.keyDown(document.body, { key: '2' });
    });
    expect(setScene).not.toHaveBeenCalled();
  });
});
