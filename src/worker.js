// Crunchitos — servidor (Cloudflare Worker, sin dependencias).
// Sirve la página pública (carpeta public/) y la API del panel (/api/...).
// Base de datos: Cloudflare D1 (binding DB). Correos: Resend.

const DUENO = "srab17.6@gmail.com"; // Sebas: siempre entra y es el único que maneja el equipo.
const COOKIE = "crunchitos_sesion";
const DIAS_SESION = 30;
const MINUTOS_CODIGO = 10;
const MAX_INTENTOS = 5;
const DOMINIO = "crunchitos.mx";

const AJUSTES_INICIALES = {
  costo: 30,
  precios: [
    { nombre: "Costo / socio", valor: 30 },
    { nombre: "Distribuidor", valor: 40 },
    { nombre: "Público", valor: 50 },
  ],
  whatsapp: "526142355166",
  stockBajo: 3,
};

// Los sabores (12 desde que se agregó plátano natural). El id coincide con la imagen /img/etiquetas/<id>.webp
const PRODUCTOS = [
  ["jicama-limon", "jicama", "Jícama", "limón y sal", "#D1A383"],
  ["jicama-chile", "jicama", "Jícama", "con chile", "#D0936E"],
  ["jicama-habanero", "jicama", "Jícama", "habanero y miel", "#CFA481"],
  ["jicama-esquite", "jicama", "Jícama", "esquite", "#D4A27B"],
  ["jicama-rancherito", "jicama", "Jícama", "rancherito", "#D09471"],
  ["pepino-limon", "pepino", "Pepino", "limón y sal", "#82A85B"],
  ["pepino-adobado", "pepino", "Pepino", "adobado", "#91B25B"],
  ["camote-limon", "camote", "Camote", "limón y sal", "#C2875D"],
  ["camote-adobado", "camote", "Camote", "adobado", "#C88A5F"],
  ["platano-natural", "platano", "Plátano", "natural", "#EEC14A"],
  ["platano-sal", "platano", "Plátano", "con sal", "#ECBE48"],
  ["platano-canela", "platano", "Plátano", "azúcar y canela", "#F2C54C"],
];

// Inventario real al 20 nov 2026: [id, llegaron, vendidas a $40, tomadas por Sebas]
const SEMILLA = [
  ["jicama-limon", 8, 0, 0],
  ["jicama-chile", 10, 0, 0],
  ["jicama-habanero", 10, 1, 0],
  ["jicama-esquite", 7, 0, 0],
  ["jicama-rancherito", 10, 0, 0],
  ["pepino-limon", 8, 1, 1],
  ["pepino-adobado", 9, 0, 0],
  ["camote-limon", 10, 0, 1],
  ["camote-adobado", 11, 2, 0],
  ["platano-canela", 8, 1, 0],
  ["platano-sal", 9, 1, 0],
];

const TIPOS = ["entrada", "venta", "tomada", "merma"];

// Acceso inicial del equipo (se agrega una sola vez; después se maneja en Ajustes → Equipo).
const EQUIPO_INICIAL = [["paolardzmq@gmail.com", "Pao"]];

// ————————————————————————— utilidades

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}
const error = (msg, status = 400) => json({ ok: false, error: msg }, status);

async function hmac(env, texto) {
  const s = env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Falta configurar SESSION_SECRET en Cloudflare.");
  const key = await crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(texto)));
}

function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const limpiarCorreo = (e) => String(e ?? "").trim().toLowerCase();
const texto = (v, max = 120) => String(v ?? "").trim().slice(0, max);
const esFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f);

function hoyChihuahua() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chihuahua" }).format(new Date());
}

function leerCookie(req, nombre) {
  const c = req.headers.get("cookie") || "";
  for (const parte of c.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return v.join("=");
  }
  return null;
}

// ————————————————————————— base de datos

