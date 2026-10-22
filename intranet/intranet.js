// Intranet de la escuela: reservas, cursos y talleres, datos de la escuela y usuarios.
// Es una app aparte de la web pública (carpeta intranet/), con su propio inicio de sesión.
// Ojo: lo que se oculta aquí es solo para que la página sea cómoda. La seguridad de verdad
// está en la base de datos (reglas RLS de supabase/esquema.sql): sin rol "admin", Supabase
// no deja leer ni cambiar nada aunque alguien manipule esta página.

const $ = (sel) => document.querySelector(sel);
const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euros = (n) => Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });
const aFecha = (txt) => { const [a, m, d] = txt.split("-").map(Number); return new Date(a, m - 1, d); };
const fechaCorta = (txt) => aFecha(txt).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const momento = (iso) => iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const hoyClave = () => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`; };

const ESTADOS = {
  pendiente: "Pendiente de pago",
  pagada: "Pagada · por confirmar",
  confirmada: "Confirmada",
  espera: "Lista de espera",
  cancelada: "Cancelada",
};
// Fotos que ya están en la carpeta fotos/ (para sugerirlas al editar)
const FOTOS = ["alianzas", "anillo-plata", "aros", "boto", "cera", "engaste", "esmalte", "iniciacion", "martillado", "profesional"].map((f) => `fotos/${f}.jpg`);

const estado = { reservas: [], actividades: [], usuarios: [], yo: null, editando: null };

function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.classList.add("visible");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => a.classList.remove("visible"), 2800);
}

// Si la sesión ha caducado, a volver a entrar
function comprobar(r) {
  if (r.status === 401) { salir("Tu sesión ha caducado. Vuelve a entrar.", "alerta"); return false; }
  if (!r.ok) avisar(r.error);
  return r.ok;
}

function errorForm(form, texto) {
  const p = form.querySelector(".error-form");
  p.hidden = !texto;
  p.textContent = texto || "";
}

// ---------- Pestañas ----------
function mostrarSeccion(id) {
  document.querySelectorAll("#menu button").forEach((b) => b.setAttribute("aria-selected", b.dataset.seccion === id));
  document.querySelectorAll(".seccion").forEach((s) => (s.hidden = s.id !== id));
  history.replaceState(null, "", "#" + id);
  if (id === "usuarios" && !estado.usuarios.length) cargarUsuarios();
}

// ============================================================
//  RESERVAS
// ============================================================
async function cargarReservas() {
  const r = await Supa.rest("reservas?select=*&order=creada.desc&limit=1000");
  if (!comprobar(r)) return;
  estado.reservas = r.datos;
  pintarReservas();
}

const pasada = (r) => r.fecha_actividad && r.fecha_actividad < hoyClave();
const porAtender = (r) => !pasada(r) && ["pagada", "pendiente", "espera"].includes(r.estado);

function pintarReservas() {
  const filtro = $("#filtro-estado").value;
  const texto = $("#filtro-texto").value.trim().toLowerCase();
  const lista = estado.reservas
    .filter((r) => (filtro === "por-atender" ? porAtender(r) : !filtro || r.estado === filtro))
    .filter((r) => !texto || [r.nombre, r.email, r.telefono, r.referencia, r.actividad].join(" ").toLowerCase().includes(texto))
    // Primero lo que hay que hacer: pagadas por confirmar, luego pendientes, luego el resto
    .sort((a, b) => (["pagada", "pendiente", "espera"].indexOf(a.estado) + 1 || 9) - (["pagada", "pendiente", "espera"].indexOf(b.estado) + 1 || 9) || b.creada.localeCompare(a.creada));

  const cuenta = (e) => estado.reservas.filter((r) => r.estado === e && !pasada(r)).length;
  const porConfirmar = cuenta("pagada");
  $("#contador-reservas").hidden = !porConfirmar;
  $("#contador-reservas").textContent = porConfirmar;
  $("#resumen-reservas").innerHTML = [
    ["pagada", "pagadas por confirmar"], ["pendiente", "pendientes de pago"], ["espera", "en lista de espera"], ["confirmada", "confirmadas"],
  ].map(([e, t]) => `<button class="resumen-dato" data-filtrar="${e}"><strong>${cuenta(e)}</strong> ${t}</button>`).join("");

  $("#lista-reservas").innerHTML = lista.length
    ? lista.map(tarjetaReserva).join("")
    : `<p class="vacio">${estado.reservas.length ? "No hay reservas con este filtro." : "Todavía no ha llegado ninguna reserva."}</p>`;
}

function tarjetaReserva(r) {
  const ref = escapar(r.referencia);
  return `
    <article class="reserva ${pasada(r) ? "pasada" : ""}">
      <div class="reserva-cab">
        <h3>${escapar(r.actividad)}</h3>
        <span class="chip estado-${escapar(r.estado)}">${escapar(ESTADOS[r.estado] || r.estado)}</span>
      </div>
      <p class="detalle">${escapar(r.tipo || "")}${r.cuando ? " · " + escapar(r.cuando) : ""}${pasada(r) ? " · <strong>ya pasada</strong>" : ""}</p>
      <dl class="ficha">
        <div><dt>Alumno</dt><dd>${escapar(r.nombre)}${r.usuario_id ? ' <span class="chip chip-mini">con cuenta</span>' : ""}</dd></div>
        <div><dt>Contacto</dt><dd><a href="mailto:${escapar(r.email)}">${escapar(r.email)}</a> · <a href="tel:${escapar(r.telefono.replace(/\s/g, ""))}">${escapar(r.telefono)}</a></dd></div>
        <div><dt>Plazas</dt><dd>${r.plazas}</dd></div>
        <div><dt>Importe</dt><dd>${r.estado === "espera" ? "—" : euros(r.total) + (r.unidad ? " " + escapar(r.unidad) : "")}</dd></div>
        <div><dt>Concepto</dt><dd class="mono">${ref} ${escapar(r.nombre)}</dd></div>
        <div><dt>Recibida</dt><dd>${momento(r.creada)}</dd></div>
      </dl>
      <div class="acciones">
        <label class="en-linea">Estado
          <select data-estado-de="${ref}">
            ${Object.entries(ESTADOS).map(([v, t]) => `<option value="${v}" ${v === r.estado ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
        <a class="btn btn-secundario" href="${escapar(emailAlAlumno(r))}">Escribir al alumno</a>
        <button class="enlace-quitar" data-borrar-reserva="${ref}">Borrar</button>
      </div>
    </article>`;
}

// Email ya redactado según el estado. Repite siempre el IBAN (ver AUDITORIA-SEGURIDAD.md, A1)
function emailAlAlumno(r) {
  const b = ESCUELA.banco;
  const iban = String(b.iban).replace(/[\s.-]/g, "").toUpperCase().match(/.{1,4}/g).join(" ");
  const saludo = `Hola ${r.nombre.split(" ")[0]}:`;
  const firma = `\n\nUn saludo,\n${ESCUELA.nombre}\n${ESCUELA.telefono}`;
  const textos = {
    confirmada: [`Confirmamos tu plaza`, `${saludo}\n\nHemos recibido tu transferencia y tu plaza en «${r.actividad}» está confirmada.\n${r.cuando}\n\nReferencia: ${r.referencia}\nDónde: ${ESCUELA.direccion}`],
    pagada: [`Confirmamos tu plaza`, `${saludo}\n\nHemos recibido tu transferencia y tu plaza en «${r.actividad}» está confirmada.\n${r.cuando}\n\nReferencia: ${r.referencia}\nDónde: ${ESCUELA.direccion}`],
    pendiente: [`Tu reserva ${r.referencia}: falta la transferencia`, `${saludo}\n\nTenemos tu reserva para «${r.actividad}» (${r.cuando}), pero aún no nos ha llegado la transferencia.\n\nImporte: ${euros(r.total)}\nIBAN: ${iban} (${b.titular})\nConcepto: ${r.referencia} ${r.nombre}\n\nEste es el único IBAN de la escuela: si alguien te da otro, llámanos antes de pagar.`],
    espera: [`Se ha liberado una plaza`, `${saludo}\n\nSe ha liberado una plaza en «${r.actividad}» (${r.cuando}). Si todavía te interesa, contéstanos a este email o llámanos y te la reservamos.`],
    cancelada: [`Tu reserva ${r.referencia}`, `${saludo}\n\nTe escribimos sobre tu reserva para «${r.actividad}» (${r.cuando}).\n\n`],
  };
  const [asunto, cuerpo] = textos[r.estado] || textos.cancelada;
  return `mailto:${r.email}?subject=${encodeURIComponent(`${asunto} · ${ESCUELA.nombre}`)}&body=${encodeURIComponent(cuerpo + firma)}`;
}

async function cambiarEstadoReserva(ref, nuevo, select) {
  const r = estado.reservas.find((x) => x.referencia === ref);
  if (!r || r.estado === nuevo) return;
  if (nuevo === "cancelada" && !confirm(`¿Cancelar la reserva ${ref} de ${r.nombre}? Le saldrá como cancelada en su app.`)) { select.value = r.estado; return; }
  select.disabled = true;
  const resp = await Supa.rest(`reservas?referencia=eq.${encodeURIComponent(ref)}`, {
    metodo: "PATCH", cabeceras: { Prefer: "return=minimal" }, cuerpo: { estado: nuevo },
  });
  select.disabled = false;
  if (!comprobar(resp)) { select.value = r.estado; return; }
  r.estado = nuevo;
  pintarReservas();
  avisar(nuevo === "confirmada" ? "Plaza confirmada ✓ Escríbele para avisarle" : `Anotada como «${ESTADOS[nuevo]}»`);
}

async function borrarReserva(ref) {
  const r = estado.reservas.find((x) => x.referencia === ref);
  if (!r || !confirm(`¿Borrar del todo la reserva ${ref} de ${r.nombre}?\n\nSi solo quieres anularla, mejor ponla como «Cancelada»: así queda constancia.`)) return;
  const resp = await Supa.rest(`reservas?referencia=eq.${encodeURIComponent(ref)}`, { metodo: "DELETE" });
  if (!comprobar(resp)) return;
  estado.reservas = estado.reservas.filter((x) => x.referencia !== ref);
  pintarReservas();
  avisar("Reserva borrada");
}

// ============================================================
//  CURSOS Y TALLERES
// ============================================================
async function cargarActividades() {
  const r = await Supa.rest("actividades?select=*&order=orden.asc,fecha.asc.nullslast");
  if (!comprobar(r)) return;
  estado.actividades = r.datos.map(Supa.aActividad);
  pintarActividades();
}

function filaActividad(a) {
  const cuando = a.clase === "curso"
    ? (a.inicio ? `Empieza ${fechaCorta(a.inicio)}` : a.horario)
    : (a.fecha ? fechaCorta(a.fecha) + (a.otrasFechas.length ? ` (+${a.otrasFechas.length} día${a.otrasFechas.length > 1 ? "s" : ""})` : "") : "Fecha a convenir");
  const yaPaso = a.clase === "taller" && a.fecha && [a.fecha, ...a.otrasFechas].sort().at(-1) < hoyClave();
  return `
    <div class="fila ${a.visible ? "" : "oculta"}">
      ${a.foto ? `<img src="${escapar(new URL(a.foto, WEB_PUBLICA).href)}" alt="" width="64" height="48" loading="lazy">` : `<span class="sin-foto"></span>`}
      <div class="fila-info">
        <strong>${escapar(a.nombre)}</strong>
        <span class="detalle">${escapar(cuando || "")} · ${euros(a.precio)}${a.unidad ? " " + escapar(a.unidad) : ""} · ${a.plazas ? `${a.plazas} plaza${a.plazas > 1 ? "s" : ""} libre${a.plazas > 1 ? "s" : ""}` : "<strong>Completo</strong>"}</span>
      </div>
      <div class="fila-etiquetas">
        ${a.visible ? "" : '<span class="chip">Oculto</span>'}
        ${yaPaso ? '<span class="chip estado-pasada">Ya pasado</span>' : ""}
      </div>
      <div class="fila-acciones">
        <button class="btn btn-secundario" data-editar="${escapar(a.id)}">Editar</button>
        <button class="enlace-quitar" data-borrar-actividad="${escapar(a.id)}">Borrar</button>
      </div>
    </div>`;
}

function pintarActividades() {
  const de = (clase) => estado.actividades.filter((a) => a.clase === clase);
  $("#lista-cursos").innerHTML = de("curso").map(filaActividad).join("") || `<p class="vacio">No hay cursos.</p>`;
  $("#lista-talleres").innerHTML = de("taller").map(filaActividad).join("") || `<p class="vacio">No hay talleres.</p>`;
}

function abrirActividad(id, clase) {
  const a = id ? estado.actividades.find((x) => x.id === id) : null;
  estado.editando = a ? { id: a.id, clase: a.clase } : { id: null, clase };
  clase = estado.editando.clase;
  const f = $("#form-actividad");
  f.reset();
  f.classList.remove("validado");
  errorForm(f, "");
  const nombreClase = clase === "curso" ? "curso" : "taller";
  $("#actividad-etiqueta").textContent = a ? `Editar ${nombreClase}` : `Nuevo ${nombreClase}`;
  $("#actividad-titulo").textContent = a ? a.nombre : `Nuevo ${nombreClase}`;
  f.querySelectorAll("[data-solo]").forEach((fs) => {
    fs.hidden = fs.dataset.solo !== clase;
    fs.disabled = fs.dataset.solo !== clase; // los campos ocultos no se validan
  });
  const v = a || { visible: true, plazas: 6, orden: estado.actividades.filter((x) => x.clase === clase).length + 1, otrasFechas: [] };
  ["nombre", "descripcion", "precio", "unidad", "plazas", "estado", "tipo", "nivel", "duracion", "inicio", "horario", "fecha", "grupo", "hora", "textoPlazas", "foto", "fotoAlt", "orden"]
    .forEach((k) => { if (f.elements[k]) f.elements[k].value = v[k] ?? ""; });
  f.elements.otrasFechas.value = (v.otrasFechas || []).join(", ");
  f.elements.visible.checked = v.visible !== false;
  $("#fotos-disponibles").innerHTML = [...new Set([...FOTOS, ...estado.actividades.map((x) => x.foto).filter(Boolean)])]
    .map((x) => `<option value="${escapar(x)}"></option>`).join("");
  $("#dialogo-actividad").showModal();
  f.elements.nombre.focus();
}

// Identificador para una actividad nueva: a partir del nombre ("esmalte-al-fuego-7k2q")
function nuevoId(nombre) {
  const base = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "actividad";
  const azar = [...crypto.getRandomValues(new Uint8Array(4))].map((n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 31]).join("");
  return `${base}-${azar}`;
}

async function guardarActividad(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add("validado");
  const malo = [...f.querySelectorAll("input, textarea")].find((i) => !i.disabled && !i.checkValidity());
  if (malo) { malo.focus(); return errorForm(f, "Revisa los campos marcados."); }
  const val = (k) => f.elements[k].value.trim();
  const { id, clase } = estado.editando;
  const a = {
    id: id || nuevoId(val("nombre")), clase,
    nombre: val("nombre"), descripcion: val("descripcion"),
    precio: Number(val("precio")), unidad: val("unidad"), plazas: parseInt(val("plazas"), 10) || 0, estado: val("estado"),
    foto: val("foto"), fotoAlt: val("fotoAlt"), orden: parseInt(val("orden"), 10) || 0, visible: f.elements.visible.checked,
    tipo: val("tipo"), nivel: val("nivel"), duracion: val("duracion"), inicio: val("inicio"), horario: val("horario"),
    fecha: val("fecha"), hora: val("hora"), grupo: parseInt(val("grupo"), 10) || "", textoPlazas: val("textoPlazas"),
    otrasFechas: val("otrasFechas") ? val("otrasFechas").split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
  if (clase === "taller" && !a.fecha && a.otrasFechas.length) return errorForm(f, "Pon primero la fecha del primer día.");
  const fila = Supa.aFila(a);
  const btn = f.querySelector('button[type="submit"]');
  btn.disabled = true;
  const resp = id
    ? await Supa.rest(`actividades?id=eq.${encodeURIComponent(id)}`, { metodo: "PATCH", cabeceras: { Prefer: "return=minimal" }, cuerpo: fila })
    : await Supa.rest("actividades", { metodo: "POST", cabeceras: { Prefer: "return=minimal" }, cuerpo: fila });
  btn.disabled = false;
  if (resp.status === 401) return comprobar(resp);
  if (!resp.ok) return errorForm(f, resp.error);
  $("#dialogo-actividad").close();
  avisar(id ? "Cambios guardados ✓" : `${clase === "curso" ? "Curso" : "Taller"} creado ✓`);
  cargarActividades();
}

async function borrarActividad(id) {
  const a = estado.actividades.find((x) => x.id === id);
  if (!a || !confirm(`¿Borrar «${a.nombre}»?\n\nDesaparecerá de la web. Si solo quieres quitarla un tiempo, mejor edítala y desmarca «Publicado en la web».`)) return;
  const resp = await Supa.rest(`actividades?id=eq.${encodeURIComponent(id)}`, { metodo: "DELETE" });
  if (!comprobar(resp)) return;
  avisar("Borrado");
  cargarActividades();
}

// ============================================================
//  DATOS DE LA ESCUELA
// ============================================================
const CAMPOS_TEXTO = ["nombre", "subtitulo", "lema", "direccion", "comoLlegar", "telefono", "email", "plazoConfirmacion", "notaHorario"];

async function cargarEscuela() {
  const r = await Supa.rest("ajustes?select=datos&id=eq.1");
  if (!comprobar(r)) return;
  // Lo guardado en la base de datos manda; lo que falte sale de datos.js
  const e = { ...ESCUELA, ...Supa.limpiarEscuela(r.datos[0]?.datos) };
  // Los emails a los alumnos usan el nombre, teléfono y dirección al día (el IBAN sigue saliendo de config.js)
  ["nombre", "telefono", "direccion"].forEach((k) => (ESCUELA[k] = e[k] || ESCUELA[k]));
  const f = $("#form-escuela");
  CAMPOS_TEXTO.forEach((k) => (f.elements[k].value = e[k] || ""));
  f.elements.politicaCancelacion.value = (e.politicaCancelacion || []).join("\n");
  $("#campos-horario").innerHTML = e.horario.map((h, i) => `
    <label class="en-linea"><span class="dia">${escapar(h.dia)}</span>
      <input name="horas-${i}" data-dia="${escapar(h.dia)}" value="${escapar(h.horas)}" maxlength="80" placeholder="10:00 – 14:00 · 17:00 – 20:00, o Cerrado">
    </label>`).join("");
}

async function guardarEscuela(e) {
  e.preventDefault();
  const f = e.target;
  f.classList.add("validado");
  const malo = [...f.querySelectorAll("input, textarea")].find((i) => !i.checkValidity());
  if (malo) { malo.focus(); return errorForm(f, "Revisa los campos marcados."); }
  errorForm(f, "");
  const datos = {};
  CAMPOS_TEXTO.forEach((k) => (datos[k] = f.elements[k].value.trim()));
  datos.politicaCancelacion = f.elements.politicaCancelacion.value.split("\n").map((t) => t.trim()).filter(Boolean);
  datos.horario = [...f.querySelectorAll("[data-dia]")].map((i) => ({ dia: i.dataset.dia, horas: i.value.trim() || "Cerrado" }));
  const btn = f.querySelector('button[type="submit"]');
  btn.disabled = true;
  const r = await Supa.rest("ajustes?on_conflict=id", {
    metodo: "POST",
    cabeceras: { Prefer: "resolution=merge-duplicates,return=minimal" },
    cuerpo: { id: 1, datos, actualizado: new Date().toISOString() },
  });
  btn.disabled = false;
  if (r.status === 401) return comprobar(r);
  if (!r.ok) return errorForm(f, r.error);
  avisar("Datos de la escuela guardados ✓");
}

// ============================================================
//  USUARIOS
// ============================================================
async function cargarUsuarios() {
  $("#lista-usuarios").innerHTML = `<p class="cargando"><span class="girando" aria-hidden="true"></span> Cargando…</p>`;
  const r = await Supa.rpc("listar_usuarios");
  if (!comprobar(r)) return;
  estado.usuarios = r.datos;
  pintarUsuarios();
}

function pintarUsuarios() {
  const yo = estado.yo.id;
  $("#lista-usuarios").innerHTML = estado.usuarios.length
    ? `<div class="tabla-desliza"><table class="tabla">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Contacto</th><th>Alta</th><th>Último acceso</th><th>Rol</th></tr></thead>
        <tbody>${estado.usuarios.map((u) => `
          <tr>
            <td class="mono">@${escapar(u.usuario)}${u.id === yo ? " <small>(tú)</small>" : ""}</td>
            <td>${escapar(u.nombre) || "—"}</td>
            <td><a href="mailto:${escapar(u.email)}">${escapar(u.email)}</a>${u.telefono ? `<br><small>${escapar(u.telefono)}</small>` : ""}</td>
            <td>${momento(u.creado)}</td>
            <td>${momento(u.ultimo_acceso)}</td>
            <td><select data-rol-de="${escapar(u.id)}" aria-label="Rol de ${escapar(u.usuario)}" ${u.id === yo ? "disabled" : ""}>
              <option value="alumno" ${u.rol === "alumno" ? "selected" : ""}>Alumno</option>
              <option value="admin" ${u.rol === "admin" ? "selected" : ""}>Administración</option>
            </select></td>
          </tr>`).join("")}</tbody></table></div>`
    : `<p class="vacio">Todavía no hay nadie registrado.</p>`;
}

async function cambiarRol(id, rol, select) {
  const u = estado.usuarios.find((x) => x.id === id);
  const pregunta = rol === "admin"
    ? `¿Dar acceso de administración a @${u.usuario}? Podrá ver todas las reservas y datos de los alumnos y cambiar la web.`
    : `¿Quitar el acceso de administración a @${u.usuario}?`;
  if (!confirm(pregunta)) { select.value = u.rol; return; }
  const r = await Supa.rpc("cambiar_rol", { p_id: id, p_rol: rol });
  if (!comprobar(r)) { select.value = u.rol; return; }
  u.rol = rol;
  avisar("Rol cambiado ✓");
}

// ============================================================
//  INICIO
// ============================================================
function sinAcceso(html) {
  $("#cargando").hidden = true;
  const s = $("#sin-acceso");
  s.hidden = false;
  s.innerHTML = html;
}

// ---------- Acceso (la intranet tiene su propio inicio de sesión) ----------
function mensaje(texto, tipo = "ok") {
  const m = $("#mensaje");
  m.hidden = !texto;
  m.className = `mensaje mensaje-${tipo}`;
  m.textContent = texto || "";
}

function mostrarAcceso(modo = "entrar", aviso = "", tipo = "alerta") {
  $("#cargando").hidden = true;
  $("#sin-acceso").hidden = true;
  $("#menu").hidden = true;
  $("#cabecera-usuario").hidden = true;
  document.querySelectorAll(".seccion").forEach((s) => (s.hidden = true));
  $("#acceso").hidden = false;
  const formularios = { entrar: "#form-entrar", recuperar: "#form-recuperar", nueva: "#form-nueva-clave" };
  Object.entries(formularios).forEach(([m, sel]) => ($(sel).hidden = m !== modo));
  mensaje(aviso, tipo);
  $(formularios[modo]).querySelector("input").focus();
}

async function enviarFormulario(form, fn) {
  form.classList.add("validado");
  const malo = [...form.querySelectorAll("input")].find((i) => !i.checkValidity());
  if (malo) { malo.focus(); return errorForm(form, "Revisa los campos marcados."); }
  errorForm(form, "");
  const btn = form.querySelector('button[type="submit"]');
  const texto = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<span class="girando" aria-hidden="true"></span> Un momento…`;
  try { await fn(); } finally { btn.disabled = false; btn.textContent = texto; }
}

$("#form-entrar").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  enviarFormulario(f, async () => {
    const r = await Supa.auth.entrar(f.elements.identificador.value, f.elements.password.value);
    if (!r.ok) return errorForm(f, r.error);
    f.reset();
    f.classList.remove("validado");
    await abrirPanel();
  });
});

$("#form-recuperar").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  enviarFormulario(f, async () => {
    const r = await Supa.auth.recuperar(f.elements.email.value.trim());
    // Por privacidad no se dice si ese email tiene cuenta: solo se avisa de fallos de conexión o de demasiados intentos
    if (!r.ok && (r.status === 0 || r.status === 429 || r.status >= 500)) return errorForm(f, r.error);
    f.reset();
    mostrarAcceso("entrar", "Si ese email tiene una cuenta, te llegará en unos minutos un enlace para poner una contraseña nueva.", "ok");
  });
});

$("#form-nueva-clave").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  enviarFormulario(f, async () => {
    const r = await Supa.auth.cambiarClave(f.elements.password.value);
    if (!r.ok) return errorForm(f, r.error);
    f.reset();
    await abrirPanel();
    avisar("Contraseña cambiada ✓");
  });
});

$("#acceso").addEventListener("click", (e) => {
  const b = e.target.closest("[data-modo]");
  if (b) mostrarAcceso(b.dataset.modo);
});

async function salir(aviso = "", tipo = "ok") {
  await Supa.auth.salir();
  estado.reservas = []; estado.actividades = []; estado.usuarios = []; estado.yo = null;
  clearTimeout(temporizador);
  // Que no quede nada de datos de alumnos en la página tras salir
  ["#lista-reservas", "#resumen-reservas", "#lista-cursos", "#lista-talleres", "#lista-usuarios", "#campos-horario"].forEach((s) => ($(s).innerHTML = ""));
  $("#form-escuela").reset();
  if ($("#dialogo-actividad").open) $("#dialogo-actividad").close();
  mostrarAcceso("entrar", aviso, tipo);
}

// Cierre automático tras un rato sin usarla (por si se queda abierta en un ordenador compartido)
let temporizador;
function vigilarInactividad() {
  clearTimeout(temporizador);
  if (!estado.yo) return;
  temporizador = setTimeout(() => salir("Se ha cerrado la sesión tras un rato sin usar la intranet.", "alerta"), MINUTOS_INACTIVIDAD * 60_000);
}
["click", "keydown", "scroll"].forEach((ev) => document.addEventListener(ev, vigilarInactividad, { passive: true }));

// Comprueba que la sesión es de administración y enseña el panel
async function abrirPanel() {
  const s = Supa.auth.sesion();
  if (!s) return mostrarAcceso("entrar");
  $("#acceso").hidden = true;
  $("#cargando").hidden = false;
  const r = await Supa.rest(`perfiles?select=id,usuario,nombre,rol&id=eq.${encodeURIComponent(s.user?.id)}`);
  if (r.status === 401) return salir("Tu sesión ha caducado. Vuelve a entrar.", "alerta");
  if (!r.ok) {
    return sinAcceso(`<h2>No se ha podido comprobar tu acceso</h2><p>${escapar(r.error)}</p><p><button class="btn btn-secundario" id="reintentar">Reintentar</button></p>`);
  }
  const yo = r.datos[0];
  if (!yo || yo.rol !== "admin") {
    return salir("Esta cuenta no tiene acceso a la intranet. Si trabajas en la escuela, pide a quien la gestiona que te dé el rol de administración.", "alerta");
  }
  estado.yo = yo;
  Supa.auth.recordarRol("admin");
  $("#cargando").hidden = true;
  $("#sin-acceso").hidden = true;
  $("#menu").hidden = false;
  $("#cabecera-usuario").hidden = false;
  $("#admin-nombre").textContent = `@${yo.usuario}`;
  vigilarInactividad();

  const inicial = location.hash.slice(1);
  mostrarSeccion(["reservas", "actividades", "escuela", "usuarios"].includes(inicial) ? inicial : "reservas");
  await Promise.all([cargarReservas(), cargarActividades(), cargarEscuela()]);
}

async function iniciar() {
  $("#ver-web").href = WEB_PUBLICA;
  if (!Supa.activo) {
    return sinAcceso(`<h2>Falta conectar Supabase</h2><p>Pon la clave pública en <code>config.js</code> (<code>SUPABASE.clave</code>) y ejecuta <code>supabase/esquema.sql</code> en el SQL Editor de Supabase. Los pasos están en el README.</p>`);
  }
  // Vuelta desde el email de "nueva contraseña"
  const enlace = await Supa.auth.desdeEnlace();
  if (enlace?.error) return mostrarAcceso("recuperar", enlace.error);
  if (enlace?.tipo === "recovery") return mostrarAcceso("nueva");
  await abrirPanel();
}

// ---------- Eventos ----------
document.querySelectorAll("#menu button").forEach((b) => b.addEventListener("click", () => mostrarSeccion(b.dataset.seccion)));
$("#filtro-estado").addEventListener("change", pintarReservas);
$("#filtro-texto").addEventListener("input", pintarReservas);
$("#recargar-reservas").addEventListener("click", async () => { await cargarReservas(); avisar("Actualizado"); });
$("#form-actividad").addEventListener("submit", guardarActividad);
$("#form-escuela").addEventListener("submit", guardarEscuela);
$("#dialogo-actividad").addEventListener("click", (e) => { if (e.target === $("#dialogo-actividad")) $("#dialogo-actividad").close(); });
$("#salir").addEventListener("click", () => salir("Has salido de la intranet."));
$("#sin-acceso").addEventListener("click", (e) => { if (e.target.id === "reintentar") abrirPanel(); });

document.addEventListener("change", (e) => {
  const d = e.target.dataset;
  if (d.estadoDe) cambiarEstadoReserva(d.estadoDe, e.target.value, e.target);
  else if (d.rolDe) cambiarRol(d.rolDe, e.target.value, e.target);
});

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-filtrar],[data-nueva],[data-editar],[data-borrar-actividad],[data-borrar-reserva],.cerrar,.cerrar-dialogo");
  if (!el) return;
  const d = el.dataset;
  if (d.filtrar) { $("#filtro-estado").value = d.filtrar; $("#filtro-texto").value = ""; pintarReservas(); }
  else if (d.nueva) abrirActividad(null, d.nueva);
  else if (d.editar) abrirActividad(d.editar);
  else if (d.borrarActividad) borrarActividad(d.borrarActividad);
  else if (d.borrarReserva) borrarReserva(d.borrarReserva);
  else $("#dialogo-actividad").close();
});

iniciar();
