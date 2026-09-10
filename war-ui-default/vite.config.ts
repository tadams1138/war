import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// the spec: static output only, no SSR, no server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
