// Lógica de la app. Los datos están en datos.js.

const $ = (sel) => document.querySelector(sel);
const euros = (n) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
const aFecha = (txt) => { const [a, m, d] = txt.split("-").map(Number); return new Date(a, m - 1, d); };
const fechaLarga = (txt) =>
  aFecha(txt).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const claveDia = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function hoy() { const h = new Date(); h.setHours(0, 0, 0, 0); return h; }

function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.classList.add("visible");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => a.classList.remove("visible"), 2600);
}

const envioAutomatico = () => !!ESCUELA.formularioURL;

// ---------- Mis reservas (guardadas en este dispositivo) ----------
function leerReservas() {
  try { return JSON.parse(localStorage.getItem("reservas") || "[]"); } catch { return []; }
}
function guardarReservas(lista) {
  try { localStorage.setItem("reservas", JSON.stringify(lista)); } catch {}
  pintarContador();
}
function cambiarReserva(referencia, cambios) {
  guardarReservas(leerReservas().map((r) => (r.referencia === referencia ? { ...r, ...cambios } : r)));
}
const reservaPorRef = (ref) => leerReservas().find((r) => r.referencia === ref);

// Estados:  sin-enviar → enviada (la escuela la tiene) → pagada (transferencia hecha)
//           espera (lista de espera, sin pago)
const estadoDe = (r) => r.estado || (r.enviada ? "enviada" : "sin-enviar");
const ESTADOS = {
  "sin-enviar": "Sin enviar a la escuela",
  enviada: "Pendiente de pago",
  pagada: "Pagada · pendiente de confirmar",
  espera: "En lista de espera",
};
// Una petición de lista de espera "llegó" si se envió sola o el alumno confirmó que mandó el email
const esperaSinEnviar = (r) => estadoDe(r) === "espera" && r.pendienteEnvio;
const necesitaAccion = (r) => !actividadPasada(r) && (["sin-enviar", "enviada"].includes(estadoDe(r)) || esperaSinEnviar(r));

function pintarContador() {
  const pendientes = leerReservas().filter(necesitaAccion).length;
  const c = $("#contador-reservas");
  c.hidden = !pendientes;
  c.textContent = pendientes;
}

// Datos del alumno, para no tener que escribirlos en cada reserva
function leerAlumno() {
  try { return JSON.parse(localStorage.getItem("alumno") || "{}"); } catch { return {}; }
}
function guardarAlumno(a) {
  try { localStorage.setItem("alumno", JSON.stringify(a)); } catch {}
}

// ---------- Pestañas ----------
function mostrarSeccion(id) {
  document.querySelectorAll(".pestanas button").forEach((b) => b.setAttribute("aria-selected", b.dataset.seccion === id));
  document.querySelectorAll(".seccion").forEach((s) => (s.hidden = s.id !== id));
  if (id === "reservas") pintarReservas();
  history.replaceState(null, "", "#" + id);
  window.scrollTo({ top: 0 });
}

// ---------- Cursos ----------
const precioHtml = (a) =>
  `<span class="precio">${euros(a.precio)}${a.unidad ? ` <small>${escapar(a.unidad)}</small>` : ""}</span>`;

// plazas: 0 en datos.js = completo → se ofrece lista de espera
const completo = (a) => a.plazas <= 0;
const botonReservar = (a) => completo(a)
  ? `<button class="btn btn-secundario" data-reservar="${a.id}">Lista de espera</button>`
  : `<button class="btn btn-principal" data-reservar="${a.id}">Reservar</button>`;
const estadoHtml = (a) => completo(a)
  ? `<p class="estado-plazas">Completo</p>`
  : a.estado ? `<p class="estado-plazas">${escapar(a.estado)}</p>` : "";

