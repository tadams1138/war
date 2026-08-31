import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// war-ui-default-spec.md §2/§9: static output only, no SSR, no server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
