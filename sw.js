const CACHE_NAME = 'southwave-system-cache-v1';

// Assets to pre-cache on service worker installation
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/img/logoBlueNT.png',
  '/img/logoBluePrinter.png',
  '/img/logoWithNameBlue.png',
  '/img/logoWhite.png'
];

// Third-party library assets loaded via CDN to cache-first
const STATIC_LIBRARIES = [
  'pocketbase.umd.js',
  'qrcode.min.js',
  'html5-qrcode',
  'chart.js',
  'xlsx.full.min.js',
  'jspdf.umd.min.js',
  'jspdf.plugin.autotable.min.js',
  'font-awesome'
];

// Service Worker Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching core assets');
      
      // We list both system.html and index.html to support local dev testing gracefully
      const targets = ['/system.html', '/index.html', ...PRECACHE_ASSETS];
      
      // Use Promise.allSettled to prevent install failure if a dev file (like system.html) 
      // does not exist yet in the local workspace.
      return Promise.allSettled(
        targets.map((url) => {
          return fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
              throw new Error(`Failed to fetch ${url}: Status ${response.status}`);
            })
            .catch((err) => {
              console.warn(`[Service Worker] Skipping pre-cache for: ${url}`, err.message);
            });
        })
      );
    })
  );
  self.skipWaiting();
});

// Service Worker Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Service Worker Fetch Interceptor
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass caching for non-GET requests, PocketBase collections/files, or general APIs
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('pocketbase') || 
    url.pathname.includes('/api/')
  ) {
    return; // Fall through to standard browser network request
  }

  // 2. Network-First strategy for the system pages (system.html / index.html)
  if (
    url.pathname.endsWith('system.html') || 
    url.pathname.endsWith('index.html') || 
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If successful network response, clone and update cache
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache if network is unavailable
          return caches.match(event.request);
        })
    );
    return;
  }

  // 3. Cache-First strategy for static assets (images, logos, CDN libraries, fonts)
  const isStaticLibrary = STATIC_LIBRARIES.some(lib => url.pathname.includes(lib));
  const isLocalImage = url.pathname.includes('/img/') || url.pathname.endsWith('.ico');

  if (isStaticLibrary || isLocalImage) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Cache miss: fetch from network and store in cache
        return fetch(event.request).then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. Default: Generic Cache with Network Fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
