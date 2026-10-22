-- ============================================================
--  Obrador Mi Segueta · base de datos en Supabase
--  Cómo usarlo: Supabase → SQL Editor → New query → pega TODO
--  este archivo → Run. Se puede volver a ejecutar sin perder datos.
--
--  Seguridad: cada tabla tiene RLS (Row Level Security). Aunque
--  alguien copie la clave pública de la web, la base de datos solo
--  le deja hacer lo que dicen las reglas ("policies") de abajo.
-- ============================================================


-- ------------------------------------------------------------
--  1. PERFILES DE USUARIO (uno por cada cuenta)
-- ------------------------------------------------------------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  usuario   text not null unique check (usuario ~ '^[a-z0-9_.]{3,30}$'),
  nombre    text not null default '' check (char_length(nombre) <= 120),
  telefono  text not null default '' check (telefono ~ '^[+0-9 ]{0,20}$'),
  rol       text not null default 'alumno' check (rol in ('alumno', 'admin')),
  creado    timestamptz not null default now()
);
alter table public.perfiles enable row level security;

-- ¿La persona conectada es administradora?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin') $$;

-- Al crear una cuenta se crea su perfil (siempre como "alumno")
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  u text := lower(coalesce(new.raw_user_meta_data ->> 'usuario', ''));
begin
  -- Cuentas creadas desde el panel de Supabase (sin usuario): se inventa uno
  if u !~ '^[a-z0-9_.]{3,30}$' then
    u := 'u_' || left(replace(new.id::text, '-', ''), 12);
  end if;
  insert into public.perfiles (id, usuario, nombre)
  values (new.id, u, left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 120));
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

drop policy if exists "ver perfil propio o admin" on public.perfiles;
create policy "ver perfil propio o admin" on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());

drop policy if exists "editar perfil propio" on public.perfiles;
create policy "editar perfil propio" on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Cada uno solo puede cambiar su nombre y teléfono (NO su rol ni su usuario)
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;
grant update (nombre, telefono) on public.perfiles to authenticated;


-- ------------------------------------------------------------
--  2. CONTENIDO DE LA WEB: cursos y talleres
-- ------------------------------------------------------------
create table if not exists public.actividades (
  id            text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  clase         text not null check (clase in ('curso', 'taller')),
  orden         int not null default 0,
  visible       boolean not null default true,
  nombre        text not null check (char_length(nombre) between 1 and 120),
  descripcion   text not null default '' check (char_length(descripcion) <= 1000),
  foto          text check (foto ~ '^fotos/[A-Za-z0-9_.-]+$'),
  foto_alt      text check (char_length(foto_alt) <= 300),
  -- cursos
  tipo          text check (char_length(tipo) <= 60),
  nivel         text check (char_length(nivel) <= 60),
  duracion      text check (char_length(duracion) <= 80),
  horario       text check (char_length(horario) <= 120),
  inicio        date,
  -- talleres
  fecha         date,
  otras_fechas  date[] not null default '{}',
  hora          text check (char_length(hora) <= 120),
  grupo         int check (grupo between 1 and 99),
  texto_plazas  text check (char_length(texto_plazas) <= 40),
  -- comunes
  precio        numeric(8, 2) not null check (precio >= 0),
  unidad        text check (char_length(unidad) <= 40),
  plazas        int not null default 6 check (plazas between 0 and 99),
  estado        text check (char_length(estado) <= 60),
  actualizada   timestamptz not null default now()
);
alter table public.actividades enable row level security;

drop policy if exists "todos ven lo publicado" on public.actividades;
create policy "todos ven lo publicado" on public.actividades
  for select to anon, authenticated using (visible or public.es_admin());

drop policy if exists "admin crea actividades" on public.actividades;
create policy "admin crea actividades" on public.actividades
  for insert to authenticated with check (public.es_admin());

drop policy if exists "admin edita actividades" on public.actividades;
create policy "admin edita actividades" on public.actividades
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "admin borra actividades" on public.actividades;
create policy "admin borra actividades" on public.actividades
  for delete to authenticated using (public.es_admin());