function pintarCursos() {
  $("#lista-cursos").innerHTML = CURSOS.map((c) => `
    <article class="tarjeta">
      <span class="chip">${escapar(c.tipo || "Curso")}</span>
      <h3>${escapar(c.nombre)}</h3>
      <p class="desc">${escapar(c.descripcion)}</p>
      <ul class="datos">
        ${c.inicio ? `<li>📅 Empieza el ${fechaLarga(c.inicio)}</li>` : ""}
        <li>🕒 ${escapar(c.horario)}</li>
        <li>⏳ ${escapar(c.duracion)}</li>
        <li>🎓 ${escapar(c.nivel)}</li>
      </ul>
      ${estadoHtml(c)}
      <div class="precio-fila">
        ${precioHtml(c)}
        ${botonReservar(c)}
      </div>
    </article>`).join("");
}
// ---------- Talleres y calendario ----------
const diasDe = (t) => (t.fecha ? [t.fecha, ...(t.otrasFechas || [])] : []);
const conFecha = TALLERES.filter((t) => t.fecha);
const primerTaller = conFecha.map((t) => aFecha(t.fecha)).filter((f) => f >= hoy()).sort((a, b) => a - b)[0];
let mesVisible = new Date((primerTaller || hoy()).getFullYear(), (primerTaller || hoy()).getMonth(), 1);
let diaSeleccionado = null;

