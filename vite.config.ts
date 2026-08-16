/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// GitHub Pages serves this project from https://carltherock.github.io/CTR-HUNTING/,
// a subpath — production assets must be built with that base, but the local
// dev server (and preview) still runs at the domain root.
const base = process.env.GITHUB_PAGES === 'true' ? '/CTR-HUNTING/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // MapLibre GL JS ships its own web worker loaded via a dynamic import
    // Vite's esbuild-based dep optimizer can't pre-bundle correctly (it
    // fails to resolve `maplibre-gl-worker.mjs` from the optimized deps
    // cache in dev mode). Excluding it makes Vite serve the package as-is,
    // which resolves the worker correctly. Production builds (Rollup) are
    // unaffected — this only changes dev-server behavior.
    exclude: ['maplibre-gl'],
  },
  plugins: [
    react(),
    tailwindcss(),
    // MapLibre's worker (maplibre-gl-worker.mjs) imports a sibling chunk
    // (maplibre-gl-shared.mjs) via a relative path. Vite's `?url` asset
    // import copies a referenced file but doesn't follow *its* internal
    // imports, so that sibling 404s unless copied alongside it with its
    // original name intact — which is what this does, in both dev and
    // build. See `setWorkerUrl` call in MapTilerProvider.ts.
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
          dest: 'maplibre',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs',
          dest: 'maplibre',
          rename: { stripBase: true },
        },
      ],
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'CTR Hunting — Field Terrain Intelligence',
        short_name: 'CTR Hunting',
        description:
          'Offline-first terrain mapping, navigation and field intelligence platform.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Phase 0: cache the app shell only. Map tile / large asset caching
        // strategies are introduced in Phase 3 (Offline architecture).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