revoke all on public.actividades from anon, authenticated;
grant select on public.actividades to anon, authenticated;
grant insert, update, delete on public.actividades to authenticated;


-- ------------------------------------------------------------
--  3. CONTENIDO DE LA WEB: textos y horario de la escuela
--     (una sola fila; el IBAN NO va aquí, sigue en datos.js)
-- ------------------------------------------------------------
create table if not exists public.ajustes (
  id           int primary key default 1 check (id = 1),
  datos        jsonb not null default '{}'::jsonb check (not (datos ? 'banco')),
  actualizado  timestamptz not null default now()
);
alter table public.ajustes enable row level security;

drop policy if exists "todos ven los ajustes" on public.ajustes;
create policy "todos ven los ajustes" on public.ajustes
  for select to anon, authenticated using (true);

drop policy if exists "admin crea ajustes" on public.ajustes;
create policy "admin crea ajustes" on public.ajustes
  for insert to authenticated with check (public.es_admin());

drop policy if exists "admin edita ajustes" on public.ajustes;
create policy "admin edita ajustes" on public.ajustes
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

revoke all on public.ajustes from anon, authenticated;
grant select on public.ajustes to anon, authenticated;
grant insert, update on public.ajustes to authenticated;


-- ------------------------------------------------------------
--  4. RESERVAS
--     Cualquiera puede enviar una (con o sin cuenta), pero solo
--     la ve su dueño (si tenía cuenta) y la administración.
-- ------------------------------------------------------------
create table if not exists public.reservas (
  referencia       text primary key check (referencia ~ '^MSG-[A-Z2-9]{5}$'),
  usuario_id       uuid default auth.uid() references auth.users (id) on delete set null,
  actividad_id     text check (char_length(actividad_id) <= 40),
  tipo             text check (char_length(tipo) <= 20),
  actividad        text not null check (char_length(actividad) <= 160),
  cuando           text check (char_length(cuando) <= 300),
  fecha_actividad  date,
  plazas           int not null check (plazas between 1 and 99),
  total            numeric(8, 2) not null default 0 check (total >= 0),
  unidad           text check (char_length(unidad) <= 40),
  nombre           text not null check (char_length(nombre) between 1 and 120),
  email            text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  telefono         text not null check (telefono ~ '^[+0-9 ]{9,20}$'),
  estado           text not null default 'pendiente'
                   check (estado in ('espera', 'pendiente', 'pagada', 'confirmada', 'cancelada')),
  creada           timestamptz not null default now(),
  actualizada      timestamptz not null default now()
);
alter table public.reservas enable row level security;
create index if not exists reservas_email on public.reservas (lower(email), creada desc);
create index if not exists reservas_usuario on public.reservas (usuario_id);

