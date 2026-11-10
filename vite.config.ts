import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Rutas relativas: la web funciona en cualquier subcarpeta (GitHub Pages incluido).
  base: './',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
})
