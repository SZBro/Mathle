import { defineConfig } from 'vite';

// GitHub Pages serves the site from https://szbro.github.io/Mathle/, so every asset
// URL needs the repo name in front. The dev server serves from /Mathle/ too.
export default defineConfig({
  base: '/Mathle/',
});
