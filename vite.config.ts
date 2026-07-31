import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { inferenceHandler } from './api/inference'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    // Serve the secure OpenRouter proxy in dev — browser calls /api/inference,
    // Vite middleware injects the server-side OPENROUTER_API_KEY and forwards upstream.
    // The API key never appears in the browser or compiled frontend assets.
    configureServer(server) {
      server.middlewares.use('/api/inference', (req, res, next) => {
        inferenceHandler(req, res).catch(next)
      })
    },
  },

  preview: {
    host: '0.0.0.0',
    port: 5000,
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Raise the chunk-size warning threshold slightly — framer-motion is large
    // by design and is already split into its own chunk.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        /**
         * Manual chunk strategy:
         *   vendor  — React + Router (rarely changes, aggressively cached)
         *   motion  — Framer Motion (large, split to avoid polluting app cache)
         *   query   — TanStack Query (stable API surface)
         *   icons   — react-icons (large icon set, loaded once)
         *   app     — everything else (changes most often)
         */
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'motion';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'query';
          }
          if (id.includes('node_modules/react-icons')) {
            return 'icons';
          }
        },
      },
    },
  },
})
