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
    { nombre: "Paquete Mayorista", valor: 38.46 },
    { nombre: "Paquete Emprendedor", valor: 40 },
    { nombre: "Paquete Inicial", valor: 41.67 },
    { nombre: "Consigna", valor: 45 },
    { nombre: "Público / domicilio", valor: 55 },
  ],
  whatsapp: "526142355166",
  stockBajo: 3,
  minimo: 10, // bolsas mínimas para pedido a domicilio desde la página
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
  ["platano-natural", 9, 1, 0], // se registró como "con sal" por error; era natural
];

const TIPOS = ["entrada", "venta", "tomada", "merma", "consigna", "devolucion", "apartado"];
const CATEGORIAS = ["etiquetas", "envio", "gasolina", "empaque", "publicidad", "otro"];

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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS gastos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, categoria TEXT NOT NULL, concepto TEXT NOT NULL DEFAULT '',
      monto REAL NOT NULL, pago TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '', quien TEXT NOT NULL DEFAULT '', creado INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS equipo (email TEXT PRIMARY KEY, nombre TEXT NOT NULL DEFAULT '', creado INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS codigos (
      email TEXT PRIMARY KEY, hash TEXT NOT NULL, intentos INTEGER NOT NULL DEFAULT 0,
      expira INTEGER NOT NULL, creado INTEGER NOT NULL)`),
  ]);
  const sem = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'semilla'").first();
  if (!sem) await sembrar(env.DB);
  const mig = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'mig_consigna'").first();
  if (!mig) {
    try { await env.DB.prepare("ALTER TABLE movimientos ADD COLUMN consigna INTEGER NOT NULL DEFAULT 0").run(); } catch (e) { /* ya existe */ }
    await env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('mig_consigna', '1')").run();
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS remisiones (
    grupo TEXT PRIMARY KEY, telefono TEXT NOT NULL DEFAULT '', creado INTEGER NOT NULL,
    confirmado INTEGER NOT NULL DEFAULT 0, confirmado_por TEXT NOT NULL DEFAULT '', firma TEXT NOT NULL DEFAULT '')`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS puntos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, direccion TEXT NOT NULL DEFAULT '',
    mapa TEXT NOT NULL DEFAULT '', creado INTEGER NOT NULL)`).run();
  const pto = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'puntos_v1'").first();
  if (!pto) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO puntos (nombre, direccion, mapa, creado) VALUES (?, ?, ?, ?)")
        .bind("Tortillería y Abarrotes De Jesús", "C. Egipto 2619, Col. Álamos", "https://maps.app.goo.gl/R9cFxqED6UNFnapt5", Date.now()),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('puntos_v1', '1')"),
    ]);
  }
  const ptoF = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'puntos_foto_v1'").first();
  if (!ptoF) {
    try { await env.DB.prepare("ALTER TABLE puntos ADD COLUMN foto TEXT NOT NULL DEFAULT ''").run(); } catch (e) { /* ya existe */ }
    await env.DB.batch([
      env.DB.prepare("UPDATE puntos SET foto = '/img/puntos/de-jesus.webp' WHERE mapa = 'https://maps.app.goo.gl/R9cFxqED6UNFnapt5' AND foto = ''"),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('puntos_foto_v1', '1')"),
    ]);
  }
  // 21 nov 2026: todo lo que llegó de plátano era natural (no hubo con sal). Se corrige una sola vez.
  const fixP = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'fix_platano_sal_v1'").first();
  if (!fixP) {
    await env.DB.batch([
      env.DB.prepare("UPDATE movimientos SET producto_id = 'platano-natural' WHERE producto_id = 'platano-sal'"),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('fix_platano_sal_v1', '1')"),
    ]);
  }
  // 22 nov 2026: Víctor entra al panel (una sola vez; si Sebas lo quita después, no regresa solo).
  const eqV = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'equipo_victor_v1'").first();
  if (!eqV) {
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO equipo (email, nombre, creado) VALUES (?, ?, ?)").bind("victor.hernandez.lider@gmail.com", "Víctor", Date.now()),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('equipo_victor_v1', '1')"),
    ]);
  }
  const eq = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'equipo_inicial_v1'").first();
  if (!eq) {
    await env.DB.batch([
      ...EQUIPO_INICIAL.map(([email, nombre]) =>
        env.DB.prepare("INSERT OR IGNORE INTO equipo (email, nombre, creado) VALUES (?, ?, ?)").bind(email, nombre, Date.now())),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('equipo_inicial_v1', '1')"),
    ]);
  }
  // 25 nov 2026: los gastos que ya había se pagaron de la caja (lo dijo Sebas).
  const gc = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'gastos_caja_v1'").first();
  if (!gc) {
    await env.DB.batch([
      env.DB.prepare("UPDATE gastos SET pago = 'caja'"),
      env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('gastos_caja_v1', '1')"),
    ]);
  }
  // 23 nov 2026: precios de los paquetes para emprendedores ($1,500/36, $3,000/75, $5,000/130), consigna $45 y público/domicilio $55 (solo si los precios siguen siendo los de fábrica).
  const pv2 = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'precios_v2'").first();
  if (!pv2) {
    const f = await env.DB.prepare("SELECT valor FROM meta WHERE llave = 'ajustes'").first();
    let a = {};
    try { a = f ? JSON.parse(f.valor) : {}; } catch {}
    const viejos = JSON.stringify((a.precios || []).map((x) => x.valor)) === "[30,40,50]";
    const st = [env.DB.prepare("INSERT OR REPLACE INTO meta (llave, valor) VALUES ('precios_v2', '1')")];
    if (f && viejos) {
      a.precios = AJUSTES_INICIALES.precios;
      if (a.minimo === undefined) a.minimo = AJUSTES_INICIALES.minimo;
      st.unshift(env.DB.prepare("UPDATE meta SET valor = ? WHERE llave = 'ajustes'").bind(JSON.stringify(a)));
    }
    await env.DB.batch(st);
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
  const [prod, mov, eq, aj, gas] = await Promise.all([
    D.prepare("SELECT * FROM productos ORDER BY orden").all(),
    D.prepare("SELECT * FROM movimientos ORDER BY fecha DESC, creado DESC, id").all(),
    D.prepare("SELECT email, nombre FROM equipo ORDER BY creado").all(),
    ajustes(D),
    D.prepare("SELECT * FROM gastos ORDER BY fecha DESC, creado DESC").all(),
  ]);
  const rem = await D.prepare("SELECT * FROM remisiones").all();
  const pts = await D.prepare("SELECT id, nombre, direccion, mapa, creado, length(foto) AS tieneFoto FROM puntos ORDER BY creado").all();
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
    gastos: gas.results,
    remisiones: rem.results,
    puntos: pts.results,
  };
}

async function stockPorProducto(D) {
  const { results } = await D.prepare(
    `SELECT producto_id, SUM(CASE WHEN tipo IN ('entrada','devolucion','ajuste') THEN cantidad
       WHEN consigna = 1 THEN 0 ELSE -cantidad END) AS stock
     FROM movimientos GROUP BY producto_id`).all();
  return Object.fromEntries(results.map((r) => [r.producto_id, Number(r.stock) || 0]));
}

async function guardarMovimiento(D, yo, body) {
  const tipo = String(body.tipo);
  if (!TIPOS.includes(tipo)) return error("Tipo de movimiento no válido.");
  const fecha = esFecha(body.fecha) ? body.fecha : hoyChihuahua();
  const precio = ["venta", "entrada", "consigna", "apartado"].includes(tipo) ? Number(body.precio) || 0 : 0;
  if (tipo === "consigna" && !texto(body.cliente, 80)) return error("Pon a qué tienda o persona se le dejó.");
  if (tipo === "apartado" && !texto(body.cliente, 80)) return error("Pon para quién es el apartado.");
  if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return error("Revisa el precio.");
  if ((tipo === "venta") && precio === 0 && !body.sinCobro) return error("Pon el precio por bolsa.");
  const { results: prods } = await D.prepare("SELECT id FROM productos").all();
  const validos = new Set(prods.map((p) => p.id));
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i) => ({ id: String(i.producto_id), n: Math.trunc(Number(i.cantidad)) }))
    .filter((i) => validos.has(i.id) && i.n > 0 && i.n <= 10000);
  if (!items.length) return error("Agrega al menos una bolsa.");

  if (tipo !== "entrada" && tipo !== "devolucion" && !body.forzar) {
    const stock = await stockPorProducto(D);
    const faltan = items.filter((i) => (stock[i.id] ?? 0) < i.n);
    if (faltan.length) return json({ ok: false, sinStock: faltan.map((i) => ({ id: i.id, hay: stock[i.id] ?? 0, pides: i.n })) }, 409);
  }

  const grupo = "g-" + crypto.randomUUID();
  const ahora = Date.now();
  const cliente = texto(body.cliente, 80);
  const nota = texto(body.nota, 300);
  const st = items.map((i) =>
    D.prepare(`INSERT INTO movimientos (grupo, tipo, producto_id, cantidad, precio, cliente, nota, quien, fecha, creado)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(grupo, tipo, i.id, i.n, precio, cliente, nota, yo, fecha, ahora));
  if (tipo === "consigna") {
    let tel = String(body.telefono ?? "").replace(/\D/g, "");
    if (tel.length === 10) tel = "52" + tel;
    st.push(D.prepare("INSERT OR REPLACE INTO remisiones (grupo, telefono, creado) VALUES (?, ?, ?)").bind(grupo, tel.slice(0, 15), ahora));
  }
  await D.batch(st);
  return json({ ok: true, grupo });
}

