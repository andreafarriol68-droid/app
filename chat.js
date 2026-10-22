// Chatbot de la web: un botón flotante abre una ventana para preguntar dudas.
// Las respuestas las da Claude a través de la función "chat" de Supabase
// (supabase/functions/chat), que es la única que conoce la clave de Anthropic.

(() => {
  if (!Supa.activo) return; // sin Supabase no hay chatbot
  const URL_CHAT = SUPABASE.url.replace(/\/+$/, "") + "/functions/v1/chat";
  const MAX_MENSAJES = 20;
  const SUGERENCIAS = ["¿Qué curso me recomiendas para empezar?", "¿Qué talleres hay este mes?", "¿Cómo reservo una plaza?", "¿Dónde estáis y qué horario tenéis?"];
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // La conversación se recuerda mientras la pestaña esté abierta
  let mensajes = [];
  try { mensajes = JSON.parse(sessionStorage.getItem("chat") || "[]").filter((m) => ["user", "assistant"].includes(m?.rol) && typeof m.texto === "string"); } catch {}
  const guardar = () => { try { sessionStorage.setItem("chat", JSON.stringify(mensajes.slice(-MAX_MENSAJES))); } catch {} };

  document.body.classList.add("con-chat");
  document.body.insertAdjacentHTML("beforeend", `
    <button id="chat-abrir" class="chat-abrir" aria-expanded="false" aria-controls="chat-ventana">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12.5c0 3.9-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 20l1.2-3.6C4.4 15.3 4 13.9 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7z"/><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" stroke-width="2.4"/></svg>
      <span>¿Dudas?</span>
    </button>
    <section id="chat-ventana" class="chat-ventana" role="dialog" aria-modal="false" aria-labelledby="chat-titulo" hidden>
      <header class="chat-cab">
        <div>
          <p class="sello">Asistente</p>
          <h2 id="chat-titulo">Pregúntanos</h2>
        </div>
        <button class="chat-cerrar" aria-label="Cerrar el chat">×</button>
      </header>
      <div id="chat-mensajes" class="chat-mensajes" aria-live="polite"></div>
      <form id="chat-form" class="chat-form">
        <label class="solo-lectores" for="chat-texto">Tu pregunta</label>
        <textarea id="chat-texto" rows="1" maxlength="1000" placeholder="Escribe tu pregunta…" autocomplete="off"></textarea>
        <button type="submit" class="chat-enviar" aria-label="Enviar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </form>
      <p class="chat-aviso">Respuestas automáticas con IA (Claude, de Anthropic): pueden equivocarse. No escribas datos personales. <a href="privacidad.html">Privacidad</a></p>
    </section>`);

  const $c = (sel) => document.querySelector(sel);
  const ventana = $c("#chat-ventana");
  const lista = $c("#chat-mensajes");
  const texto = $c("#chat-texto");
  const boton = $c("#chat-abrir");
  let ocupado = false;

  // Un poco de formato: **negrita**, listas con guion y saltos de línea (todo escapado antes)
  function formatear(t) {
    const lineas = escapar(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n");
    let html = "", enLista = false;
    for (const l of lineas) {
      const item = l.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)/);
      if (item) { html += (enLista ? "" : "<ul>") + `<li>${item[1]}</li>`; enLista = true; continue; }
      if (enLista) { html += "</ul>"; enLista = false; }
      if (l.trim()) html += `<p>${l}</p>`;
    }
    return html + (enLista ? "</ul>" : "");
  }

  function burbuja(m) {
    return `<div class="chat-msg chat-${m.rol === "user" ? "yo" : "bot"}">${m.rol === "user" ? `<p>${escapar(m.texto)}</p>` : formatear(m.texto)}</div>`;
  }

  function pintar() {
    lista.innerHTML = `<div class="chat-msg chat-bot"><p>¡Hola! Soy el asistente de ${escapar(ESCUELA.nombre)}. Pregúntame por los cursos, talleres, precios, fechas o cómo reservar.</p></div>`
      + mensajes.map(burbuja).join("")
      + (mensajes.length ? "" : `<div class="chat-sugerencias">${SUGERENCIAS.map((s) => `<button type="button" data-pregunta="${escapar(s)}">${escapar(s)}</button>`).join("")}</div>`);
    lista.scrollTop = lista.scrollHeight;
  }

  function abrir() {
    ventana.hidden = false;
    boton.setAttribute("aria-expanded", "true");
    document.body.classList.add("chat-abierto");
    pintar();
    texto.focus();
  }
  function cerrar() {
    ventana.hidden = true;
    boton.setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-abierto");
    boton.focus();
  }

  async function preguntar(pregunta) {
    pregunta = pregunta.trim().slice(0, 1000);
    if (!pregunta || ocupado) return;
    if (!navigator.onLine) { avisar("Sin conexión: el asistente necesita internet."); return; }
    ocupado = true;
    texto.value = "";
    ajustarAlto();
    mensajes.push({ rol: "user", texto: pregunta });
    // Solo se manda lo último, empezando siempre por una pregunta
    let enviar = mensajes.slice(-(MAX_MENSAJES - 1));
    while (enviar.length && enviar[0].rol !== "user") enviar = enviar.slice(1);
    pintar();
    lista.insertAdjacentHTML("beforeend", `<div class="chat-msg chat-bot chat-escribiendo" id="chat-respuesta"><span></span><span></span><span></span></div>`);
    lista.scrollTop = lista.scrollHeight;
    const caja = $c("#chat-respuesta");

    let respuesta = "";
    try {
      const resp = await fetch(URL_CHAT, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE.clave },
        body: JSON.stringify({ mensajes: enviar }),
      });
      if (!resp.ok || !resp.body) {
        let msg = "";
        try { msg = (await resp.json()).error; } catch {}
        throw new Error(msg || "No disponible");
      }
      // La respuesta llega a trozos: se va pintando según se escribe
      const lector = resp.body.getReader();
      const decodificar = new TextDecoder();
      caja.classList.remove("chat-escribiendo");
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        respuesta += decodificar.decode(value, { stream: true });
        caja.innerHTML = formatear(respuesta);
        lista.scrollTop = lista.scrollHeight;
      }
      if (!respuesta.trim()) throw new Error("Respuesta vacía");
      mensajes.push({ rol: "assistant", texto: respuesta });
    } catch (e) {
      const motivo = /minuto/.test(e.message) ? e.message : "Ahora mismo no puedo responder.";
      respuesta = `${motivo} Si es urgente, llama al ${ESCUELA.telefono}.`;
      mensajes.pop(); // la pregunta no obtuvo respuesta: se puede volver a enviar
      caja.classList.remove("chat-escribiendo");
      caja.classList.add("chat-error");
      caja.innerHTML = `<p>${escapar(respuesta)}</p>`;
      texto.value = pregunta;
    } finally {
      ocupado = false;
      guardar();
      texto.focus();
    }
  }

  // El cuadro de texto crece al escribir (hasta 4 líneas)
  function ajustarAlto() {
    texto.style.height = "auto";
    texto.style.height = Math.min(texto.scrollHeight, 110) + "px";
    texto.style.overflowY = texto.scrollHeight > 110 ? "auto" : "hidden";
  }

  boton.addEventListener("click", () => (ventana.hidden ? abrir() : cerrar()));
  $c(".chat-cerrar").addEventListener("click", cerrar);
  ventana.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  texto.addEventListener("input", ajustarAlto);
  // Intro envía; Mayúsculas+Intro hace un salto de línea
  texto.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); preguntar(texto.value); }
  });
  $c("#chat-form").addEventListener("submit", (e) => { e.preventDefault(); preguntar(texto.value); });
  lista.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pregunta]");
    if (b) preguntar(b.dataset.pregunta);
  });
})();
