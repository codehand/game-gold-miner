/**
 * Server-milestone Step 6.
 *
 * The only file in this repository whose job is naming what a Deno Edge
 * Function needs from the client's pure layers: `src/core`, `src/config`, and
 * the save-document boundary (`src/persistence/saveSchema.ts` — deliberately
 * not the `src/persistence` barrel, which also pulls in `DexieActiveSaveRepository`
 * and other browser-only IndexedDB code that cannot run in Deno).
 *
 * It contains no logic of its own, only re-exports, so it cannot fork the
 * behavior it names: a change to any re-exported symbol's source is a change
 * to what this file exports too, by construction rather than by discipline.
 *
 * `npm run build:server-core` bundles this entry with Vite's library mode into
 * `supabase/functions/_shared/generated/core-bundle.js` — one dependency-free
 * ES module, including `break_infinity.js` inlined by the same bundler
 * resolution the client build already uses. That sidesteps two real
 * constraints of Deno's edge runtime, proven empirically while implementing
 * this step rather than assumed: its module graph resolver does not add a
 * `.ts` extension to an extension-less relative specifier the way `tsc`'s
 * `"moduleResolution": "bundler"` does — so `src/core/index.ts`'s own internal
 * imports (e.g. `from './economy/calculateProductionRates'`) fail to resolve
 * unmodified inside Deno — and a bundle has no such internal specifier left to
 * resolve, because everything is already inlined into one file. The generated
 * bundle is a build artifact, not a maintained copy: it is git-ignored and
 * regenerated from this file and the sources it names, so it cannot drift the
 * way a hand-copied port of `src/core` would.
 */
export * from '../../../src/core';
export * from '../../../src/config';
export * from '../../../src/persistence/saveSchema';
