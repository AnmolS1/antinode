import type { AudioSourceProvider, SourceKind } from '../../contracts';
import { DisplayCaptureSource } from './DisplayCaptureSource';
import { FileSource } from './FileSource';
import { InputSource } from './InputSource';
import { ProceduralSource } from './ProceduralSource';

export { FileSource } from './FileSource';
export { InputSource, type InputDevice } from './InputSource';
export { DisplayCaptureSource } from './DisplayCaptureSource';
export { ProceduralSource } from './ProceduralSource';

/** Options for {@link createSource}. */
export interface SourceOptions {
  deviceId?: string;
  file?: File;
}

/** Build the {@link AudioSourceProvider} for a ladder kind. */
export function createSource(kind: SourceKind, opts: SourceOptions = {}): AudioSourceProvider {
  switch (kind) {
    case 'file':
      if (!opts.file) throw new Error('File source requires a file.');
      return new FileSource(opts.file);
    case 'input':
      return new InputSource(opts.deviceId);
    case 'display':
      return new DisplayCaptureSource();
    case 'procedural':
      return new ProceduralSource();
    default: {
      const never: never = kind;
      throw new Error(`Unknown source kind: ${String(never)}`);
    }
  }
}
