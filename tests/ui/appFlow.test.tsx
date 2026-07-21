import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { App } from '../../src/ui/App';
import { createMockEngine, signalFrame } from '../../src/ui/dev/mockEngine';

afterEach(cleanup);

describe('First-run flow: pick a file source -> signal check -> visualizer', () => {
  it('walks from the landing picker to the live chrome', async () => {
    const engine = createMockEngine('chrome');
    const { container } = render(<App engine={engine} />);

    // Landing hero shows the picker as the front door.
    expect(screen.getByRole('heading', { name: 'Antinode' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /drop a file/i })).toBeTruthy();

    // Choose a file via the picker's hidden input (the WAV fixture path).
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File(['RIFFmock'], 'song.wav', { type: 'audio/wav' });
    await act(async () => {
      fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });
    });

    // Signal-check screen appears.
    expect(screen.getByText(/listening for signal/i)).toBeTruthy();
    expect(engine.lastSource()?.kind).toBe('file');

    // Real signal arrives -> fade into the visualizer chrome.
    act(() => {
      engine.emit(signalFrame(1));
    });
    expect(screen.getByRole('group', { name: 'Scene' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /fullscreen/i })).toBeTruthy();
  });

  it('surfaces a permission-denied error toast without leaving onboarding', async () => {
    const engine = createMockEngine('chrome', { rejectSelect: true });
    render(<App engine={engine} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /metadata mode/i }));
    });
    // Stays on the picker and shows an honest error.
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: /drop a file/i })).toBeTruthy();
  });
});
