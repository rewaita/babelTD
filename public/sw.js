/**
 * サービスワーカー: 一度開いたら、オフラインでも遊べるようにする
 *
 *   ページ本体（HTML）… まずネットから取得（更新をすぐ反映）。つながらなければ保存しておいたものを使う
 *   それ以外（JS・画像など）… 保存しておいたものを使う。なければネットから取って保存する
 *     （ビルドしたJSはファイル名に内容のハッシュが付くので、更新されると別ファイルになる）
 *
 * 中身を大きく変えて古い保存を捨てたいときは CACHE の名前を変える。
 */
const CACHE = 'babeltd-v1';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
