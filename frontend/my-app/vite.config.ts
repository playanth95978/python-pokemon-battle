import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Le POC 3D est une seconde page, indépendante de l'application React.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        world3d: resolve(import.meta.dirname, 'world3d.html'),
        openWorld: resolve(import.meta.dirname, 'open-world.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
