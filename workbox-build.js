import { generateSW } from 'workbox-build';

generateSW({
  globDirectory: 'dist/client',
  globPatterns: [
    '**/*.{js,css,html,ico,png,svg,webp,woff2}'
  ],
  swDest: 'dist/client/sw.js',

  clientsClaim: true,
  skipWaiting: true,

  runtimeCaching: [
    // ❌ API：完全不缓存
    // {
    //   urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
    //   handler: 'NetworkOnly'
    // },    
    {
      urlPattern: ({ request }) =>
        ['script', 'style', 'image', 'font'].includes(request.destination),
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30
        }
      }
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 5
        }
      }
    },
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'html-cache',
        networkTimeoutSeconds: 3
      }
    },
    {
      urlPattern: () => true,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'misc-cache'
      }
    }
  ],

  navigateFallback: '/index.html',
  navigateFallbackDenylist: [
    /^\/api\//,
    /^\/auth\//,
    /^\/oauth\//,
  ],
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/]
}).then(({ count, size }) => {
  console.log(`✨ 预缓存成功：${count} 个文件，${size} bytes`);
}).catch((err) => {
  console.error('❌ 预缓存失败：', err);
});