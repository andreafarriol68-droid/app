# Auditoría de ciberseguridad · App Obrador Mi Segueta

**Fecha:** 16 de octubre de 2026 · **Alcance:** todo el repositorio (`index.html`, `app.js`, `datos.js`, `sw.js`, `manifest.json`, historial git) y su despliegue previsto en GitHub Pages con Formspree.
**Método:** revisión manual del código siguiendo OWASP ASVS / Top 10 y las Cheat Sheets de OWASP, más búsqueda de secretos en el historial git.

## Resumen

La app es pequeña, sin servidor propio y sin dependencias npm, así que la superficie de ataque es reducida. El código escapa bien el HTML y no hay secretos en el historial. **Los riesgos importantes no están en el código, sino alrededor:** quién puede cambiar el IBAN que ven los alumnos, cómo se tratan sus datos personales (RGPD) y lo que GitHub Pages no permite configurar.

| # | Hallazgo | Gravedad |
|---|----------|----------|
| A1 | Si alguien entra en la cuenta de GitHub (o clona la web), puede cambiar el IBAN y desviar los pagos | **Alta** |
| A2 | El formulario recoge nombre, email y teléfono sin información RGPD; Formspree y Google Fonts reciben datos sin avisar | **Alta** (legal) |
| M1 | En `*.github.io`, cualquier otro proyecto de la misma cuenta puede leer las reservas guardadas en el móvil | Media |
| M2 | El formulario de Formspree no tiene antispam: se pueden enviar reservas falsas en masa o a nombre de otros | Media |
| M3 | Sin Content-Security-Policy ni cabeceras de seguridad; se puede meter la web dentro de otra (clickjacking) | Media |
| B1 | Los datos del alumno quedan guardados en el dispositivo sin opción de borrarlos | Baja |
| B2 | Algunos valores leídos de `localStorage` se insertan en el HTML sin escapar | Baja |
| B3 | La referencia de reserva usa `Math.random()` | Baja |
| B4 | El escapado del `.ics` no trata `\r` | Baja |
| I1 | Las fotos reales que subáis pueden llevar la ubicación GPS en sus metadatos | Info |

**Lo que está bien:** escapado de HTML (`escapar`) aplicado de forma coherente; sin dependencias de terceros en JS; sin secretos ni claves en el historial git; el service worker nunca cachea los envíos (POST); doble envío bloqueado; `fetch` con tiempo límite; `.claude/` fuera del repositorio.

---

## Hallazgos en detalle

### A1 · Manipulación del IBAN (fraude de pago) — Alta
El IBAN que copia el alumno sale de [datos.js](datos.js) y se publica tal cual. Quien consiga escribir en el repositorio (contraseña robada, sesión abierta en un ordenador ajeno, token filtrado) puede cambiarlo y los pagos irían a su cuenta sin que nada lo avise. También es fácil clonar la web con otro IBAN y difundirla por WhatsApp/Instagram.

**Arreglo:**
- Activar **2FA** (mejor con llave o app, no SMS) en GitHub, en el email `hola@` y en Formspree.
- **Proteger la rama `main`** (Settings → Branches): sin push forzado y, si colabora más gente, con revisión obligatoria.
- Activar el aviso por email de cada push o revisar `git log -p datos.js` de vez en cuando.
- Que el **email de confirmación de la escuela repita el IBAN** y que la web diga: "El único IBAN válido es el que te enviamos por email / el que aparece en obradormisegueta.es".
- Con dominio propio (ver M1), los clones son más fáciles de distinguir.

### A2 · RGPD y datos personales — Alta (cumplimiento)
- El formulario ([index.html:116-128](index.html:116)) pide nombre, email y teléfono **sin cláusula informativa** (responsable, finalidad, base legal, derechos, encargados). Es obligatorio según el art. 13 del RGPD.
- **Formspree** (EE. UU.) recibe y guarda esos datos: es un encargado del tratamiento y hay que mencionarlo (y revisar su DPA).
- **Google Fonts** se carga desde servidores de Google ([index.html:28-30](index.html:28)), lo que envía la IP del visitante a Google sin consentimiento. Ya hay sentencias en la UE que lo han sancionado.

**Arreglo:** texto breve de privacidad junto al botón de enviar más un enlace a una política completa; **alojar las fuentes en el propio repositorio** (carpeta `fuentes/`, `@font-face` local), lo que también ayuda con M3 y con el modo sin conexión.

