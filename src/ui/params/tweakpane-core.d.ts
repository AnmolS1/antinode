/**
 * Ambient shim for `@tweakpane/core`.
 *
 * Tweakpane 4's published `tweakpane` package re-exports its API types from
 * `@tweakpane/core` (`export { FolderApi, … } from '@tweakpane/core'`) but does
 * NOT declare it as a dependency, so those names resolve to nothing and
 * `Pane`/`FolderApi` appear to lack `addFolder`/`addBinding`/etc. The runtime
 * bundle is self-contained (everything is inlined into `dist/tweakpane.js`); only
 * the *types* are split. Rather than add a second npm dependency, this shim
 * declares the minimal surface T07 actually uses. (`skipLibCheck` suppresses the
 * other names the library's own `.d.ts` re-exports.)
 */
declare module '@tweakpane/core' {
  export class Semver {}

  /** A parameter-change event. */
  export interface TpChangeEvent<T> {
    readonly value: T;
    readonly last: boolean;
  }

  /** A fold (expand/collapse) event. */
  export interface TpFoldEvent {
    readonly expanded: boolean;
  }

  /** Base class for every pane element. */
  export class BladeApi {
    hidden: boolean;
    readonly element: HTMLElement;
    dispose(): void;
  }

  /** An editable/monitor binding to one object property. */
  export class BindingApi<T = unknown> extends BladeApi {
    on(eventName: 'change', handler: (ev: TpChangeEvent<T>) => void): this;
    refresh(): void;
  }

  export class ListInputBindingApi<T = unknown> extends BindingApi<T> {}
  export class SliderInputBindingApi extends BindingApi<number> {}
  export class InputBindingApi<T = unknown> extends BindingApi<T> {}
  export class MonitorBindingApi<T = unknown> extends BindingApi<T> {}

  /** A clickable button. */
  export class ButtonApi extends BladeApi {
    on(eventName: 'click', handler: () => void): this;
    title: string;
  }

  /** A container of bindings/folders/buttons. */
  export class FolderApi extends BladeApi {
    expanded: boolean;
    readonly title: string | undefined;
    readonly children: BladeApi[];
    addBinding<O, K extends keyof O>(
      object: O,
      key: K,
      params?: Record<string, unknown>,
    ): BindingApi<O[K]>;
    addFolder(params: { title: string; expanded?: boolean }): FolderApi;
    addButton(params: { title: string; label?: string }): ButtonApi;
    addBlade(params: Record<string, unknown>): BladeApi;
    remove(api: BladeApi): void;
    on(eventName: 'fold', handler: (ev: TpFoldEvent) => void): this;
  }

  export class TabApi extends BladeApi {}
  export class TabPageApi extends BladeApi {}

  export type BindingParams = Record<string, unknown>;
  export type BaseParams = Record<string, unknown>;
  export type BaseBladeParams = Record<string, unknown>;
  export type FolderParams = { title: string; expanded?: boolean };
  export type ButtonParams = { title: string; label?: string };
  export type NumberInputParams = Record<string, unknown>;
  export type StringInputParams = Record<string, unknown>;
  export type BooleanInputParams = Record<string, unknown>;
  export type ColorInputParams = Record<string, unknown>;
}
