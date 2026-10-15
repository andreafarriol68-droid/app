// ============================================================
//  DATOS DE LA ESCUELA — edita solo este archivo
//  Cambia textos, precios, fechas y datos bancarios aquí.
//  Las fechas van en formato "AAAA-MM-DD".
// ============================================================

const ESCUELA = {
  nombre: "Obrador Mi Segueta",
  subtitulo: "Escuela de joyería · Palma",
  lema: "Aprende a hacer joyas con tus propias manos",
  direccion: "Carrer de l'Argenteria, 14 · 07001 Palma (Illes Balears)",
  comoLlegar: "En el casco antiguo, a dos minutos de la Plaza Mayor.",
  telefono: "971 123 456",
  email: "hola@obradormisegueta.es",

  // Datos para el pago por transferencia — ¡pon aquí tu IBAN real!
  banco: {
    titular: "Obrador Mi Segueta",
    iban: "2100.0000.00.0000000000",
    banco: "Caixa Joyeria",
    // Días que tiene el alumno para hacer la transferencia
    plazoDias: 3,
  },

  // Horario de apertura (deja "Cerrado" los días que no abre)
  horario: [
    { dia: "Lunes", horas: "10:00 – 14:00 · 17:00 – 20:00" },
    { dia: "Martes", horas: "10:00 – 14:00 · 17:00 – 20:00" },
    { dia: "Miércoles", horas: "10:00 – 14:00 · 17:00 – 20:00" },
    { dia: "Jueves", horas: "10:00 – 14:00 · 17:00 – 20:00" },
    { dia: "Viernes", horas: "10:00 – 14:00 · 17:00 – 20:00" },
    { dia: "Sábado", horas: "10:00 – 14:00" },
    { dia: "Domingo", horas: "Cerrado" },
  ],
  notaHorario: "Horario de tienda y reparación. Las clases tienen su propio horario en cada curso.",

  // Opcional: dirección de un formulario de Formspree (https://formspree.io)
  // para recibir las reservas en tu email automáticamente.
  // Ejemplo: "https://formspree.io/f/abcdwxyz". Si lo dejas vacío,
  // la reserva se envía abriendo el programa de correo del alumno.
  formularioURL: "",
};

// Cursos largos
//   precio:  número en euros (lo que se paga al reservar, por persona)
//   unidad:  texto que acompaña al precio, p. ej. "/ mes" (opcional)
//   plazas:  plazas que se pueden reservar ahora (máx. 6 por grupo).
//            Pon 0 cuando se llene: aparece "Completo" y un botón de lista de espera.
//   estado:  aviso corto, p. ej. "Quedan 2 plazas" (opcional)
const CURSOS = [
  {
    id: "c1",
    nombre: "Iniciación a la joyería",
    tipo: "Curso trimestral",
    descripcion:
      "Aserrado, limado, soldadura y pulido. Harás un anillo, unos pendientes y un colgante en plata de ley.",
    nivel: "Nivel inicial",
    duracion: "48 h · 12 semanas",
    inicio: "2027-01-13",
    horario: "Martes y jueves 18:00 – 21:00",
    precio: 390,
    unidad: "/ trimestre",
    plazas: 2,
    estado: "Quedan 2 plazas",
  },
  {
    id: "c2",
    nombre: "Joyería profesional",
    tipo: "Curso anual",
    descripcion:
      "De octubre a junio. Técnicas avanzadas, diseño de colección propia y preparación para trabajar en taller.",
    nivel: "Nivel medio",
    duracion: "280 h · de octubre a junio",
    inicio: null,
    horario: "Lunes a jueves 10:00 – 13:30",
    precio: 165,
    unidad: "/ mes",
    plazas: 6,
    estado: "Matrícula abierta",
  },
  {
    id: "c3",
    nombre: "Engaste de piedras",
    tipo: "Curso 10 semanas",
    descripcion:
      "Engaste en chatón, garras, grano y carril. Practicarás con circonitas antes de pasar a piedras naturales.",
    nivel: "Requiere base",
    duracion: "30 h · 10 semanas",
    inicio: "2026-11-04",
    horario: "Miércoles 17:00 – 20:00",
    precio: 360,
    plazas: 6,
  },
  {
    id: "c4",
    nombre: "Cera perdida y fundición",
    tipo: "Curso 8 semanas",
    descripcion:
      "Talla tu diseño en cera y lo fundimos en plata o bronce. Ideal para formas orgánicas y anillos con volumen.",
    nivel: "Nivel inicial",
    duracion: "24 h · 8 semanas",
    inicio: "2026-11-07",
    horario: "Sábados 10:00 – 13:00",
    precio: 320,
    plazas: 6,
  },
];

// Talleres monográficos (aparecen en el calendario)
//   fecha:       primer día del taller, o null si la fecha es a convenir
//   otrasFechas: más días del mismo taller (opcional)
//   plazas:      plazas libres; pon 0 cuando se llene (lista de espera)
//   grupo:       tamaño máximo del grupo (opcional, por defecto 6)
const TALLERES = [
  {
    id: "t1",
    nombre: "Tu anillo de plata en una mañana",
    descripcion:
      "La mejor forma de empezar. Texturizas, sueldas y pules tu propio anillo, y te lo llevas puesto.",
    fecha: "2026-10-24",
    hora: "Sábado 10:00 – 14:00",
    precio: 85,
    unidad: "material incluido",
    plazas: 6,
    estado: "Muy solicitado",
  },
  {
    id: "t2",
    nombre: "Botó mallorquí: el botón de plata tradicional",
    descripcion: "Taller de dos sábados con todo el material incluido.",
    fecha: "2026-10-31",
    otrasFechas: ["2026-11-07"],
    hora: "Sábados 31 oct y 7 nov · 10:00 – 14:00",
    precio: 150,
    plazas: 6,
  },
  {
    id: "t3",
    nombre: "Martillado y texturas sobre metal",
    descripcion: "Taller de una mañana con todo el material incluido.",
    fecha: "2026-11-14",
    hora: "Sábado 10:00 – 14:00",
    precio: 75,
    plazas: 6,
  },
  {
    id: "t4",
    nombre: "Esmalte al fuego",
    descripcion: "Taller de fin de semana con todo el material incluido.",
    fecha: "2026-11-21",
    otrasFechas: ["2026-11-22"],
    hora: "Sábado y domingo 10:00 – 14:00",
    precio: 160,
    plazas: 6,
  },
  {
    id: "t5",
    nombre: "Pendientes de aro para regalar",
    descripcion: "Edición Navidad, con todo el material incluido.",
    fecha: "2026-12-12",
    hora: "Sábado 10:00 – 14:00",
    precio: 80,
    plazas: 6,
  },
  {
    id: "t6",
    nombre: "Haz vuestras alianzas",
    descripcion:
      "Un día en pareja para forjar los anillos de boda el uno para el otro, en plata, oro de 18 k o mixtos.",
    fecha: null,
    hora: "Sábado · 6 h · fecha a convenir",
    precio: 190,
    unidad: "/ pareja + metal",
    plazas: 1,
    textoPlazas: "Parejas",
  },
];