function talleresDelMes(fecha) {
  const prefijo = claveDia(fecha).slice(0, 7); // "AAAA-MM"
  return conFecha
    .filter((t) => diasDe(t).some((d) => d.startsWith(prefijo)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function pintarCalendario() {
  const titulo = mesVisible.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  $("#mes-titulo").textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  const delMes = talleresDelMes(mesVisible);
  const dias = new Set(delMes.flatMap(diasDe));
  const desfase = (mesVisible.getDay() + 6) % 7; // lunes = 0
  const total = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const hoyClave = claveDia(hoy());

  let html = "";
  for (let i = 0; i < desfase; i++) html += `<span class="cal-dia otro-mes"></span>`;
  for (let d = 1; d <= total; d++) {
    const f = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), d);
    const clave = claveDia(f);
    const clases = ["cal-dia"];
    if (clave === hoyClave) clases.push("hoy");
    if (f < hoy()) clases.push("pasado");
    if (dias.has(clave)) clases.push("con-taller");
    if (clave === diaSeleccionado) clases.push("seleccionado");
    html += dias.has(clave)
      ? `<button class="${clases.join(" ")}" data-dia="${clave}" aria-label="${fechaLarga(clave)}: hay taller">${d}</button>`
      : `<span class="${clases.join(" ")}">${d}</span>`;
  }
  $("#cal-dias").innerHTML = html;

  const nombreMes = mesVisible.toLocaleDateString("es-ES", { month: "long" });
  $("#titulo-talleres-mes").textContent = `Talleres de ${nombreMes}`;
  $("#lista-talleres").innerHTML = delMes.length
    ? delMes.map(tarjetaTaller).join("")
    : `<p class="vacio">No hay talleres programados este mes.</p>`;
}

function pintarTalleresConvenir() {
  const lista = TALLERES.filter((t) => !t.fecha);
  $("#bloque-convenir").hidden = !lista.length;
  $("#lista-convenir").innerHTML = lista.map(tarjetaTaller).join("");
}

function tarjetaTaller(t) {
  const pasado = t.fecha && aFecha(diasDe(t).at(-1)) < hoy();
  return `
    <article class="tarjeta ${diasDe(t).includes(diaSeleccionado) ? "resaltada" : ""}" id="taller-${t.id}">
      <span class="chip">${t.fecha ? fechaLarga(t.fecha) : "Fecha a convenir"}</span>
      <h3>${escapar(t.nombre)}</h3>
      <p class="desc">${escapar(t.descripcion)}</p>
      <ul class="datos">
        <li>🕒 ${escapar(t.hora)}</li>
        ${t.fecha ? `<li>👥 Grupo de máximo ${t.grupo || 6} personas</li>` : ""}
      </ul>
      ${pasado ? "" : estadoHtml(t)}
      <div class="precio-fila">
        ${precioHtml(t)}
        ${pasado
          ? `<span class="nota">Ya realizado</span>`
          : botonReservar(t)}
      </div>
    </article>`;
}

// ---------- Horario ----------
function pintarHorario() {
  const indiceHoy = (new Date().getDay() + 6) % 7; // lunes = 0
  $("#tabla-horario").innerHTML = ESCUELA.horario.map((h, i) => `
    <tr class="${i === indiceHoy ? "hoy" : ""}">
      <td>${escapar(h.dia)}${i === indiceHoy ? " (hoy)" : ""}</td>
      <td class="${/cerrado/i.test(h.horas) ? "cerrado-txt" : ""}">${h.horas.split("·").map((t) => escapar(t.trim())).join("<br>")}</td>
    </tr>`).join("");
  $("#nota-horario").textContent = ESCUELA.notaHorario || "";

  // ¿Abierto ahora?
  const ahora = new Date();
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const tramos = [...ESCUELA.horario[indiceHoy].horas.matchAll(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/g)];
  const abierto = tramos.some((m) => minutos >= m[1] * 60 + +m[2] && minutos < m[3] * 60 + +m[4]);
  const estado = $("#estado-abierto");
  estado.textContent = abierto ? "● Abierto ahora" : "● Cerrado ahora";
  estado.className = "estado " + (abierto ? "abierto" : "cerrado");
}

// ============================================================
//  RESERVA — flujo:
//  1. Formulario (con "qué pasa después" a la vista)
//  2. Envío a la escuela: automático (Formspree), con reintento
//     solo; si no hay Formspree o falla → email / llamada
//  3. Datos de transferencia + "Ya he pagado" + añadir al calendario
// ============================================================
let actividadActual = null;

function buscarActividad(id) {
  const c = CURSOS.find((x) => x.id === id);
  if (c) return { ...c, tipo: "Curso", fechaActividad: c.inicio, cuando: `${c.inicio ? `Empieza el ${fechaLarga(c.inicio)} · ` : ""}${c.horario}` };
  const t = TALLERES.find((x) => x.id === id);
  if (t) return { ...t, tipo: "Taller", fechaActividad: t.fecha ? diasDe(t).at(-1) : null, cuando: `${t.fecha ? fechaLarga(t.fecha) + " · " : ""}${t.hora}` };
  return null;
}

// fechaActividad = último día (talleres) o día de inicio (cursos)
const actividadPasada = (r) => !!r.fechaActividad && aFecha(r.fechaActividad) < hoy();
const primerDia = (r) => { const a = buscarActividad(r.id); return a?.tipo === "Taller" ? a.fecha : r.fechaActividad; };

function abrirReserva(id) {
  actividadActual = buscarActividad(id);
  if (!actividadActual) return;
  const espera = completo(actividadActual);
  const form = $("#form-reserva");
  form.hidden = false;
  form.classList.remove("validado");
  $("#paso-resultado").hidden = true;

  $("#reserva-etiqueta").textContent = espera ? "Lista de espera" : "Reservar plaza";
  $("#reserva-titulo").textContent = `${actividadActual.tipo}: ${actividadActual.nombre}`;
  $("#reserva-detalle").textContent = actividadActual.cuando;
  $("#texto-plazas").textContent = actividadActual.textoPlazas || "Número de plazas";
  const max = espera ? 4 : Math.min(actividadActual.plazas, 4);
  $("#reserva-plazas").innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  $("#fila-total").hidden = espera;

  $("#que-pasa-lista").innerHTML = (espera
    ? ["Enviamos tu petición a la escuela.", "Si se libera una plaza, te escriben o te llaman.", "No pagas nada ahora."]
    : [
        "Enviamos tu reserva a la escuela.",
        `Te damos los datos para la transferencia (tienes ${ESCUELA.banco.plazoDias} días).`,
        "La escuela te confirma la plaza al recibir el pago.",
      ]).map((t) => `<li>${t}</li>`).join("");
  const btn = $("#btn-enviar");
  btn.textContent = espera ? "Apuntarme a la lista de espera" : "Enviar reserva";
  btn.disabled = false;

  // ¿Ya tiene una reserva de esto en este dispositivo?
  const previa = leerReservas().find((r) => r.id === actividadActual.id && !actividadPasada(r));
  const dup = $("#reserva-duplicada");
  dup.hidden = !previa;
  if (previa) dup.innerHTML = `Ya tienes una reserva de esto (<strong>${escapar(ESTADOS[estadoDe(previa)])}</strong>).
    <button type="button" class="enlace" data-ir="reservas">Verla</button> · o sigue si quieres hacer otra.`;

  const alumno = leerAlumno();
  ["nombre", "email", "telefono"].forEach((k) => (form.elements[k].value = alumno[k] || ""));
  actualizarTotal();
  $("#dialogo").showModal();
  const primerVacio = [...form.querySelectorAll("input")].find((i) => !i.value);
  (primerVacio || btn).focus();
}

function actualizarTotal() {
  const unidad = actividadActual.unidad ? ` ${actividadActual.unidad}` : "";
  $("#reserva-total").textContent = euros(actividadActual.precio * Number($("#reserva-plazas").value)) + unidad;
}

function generarReferencia() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "";
  for (let i = 0; i < 5; i++) r += letras[Math.floor(Math.random() * letras.length)];
  return "MSG-" + r;
}

