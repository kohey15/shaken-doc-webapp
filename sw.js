// Service Worker: オフラインで動くアプリシェルのキャッシュと、
// Web Share Target(車検証閲覧アプリの「共有」からの直接受信)の受け口。
// バックエンドサーバーが存在しない前提のため、共有されたファイルは
// サーバーに送らずCache Storage APIに一時保存し、ページ読み込み時に取り出す。

const APP_SHELL_CACHE = "app-shell-v2";
const SHARE_CACHE = "shakensho-share-v1";
const SHARED_KEY = "/__shared-shakensho__";

// コード本体(HTML/JS/マニフェスト): 更新のたびにキャッシュ版が古いまま残って
// 修正が反映されないトラブルを防ぐため、fetch時は「まずネットワーク」を試す
// (ネットワークが使えない時だけキャッシュにフォールバックするオフライン対応)。
const NETWORK_FIRST_FILES = [
  "./",
  "./index.html",
  "./settings.html",
  "./manifest.json",
  "./js/procedures.js",
  "./js/shakensho.js",
  "./js/ocr.js",
  "./js/pdfgen.js",
  "./js/pdf_fields.js",
  "./js/app.js",
];

// 大きく・めったに変わらない静的資産(フォント・帳票テンプレート): 毎回
// 再ダウンロードすると重いため、従来通りキャッシュ優先にする。
const CACHE_FIRST_FILES = [
  "./assets/fonts/NotoSansJP-Regular-static.ttf",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./templates/keizoku_kensa_3_normalized.pdf",
  "./templates/iten_touroku_1_normalized.pdf",
  "./templates/ininjo.pdf",
  "./templates/juryozei_nofusho_1.pdf",
];

const APP_SHELL_FILES = [...NETWORK_FIRST_FILES, ...CACHE_FIRST_FILES];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== APP_SHELL_CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    let text = null;
    for (const value of formData.values()) {
      if (value && typeof value.text === "function") {
        text = await value.text();
        if (text) break;
      }
    }
    if (text) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(SHARED_KEY, new Response(text, { headers: { "Content-Type": "application/json" } }));
      return Response.redirect("./?shared=1", 303);
    }
    return Response.redirect("./?share_failed=1", 303);
  } catch (e) {
    return Response.redirect("./?share_failed=1", 303);
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith(handleShareTarget(event));
    return;
  }

  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return; // 対象外はService Workerを介さず通常通り処理させる
  }

  const isNetworkFirst = NETWORK_FIRST_FILES.some((f) => new URL(f, self.location).href === url.href);

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
