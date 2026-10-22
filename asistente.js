// Asistente sin IA: responde dudas con los datos de la web (datos.js o lo que
// haya cargado la intranet). No necesita Supabase ni internet y no envía nada:
// todo se calcula en el propio navegador. chat.js lo usa cuando no hay
// Supabase, cuando no hay conexión o si el asistente con Claude falla.
//
// Para que entienda una palabra nueva, añádela a la lista de su tema en TEMAS.

const Asistente = (() => {
  const quitarTildes = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const palabras = (t) => quitarTildes(t).replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter(Boolean);

  // Temas que reconoce. Cada palabra vale si la pregunta tiene una palabra que empieza así.
  const TEMAS = {
    saludo: ["hola", "buenas", "buenos", "hey", "ola"],
    gracias: ["gracias", "genial", "perfecto", "adios", "hasta luego", "chao"],
    horario: ["horario", "hora", "abri", "abre", "abiert", "cerra", "cierra", "hoy", "manana", "domingo", "festivo"],
    donde: ["donde", "direccion", "llegar", "ubica", "calle", "mapa", "aparca", "parking", "palma"],
    contacto: ["telefono", "llamar", "llamo", "email", "correo", "contact", "whatsapp", "escribir"],
    reservar: ["reserv", "apunt", "inscrib", "matricul", "aparta"],
    pago: ["pag", "transferencia", "iban", "numero de cuenta", "bizum", "tarjeta de credito", "con tarjeta", "efectivo", "banco"],
    cancelar: ["cancel", "devol", "devuel", "reembols", "cambiar", "cambio", "anular", "no puedo ir"],
    espera: ["espera", "complet", "lleno", "agotad"],
    precio: ["precio", "cuesta", "cuanto", "vale", "cobr", "euros", "barato", "caro", "tarifa"],
    plazas: ["plaza", "quedan", "hueco", "sitio", "libre", "disponib", "grupo"],
    fecha: ["fecha", "cuando", "empieza", "comienza", "dia", "proxim", "calendario", "semana", "mes", "sabado"],
    empezar: ["empez", "princip", "nunca", "inicia", "novat", "experiencia", "recomien", "aconsej", "primera", "nivel", "base", "facil"],
    cursos: ["curso", "clase", "trimestr", "anual", "aprender"],
    talleres: ["taller", "monografic", "finde", "fin de semana", "puntual"],
    regalo: ["regal", "navidad", "cumple", "sorpresa", "vale regalo", "tarjeta regalo"],
    boda: ["boda", "alianza", "pareja", "casar", "novi", "compromiso"],
    material: ["material", "herramient", "traer", "llevar", "incluid", "ropa"],
    ninos: ["nino", "nina", "hijo", "hija", "edad", "menor", "infantil", "anos"],
    particular: ["particular", "privad", "individual", "empresa", "grupo cerrado", "despedida"],
    reparar: ["repar", "arregl", "encarg", "medida", "tienda", "comprar", "vend"],
  };

  // Palabras de los nombres de las actividades que no sirven para distinguirlas
  const COMUNES = new Set(["joyeria", "plata", "curso", "taller", "para", "sobre", "una", "manana", "vuestras", "haz", "tu",
    "metal", "los", "las", "del", "con", "por", "el", "la", "de", "en", "y", "al", "regalar", "regalo", "boda"]);

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  let ultima = null; // la última actividad de la que se habló, para "¿y cuánto cuesta?"

  const tiene = (texto, lista) => {
    const ps = palabras(texto);
    const plano = ps.join(" ");
    return lista.some((k) => (k.includes(" ") ? plano.includes(k) : ps.some((p) => p.startsWith(k))));
  };

  // ---------- Datos ----------
  const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const aFecha = (s) => (s ? new Date(s + "T12:00:00") : null);
  const fechaLarga = (s) => aFecha(s).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const euros = (n) => `${Number(n).toLocaleString("es-ES")} €`;
  const ultimoDia = (t) => [t.fecha, ...(t.otrasFechas || [])].filter(Boolean).sort().pop();

  function actividades() {
    const cursos = (typeof CURSOS !== "undefined" ? CURSOS : []).map((a) => ({ ...a, clase: "curso" }));
    const talleres = (typeof TALLERES !== "undefined" ? TALLERES : []).map((a) => ({ ...a, clase: "taller" }));
    return [...cursos, ...talleres];
  }
  const talleresProximos = () => actividades()
    .filter((a) => a.clase === "taller" && a.fecha && aFecha(ultimoDia(a)) >= hoy())
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Busca de qué actividad se habla comparando con las palabras de su nombre
  function buscarActividad(pregunta) {
    const ps = palabras(pregunta).filter((p) => p.length >= 3 && !COMUNES.has(p));
    let mejores = [], max = 0;
    for (const a of actividades()) {
      const claves = palabras(a.nombre).filter((p) => p.length >= 3 && !COMUNES.has(p));
      const puntos = claves.filter((k) => ps.some((p) => p.startsWith(k.slice(0, Math.max(4, k.length - 2))))).length;
      if (puntos > max) { max = puntos; mejores = [a]; } else if (puntos && puntos === max) mejores.push(a);
    }
    return mejores;
  }

  // ---------- Frases ----------
  function precioDe(a) {
    return a.precio != null ? `${euros(a.precio)}${a.unidad ? " " + a.unidad : ""}` : "consúltanos el precio";
  }
  function plazasDe(a) {
    if (a.plazas === 0) return "Está **completo**: puedes apuntarte a la lista de espera desde el botón Reservar.";
    if (a.plazas == null) return "";
    const que = (a.textoPlazas || "plazas").toLowerCase();
    return a.plazas === 1 ? `Queda **1 ${que.replace(/s$/, "")}** libre.` : `Quedan **${a.plazas} ${que}** libres.`;
  }
  function cuandoDe(a) {
    if (a.clase === "curso") {
      const inicio = a.inicio ? `Empieza el ${fechaLarga(a.inicio)}` : "Matrícula abierta (pregúntanos cuándo puedes incorporarte)";
      return `${inicio}${a.horario ? ` · ${a.horario}` : ""}.`;
    }
    if (!a.fecha) return `${a.hora || "Fecha a convenir"}: escríbenos y buscamos el día.`;
    const dias = [a.fecha, ...(a.otrasFechas || [])].map(fechaLarga).join(" y ");
    return `${dias.charAt(0).toUpperCase() + dias.slice(1)}${a.hora ? ` (${a.hora})` : ""}.`;
  }
  function ficha(a) {
    const lineas = [`**${a.nombre}**${a.tipo ? ` · ${a.tipo}` : a.clase === "taller" ? " · Taller" : ""}`];
    if (a.descripcion) lineas.push(a.descripcion);
    const datos = [];
    if (a.nivel) datos.push(`Nivel: ${a.nivel.replace(/^nivel /i, "")}`);
    if (a.duracion) datos.push(`Duración: ${a.duracion}`);
    datos.push(`Cuándo: ${cuandoDe(a)}`);
    datos.push(`Precio: ${precioDe(a)}`);
    lineas.push(datos.map((d) => `- ${d}`).join("\n"));
    const p = plazasDe(a);
    if (p) lineas.push(p);
    lineas.push(`Para apuntarte: pestaña **${a.clase === "curso" ? "Cursos" : "Talleres"}** → botón **Reservar**.`);
    return lineas.join("\n");
  }
  const lineaCorta = (a, fecha = a.fecha) => `- **${a.nombre}**: ${a.clase === "taller" && fecha ? fechaLarga(fecha) + " · " : ""}${precioDe(a)}${a.plazas === 0 ? " (completo)" : ""}`;
  const contacto = () => `Llámanos al **${ESCUELA.telefono}** o escribe a **${ESCUELA.email}**.`;

  function horarioHoy() {
    const ahora = new Date();
    const dia = (ESCUELA.horario || [])[(ahora.getDay() + 6) % 7];
    if (!dia) return "";
    const min = ahora.getHours() * 60 + ahora.getMinutes();
    const tramos = [...dia.horas.matchAll(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/g)]
      .map((m) => [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]]);
    const abierto = tramos.some(([a, b]) => min >= a && min < b);
    return abierto ? `Ahora mismo estamos **abiertos** (hoy ${dia.horas}).`
      : tramos.length ? `Ahora mismo está **cerrado**. Hoy ${dia.dia.toLowerCase()}: ${dia.horas}.` : `Hoy ${dia.dia.toLowerCase()} está **cerrado**.`;
  }

  // ---------- Respuestas por tema ----------
  const R = {
    saludo: () => `¡Hola! Soy el asistente de ${ESCUELA.nombre}. Te puedo contar qué cursos y talleres hay, precios, fechas, el horario y cómo reservar. ¿Qué te gustaría saber?`,
    gracias: () => `¡A ti! Si te surge cualquier otra duda, aquí estoy. ${contacto()}`,
    horario: () => [horarioHoy(), (ESCUELA.horario || []).map((h) => `- ${h.dia}: ${h.horas}`).join("\n"), ESCUELA.notaHorario].filter(Boolean).join("\n"),
    donde: (t) => [`Estamos en **${ESCUELA.direccion}**.`, ESCUELA.comoLlegar,
      tiene(t, ["aparca", "parking", "coche", "moto"]) ? `No tengo información de aparcamiento cerca; si quieres, pregúntanos: ${contacto()}` : "En la pestaña **Horario** tienes la dirección y el horario de apertura."]
      .filter(Boolean).join("\n"),
    contacto: () => `${contacto()}\nTambién puedes pasarte por ${ESCUELA.direccion} en horario de apertura.`,
    reservar: () => {
      const b = ESCUELA.banco || {};
      return [
        "Reservar es muy fácil, desde esta misma web:",
        "1. Abre la pestaña **Cursos** o **Talleres** y elige la actividad.",
        "2. Pulsa **Reservar** y rellena el formulario.",
        `3. Al enviarlo, la web te da los datos para pagar por transferencia${b.plazoDias ? ` (tienes ${b.plazoDias} días)` : ""}.`,
        `4. Cuando la recibimos, te confirmamos la plaza${ESCUELA.plazoConfirmacion ? ` en unas ${ESCUELA.plazoConfirmacion}` : ""}.`,
        "En **Mis reservas** puedes ver las que has hecho.",
      ].join("\n");
    },
    pago: () => [
      `El pago es por **transferencia bancaria**. Los datos te aparecen en la web al terminar la reserva${ESCUELA.banco?.plazoDias ? `, y tienes ${ESCUELA.banco.plazoDias} días para hacerla` : ""}.`,
      "Por seguridad, no doy datos bancarios en el chat. Si alguien te pasa otro número de cuenta, llámanos antes de pagar.",
      `Para otras formas de pago, pregúntanos: ${contacto()}`,
    ].join("\n"),
    cancelar: () => ["Esta es nuestra política de cambios y cancelaciones:", ...(ESCUELA.politicaCancelacion || []).map((p) => `- ${p}`), `Para cambiar de fecha: ${contacto()}`].join("\n"),
    espera: () => {
      const llenas = actividades().filter((a) => a.plazas === 0);
      return ["Cuando una actividad está completa, el botón **Reservar** te deja apuntarte a la **lista de espera**: si se libera una plaza, te avisamos.",
        llenas.length ? "Ahora mismo están completas:\n" + llenas.map((a) => `- ${a.nombre}`).join("\n") : "Ahora mismo no hay ninguna completa."].join("\n");
    },
    precio: () => ["Estos son los precios:", ...actividades().map((a) => lineaCorta(a)), "Los talleres llevan el material incluido."].join("\n"),
    plazas: () => ["Plazas libres ahora mismo:", ...actividades().map((a) => `- **${a.nombre}**: ${a.plazas === 0 ? "completo (lista de espera)" : a.plazas ?? "pregúntanos"}`)].join("\n"),
    empezar: () => {
      const faciles = actividades().filter((a) => /inicia/i.test(quitarTildes(a.nivel || "")) || (a.clase === "taller" && a.fecha && a.plazas !== 0));
      const curso = faciles.find((a) => a.clase === "curso");
      const taller = talleresProximos().find((a) => a.plazas !== 0);
      const lineas = ["¡Para empezar no hace falta experiencia!"];
      if (taller) lineas.push(`- Si quieres probar primero: el taller **${taller.nombre}** (${fechaLarga(taller.fecha)}, ${precioDe(taller)}). Te llevas tu pieza hecha.`);
      if (curso) lineas.push(`- Si quieres aprender a fondo: el curso **${curso.nombre}** (${curso.horario || ""}, ${precioDe(curso)}).`);
      const otros = faciles.filter((a) => a.clase === "curso" && a !== curso);
      if (otros.length) lineas.push(`También son de nivel inicial: ${otros.map((a) => a.nombre).join(", ")}.`);
      lineas.push("¿Prefieres algo de un día o un curso de varias semanas?");
      return lineas.join("\n");
    },
    cursos: () => ["Estos son los cursos:", ...actividades().filter((a) => a.clase === "curso").map((a) => `- **${a.nombre}** (${a.nivel || a.tipo || "curso"}): ${a.horario || ""} · ${precioDe(a)}`), "Pregúntame por cualquiera y te doy los detalles."].join("\n"),
    talleres: () => {
      const prox = talleresProximos();
      const convenir = actividades().filter((a) => a.clase === "taller" && !a.fecha);
      const lineas = prox.length ? ["Próximos talleres:", ...prox.map((a) => lineaCorta(a))] : ["Ahora mismo no hay talleres con fecha publicada."];
      if (convenir.length) lineas.push("Con fecha a convenir:", ...convenir.map((a) => `- **${a.nombre}**: ${precioDe(a)}`));
      lineas.push("Los tienes también en el calendario de la pestaña **Talleres**.");
      return lineas.join("\n");
    },
    regalo: () => {
      const prox = talleresProximos().filter((a) => a.plazas !== 0).slice(0, 3);
      return [`¡Un taller es un regalo precioso! Algunas ideas:`, ...prox.map((a) => lineaCorta(a)),
        `Si quieres regalarlo sin fecha cerrada, pregúntanos: ${contacto()}`].join("\n");
    },
    boda: () => {
      const a = actividades().find((x) => /alianza|pareja|boda/.test(quitarTildes(x.nombre + " " + (x.descripcion || ""))));
      return a ? ficha(a) + "\nEscríbenos para elegir el día: " + contacto() : `Para alianzas y encargos especiales: ${contacto()}`;
    },
    material: () => {
      const conMaterial = actividades().filter((a) => /material/i.test((a.descripcion || "") + (a.unidad || "")));
      return [conMaterial.length ? `Llevan todo el material incluido: ${conMaterial.map((a) => a.nombre).join(", ")}.` : "",
        "Para los cursos, lo que hace falta lo explicamos el primer día. Ven con ropa cómoda y el pelo recogido.",
        `Si tienes dudas concretas sobre material: ${contacto()}`].filter(Boolean).join("\n");
    },
    ninos: () => `La web no indica edades mínimas para cada actividad, así que mejor pregúntanos y te decimos cuál encaja: ${contacto()}`,
    particular: () => `Las clases particulares y los grupos privados (empresas, celebraciones…) se organizan a medida. ${contacto()}`,
    reparar: () => `Para reparaciones, encargos o comprar piezas, pásate por el taller en horario de tienda (${ESCUELA.direccion}) o ${contacto().charAt(0).toLowerCase() + contacto().slice(1)}`,
  };

  // Talleres de un mes concreto ("¿qué hay en noviembre?", "este mes", "el mes que viene")
  function mesPedido(texto) {
    const t = quitarTildes(texto);
    const i = MESES.findIndex((m) => t.includes(m));
    if (i >= 0) return i;
    if (/este mes/.test(t)) return new Date().getMonth();
    if (/(mes que viene|proximo mes|siguiente mes)/.test(t)) return (new Date().getMonth() + 1) % 12;
    return -1;
  }

  const SUGERENCIAS = {
    actividad: ["¿Quedan plazas?", "¿Cómo reservo?", "¿Qué pasa si cancelo?"],
    general: ["¿Qué talleres hay este mes?", "¿Qué curso me recomiendas para empezar?", "¿Dónde estáis?"],
  };

  // ---------- Lo principal ----------
  function responder(pregunta) {
    const t = String(pregunta || "").trim();
    if (!t) return { texto: R.saludo(), sugerencias: SUGERENCIAS.general };
    const es = (tema) => tiene(t, TEMAS[tema]);
    const ps = palabras(t);

    // Cosas que nunca se responden con una actividad, aunque se nombre
    if (es("pago")) return { texto: R.pago(), sugerencias: ["¿Cómo reservo?", "¿Qué pasa si cancelo?"] };
    if (es("cancelar")) return { texto: R.cancelar(), sugerencias: ["¿Cómo reservo?"] };

    // ¿Habla de una actividad concreta?
    const halladas = buscarActividad(t);
    if (halladas.length === 1) {
      const a = (ultima = halladas[0]);
      if (es("precio") && ps.length <= 8) return { texto: `**${a.nombre}**: ${precioDe(a)}. ${plazasDe(a)}`, sugerencias: ["¿Cuándo es?", ...SUGERENCIAS.actividad.slice(1)] };
      return { texto: ficha(a), sugerencias: SUGERENCIAS.actividad };
    }
    if (halladas.length > 1 && halladas.length <= 3) {
      return { texto: ["Te cuento de las que coinciden:", ...halladas.map((a) => lineaCorta(a)), "¿Sobre cuál quieres más detalles?"].join("\n"),
        sugerencias: halladas.map((a) => a.nombre) };
    }

    // Seguir hablando de la actividad anterior: "¿y cuánto cuesta?", "¿quedan plazas?", "¿cuándo es?"
    if (ultima && ps.length <= 7 && !ps.includes("precios")) {
      if (es("precio")) return { texto: `**${ultima.nombre}**: ${precioDe(ultima)}.`, sugerencias: SUGERENCIAS.actividad };
      if (es("plazas")) return { texto: `**${ultima.nombre}**: ${plazasDe(ultima) || "pregúntanos por las plazas."}`, sugerencias: ["¿Cómo reservo?", "¿Cuándo es?"] };
      if (es("fecha")) return { texto: `**${ultima.nombre}**: ${cuandoDe(ultima)}`, sugerencias: SUGERENCIAS.actividad };
      if (es("material")) return { texto: R.material(), sugerencias: SUGERENCIAS.actividad };
    }

    const mes = mesPedido(t);
    if (mes >= 0 && !es("horario")) {
      const enMes = (a) => [a.fecha, ...(a.otrasFechas || [])].find((f) => aFecha(f).getMonth() === mes);
      const delMes = talleresProximos().filter(enMes);
      return { texto: delMes.length ? [`Talleres en ${MESES[mes]}:`, ...delMes.map((a) => lineaCorta(a, enMes(a))), "¿Te cuento más de alguno?"].join("\n")
        : `No hay talleres con fecha en ${MESES[mes]} todavía. ${R.talleres()}`, sugerencias: delMes.slice(0, 3).map((a) => a.nombre) };
    }

    if (es("donde") && es("horario")) return { texto: R.donde(t) + "\n" + R.horario(), sugerencias: SUGERENCIAS.general.slice(0, 2) };

    // Por temas, del más concreto al más general
    const orden = ["boda", "regalo", "espera", "ninos", "particular", "reparar", "material", "empezar", "reservar",
      "talleres", "cursos", "precio", "plazas", "donde", "contacto", "horario", "fecha", "saludo", "gracias"];
    for (const tema of orden) {
      if (!es(tema)) continue;
      ultima = tema === "reservar" || tema === "plazas" ? ultima : null;
      if (tema === "fecha") return { texto: R.talleres(), sugerencias: SUGERENCIAS.general };
      return { texto: R[tema](t), sugerencias: tema === "saludo" ? SUGERENCIAS.general : tema === "reservar" ? ["¿Cómo se paga?", "¿Qué pasa si cancelo?"] : [] };
    }

    return {
      texto: `Esa no la sé responder, perdona. Soy un asistente sencillo y solo conozco lo que hay en la web: cursos, talleres, precios, fechas, horario y reservas.\nPara todo lo demás: ${contacto()}`,
      sugerencias: SUGERENCIAS.general,
    };
  }

  return { responder };
})();
