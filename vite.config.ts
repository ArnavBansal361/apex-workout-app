import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Anchor project root to this file so `.env` and `index.html` resolve even when
// Vite is started with a different cwd (e.g. nested workspace, tooling wrappers).
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  plugins: [react(), tailwindcss()],
})
