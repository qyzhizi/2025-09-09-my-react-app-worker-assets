if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => console.log('✅ Service Worker registration successful'))
      .catch((err) => console.error('❌ Service Worker registration failed', err));
  });
}
