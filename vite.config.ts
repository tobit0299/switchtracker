import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages liefert das Projekt unter /switchtracker/ aus, lokal unter /
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/switchtracker/' : '/',
  // MapLibre allein ist ~1 MB groß; das ist für eine Karten-App erwartbar
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SwitchTracker',
        short_name: 'SwitchTracker',
        description: 'Bewerbungen, Unternehmen und Standorte mit Karte und Fahrzeiten verwalten',
        lang: 'de',
        theme_color: '#161616',
        background_color: '#f4f4f4',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
}));
