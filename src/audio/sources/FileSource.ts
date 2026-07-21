import type { AudioSourceProvider, SourceKind } from '../../contracts';

/**
 * A dropped/selected audio file, played through a looping, seekable `<audio>`
 * element and tapped via a `MediaElementAudioSourceNode`. The element is ALSO
 * routed to the destination so the user hears the file (this is the one source
 * kind that is meant to be audible). Decode failures reject `start()` with a
 * friendly message rather than throwing an opaque MediaError.
 */
export class FileSource implements AudioSourceProvider {
  readonly kind: SourceKind = 'file';
  readonly label: string;

  private readonly file: File;
  private el: HTMLAudioElement | null = null;
  private node: MediaElementAudioSourceNode | null = null;
  private url: string | null = null;
  private endedCb: (() => void) | null = null;

  constructor(file: File) {
    this.file = file;
    this.label = file.name || 'Audio file';
  }

  start(ctx: AudioContext): Promise<AudioNode> {
    return new Promise<AudioNode>((resolve, reject) => {
      const el = new Audio();
      el.loop = true;
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      this.el = el;
      this.url = URL.createObjectURL(this.file);
      el.src = this.url;

      const onError = (): void => {
        this.cleanup();
        reject(new Error(`Could not decode "${this.label}" — unsupported or corrupt audio.`));
      };
      el.addEventListener('error', onError, { once: true });
      el.addEventListener('ended', () => this.endedCb?.());

      el.addEventListener(
        'canplay',
        () => {
          try {
            const node = ctx.createMediaElementSource(el);
            node.connect(ctx.destination); // audible: the file is meant to be heard.
            this.node = node;
            void el.play().catch(() => {
              /* autoplay may wait for unlock(); resume() will start it */
            });
            resolve(node);
          } catch (err) {
            this.cleanup();
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        },
        { once: true },
      );

      el.load();
    });
  }

  stop(): Promise<void> {
    this.cleanup();
    return Promise.resolve();
  }

  onEnded(cb: () => void): void {
    this.endedCb = cb;
  }

  private cleanup(): void {
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
    }
    try {
      this.node?.disconnect();
    } catch {
      /* already disconnected */
    }
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
    this.node = null;
    this.el = null;
  }
}
