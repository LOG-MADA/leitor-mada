const CACHE_NAME = 'bipagem-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/idb.js' // Inclua a biblioteca IndexedDB se estiver usando localmente
    // Adicione outros arquivos estáticos se tiver (imagens, etc.)
];

// Instalação: Cacheia os arquivos principais
self.addEventListener('install', event => {
    console.log('[SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Cache aberto, adicionando arquivos principais...');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                 console.log('[SW] Arquivos principais cacheados. Instalação completa.');
                self.skipWaiting(); // Força o SW a ativar imediatamente
            })
            .catch(error => console.error('[SW] Falha ao cachear arquivos na instalação:', error))
    );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
    console.log('[SW] Ativando...');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('[SW] Deletando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
             console.log('[SW] Caches antigos limpos. Ativação completa.');
            return self.clients.claim(); // Controla clientes abertos imediatamente
        })
    );
});

// Fetch: Estratégia Cache First (Tenta cache, depois rede)
self.addEventListener('fetch', event => {
    // Ignora requisições POST ou para extensões do Chrome
     if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    console.log(`[SW] Interceptando fetch para: ${event.request.url}`);
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log(`[SW] Respondendo com cache para: ${event.request.url}`);
                    return response; // Retorna do cache se encontrado
                }
                console.log(`[SW] Cache miss. Buscando na rede para: ${event.request.url}`);
                // Não encontrado no cache, busca na rede
                return fetch(event.request).then(
                    networkResponse => {
                        // Opcional: Cachear a resposta da rede para futuras requisições offline
                        // if(networkResponse && networkResponse.status === 200) {
                        //     const responseToCache = networkResponse.clone();
                        //     caches.open(CACHE_NAME)
                        //         .then(cache => {
                        //             cache.put(event.request, responseToCache);
                        //              console.log(`[SW] Cache atualizado para: ${event.request.url}`);
                        //         });
                        // }
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error(`[SW] Falha no fetch (rede indisponível?): ${event.request.url}`, error);
                    // Você pode retornar uma página offline padrão aqui se quiser
                    // return caches.match('/offline.html');
                });
            })
    );
});