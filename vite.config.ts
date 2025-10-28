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
  build: {
    // 调整警告阈值（比如 1500kb），避免无意义的 warning
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 把第三方依赖拆分成单独的 vendor.js
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          // 你也可以根据需要继续拆分，比如 react 相关单独打包
          if (id.includes('react')) {
            return 'react-vendor'
          }
          // 如果路径里包含 chunmde.bundle.min.js，则单独打包
          if (id.includes('chunmde.bundle.min.js')) {
            return 'chunmde'
          }
        },
      },
    },
  },
})
