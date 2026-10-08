import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Monocular Depth-Locked Visual Acuity',
        short_name: 'Depth VA',
        description:
          'Webcam-based distance estimation and dynamically scaled visual acuity testing (research prototype).',
        theme_color: '#1c6fd8',
        background_color: '#f6f8fb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Do NOT aggressively cache the large MediaPipe model/wasm assets
        // fetched from CDN at runtime; only precache the app shell.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
