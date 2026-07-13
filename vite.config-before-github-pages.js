import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/hesabdar-v09/',

  plugins: [
    react(),

    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      includeAssets: [
        'pwa-192.png',
        'pwa-512.png'
      ],

      manifest: {
        name: 'حسابدار',
        short_name: 'حسابدار',
        description: 'مدیریت نسیه، پرداخت و حساب مشتریان فروشگاه',
        lang: 'fa',
        dir: 'rtl',

        start_url: '/hesabdar-v09/',
        scope: '/hesabdar-v09/',

        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#2563eb',

        icons: [
          {
            src: '/hesabdar-v09/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/hesabdar-v09/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/hesabdar-v09/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/hesabdar-v09/index.html',
        globPatterns: [
          '**/*.{js,css,html,png,svg,ico,webmanifest}'
        ]
      }
    })
  ]
})
