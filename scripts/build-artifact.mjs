// Builds the game into one self-contained page for sharing as a claude.ai artifact:
// the built styles and script inlined, nothing loaded from anywhere else.
// Run `npm run build:artifact`; the page lands in dist-artifact/house-builder.html.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
execSync('npm run build', { cwd: root, stdio: 'inherit' });

const assets = join(root, 'dist', 'assets');
const files = readdirSync(assets);
const read = (ending) => readFileSync(join(assets, files.find((file) => file.endsWith(ending))), 'utf8');
const css = read('.css');
const js = read('.js');
if (js.includes('</script')) throw new Error('The script contains </script and cannot be inlined as it is.');

// The page's markup: everything inside <body> in the built page, minus its own script and style tags.
const built = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const body = built.slice(built.indexOf('<body>') + 6, built.indexOf('</body>')).trim();

const page = `<title>Tiny Tenants</title>
<style>
${css}
/* As shared: the page fills the frame it's shown in, on a ground like the lot's. */
html, body { background: #5d7a4a; }
#app { width: 100%; height: 100%; }
/* The Classic | Band switch works by reloading with ?ui=, which a shared page can't do. */
.layout-switch, .houses-heading:has(+ .layout-switch) { display: none !important; }
</style>
${body}
<script>
// Saving goes to this browser's storage. Where the browser refuses it (a private
// window, blocked site data), the game keeps the house in memory instead.
(() => {
  try {
    const probe = '__house_builder_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    const items = new Map();
    const memory = {
      get length() { return items.size; },
      key: (index) => [...items.keys()][index] ?? null,
      getItem: (key) => (items.has(String(key)) ? items.get(String(key)) : null),
      setItem: (key, value) => { items.set(String(key), String(value)); },
      removeItem: (key) => { items.delete(String(key)); },
      clear: () => items.clear(),
    };
    Object.defineProperty(window, 'localStorage', { value: memory, configurable: true });
  }
})();
</script>
<script type="module">
${js}
</script>
`;

const out = join(root, 'dist-artifact');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'house-builder.html'), page);
console.log(`dist-artifact/house-builder.html: ${(page.length / 1024).toFixed(0)} KB`);