// Fecha límite de pago: X días desde la reserva, pero nunca después de la víspera del primer día
function fechaLimiteDate(r) {
  const creada = new Date(r.creada); creada.setHours(0, 0, 0, 0);
  const f = new Date(creada); f.setDate(f.getDate() + ESCUELA.banco.plazoDias);
  const inicio = primerDia(r);
  if (inicio) {
    const vispera = aFecha(inicio); vispera.setDate(vispera.getDate() - 1);
    if (vispera < f) return vispera < creada ? creada : vispera;
  }
  return f;
}
const fechaLimite = (r) => fechaLimiteDate(r).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const plazoVencido = (r) => estadoDe(r) === "enviada" && fechaLimiteDate(r) < hoy();

function htmlPago(r) {
  const b = ESCUELA.banco;
  const fila = (etq, valor, copiable) => `
    <div class="pago-fila">
      <span>${etq}</span>
      <div class="pago-valor"><strong>${escapar(valor)}</strong>${copiable ? `<button class="copiar" data-copiar="${escapar(valor)}">Copiar</button>` : ""}</div>
    </div>`;
  return `
    <div class="pago">
      ${fila("Importe", euros(r.total) + (r.unidad ? ` ${r.unidad}` : ""), false)}
      ${fila("Titular", b.titular, false)}
      ${fila("IBAN", b.iban, true)}
      ${fila("Banco", b.banco, false)}
      ${fila("Concepto", `${r.referencia} ${r.nombre}`, true)}
    </div>
    <p class="nota">Hazla <strong>antes del ${fechaLimite(r)}</strong> y copia el concepto tal cual: así la escuela sabe que el pago es tuyo.</p>`;
}

function textoReserva(r) {
  const espera = estadoDe(r) === "espera";
  return [
    `${espera ? "Lista de espera" : "Nueva reserva"} ${r.referencia}`,
    `${r.tipo}: ${r.actividad}`,
    `Cuándo: ${r.cuando}`,
    `Plazas: ${r.plazas}`,
    ...(espera ? [] : [`Total: ${euros(r.total)}${r.unidad ? " " + r.unidad : ""}`]),
    ``,
    `Nombre: ${r.nombre}`,
    `Email: ${r.email}`,
    `Teléfono: ${r.telefono}`,
    ...(espera ? [] : [``, `Pago por transferencia con concepto: ${r.referencia} ${r.nombre}`]),
  ].join("\n");
}

const asunto = (r) => `${estadoDe(r) === "espera" ? "Lista de espera" : "Reserva"} ${r.referencia} – ${r.actividad}`;
const enlaceEmail = (r) => `mailto:${ESCUELA.email}?subject=${encodeURIComponent(asunto(r))}&body=${encodeURIComponent(textoReserva(r))}`;
const enlaceTel = () => "tel:" + ESCUELA.telefono.replace(/\s/g, "");

// Envío automático a la escuela (Formspree). Devuelve true si llegó.
const enviando = new Set();
async function enviarAEscuela(r) {
  if (!envioAutomatico() || !navigator.onLine || enviando.has(r.referencia)) return false;
  enviando.add(r.referencia);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const { pendienteEnvio, ...datos } = r;
    const resp = await fetch(ESCUELA.formularioURL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ _subject: asunto(r), ...datos, mensaje: textoReserva(r) }), // "email" = responder a
      signal: ctrl.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
    enviando.delete(r.referencia);
  }
}

function marcarEnviada(ref) {
  const r = reservaPorRef(ref);
  if (!r) return;
  cambiarReserva(ref, { pendienteEnvio: false, estado: estadoDe(r) === "espera" ? "espera" : "enviada" });
}

