import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset URLs so one build works everywhere it is served from: the
  // macOS app (notemaxx://app/), a domain root, and a GitHub Pages subpath
  // (/NoteMaxx/). NoteMaxx has no client-side routing, so there are no deep
  // URLs that would need an absolute base.
  base: './',
  plugins: [react()],
  server: { port: 5190, strictPort: true },
});
