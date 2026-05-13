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
    // ✅ OAuth / 登录完全绕过 SW
    {
      urlPattern: ({ url }) =>
        url.pathname.startsWith('/auth/') ||
        url.pathname.startsWith('/oauth/') ||
        url.pathname.startsWith('/login'),
  
      handler: 'NetworkOnly'
    },
  
    // ✅ API 不缓存（推荐）
    {
      urlPattern: ({ url }) =>
        url.pathname.startsWith('/api'),
  
      handler: 'NetworkOnly'
    },
  
    // 静态资源缓存
    {
      urlPattern: ({ request }) =>
        ['script', 'style', 'image', 'font'].includes(
          request.destination
        ),
  
      handler: 'CacheFirst',
  
      options: {
        cacheName: 'static-assets-cache',
  
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30
        }
      }
    },
  
    // 普通页面导航
    {
      urlPattern: ({ request, url }) => {
        if (request.mode !== 'navigate') return false;
  
        // ❌ 不处理登录相关
        if (
          url.pathname.startsWith('/auth/') ||
          url.pathname.startsWith('/oauth/') ||
          url.pathname.startsWith('/login')
        ) {
          return false;
        }
  
        return true;
      },
  
      handler: 'NetworkFirst',
  
      options: {
        cacheName: 'html-cache',
        networkTimeoutSeconds: 3
      }
    },
  
    // 其它资源
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