/**
 * Inter-task API. Everyone reads; only T01 writes. Changing these requires
 * stopping a wave (see 01-task-graph).
 *
 * These are the type-only contracts that let the audio engine (T02), render
 * core (T03), scenes (T06/T09), Spotify poller (T08), and UI (T04/T07) be built
 * in parallel against a shared, stable surface.
 */
export type * from './features';
export type * from './source';
export type * from './scene';
export type * from './spotify';
export type * from './engine';