### M1 · Origen compartido en GitHub Pages — Media
Todas las webs de la cuenta se sirven desde el mismo origen `https://andreafarriol68-droid.github.io`. `localStorage` es por origen, no por carpeta, así que **cualquier otro repositorio publicado en Pages por esa cuenta** (actual o futuro, incluido uno de prueba con código copiado) puede leer `reservas` y `alumno` ([app.js:38-76](app.js:38)).

**Arreglo:** publicar en un **dominio o subdominio propio** (p. ej. `reservas.obradormisegueta.es`), que además da un origen exclusivo y una URL de confianza (A1). Mientras tanto, no publicar ningún otro repositorio en Pages desde esa cuenta.

### M2 · Abuso del formulario de Formspree — Media
La URL de Formspree es pública por diseño. Sin protección, un bot puede llenar el buzón de reservas falsas o reservar en nombre de terceros (con su email y teléfono).

**Arreglo:** añadir el campo trampa `_gotcha` (honeypot) en el envío ([app.js:373](app.js:373)), activar en Formspree el filtro de spam y la restricción de **dominio permitido**, y limitar el envío a un número razonable por dispositivo y hora.

### M3 · Sin CSP ni cabeceras de seguridad — Media
GitHub Pages no permite configurar cabeceras HTTP (CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Hoy cualquier web puede meter la app en un `<iframe>` y superponerle botones (clickjacking), y si algún día entrara un script inyectado no habría nada que lo frenara.

**Arreglo:**
1. Ya: añadir en `<head>` una CSP por `<meta>` (cuando las fuentes estén alojadas en local):
   `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; connect-src 'self' https://formspree.io; base-uri 'none'; form-action 'self'; object-src 'none'` y `<meta name="referrer" content="strict-origin-when-cross-origin">`.
2. Con dominio propio: poner Cloudflare (gratis) delante o pasar a Netlify/Cloudflare Pages para servir cabeceras reales, incluida `frame-ancestors 'none'` (no funciona por `<meta>`).
3. Comprobar con Mozilla HTTP Observatory y CSP Evaluator.

### B1 · Datos personales persistentes en el dispositivo — Baja
`alumno` y `reservas` quedan en `localStorage` para siempre. En un móvil u ordenador compartido, el siguiente usuario ve el nombre, email, teléfono e historial. **Arreglo:** botón "Olvidar mis datos en este dispositivo" en *Mis reservas*, y borrar solas las reservas finalizadas pasados unos meses.

### B2 · Valores de `localStorage` sin escapar — Baja
En [app.js:572](app.js:572) (`estado-${estado}` dentro de `class`) y [app.js:574](app.js:574) (`r.plazas`) se insertan valores guardados sin pasar por `escapar()`. Hoy solo los escribe la propia app, pero con M1 otro proyecto del mismo origen podría escribir ahí y provocar XSS persistente. **Arreglo:** validar al leer (estado dentro de la lista `ESTADOS`, plazas como número entero) y escapar siempre.

### B3 · Referencia con `Math.random()` — Baja
[app.js:290-295](app.js:290). No es un secreto, pero sí la clave para cuadrar pagos. **Arreglo:** `crypto.getRandomValues` y comprobar que no coincide con una existente.

### B4 · Escapado del calendario `.ics` — Baja
[app.js:521](app.js:521) sustituye `\n` pero no `\r`. **Arreglo:** `.replace(/\r?\n|\r/g, "\\n")`.

### I1 · Metadatos de las fotos — Informativo
Al cambiar las fotos de Unsplash por las vuestras, quitad los metadatos EXIF (GPS, modelo de móvil, fecha). Muchos editores lo hacen al "Exportar"; también `exiftool -all= foto.jpg`.

---

## Repositorios de GitHub recomendados

Elegidos por ser referencia en el sector y por encajar con una web estática sin servidor.

**Guías y estándares (qué comprobar)**
- [OWASP/CheatSheetSeries](https://github.com/OWASP/CheatSheetSeries): guías prácticas; para esta app, *Content Security Policy*, *XSS Prevention*, *HTML5 Security* y *Third Party JavaScript*.
- [OWASP/ASVS](https://github.com/OWASP/ASVS): lista de requisitos verificables; el nivel 1 basta para esta app.
- [OWASP/wstg](https://github.com/OWASP/wstg): guía de pruebas de seguridad web.

**Herramientas (cómo comprobarlo)**
- [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks): busca contraseñas y claves en el código y el historial git.
- [trufflesecurity/trufflehog](https://github.com/trufflesecurity/trufflehog): igual que el anterior, y además comprueba si las claves encontradas siguen activas.
- [semgrep/semgrep](https://github.com/semgrep/semgrep): análisis estático; detecta `innerHTML` peligrosos y otros patrones de XSS en JavaScript.
- [zaproxy/zaproxy](https://github.com/zaproxy/zaproxy): escáner de la web publicada (OWASP ZAP), con acción de GitHub para el "baseline scan".
- [RetireJS/retire.js](https://github.com/RetireJS/retire.js): avisa si se añade alguna librería JS con vulnerabilidades conocidas.
- [mdn/mdn-http-observatory](https://github.com/mdn/mdn-http-observatory): puntúa las cabeceras de seguridad del sitio publicado.
- [google/csp-evaluator](https://github.com/google/csp-evaluator): revisa si una CSP es débil.
- [GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse): auditoría de buenas prácticas, PWA y algunos puntos de seguridad.
- [cure53/DOMPurify](https://github.com/cure53/DOMPurify): limpiador de HTML; solo hará falta si algún día se muestra HTML que escriba un usuario.

**Listas para seguir aprendiendo**
- [sbilly/awesome-security](https://github.com/sbilly/awesome-security) y [OWASP/www-project-top-ten](https://github.com/OWASP/www-project-top-ten).

---

## Plan de trabajo

### Fase 0 · Hoy (≈1 h, sin tocar código)
- [ ] 2FA en GitHub, en el email `hola@obradormisegueta.es` y en Formspree (A1)
- [ ] Proteger la rama `main` y activar en GitHub *Secret scanning* y *Push protection* (A1)
- [ ] Revisar que la cuenta de GitHub no tenga otros proyectos publicados en Pages (M1)
- [ ] Revisar y aceptar el DPA de Formspree; en su panel, activar el filtro de spam y el dominio permitido (A2, M2)

### Fase 1 · Arreglos en el código — hecho el 16-10-2026
- [x] Alojar las fuentes en local y quitar Google Fonts (A2, M3)
- [x] Cláusula RGPD junto al formulario y página `privacidad.html` (A2)
- [x] CSP y `referrer` por `<meta>` (M3)
- [x] Honeypot `_gotcha` y límite de envíos por dispositivo (M2)
- [x] Validar y escapar los datos leídos de `localStorage` (B2)
- [x] `crypto.getRandomValues` en la referencia (B3) y `\r` en el `.ics` (B4)
- [x] Botón "Olvidar mis datos en este dispositivo" y limpieza de reservas antiguas (B1)
- [x] Aviso "el único IBAN válido es…" en los datos de pago (A1) · repetir el IBAN en el email de confirmación queda en manos de la escuela (README)
- [x] Subir `VERSION` en `sw.js` y añadir los archivos nuevos a `ARCHIVOS`

### Fase 2 · Semana 2 · Despliegue
- [ ] Dominio o subdominio propio para la app (M1, A1)
- [ ] Cloudflare delante (o Netlify/Cloudflare Pages) para servir cabeceras: CSP con `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options`, `Permissions-Policy` (M3)
- [ ] Comprobar con Mozilla HTTP Observatory (objetivo: A o más) y CSP Evaluator
- [ ] Quitar los metadatos de las fotos reales antes de subirlas (I1)

### Fase 3 · Semana 3 · Automatizar las comprobaciones
- [ ] GitHub Action con **gitleaks** en cada push
- [ ] GitHub Action con **semgrep** (reglas `p/javascript` y `p/xss`)
- [ ] GitHub Action con **ZAP baseline scan** contra la web publicada, una vez por semana
- [ ] **Lighthouse CI** para PWA y buenas prácticas

### Fase 4 · Continuo
- [ ] Cada trimestre: repasar esta auditoría, el historial de `datos.js` y los accesos a GitHub/Formspree
- [ ] Antes de añadir cualquier librería JS: pasarla por retire.js
- [ ] Si se añade pago online o cuentas de usuario, hacer una auditoría nueva (el alcance cambia por completo)