// Conteo real de bodega: guarda la diferencia por sabor como "ajuste" (+/-). Se cuentan solo las disponibles (lo apartado va en otra bolsa).
async function ajustarConteo(D, yo, body) {
  const conteo = body.conteo && typeof body.conteo === "object" ? body.conteo : {};
  const stock = await stockPorProducto(D);
  const grupo = "g-" + crypto.randomUUID(), ahora = Date.now(), fecha = hoyChihuahua();
  const nota = texto(body.nota, 300) || "Ajuste por conteo";
  const st = [];
  for (const id of Object.keys(stock)) {
    if (conteo[id] === undefined || conteo[id] === "") continue;
    const real = Math.trunc(Number(conteo[id]));
    if (!Number.isFinite(real) || real < 0 || real > 100000) return error("Revisa los números del conteo.");
    const dif = real - (stock[id] || 0); // se cuentan solo las disponibles; lo apartado va aparte
    if (dif) st.push(D.prepare(`INSERT INTO movimientos (grupo, tipo, producto_id, cantidad, precio, cliente, nota, quien, fecha, creado)
      VALUES (?, 'ajuste', ?, ?, 0, '', ?, ?, ?, ?)`).bind(grupo, id, dif, nota, yo, fecha, ahora));
  }
  if (!st.length) return json({ ok: true, cambios: 0 });
  await D.batch(st);
  return json({ ok: true, cambios: st.length, grupo });
}

