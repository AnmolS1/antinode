import { afterEach, describe, expect, it, vi } from 'vitest';

import { snapshotCanvas } from '../../src/ui/util';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('snapshotCanvas captures the canvas only (never the UI layer)', () => {
  it('reads pixels from the passed canvas and downloads them', () => {
    // A UI layer that must NOT appear in the snapshot.
    const uiRoot = document.createElement('div');
    uiRoot.id = 'ui-root';
    uiRoot.textContent = 'now playing card + album art';
    document.body.appendChild(uiRoot);

    const canvas = document.createElement('canvas');
    const CANVAS_DATA = 'data:image/png;base64,CANVASPIXELSONLY';
    const toDataURL = vi.fn(() => CANVAS_DATA);
    canvas.toDataURL = toDataURL as unknown as HTMLCanvasElement['toDataURL'];

    const click = vi.fn();
    const holder: { a: HTMLAnchorElement | null } = { a: null };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        const a = el as HTMLAnchorElement;
        a.click = click;
        holder.a = a;
      }
      return el;
    });

    const ok = snapshotCanvas(canvas, 'shot.png');

    expect(ok).toBe(true);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    // The download href is exactly the canvas data — no compositing of UI/art.
    expect(holder.a).not.toBeNull();
    expect(holder.a?.href).toBe(CANVAS_DATA);
    expect(holder.a?.download).toBe('shot.png');
    expect(click).toHaveBeenCalledTimes(1);

    uiRoot.remove();
  });

  it('returns false when there is no canvas to snapshot', () => {
    expect(snapshotCanvas(null)).toBe(false);
  });

  it('returns false when toDataURL is unavailable', () => {
    const canvas = document.createElement('canvas');
    // Simulate an environment where the method is missing.
    (canvas as unknown as { toDataURL: undefined }).toDataURL = undefined;
    expect(snapshotCanvas(canvas)).toBe(false);
  });
});