let listo = false;
async function db(env) {
  if (!env.DB) throw new Error("Falta conectar la base de datos (DB) en Cloudflare.");
  if (listo) return env.DB;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS productos (
      id TEXT PRIMARY KEY, base TEXT NOT NULL, nombre_base TEXT NOT NULL, sabor TEXT NOT NULL,
      color TEXT, orden INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, grupo TEXT NOT NULL, tipo TEXT NOT NULL,
      producto_id TEXT NOT NULL, cantidad INTEGER NOT NULL, precio REAL NOT NULL DEFAULT 0,
      cliente TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '', quien TEXT NOT NULL DEFAULT '',
      fecha TEXT NOT NULL, creado INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS mov_grupo ON movimientos (grupo)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meta (llave TEXT PRIMARY KEY, valor TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipo (email TEXT PRIMARY KEY, nombre TEXT NOT NULL DEFAULT '', creado INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS codigos (
      email TEXT PRIMARY KEY, hash TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0,
      expira INTEGER NOT NULL, creado INTEGER NOT NULL)`),
  ]);
  const sem = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'semilla'").first();
  if (!sem) await sembrar(env.DB);
  const eq = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'equipo_inicial_v1'").first();
  if (!eq) {
    await env.DB.batch([
      ...EQUIPO_INICIAL.map(([email, nombre]) =>
        env.DB.prepare("INSERT OR IGNORE INTO equipo (email, nombre, creado) VALUES (?, ?, ?)").bind(email, nombre, Date.now())),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('equipo_inicial_v1', '1')"),
    ]);
  }
  // Sabores nuevos (p. ej. plátano natural) entran solos a una base que ya existía, con su orden.
  await env.DB.batch(PRODUCTOS.flatMap(([id, base, nb, sabor, color], i) => [
    env.DB.prepare("INSERT OR IGNORE INTO productos (id, base, nombre_base, sabor, color, orden) VALUES (?,?,?,?,?,?)").bind(id, base, nb, sabor, color, i),
    env.DB.prepare("UPDATE productos SET orden = ? WHERE id = ?").bind(i, id),
  ]));
  listo = true;
  return env.DB;
}

async function sembrar(D) {
  const ahora = Date.now();
  const st = [];
  PRODUCTOS.forEach(([id, base, nb, sabor, color], i) =>
    st.push(D.prepare("INSERT OR IGNORE INTO productos (id, base, nombre_base, sabor, color, orden) VALUES (?,?,?,?,?,?)")
      .bind(id, base, nb, sabor, color, i)));
  const ins = (grupo, tipo, pid, cant, precio, nota) =>
    D.prepare(`INSERT INTO movimientos (grupo, tipo, producto_id, cantidad, precio, cliente, nota, quien, fecha, creado)
      VALUES (?,?,?,?,?,'',?,?, '2026-11-20', ?)`).bind(grupo, tipo, pid, cant, precio, nota, DUENO, ahora);
  for (const [id, llegaron, vendidas, tomadas] of SEMILLA) {
    st.push(ins("g-inicial-entrada", "entrada", id, llegaron, 30, "Primer envío de la fábrica"));
    if (vendidas) st.push(ins("g-inicial-venta", "venta", id, vendidas, 40, "Primera venta (6 bolsas, $240)"));
    if (tomadas) st.push(ins("g-inicial-tomadas", "tomada", id, tomadas, 0, "Las que agarró Sebas"));
  }
  st.push(D.prepare("INSERT OR IGNORE INTO meta (llave, valor) VALUES ('ajustes', ?)").bind(JSON.stringify(AJUSTES_INICIALES)));
  st.push(D.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('semilla', '1')"));
  await D.batch(st);
}

async function ajustes(D) {
  const f = await D.prepare("SELECT valor FROM meta WHERE llave = 'ajustes'").first();
  try {
    return { ...AJUSTES_INICIALES, ...(f ? JSON.parse(f.valor) : {}) };
  } catch {
    return { ...AJUSTES_INICIALES };
  }
}

async function permitidos(D) {
  const { results } = await D.prepare("SELECT email FROM equipo").all();
  return new Set([DUENO, ...results.map((r) => r.email)]);
}

// ————————————————————————— sesión

async function sesion(req, env, D) {
  const valor = leerCookie(req, COOKIE);
  if (!valor) return null;
  const m = /^(.+)\.(\d+)\.([0-9a-f]{64})$/.exec(valor);
  if (!m) return null;
  let email;
  try {
    email = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const expira = Number(m[2]);
  if (!Number.isFinite(expira) || expira < Date.now()) return null;
  if (!igual(await hmac(env, `${email}.${expira}`), m[3])) return null;
  if (!(await permitidos(D)).has(email)) return null;
  return email;
}

async function pedirCodigo(env, D, body) {
  const email = limpiarCorreo(body.email);
  if (!(await permitidos(D)).has(email)) return error("Ese correo no tiene acceso al panel.", 403);
  const ahora = Date.now();
  const previo = await D.prepare("SELECT creado FROM codigos WHERE email = ?").bind(email).first();
  if (previo && ahora - previo.creado < 45_000) return error("Ya te mandamos un código. Espera un momento antes de pedir otro.", 429);

  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await D.prepare(`INSERT INTO codigos (email, hash, intentos, expira, creado) VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(email) DO UPDATE SET hash = excluded.hash, intentos = 0, expira = excluded.expira, creado = excluded.creado`)
    .bind(email, await hmac(env, `${email}:${codigo}`), ahora + MINUTOS_CODIGO * 60_000, ahora).run();

  if (env.MODO_PRUEBA === "1") return json({ ok: true, prueba: codigo });
  if (!env.RESEND_API_KEY) return error("Falta configurar el envío de correos (RESEND_API_KEY).", 500);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Crunchitos <crunchitos@asesorsebas.com>",
      to: [email],
      subject: `Tu código de Crunchitos: ${codigo}`,
      text: `Tu código para entrar al panel de Crunchitos es ${codigo}. Vence en ${MINUTOS_CODIGO} minutos. Si no lo pediste, ignora este correo.`,
      html: `<div style="background:#ECBE48;padding:32px 16px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:420px;margin:0 auto;background:#FFF6E6;border-radius:24px;padding:32px;text-align:center;color:#3B2216">
    <div style="font-size:28px;font-weight:bold">Crunchitos</div>
    <p style="font-size:15px;margin:20px 0 8px">Tu código para entrar al panel:</p>
    <div style="font-size:38px;letter-spacing:10px;font-weight:bold;margin:8px 0 16px">${codigo}</div>
    <p style="font-size:12px;margin:0;opacity:.75">Vence en ${MINUTOS_CODIGO} minutos. Si no lo pediste, ignora este correo.</p>
  </div></div>`,
    }),
  });
  if (!res.ok) {
    console.error("Resend:", res.status, await res.text().catch(() => ""));
    return error("No se pudo enviar el correo. Intenta de nuevo en un momento.", 502);
  }
  return json({ ok: true });
}

async function verificar(env, D, body) {
  const email = limpiarCorreo(body.email);
  const codigo = String(body.codigo ?? "").replace(/\D/g, "");
  if (!(await permitidos(D)).has(email)) return error("Ese correo no tiene acceso.", 403);
  const f = await D.prepare("SELECT hash, intentos, expira FROM codigos WHERE email = ?").bind(email).first();
  if (!f || f.expira < Date.now()) return error("El código venció. Pide uno nuevo.");
  if (f.intentos >= MAX_INTENTOS) {
    await D.prepare("DELETE FROM codigos WHERE email = ?").bind(email).run();
    return error("Demasiados intentos. Pide un código nuevo.");
  }
  if (!igual(await hmac(env, `${email}:${codigo}`), f.hash)) {
    await D.prepare("UPDATE codigos SET intentos = intentos + 1 WHERE email = ?").bind(email).run();
    return error("Código incorrecto.");
  }
  await D.prepare("DELETE FROM codigos WHERE email = ?").bind(email).run();
  const expira = Date.now() + DIAS_SESION * 86_400_000;
  const valor = `${encodeURIComponent(email)}.${expira}.${await hmac(env, `${email}.${expira}`)}`;
  return json({ ok: true }, 200, {
    "set-cookie": `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS_SESION * 86400}`,
  });
}

// ————————————————————————— datos del panel

async function datos(D, yo) {
  const [prod, mov, eq, aj] = await Promise.all([
    D.prepare("SELECT * FROM productos ORDER BY orden").all(),
    D.prepare("SELECT * FROM movimientos ORDER BY fecha DESC, creado DESC, id").all(),
    D.prepare("SELECT email, nombre FROM equipo ORDER BY creado").all(),
    ajustes(D),
  ]);
  return {
    ok: true,
    yo,
    esDueno: yo === DUENO,
    dueno: DUENO,
    hoy: hoyChihuahua(),
    productos: prod.results,
    movimientos: mov.results,
    equipo: eq.results,
    ajustes: aj,
  };
}

async function stockPorProducto(D) {
  const { results } = await D.prepare(
    `SELECT producto_id, SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE -cantidad END) AS stock
     FROM movimientos GROUP BY producto_id`).all();
  return Object.fromEntries(results.map((r) => [r.producto_id, Number(r.stock) || 0]));
}

async function guardarMovimiento(D, yo, body) {
  const tipo = String(body.tipo);
  if (!TIPOS.includes(tipo)) return error("Tipo de movimiento no válido.");
  const fecha = esFecha(body.fecha) ? body.fecha : hoyChihuahua();
  const precio = tipo === "venta" || tipo === "entrada" ? Number(body.precio) : 0;
  if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return error("Revisa el precio.");
  if ((tipo === "venta") && precio === 0 && !body.sinCobro) return error("Pon el precio por bolsa.");
  const { results: prods } = await D.prepare("SELECT id FROM productos").all();
  const validos = new Set(prods.map((p) => p.id));
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i) => ({ id: String(i.producto_id), n: Math.trunc(Number(i.cantidad)) }))
    .filter((i) => validos.has(i.id) && i.n > 0 && i.n <= 10000);
  if (!items.length) return error("Agrega al menos una bolsa.");

  if (tipo !== "entrada" && !body.forzar) {
    const stock = await stockPorProducto(D);
    const faltan = items.filter((i) => (stock[i.id] ?? 0) < i.n);
    if (faltan.length) return json({ ok: false, sinStock: faltan.map((i) => ({ id: i.id, hay: stock[i.id] ?? 0, pides: i.n })) }, 409);
  }

  const grupo = "g-" + crypto.randomUUID();
  const ahora = Date.now();
  const cliente = texto(body.cliente, 80);
  const nota = texto(body.nota, 300);
  await D.batch(items.map((i) =>
    D.prepare(`INSERT INTO movimientos (grupo, tipo, producto_id, cantidad, precio, cliente, nota, quien, fecha, creado)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(grupo, tipo, i.id, i.n, precio, cliente, nota, yo, fecha, ahora)));
  return json({ ok: true, grupo });
}