// Reintenta en segundo plano lo que no llegó (al abrir la app o al recuperar la conexión)
async function reintentarPendientes() {
  if (!envioAutomatico()) return;
  for (const r of leerReservas().filter((x) => (x.pendienteEnvio || estadoDe(x) === "sin-enviar") && !actividadPasada(x))) {
    if (await enviarAEscuela(r)) {
      marcarEnviada(r.referencia);
      avisar("Tu reserva ya ha llegado a la escuela ✓");
      refrescar(r.referencia);
    }
  }
}

// Bloque "la escuela aún no lo tiene": otras vías para avisar
function htmlSinEnviar(r) {
  const ref = escapar(r.referencia);
  return `
    <div class="alerta">
      <p><strong>La escuela todavía no tiene tu ${estadoDe(r) === "espera" ? "petición" : "reserva"}.</strong>
      ${envioAutomatico()
        ? "No se ha podido enviar (¿sin conexión?). Lo reintentaremos solos al volver a abrir la app, o hazlo tú ahora:"
        : "Envíala por email: se abrirá tu correo con todo ya escrito y solo tienes que pulsar Enviar."}</p>
      <div class="acciones">
        ${envioAutomatico() ? `<button class="btn btn-principal" data-reintentar="${ref}">Reintentar envío</button>` : ""}
        <a class="btn ${envioAutomatico() ? "btn-secundario" : "btn-principal"}" href="${enlaceEmail(r)}" data-mailto="${ref}">✉️ Enviar por email</a>
        <a class="btn btn-secundario" href="${enlaceTel()}">📞 Llamar</a>
      </div>
      <div class="confirmar-mail" data-confirmar-de="${ref}" hidden>
        <p class="nota">¿Has pulsado Enviar en tu correo (o has llamado)?</p>
        <button class="btn btn-secundario" data-mail-enviado="${ref}">Sí, la escuela ya lo sabe</button>
      </div>
    </div>`;
}

// Línea de progreso: Enviada → Transferencia → Confirmada
function htmlProgreso(r) {
  const e = estadoDe(r);
  if (e === "espera") return "";
  const nivel = { "sin-enviar": 0, enviada: 1, pagada: 2 }[e];
  return `<ol class="progreso" aria-label="Progreso de la reserva">${[nivel ? "Reserva enviada" : "Enviar reserva", "Transferencia", "Plaza confirmada"]
    .map((p, i) => `<li class="${i < nivel ? "hecho-paso" : i === nivel ? "actual" : ""}"${i === nivel ? ' aria-current="step"' : ""}>${p}</li>`)
    .join("")}</ol>`;
}

// En lista de espera no hay plaza todavía: no se ofrece añadirlo al calendario
const botonCalendario = (r) => r.fechaActividad && !actividadPasada(r) && estadoDe(r) !== "espera"
  ? `<button class="btn btn-secundario" data-ics="${escapar(r.referencia)}">📅 Añadir a mi calendario</button>` : "";

// Contenido de la ventana tras enviar el formulario
function pintarResultado(r) {
  const e = estadoDe(r);
  const ref = escapar(r.referencia);
  let html = `<p class="etiqueta">${e === "espera" ? "Lista de espera" : "Tu reserva"} · Ref. ${ref}</p>`;
  if (e === "espera") {
    html += r.pendienteEnvio
      ? `<h3>Falta un paso</h3>${htmlSinEnviar(r)}`
      : `<h3>¡Estás en la lista de espera!</h3>
         <p>Si se libera una plaza, la escuela te escribirá a <strong>${escapar(r.email)}</strong> o te llamará. No tienes que pagar nada ahora.</p>`;
  } else if (e === "sin-enviar") {
    html += `<h3>Falta un paso para guardar tu plaza</h3>${htmlProgreso(r)}${htmlSinEnviar(r)}
      <details><summary>Ver datos para la transferencia</summary>${htmlPago(r)}</details>`;
  } else if (e === "enviada") {
    html += `<h3>¡Reserva recibida! Ahora, la transferencia</h3>${htmlProgreso(r)}
      ${htmlPago(r)}
      <button class="btn btn-principal ancho" data-pagada="${ref}">Ya he hecho la transferencia</button>
      <p class="nota centrada">¿La harás luego? Todo queda guardado en <strong>Mis reservas</strong>.</p>`;
  } else {
    html += `<h3>¡Gracias! Pago anotado</h3>${htmlProgreso(r)}
      <p>La escuela te confirmará la plaza en cuanto reciba la transferencia.</p>`;
  }
  html += `<div class="acciones">${botonCalendario(r)}<button class="btn btn-secundario" data-ir="reservas">Ver mis reservas</button></div>`;
  $("#resultado").innerHTML = html;
}

