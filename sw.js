self.addEventListener('install', (e) => {
    console.log('Service Worker: Installed');
  });
  
  self.addEventListener('fetch', (e) => {
    // This allows the app to work normally while being installable
    e.respondWith(fetch(e.request));
  });