async function guardarAjustes(D, body) {
  const actual = await ajustes(D);
  const nuevo = { ...actual };
  if (body.costo !== undefined) {
    const c = Number(body.costo);
    if (!Number.isFinite(c) || c < 0) return error("Revisa el costo.");
    nuevo.costo = c;
  }
  if (Array.isArray(body.precios)) {
    const p = body.precios
      .map((x) => ({ nombre: texto(x.nombre, 30), valor: Number(x.valor) }))
      .filter((x) => x.nombre && Number.isFinite(x.valor) && x.valor >= 0)
      .slice(0, 8);
    if (!p.length) return error("Deja al menos un precio.");
    nuevo.precios = p;
  }
  if (body.whatsapp !== undefined) {
    let w = String(body.whatsapp).replace(/\D/g, "");
    if (w.length === 10) w = "52" + w;
    if (w.length < 12 || w.length > 13) return error("El WhatsApp debe tener 10 dígitos.");
    nuevo.whatsapp = w;
  }
  if (body.stockBajo !== undefined) {
    const s = Math.trunc(Number(body.stockBajo));
    if (Number.isFinite(s) && s >= 0 && s < 1000) nuevo.stockBajo = s;
  }
  await D.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('ajustes', ?)").bind(JSON.stringify(nuevo)).run();
  return json({ ok: true, ajustes: nuevo });
}

