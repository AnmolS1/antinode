import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { App } from '../../src/ui/App';
import { SteeringFlow } from '../../src/ui/components/SteeringFlow';
import { capabilitiesFor, createMockEngine } from '../../src/ui/dev/mockEngine';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SteeringFlow per-profile branch', () => {
  it('offers one-click tab capture only when display is available (Chromium)', () => {
    render(
      <SteeringFlow
        capabilities={capabilitiesFor('chrome')}
        onTabCapture={() => {}}
        onLoopbackDevice={() => {}}
        onFile={() => {}}
        onDismiss={() => {}}
        os="macos"
      />,
    );
    expect(screen.getByRole('button', { name: /switch to tab capture/i })).toBeTruthy();
    expect(screen.queryByText(/loopback setup/i)).toBeNull();
  });

  it('shows the guided loopback setup when tab capture is unavailable (Firefox)', () => {
    render(
      <SteeringFlow
        capabilities={capabilitiesFor('firefox')}
        onTabCapture={() => {}}
        onLoopbackDevice={() => {}}
        onFile={() => {}}
        onDismiss={() => {}}
        os="macos"
      />,
    );
    expect(screen.queryByRole('button', { name: /switch to tab capture/i })).toBeNull();
    expect(screen.getByText(/loopback setup/i)).toBeTruthy();
    expect(screen.getAllByText(/BlackHole/i).length).toBeGreaterThan(0);
  });

  it('tailors the loopback recipe to the OS (Windows -> VB-Cable)', () => {
    render(
      <SteeringFlow
        capabilities={capabilitiesFor('waterfox')}
        onTabCapture={() => {}}
        onLoopbackDevice={() => {}}
        onFile={() => {}}
        onDismiss={() => {}}
        os="windows"
      />,
    );
    expect(screen.getAllByText(/VB-Cable/i).length).toBeGreaterThan(0);
  });
});

describe('Steering appears when the source is active but silent', () => {
  it('routes to the steering flow after sustained silence', async () => {
    vi.useFakeTimers();
    const engine = createMockEngine('firefox');
    render(<App engine={engine} />);

    // Pick an always-available source to reach the signal-check screen.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /metadata mode/i }));
    });
    expect(screen.getByText(/listening for signal/i)).toBeTruthy();

    // No signal emitted; advance past the 3s silence window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });

    const dialog = screen.getByRole('dialog', { name: /hearing nothing/i });
    expect(dialog).toBeTruthy();
    // Firefox profile => loopback guide, never tab-capture.
    expect(screen.queryByRole('button', { name: /switch to tab capture/i })).toBeNull();
  });
});