function validar(form) {
  form.classList.add("validado");
  const nombre = form.elements.nombre;
  nombre.setCustomValidity(nombre.value.trim().length < 3 ? "corto" : "");
  const malo = [...form.querySelectorAll("input")].find((i) => !i.checkValidity());
  if (malo) { malo.focus(); return false; }
  return true;
}

async function confirmarReserva(e) {
  e.preventDefault();
  const form = e.target;
  if (!validar(form)) return;
  const btn = $("#btn-enviar");
  if (btn.disabled) return; // evita reservas dobles
  const datos = new FormData(form);
  const plazas = Number(datos.get("plazas"));
  const espera = completo(actividadActual);
  const r = {
    referencia: generarReferencia(),
    id: actividadActual.id,
    tipo: actividadActual.tipo,
    actividad: actividadActual.nombre,
    cuando: actividadActual.cuando,
    fechaActividad: actividadActual.fechaActividad || null,
    plazas,
    total: espera ? 0 : actividadActual.precio * plazas,
    unidad: actividadActual.unidad || "",
    nombre: datos.get("nombre").trim(),
    email: datos.get("email").trim(),
    telefono: datos.get("telefono").trim(),
    creada: new Date().toISOString(),
    estado: espera ? "espera" : "sin-enviar",
    pendienteEnvio: true,
  };
  guardarReservas([r, ...leerReservas()]);
  guardarAlumno({ nombre: r.nombre, email: r.email, telefono: r.telefono });

  btn.disabled = true;
  btn.innerHTML = `<span class="girando" aria-hidden="true"></span> Enviando…`;
  if (await enviarAEscuela(r)) marcarEnviada(r.referencia);

  form.hidden = true;
  $("#paso-resultado").hidden = false;
  pintarResultado(reservaPorRef(r.referencia) || r);
  $("#dialogo").scrollTop = 0;
  $("#paso-resultado").focus({ preventScroll: true });
}

