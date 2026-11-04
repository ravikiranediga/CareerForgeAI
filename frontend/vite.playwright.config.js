import { mergeConfig } from 'vite'
import viteConfig from './vite.config.js'

export default mergeConfig(viteConfig, {
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8017',
      },
    },
  },
})
