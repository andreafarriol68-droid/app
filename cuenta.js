// Página "Mi cuenta": entrar, crear cuenta, recuperar contraseña y datos del usuario.

const $ = (sel) => document.querySelector(sel);
const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euros = (n) => Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });

const ESTADOS = {
  espera: "En lista de espera",
  pendiente: "Pendiente de pago",
  pagada: "Pagada · pendiente de confirmar",
  confirmada: "Plaza confirmada",
  cancelada: "Cancelada",
};

function avisar(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.classList.add("visible");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => a.classList.remove("visible"), 2600);
}

// Mensaje fijo arriba (p. ej. "revisa tu email")
function mensaje(html, tipo = "ok") {
  const m = $("#mensaje");
  m.hidden = !html;
  m.className = `mensaje mensaje-${tipo}`;
  m.innerHTML = html || "";
  if (html) m.focus();
}

function errorForm(form, texto) {
  const p = form.querySelector(".error-form");
  p.hidden = !texto;
  p.textContent = texto || "";
}

// Bloquea el botón mientras se espera la respuesta
async function ocupado(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  const texto = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<span class="girando" aria-hidden="true"></span> Un momento…`;
  try { await fn(); } finally { btn.disabled = false; btn.textContent = texto; }
}

function validar(form) {
  form.classList.add("validado");
  const malo = [...form.querySelectorAll("input:not([disabled])")].find((i) => !i.checkValidity());
  if (malo) { malo.focus(); errorForm(form, "Revisa los campos marcados."); return false; }
  errorForm(form, "");
  return true;
}

// ---------- Vistas ----------
function mostrar(id) {
  ["acceso", "nueva-clave", "mi-cuenta"].forEach((s) => ($("#" + s).hidden = s !== id));
}

function modoAcceso(modo) {
  mostrar("acceso");
  const formularios = { entrar: "#form-entrar", registro: "#form-registro", recuperar: "#form-recuperar" };
  Object.entries(formularios).forEach(([m, sel]) => ($(sel).hidden = m !== modo));
  document.querySelectorAll(".pestanas-mini button").forEach((b) => b.setAttribute("aria-selected", b.dataset.modo === modo));
  $(formularios[modo]).querySelector("input")?.focus();
}

// Si venía de la intranet (admin.html), se vuelve allí al entrar
const volver = new URLSearchParams(location.search).get("volver") === "admin" ? "admin.html" : null;

async function pintarCuenta() {
  const s = Supa.auth.sesion();
  if (!s) return modoAcceso("entrar");
  mostrar("mi-cuenta");
  const uid = s.user?.id;
  const [perfil, reservas] = await Promise.all([
    Supa.rest(`perfiles?select=usuario,nombre,telefono,rol&id=eq.${encodeURIComponent(uid)}`),
    Supa.rest("reservas?select=referencia,actividad,cuando,plazas,total,unidad,estado,creada&order=creada.desc&limit=50"),
  ]);
  if (!perfil.ok && perfil.status === 401) { await Supa.auth.salir(); return modoAcceso("entrar"); }
  const p = perfil.datos?.[0] || {};
  Supa.auth.recordarRol(p.rol || "");
  if (volver && p.rol === "admin") { location.replace(volver); return; }

  $("#cuenta-usuario").textContent = p.usuario ? `@${p.usuario}` : "";
  $("#cuenta-saludo").textContent = p.nombre ? `Hola, ${p.nombre.split(" ")[0]}` : "Mi cuenta";
  $("#ir-intranet").hidden = p.rol !== "admin";
  if (volver && p.rol !== "admin") mensaje("Tu cuenta no tiene permiso para entrar en la intranet. Si trabajas en la escuela, pide a la administración que te dé acceso.", "alerta");

  const f = $("#form-perfil");
  f.elements.email.value = s.user?.email || "";
  f.elements.nombre.value = p.nombre || "";
  f.elements.telefono.value = p.telefono || "";

  const lista = reservas.ok ? reservas.datos : [];
  $("#cuenta-reservas").innerHTML = lista.length
    ? lista.map((r) => `
      <div class="reserva">
        <div class="reserva-cab">
          <h3>${escapar(r.actividad)}</h3>
          <span class="chip estado-${escapar(r.estado)}">${escapar(ESTADOS[r.estado] || r.estado)}</span>
        </div>
        <p class="detalle">${escapar(r.cuando)} · ${r.plazas} plaza${r.plazas > 1 ? "s" : ""}${r.estado !== "espera" ? ` · ${euros(r.total)}${r.unidad ? " " + escapar(r.unidad) : ""}` : ""} · Ref. ${escapar(r.referencia)}</p>
      </div>`).join("")
    : `<div class="vacio"><p>${reservas.ok ? "Aún no tienes reservas hechas con esta cuenta." : escapar(reservas.error)}</p>
        <a class="btn btn-principal" href="./#cursos">Ver cursos y talleres</a></div>`;
}

// ---------- Formularios ----------
$("#form-entrar").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validar(f)) return;
  ocupado(f, async () => {
    const r = await Supa.auth.entrar(f.elements.identificador.value, f.elements.password.value);
    if (!r.ok) return errorForm(f, r.error);
    f.reset();
    mensaje("");
    await pintarCuenta();
  });
});

$("#form-registro").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  f.elements.usuario.value = f.elements.usuario.value.trim().toLowerCase();
  if (!validar(f)) return;
  ocupado(f, async () => {
    const usuario = f.elements.usuario.value;
    const libre = await Supa.rpc("usuario_libre", { p_usuario: usuario }, false);
    if (!libre.ok) return errorForm(f, libre.error);
    if (libre.datos === false) { f.elements.usuario.focus(); return errorForm(f, `El nombre de usuario «${usuario}» ya está cogido. Prueba con otro.`); }
    const r = await Supa.auth.registrar({
      email: f.elements.email.value.trim(), password: f.elements.password.value,
      usuario, nombre: f.elements.nombre.value.trim(),
    });
    if (!r.ok) return errorForm(f, r.error);
    const email = f.elements.email.value.trim();
    f.reset();
    f.classList.remove("validado");
    if (Supa.auth.sesion()) { await pintarCuenta(); avisar("¡Cuenta creada!"); return; }
    modoAcceso("entrar");
    mensaje(`<strong>Casi está.</strong> Te hemos enviado un email a <strong>${escapar(email)}</strong>. Pulsa el enlace que contiene para activar tu cuenta (si no lo ves, mira en spam).`);
  });
});

$("#form-recuperar").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validar(f)) return;
  ocupado(f, async () => {
    const r = await Supa.auth.recuperar(f.elements.email.value.trim());
    // Solo se avisa de fallos de conexión o de demasiados intentos:
    // por privacidad no se dice si ese email tiene cuenta o no
    if (!r.ok && (r.status === 0 || r.status === 429 || r.status >= 500)) return errorForm(f, r.error);
    modoAcceso("entrar");
    mensaje("Si ese email tiene una cuenta, te llegará en unos minutos un enlace para poner una contraseña nueva.");
  });
});

$("#form-nueva-clave").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validar(f)) return;
  ocupado(f, async () => {
    const r = await Supa.auth.cambiarClave(f.elements.password.value);
    if (!r.ok) return errorForm(f, r.error);
    f.reset();
    mensaje("Contraseña cambiada. Ya estás dentro.");
    await pintarCuenta();
  });
});

$("#form-cambiar-clave").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validar(f)) return;
  ocupado(f, async () => {
    const r = await Supa.auth.cambiarClave(f.elements.password.value);
    if (!r.ok) return errorForm(f, r.error);
    f.reset();
    f.classList.remove("validado");
    avisar("Contraseña cambiada ✓");
  });
});

$("#form-perfil").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validar(f)) return;
  ocupado(f, async () => {
    const uid = Supa.auth.sesion()?.user?.id;
    const r = await Supa.rest(`perfiles?id=eq.${encodeURIComponent(uid)}`, {
      metodo: "PATCH", cabeceras: { Prefer: "return=minimal" },
      cuerpo: { nombre: f.elements.nombre.value.trim(), telefono: f.elements.telefono.value.trim() },
    });
    if (!r.ok) return errorForm(f, r.error);
    avisar("Datos guardados ✓");
    pintarCuenta();
  });
});

$("#salir").addEventListener("click", async () => {
  await Supa.auth.salir();
  mensaje("");
  modoAcceso("entrar");
  avisar("Sesión cerrada");
});

$("#borrar-cuenta").addEventListener("click", async () => {
  if (!confirm("¿Seguro que quieres borrar tu cuenta? No se puede deshacer.")) return;
  const r = await Supa.rpc("borrar_mi_cuenta");
  if (!r.ok) return avisar(r.error);
  await Supa.auth.salir();
  modoAcceso("entrar");
  mensaje("Tu cuenta se ha borrado.");
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-modo]");
  if (!b) return;
  mensaje("");
  modoAcceso(b.dataset.modo);
});

// ---------- Inicio ----------
async function iniciar() {
  if (!Supa.activo) { $("#sin-configurar").hidden = false; return; }
  const enlace = await Supa.auth.desdeEnlace();
  if (enlace?.error) { mensaje(escapar(enlace.error), "alerta"); return modoAcceso("recuperar"); }
  if (enlace?.tipo === "recovery") { mostrar("nueva-clave"); $("#form-nueva-clave input").focus(); return; }
  if (enlace?.tipo === "signup") mensaje("¡Email confirmado! Tu cuenta ya está activa.");
  if (new URLSearchParams(location.search).get("modo") === "registro" && !Supa.auth.sesion()) return modoAcceso("registro");
  await pintarCuenta();
}
iniciar();
