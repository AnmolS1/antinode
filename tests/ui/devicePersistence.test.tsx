import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { App } from '../../src/ui/App';
import { createMockEngine } from '../../src/ui/dev/mockEngine';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Open the input-source device picker from the landing. */
async function openDevicePicker(engine: ReturnType<typeof createMockEngine>) {
  render(<App engine={engine} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /microphone or loopback/i }));
  });
}

describe('Device picker remembers the last choice (localStorage antinode:source)', () => {
  it('persists the confirmed device and preselects it on the next visit', async () => {
    const engine = createMockEngine('firefox');
    await openDevicePicker(engine);

    // Choose the loopback device and confirm.
    fireEvent.click(screen.getByLabelText(/BlackHole 2ch/i));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use this device/i }));
    });

    expect(engine.lastSource()).toEqual({ kind: 'input', deviceId: 'blackhole-2ch' });
    expect(localStorage.getItem('antinode:source')).toContain('blackhole-2ch');

    cleanup();

    // A fresh App run should preselect the remembered device.
    const engine2 = createMockEngine('firefox');
    await openDevicePicker(engine2);
    const blackhole = screen.getByLabelText(/BlackHole 2ch/i) as HTMLInputElement;
    expect(blackhole.checked).toBe(true);
  });
});
