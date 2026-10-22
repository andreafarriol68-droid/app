// Service worker: guarda la app en el móvil para que se abra sin conexión.
// Los cambios en datos.js y en las fotos se ven solos. Si añades una foto con
// un nombre nuevo, ponla en ARCHIVOS y sube el número de VERSION.

const VERSION = "v3";
const CACHE = `misegueta-${VERSION}`;

const ARCHIVOS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "datos.js",
  "supa.js",
  "cuenta.html",
  "cuenta.js",
  "privacidad.html",
  "privacidad.js",
  "fuentes/marcellus.woff2",
  "fuentes/nunito-sans.woff2",
  "fuentes/dm-mono-400.woff2",
  "fuentes/dm-mono-500.woff2",
  "manifest.json",
  "icono.svg",
  "icono-192.png",
  "icono-512.png",
  "fotos/iniciacion.jpg",
  "fotos/profesional.jpg",
  "fotos/anillo-plata.jpg",
  "fotos/alianzas.jpg",
  "fotos/aros.jpg",
  "fotos/boto.jpg",
  "fotos/cera.jpg",
  "fotos/engaste.jpg",
  "fotos/esmalte.jpg",
  "fotos/martillado.jpg",
];

self.addEventListener("install", (e) => {
  // allSettled: si falta una foto, el resto se guarda igual
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ARCHIVOS.map((a) => c.add(a)))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith("misegueta-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // las reservas (Formspree) van siempre por internet
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // solo se guardan archivos de esta web

  // Fotos y fuentes: se enseña lo guardado al momento y se actualiza por detrás
  // (si cambias una foto por otra con el mismo nombre, se ve la nueva la siguiente vez)
  if (req.destination === "image" || req.destination === "font") {
    e.respondWith(
      caches.match(req).then((guardada) => {
        const nueva = fetch(req).then((resp) => guardar(req, resp));
        if (guardada) { e.waitUntil(nueva.catch(() => {})); return guardada; }
        return nueva;
      })
    );
    return;
  }

  // Páginas, estilos y datos: primero internet (para ver precios y fechas al día),
  // y si no hay conexión, lo guardado
  e.respondWith(
    fetch(req)
      .then((resp) => guardar(req, resp))
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});

function guardar(req, resp) {
  if (resp.ok) {
    const copia = resp.clone();
    caches.open(CACHE).then((c) => c.put(req, copia));
  }
  return resp;
}
