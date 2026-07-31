import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const isNetlify = process.env.NETLIFY === 'true'

export default defineConfig({
  plugins: [
    react(),
    // Only use singlefile for offline single HTML file builds, not for Netlify
    // Netlify sets NETLIFY=true, so we skip singlefile there for reliable builds
    ...(isNetlify ? [] : [viteSingleFile()]),
  ],
  server: { host: true, port: 5173 },
  build: {
    // On Netlify, don't inline huge images (default 4kb) - prevents OOM
    // Locally, inline everything (100MB) for true single-file offline use
    assetsInlineLimit: isNetlify ? 4096 : 100000000,
    cssCodeSplit: false,
    // Reduce chunk size warnings, increase memory efficiency
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // On Netlify, manual chunks for better caching and less memory
        manualChunks: isNetlify ? {
          leaflet: ['leaflet'],
          jspdf: ['jspdf'],
          html2canvas: ['html2canvas'],
          stripe: ['@stripe/stripe-js'],
        } : undefined,
      },
    },
  },
})
