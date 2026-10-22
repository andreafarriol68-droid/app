// Conexión con Supabase: cuentas de usuario, intranet, reservas y contenido de la web.
// Sin librerías: habla directamente con la API de Supabase (así la web sigue cargando
// solo archivos propios). La dirección y la clave pública están en datos.js (SUPABASE).

const Supa = (() => {
  const cfg = typeof SUPABASE === "object" && SUPABASE ? SUPABASE : {};
  const base = String(cfg.url || "").replace(/\/+$/, "");
  const clave = String(cfg.clave || "");
  const activo = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && !!clave;
  // Las claves antiguas ("anon") son JWT y van también en Authorization; las nuevas ("publishable") no
  const claveJwt = clave.startsWith("eyJ");

  // ---------- Sesión (guardada en este dispositivo) ----------
  const CLAVE_SESION = "sesion";
  let sesion = leerSesion();
  function leerSesion() {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE_SESION));
      return s && typeof s.access_token === "string" && typeof s.refresh_token === "string" ? s : null;
    } catch { return null; }
  }
  function guardarSesion(s) {
    sesion = s && s.access_token
      ? {
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_at: Number(s.expires_at) || Math.floor(Date.now() / 1000) + (Number(s.expires_in) || 3600),
          user: s.user || sesion?.user || null,
          rol: s.rol || sesion?.rol || "",
        }
      : null;
    try { sesion ? localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)) : localStorage.removeItem(CLAVE_SESION); } catch {}
  }

  // Renueva el token si está a punto de caducar (una sola renovación a la vez)
  let renovando = null;
  async function tokenValido() {
    if (!sesion) return null;
    if (sesion.expires_at - 60 > Date.now() / 1000) return sesion.access_token;
    renovando ||= (async () => {
      const r = await llamar("/auth/v1/token?grant_type=refresh_token", {
        metodo: "POST", cuerpo: { refresh_token: sesion.refresh_token }, conSesion: false,
      });
      if (r.ok) guardarSesion(r.datos);
      else if (r.status >= 400 && r.status < 500) guardarSesion(null); // sesión caducada o cerrada en otro sitio
    })().finally(() => (renovando = null));
    await renovando;
    return sesion?.access_token || null;
  }

  // ---------- Peticiones ----------
  async function llamar(ruta, { metodo = "GET", cuerpo, cabeceras = {}, conSesion = true, tiempo = 12000 } = {}) {
    if (!activo) return { ok: false, status: 0, error: "La conexión con Supabase no está configurada." };
    const token = conSesion ? await tokenValido() : null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), tiempo);
    try {
      const resp = await fetch(base + ruta, {
        method: metodo,
        headers: {
          apikey: clave,
          ...(token ? { Authorization: `Bearer ${token}` } : claveJwt ? { Authorization: `Bearer ${clave}` } : {}),
          ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
          ...cabeceras,
        },
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        signal: ctrl.signal,
      });
      const texto = await resp.text();
      let datos = null;
      try { datos = texto ? JSON.parse(texto) : null; } catch {}
      return resp.ok
        ? { ok: true, status: resp.status, datos }
        : { ok: false, status: resp.status, datos, error: traducir(datos, resp.status) };
    } catch {
      return { ok: false, status: 0, error: "No hay conexión. Inténtalo de nuevo en un momento." };
    } finally {
      clearTimeout(t);
    }
  }

  // Mensajes de error de Supabase, en castellano
  function traducir(d, status) {
    const txt = [d?.error_code, d?.code, d?.msg, d?.message, d?.error, d?.error_description].filter(Boolean).join(" ");
    const reglas = [
      [/invalid_credentials|invalid login credentials|invalid_grant/i, "Usuario o contraseña incorrectos."],
      [/email_not_confirmed|email not confirmed/i, "Aún no has confirmado tu email: busca el correo que te enviamos (mira también en spam)."],
      [/user_already_exists|already registered/i, "Ya hay una cuenta con ese email. Prueba a entrar o a recuperar la contraseña."],
      [/weak_password|password should/i, "La contraseña es demasiado débil: usa al menos 8 caracteres mezclando letras y números."],
      [/same_password|should be different/i, "La contraseña nueva tiene que ser distinta de la anterior."],
      [/rate.?limit|too many|over_/i, "Demasiados intentos seguidos. Espera unos minutos."],
      [/signup.*disabled|signups not allowed/i, "El registro de cuentas está desactivado ahora mismo."],
      [/saving new user|23505|duplicate/i, "Eso ya existe (¿nombre de usuario cogido?)."],
      [/42501|permission denied|row-level security|administradores/i, "No tienes permiso para hacer esto."],
      [/demasiadas reservas/i, "Demasiadas reservas seguidas con este email. Espera un rato o llama a la escuela."],
      [/jwt expired|invalid jwt|bad_jwt/i, "Tu sesión ha caducado. Vuelve a entrar."],
    ];
    const r = reglas.find(([re]) => re.test(txt));
    return r ? r[1] : `Algo ha fallado (${status || "sin respuesta"}). Inténtalo de nuevo.`;
  }

  const rest = (ruta, opciones) => llamar("/rest/v1/" + ruta, opciones);
  const rpc = (nombre, args = {}, conSesion = true) => llamar(`/rest/v1/rpc/${nombre}`, { metodo: "POST", cuerpo: args, conSesion });

  // Adónde vuelve el usuario al pulsar el enlace del email (confirmar cuenta, nueva contraseña)
  const paginaCuenta = () => new URL("cuenta.html", location.href).href;

  // ---------- Cuentas ----------
  const auth = {
    async registrar({ email, password, usuario, nombre }) {
      const r = await llamar(`/auth/v1/signup?redirect_to=${encodeURIComponent(paginaCuenta())}`, {
        metodo: "POST", cuerpo: { email, password, data: { usuario, nombre } }, conSesion: false,
      });
      if (r.ok && r.datos?.access_token) guardarSesion(r.datos);
      return r; // sin access_token = hay que confirmar el email primero
    },
    // Se puede entrar con el email o con el nombre de usuario
    async entrar(identificador, password) {
      let email = identificador.trim();
      if (!email.includes("@")) {
        const r = await rpc("email_de_usuario", { p_usuario: email.toLowerCase() }, false);
        if (!r.ok) return r;
        if (!r.datos) return { ok: false, error: "Usuario o contraseña incorrectos." };
        email = r.datos;
      }
      const r = await llamar("/auth/v1/token?grant_type=password", {
        metodo: "POST", cuerpo: { email, password }, conSesion: false,
      });
      if (r.ok) guardarSesion(r.datos);
      return r;
    },
    async salir() {
      if (sesion) await llamar("/auth/v1/logout", { metodo: "POST" });
      guardarSesion(null);
    },
    recuperar: (email) => llamar(`/auth/v1/recover?redirect_to=${encodeURIComponent(paginaCuenta())}`, {
      metodo: "POST", cuerpo: { email }, conSesion: false,
    }),
    async cambiarClave(password) {
      const r = await llamar("/auth/v1/user", { metodo: "PUT", cuerpo: { password } });
      if (r.ok && sesion) guardarSesion({ ...sesion, user: r.datos });
      return r;
    },
    // Al volver desde el enlace del email, Supabase deja la sesión en la URL (#access_token=…)
    async desdeEnlace() {
      const h = new URLSearchParams(location.hash.slice(1));
      if (!h.has("access_token") && !h.has("error_description")) return null;
      history.replaceState(null, "", location.pathname + location.search);
      if (h.has("error_description")) return { error: "El enlace no es válido o ha caducado. Pide uno nuevo." };
      guardarSesion({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: h.get("expires_in") });
      const u = await llamar("/auth/v1/user");
      if (!u.ok) { guardarSesion(null); return { error: u.error }; }
      guardarSesion({ ...sesion, user: u.datos });
      return { tipo: h.get("type") || "" };
    },
    sesion: () => sesion,
    recordarRol(rol) { if (sesion) guardarSesion({ ...sesion, rol }); },
  };

  // ---------- Contenido de la web (cursos, talleres y textos de la escuela) ----------
  // Solo se aceptan estos campos de la escuela desde la base de datos.
  // El IBAN y los datos legales NO: se cambian solo en datos.js (ver AUDITORIA-SEGURIDAD.md, A1).
  const CAMPOS_ESCUELA = ["nombre", "subtitulo", "lema", "direccion", "comoLlegar", "telefono", "email", "plazoConfirmacion", "notaHorario"];
  const texto = (v) => (typeof v === "string" ? v : "");
  const fecha = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  function limpiarEscuela(d) {
    if (!d || typeof d !== "object") return {};
    const e = {};
    CAMPOS_ESCUELA.forEach((k) => { if (typeof d[k] === "string" && d[k].trim()) e[k] = d[k]; });
    if (Array.isArray(d.politicaCancelacion)) e.politicaCancelacion = d.politicaCancelacion.filter((t) => typeof t === "string" && t.trim());
    if (Array.isArray(d.horario) && d.horario.length === 7 && d.horario.every((h) => typeof h?.dia === "string" && typeof h?.horas === "string")) {
      e.horario = d.horario.map((h) => ({ dia: h.dia, horas: h.horas }));
    }
    return e;
  }

  // Fila de la tabla "actividades" → objeto como los de datos.js
  function aActividad(f) {
    const a = {
      id: texto(f.id), clase: f.clase, nombre: texto(f.nombre), descripcion: texto(f.descripcion),
      foto: /^fotos\/[\w.-]+$/.test(f.foto) ? f.foto : "", fotoAlt: texto(f.foto_alt),
      precio: Number(f.precio) || 0, unidad: texto(f.unidad),
      plazas: Math.max(parseInt(f.plazas, 10) || 0, 0), estado: texto(f.estado),
      visible: f.visible !== false, orden: parseInt(f.orden, 10) || 0,
    };
    if (f.clase === "curso") {
      Object.assign(a, { tipo: texto(f.tipo), nivel: texto(f.nivel), duracion: texto(f.duracion), horario: texto(f.horario), inicio: fecha(f.inicio) });
    } else {
      Object.assign(a, {
        fecha: fecha(f.fecha), otrasFechas: (Array.isArray(f.otras_fechas) ? f.otras_fechas : []).map(fecha).filter(Boolean),
        hora: texto(f.hora), grupo: parseInt(f.grupo, 10) || undefined, textoPlazas: texto(f.texto_plazas),
      });
    }
    return a;
  }

  // Objeto de actividad → fila para guardar en la tabla
  function aFila(a) {
    const nulo = (v) => (v === "" || v === undefined ? null : v);
    const f = {
      id: a.id, clase: a.clase, nombre: a.nombre, descripcion: a.descripcion || "",
      foto: nulo(a.foto), foto_alt: nulo(a.fotoAlt), precio: a.precio, unidad: nulo(a.unidad),
      plazas: a.plazas, estado: nulo(a.estado), visible: a.visible !== false, orden: a.orden || 0,
      tipo: null, nivel: null, duracion: null, horario: null, inicio: null,
      fecha: null, otras_fechas: [], hora: null, grupo: null, texto_plazas: null,
    };
    if (a.clase === "curso") Object.assign(f, { tipo: nulo(a.tipo), nivel: nulo(a.nivel), duracion: nulo(a.duracion), horario: nulo(a.horario), inicio: nulo(a.inicio) });
    else Object.assign(f, { fecha: nulo(a.fecha), otras_fechas: a.otrasFechas || [], hora: nulo(a.hora), grupo: nulo(a.grupo), texto_plazas: nulo(a.textoPlazas) });
    return f;
  }

  // Convierte lo descargado (o lo guardado en el dispositivo) en { escuela, cursos, talleres }
  function interpretar(bruto) {
    if (!bruto || !Array.isArray(bruto.actividades) || !bruto.ajustes) return null;
    const lista = bruto.actividades.filter((f) => f && /^[a-z0-9-]{1,40}$/.test(f.id) && f.visible !== false).map(aActividad);
    const orden = (a, b) => a.orden - b.orden;
    return {
      escuela: limpiarEscuela(bruto.ajustes),
      cursos: lista.filter((a) => a.clase === "curso").sort(orden),
      talleres: lista.filter((a) => a.clase === "taller").sort(orden),
    };
  }

  // Descarga el contenido público. Siempre sin sesión: se ve lo mismo que un visitante.
  async function descargarContenido() {
    const [aj, act] = await Promise.all([
      rest("ajustes?select=datos&id=eq.1", { conSesion: false }),
      rest("actividades?select=*&visible=is.true&order=orden.asc", { conSesion: false }),
    ]);
    // Sin la fila de ajustes = la base de datos aún no está preparada: se usa datos.js
    if (!aj.ok || !act.ok || !Array.isArray(aj.datos) || !aj.datos.length) return null;
    return { ajustes: aj.datos[0].datos, actividades: act.datos };
  }

  return { activo, auth, rest, rpc, aActividad, aFila, limpiarEscuela, interpretar, descargarContenido };
})();
