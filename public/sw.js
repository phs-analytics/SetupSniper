// Service worker mínimo: torna o SetupSniper instalável como app (PWA) no celular e no PC.
// Não guarda dados nem páginas em cache: tudo vem sempre do seu servidor (preços mudam o tempo todo).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* rede normal */ });