// ---------- Añadir al calendario (.ics) ----------
function descargarIcs(r) {
  const act = buscarActividad(r.id) || {};
  const dias = act.tipo === "Taller" ? diasDe(act) : [r.fechaActividad];
  const m = (act.hora || act.horario || "").match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (t) => String(t).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Obrador Mi Segueta//Reservas//ES", "CALSCALE:GREGORIAN"];
  dias.forEach((d, i) => {
    const base = d.replace(/-/g, "");
    ics.push("BEGIN:VEVENT", `UID:${r.referencia}-${i}@misegueta`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`);
    if (m) ics.push(`DTSTART:${base}T${pad(m[1])}${m[2]}00`, `DTEND:${base}T${pad(m[3])}${m[4]}00`);
    else {
      const sig = aFecha(d); sig.setDate(sig.getDate() + 1);
      ics.push(`DTSTART;VALUE=DATE:${base}`, `DTEND;VALUE=DATE:${claveDia(sig).replace(/-/g, "")}`);
    }
    ics.push(
      `SUMMARY:${esc(`${r.actividad}${act.tipo === "Curso" ? " (primer día)" : ""} · ${ESCUELA.nombre}`)}`,
      `LOCATION:${esc(ESCUELA.direccion)}`,
      `DESCRIPTION:${esc(`Reserva ${r.referencia} · ${r.plazas} plaza(s)\nTel. ${ESCUELA.telefono}`)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Recordatorio", "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT");
  });
  ics.push("END:VCALENDAR");
  const url = URL.createObjectURL(new Blob([ics.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${r.referencia}.ics` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- Mis reservas ----------
function pintarReservas() {
  const lista = leerReservas().sort((a, b) => (necesitaAccion(b) - necesitaAccion(a)) || b.creada.localeCompare(a.creada));
  $("#lista-reservas").innerHTML = lista.length
    ? lista.map((r) => {
        const estado = estadoDe(r);
        const ref = escapar(r.referencia);
        const pasada = actividadPasada(r);
        let cuerpo;
        if (pasada) cuerpo = `<p class="nota">Esta actividad ya ha pasado.</p>`;
        else if (estado === "espera") cuerpo = r.pendienteEnvio
          ? htmlSinEnviar(r)
          : `<p class="hecho">✓ La escuela tiene tu petición. Te avisará si se libera una plaza.</p>`;
        else if (estado === "sin-enviar") cuerpo = `${htmlSinEnviar(r)}<details><summary>Datos para la transferencia</summary>${htmlPago(r)}</details>`;
        else if (estado === "enviada") cuerpo = `
          ${plazoVencido(r) ? `<p class="alerta">El plazo de pago terminó el ${fechaLimite(r)}. Llama a la escuela para saber si tu plaza sigue reservada: <a href="${enlaceTel()}">${escapar(ESCUELA.telefono)}</a></p>` : ""}
          ${htmlPago(r)}
          <div class="acciones"><button class="btn btn-principal" data-pagada="${ref}">Ya he hecho la transferencia</button>${botonCalendario(r)}</div>`;
        else cuerpo = `<p class="hecho">✓ Transferencia hecha. La escuela te confirmará la plaza cuando la reciba.</p>
          <div class="acciones">${botonCalendario(r)}</div>
          <details><summary>Datos de pago</summary>${htmlPago(r)}</details>
          <button class="enlace" data-no-pagada="${ref}">Me he equivocado, aún no he pagado</button>`;
        return `
      <div class="reserva ${pasada ? "pasada" : ""}">
        <div class="reserva-cab">
          <h3>${escapar(r.actividad)}</h3>
          <span class="chip estado-${pasada ? "pasada" : estado}">${pasada ? "Finalizada" : ESTADOS[estado]}</span>
        </div>
        <p class="detalle">${escapar(r.tipo)} · ${escapar(r.cuando)} · ${r.plazas} plaza${r.plazas > 1 ? "s" : ""} · Ref. ${ref}</p>
        ${pasada ? "" : htmlProgreso(r)}
        ${cuerpo}
        <button class="enlace-quitar" data-borrar="${ref}">Quitar de la lista</button>
      </div>`;
      }).join("")
    : `<div class="vacio">
        <p>Todavía no has reservado nada.</p>
        <button class="btn btn-principal" data-ir="cursos">Ver cursos</button>
        <button class="btn btn-secundario" data-ir="talleres">Ver talleres</button>
      </div>`;
}

// Repinta lo que esté a la vista (ventana de reserva o lista)
function refrescar(ref) {
  const r = reservaPorRef(ref);
  if (r && $("#dialogo").open && !$("#paso-resultado").hidden && $("#resultado").innerHTML.includes(ref)) pintarResultado(r);
  if (!$("#reservas").hidden) pintarReservas();
}

// IBAN español: "ES" + 22 dígitos y dígitos de control correctos (módulo 97)
function ibanValido(iban) {
  const t = String(iban).replace(/[\s.-]/g, "").toUpperCase();
  if (!/^ES\d{22}$/.test(t) || /^ES0{2}/.test(t)) return false;
  const num = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  return [...num].reduce((resto, d) => (resto * 10 + +d) % 97, 0) === 1;
}

// ---------- Aviso para la escuela cuando prueba la app en su ordenador ----------
function avisoModoPrueba() {
  const falta = [];
  if (!ibanValido(ESCUELA.banco.iban)) falta.push("un IBAN válido (ES + 22 números; el actual no lo es)");
  if (/000 000/.test(ESCUELA.telefono)) falta.push("el teléfono");
  if (/Nombre del banco/.test(ESCUELA.banco.banco)) falta.push("el banco");
  if (!ESCUELA.formularioURL) falta.push("la dirección de Formspree (formularioURL)");
  if (!falta.length) return;
  console.warn("datos.js: falta " + falta.join(", "));
  const local = location.protocol === "file:" || ["localhost", "127.0.0.1", ""].includes(location.hostname);
  if (local) {
    const b = $("#modo-prueba");
    b.hidden = false;
    b.textContent = `Modo prueba · solo lo ves tú en tu ordenador. Antes de publicar, pon en datos.js: ${falta.join(", ")}.`;
  }
}

// ---------- Inicio ----------
function iniciar() {
  document.title = ESCUELA.nombre;
  $("#nombre-escuela").textContent = ESCUELA.nombre;
  $("#subtitulo").textContent = ESCUELA.subtitulo || "";
  $("#lema").textContent = ESCUELA.lema;
  $("#pie-nombre").textContent = `${ESCUELA.nombre} · ${ESCUELA.direccion}`;
  $("#direccion").textContent = ESCUELA.direccion;
  $("#como-llegar").textContent = ESCUELA.comoLlegar || "";
  $("#telefono").textContent = ESCUELA.telefono;
  $("#telefono").href = enlaceTel();
  $("#email").textContent = ESCUELA.email;
  $("#email").href = "mailto:" + ESCUELA.email;

  pintarCursos();
  pintarCalendario();
  pintarTalleresConvenir();
  pintarHorario();
  pintarContador();
  avisoModoPrueba();

  document.querySelectorAll(".pestanas button").forEach((b) => b.addEventListener("click", () => mostrarSeccion(b.dataset.seccion)));
  $("#mes-anterior").addEventListener("click", () => { mesVisible.setMonth(mesVisible.getMonth() - 1); diaSeleccionado = null; pintarCalendario(); });
  $("#mes-siguiente").addEventListener("click", () => { mesVisible.setMonth(mesVisible.getMonth() + 1); diaSeleccionado = null; pintarCalendario(); });
  $("#reserva-plazas").addEventListener("change", actualizarTotal);
  $("#form-reserva").addEventListener("submit", confirmarReserva);
  $("#form-reserva").addEventListener("input", (e) => e.target.name === "nombre" && e.target.setCustomValidity(""));
  // Cerrar pulsando fuera de la ventana
  $("#dialogo").addEventListener("click", (e) => { if (e.target === $("#dialogo")) $("#dialogo").close(); });
  window.addEventListener("online", reintentarPendientes);

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-reservar],[data-dia],[data-copiar],[data-borrar],[data-mailto],[data-mail-enviado],[data-reintentar],[data-pagada],[data-no-pagada],[data-ics],[data-ir],.cerrar");
    if (!el) return;
    const d = el.dataset;
    if (d.reservar) abrirReserva(d.reservar);
    else if (d.mailto) {
      // No podemos saber si pulsó Enviar en su correo: se lo preguntamos
      el.closest(".alerta")?.querySelector(".confirmar-mail")?.removeAttribute("hidden");
    } else if (d.mailEnviado) {
      marcarEnviada(d.mailEnviado);
      avisar("Anotado ✓");
      refrescar(d.mailEnviado);
    } else if (d.reintentar) {
      el.disabled = true;
      el.innerHTML = `<span class="girando" aria-hidden="true"></span> Enviando…`;
      const ok = await enviarAEscuela(reservaPorRef(d.reintentar) || {});
      if (ok) { marcarEnviada(d.reintentar); avisar("Enviada ✓ La escuela ya la tiene"); }
      else avisar("Sigue sin poder enviarse. Prueba por email o llamando.");
      refrescar(d.reintentar);
    } else if (d.pagada) {
      cambiarReserva(d.pagada, { estado: "pagada", pagadaEl: new Date().toISOString() });
      avisar("¡Gracias! Anotado como pagada");
      refrescar(d.pagada);
    } else if (d.noPagada) {
      cambiarReserva(d.noPagada, { estado: "enviada" });
      refrescar(d.noPagada);
    } else if (d.ics) {
      const r = reservaPorRef(d.ics);
      if (r) descargarIcs(r);
    } else if (d.ir) {
      if ($("#dialogo").open) $("#dialogo").close();
      mostrarSeccion(d.ir);
    } else if (d.dia) {
      diaSeleccionado = d.dia;
      pintarCalendario();
      document.querySelector(".tarjeta.resaltada")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (d.copiar) {
      try { await navigator.clipboard.writeText(d.copiar); avisar("Copiado"); } catch { avisar("No se pudo copiar"); }
    } else if (d.borrar) {
      if (confirm("¿Quitar esta reserva de la lista? (No cancela la plaza en la escuela)")) {
        guardarReservas(leerReservas().filter((r) => r.referencia !== d.borrar));
        pintarReservas();
      }
    } else {
      $("#dialogo").close();
    }
  });

  const inicial = location.hash.slice(1);
  if (["cursos", "talleres", "reservas", "horario"].includes(inicial)) mostrarSeccion(inicial);
  reintentarPendientes();
}

iniciar();
