if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('✅ Service Worker 注册成功'))
      .catch((err) => console.error('❌ Service Worker 注册失败', err));
  });
}