function csv(movs, productos) {
  const nom = Object.fromEntries(productos.map((p) => [p.id, `${p.nombre_base} ${p.sabor}`]));
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = [["Fecha", "Tipo", "Sabor", "Bolsas", "Precio por bolsa", "Total", "Cliente", "Quién", "Nota"]];
  for (const m of movs) {
    filas.push([m.fecha, m.tipo, nom[m.producto_id] || m.producto_id, m.cantidad, m.precio,
      m.tipo === "venta" ? m.precio * m.cantidad : "", m.cliente, m.quien, m.nota]);
  }
  return "﻿" + filas.map((f) => f.map(esc).join(",")).join("\r\n");
}

// ————————————————————————— API

async function api(req, env, url) {
  const D = await db(env);
  const ruta = url.pathname.replace(/^\/api/, "");
  const metodo = req.method;
  let body = {};
  if (metodo === "POST" || metodo === "PUT" || metodo === "DELETE") {
    const tipo = req.headers.get("content-type") || "";
    if (metodo !== "DELETE" && !tipo.includes("application/json")) return error("Formato no válido.", 415);
    if (tipo.includes("application/json")) body = await req.json().catch(() => ({}));
  }

  // Público: lo usa la página para el WhatsApp y los sabores agotados.
  if (ruta === "/publico" && metodo === "GET") {
    const [aj, stock] = await Promise.all([ajustes(D), stockPorProducto(D)]);
    return json({ whatsapp: aj.whatsapp, agotados: Object.keys(stock).filter((k) => stock[k] <= 0) }, 200, {
      "cache-control": "public, max-age=60",
    });
  }
  if (ruta === "/login/codigo" && metodo === "POST") return pedirCodigo(env, D, body);
  if (ruta === "/login/verificar" && metodo === "POST") return verificar(env, D, body);
  if (ruta === "/logout" && metodo === "POST") {
    return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
  }

  const yo = await sesion(req, env, D);
  if (!yo) return error("Tu sesión terminó. Vuelve a entrar.", 401);
  const esDueno = yo === DUENO;

  if (ruta === "/datos" && metodo === "GET") return json(await datos(D, yo));
  if (ruta === "/movimientos" && metodo === "POST") return guardarMovimiento(D, yo, body);
  const mBorrar = /^\/movimientos\/(g-[\w-]+)$/.exec(ruta);
  if (mBorrar && metodo === "DELETE") {
    await D.prepare("DELETE FROM movimientos WHERE grupo = ?").bind(mBorrar[1]).run();
    return json({ ok: true });
  }
  if (ruta === "/ajustes" && metodo === "PUT") return guardarAjustes(D, body);
  if (ruta === "/movimientos.csv" && metodo === "GET") {
    const d = await datos(D, yo);
    return new Response(csv(d.movimientos, d.productos), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="crunchitos-movimientos-${d.hoy}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  if (ruta === "/equipo" && metodo === "POST") {
    if (!esDueno) return error("Solo Sebas puede agregar personas.", 403);
    const email = limpiarCorreo(body.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error("Revisa el correo.");
    await D.prepare("INSERT OR REPLACE INTO equipo (email, nombre, creado) VALUES (?, ?, ?)")
      .bind(email, texto(body.nombre, 40), Date.now()).run();
    return json({ ok: true });
  }
  const mEq = /^\/equipo\/(.+)$/.exec(ruta);
  if (mEq && metodo === "DELETE") {
    if (!esDueno) return error("Solo Sebas puede quitar personas.", 403);
    await D.prepare("DELETE FROM equipo WHERE email = ?").bind(limpiarCorreo(decodeURIComponent(mEq[1]))).run();
    return json({ ok: true });
  }
  return error("No encontrado.", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname === `www.${DOMINIO}`) {
      url.hostname = DOMINIO;
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url);
      } catch (e) {
        console.error(e);
        return error(e?.message?.startsWith("Falta") ? e.message : "Algo falló. Intenta de nuevo.", 500);
      }
    }
    if (url.pathname === "/admin") return Response.redirect(new URL("/admin/", url).toString(), 301);
    const res = await env.ASSETS.fetch(req);
    if (url.pathname.startsWith("/admin")) {
      const r = new Response(res.body, res);
      r.headers.set("x-robots-tag", "noindex, nofollow");
      r.headers.set("cache-control", "no-store");
      return r;
    }
    return res;
  },
};
