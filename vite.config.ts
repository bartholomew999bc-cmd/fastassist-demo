import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { inferenceHandler } from './api/inference.ts'

/** Vite plugin: mount the OpenRouter proxy at /api/inference in dev mode. */
function inferenceProxyPlugin(): Plugin {
  return {
    name: 'inference-proxy',
    configureServer(server) {
      server.middlewares.use('/api/inference', (req, res, next) => {
        inferenceHandler(req as import('node:http').IncomingMessage, res as import('node:http').ServerResponse)
          .catch(next)
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    inferenceProxyPlugin(),
    react(),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
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
