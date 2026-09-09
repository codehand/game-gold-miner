import { defineConfig } from 'vite';

/**
 * Server-milestone Step 6: bundles `supabase/functions/_shared/coreBundleEntry.ts`
 * — a pure re-export of `src/core`, `src/config`, and the save-document
 * boundary — into one dependency-free ES module a Deno Edge Function can
 * import directly. See that file's header for why a bundle, rather than an
 * unmodified relative import, is what makes this portable.
 *
 * `npm run build:server-core` runs this config; `scripts/verify-server-stack.mjs`
 * runs that script before starting the local stack, so the bundle a function
 * imports is never staler than the source it was built from.
 */
export default defineConfig({
  // Vite's default copies `public/` into every build output. This config has
  // no HTML page to serve those assets to, so without this the ~2.9 MB of
  // game art in `public/assets/` gets copied into `supabase/functions/`, a
  // server-code directory, on every bundle build.
  publicDir: false,
  build: {
    outDir: 'supabase/functions/_shared/generated',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    lib: {
      entry: 'supabase/functions/_shared/coreBundleEntry.ts',
      formats: ['es'],
      fileName: () => 'core-bundle.js',
    },
    // Deno needs one self-contained module: nothing external, including
    // `break_infinity.js`, which is inlined exactly as the client bundle
    // already inlines it.
    rollupOptions: {
      external: [],
    },
  },
});
