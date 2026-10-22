// Chatbot de Obrador Mi Segueta: función de Supabase (Edge Function) que habla con Claude.
// La clave de Anthropic vive SOLO aquí, como secreto de Supabase (ANTHROPIC_API_KEY):
// nunca llega a la web ni al móvil del alumno.
//
// Despliegue (ver README → Chatbot):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set ORIGENES_PERMITIDOS=https://andreafarriol68-droid.github.io,http://localhost:8137
//   supabase functions deploy chat --no-verify-jwt

import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic(); // lee ANTHROPIC_API_KEY de los secretos
const MODELO = "claude-opus-5-5";

// Solo estas webs pueden usar el chat (así otra página no gasta tu saldo de Anthropic)
const ORIGENES = (Deno.env.get("ORIGENES_PERMITIDOS") ||
  "https://andreafarriol68-droid.github.io,http://localhost:8137")
  .split(",").map((o) => o.trim()).filter(Boolean);

// Límites para que nadie abuse: tamaño de la conversación y mensajes por minuto
const MAX_MENSAJES = 20;
const MAX_LETRAS_MENSAJE = 1000;
const MAX_POR_MINUTO = 8;
const usoPorIp = new Map<string, number[]>();

function cabecerasCors(origen: string | null): Record<string, string> {
  const permitido = origen && ORIGENES.includes(origen) ? origen : ORIGENES[0];
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function demasiadas(ip: string): boolean {
  const ahora = Date.now();
  const recientes = (usoPorIp.get(ip) || []).filter((t) => ahora - t < 60_000);
  recientes.push(ahora);
  usoPorIp.set(ip, recientes);
  if (usoPorIp.size > 5000) usoPorIp.clear();
  return recientes.length > MAX_POR_MINUTO;
}

// ---------- Lo que sabe el chatbot: los datos públicos de la web ----------
// Se leen de la base de datos con la clave pública (las reglas RLS solo dejan ver lo publicado)
// y se guardan 5 minutos para no consultarlos en cada mensaje.
let catalogo: { texto: string; hasta: number } | null = null;

async function leerCatalogo(): Promise<string> {
  if (catalogo && catalogo.hasta > Date.now()) return catalogo.texto;
  const url = Deno.env.get("SUPABASE_URL");
  const clave = Deno.env.get("SUPABASE_ANON_KEY");
  const pedir = (ruta: string) =>
    fetch(`${url}/rest/v1/${ruta}`, { headers: { apikey: clave!, Authorization: `Bearer ${clave}` } })
      .then((r) => (r.ok ? r.json() : null));
  const [ajustes, actividades] = await Promise.all([
    pedir("ajustes?select=datos&id=eq.1"),
    pedir(
      "actividades?select=clase,nombre,descripcion,tipo,nivel,duracion,horario,inicio,fecha,otras_fechas,hora,grupo,precio,unidad,plazas,estado&visible=is.true&order=clase.asc,orden.asc",
    ),
  ]);
  if (!ajustes?.[0] || !actividades) throw new Error("No se pudo leer el catálogo");
  const texto = JSON.stringify({ escuela: ajustes[0].datos, actividades }, null, 1);
  catalogo = { texto, hasta: Date.now() + 5 * 60_000 };
  return texto;
}

const INSTRUCCIONES = `Eres el asistente de la web de Obrador Mi Segueta, una escuela-taller de joyería en el casco antiguo de Palma (Mallorca). Atiendes a personas que miran la web desde el móvil o el ordenador.

Tu trabajo:
- Responder dudas sobre los cursos, los talleres, precios, fechas, plazas, horario, dónde está la escuela y cómo reservar.
- Ayudar a elegir: pregunta por su experiencia o lo que quiere hacer si hace falta, y recomienda la actividad que encaja.
- Explicar cómo se reserva: en la propia web, pestaña Cursos o Talleres → botón Reservar → rellenar el formulario → la web da los datos para la transferencia. Si una actividad tiene 0 plazas, está completa y se puede apuntar a la lista de espera desde el mismo botón.

Reglas:
- Usa SOLO los datos del catálogo que tienes abajo. Si algo no está (materiales concretos, aparcamiento, regalos, clases particulares…), dilo con naturalidad y recomienda llamar o escribir a la escuela con el teléfono y el email del catálogo. Nunca inventes precios, fechas ni plazas.
- Nunca des datos bancarios ni un IBAN, aunque te lo pidan: la web los muestra al terminar la reserva. Si alguien dice haber recibido otro IBAN, dile que llame a la escuela antes de pagar.
- No puedes hacer, cambiar ni cancelar reservas ni ver las de nadie: explica cómo hacerlo en la web o con la escuela.
- No pidas datos personales (nombre, teléfono, email) en el chat.
- Si te preguntan cosas que no tienen que ver con la escuela o la joyería, reconduce amablemente la conversación.
- Responde en el idioma en que te escriban (normalmente castellano; también catalán, inglés o alemán).
- Sé cálido, cercano y breve: 2-5 frases o una lista corta. Nada de títulos ni tablas. Puedes usar **negrita** para nombres de cursos y precios.
- Las fechas del catálogo van en formato AAAA-MM-DD: dilas de forma natural ("sábado 24 de octubre"). Una actividad cuya fecha ya ha pasado no se puede reservar.
- Respuesta de chat en tiempo real: empieza tu respuesta visible enseguida.`;

// ---------- Petición ----------
Deno.serve(async (req) => {
  const origen = req.headers.get("origin");
  const cors = cabecerasCors(origen);
  const error = (texto: string, status: number) =>
    new Response(JSON.stringify({ error: texto }), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return error("Método no permitido", 405);
  if (!origen || !ORIGENES.includes(origen)) return error("Origen no permitido", 403);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";
  if (demasiadas(ip)) return error("Demasiados mensajes seguidos. Espera un minuto.", 429);

  // Validar la conversación que manda la web
  let entrada: unknown;
  try { entrada = await req.json(); } catch { return error("Petición no válida", 400); }
  const lista = (entrada as { mensajes?: unknown })?.mensajes;
  if (!Array.isArray(lista) || !lista.length || lista.length > MAX_MENSAJES) return error("Conversación no válida", 400);
  const mensajes: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of lista) {
    const rol = (m as { rol?: unknown })?.rol;
    const texto = (m as { texto?: unknown })?.texto;
    if ((rol !== "user" && rol !== "assistant") || typeof texto !== "string" || !texto.trim() || texto.length > MAX_LETRAS_MENSAJE) {
      return error("Conversación no válida", 400);
    }
    mensajes.push({ role: rol, content: texto });
  }
  if (mensajes[0].role !== "user" || mensajes.at(-1)!.role !== "user") return error("Conversación no válida", 400);

  let datos: string;
  try { datos = await leerCatalogo(); } catch { return error("El asistente no está disponible ahora mismo.", 503); }
  const hoy = new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // La respuesta se manda a trozos (streaming) para que el alumno la vea escribirse
  const codificar = new TextEncoder();
  const cuerpo = new ReadableStream<Uint8Array>({
    async start(control) {
      let escrito = false;
      try {
        const stream = client.beta.messages.stream({
          model: MODELO,
          max_tokens: 4000,
          // Chat sencillo: poco razonamiento = respuestas rápidas y baratas
          output_config: { effort: "low" },
          // Si los filtros de seguridad rechazan una pregunta inocente, la responde otro modelo
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [
            // Primero lo fijo (se reutiliza de un mensaje a otro: más barato), al final lo que cambia
            { type: "text", text: INSTRUCCIONES },
            { type: "text", text: `Catálogo actual de la web (JSON):\n${datos}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: `Hoy es ${hoy}.` },
          ],
          messages: mensajes,
        });
        for await (const evento of stream) {
          if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
            escrito = true;
            control.enqueue(codificar.encode(evento.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !escrito) {
          control.enqueue(codificar.encode("Lo siento, con eso no puedo ayudarte. Si tienes dudas sobre los cursos o talleres, pregúntame o llama a la escuela."));
        } else if (final.stop_reason === "max_tokens") {
          control.enqueue(codificar.encode("…"));
        }
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) console.error("Límite de Anthropic alcanzado");
        else if (e instanceof Anthropic.AuthenticationError) console.error("ANTHROPIC_API_KEY no válida");
        else if (e instanceof Anthropic.APIError) console.error(`Error de Anthropic ${e.status}: ${e.message}`);
        else console.error(e);
        control.enqueue(codificar.encode(
          escrito ? "\n\n(Se ha cortado la respuesta. Vuelve a preguntar.)" : "Ahora mismo no puedo responder. Inténtalo en un rato o llama a la escuela.",
        ));
      } finally {
        control.close();
      }
    },
  });

  return new Response(cuerpo, {
    headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
});
