import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { cloudflare } from "@cloudflare/vite-plugin"
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    tsconfigPaths({
      projects: [
        './tsconfig.worker.json',
        './tsconfig.app.json',
      ],
    }),
  ],
})
