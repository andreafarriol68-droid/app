// Rellena la página de privacidad con los datos de datos.js
const valores = {
  titular: ESCUELA.titularLegal || ESCUELA.nombre,
  nif: ESCUELA.nif ? ` · NIF ${ESCUELA.nif}` : "",
  direccion: ESCUELA.direccion,
  email: ESCUELA.email,
  telefono: ESCUELA.telefono,
};
document.querySelectorAll("[data-escuela]").forEach((el) => {
  el.textContent = valores[el.dataset.escuela];
  if (el.tagName === "A") el.href = "mailto:" + ESCUELA.email;
});