// Visita a una tienda con consigna: lo vendido cuenta como venta, lo que regresa vuelve a bodega.
async function liquidar(D, yo, body) {
  const tienda = texto(body.tienda, 80);
  if (!tienda) return error("Falta la tienda.");
  const fecha = esFecha(body.fecha) ? body.fecha : hoyChihuahua();
  const precio = Number(body.precio);
  if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return error("Revisa el precio.");
  const { results: prods } = await D.prepare("SELECT id FROM productos").all();
  const validos = new Set(prods.map((p) => p.id));
  const lista = (o) => Object.entries(o || {}).map(([id, n]) => ({ id, n: Math.trunc(Number(n)) })).filter((x) => validos.has(x.id) && x.n > 0 && x.n <= 10000);
  const vendidas = lista(body.vendidas), devueltas = lista(body.devueltas), merma = lista(body.merma);
  if (!vendidas.length && !devueltas.length && !merma.length) return error("Pon cuántas se vendieron o regresan.");
  const ahora = Date.now(), nota = texto(body.nota, 300);
  const ins = (grupo, tipo, x, p, consigna) => D.prepare(`INSERT INTO movimientos (grupo, tipo, producto_id, cantidad, precio, cliente, nota, quien, fecha, creado, consigna)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(grupo, tipo, x.id, x.n, p, tienda, nota, yo, fecha, ahora, consigna);
  const gV = "g-" + crypto.randomUUID(), gD = "g-" + crypto.randomUUID(), gM = "g-" + crypto.randomUUID();
  await D.batch([
    ...vendidas.map((x) => ins(gV, "venta", x, precio, 1)),
    ...devueltas.map((x) => ins(gD, "devolucion", x, 0, 1)),
    ...merma.map((x) => ins(gM, "merma", x, 0, 1)),
  ]);
  return json({ ok: true });
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
  if (body.mostrarAgotados !== undefined) nuevo.mostrarAgotados = !!body.mostrarAgotados;
  // Cambiar el costo de toda la mercancía que ya llegó (la ganancia usa el costo de las entradas).
  if (body.aplicarCosto && Number(body.costo) > 0 && Number(body.costo) < 10000) {
    await D.prepare("UPDATE movimientos SET precio = ? WHERE tipo = 'entrada'").bind(Number(body.costo)).run();
  }
  if (body.whatsapp !== undefined) {
    let w = String(body.whatsapp).replace(/\D/g, "");
    if (w.length === 10) w = "52" + w;
    if (w.length < 12 || w.length > 13) return error("El WhatsApp debe tener 10 dígitos.");
    nuevo.whatsapp = w;
  }
  if (body.minimo !== undefined) {
    const m = Math.trunc(Number(body.minimo));
    if (!Number.isFinite(m) || m < 1 || m > 200) return error("El pedido mínimo debe ser de 1 a 200 bolsas.");
    nuevo.minimo = m;
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
    filas.push([m.fecha, m.tipo === "venta" && m.consigna ? "venta (consigna)" : m.tipo, nom[m.producto_id] || m.producto_id, m.cantidad, m.precio,
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
    const [aj, stock, pts] = await Promise.all([ajustes(D), stockPorProducto(D),
      D.prepare(`SELECT nombre, direccion, mapa, CASE WHEN foto LIKE '/%' THEN foto WHEN foto <> '' THEN '/api/punto-foto/' || id || '?v=' || length(foto) ELSE '' END AS foto
        FROM puntos ORDER BY creado`).all()]);
    const precio = Math.max(0, ...aj.precios.map((p) => Number(p.valor) || 0));
    return json({ whatsapp: aj.whatsapp, precio, minimo: aj.minimo || 10, agotados: aj.mostrarAgotados ? Object.keys(stock).filter((k) => stock[k] <= 0) : [], puntos: pts.results }, 200, {
      "cache-control": "public, max-age=60",
    });
  }
  // Remisión de consigna: liga pública (el folio es un id largo imposible de adivinar).
  const mRem = /^\/remision\/(g-[\w-]+)(\/confirmar)?$/.exec(ruta);
  if (mRem) {
    const grupo = mRem[1];
    const { results: movs } = await D.prepare(
      `SELECT m.*, p.nombre_base, p.sabor FROM movimientos m JOIN productos p ON p.id = m.producto_id
       WHERE m.grupo = ? AND m.tipo = 'consigna' ORDER BY p.orden`).bind(grupo).all();
    if (!movs.length) return error("No encontramos esta remisión.", 404);
    let rem = await D.prepare("SELECT * FROM remisiones WHERE grupo = ?").bind(grupo).first();
    if (mRem[2] && metodo === "POST") {
      if (!rem) {
        await D.prepare("INSERT OR IGNORE INTO remisiones (grupo, creado) VALUES (?, ?)").bind(grupo, Date.now()).run();
      }
      const nombre = texto(body.nombre, 60);
      if (!nombre) return error("Escribe tu nombre para confirmar.");
      const firma = typeof body.firma === "string" && body.firma.startsWith("data:image/png;base64,") && body.firma.length < 120000 ? body.firma : "";
      await D.prepare("UPDATE remisiones SET confirmado = ?, confirmado_por = ?, firma = ? WHERE grupo = ? AND confirmado = 0")
        .bind(Date.now(), nombre, firma, grupo).run();
      rem = await D.prepare("SELECT * FROM remisiones WHERE grupo = ?").bind(grupo).first();
    } else if (metodo !== "GET") return error("No permitido.", 405);
    const aj = await ajustes(D);
    const m0 = movs[0];
    return json({
      ok: true,
      folio: grupo.replace(/-/g, "").slice(-6).toUpperCase(),
      tienda: m0.cliente, fecha: m0.fecha, precio: m0.precio, nota: m0.nota,
      items: movs.map((m) => ({ nombre: `${m.nombre_base} ${m.sabor}`, cantidad: m.cantidad })),
      confirmado: rem?.confirmado || 0, confirmado_por: rem?.confirmado_por || "", firma: rem?.firma || "",
      whatsapp: aj.whatsapp,
    }, 200, { "x-robots-tag": "noindex" });
  }
  const mFoto = /^\/punto-foto\/(\d+)$/.exec(ruta);
  if (mFoto && metodo === "GET") {
    const r = await D.prepare("SELECT foto FROM puntos WHERE id = ?").bind(Number(mFoto[1])).first();
    const m = /^data:(image\/(?:jpeg|webp|png));base64,(.+)$/.exec(r?.foto || "");
    if (!m) return error("Sin foto.", 404);
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { "content-type": m[1], "cache-control": "public, max-age=86400" } });
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
  if (ruta === "/consigna/liquidar" && metodo === "POST") return liquidar(D, yo, body);
  if (ruta === "/ajuste" && metodo === "POST") return ajustarConteo(D, yo, body);
  const mBorrar = /^\/movimientos\/(g-[\w-]+)$/.exec(ruta);
  if (mBorrar && metodo === "DELETE") {
    await D.prepare("DELETE FROM movimientos WHERE grupo = ?").bind(mBorrar[1]).run();
    return json({ ok: true });
  }
  // Apartado → se entrega como venta o como consigna (mismo grupo, cambia el tipo).
  const mEnt = /^\/movimientos\/(g-[\w-]+)\/entregar$/.exec(ruta);
  if (mEnt && metodo === "POST") {
    const como = body.como === "consigna" ? "consigna" : "venta";
    const fecha = esFecha(body.fecha) ? body.fecha : hoyChihuahua();
    const st = [D.prepare("UPDATE movimientos SET tipo = ?, fecha = ? WHERE grupo = ? AND tipo = 'apartado'").bind(como, fecha, mEnt[1])];
    if (body.precio !== undefined) {
      const precio = Number(body.precio);
      if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return error("Revisa el precio.");
      st.push(D.prepare("UPDATE movimientos SET precio = ? WHERE grupo = ?").bind(precio, mEnt[1]));
    }
    if (como === "consigna") st.push(D.prepare("INSERT OR IGNORE INTO remisiones (grupo, telefono, creado) VALUES (?, '', ?)").bind(mEnt[1], Date.now()));
    await D.batch(st);
    return json({ ok: true, grupo: mEnt[1] });
  }
  const mPrecio = /^\/movimientos\/(g-[\w-]+)$/.exec(ruta);
  if (mPrecio && metodo === "PUT") {
    const precio = Number(body.precio);
    if (!Number.isFinite(precio) || precio < 0 || precio > 100000) return error("Revisa el precio.");
    await D.prepare("UPDATE movimientos SET precio = ? WHERE grupo = ? AND tipo IN ('venta','entrada','consigna','apartado')").bind(precio, mPrecio[1]).run();
    return json({ ok: true });
  }
  if (ruta === "/gastos" && metodo === "POST") {
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0 || monto > 1000000) return error("Pon el monto del gasto.");
    const categoria = CATEGORIAS.includes(body.categoria) ? body.categoria : "otro";
    const fecha = esFecha(body.fecha) ? body.fecha : hoyChihuahua();
    const pago = limpiarCorreo(body.pago) || yo;
    await D.prepare(`INSERT INTO gastos (fecha, categoria, concepto, monto, pago, nota, quien, creado) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(fecha, categoria, texto(body.concepto, 80), Math.round(monto * 100) / 100, pago, texto(body.nota, 300), yo, Date.now()).run();
    return json({ ok: true });
  }
  const mGasto = /^\/gastos\/(\d+)$/.exec(ruta);
  if (mGasto && metodo === "DELETE") {
    await D.prepare("DELETE FROM gastos WHERE id = ?").bind(Number(mGasto[1])).run();
    return json({ ok: true });
  }
  if (ruta === "/gastos.csv" && metodo === "GET") {
    const { results } = await D.prepare("SELECT * FROM gastos ORDER BY fecha DESC, creado DESC").all();
    const esc = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const filas = [["Fecha", "Categoría", "Concepto", "Monto", "Pagó", "Nota", "Registró"],
      ...results.map((g) => [g.fecha, g.categoria, g.concepto, g.monto, g.pago, g.nota, g.quien])];
    return new Response("\uFEFF" + filas.map((f) => f.map(esc).join(",")).join("\r\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="crunchitos-gastos-${hoyChihuahua()}.csv"`, "cache-control": "no-store" },
    });
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
  // Puntos de venta que salen en la página ("Dónde encontrar Crunchitos").
  if (ruta === "/puntos" && metodo === "POST") {
    const nombre = texto(body.nombre, 80);
    if (!nombre) return error("Pon el nombre del lugar.");
    const mapa = String(body.mapa ?? "").trim().slice(0, 300);
    if (mapa && !/^https:\/\//.test(mapa)) return error("La liga del mapa debe empezar con https://");
    await D.prepare("INSERT INTO puntos (nombre, direccion, mapa, foto, creado) VALUES (?, ?, ?, ?, ?)")
      .bind(nombre, texto(body.direccion, 120), mapa, fotoValida(body.foto), Date.now()).run();
    return json({ ok: true });
  }
  const mPtF = /^\/puntos\/(\d+)\/foto$/.exec(ruta);
  if (mPtF && metodo === "PUT") {
    const foto = fotoValida(body.foto);
    if (!foto) return error("No se pudo leer la foto.");
    await D.prepare("UPDATE puntos SET foto = ? WHERE id = ?").bind(foto, Number(mPtF[1])).run();
    return json({ ok: true });
  }
  const mPt = /^\/puntos\/(\d+)$/.exec(ruta);
  if (mPt && metodo === "DELETE") {
    await D.prepare("DELETE FROM puntos WHERE id = ?").bind(Number(mPt[1])).run();
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

// Foto de un punto de venta: la reduce el panel en el cel; aquí solo se valida tipo y tamaño.
function fotoValida(f) {
  return typeof f === "string" && /^data:image\/(jpeg|webp|png);base64,/.test(f) && f.length < 600000 ? f : "";
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
    if (/^\/r\/g-[\w-]+\/?$/.test(url.pathname)) {
      const page = await env.ASSETS.fetch(new Request(new URL("/r/", url), req));
      const r = new Response(page.body, page);
      r.headers.set("x-robots-tag", "noindex, nofollow");
      r.headers.set("cache-control", "no-store");
      return r;
    }
    // Archivos del equipo (PDF para emprendedores, tablas, carteles): solo con sesión del panel.
    if (url.pathname.startsWith("/admin/docs/")) {
      const D = await db(env);
      if (!(await sesion(req, env, D))) return new Response("Entra al panel para ver este archivo.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
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
