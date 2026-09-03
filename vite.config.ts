import { defineConfig } from 'vite';

/**
 * The base game is served from a domain root, and its runtime textures are
 * requested through absolute `/assets/...` paths that no bundler rewrites. A
 * non-root base would therefore emit hashed bundles under a prefix while the
 * loader kept asking for the root, so the deployment base path is a contract
 * rather than an incidental default. Vite already defaults to `/`; declaring it
 * makes the value reviewable and lets the Step 36 production smoke test assert
 * it against the served bundle.
 */
export default defineConfig({
  base: '/',
});
