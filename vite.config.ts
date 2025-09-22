import { defineConfig } from 'vite'
// import path from 'path'
import react from '@vitejs/plugin-react-swc'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  // resolve: {
  //   alias: {
  //     '@': path.resolve(__dirname, 'src')  // @ 指向 src 目录
  //   }
  // }
})