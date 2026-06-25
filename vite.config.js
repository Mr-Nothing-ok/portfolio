import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // Don't watch video files in public — they're huge and cause EBUSY errors
      ignored: ['**/public/*.mp4', '**/public/*.webm', '**/public/*.mov'],
    },
  },
  base: './',
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