-- Antes de guardar una reserva nueva: freno contra envíos en masa y el
-- importe se recalcula con el precio real (no se fía de lo que manda el navegador)
create or replace function public.antes_de_reservar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  p numeric;
begin
  if (select count(*) from public.reservas
      where lower(email) = lower(new.email) and creada > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiadas reservas seguidas' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reservas where creada > now() - interval '1 hour') >= 200 then
    raise exception 'Demasiadas reservas seguidas' using errcode = 'P0001';
  end if;
  select precio into p from public.actividades where id = new.actividad_id;
  if found then
    new.total := case when new.estado = 'espera' then 0 else p * new.plazas end;
  end if;
  new.creada := now();
  new.actualizada := now();
  return new;
end $$;

drop trigger if exists antes_de_reservar on public.reservas;
create trigger antes_de_reservar before insert on public.reservas
  for each row execute function public.antes_de_reservar();

create or replace function public.marcar_actualizada()
returns trigger language plpgsql set search_path = ''
as $$ begin new.actualizada := now(); return new; end $$;

drop trigger if exists al_cambiar_reserva on public.reservas;
create trigger al_cambiar_reserva before update on public.reservas
  for each row execute function public.marcar_actualizada();

drop trigger if exists al_cambiar_actividad on public.actividades;
create or replace function public.marcar_actividad()
returns trigger language plpgsql set search_path = ''
as $$ begin new.actualizada := now(); return new; end $$;
create trigger al_cambiar_actividad before update on public.actividades
  for each row execute function public.marcar_actividad();

drop policy if exists "cualquiera puede reservar" on public.reservas;
create policy "cualquiera puede reservar" on public.reservas
  for insert to anon, authenticated
  with check (usuario_id is not distinct from auth.uid() and estado in ('pendiente', 'espera'));

drop policy if exists "ver mis reservas o admin" on public.reservas;
create policy "ver mis reservas o admin" on public.reservas
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "admin gestiona reservas" on public.reservas;
create policy "admin gestiona reservas" on public.reservas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "admin borra reservas" on public.reservas;
create policy "admin borra reservas" on public.reservas
  for delete to authenticated using (public.es_admin());

revoke all on public.reservas from anon, authenticated;
grant insert on public.reservas to anon, authenticated;
grant select, update, delete on public.reservas to authenticated;


-- ------------------------------------------------------------
--  5. FUNCIONES QUE USA LA WEB
-- ------------------------------------------------------------

-- ¿Está libre este nombre de usuario? (al registrarse)
create or replace function public.usuario_libre(p_usuario text)
returns boolean language sql stable security definer set search_path = ''
as $$ select not exists (select 1 from public.perfiles where usuario = lower(p_usuario)) $$;

-- Para poder entrar con el nombre de usuario en vez del email
create or replace function public.email_de_usuario(p_usuario text)
returns text language sql stable security definer set search_path = ''
as $$
  select u.email::text from auth.users u join public.perfiles p on p.id = u.id
  where p.usuario = lower(p_usuario)
$$;

-- El alumno avisa de que ha hecho (o no) la transferencia. Pide el email de la reserva.
create or replace function public.avisar_pago(p_ref text, p_email text, p_pagada boolean default true)
returns boolean language sql security definer set search_path = ''
as $$
  with c as (
    update public.reservas
       set estado = case when p_pagada then 'pagada' else 'pendiente' end
     where referencia = p_ref and lower(email) = lower(p_email)
       and estado = case when p_pagada then 'pendiente' else 'pagada' end
    returning 1)
  select exists (select 1 from c)
$$;

-- En qué estado tiene la escuela las reservas de este dispositivo (máx. 50)
create or replace function public.estado_de_reservas(p_refs text[], p_email text)
returns table (referencia text, estado text) language sql stable security definer set search_path = ''
as $$
  select r.referencia, r.estado from public.reservas r
  where r.referencia = any (p_refs[1:50]) and lower(r.email) = lower(p_email)
$$;

-- Intranet: lista de usuarios con su email (solo administración)
create or replace function public.listar_usuarios()
returns table (id uuid, usuario text, nombre text, email text, telefono text, rol text, creado timestamptz, ultimo_acceso timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para administradores' using errcode = '42501';
  end if;
  return query
    select p.id, p.usuario, p.nombre, u.email::text, p.telefono, p.rol, p.creado, u.last_sign_in_at
      from public.perfiles p join auth.users u on u.id = p.id
     order by p.creado desc;
end $$;

-- Intranet: dar o quitar el rol de administrador
create or replace function public.cambiar_rol(p_id uuid, p_rol text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo para administradores' using errcode = '42501';
  end if;
  if p_rol not in ('alumno', 'admin') then
    raise exception 'Rol no válido';
  end if;
  if p_id = auth.uid() and p_rol <> 'admin' then
    raise exception 'No puedes quitarte a ti mismo el rol de administrador';
  end if;
  update public.perfiles set rol = p_rol where id = p_id;
end $$;

-- Derecho de supresión (RGPD): el usuario borra su propia cuenta.
-- Sus reservas se quedan (contabilidad), pero ya sin enlace a la cuenta.
create or replace function public.borrar_mi_cuenta()
returns void language sql security definer set search_path = ''
as $$ delete from auth.users where id = auth.uid() $$;

-- Permisos de las funciones: nadie por defecto, y luego solo quien las necesita
revoke execute on function
  public.es_admin(), public.usuario_libre(text), public.email_de_usuario(text),
  public.avisar_pago(text, text, boolean), public.estado_de_reservas(text[], text),
  public.listar_usuarios(), public.cambiar_rol(uuid, text), public.borrar_mi_cuenta(),
  public.crear_perfil(), public.antes_de_reservar()
  from public, anon, authenticated;
grant execute on function
  public.es_admin(), public.usuario_libre(text), public.email_de_usuario(text),
  public.avisar_pago(text, text, boolean), public.estado_de_reservas(text[], text)
  to anon, authenticated;
grant execute on function
  public.listar_usuarios(), public.cambiar_rol(uuid, text), public.borrar_mi_cuenta()
  to authenticated;


-- ------------------------------------------------------------
--  6. CONTENIDO INICIAL (lo mismo que hay en datos.js)
--     Solo se inserta si no existe: no pisa lo que edites luego.
-- ------------------------------------------------------------
insert into public.ajustes (id, datos) values (1, $json${
  "nombre": "Obrador Mi Segueta",
  "subtitulo": "Escuela de joyería · Palma",
  "lema": "Aprende a hacer joyas con tus propias manos",
  "direccion": "Carrer de l'Argenteria, 14 · 07001 Palma (Illes Balears)",
  "comoLlegar": "En el casco antiguo, a dos minutos de la Plaza Mayor.",
  "telefono": "971 123 456",
  "email": "hola@obradormisegueta.es",
  "plazoConfirmacion": "24 horas",
  "politicaCancelacion": [
    "El importe de la reserva no se devuelve.",
    "Puedes cambiar a otra fecha si nos avisas con al menos 48 horas de antelación.",
    "Si la escuela cancela la actividad, te devolvemos el importe completo."
  ],
  "horario": [
    { "dia": "Lunes", "horas": "10:00 – 14:00 · 17:00 – 20:00" },
    { "dia": "Martes", "horas": "10:00 – 14:00 · 17:00 – 20:00" },
    { "dia": "Miércoles", "horas": "10:00 – 14:00 · 17:00 – 20:00" },
    { "dia": "Jueves", "horas": "10:00 – 14:00 · 17:00 – 20:00" },
    { "dia": "Viernes", "horas": "10:00 – 14:00 · 17:00 – 20:00" },
    { "dia": "Sábado", "horas": "10:00 – 14:00" },
    { "dia": "Domingo", "horas": "Cerrado" }
  ],
  "notaHorario": "Horario de tienda y reparación. Las clases tienen su propio horario en cada curso."
}$json$::jsonb)
on conflict (id) do nothing;

insert into public.actividades
  (id, clase, orden, nombre, descripcion, foto, foto_alt, tipo, nivel, duracion, horario, inicio, precio, unidad, plazas, estado)
values
  ('c1', 'curso', 1, 'Iniciación a la joyería',
   'Aserrado, limado, soldadura y pulido. Harás un anillo, unos pendientes y un colgante en plata de ley.',
   'fotos/iniciacion.jpg', 'Alumno aserrando una pieza de plata con la segueta en el banco de trabajo',
   'Curso trimestral', 'Nivel inicial', '48 h · 12 semanas', 'Martes y jueves 18:00 – 21:00', '2027-01-13', 390, '/ trimestre', 2, 'Quedan 2 plazas'),
  ('c2', 'curso', 2, 'Joyería profesional',
   'De octubre a junio. Técnicas avanzadas, diseño de colección propia y preparación para trabajar en taller.',
   'fotos/profesional.jpg', 'Manos de joyero ajustando un anillo de plata sobre el astillero',
   'Curso anual', 'Nivel medio', '280 h · de octubre a junio', 'Lunes a jueves 10:00 – 13:30', null, 165, '/ mes', 6, 'Matrícula abierta'),
  ('c3', 'curso', 3, 'Engaste de piedras',
   'Engaste en chatón, garras, grano y carril. Practicarás con circonitas antes de pasar a piedras naturales.',
   'fotos/engaste.jpg', 'Anillo de plata con un zafiro engastado y orla de piedras',
   'Curso 10 semanas', 'Requiere base', '30 h · 10 semanas', 'Miércoles 17:00 – 20:00', '2026-11-04', 360, null, 6, null),
  ('c4', 'curso', 4, 'Cera perdida y fundición',
   'Talla tu diseño en cera y lo fundimos en plata o bronce. Ideal para formas orgánicas y anillos con volumen.',
   'fotos/cera.jpg', 'Granalla de plata y de oro en las palmas de las manos, lista para fundir',
   'Curso 8 semanas', 'Nivel inicial', '24 h · 8 semanas', 'Sábados 10:00 – 13:00', '2026-11-07', 320, null, 6, null)
on conflict (id) do nothing;

insert into public.actividades
  (id, clase, orden, nombre, descripcion, foto, foto_alt, fecha, otras_fechas, hora, grupo, texto_plazas, precio, unidad, plazas, estado)
values
  ('t1', 'taller', 1, 'Tu anillo de plata en una mañana',
   'La mejor forma de empezar. Texturizas, sueldas y pules tu propio anillo, y te lo llevas puesto.',
   'fotos/anillo-plata.jpg', 'Anillos de plata hechos a mano, con bolitas, texturas y una piedra azul',
   '2026-10-24', '{}', 'Sábado 10:00 – 14:00', null, null, 85, 'material incluido', 6, 'Muy solicitado'),
  ('t2', 'taller', 2, 'Botó mallorquí: el botón de plata tradicional',
   'Taller de dos sábados con todo el material incluido.',
   'fotos/boto.jpg', 'Joyero soldando con soplete piezas redondas de plata',
   '2026-10-31', '{2026-11-07}', 'Sábados 31 oct y 7 nov · 10:00 – 14:00', null, null, 150, null, 6, null),
  ('t3', 'taller', 3, 'Martillado y texturas sobre metal',
   'Taller de una mañana con todo el material incluido.',
   'fotos/martillado.jpg', 'Dos anillos de plata con textura martillada sobre madera',
   '2026-11-14', '{}', 'Sábado 10:00 – 14:00', null, null, 75, null, 6, null),
  ('t4', 'taller', 4, 'Esmalte al fuego',
   'Taller de fin de semana con todo el material incluido.',
   'fotos/esmalte.jpg', 'Anillo de metal calentándose bajo la llama del soplete',
   '2026-11-21', '{2026-11-22}', 'Sábado y domingo 10:00 – 14:00', null, null, 160, null, 6, null),
  ('t5', 'taller', 5, 'Pendientes de aro para regalar',
   'Edición Navidad, con todo el material incluido.',
   'fotos/aros.jpg', 'Pendientes de aro de plata con textura',
   '2026-12-12', '{}', 'Sábado 10:00 – 14:00', null, null, 80, null, 6, null),
  ('t6', 'taller', 6, 'Haz vuestras alianzas',
   'Un día en pareja para forjar los anillos de boda el uno para el otro, en plata, oro de 18 k o mixtos.',
   'fotos/alianzas.jpg', 'Dos alianzas de plata sobre una hoja oscura',
   null, '{}', 'Sábado · 6 h · fecha a convenir', null, 'Parejas', 190, '/ pareja + metal', 1, null)
on conflict (id) do nothing;


-- ------------------------------------------------------------
--  7. PRIMER ADMINISTRADOR
--     Regístrate en la web (cuenta.html), confirma el email y luego
--     ejecuta esta línea cambiando TU_USUARIO por tu nombre de usuario.
--     A partir de ahí, los demás roles se dan desde la intranet.
-- ------------------------------------------------------------
-- update public.perfiles set rol = 'admin' where usuario = 'TU_USUARIO';
