import { defineConfig } from 'vite';

// Relative asset paths, so the built game works from a subfolder like
// bacipperly.github.io/Tiny-Tenants/ as well as from the root of a site.
export default defineConfig({
  base: './',
});
