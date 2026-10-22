// ============================================================
//  CONFIGURACIÓN DE LA INTRANET — app aparte de la web pública
// ============================================================

// Supabase: el mismo proyecto que la web (la misma clave pública que en datos.js).
// La intranet guarda su propia sesión: entrar aquí no te deja dentro de la web, ni al revés.
const SUPABASE = {
  url: "https://sjzjneckpkwvgxrtdcgo.supabase.co",
  clave: "",
  claveSesion: "sesion-intranet",
  paginaCuenta: "./", // los enlaces de "nueva contraseña" vuelven aquí
};

// Dirección de la web pública: para enlazarla y para ver las fotos de los cursos
const WEB_PUBLICA = "https://andreafarriol68-droid.github.io/app/";

// Cierre de sesión automático tras este tiempo sin usar la intranet (ordenadores compartidos)
const MINUTOS_INACTIVIDAD = 30;

// Datos de la escuela que usan los emails a los alumnos.
// El IBAN tiene que ser EL MISMO que en datos.js de la web: los emails lo repiten
// para que el alumno pueda comprobar que es el bueno (ver AUDITORIA-SEGURIDAD.md, A1).
const ESCUELA = {
  nombre: "Obrador Mi Segueta",
  telefono: "971 123 456",
  direccion: "Carrer de l'Argenteria, 14 · 07001 Palma (Illes Balears)",
  banco: {
    titular: "Obrador Mi Segueta",
    iban: "ES 2100.0000.00.0000000000",
  },
  // Valores por defecto del formulario «Datos de la escuela» si aún no hay nada guardado
  horario: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((dia) => ({ dia, horas: "" })),
  politicaCancelacion: [],
};
