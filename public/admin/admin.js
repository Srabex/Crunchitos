// Panel de Crunchitos: inventario, ventas y reportes. Sin librerías.
(function () {
  "use strict";
  var app = document.getElementById("app");
  var D = null; // datos del servidor
  var vista = "inicio";
  var periodo = "30";
  // Ciudad que se está viendo ("todas" = suma de todas, solo para ver; para registrar hay que elegir una).
  var ciudad = null;
  try { ciudad = localStorage.getItem("crunchitos-ciudad"); } catch (e) {}
  var filtroHist = "todos";
  var form = null; // estado del formulario de movimiento

  // ——— utilidades
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var fmt = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
  function redondo(n) { return Math.round(n * 100) / 100; }
  function pesos(n) { var r = Math.round(n || 0); return (r < 0 ? "-$" : "$") + fmt.format(Math.abs(r)); }
  function num(n) { return fmt.format(n || 0); }
  function aviso(t, arriba) {
    var a = document.getElementById("aviso");
    a.textContent = t; a.hidden = false; a.classList.toggle("arriba", !!arriba);
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { a.hidden = true; }, 2600);
  }
  function api(metodo, ruta, body) {
    if (body && metodo !== "GET" && ciudad && ciudad !== "todas" && body.ciudad === undefined) body.ciudad = ciudad;
    return fetch("/api" + ruta, {
      method: metodo,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Respuesta inválida." }; }).then(function (j) {
        j._status = r.status; return j;
      });
    }).catch(function () { return { ok: false, error: "Sin conexión. Revisa tu internet.", _status: 0 }; });
  }
  function hoyLocal() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function restarDias(f, n) {
    var d = new Date(f + "T12:00:00"); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function fechaBonita(f) {
    var d = new Date(f + "T12:00:00");
    return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  }
  function nombreProd(id) {
    var p = D.productos.find(function (x) { return x.id === id; });
    return p ? p.nombre_base + " " + p.sabor : id;
  }
  function nombrePersona(email) {
    if (email === "caja") return "La caja";
    if (email === D.dueno) return "Sebas";
    var e = D.equipo.find(function (x) { return x.email === email; });
    return e && e.nombre ? e.nombre : String(email).split("@")[0];
  }
  var ICON = {
    inicio: '<path d="M4 20V10l8-6 8 6v10h-5v-6H9v6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    vender: '<path d="M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    gastos: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6M9 16h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    inventario: '<path d="M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0l8 4 8-4M12 12v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    historial: '<path d="M12 7v5l3 2M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    archivos: '<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };

  // Archivos del equipo (public/admin/docs/, solo con sesión). falta: true = todavía no se sube.
  var DOCS = [
    { grupo: "Para emprendedores", items: [
      { t: "PDF Emprende con Crunchitos", d: "2 hojas: paquetes, beneficios para emprendedores activos y cómo empezar. Es el que se manda.", f: [["PDF", "crunchitos-emprende.pdf"], ["Hoja 1 (imagen)", "crunchitos-emprende-hoja1.jpg"], ["Hoja 2 (imagen)", "crunchitos-emprende-hoja2.jpg"]] },
      { t: "Tabla de paquetes", d: "Versión horizontal para WhatsApp, sin precios internos.", f: [["Imagen", "crunchitos-tabla-paquetes.jpg"]] },
      { t: "Tabla con consigna", d: "Solo para gente de confianza o si ya nos compró. No se publica.", f: [["Imagen", "crunchitos-tabla-consigna.jpg"]] },
      { t: "Tabla interna", d: "Con nuestra ganancia por paquete. Solo para el equipo.", f: [["Imagen", "crunchitos-tabla-interna.jpg"]] }
    ] },
    { grupo: "Redes de Crunchitos · campaña emprendedores", items: [
      { t: "Todo en un ZIP", d: "4 posts (3:4 para Instagram y Facebook), 4 historias y los textos para publicar. Sin precios.", f: [["ZIP", "redes/crunchitos-redes-emprendedores.zip"]] },
      { t: "¡Emprende con Crunchitos! (idea de Pao)", d: "Historia completa: beneficios, Así de fácil y WhatsApp.", f: [["Historia", "redes/crunchitos-historia-emprende.jpg"]] },
      { t: "1 · ¡Ya tenemos paquetes para emprendedores!", d: "Con la foto de los 12 sabores.", f: [["Post", "redes/crunchitos-post-1-ya-tenemos-paquetes.jpg"], ["Historia", "redes/crunchitos-historia-1-ya-tenemos-paquetes.jpg"]] },
      { t: "2 · ¿Buscas un ingreso extra?", d: "Fondo café con los 4 Crunchis.", f: [["Post", "redes/crunchitos-post-2-ingreso-extra.jpg"], ["Historia", "redes/crunchitos-historia-2-ingreso-extra.jpg"]] },
      { t: "3 · Listos para surtir tu negocio", d: "Tiendas, gyms, cafeterías y oficinas en Chihuahua.", f: [["Post", "redes/crunchitos-post-3-listos-para-surtir.jpg"], ["Historia", "redes/crunchitos-historia-3-listos-para-surtir.jpg"]] },
      { t: "4 · No te competimos: te ayudamos a vender", d: "Los beneficios para emprendedores.", f: [["Post", "redes/crunchitos-post-4-te-ayudamos-a-vender.jpg"], ["Historia", "redes/crunchitos-historia-4-te-ayudamos-a-vender.jpg"]] }
    ] },
    { grupo: "Kit para distribuidores", items: [
      { t: "Página del kit (crunchitos.mx/kit)", d: "Mándales esta liga a los distribuidores: estados para WhatsApp, fotos de los 12 sabores, textos para copiar, cartel con QR y logos.", f: [["Abrir el kit", "/kit/"]] },
      { t: "Cartel QR para tienditas", d: "Media carta, \"¡Pídelos aquí en caja!\" con precio a mano. Para el mostrador de cada punto de venta.", f: [["PDF para imprimir", "/kit/crunchitos-cartel-qr-tienda.pdf"], ["Imagen", "/kit/crunchitos-cartel-qr-tienda.png"]] }
    ] },
    { grupo: "Etiquetas para imprenta", items: [
      { t: "Etiquetas sin teléfono", d: "CMYK (FOGRA39), un fondo por base. Hoja A4 con las 12, las 12 por separado en PDF a 1200 ppp con línea de corte de 6 cm, y TIFF por si la imprenta lo prefiere. Acabado brillante; pedir prueba de color.", f: [["Hoja A4 (PDF)", "etiquetas/Crunchitos-etiquetas-A4-sin-telefono-CMYK.pdf"], ["12 etiquetas en PDF (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-PDF-sin-telefono.zip"], ["TIFF 01–06 (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-TIFF-01-06-sin-telefono.zip"], ["TIFF 07–12 (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-TIFF-07-12-sin-telefono.zip"]] },
      { t: "Etiquetas con el WhatsApp de Sebas", d: "614 235 5166. Mismo contenido que la de sin teléfono.", f: [["Hoja A4 (PDF)", "etiquetas/Crunchitos-etiquetas-A4-tel-sebas-CMYK.pdf"], ["12 etiquetas en PDF (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-PDF-tel-sebas.zip"], ["TIFF 01–06 (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-TIFF-01-06-tel-sebas.zip"], ["TIFF 07–12 (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-TIFF-07-12-tel-sebas.zip"]] },
      { t: "Etiquetas con el WhatsApp de Pao", d: "33 1760 8242. Mismo contenido que la de sin teléfono.", f: [["Hoja A4 (PDF)", "etiquetas/Crunchitos-etiquetas-A4-tel-pao-CMYK.pdf"], ["12 etiquetas en PDF (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-PDF-tel-pao.zip"], ["TIFF 01–06 (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-TIFF-01-06-tel-pao.zip"], ["TIFF 07–12 (ZIP)", "etiquetas/Crunchitos-etiquetas-CMYK-TIFF-07-12-tel-pao.zip"]] }
    ] },
    { grupo: "Marca", items: [
      { t: "Manual de identidad (PDF)", d: "Versión 3: logo, Crunchi, colores, letras, etiqueta, carteles y reglas de marca.", f: [["PDF", "crunchitos-manual-de-identidad.pdf"]] },
      { t: "Logos y Crunchis", d: "Logo en crema y en café (SVG) y los 4 Crunchis sin fondo (PNG).", f: [["ZIP", "/kit/crunchitos-logos-y-crunchis.zip"]] }
    ] }
  ];

  // ——— cálculos
  function stock() {
    var s = {};
    D.productos.forEach(function (p) { s[p.id] = 0; });
    D.movimientos.forEach(function (m) {
      var d = (m.tipo === "entrada" || m.tipo === "devolucion" || m.tipo === "ajuste" || m.tipo === "traspaso") ? m.cantidad : (m.consigna ? 0 : -m.cantidad);
      s[m.producto_id] = (s[m.producto_id] || 0) + d;
    });
    return s;
  }
  // Lo que tiene cada tienda a consigna: dejado − vendido − regresado − merma de esa tienda.
  function consignas() {
    var t = {};
    D.movimientos.slice().reverse().forEach(function (m) {
      var esC = m.tipo === "consigna" || (m.consigna && (m.tipo === "venta" || m.tipo === "devolucion" || m.tipo === "merma"));
      if (!esC) return;
      var k = (m.cliente || "Sin nombre").trim();
      var r = t[k] = t[k] || { tienda: k, items: {}, precio: 0, desde: null, ultima: null, vendido: 0, grupos: [] };
      if (m.tipo === "consigna") { r.items[m.producto_id] = (r.items[m.producto_id] || 0) + m.cantidad; r.precio = m.precio; if (!r.desde) r.desde = m.fecha; r.ultima = m.fecha; if (r.grupos.indexOf(m.grupo) < 0) r.grupos.push(m.grupo); }
      else { r.items[m.producto_id] = (r.items[m.producto_id] || 0) - m.cantidad; if (m.tipo === "venta") r.vendido += m.cantidad * m.precio; }
    });
    return Object.keys(t).map(function (k) {
      var r = t[k], n = 0;
      Object.keys(r.items).forEach(function (id) { if (r.items[id] <= 0) delete r.items[id]; else n += r.items[id]; });
      r.bolsas = n; return r;
    }).filter(function (r) { return r.bolsas > 0; }).sort(function (a, b) { return (a.ultima || "").localeCompare(b.ultima || ""); });
  }
  // Estado de cobro de cada consigna: lo vendido, regresado o merma de una tienda se reparte
  // primero a la consigna más vieja (por sabor). Así cada recibo dice si ya se cobró o falta.
  function cobroConsignas() {
    var porTienda = {}, salidas = {}, out = {};
    D.movimientos.slice().reverse().forEach(function (m) {
      var k = (m.cliente || "Sin nombre").trim();
      if (m.tipo === "consigna") { (porTienda[k] = porTienda[k] || []).push(m); return; }
      if (!m.consigna || (m.tipo !== "venta" && m.tipo !== "devolucion" && m.tipo !== "merma")) return;
      var s = salidas[k] = salidas[k] || {}, p = s[m.producto_id] = s[m.producto_id] || { venta: [], devolucion: 0, merma: 0 };
      if (m.tipo === "venta") p.venta.push({ n: m.cantidad, precio: m.precio, fecha: m.fecha }); else p[m.tipo] += m.cantidad;
    });
    Object.keys(porTienda).forEach(function (k) {
      var s = salidas[k] || {};
      porTienda[k].forEach(function (m) {
        var e = out[m.grupo] = out[m.grupo] || { grupo: m.grupo, fecha: m.fecha, dejadas: 0, cobradas: 0, cobrado: 0, regresaron: 0, merma: 0, faltan: 0, precio: m.precio, tienda: k, ultimoCobro: null };
        var falta = m.cantidad, p = s[m.producto_id] || { venta: [], devolucion: 0, merma: 0 };
        e.dejadas += m.cantidad;
        while (falta > 0 && p.venta.length) {
          var v = p.venta[0], t = Math.min(falta, v.n);
          e.cobradas += t; e.cobrado += t * v.precio; falta -= t; v.n -= t;
          if (!e.ultimoCobro || v.fecha > e.ultimoCobro) e.ultimoCobro = v.fecha;
          if (!v.n) p.venta.shift();
        }
        var d = Math.min(falta, p.devolucion); e.regresaron += d; p.devolucion -= d; falta -= d;
        var mm = Math.min(falta, p.merma); e.merma += mm; p.merma -= mm; falta -= mm;
        e.faltan += falta;
      });
    });
    return out;
  }
  // Cuenta de cada tienda: vendido (a precio de consigna) − lo que ha pagado (abonos). Saldo > 0: te debe; < 0: le debes.
  function cuentas() {
    var cob = cobroConsignas(), cu = {};
    var t0 = function (k) { return cu[k] = cu[k] || { tienda: k, n: 0, dejadas: 0, valor: 0, cobradas: 0, cobrado: 0, regresaron: 0, merma: 0, faltan: 0, enTienda: 0, abonado: 0, abonos: [], lista: [] }; };
    Object.keys(cob).forEach(function (k) {
      var c = cob[k], t = t0(c.tienda);
      t.n++; t.lista.push(c); t.dejadas += c.dejadas; t.valor += c.dejadas * c.precio; t.cobradas += c.cobradas; t.cobrado += c.cobrado;
      t.regresaron += c.regresaron; t.merma += c.merma; t.faltan += c.faltan; t.enTienda += c.faltan * c.precio;
    });
    (D.abonos || []).forEach(function (a) { var t = t0((a.tienda || "Sin nombre").trim()); t.abonado += Number(a.monto) || 0; t.abonos.push(a); });
    Object.keys(cu).forEach(function (k) { var t = cu[k]; t.saldo = Math.round((t.cobrado - t.abonado) * 100) / 100; t.porCobrar = Math.max(0, t.enTienda + t.saldo); });
    return cu;
  }
    // Lo que debe la tienda contando lo que sigue en su tienda (vale su precio mientras no lo regrese) − lo que ya pagó.
  function resumenCuenta(t) {
    var total = Math.round((t.enTienda + t.saldo) * 100) / 100;
    var det = [];
    if (t.faltan) det.push(t.faltan + (t.faltan === 1 ? " bolsa" : " bolsas") + " en la tienda (" + pesos(t.enTienda) + ")");
    if (t.saldo > 0) det.push(pesos(t.saldo) + " de lo ya vendido");
    if (t.saldo < 0) det.push("menos " + pesos(-t.saldo) + " que ya pagó de más");
    if (total > 0) return { tipo: "debe", monto: total, titulo: t.faltan ? "Pendiente" : "Te debe", det: det.join(" + ").replace(" + menos", ", menos") };
    if (total < 0) return { tipo: "favor", monto: -total, titulo: "A su favor", det: "ya pagó más de lo que tiene y vendió" };
    return { tipo: "ok", monto: 0, titulo: "Al corriente", det: "no debe nada" };
  }
  function estadoCobro(c) {
    if (!c) return "";
    var extra = (c.regresaron ? " · regresaron " + c.regresaron : "") + (c.merma ? " · merma " + c.merma : "");
    var cobr = c.cobradas ? "vendidas " + c.cobradas + " (" + pesos(c.cobrado) + ")" : "";
    if (!c.faltan) return '<div class="cobro ok">✅ <b>Cerrada</b>' + (cobr ? " · " + cobr : " · no se vendió ninguna") + extra + (c.ultimoCobro ? " · " + esc(fechaBonita(c.ultimoCobro)) : "") + "</div>";
    var pend = c.faltan + (c.faltan === 1 ? " bolsa sigue" : " bolsas siguen") + " en la tienda (" + pesos(c.faltan * c.precio) + ")";
    if (!c.cobradas && !c.regresaron && !c.merma) return '<div class="cobro pend">⏳ <b>Sin pasar a cobrar</b> · ' + pend + "</div>";
    return '<div class="cobro parcial">🟡 <b>En parte</b> · ' + cobr + extra + " · ⏳ " + pend + "</div>";
  }
  function remision(grupo) { return (D.remisiones || []).find(function (r) { return r.grupo === grupo; }) || {}; }
  function ligaRemision(grupo) { return location.origin + "/r/" + grupo; }
  function estadoRemision(grupo) {
    var r = remision(grupo);
    return r.confirmado ? '<span style="color:var(--verde);font-weight:600">✓ Confirmó ' + esc(r.confirmado_por || "la tienda") + "</span>" : '<span style="color:#9A6A25;font-weight:600">⏳ Falta que confirme</span>';
  }
  function diasDesde(f) { return Math.max(0, Math.round((new Date(D.hoy + "T12:00:00") - new Date(f + "T12:00:00")) / 86400000)); }
  function costoPromedio() {
    var n = 0, t = 0;
    D.movimientos.forEach(function (m) { if (m.tipo === "entrada" && m.precio > 0) { n += m.cantidad; t += m.cantidad * m.precio; } });
    return n ? t / n : Number(D.ajustes.costo) || 0;
  }
  function enPeriodo(m) {
    if (periodo === "todo") return true;
    if (periodo === "hoy") return m.fecha === D.hoy;
    if (periodo === "mes") return m.fecha.slice(0, 7) === D.hoy.slice(0, 7);
    return m.fecha > restarDias(D.hoy, Number(periodo));
  }
  function precioPublico() {
    var ps = D.ajustes.precios.map(function (p) { return Number(p.valor) || 0; });
    return ps.length ? Math.max.apply(null, ps) : 0;
  }
  function nombrePrecio(v) {
    var p = D.ajustes.precios.find(function (x) { return Number(x.valor) === Number(v); });
    return p ? p.nombre : "Otro precio";
  }
  function grupos(movs) {
    var g = {}, orden = [];
    movs.forEach(function (m) {
      if (!g[m.grupo]) { g[m.grupo] = { grupo: m.grupo, tipo: m.tipo, consigna: m.consigna, fecha: m.fecha, quien: m.quien, cliente: m.cliente, nota: m.nota, precio: m.precio, creado: m.creado, items: [], anticipo: 0 }; orden.push(m.grupo); }
      g[m.grupo].items.push(m); g[m.grupo].anticipo += Number(m.anticipo) || 0;
    });
    return orden.map(function (k) { return g[k]; });
  }

  // ——— carga
  function cargar() {
    return api("GET", "/datos").then(function (d) {
      if (d._status === 401) { D = null; pintarLogin(); return; }
      if (!d.ok) { app.innerHTML = '<p class="cargando">' + esc(d.error || "No se pudo cargar.") + ' <button class="enlace" id="re">Reintentar</button></p>'; document.getElementById("re").onclick = cargar; return; }
      D = d; D.hoy = hoyLocal() > d.hoy ? hoyLocal() : d.hoy;
      D.movTodos = d.movimientos; D.gasTodos = d.gastos || []; D.ptsTodos = d.puntos || []; D.aboTodos = d.abonos || [];
      D.ciudades = d.ciudades || [];
      if (!ciudad || (ciudad !== "todas" && !D.ciudades.some(function (c) { return c.id === ciudad; }))) ciudad = d.miCiudad || (D.ciudades[0] || {}).id || "chihuahua";
      filtrarCiudad();
      pintar();
    });
  }

  function filtrarCiudad() {
    var es = function (x) { return ciudad === "todas" || (x.ciudad || "chihuahua") === ciudad; };
    D.movimientos = D.movTodos.filter(es); D.gastos = D.gasTodos.filter(es); D.puntos = D.ptsTodos.filter(es); D.abonos = (D.aboTodos || []).filter(es);
  }
  function variasCiudades() { return D && D.ciudades && D.ciudades.length > 1; }
  function nombreCiudad(id) { if (id === "todas") return "Todas las ciudades"; var c = (D.ciudades || []).find(function (x) { return x.id === id; }); return c ? c.nombre : id; }

  // ——— login
  function pintarLogin(emailPrevio) {
    var paso2 = !!emailPrevio;
    app.innerHTML = '<div class="login"><form id="fl" novalidate>' +
      '<img src="/img/logo-tinta.svg" alt="Crunchitos">' +
      '<h1>Panel del equipo</h1>' +
      (paso2
        ? '<p>Te mandamos un código a <strong>' + esc(emailPrevio) + '</strong>. Revisa también spam.</p>' +
          '<label>Código de 6 dígitos<input class="codigo" id="cod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>' +
          '<button class="btn" type="submit">Entrar</button><button class="enlace" type="button" id="otro">Usar otro correo</button>'
        : '<p>Sin contraseñas: te llega un código a tu correo.</p>' +
          '<label>Tu correo<input type="email" id="em" autocomplete="email" inputmode="email" required></label>' +
          '<button class="btn" type="submit">Mandarme código</button>') +
      '<p class="error" id="err" role="alert"></p></form></div>';
    var f = document.getElementById("fl"), err = document.getElementById("err");
    var campo = document.getElementById(paso2 ? "cod" : "em"); campo.focus();
    if (paso2) document.getElementById("otro").onclick = function () { pintarLogin(); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var b = f.querySelector("[type=submit]"); b.disabled = true; err.textContent = "";
      var p = paso2
        ? api("POST", "/login/verificar", { email: emailPrevio, codigo: campo.value })
        : api("POST", "/login/codigo", { email: campo.value });
      p.then(function (r) {
        b.disabled = false;
        if (!r.ok) { err.textContent = r.error || "Algo falló."; return; }
        if (paso2) { app.innerHTML = '<p class="cargando">Entrando…</p>'; cargar(); }
        else { pintarLogin(campo.value.trim().toLowerCase()); if (r.prueba) document.getElementById("cod").value = r.prueba; }
      });
    };
  }

  // ——— estructura
  function pintar() {
    var tabs = [["inicio", "Inicio"], ["vender", "Vender"], ["gastos", "Gastos"], ["inventario", "Inventario"], ["historial", "Historial"], ["archivos", "Archivos"], ["ajustes", "Ajustes"]];
    app.innerHTML =
      '<header class="top"><img src="/img/logo.svg" alt="Crunchitos"><div class="quien">' +
      esc(nombrePersona(D.yo)) +
      ' <a class="enlace" href="/" target="_blank" rel="noopener">Página</a> <a class="enlace" href="/kit/" target="_blank" rel="noopener">Kit</a> <button class="enlace" id="salir">Salir</button></div></header>' +
      (variasCiudades() ? '<div class="ciudadbar"><label for="selciudad">Ciudad</label><select id="selciudad">' +
        D.ciudades.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === ciudad ? " selected" : "") + ">" + esc(c.nombre) + "</option>"; }).join("") +
        '<option value="todas"' + (ciudad === "todas" ? " selected" : "") + ">Todas juntas</option></select></div>" : "") +
      '<main id="vista"></main>' +
      '<nav class="tabs" aria-label="Secciones">' + tabs.map(function (t) {
        var actual = vista === "liquidar" || vista === "entrada" || vista === "remision" || vista === "conteo" || vista === "traspaso" ? "inventario" : vista;
        return '<button data-v="' + t[0] + '"' + (actual === t[0] ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[t[0]] + "</svg>" + t[1] + "</button>";
      }).join("") + "</nav>";
    document.getElementById("salir").onclick = function () { api("POST", "/logout").then(function () { pintarLogin(); }); };
    app.querySelectorAll(".tabs button").forEach(function (b) {
      b.onclick = function () { ir(b.getAttribute("data-v")); };
    });
    var sc = document.getElementById("selciudad");
    if (sc) sc.onchange = function () { ciudad = sc.value; try { localStorage.setItem("crunchitos-ciudad", ciudad); } catch (e) {} filtrarCiudad(); form = null; gform = null; pintar(); };
    var v = document.getElementById("vista");
    if (ciudad === "todas" && ["vender", "gastos", "entrada", "conteo", "liquidar", "traspaso"].indexOf(vista) >= 0) {
      v.innerHTML = '<div class="caja" style="margin-top:20px;text-align:center"><h3>Elige una ciudad</h3><p class="vacio" style="margin:8px 0 14px">Con "Todas" solo se ven los números juntos. Para registrar, elige arriba en qué ciudad.</p>' +
        D.ciudades.map(function (c) { return '<button class="btn chico" style="margin:4px" data-elegirc="' + esc(c.id) + '">' + esc(c.nombre) + "</button>"; }).join("") + "</div>";
      v.querySelectorAll("[data-elegirc]").forEach(function (b) { b.onclick = function () { ciudad = b.getAttribute("data-elegirc"); try { localStorage.setItem("crunchitos-ciudad", ciudad); } catch (e) {} filtrarCiudad(); pintar(); }; });
      return;
    }
    ({ inicio: vInicio, vender: vVender, gastos: vGastos, inventario: vInventario, historial: vHistorial, archivos: vArchivos, ajustes: vAjustes, entrada: vVender, liquidar: vLiquidar, remision: vRemision, conteo: vConteo, traspaso: vTraspaso })[vista](v);
  }
  function ir(v) {
    vista = v;
    if (v === "vender") form = nuevoForm("venta");
    if (v === "entrada") form = nuevoForm("entrada");
    if (v === "gastos") gform = null;
    pintar(); window.scrollTo(0, 0);
  }

  // ——— inicio (reportes)
  function vInicio(v) {
    var st = stock(), cp = costoPromedio();
    var movs = D.movimientos.filter(enPeriodo);
    var ventas = movs.filter(function (m) { return m.tipo === "venta"; });
    var bolsas = 0, dinero = 0;
    ventas.forEach(function (m) { bolsas += m.cantidad; dinero += m.cantidad * m.precio; });
    var tomadas = 0, merma = 0;
    movs.forEach(function (m) { if (m.tipo === "tomada") tomadas += m.cantidad; if (m.tipo === "merma") merma += m.cantidad; });
    var enStock = 0; Object.keys(st).forEach(function (k) { enStock += Math.max(0, st[k]); });
    var gastos = (D.gastos || []).filter(enPeriodo), totGastos = 0, porCat = {}, porPago = {};
    gastos.forEach(function (g) { totGastos += g.monto; porCat[g.categoria] = (porCat[g.categoria] || 0) + g.monto; porPago[g.pago] = (porPago[g.pago] || 0) + g.monto; });
    var gananciaBolsas = dinero - bolsas * cp;
    var llego = {}; D.movimientos.forEach(function (m) { if (m.tipo === "entrada") llego[m.producto_id] = 1; });
    var bajos = D.productos.filter(function (p) { return llego[p.id] && st[p.id] <= (D.ajustes.stockBajo || 0); });

    var porPrecio = {}, porSabor = {}, porPersona = {}, porCliente = {};
    ventas.forEach(function (m) {
      var k = String(m.precio);
      porPrecio[k] = porPrecio[k] || { b: 0, d: 0 }; porPrecio[k].b += m.cantidad; porPrecio[k].d += m.cantidad * m.precio;
      porSabor[m.producto_id] = (porSabor[m.producto_id] || 0) + m.cantidad;
      porPersona[m.quien] = porPersona[m.quien] || { b: 0, d: 0 }; porPersona[m.quien].b += m.cantidad; porPersona[m.quien].d += m.cantidad * m.precio;
      if (m.cliente) { var c = m.cliente.trim(); porCliente[c] = porCliente[c] || { b: 0, d: 0 }; porCliente[c].b += m.cantidad; porCliente[c].d += m.cantidad * m.precio; }
    });
    var periodos = [["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["mes", "Este mes"], ["todo", "Todo"]];
    var h = '<div class="fila entre" style="align-items:center"><h2>Cómo vamos</h2><button class="btn chico verde" id="repimg">Compartir reporte</button></div>' +
      '<div class="chips" role="group" aria-label="Periodo" style="margin-bottom:14px">' + periodos.map(function (p) {
        return '<button class="chip" data-p="' + p[0] + '" aria-pressed="' + (periodo === p[0]) + '">' + p[1] + "</button>";
      }).join("") + "</div>";
    if (bajos.length) h += '<div class="alerta"><strong>Se están acabando:</strong> ' + bajos.map(function (p) { return esc(p.nombre_base + " " + p.sabor) + " (" + st[p.id] + ")"; }).join(", ") + "</div>";
    // Dinero de hoy (siempre todo el historial, no depende del periodo)
    var cobrado = 0, deCaja = 0, debe = {};
    var antic = 0;
    D.movimientos.forEach(function (m) { if (m.tipo === "venta" && !m.consigna) cobrado += m.cantidad * m.precio; if (m.tipo === "apartado") antic += Number(m.anticipo) || 0; });
    (D.abonos || []).forEach(function (a) { cobrado += Number(a.monto) || 0; }); // lo que pagan las tiendas a consigna (o sus clientes directo)
    cobrado += antic; // anticipos de apartados ya están en caja; al entregar, la venta los incluye
    (D.gastos || []).forEach(function (g) { if (g.pago === "caja") deCaja += g.monto; else debe[g.pago] = (debe[g.pago] || 0) + g.monto; });
    var pc = 0, pcB = 0, pcT = consignas(), cuI = cuentas(); pcT.forEach(function (c) { pcB += c.bolsas; });
    Object.keys(cuI).forEach(function (k) { pc += cuI[k].porCobrar; });
    var apB = 0, apV = 0; D.movimientos.forEach(function (m) { if (m.tipo === "apartado") { apB += m.cantidad; apV += m.cantidad * m.precio; } });
    apV = Math.max(0, apV - antic);
    var deudas = Object.keys(debe);
    var cajaH = '<div class="kpis" style="margin-bottom:16px">' +
      '<div class="kpi verde"><span>En caja (en teoría)</span><strong>' + pesos(cobrado - deCaja) + "</strong><small>cobrado " + pesos(cobrado) + (antic ? " (incluye " + pesos(antic) + " de anticipos)" : "") + " − gastos de caja " + pesos(deCaja) + "</small></div>" +
      '<div class="kpi"><span>Por cobrar</span><strong>' + pesos(pc + apV) + "</strong><small>" + (pcB ? num(pcB) + " bolsas a consigna en " + pcT.length + (pcT.length === 1 ? " tienda" : " tiendas") : "nada a consigna") + (apB ? " · " + num(apB) + " apartadas" : "") + "</small></div>" +
      (deudas.length ? '<div class="kpi" style="grid-column:1/-1"><span>Se le debe por gastos que pagó de su bolsa</span><small style="font-size:15px">' + deudas.map(function (k) { return esc(nombrePersona(k)) + ": <b>" + pesos(debe[k]) + "</b>"; }).join(" · ") + "</small></div>" : "") +
      "</div>";
    h = h.replace('<div class="chips" role="group" aria-label="Periodo"', cajaH + '<div class="chips" role="group" aria-label="Periodo"');
    h += '<div class="kpis">' +
      '<div class="kpi amarillo"><span>Vendido</span><strong>' + pesos(dinero) + "</strong><small>" + num(bolsas) + " bolsas" + (bolsas ? " · prom. " + pesos(dinero / bolsas) : "") + "</small></div>" +
      '<div class="kpi"><span>Ganancia de las bolsas</span><strong>' + pesos(gananciaBolsas) + "</strong><small>costo " + pesos(cp) + " por bolsa</small></div>" +
      '<div class="kpi"><span>Gastos</span><strong>' + pesos(totGastos) + "</strong><small>" + gastos.length + (gastos.length === 1 ? " gasto" : " gastos") + "</small></div>" +
      '<div class="kpi ' + (gananciaBolsas - totGastos < 0 ? "rojo" : "verde") + '"><span>Ganancia real</span><strong>' + pesos(gananciaBolsas - totGastos) + "</strong><small>ganancia menos gastos</small></div>" +
      '<div class="kpi"><span>En bodega</span><strong>' + num(enStock) + "</strong><small>" + pesos(enStock * cp) + " a costo</small></div>" +
      (function () { var cs = consignas(), n = 0, v = 0; cs.forEach(function (c) { n += c.bolsas; v += c.bolsas * c.precio; });
        return '<div class="kpi"><span>En tiendas (consigna)</span><strong>' + num(n) + "</strong><small>" + (n ? pesos(v) + " si se venden · " + cs.length + (cs.length === 1 ? " tienda" : " tiendas") : "nada a consigna") + "</small></div>"; })() +
      '<div class="kpi"><span>Tomadas / merma</span><strong>' + num(tomadas + merma) + "</strong><small>" + pesos((tomadas + merma) * cp) + " a costo</small></div></div>";

    var filasPrecio = Object.keys(porPrecio).sort(function (a, b) { return a - b; });
    h += '<div class="caja"><h3>Ventas por precio</h3>' + (filasPrecio.length
      ? "<table><thead><tr><th>Precio</th><th class=num>Bolsas</th><th class=num>Vendido</th><th class=num>Ganancia</th></tr></thead><tbody>" +
        filasPrecio.map(function (k) {
          var r = porPrecio[k];
          return "<tr><td><strong>" + pesos(Number(k)) + "</strong> <small>" + esc(nombrePrecio(k)) + "</small></td><td class=num>" + num(r.b) + "</td><td class=num>" + pesos(r.d) + "</td><td class=num>" + pesos(r.d - r.b * cp) + "</td></tr>";
        }).join("") + "</tbody><tfoot><tr><td>Total</td><td class=num>" + num(bolsas) + "</td><td class=num>" + pesos(dinero) + "</td><td class=num>" + pesos(dinero - bolsas * cp) + "</td></tr></tfoot></table>"
      : '<p class="vacio">Sin ventas en este periodo.</p>') + "</div>";

    var sabores = Object.keys(porSabor).sort(function (a, b) { return porSabor[b] - porSabor[a]; });
    var max = sabores.length ? porSabor[sabores[0]] : 1;
    h += '<div class="caja"><h3>Lo que más se vende</h3>' + (sabores.length ? sabores.map(function (id) {
      var p = D.productos.find(function (x) { return x.id === id; }) || {};
      return '<div style="margin-bottom:8px"><div class="fila entre" style="font-size:14px"><span><span class="punto" style="background:' + esc(p.color) + '"></span>' + esc(nombreProd(id)) + "</span><strong>" + porSabor[id] + "</strong></div>" +
        '<div style="height:8px;background:var(--crema);border-radius:9px;margin-top:4px"><div style="height:8px;border-radius:9px;background:' + esc(p.color || "#ECBE48") + ";width:" + Math.max(4, porSabor[id] / max * 100) + '%"></div></div></div>';
    }).join("") : '<p class="vacio">Sin ventas en este periodo.</p>') + "</div>";

    var cats = Object.keys(porCat).sort(function (a, b) { return porCat[b] - porCat[a]; });
    h += '<div class="caja"><div class="fila entre"><h3>Gastos</h3><button class="enlace" id="irgastos">+ Registrar gasto</button></div>' + (cats.length
      ? "<table><tbody>" + cats.map(function (c) { return "<tr><td>" + esc(CAT[c] || c) + "</td><td class=num>" + pesos(porCat[c]) + "</td></tr>"; }).join("") +
        "</tbody><tfoot><tr><td>Total</td><td class=num>" + pesos(totGastos) + "</td></tr></tfoot></table>" +
        '<h3 style="margin-top:16px">Quién ha puesto</h3><table><tbody>' + Object.keys(porPago).map(function (q) { return "<tr><td>" + esc(nombrePersona(q)) + "</td><td class=num>" + pesos(porPago[q]) + "</td></tr>"; }).join("") + "</tbody></table>"
      : '<p class="vacio">Sin gastos en este periodo.</p>') + "</div>";
    var personas = Object.keys(porPersona);
    if (personas.length) {
      h += '<div class="caja"><h3>Quién vendió</h3><table><tbody>' + personas.map(function (q) {
        return "<tr><td>" + esc(nombrePersona(q)) + "</td><td class=num>" + num(porPersona[q].b) + " bolsas</td><td class=num>" + pesos(porPersona[q].d) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    }
    var clientes = Object.keys(porCliente).sort(function (a, b) { return porCliente[b].d - porCliente[a].d; }).slice(0, 10);
    h += '<div class="caja"><h3>Mejores clientes</h3>' + (clientes.length ? "<table><tbody>" + clientes.map(function (c) {
      return "<tr><td>" + esc(c) + "</td><td class=num>" + num(porCliente[c].b) + " bolsas</td><td class=num>" + pesos(porCliente[c].d) + "</td></tr>";
    }).join("") + "</tbody></table>" : '<p class="vacio">Cuando pongas el nombre del cliente en la venta, aquí ves quién te compra más.</p>') + "</div>";
    v.innerHTML = h;
    var nomPer = { hoy: "Hoy", "7": "Últimos 7 días", "30": "Últimos 30 días", mes: "Este mes", todo: "Desde el inicio" }[periodo] || "";
    document.getElementById("repimg").onclick = function () {
      var cs = consignas(), tn = 0; cs.forEach(function (c) { tn += c.bolsas; });
      imagenReporte({
        periodo: (variasCiudades() ? nombreCiudad(ciudad) + " · " : "") + nomPer,
        caja: cobrado - deCaja, porCobrar: pc + apV, pcTxt: (pcB ? pcB + " a consigna" : "") + (apB ? (pcB ? " · " : "") + apB + " apartadas" : ""),
        vendido: dinero, bolsas: bolsas, ganBolsas: gananciaBolsas, cp: cp, gastos: totGastos, real: gananciaBolsas - totGastos,
        bodega: enStock, tiendas: tn, merma: tomadas + merma,
        precios: filasPrecio.map(function (k) { return [pesos(Number(k)) + " " + nombrePrecio(k), porPrecio[k].b, porPrecio[k].d]; }),
        sabores: sabores.slice(0, 5).map(function (id) { var p = D.productos.find(function (x) { return x.id === id; }) || {}; return [nombreProd(id), porSabor[id], p.color]; }),
        gastosCat: cats.map(function (c) { return [CAT[c] || c, porCat[c]]; }),
        quien: Object.keys(porPersona).map(function (q) { return [nombrePersona(q), porPersona[q].b, porPersona[q].d]; }),
        debe: deudas.map(function (k) { return [nombrePersona(k), debe[k]]; }),
        bajos: bajos.map(function (p) { return p.nombre_base + " " + p.sabor + " (" + st[p.id] + ")"; })
      }, this);
    };
    v.querySelectorAll("[data-p]").forEach(function (b) { b.onclick = function () { periodo = b.getAttribute("data-p"); pintar(); }; });
    document.getElementById("irgastos").onclick = function () { ir("gastos"); };
  }

  // ——— gastos
  var CAT = { etiquetas: "Etiquetas e impresión", envio: "Envío de la fábrica", gasolina: "Gasolina", empaque: "Empaque", publicidad: "Publicidad", otro: "Otro" };
  var gform = null;
  function vGastos(v) {
    if (!gform) gform = { monto: "", concepto: "", categoria: "envio", pago: "caja", fecha: D.hoy, nota: "" };
    var g = gform;
    var personas = ["caja", D.dueno].concat(D.equipo.map(function (e) { return e.email; }));
    var h = "<h2>Gastos</h2>" +
      '<form class="caja" id="fg" novalidate>' +
      '<label>Monto<input id="gmonto" inputmode="decimal" placeholder="$0" value="' + esc(g.monto) + '" style="font-size:24px;font-weight:700"></label>' +
      '<h3 style="margin:14px 0 8px">Categoría</h3><div class="chips">' + Object.keys(CAT).map(function (c) {
        return '<button type="button" class="chip" data-cat="' + c + '" aria-pressed="' + (g.categoria === c) + '">' + CAT[c] + "</button>";
      }).join("") + "</div>" +
      '<label style="margin-top:12px">Concepto<input id="gconcepto" value="' + esc(g.concepto) + '" placeholder="Ej. 20 hojas de calcomanías"></label>' +
      '<h3 style="margin:14px 0 8px">¿Quién lo pagó?</h3><div class="chips">' + personas.map(function (p) {
        return '<button type="button" class="chip" data-pago="' + esc(p) + '" aria-pressed="' + (g.pago === p) + '">' + esc(nombrePersona(p)) + "</button>";
      }).join("") + "</div>" +
      '<div class="rejilla2" style="margin-top:12px"><label>Fecha<input type="date" id="gfecha" value="' + esc(g.fecha) + '" max="' + esc(D.hoy) + '"></label>' +
      '<label>Nota (opcional)<input id="gnota" value="' + esc(g.nota) + '"></label></div>' +
      '<p class="error" id="gerr" role="alert" style="margin-top:10px"></p>' +
      '<button class="btn" style="width:100%;margin-top:6px" id="gguardar">Guardar gasto</button></form>';
    var lista = (D.gastos || []).slice(0, 100);
    h += '<div class="fila entre" style="margin:18px 0 10px"><h3 style="margin:0">Últimos gastos</h3><a class="btn chico claro" href="/api/gastos.csv">Descargar Excel</a></div>';
    h += lista.length ? lista.map(function (x) {
      return '<div class="mov"><div class="cab"><span><span class="pill p-gasto">' + esc(CAT[x.categoria] || x.categoria) + "</span> " + esc(fechaBonita(x.fecha)) + "</span><span>Pagó " + esc(nombrePersona(x.pago)) + "</span></div>" +
        (x.concepto ? '<div style="font-weight:600;margin-top:6px">' + esc(x.concepto) + "</div>" : "") +
        (x.nota ? '<div style="font-size:13px;color:var(--suave);margin-top:4px">' + esc(x.nota) + "</div>" : "") +
        '<div class="pie" style="margin-top:8px"><strong>' + pesos(x.monto) + '</strong><button class="btn chico peligro" data-borrarg="' + x.id + '">Borrar</button></div></div>';
    }).join("") : '<p class="vacio">Todavía no hay gastos. Registra el primero: etiquetas, envío, gasolina…</p>';
    v.innerHTML = h;
    function leer() {
      g.monto = document.getElementById("gmonto").value; g.concepto = document.getElementById("gconcepto").value;
      g.fecha = document.getElementById("gfecha").value || D.hoy; g.nota = document.getElementById("gnota").value;
    }
    v.querySelectorAll("[data-cat]").forEach(function (b) { b.onclick = function () { leer(); g.categoria = b.getAttribute("data-cat"); pintar(); }; });
    v.querySelectorAll("[data-pago]").forEach(function (b) { b.onclick = function () { leer(); g.pago = b.getAttribute("data-pago"); pintar(); }; });
    document.getElementById("fg").onsubmit = function (e) {
      e.preventDefault(); leer();
      var monto = parseFloat(String(g.monto).replace(/[$,\s]/g, ""));
      var err = document.getElementById("gerr"), b = document.getElementById("gguardar");
      if (!(monto > 0)) { err.textContent = "Pon el monto del gasto."; return; }
      b.disabled = true;
      api("POST", "/gastos", { monto: monto, concepto: g.concepto, categoria: g.categoria, pago: g.pago, fecha: g.fecha, nota: g.nota }).then(function (r) {
        b.disabled = false;
        if (r._status === 401) { pintarLogin(); return; }
        if (!r.ok) { err.textContent = r.error || "No se pudo guardar."; aviso(r.error || "No se pudo guardar", true); err.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
        aviso("Gasto guardado"); gform = null; cargar();
      });
    };
    v.querySelectorAll("[data-borrarg]").forEach(function (b) {
      b.onclick = function () {
        if (!b.classList.contains("seguro")) { b.classList.add("seguro"); b.textContent = "¿Seguro? Toca otra vez"; setTimeout(function () { b.classList.remove("seguro"); b.textContent = "Borrar"; }, 4000); return; }
        b.disabled = true;
        api("DELETE", "/gastos/" + b.getAttribute("data-borrarg")).then(function (r) { aviso(r.ok ? "Borrado" : (r.error || "No se pudo borrar.")); cargar(); });
      };
    });
  }

  // ——— vender / registrar movimiento
  function nuevoForm(tipo) {
    var precios = D.ajustes.precios;
    var def = precios.find(function (p) { return /emprendedor|distrib/i.test(p.nombre); }) || precios[0];
    return { tipo: tipo, items: {}, precio: tipo === "entrada" ? Number(D.ajustes.costo) : (def ? Number(def.valor) : 0), cliente: "", nota: "", fecha: D.hoy, enviando: false };
  }
  function vVender(v) {
    if (!form) form = nuevoForm(vista === "entrada" ? "entrada" : "venta");
    var st = stock(), f = form, esEntrada = f.tipo === "entrada";
    var titulos = { venta: "Registrar venta", consigna: "Dejar a consigna", apartado: "Apartar bolsas", entrada: "Llegó mercancía", tomada: "Bolsas que se tomaron", merma: "Merma (rotas o caducadas)" };
    var h = "<h2>" + titulos[f.tipo] + "</h2>";
    if (!esEntrada) {
      h += '<div class="chips" role="group" aria-label="Tipo" style="margin-bottom:14px">' + [["venta", "Venta"], ["apartado", "Apartar"], ["consigna", "Consigna"], ["tomada", "Me llevé / regalo"], ["merma", "Merma"]].map(function (t) {
        return '<button class="chip" data-t="' + t[0] + '" aria-pressed="' + (f.tipo === t[0]) + '">' + t[1] + "</button>";
      }).join("") + "</div>";
    } else {
      h += '<p class="vacio" style="margin:-4px 0 14px">Pon cuántas bolsas llegaron de cada sabor.</p>';
    }
    h += '<div class="sabores">' + D.productos.map(function (p) {
      var n = f.items[p.id] || 0, hay = st[p.id] || 0;
      return '<div class="it' + (n ? " lleva" : "") + '"><img src="/img/etiquetas/' + esc(p.id) + '.webp" alt="" loading="lazy">' +
        '<div class="nom">' + esc(p.nombre_base + " " + p.sabor) + '<small class="' + (hay <= (D.ajustes.stockBajo || 0) ? "bajo" : "") + '">Quedan ' + hay + "</small></div>" +
        '<div class="paso"><button type="button" data-menos="' + esc(p.id) + '" aria-label="Quitar una de ' + esc(p.nombre_base + " " + p.sabor) + '">−</button>' +
        '<input inputmode="numeric" data-n="' + esc(p.id) + '" value="' + (n || "") + '" placeholder="0" aria-label="Bolsas de ' + esc(p.nombre_base + " " + p.sabor) + '">' +
        '<button type="button" data-mas="' + esc(p.id) + '" aria-label="Agregar una de ' + esc(p.nombre_base + " " + p.sabor) + '">+</button></div></div>';
    }).join("") + "</div>";

    h += '<div class="caja" style="margin-top:14px">';
    if (f.tipo === "venta" || f.tipo === "consigna" || f.tipo === "apartado") {
      var esCons = f.tipo === "consigna", esAp = f.tipo === "apartado";
      if (esAp) h += '<label style="margin:0 0 12px">¿Ya te dio algo? (anticipo, opcional)<input id="fanticipo" inputmode="decimal" value="' + (f.anticipo || "") + '" placeholder="$0"></label>';
      if (esAp) h += '<p class="vacio" style="margin:0 0 10px">Las bolsas quedan separadas para esa persona: ya no cuentan como disponibles, pero todavía no son venta. Cuando las entregues, en Inventario → Apartados tocas "Entregar".</p>';
      if (esCons) h += '<p class="vacio" style="margin:0 0 10px">Las bolsas salen de tu inventario pero no cuentan como vendidas. Cuando pases a cobrar, en Inventario → En consigna marcas cuántas se vendieron.</p>';
      h += "<h3>" + (esCons || esAp ? "Precio acordado por bolsa" : "¿A cuánto la vendiste?") + "</h3><div class=\"chips\" style=\"margin-bottom:10px\">" + D.ajustes.precios.map(function (p) {
        return '<button class="chip" type="button" data-precio="' + Number(p.valor) + '" aria-pressed="' + (Number(p.valor) === Number(f.precio)) + '">' + (Number(p.valor) % 1 ? "$" + Number(p.valor).toFixed(2) : pesos(p.valor)) + " · " + esc(p.nombre) + "</button>";
      }).join("") + "</div>" +
        '<div class="rejilla2"><label>Precio por bolsa<input id="fprecio" inputmode="decimal" value="' + (f.precio || "") + '"></label>' +
        '<label>' + (esAp ? "Total" : "Total cobrado") + '<input id="ftotal" inputmode="decimal" value="' + (totalBolsas() && f.precio ? redondo(totalBolsas() * f.precio) : "") + '" placeholder="$0"></label></div>' +
        '<p class="vacio" style="margin-top:6px;font-size:13px">Toca un precio o escribe el tuyo ($35, $45, $47…). Si diste un trato (ej. 3 por $100), pon el total y se calcula solo.</p>';
      var nombres = {}; D.movimientos.forEach(function (m) { if (m.cliente && (!esCons || m.tipo === "consigna")) nombres[m.cliente] = 1; });
      var conocidas = esCons ? Object.keys(nombres) : [];
      if (conocidas.length) h += '<p style="margin:12px 0 6px;font-size:14px;font-weight:600">Tiendas que ya tienes (toca una):</p><div class="chips" id="tiendas">' +
        conocidas.map(function (n) { return '<button type="button" class="chip" data-tienda="' + esc(n) + '" aria-pressed="' + (f.cliente === n) + '">' + esc(n) + "</button>"; }).join("") + "</div>";
      h += '<div class="rejilla2" style="margin-top:10px"><label>' + (esAp ? "¿Para quién?" : esCons ? (conocidas.length ? "O escribe una nueva" : "Tienda o persona") : "Cliente (opcional)") + '<input id="fcliente" list="lclientes" value="' + esc(f.cliente) + '" placeholder="' + (esCons ? "Ej. Abarrotes Doña Mary" : "Ej. Gym Fuerza") + '"></label>' +
        '<label>Fecha<input type="date" id="ffecha" value="' + esc(f.fecha) + '" max="' + esc(D.hoy) + '"></label></div>' +
        (esCons ? '<label style="margin-top:10px">WhatsApp de la tienda (opcional, para mandarle el recibo)<input id="ftel" inputmode="tel" value="' + esc(f.telefono || "") + '" placeholder="10 dígitos"></label>' : "") +
        '<datalist id="lclientes">' + Object.keys(nombres).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist>";
    } else if (esEntrada) {
      h += '<div class="rejilla2"><label>Costo por bolsa<input id="fprecio" inputmode="decimal" value="' + (f.precio || "") + '"></label>' +
        '<label>Fecha<input type="date" id="ffecha" value="' + esc(f.fecha) + '" max="' + esc(D.hoy) + '"></label></div>';
    } else {
      h += '<label>Fecha<input type="date" id="ffecha" value="' + esc(f.fecha) + '" max="' + esc(D.hoy) + '"></label>';
    }
    h += '<label style="margin-top:10px">Nota (opcional)<input id="fnota" value="' + esc(f.nota) + '" placeholder="' + (f.tipo === "venta" ? "Ej. me pagó por transferencia" : esEntrada ? "Ej. segundo envío de la fábrica" : "Ej. muestras para un café") + '"></label>';
    h += '<p class="error" id="ferr" role="alert" style="margin-top:10px"></p></div>';
    if (esEntrada) h += '<button class="enlace" id="cancelar">Cancelar</button>';
    h += '<div class="barra"><button class="btn ' + (f.tipo === "venta" ? "verde" : f.tipo === "consigna" || f.tipo === "apartado" ? "morado" : "") + '" id="guardar"></button></div>';
    v.innerHTML = h;
    v.querySelectorAll("[data-tienda]").forEach(function (b) {
      b.onclick = function () {
        guardarCampos();
        var n = b.getAttribute("data-tienda"); form.cliente = n;
        // Si ya le habíamos mandado recibo, reusa su WhatsApp.
        D.movimientos.some(function (m) {
          if (m.tipo === "consigna" && m.cliente === n) { var r = remision(m.grupo); if (r.telefono) { form.telefono = r.telefono.replace(/^52/, ""); return true; } }
          return false;
        });
        pintar();
      };
    });
    resumenBoton();

    v.querySelectorAll("[data-t]").forEach(function (b) { b.onclick = function () { f.tipo = b.getAttribute("data-t"); pintar(); }; });
    v.querySelectorAll("[data-mas],[data-menos]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-mas") || b.getAttribute("data-menos");
        var n = (f.items[id] || 0) + (b.hasAttribute("data-mas") ? 1 : -1);
        f.items[id] = Math.max(0, n);
        var inp = v.querySelector('[data-n="' + id + '"]'); inp.value = f.items[id] || "";
        inp.closest(".it").classList.toggle("lleva", !!f.items[id]);
        sincPrecio("precio");
      };
    });
    v.querySelectorAll("[data-n]").forEach(function (inp) {
      inp.oninput = function () {
        var id = inp.getAttribute("data-n"), n = parseInt(inp.value.replace(/\D/g, ""), 10) || 0;
        f.items[id] = n; inp.closest(".it").classList.toggle("lleva", !!n); sincPrecio("precio");
      };
    });
    function sincPrecio(desde) {
      var fp = document.getElementById("fprecio"), ft = document.getElementById("ftotal"), n = totalBolsas();
      if (desde !== "precio" && fp) fp.value = f.precio || "";
      if (desde !== "total" && ft) ft.value = n && f.precio ? redondo(n * f.precio) : "";
      v.querySelectorAll("[data-precio]").forEach(function (c) { c.setAttribute("aria-pressed", String(Number(c.getAttribute("data-precio")) === Number(f.precio))); });
      resumenBoton();
    }
    v.querySelectorAll("[data-precio]").forEach(function (b) {
      b.onclick = function () { f.precio = Number(b.getAttribute("data-precio")); sincPrecio(); };
    });
    var fpI = document.getElementById("fprecio"), ftI = document.getElementById("ftotal");
    if (fpI) fpI.oninput = function () { f.precio = parseFloat(String(fpI.value).replace(/[$,\s]/g, "")) || 0; if (ftI) sincPrecio("precio"); else resumenBoton(); };
    if (ftI) ftI.oninput = function () {
      var t = parseFloat(String(ftI.value).replace(/[$,\s]/g, "")) || 0, n = totalBolsas();
      if (n) { f.precio = redondo(t / n); sincPrecio("total"); }
    };
    ["fcliente", "ffecha", "fnota", "ftel", "fanticipo"].forEach(function (id) {
      var e = document.getElementById(id); if (e) e.oninput = function () { guardarCampos(); resumenBoton(); };
    });
    var c = document.getElementById("cancelar"); if (c) c.onclick = function () { ir("inventario"); };
    document.getElementById("guardar").onclick = function () { enviar(false); };
  }
  function guardarCampos() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (g("fprecio") !== null) form.precio = parseFloat(String(g("fprecio")).replace(/[$,\s]/g, "")) || 0;
    if (g("fcliente") !== null) form.cliente = g("fcliente");
    if (g("ftel") !== null) form.telefono = g("ftel");
    if (g("ffecha") !== null) form.fecha = g("ffecha") || D.hoy;
    if (g("fnota") !== null) form.nota = g("fnota");
    if (g("fanticipo") !== null) form.anticipo = parseFloat(String(g("fanticipo")).replace(/[$,\s]/g, "")) || 0;
  }
  function totalBolsas() {
    var t = 0; Object.keys(form.items).forEach(function (k) { t += form.items[k] || 0; }); return t;
  }
  function resumenBoton() {
    var b = document.getElementById("guardar"); if (!b) return;
    var n = totalBolsas();
    var etiqueta = { venta: "Guardar venta", apartado: "Apartar", consigna: "Dejar a consigna", entrada: "Guardar entrada", tomada: "Guardar", merma: "Guardar merma" }[form.tipo];
    b.textContent = n ? etiqueta + " · " + n + (n === 1 ? " bolsa" : " bolsas") + (form.tipo === "venta" || form.tipo === "consigna" || form.tipo === "apartado" ? " · " + pesos(n * form.precio) : "") : "Elige las bolsas";
    b.disabled = !n || form.enviando;
  }
  function enviar(forzar) {
    guardarCampos();
    var err = document.getElementById("ferr");
    var items = Object.keys(form.items).filter(function (k) { return form.items[k] > 0; }).map(function (k) { return { producto_id: k, cantidad: form.items[k] }; });
    // Avisa arriba (aviso) y lleva la pantalla al mensaje, para que no "no pase nada".
    var falla = function (html, corto) {
      err.innerHTML = html; aviso(corto, true);
      err.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    if ((form.tipo === "consigna" || form.tipo === "apartado") && !String(form.cliente || "").trim()) {
      var c = document.getElementById("fcliente");
      falla(form.tipo === "consigna" ? "Falta poner a qué tienda o persona se le dejan." : "Falta poner para quién es el apartado.", "Falta un dato ⬇");
      if (c) { c.focus(); c.classList.add("falta"); c.oninput = function () { c.classList.remove("falta"); }; }
      return;
    }
    if ((form.tipo === "venta" || form.tipo === "consigna") && !(Number(form.precio) > 0)) {
      falla("Falta el precio por bolsa.", "Falta el precio ⬇"); return;
    }
    form.enviando = true; resumenBoton(); err.textContent = "";
    api("POST", "/movimientos", { tipo: form.tipo, items: items, precio: form.precio, cliente: form.cliente, nota: form.nota, fecha: form.fecha, telefono: form.telefono || "", anticipo: form.tipo === "apartado" ? form.anticipo || 0 : 0, forzar: forzar }).then(function (r) {
      form.enviando = false; resumenBoton();
      if (r._status === 401) { pintarLogin(); return; }
      if (r.sinStock) {
        r.sinStock.forEach(function (x) { var it = document.querySelector('[data-n="' + x.id + '"]'); if (it) it.closest(".it").classList.add("sinstock"); });
        falla("No alcanza el inventario: " + r.sinStock.map(function (s) { return esc(nombreProd(s.id)) + " (hay " + s.hay + ", pones " + s.pides + ")"; }).join(", ") +
          '. <button class="enlace" id="forzar">Guardar de todos modos</button>', "No alcanza el inventario ⬇");
        document.getElementById("forzar").onclick = function () { enviar(true); };
        return;
      }
      if (!r.ok) { falla(esc(r.error || "No se pudo guardar."), r.error || "No se pudo guardar"); return; }
      var tipo = form.tipo;
      aviso({ venta: "Venta guardada 🙌", apartado: "Apartado guardado", consigna: "Consigna guardada", entrada: "Entrada guardada", tomada: "Guardado", merma: "Merma guardada" }[tipo]);
      return cargar().then(function () {
        if (tipo === "consigna") { rgrupo = r.grupo; vista = "remision"; form = null; pintar(); }
        else if (tipo === "entrada" || tipo === "apartado") { vista = "inventario"; form = null; pintar(); window.scrollTo(0, 0); }
        else { form = nuevoForm(tipo); pintar(); }
      });
    });
  }

  // ——— inventario
  function vInventario(v) {
    var st = stock(), cp = costoPromedio(), cs = consignas();
    var t = { e: 0, v: 0, t: 0, m: 0, c: 0 }, inv = [];
    var filas = D.productos.map(function (p) {
      var r = { e: 0, v: 0, t: 0, m: 0 };
      D.movimientos.forEach(function (m) {
        if (m.producto_id !== p.id) return;
        var k = { entrada: "e", venta: "v", tomada: "t", merma: "m" }[m.tipo];
        if (k) r[k] += m.cantidad;
      });
      r.c = 0; cs.forEach(function (c) { r.c += c.items[p.id] || 0; });
      Object.keys(t).forEach(function (k) { t[k] += r[k]; });
      var bajo = r.e > 0 && st[p.id] <= (D.ajustes.stockBajo || 0);
      inv.push({ nombre: p.nombre_base + " " + p.sabor, color: p.color, e: r.e, v: r.v, c: r.c, q: st[p.id], bajo: bajo });
      return "<tr><td><span class=\"punto\" style=\"background:" + esc(p.color) + "\"></span>" + esc(p.nombre_base + " " + p.sabor) + "</td><td class=num>" + r.e + "</td><td class=num>" + (r.v || "–") + "</td><td class=num>" + ((r.t + r.m) || "–") + "</td><td class=num>" + (r.c || "–") + '</td><td class="num' + (bajo ? " bajo" : "") + '"><strong>' + st[p.id] + "</strong></td></tr>";
    }).join("");
    var quedan = 0; D.productos.forEach(function (p) { quedan += st[p.id]; });
    var apN = 0, apG = {}; D.movimientos.forEach(function (m) { if (m.tipo === "apartado") { apN += m.cantidad; apG[m.grupo] = 1; } });
    var apP = Object.keys(apG).length;
    v.innerHTML = '<div class="fila entre"><h2>Inventario</h2><span class="fila" style="gap:6px">' + (variasCiudades() && ciudad !== "todas" ? '<button class="btn chico claro" id="traspasar">Traspasar</button>' : "") + '<button class="btn chico claro" id="contar">Ajustar conteo</button><button class="btn chico" id="llego">+ Llegó mercancía</button></span></div>' +
      '<div class="kpis"><div class="kpi amarillo"><span>Disponibles</span><strong>' + num(quedan) + "</strong><small>" + (apN ? "sin contar " + num(apN) + " apartadas" : "bolsas") + "</small></div>" +
      '<div class="kpi"><span>Apartadas</span><strong>' + num(apN) + "</strong><small>" + (apP ? "para " + apP + (apP === 1 ? " persona" : " personas") : "nada apartado") + "</small></div>" +
      '<div class="kpi"><span>Valor a costo</span><strong>' + pesos(quedan * cp) + "</strong><small>" + pesos(cp) + " por bolsa</small></div>" +
      '<div class="kpi"><span>Si se venden a público</span><strong>' + pesos(quedan * precioPublico()) + "</strong><small>" + pesos(precioPublico()) + " por bolsa</small></div>" +
      '<div class="kpi"><span>Han llegado</span><strong>' + num(t.e) + "</strong><small>bolsas en total</small></div></div>" +
      vApartados() + vConsignas(cs) +
      '<div class="fila entre" style="margin-top:20px;align-items:center"><h2 style="margin:0">Por sabor</h2><button class="btn chico verde" id="invimg">Compartir como imagen</button></div><div class="caja" style="margin-top:10px;overflow-x:auto"><table><thead><tr><th>Sabor</th><th class=num>Llegó</th><th class=num>Vend.</th><th class=num title="Tomadas y merma">Otras</th><th class=num title="A consigna en tiendas">Tiendas</th><th class=num title="En bodega">Quedan</th></tr></thead><tbody>' + filas +
      "</tbody><tfoot><tr><td>Total</td><td class=num>" + t.e + "</td><td class=num>" + t.v + "</td><td class=num>" + (t.t + t.m) + "</td><td class=num>" + t.c + "</td><td class=num>" + quedan + "</td></tr></tfoot></table></div>" +
      '<p class="vacio">Quedan = disponibles en tu bodega (sin contar las apartadas). Tiendas = dejadas a consigna. Otras = bolsas que se tomaron o se echaron a perder. En rojo: sabores con ' + (D.ajustes.stockBajo || 0) + " bolsas o menos. Si lo que tienes en la mano no cuadra, toca «Ajustar conteo».</p>";
    document.getElementById("llego").onclick = function () { ir("entrada"); };
    document.getElementById("contar").onclick = function () { ir("conteo"); };
    var tb = document.getElementById("traspasar"); if (tb) tb.onclick = function () { ir("traspaso"); };
    document.getElementById("invimg").onclick = function () { imagenInventario(inv, t, quedan, cs, this); };
    v.querySelectorAll("[data-cobrar]").forEach(function (b) { b.onclick = function () { lform = null; ltienda = b.getAttribute("data-cobrar"); ir("liquidar"); }; });
    v.querySelectorAll("[data-recibo]").forEach(function (b) { b.onclick = function () { rgrupo = b.getAttribute("data-recibo"); ir("remision"); }; });
    var nc = document.getElementById("nuevacons"); if (nc) nc.onclick = function () { ir("vender"); form.tipo = "consigna"; pintar(); };
    var na = document.getElementById("nuevoap"); if (na) na.onclick = function () { ir("vender"); form.tipo = "apartado"; pintar(); };
    v.querySelectorAll("[data-ant]").forEach(function (b) { b.onclick = function () { var x = v.querySelector('[data-antbox="' + b.getAttribute("data-ant") + '"]'); x.hidden = !x.hidden; if (!x.hidden) x.querySelector("input").focus(); }; });
    v.querySelectorAll("[data-antok]").forEach(function (b) {
      b.onclick = function () {
        var gr = b.getAttribute("data-antok"), inp = v.querySelector('[data-antbox="' + gr + '"] input');
        var monto = parseFloat(String(inp.value).replace(/[$,\s]/g, "")) || 0; b.disabled = true;
        api("POST", "/movimientos/" + gr + "/anticipo", { monto: monto }).then(function (r) {
          b.disabled = false; if (!r.ok) { aviso(r.error || "No se pudo.", true); return; }
          aviso(monto ? "Anticipo guardado: " + pesos(monto) : "Anticipo quitado"); cargar();
        });
      };
    });
    v.querySelectorAll("[data-entregar]").forEach(function (b) {
      b.onclick = function () {
        var como = b.getAttribute("data-como"); b.disabled = true;
        api("POST", "/movimientos/" + b.getAttribute("data-entregar") + "/entregar", { como: como, fecha: D.hoy }).then(function (r) {
          if (!r.ok) { b.disabled = false; aviso(r.error || "No se pudo."); return; }
          aviso(como === "venta" ? "Entregado y registrado como venta 🙌" : "Entregado a consigna");
          cargar().then(function () { if (como === "consigna") { rgrupo = r.grupo; vista = "remision"; pintar(); } });
        });
      };
    });
    v.querySelectorAll("[data-quitarap]").forEach(function (b) {
      b.onclick = function () {
        if (!b.classList.contains("seguro")) { b.classList.add("seguro"); b.textContent = "¿Seguro? Toca otra vez"; setTimeout(function () { b.classList.remove("seguro"); b.textContent = "Cancelar"; }, 4000); return; }
        api("DELETE", "/movimientos/" + b.getAttribute("data-quitarap")).then(function () { aviso("Apartado cancelado; las bolsas regresan a disponibles"); cargar(); });
      };
    });
  }
  // Conteo físico: pones lo que hay en la mano (con apartadas) y se guarda la diferencia.
  function vConteo(v) {
    var st = stock(), ap = {};
    D.movimientos.forEach(function (m) { if (m.tipo === "apartado") ap[m.producto_id] = (ap[m.producto_id] || 0) + m.cantidad; });
    var fis = function (id) { return st[id] || 0; };
    v.innerHTML = '<h2>Ajustar conteo</h2><p class="vacio" style="margin:-4px 0 14px">Cuenta las bolsas disponibles que tienes, <b>sin las apartadas</b> (esas van aparte) y sin las de tiendas, y corrige el número de cada sabor. Se guarda solo la diferencia como "Ajuste" en el historial.</p>' +
      '<div class="sabores">' + D.productos.map(function (p) {
        return '<div class="it"><img src="/img/etiquetas/' + esc(p.id) + '.webp" alt="" loading="lazy"><div class="nom">' + esc(p.nombre_base + " " + p.sabor) + '<small data-dif="' + esc(p.id) + '"></small></div>' +
          '<div class="paso"><button type="button" data-cm="' + esc(p.id) + '" aria-label="Menos">−</button><input inputmode="numeric" data-c="' + esc(p.id) + '" value="' + fis(p.id) + '" aria-label="Conteo de ' + esc(p.nombre_base + " " + p.sabor) + '"><button type="button" data-cp="' + esc(p.id) + '" aria-label="Más">+</button></div></div>';
      }).join("") + "</div>" +
      '<div class="caja" style="margin-top:14px"><label>Nota (opcional)<input id="cnota" placeholder="Ej. se registró esquite y era camote adobado"></label><p class="error" id="cerr" role="alert" style="margin-top:10px"></p></div>' +
      '<button class="enlace" id="ccancel">Cancelar</button><div class="barra"><button class="btn" id="cguardar">Guardar conteo</button></div>';
    var leer = function (id) { var n = parseInt(v.querySelector('[data-c="' + id + '"]').value, 10); return n >= 0 ? n : 0; };
    var pintaDif = function () {
      var cambios = 0;
      D.productos.forEach(function (p) {
        var d = leer(p.id) - fis(p.id), s = v.querySelector('[data-dif="' + p.id + '"]');
        s.textContent = "El panel dice " + fis(p.id) + (ap[p.id] ? " · aparte: " + ap[p.id] + " apartada" + (ap[p.id] === 1 ? "" : "s") : "") + (d ? " → " + (d > 0 ? "+" : "") + d : "");
        s.className = d ? "bajo" : ""; if (d) cambios++;
      });
      var b = document.getElementById("cguardar"); b.textContent = cambios ? "Guardar conteo · " + cambios + (cambios === 1 ? " sabor cambia" : " sabores cambian") : "Todo cuadra"; b.disabled = !cambios;
    };
    v.querySelectorAll("[data-c]").forEach(function (i) { i.oninput = pintaDif; });
    v.querySelectorAll("[data-cm],[data-cp]").forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute("data-cm") || b.getAttribute("data-cp"), i = v.querySelector('[data-c="' + id + '"]'); i.value = Math.max(0, (parseInt(i.value, 10) || 0) + (b.hasAttribute("data-cp") ? 1 : -1)); pintaDif(); };
    });
    document.getElementById("ccancel").onclick = function () { ir("inventario"); };
    document.getElementById("cguardar").onclick = function () {
      var conteo = {}; D.productos.forEach(function (p) { conteo[p.id] = leer(p.id); });
      this.disabled = true;
      api("POST", "/ajuste", { conteo: conteo, nota: document.getElementById("cnota").value }).then(function (r) {
        if (!r.ok) { var e = document.getElementById("cerr"); e.textContent = r.error || "No se pudo guardar."; aviso(r.error || "No se pudo guardar", true); return; }
        aviso(r.cambios ? "Conteo ajustado ✅" : "Todo cuadraba"); cargar().then(function () { ir("inventario"); });
      });
    };
    pintaDif();
  }
  // Traspaso: bolsas que se mandan de esta ciudad a otra (no es venta).
  function vTraspaso(v) {
    var st = stock(), otras = D.ciudades.filter(function (c) { return c.id !== ciudad; });
    var t = { a: (otras[0] || {}).id, items: {} };
    v.innerHTML = '<h2>Traspasar a otra ciudad</h2><p class="vacio" style="margin:-4px 0 14px">Salen de ' + esc(nombreCiudad(ciudad)) + ' y entran a la otra ciudad. No cuenta como venta.</p>' +
      '<div class="caja"><label>¿A qué ciudad?<select id="tdest" style="width:100%;font:500 16px Poppins,sans-serif;padding:12px;border-radius:14px;border:2px solid var(--linea)">' +
      otras.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="sabores">' + D.productos.map(function (p) {
        return '<div class="it"><img src="/img/etiquetas/' + esc(p.id) + '.webp" alt="" loading="lazy"><div class="nom">' + esc(p.nombre_base + " " + p.sabor) + "<small>Hay " + (st[p.id] || 0) + "</small></div>" +
          '<div class="paso"><button type="button" data-tm="' + esc(p.id) + '" aria-label="Menos">−</button><input inputmode="numeric" data-t="' + esc(p.id) + '" value="0" aria-label="Bolsas de ' + esc(p.nombre_base + " " + p.sabor) + '"><button type="button" data-tp="' + esc(p.id) + '" aria-label="Más">+</button></div></div>';
      }).join("") + "</div>" +
      '<div class="caja" style="margin-top:14px"><label>Nota (opcional)<input id="tnota" placeholder="Ej. mandadas con Pao"></label><p class="error" id="terr" role="alert" style="margin-top:10px"></p></div>' +
      '<button class="enlace" id="tcancel">Cancelar</button><div class="barra"><button class="btn" id="tguardar">Traspasar</button></div>';
    var leer = function (id) { var n = parseInt(v.querySelector('[data-t="' + id + '"]').value, 10); return n > 0 ? n : 0; };
    var total = function () { var n = 0; D.productos.forEach(function (p) { n += leer(p.id); }); return n; };
    var pinta = function () { var n = total(), b = document.getElementById("tguardar"); b.textContent = n ? "Traspasar " + n + (n === 1 ? " bolsa" : " bolsas") + " a " + nombreCiudad(document.getElementById("tdest").value) : "Elige las bolsas"; b.disabled = !n; };
    v.querySelectorAll("[data-t]").forEach(function (i) { i.oninput = pinta; });
    v.querySelectorAll("[data-tm],[data-tp]").forEach(function (b) { b.onclick = function () { var id = b.getAttribute("data-tm") || b.getAttribute("data-tp"), i = v.querySelector('[data-t="' + id + '"]'); i.value = Math.max(0, (parseInt(i.value, 10) || 0) + (b.hasAttribute("data-tp") ? 1 : -1)); pinta(); }; });
    document.getElementById("tdest").onchange = pinta;
    document.getElementById("tcancel").onclick = function () { ir("inventario"); };
    var enviar = function (forzar) {
      var items = D.productos.filter(function (p) { return leer(p.id); }).map(function (p) { return { producto_id: p.id, cantidad: leer(p.id) }; });
      var e = document.getElementById("terr"), b = document.getElementById("tguardar"); b.disabled = true;
      api("POST", "/traspaso", { de: ciudad, a: document.getElementById("tdest").value, items: items, nota: document.getElementById("tnota").value, forzar: !!forzar, fecha: D.hoy }).then(function (r) {
        if (r.sinStock) { b.disabled = false; e.innerHTML = "No alcanza: " + r.sinStock.map(function (x) { return esc(nombreProd(x.id)) + " (hay " + x.hay + ")"; }).join(", ") + '. <button class="enlace" id="tforzar">Traspasar de todos modos</button>'; aviso("No alcanza el inventario ⬇", true); e.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById("tforzar").onclick = function () { enviar(true); }; return; }
        if (!r.ok) { b.disabled = false; e.textContent = r.error || "No se pudo."; aviso(r.error || "No se pudo", true); return; }
        aviso("Traspaso guardado ✅"); cargar().then(function () { ir("inventario"); });
      });
    };
    document.getElementById("tguardar").onclick = function () { enviar(false); };
    pinta();
  }
  function vApartados() {
    var gs = grupos(D.movimientos).filter(function (g) { return g.tipo === "apartado"; });
    var tn = 0; gs.forEach(function (g) { g.items.forEach(function (m) { tn += m.cantidad; }); });
    var h = '<div class="fila entre" style="margin:20px 0 10px"><h2 style="margin:0">Apartados' + (tn ? ' <span style="font-family:Poppins;font-size:15px;opacity:.7">(' + tn + (tn === 1 ? " bolsa" : " bolsas") + ")</span>" : "") + '</h2><button class="btn chico" id="nuevoap">+ Apartar</button></div>';
    if (!gs.length) return h + '<p class="vacio" style="margin-bottom:16px">No hay bolsas apartadas.</p>';
    return h + gs.map(function (g) {
      var n = 0; g.items.forEach(function (m) { n += m.cantidad; });
      var d = diasDesde(g.fecha);
      return '<div class="mov"><div class="cab"><span style="font-weight:700;color:var(--tinta);font-size:16px">' + esc(g.cliente || "Sin nombre") + "</span><span>" + (d ? "hace " + d + (d === 1 ? " día" : " días") : "hoy") + "</span></div>" +
        "<ul>" + g.items.map(function (m) { return "<li>" + ((g.tipo === "ajuste" || g.tipo === "traspaso") && m.cantidad > 0 ? "+" : "") + m.cantidad + (g.tipo === "traspaso" && variasCiudades() ? " (" + esc(nombreCiudad(m.ciudad)) + ")" : "") + " × " + esc(nombreProd(m.producto_id)) + "</li>"; }).join("") + "</ul>" +
        (g.nota ? '<div style="font-size:13px;color:var(--suave);margin-bottom:8px">' + esc(g.nota) + "</div>" : "") +
        '<div class="pie"><span><strong>' + n + (n === 1 ? " bolsa" : " bolsas") + "</strong>" + (g.precio ? " · " + pesos(g.precio) + " c/u · <strong>" + pesos(n * g.precio) + "</strong>" : "") + "</span></div>" +
        (g.anticipo ? '<div class="cobro ok">💵 <b>Ya dio ' + pesos(g.anticipo) + "</b> de anticipo" + (g.precio ? " · al entregar cobra solo <b>" + pesos(Math.max(0, n * g.precio - g.anticipo)) + "</b>" : "") + "</div>" : "") +
        '<div class="fila" style="gap:6px;margin-top:8px;align-items:flex-end" data-antbox="' + esc(g.grupo) + '" hidden><label style="flex:1;margin:0">Total que ya te dio<input inputmode="decimal" value="' + (g.anticipo || "") + '" placeholder="$0"></label><button class="btn chico" data-antok="' + esc(g.grupo) + '">Guardar</button></div>' +
        '<div class="fila" style="gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn chico claro" data-ant="' + esc(g.grupo) + '">' + (g.anticipo ? "Cambiar anticipo" : "Me dio anticipo") + '</button><button class="btn chico verde" data-entregar="' + esc(g.grupo) + '" data-como="venta">Entregar como venta</button>' +
        '<button class="btn chico claro" data-entregar="' + esc(g.grupo) + '" data-como="consigna">Entregar a consigna</button>' +
        '<button class="btn chico peligro" data-quitarap="' + esc(g.grupo) + '">Cancelar</button></div></div>';
    }).join("");
  }
  // Imagen del inventario para mandar por WhatsApp (canvas → compartir o descargar).
  function imagenInventario(inv, t, quedan, cs, btn) {
    var txt = btn.textContent; btn.textContent = "Armando imagen…"; btn.disabled = true;
    var W = 1080, fila = 78, cab = 450, tab = 90, pie = 150 + (cs.length ? 70 + cs.length * 46 : 0);
    var H = cab + tab + inv.length * fila + 90 + pie;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d");
    var logo = new Image(); logo.src = "/img/logo.svg";
    var listo = function () {
      g.fillStyle = "#FFF6E6"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ECBE48"; g.fillRect(0, 0, W, 300);
      try { g.drawImage(logo, (W - 420) / 2, 34, 420, 137); } catch (e) {}
      g.textAlign = "center"; g.fillStyle = "#3B2216";
      g.font = "700 26px Poppins, sans-serif"; g.fillText("I N V E N T A R I O" + (variasCiudades() ? "  ·  " + nombreCiudad(ciudad).toUpperCase() : ""), W / 2, 212);
      var ahora = new Date();
      g.font = "500 30px Poppins, sans-serif";
      g.fillText(ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) + " · " + ahora.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }), W / 2, 258);
      // tarjetas
      var k = [["Quedan", quedan], ["En tiendas", t.c], ["Vendidas", t.v]];
      k.forEach(function (x, i) {
        var bx = 60 + i * 330, by = 320;
        g.fillStyle = i === 0 ? "#3B2216" : "#fff"; rr(g, bx, by, 300, 110, 24); g.fill();
        g.fillStyle = i === 0 ? "#ECBE48" : "#3B2216"; g.font = "400 56px 'Bubblegum Sans', sans-serif"; g.fillText(String(x[1]), bx + 150, by + 62);
        g.fillStyle = i === 0 ? "#FFF6E6" : "#3B2216"; g.font = "700 22px Poppins, sans-serif"; g.fillText(x[0].toUpperCase(), bx + 150, by + 94);
      });
      // encabezado de tabla
      var y = cab + 60, cols = [590, 720, 850, 975];
      g.font = "700 22px Poppins, sans-serif"; g.fillStyle = "#9A6A25";
      g.textAlign = "left"; g.fillText("SABOR", 70, y);
      g.textAlign = "center"; ["LLEGÓ", "VEND.", "TIENDAS", "QUEDAN"].forEach(function (h, i) { g.fillText(h, cols[i], y); });
      y += 24;
      inv.forEach(function (r, i) {
        if (i % 2 === 0) { g.fillStyle = "#fff"; rr(g, 40, y, W - 80, fila - 6, 18); g.fill(); }
        var cy = y + fila / 2 + 4;
        g.fillStyle = r.color || "#ccc"; g.beginPath(); g.arc(82, cy - 9, 13, 0, 7); g.fill();
        g.fillStyle = "#3B2216"; g.textAlign = "left"; g.font = "500 29px Poppins, sans-serif"; g.fillText(r.nombre, 108, cy);
        g.textAlign = "center"; g.font = "500 29px Poppins, sans-serif";
        [r.e, r.v || "–", r.c || "–"].forEach(function (x, j) { g.fillText(String(x), cols[j], cy); });
        g.font = "400 40px 'Bubblegum Sans', sans-serif"; g.fillStyle = r.bajo ? "#C0392B" : "#3B2216"; g.fillText(String(r.q), cols[3], cy + 3);
        y += fila;
      });
      g.fillStyle = "#3B2216"; rr(g, 40, y + 6, W - 80, 70, 18); g.fill();
      g.fillStyle = "#FFF6E6"; g.textAlign = "left"; g.font = "700 28px Poppins, sans-serif"; g.fillText("Total", 70, y + 52);
      g.textAlign = "center"; [t.e, t.v, t.c].forEach(function (x, j) { g.fillText(String(x), cols[j], y + 52); });
      g.fillStyle = "#ECBE48"; g.font = "400 40px 'Bubblegum Sans', sans-serif"; g.fillText(String(quedan), cols[3], y + 55);
      y += 120;
      if (cs.length) {
        g.textAlign = "left"; g.fillStyle = "#3B2216"; g.font = "400 38px 'Bubblegum Sans', sans-serif"; g.fillText("En tiendas", 60, y + 20); y += 66;
        g.font = "500 27px Poppins, sans-serif";
        cs.forEach(function (c) { g.fillText("• " + c.tienda + ": " + c.bolsas + (c.bolsas === 1 ? " bolsa" : " bolsas") + " (hace " + diasDesde(c.ultima) + " días)", 70, y); y += 46; });
        y += 10;
      }
      g.textAlign = "center"; g.fillStyle = "#9A6A25"; g.font = "500 24px Poppins, sans-serif";
      g.fillText("En rojo: sabores con " + (D.ajustes.stockBajo || 0) + " bolsas o menos  ·  crunchitos.mx", W / 2, H - 50);
      cv.toBlob(function (b) {
        btn.textContent = txt; btn.disabled = false;
        var nombre = "Crunchitos inventario " + hoyLocal() + ".png";
        entregarImagen(b, nombre);
      }, "image/png");
    };
    var go = function () {
      var f = document.fonts;
      if (!f || !f.load) return listo();
      Promise.all(["500 29px Poppins", "700 28px Poppins", "400 40px 'Bubblegum Sans'"].map(function (x) { return f.load(x).catch(function () {}); })).then(listo, listo);
    };
    if (logo.complete) go(); else { logo.onload = go; logo.onerror = go; }
  }
  // Reporte "Cómo vamos" como imagen para el grupo de socios (interno).
  function imagenReporte(r, btn) {
    var txt = btn.textContent; btn.textContent = "Armando…"; btn.disabled = true;
    var W = 1080, lin = 52;
    var secciones = [["Ventas por precio", r.precios.map(function (x) { return [x[0], x[1] + (x[1] === 1 ? " bolsa" : " bolsas"), pesos(x[2])]; })],
      ["Lo que más se vende", r.sabores.map(function (x) { return [x[0], "", x[1] + (x[1] === 1 ? " bolsa" : " bolsas"), x[2]]; })],
      ["Gastos", r.gastosCat.map(function (x) { return [x[0], "", pesos(x[1])]; })],
      ["Quién vendió", r.quien.map(function (x) { return [x[0], x[1] + (x[1] === 1 ? " bolsa" : " bolsas"), pesos(x[2])]; })]];
    if (r.debe.length) secciones.push(["Se le debe (gastos de su bolsa)", r.debe.map(function (x) { return [x[0], "", pesos(x[1])]; })]);
    secciones = secciones.filter(function (s) { return s[1].length; });
    var H = 300 + 2 * 150 + 3 * 150 + 40;
    secciones.forEach(function (s) { H += 80 + s[1].length * lin + 20; });
    if (r.bajos.length) H += 140;
    H += 110;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d"), logo = new Image(); logo.src = "/img/logo.svg";
    var listo = function () {
      g.fillStyle = "#FFF6E6"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ECBE48"; g.fillRect(0, 0, W, 280);
      try { g.drawImage(logo, (W - 400) / 2, 30, 400, 131); } catch (e) {}
      g.textAlign = "center"; g.fillStyle = "#3B2216";
      g.font = "700 26px Poppins, sans-serif"; g.fillText("CÓMO VAMOS  ·  " + r.periodo.toUpperCase(), W / 2, 202);
      var ahora = new Date();
      g.font = "500 28px Poppins, sans-serif";
      g.fillText(ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) + " · " + ahora.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }), W / 2, 246);
      var tarjeta = function (x, y, w, t, v, sub, fondo, colV) {
        g.fillStyle = fondo; rr(g, x, y, w, 130, 24); g.fill();
        g.textAlign = "left"; g.fillStyle = fondo === "#3B2216" ? "#FFF6E6" : "#3B2216";
        g.font = "600 22px Poppins, sans-serif"; g.fillText(t, x + 26, y + 38);
        g.fillStyle = colV || g.fillStyle; g.font = "700 44px Poppins, sans-serif"; g.fillText(v, x + 26, y + 88);
        g.fillStyle = fondo === "#3B2216" ? "rgba(255,246,230,.75)" : "#9A6A25"; g.font = "500 19px Poppins, sans-serif"; g.fillText(sub, x + 26, y + 116);
      };
      var y = 310, w2 = (W - 120 - 20) / 2, w3 = (W - 120 - 40) / 3;
      tarjeta(60, y, w2, "En caja (en teoría)", pesos(r.caja), "todo lo cobrado − gastos de caja", "#3B2216", "#ECBE48");
      tarjeta(80 + w2, y, w2, "Por cobrar", pesos(r.porCobrar), r.pcTxt || "nada pendiente", "#fff"); y += 150;
      tarjeta(60, y, w2, "Vendido", pesos(r.vendido), r.bolsas + " bolsas" + (r.bolsas ? " · prom. " + pesos(r.vendido / r.bolsas) : ""), "#ECBE48");
      tarjeta(80 + w2, y, w2, "Ganancia real", pesos(r.real), "bolsas " + pesos(r.ganBolsas) + " − gastos " + pesos(r.gastos), r.real < 0 ? "#FDECEA" : "#DFF2E6", r.real < 0 ? "#C0392B" : "#14653A"); y += 150;
      tarjeta(60, y, w3, "En bodega", String(r.bodega), "bolsas disponibles", "#fff");
      tarjeta(80 + w3, y, w3, "En tiendas", String(r.tiendas), "bolsas a consigna", "#fff");
      tarjeta(100 + 2 * w3, y, w3, "Tomadas / merma", String(r.merma), "costo " + pesos(r.cp) + " c/u", "#fff"); y += 170;
      secciones.forEach(function (s) {
        g.textAlign = "left"; g.fillStyle = "#3B2216"; g.font = "400 40px 'Bubblegum Sans', sans-serif"; g.fillText(s[0], 60, y + 30); y += 56;
        g.fillStyle = "#fff"; rr(g, 40, y, W - 80, s[1].length * lin + 16, 20); g.fill(); y += 8;
        s[1].forEach(function (row, i) {
          var cy = y + i * lin + 35;
          if (i) { g.fillStyle = "#F1E4CB"; g.fillRect(70, y + i * lin, W - 140, 2); }
          var x0 = 70;
          if (row[3]) { g.fillStyle = row[3]; g.beginPath(); g.arc(84, cy - 9, 11, 0, 7); g.fill(); x0 = 106; }
          g.fillStyle = "#3B2216"; g.textAlign = "left"; g.font = "500 27px Poppins, sans-serif"; g.fillText(row[0], x0, cy);
          g.textAlign = "right"; g.font = "500 25px Poppins, sans-serif"; g.fillStyle = "#9A6A25"; if (row[1]) g.fillText(row[1], 780, cy);
          g.fillStyle = "#3B2216"; g.font = "700 27px Poppins, sans-serif"; g.fillText(row[2], W - 70, cy);
        });
        y += s[1].length * lin + 36;
      });
      if (r.bajos.length) {
        g.fillStyle = "#FDECEA"; rr(g, 40, y, W - 80, 116, 20); g.fill();
        g.textAlign = "left"; g.fillStyle = "#8C2C20"; g.font = "700 25px Poppins, sans-serif"; g.fillText("Se están acabando:", 66, y + 44);
        g.font = "500 22px Poppins, sans-serif"; var t = r.bajos.join(", "); if (t.length > 80) t = t.slice(0, 78) + "…"; g.fillText(t, 66, y + 84);
        y += 140;
      }
      g.textAlign = "center"; g.fillStyle = "#9A6A25"; g.font = "500 22px Poppins, sans-serif";
      g.fillText("Reporte interno · crunchitos.mx/admin", W / 2, y + 30);
      var fin = document.createElement("canvas"); fin.width = W; fin.height = Math.min(H, y + 70);
      fin.getContext("2d").drawImage(cv, 0, 0); cv = fin;
      compartirCanvas(cv, "Crunchitos reporte " + hoyLocal() + ".png", "Reporte Crunchitos", function () { btn.textContent = txt; btn.disabled = false; });
    };
    var go = function () {
      var f = document.fonts;
      if (!f || !f.load) return listo();
      Promise.all(["500 27px Poppins", "700 44px Poppins", "600 22px Poppins", "400 40px 'Bubblegum Sans'"].map(function (x) { return f.load(x).catch(function () {}); })).then(listo, listo);
    };
    if (logo.complete) go(); else { logo.onload = go; logo.onerror = go; }
  }
  // ——— estado de cuenta de una tienda (texto para WhatsApp o imagen)
  var cuentasTienda = {};
  function telTienda(t) {
    for (var i = t.lista.length - 1; i >= 0; i--) { var r = remision(t.lista[i].grupo); if (r.telefono) return r.telefono; }
    return "";
  }
  function quedanEnTienda(t) {
    var c = consignas().find(function (x) { return x.tienda === t.tienda; });
    return c ? Object.keys(c.items).map(function (id) { return [nombreProd(id), c.items[id]]; }) : [];
  }
  function lineaConsigna(c) {
    return fechaBonita(c.fecha) + ": " + c.dejadas + (c.dejadas === 1 ? " bolsa" : " bolsas") + " a " + pesos(c.precio) + " → " +
      (c.faltan ? (c.cobradas ? "vendió " + c.cobradas + ", " : "") + (c.regresaron ? "regresaron " + c.regresaron + ", " : "") + "siguen en tienda " + c.faltan
        : "✅ cerrada" + (c.cobradas ? " (vendió " + c.cobradas + (c.regresaron ? ", regresaron " + c.regresaron : "") + ")" : c.regresaron ? " (regresaron " + c.regresaron + ")" : ""));
  }
  function textoCuenta(t) {
    var l = [], N = String.fromCharCode(10);
    l.push("🧾 *Cuenta Crunchitos · " + t.tienda + "*");
    l.push(new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }));
    l.push("");
    l.push("*Bolsas que te he dejado:*");
    t.lista.slice().sort(function (a, b) { return (a.fecha || "").localeCompare(b.fecha || ""); }).forEach(function (c) { l.push("• " + lineaConsigna(c)); });
    l.push("");
    l.push("Total dejado: " + t.dejadas + " bolsas (" + pesos(t.valor) + ")");
    l.push("Vendidas: " + t.cobradas + " bolsas · " + pesos(t.cobrado));
    if (t.regresaron) l.push("Regresaron: " + t.regresaron);
    l.push("Me has pagado: " + pesos(t.abonado));
    if (t.abonos.length) t.abonos.slice().sort(function (a, b) { return (a.fecha || "").localeCompare(b.fecha || ""); }).forEach(function (a) { l.push("   - " + fechaBonita(a.fecha) + ": " + pesos(a.monto) + (a.nota && a.nota !== "Pago al cobrar" ? " (" + a.nota + ")" : "")); });
    l.push("");
    var rc = resumenCuenta(t);
    if (t.faltan) l.push("En tu tienda siguen " + t.faltan + (t.faltan === 1 ? " bolsa" : " bolsas") + " (" + pesos(t.enTienda) + ")");
    l.push(rc.tipo === "debe" ? "*Pendiente: " + pesos(rc.monto) + "*" + (t.saldo < 0 ? " (ya con tus " + pesos(-t.saldo) + " de más descontados)" : "") + (t.faltan ? " · si me regresas bolsas, baja" : "")
      : rc.tipo === "favor" ? "*A tu favor: " + pesos(rc.monto) + "*" : "*✅ Estamos al corriente, no debes nada.*");
    if (t.faltan) {
      var q = quedanEnTienda(t); if (q.length) { l.push(""); l.push("_Deberían quedar:_"); q.forEach(function (x) { l.push("- " + x[1] + " " + x[0]); }); }
      l.push(""); l.push("Me pagas aquí y me mandas el comprobante: " + location.origin + "/pago/?de=" + encodeURIComponent(t.tienda));
    }
    l.push(""); l.push("¡Gracias por vender Crunchitos! 🙌");
    return l.join(N);
  }
  function imagenCuenta(t, btn) {
    var txt = btn.textContent; btn.textContent = "Armando imagen…"; btn.disabled = true;
    var lista = (t.lista || []).slice().sort(function (a, b) { return (a.fecha || "").localeCompare(b.fecha || ""); });
    var q = t.faltan ? quedanEnTienda(t) : [];
    var W = 1080, H = 640 + lista.length * 64 + (q.length ? 90 + q.length * 50 : 0) + 150;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d"), logo = new Image(); logo.src = "/img/logo.svg";
    var listo = function () {
      g.fillStyle = "#FFF6E6"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#ECBE48"; g.fillRect(0, 0, W, 300);
      try { g.drawImage(logo, (W - 380) / 2, 30, 380, 124); } catch (e) {}
      g.textAlign = "center"; g.fillStyle = "#3B2216";
      g.font = "700 24px Poppins, sans-serif"; g.fillText("E S T A D O   D E   C U E N T A", W / 2, 192);
      g.font = "400 50px 'Bubblegum Sans', sans-serif"; g.fillText(t.tienda, W / 2, 250);
      g.font = "500 24px Poppins, sans-serif"; g.fillText(new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }), W / 2, 284);
      var k = [["Vendido", pesos(t.cobrado), t.cobradas + " bolsas", "#fff", "#3B2216"], ["Pagado", pesos(t.abonado), t.abonos.length + (t.abonos.length === 1 ? " pago" : " pagos"), "#fff", "#2F7D5B"],
        (function () { var rc = resumenCuenta(t);
          if (rc.tipo === "debe") return ["Pendiente", pesos(rc.monto), t.faltan ? "incluye " + t.faltan + " en tu tienda" : "de lo vendido", "#D33A2A", "#fff"];
          if (rc.tipo === "favor") return ["A tu favor", pesos(rc.monto), "te lo debo", "#2F6F8F", "#fff"];
          return ["Al corriente", "✓", "no debes nada", "#2F7D5B", "#fff"]; })()];
      k.forEach(function (x, i) {
        var bx = 60 + i * 330, by = 330;
        g.fillStyle = x[3]; rr(g, bx, by, 300, 150, 24); g.fill();
        g.fillStyle = x[3] === "#fff" ? x[4] : "#fff";
        g.font = "700 22px Poppins, sans-serif"; g.fillText(x[0].toUpperCase(), bx + 150, by + 40);
        g.font = "400 54px 'Bubblegum Sans', sans-serif"; g.fillText(x[1], bx + 150, by + 98);
        g.font = "500 22px Poppins, sans-serif"; g.fillText(x[2], bx + 150, by + 132);
      });
      var y = 545; g.textAlign = "left"; g.fillStyle = "#9A6A25"; g.font = "700 24px Poppins, sans-serif"; g.fillText("BOLSAS QUE TE HE DEJADO", 70, y);
      y += 20;
      lista.forEach(function (c, i) {
        y += 64; if (i % 2 === 0) { g.fillStyle = "#fff"; rr(g, 50, y - 44, W - 100, 60, 14); g.fill(); }
        g.fillStyle = "#3B2216"; g.textAlign = "left"; g.font = "600 26px Poppins, sans-serif";
        g.fillText(fechaBonita(c.fecha) + " · " + c.dejadas + " bolsas a " + pesos(c.precio), 70, y);
        g.textAlign = "right"; g.fillStyle = c.faltan ? "#D33A2A" : "#2F7D5B"; g.font = "700 24px Poppins, sans-serif";
        g.fillText(c.faltan ? "en tienda " + c.faltan + (c.cobradas ? " (vendió " + c.cobradas + ")" : "") : "✓ cerrada", W - 70, y);
      });
      if (q.length) {
        y += 80; g.textAlign = "left"; g.fillStyle = "#9A6A25"; g.font = "700 24px Poppins, sans-serif"; g.fillText("EN TU TIENDA DEBERÍAN QUEDAR " + t.faltan + " BOLSAS (" + pesos(t.enTienda) + ")", 70, y);
        q.forEach(function (x) { y += 50; g.fillStyle = "#3B2216"; g.font = "500 26px Poppins, sans-serif"; g.fillText(x[1] + " × " + x[0], 70, y); });
      }
      g.fillStyle = "#3B2216"; g.fillRect(0, H - 120, W, 120);
      g.textAlign = "center"; g.fillStyle = "#FFF6E6"; g.font = "600 28px Poppins, sans-serif";
      g.fillText(resumenCuenta(t).tipo === "debe" ? "Paga y manda tu comprobante en crunchitos.mx/pago" : "¡Gracias por vender Crunchitos!", W / 2, H - 50);
      compartirCanvas(cv, "cuenta-" + t.tienda.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png", "Cuenta Crunchitos · " + t.tienda, function () { btn.textContent = txt; btn.disabled = false; });
    };
    var hecho = false, go = function () { if (hecho) return; hecho = true; (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(listo); };
    logo.onload = go; logo.onerror = go; setTimeout(go, 1500);
  }
  // En el cel: menú de compartir solo con el archivo (sin título). En la compu: se copia la imagen
  // para pegarla en WhatsApp con ⌘V (no se guarda nada); si el navegador no deja copiar, menú de compartir y, al final, descarga.
  function entregarImagen(b, nombre) {
    var cel = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    var file = null; try { file = new File([b], nombre, { type: "image/png" }); } catch (e) {}
    var compartir = function () {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(function () {}); return; }
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nombre; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      aviso("Imagen descargada");
    };
    if (!cel && navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": b })]).then(function () { aviso("Imagen copiada ✓ Pégala en WhatsApp con ⌘V"); }, compartir);
      return;
    }
    compartir();
  }
  function compartirCanvas(cv, nombre, titulo, fin) {
    cv.toBlob(function (b) {
      fin();
      entregarImagen(b, nombre);
    }, "image/png");
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function vConsignas(cs) {
    var h = '<div class="fila entre" style="margin:20px 0 10px"><h2 style="margin:0">En consigna</h2><button class="btn chico" id="nuevacons">+ Dejar a consigna</button></div>';
    if (!cs.length) return h + '<p class="vacio" style="margin-bottom:16px">No hay bolsas dejadas en tiendas.</p>';
    return h + cs.map(function (c) {
      var d = diasDesde(c.ultima);
      return '<div class="mov"><div class="cab"><span style="font-weight:700;color:var(--tinta);font-size:16px">' + esc(c.tienda) + "</span><span" + (d >= 14 ? ' class="bajo"' : "") + ">hace " + d + (d === 1 ? " día" : " días") + "</span></div>" +
        "<ul>" + Object.keys(c.items).map(function (id) { return "<li>" + c.items[id] + " × " + esc(nombreProd(id)) + "</li>"; }).join("") + "</ul>" +
        '<div class="pie"><span><strong>' + c.bolsas + (c.bolsas === 1 ? " bolsa" : " bolsas") + "</strong> · " + pesos(c.precio) + " c/u · <strong>" + pesos(c.bolsas * c.precio) + "</strong></span>" +
        '<button class="btn chico verde" data-cobrar="' + esc(c.tienda) + '">Pasar a cobrar</button></div>' +
        '<div class="pie" style="margin-top:8px;font-size:13px">' + estadoRemision(c.grupos[c.grupos.length - 1]) +
        '<button class="btn chico claro" data-recibo="' + esc(c.grupos[c.grupos.length - 1]) + '">Recibo</button></div></div>';
    }).join("");
  }

  // ——— recibo digital de consigna (la tienda confirma desde una liga, sin usuario)
  var rgrupo = null;
  function vRemision(v) {
    var movs = D.movimientos.filter(function (m) { return m.grupo === rgrupo && m.tipo === "consigna"; });
    if (!movs.length) { vista = "inventario"; pintar(); return; }
    var r = remision(rgrupo), liga = ligaRemision(rgrupo), n = 0;
    movs.forEach(function (m) { n += m.cantidad; });
    var tienda = movs[0].cliente, folio = rgrupo.replace(/-/g, "").slice(-6).toUpperCase();
    var msg = "Hola, te dejo el recibo de los Crunchitos que dejamos a consigna (" + n + " bolsas, folio " + folio + "). Ábrelo y toca \"Confirmo que recibí\" 🙌 " + liga;
    var wa = "https://wa.me/" + (r.telefono || "") + "?text=" + encodeURIComponent(msg);
    var qr = "";
    try { var q = qrcode(0, "M"); q.addData(liga); q.make(); qr = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { qr = ""; }
    v.innerHTML = '<button class="enlace" id="volver">← Inventario</button><h2>Recibo de consigna</h2>' +
      '<div class="caja"><div class="fila entre"><strong>' + esc(tienda) + '</strong><span class="vacio">Folio ' + esc(folio) + "</span></div>" +
      '<p style="margin:6px 0 0;font-size:14px">' + n + " bolsas · " + pesos(movs[0].precio) + " c/u · " + pesos(n * movs[0].precio) + "</p>" +
      '<p style="margin:10px 0 0">' + estadoRemision(rgrupo) + (r.confirmado ? ' <span class="vacio">(' + esc(new Date(r.confirmado).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })) + ")</span>" : "") + "</p>" + (r.firma ? '<img alt="Firma" src="' + esc(r.firma) + '" style="display:block;height:80px;margin-top:8px;background:#fff;border-radius:10px">' : "") + "</div>" +
      (r.confirmado ? "" :
      '<div class="caja"><h3>Mándaselo por WhatsApp</h3><a class="btn verde" style="width:100%" href="' + esc(wa) + '" target="_blank" rel="noopener">Enviar recibo por WhatsApp</a>' +
      '<button class="btn claro" style="width:100%;margin-top:10px" id="copiar">Copiar liga</button>' +
      (r.telefono ? "" : '<p class="vacio" style="margin-top:8px">Como no pusiste su WhatsApp, te va a pedir que escojas el contacto.</p>') + "</div>" +
      '<div class="caja" style="text-align:center"><h3>O que escaneen este QR</h3><div style="max-width:260px;margin:0 auto;background:#fff;padding:8px;border-radius:16px">' + qr + "</div>" +
      '<p class="vacio" style="margin-top:8px">Con la cámara de su cel abren el recibo, ponen su nombre y tocan "Confirmo que recibí".</p></div>' +
      '<div class="caja"><h3>¿No tiene datos?</h3><a class="btn claro" style="width:100%" href="' + esc(liga) + '" target="_blank" rel="noopener">Que confirme aquí en mi cel</a>' +
      '<p class="vacio" style="margin-top:8px">Se abre el recibo en tu cel: le das el teléfono, pone su nombre, firma con el dedo y toca "Confirmo que recibí".</p></div>') +
      '<button class="btn claro" style="width:100%" id="actualizar">Actualizar estado</button>';
    document.getElementById("volver").onclick = function () { ir("inventario"); };
    document.getElementById("actualizar").onclick = function () { cargar(); };
    var c = document.getElementById("copiar");
    if (c) c.onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(liga) : Promise.reject()).then(function () { aviso("Liga copiada"); }, function () { window.prompt("Copia la liga:", liga); });
    };
  }

  // ——— pasar a cobrar una consigna
  var lform = null, ltienda = null;
  function vLiquidar(v) {
    var c = consignas().find(function (x) { return x.tienda === ltienda; });
    if (!c) { vista = "inventario"; pintar(); return; }
    if (!lform) lform = { precio: c.precio, vendidas: {}, devueltas: {}, quedan: {}, modo: "quedan", fecha: D.hoy, nota: "" };
    var f = lform;
    // Modo "quedan": se cuenta lo que hay en la tienda y el sistema calcula lo vendido (tiene − quedan).
    if (f.modo === "quedan") Object.keys(c.items).forEach(function (id) {
      if (f.quedan[id] === undefined) f.quedan[id] = c.items[id];
      f.vendidas[id] = c.items[id] - f.quedan[id];
      if ((f.devueltas[id] || 0) > f.quedan[id]) f.devueltas[id] = f.quedan[id];
    });
    function total(o) { var n = 0; Object.keys(o).forEach(function (k) { n += o[k] || 0; }); return n; }
    var cta = cuentas()[c.tienda] || { saldo: 0 }, saldoPrev = cta.saldo || 0;
    var hoyVal = Math.round(total(f.vendidas) * (Number(f.precio) || 0) * 100) / 100, debeHoy = Math.max(0, Math.round((saldoPrev + hoyVal) * 100) / 100);
    if (!f.pagadoTocado) f.pagado = debeHoy;
    var h = '<button class="enlace" id="volver">← Inventario</button><h2>Cobrar a ' + esc(c.tienda) + "</h2>" +
      '<div class="chips" role="group" aria-label="Cómo contar" style="margin-bottom:10px"><button class="chip" data-modo="quedan" aria-pressed="' + (f.modo === "quedan") + '">Cuento lo que queda</button><button class="chip" data-modo="vendidas" aria-pressed="' + (f.modo !== "quedan") + '">Pongo lo que se vendió</button></div>' +
      '<p class="vacio" style="margin:-4px 0 12px">' + (f.modo === "quedan" ? "Cuenta las bolsas que siguen en la tienda y el sistema calcula cuántas se vendieron. Si te traes algunas de regreso, márcalas en «Regresan» (salen de las que quedan)." : "Pon cuántas se vendieron y cuántas te traes de regreso; las demás se quedan a consigna.") + "</p>" +
      '<button class="btn chico claro" id="todas" style="margin-bottom:12px">' + (f.modo === "quedan" ? "No queda ninguna (se vendieron todas)" : "Se vendieron todas") + "</button>" +
      '<div class="sabores">' + Object.keys(c.items).map(function (id) {
        var tiene = c.items[id], vnd = f.vendidas[id] || 0, dev = f.devueltas[id] || 0;
        return '<div class="caja" style="margin:0;padding:12px"><div class="fila entre"><strong style="font-size:15px">' + esc(nombreProd(id)) + '</strong><small class="vacio">tiene ' + tiene + "</small></div>" +
          '<div class="rejilla2" style="margin-top:8px">' + (f.modo === "quedan" ? ["quedan", "devueltas"] : ["vendidas", "devueltas"]).map(function (k) {
            var n = k === "vendidas" ? vnd : k === "quedan" ? f.quedan[id] : dev, et = { vendidas: "Se vendieron", quedan: "Quedan en la tienda", devueltas: "Regresan" }[k];
            return '<div><small style="font-weight:600">' + et + '</small><div class="paso" style="margin-top:4px"><button type="button" data-l="' + k + '" data-id="' + esc(id) + '" data-d="-1">−</button><input readonly value="' + n + '" aria-label="' + et + '"><button type="button" data-l="' + k + '" data-id="' + esc(id) + '" data-d="1">+</button></div></div>';
          }).join("") + "</div>" + (f.modo === "quedan" ? '<div style="font-size:13px;margin-top:6px;font-weight:600;color:' + (vnd ? "var(--verde)" : "var(--suave)") + '">→ se vendieron ' + vnd + "</div>" : "") + "</div>";
      }).join("") + "</div>" +
      '<div class="caja" style="margin-top:14px"><div class="rejilla2"><label>Precio por bolsa<input id="lprecio" inputmode="decimal" value="' + esc(f.precio) + '"></label><label>Fecha<input type="date" id="lfecha" value="' + esc(f.fecha) + '" max="' + esc(D.hoy) + '"></label></div>' +
      '<div style="font-size:14px;margin-top:12px;line-height:1.6">' + (saldoPrev < 0 ? "Ya te había pagado " + pesos(-saldoPrev) + " de más (abonos, p. ej. clientes que te transfirieron directo).<br>" : saldoPrev > 0 ? "Ya te debía " + pesos(saldoPrev) + " de antes.<br>" : "") +
        "Vendidas hoy: " + pesos(hoyVal) + " → <b>" + (saldoPrev + hoyVal >= 0 ? "te toca cobrar " + pesos(debeHoy) : "le debes " + pesos(-(saldoPrev + hoyVal))) + "</b></div>" +
      '<label style="margin-top:10px">¿Cuánto te pagó hoy?<input id="lpagado" inputmode="decimal" value="' + (f.pagado || 0) + '"></label>' +
      '<label style="margin-top:10px">Nota (opcional)<input id="lnota" value="' + esc(f.nota) + '" placeholder="Ej. le dejé 10 más"></label><p class="error" id="lerr" style="margin-top:10px"></p></div>' +
      '<div class="barra"><button class="btn verde" id="lguardar">' + (total(f.vendidas) ? "Guardar · " + total(f.vendidas) + " vendidas" : "Guardar") + (f.pagado ? " · te paga " + pesos(f.pagado) : "") + (total(f.devueltas) ? " · " + total(f.devueltas) + " regresan" : "") + "</button></div>";
    v.innerHTML = h;
    function leer() {
      f.precio = parseFloat(document.getElementById("lprecio").value) || 0; f.fecha = document.getElementById("lfecha").value || D.hoy; f.nota = document.getElementById("lnota").value;
      var p = parseFloat(String(document.getElementById("lpagado").value).replace(/[$,\s]/g, "")) || 0; if (p !== f.pagado) { f.pagado = p; f.pagadoTocado = true; }
    }
    document.getElementById("volver").onclick = function () { ir("inventario"); };
    document.getElementById("todas").onclick = function () { leer(); f.devueltas = {}; Object.keys(c.items).forEach(function (id) { f.vendidas[id] = c.items[id]; f.quedan[id] = 0; }); pintar(); };
    v.querySelectorAll("[data-modo]").forEach(function (b) { b.onclick = function () { leer(); f.modo = b.getAttribute("data-modo"); if (f.modo === "quedan") Object.keys(c.items).forEach(function (id) { f.quedan[id] = c.items[id] - (f.vendidas[id] || 0); }); pintar(); }; });
    v.querySelectorAll("[data-l]").forEach(function (b) {
      b.onclick = function () {
        leer();
        var k = b.getAttribute("data-l"), id = b.getAttribute("data-id"), d = Number(b.getAttribute("data-d"));
        if (f.modo === "quedan") {
          if (k === "quedan") f.quedan[id] = Math.max(0, Math.min(c.items[id], (f.quedan[id] || 0) + d));
          else f.devueltas[id] = Math.max(0, Math.min(f.quedan[id] || 0, (f.devueltas[id] || 0) + d));
          pintar(); return;
        }
        var otro = k === "vendidas" ? "devueltas" : "vendidas";
        var n = (f[k][id] || 0) + d;
        n = Math.max(0, Math.min(n, c.items[id] - (f[otro][id] || 0)));
        f[k][id] = n; pintar();
      };
    });
    ["lprecio", "lfecha", "lnota", "lpagado"].forEach(function (id) { document.getElementById(id).onchange = function () { leer(); pintar(); }; });
    document.getElementById("lguardar").onclick = function () {
      leer();
      var b = this; b.disabled = true;
      api("POST", "/consigna/liquidar", { tienda: c.tienda, precio: f.precio, fecha: f.fecha, nota: f.nota, vendidas: f.vendidas, devueltas: f.devueltas, pagado: f.pagado || 0 }).then(function (r) {
        b.disabled = false;
        if (!r.ok) { var le = document.getElementById("lerr"); le.textContent = r.error || "No se pudo guardar."; aviso(r.error || "No se pudo guardar", true); le.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
        aviso("Listo, cuentas al día con " + c.tienda); lform = null; vista = "inventario"; cargar();
      });
    };
  }

  // ——— historial
  function vHistorial(v) {
    var tipos = [["todos", "Todo"], ["venta", "Ventas"], ["apartado", "Apartados"], ["ajuste", "Ajustes"], ["consigna", "Consigna"], ["cobros", "Cobros de consigna"], ["entrada", "Entradas"], ["tomada", "Tomadas"], ["merma", "Merma"]];
    var gs = grupos(D.movimientos).filter(function (g) {
      if (filtroHist === "todos") return true;
      if (filtroHist === "consigna") return g.tipo === "consigna" || g.consigna;
      if (filtroHist === "cobros") return g.consigna && g.tipo !== "consigna";
      return g.tipo === filtroHist;
    });
    var cob = cobroConsignas();
    var nombres = { venta: "Venta", apartado: "Apartado", ajuste: "Ajuste de conteo", traspaso: "Traspaso", entrada: "Entrada", tomada: "Tomada", merma: "Merma", consigna: "Consigna", devolucion: "Regresó" };
    var h = '<div class="fila entre"><h2>Historial</h2><a class="btn chico claro" href="/api/movimientos.csv">Descargar Excel</a></div>' +
      '<div class="chips" style="margin-bottom:14px">' + tipos.map(function (t) {
        return '<button class="chip" data-f="' + t[0] + '" aria-pressed="' + (filtroHist === t[0]) + '">' + t[1] + "</button>";
      }).join("") + "</div>";
    if (filtroHist === "cobros") {
      var tot = 0, pt = {};
      (D.abonos || []).forEach(function (a) { var k = (a.tienda || "Sin nombre").trim(); pt[k] = (pt[k] || 0) + Number(a.monto); tot += Number(a.monto); });
      h += '<div class="mov"><div style="font-size:14px;color:var(--suave)">Lo que te han pagado por consignas</div><div style="font-size:26px;font-weight:700;margin:2px 0 8px">' + pesos(tot) + "</div>" +
        (Object.keys(pt).length ? "<table><tbody>" + Object.keys(pt).sort(function (a, b) { return pt[b] - pt[a]; }).map(function (k) { return "<tr><td>" + esc(k) + "</td><td class=num><b>" + pesos(pt[k]) + "</b></td></tr>"; }).join("") + "</tbody></table>" : '<p class="vacio">Todavía no has registrado pagos.</p>') + "</div>" +
        '<h3 style="margin:16px 0 8px">Pagos y abonos</h3>' +
        ((D.abonos || []).length ? (D.abonos || []).map(function (a) {
          return '<div class="mov"><div class="cab"><span><span class="pill p-venta">Pago</span> ' + esc(fechaBonita(a.fecha)) + "</span><span>" + esc(nombrePersona(a.quien)) + '</span></div><div class="pie" style="margin-top:6px"><span><b>' + esc(a.tienda) + "</b> · <b>" + pesos(a.monto) + "</b>" + (a.nota ? ' · <span style="color:var(--suave)">' + esc(a.nota) + "</span>" : "") + "</span>" +
            (a.grupo ? "" : '<button class="btn chico peligro" data-borraabono="' + a.id + '">Borrar</button>') + "</div></div>";
        }).join("") : "") +
        '<h3 style="margin:16px 0 8px">Bolsas vendidas que registraste</h3>';
    }
    if (filtroHist === "consigna") {
      var cu = cuentas();
      var lista = Object.keys(cu).map(function (k) { return cu[k]; }).sort(function (a, b) { return b.porCobrar - a.porCobrar; });
      if (lista.length) h += '<h3 style="margin:4px 0 8px">Cuenta por tienda</h3>' + lista.map(function (t) {
        var rc = resumenCuenta(t);
        var tag = rc.tipo === "debe" ? '<div class="cobro pend">⏳ <b>' + rc.titulo + " " + pesos(rc.monto) + "</b>: " + esc(rc.det) + (t.faltan ? ". Si regresa bolsas, baja." : "") + "</div>"
          : rc.tipo === "favor" ? '<div class="cobro parcial">🤝 <b>A su favor ' + pesos(rc.monto) + "</b>: " + rc.det + "</div>"
          : '<div class="cobro ok">✅ <b>Al corriente</b>: no debe nada</div>';
        return '<div class="mov"><div style="font-weight:700;font-size:16px">' + esc(t.tienda) + '</div>' +
          '<div style="font-size:14px;margin-top:6px;line-height:1.6">Le has dejado <b>' + t.dejadas + " bolsas</b> en " + t.n + (t.n === 1 ? " consigna" : " consignas") + " (" + pesos(t.valor) + ")<br>" +
          "Vendidas (registradas): <b>" + t.cobradas + " bolsas · " + pesos(t.cobrado) + "</b><br>" +
          "Te ha pagado: <b>" + pesos(t.abonado) + "</b>" + (t.abonos.length ? " en " + t.abonos.length + (t.abonos.length === 1 ? " pago" : " pagos") : "") +
          (t.regresaron ? "<br>Regresaron: " + t.regresaron : "") + (t.merma ? "<br>Merma: " + t.merma : "") +
          (t.faltan ? "<br>Siguen en la tienda: <b>" + t.faltan + (t.faltan === 1 ? " bolsa" : " bolsas") + " (" + pesos(t.enTienda) + ")</b>" : "") + "</div>" +
          tag +
          '<div class="fila" style="gap:6px;margin-top:8px;align-items:flex-end" data-abobox="' + esc(t.tienda) + '" hidden><label style="flex:1;margin:0">Monto<input inputmode="decimal" placeholder="$0"></label><label style="flex:2;margin:0">Nota<input placeholder="Ej. cliente me transfirió directo"></label><button class="btn chico" data-abook="' + esc(t.tienda) + '">Guardar</button></div>' +
          '<div class="fila" style="gap:6px;margin-top:8px;flex-wrap:wrap">' + (t.faltan ? '<button class="btn chico verde" data-cobrar="' + esc(t.tienda) + '">Pasar a cobrar</button>' : "") +
          '<button class="btn chico" data-abono="' + esc(t.tienda) + '">+ Abono / pago</button>' +
          '<button class="btn chico claro" data-ctxt="' + esc(t.tienda) + '">Mandar cuenta por WhatsApp</button><button class="btn chico claro" data-cimg="' + esc(t.tienda) + '">Compartir como imagen</button></div>' + "</div>";
      }).join("") + '<h3 style="margin:16px 0 8px">Movimientos</h3>';
      cuentasTienda = cu;
    }
    h += gs.length ? gs.slice(0, 200).map(function (g) {
      var n = 0; g.items.forEach(function (m) { n += m.cantidad; });
      return '<div class="mov"><div class="cab"><span><span class="pill p-' + g.tipo + '">' + (g.consigna && g.tipo === "venta" ? "Cobro de consigna" : nombres[g.tipo] + (g.consigna && g.tipo !== "devolucion" ? " (consigna)" : "")) + "</span> " + esc(fechaBonita(g.fecha)) + "</span><span>" + esc(nombrePersona(g.quien)) + "</span></div>" +
        (g.cliente ? '<div style="font-weight:600;margin-top:6px">' + esc(g.cliente) + "</div>" : "") +
        "<ul>" + g.items.map(function (m) { return "<li>" + m.cantidad + " × " + esc(nombreProd(m.producto_id)) + "</li>"; }).join("") + "</ul>" +
        (g.nota ? '<div style="font-size:13px;color:var(--suave);margin-bottom:8px">' + esc(g.nota) + "</div>" : "") +
        '<div class="pie"><span><strong>' + n + (n === 1 ? " bolsa" : " bolsas") + "</strong>" + (g.tipo === "venta" || g.tipo === "consigna" || g.tipo === "apartado" ? " · " + pesos(g.precio) + " c/u · <strong>" + pesos(n * g.precio) + "</strong>" : g.tipo === "entrada" && g.precio ? " · costo " + pesos(g.precio) : "") + "</span>" +
        '<span class="fila" style="gap:6px">' + (g.tipo === "venta" || g.tipo === "entrada" || g.tipo === "consigna" || g.tipo === "apartado" ? '<button class="btn chico claro" data-precio-g="' + esc(g.grupo) + '" data-actual="' + g.precio + '" data-t="' + g.tipo + '">' + (g.tipo === "entrada" ? "Cambiar costo" : "Cambiar precio") + "</button>" : "") +
        (g.tipo === "consigna" ? '<button class="btn chico claro" data-recibo="' + esc(g.grupo) + '">Recibo</button>' : "") +
        '<button class="btn chico peligro" data-borrar="' + esc(g.grupo) + '">Borrar</button></span></div>' +
        (g.tipo === "apartado" && g.anticipo ? '<div class="cobro ok">💵 Ya dio <b>' + pesos(g.anticipo) + "</b> de anticipo · resta " + pesos(Math.max(0, n * g.precio - g.anticipo)) + "</div>" : "") +
        (g.tipo === "consigna" ? estadoCobro(cob[g.grupo]) + (cob[g.grupo] && cob[g.grupo].faltan ? '<button class="btn chico verde" style="margin-top:8px" data-cobrar="' + esc(cob[g.grupo].tienda) + '">Pasar a cobrar</button>' : "") +
          '<div style="font-size:13px;margin-top:8px">' + estadoRemision(g.grupo) + "</div>" : "") + "</div>";
    }).join("") : '<p class="vacio">No hay movimientos.</p>';
    v.innerHTML = h;
    v.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { filtroHist = b.getAttribute("data-f"); pintar(); }; });
    v.querySelectorAll("[data-recibo]").forEach(function (b) { b.onclick = function () { rgrupo = b.getAttribute("data-recibo"); ir("remision"); }; });
    v.querySelectorAll("[data-cobrar]").forEach(function (b) { b.onclick = function () { lform = null; ltienda = b.getAttribute("data-cobrar"); ir("liquidar"); }; });
    v.querySelectorAll("[data-abono]").forEach(function (b) { b.onclick = function () { var x = v.querySelector('[data-abobox="' + b.getAttribute("data-abono") + '"]'); x.hidden = !x.hidden; if (!x.hidden) x.querySelector("input").focus(); }; });
    v.querySelectorAll("[data-abook]").forEach(function (b) {
      b.onclick = function () {
        var td = b.getAttribute("data-abook"), box = v.querySelector('[data-abobox="' + td + '"]'), ins = box.querySelectorAll("input");
        var monto = parseFloat(String(ins[0].value).replace(/[$,\s]/g, "")) || 0;
        if (!(monto > 0)) { aviso("Pon el monto del abono", true); ins[0].focus(); return; }
        b.disabled = true;
        api("POST", "/abonos", { tienda: td, monto: monto, nota: ins[1].value, fecha: D.hoy }).then(function (r) { b.disabled = false; if (!r.ok) { aviso(r.error || "No se pudo.", true); return; } aviso("Abono de " + pesos(monto) + " guardado"); cargar(); });
      };
    });
    v.querySelectorAll("[data-borraabono]").forEach(function (b) {
      b.onclick = function () {
        if (b.getAttribute("data-ok") !== "1") { b.setAttribute("data-ok", "1"); b.textContent = "¿Seguro? Toca otra vez"; return; }
        api("DELETE", "/abonos/" + b.getAttribute("data-borraabono")).then(function (r) { if (!r.ok) { aviso(r.error || "No se pudo.", true); return; } aviso("Abono borrado"); cargar(); });
      };
    });
    v.querySelectorAll("[data-ctxt]").forEach(function (b) { b.onclick = function () { var t = cuentasTienda[b.getAttribute("data-ctxt")]; if (!t) return; window.open("https://wa.me/" + telTienda(t) + "?text=" + encodeURIComponent(textoCuenta(t)), "_blank"); }; });
    v.querySelectorAll("[data-cimg]").forEach(function (b) { b.onclick = function () { var t = cuentasTienda[b.getAttribute("data-cimg")]; if (t) imagenCuenta(t, b); }; });
    v.querySelectorAll("[data-precio-g]").forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-t") === "entrada" ? "Nuevo costo por bolsa" : "Nuevo precio por bolsa";
        var nuevo = window.prompt(t + " (actual $" + b.getAttribute("data-actual") + "):", b.getAttribute("data-actual"));
        if (nuevo === null) return;
        var n = parseFloat(String(nuevo).replace(/[$,\s]/g, ""));
        if (!(n >= 0)) { aviso("Ese número no es válido."); return; }
        api("PUT", "/movimientos/" + b.getAttribute("data-precio-g"), { precio: n }).then(function (r) { aviso(r.ok ? "Actualizado" : (r.error || "No se pudo cambiar.")); cargar(); });
      };
    });
    v.querySelectorAll("[data-borrar]").forEach(function (b) {
      b.onclick = function () {
        if (!b.classList.contains("seguro")) { b.classList.add("seguro"); b.textContent = "¿Seguro? Toca otra vez"; setTimeout(function () { b.classList.remove("seguro"); b.textContent = "Borrar"; }, 4000); return; }
        b.disabled = true;
        api("DELETE", "/movimientos/" + b.getAttribute("data-borrar")).then(function (r) {
          if (!r.ok) { aviso(r.error || "No se pudo borrar."); b.disabled = false; return; }
          aviso("Borrado"); cargar();
        });
      };
    });
  }

  // ——— ajustes
  // Reduce la foto en el cel (máx. 800 px) para que pese poco y cargue rápido en la página.
  function achicarFoto(file) {
    return new Promise(function (ok, mal) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = mal; img.src = url;
    });
  }
  function vArchivos(v) {
    var h = "<h2>Archivos</h2><p class=\"vacio\" style=\"margin:-6px 0 14px\">Todo lo que se manda o se imprime, siempre en su última versión. Toca para descargar.</p>";
    DOCS.forEach(function (g) {
      h += '<div class="caja"><h3>' + esc(g.grupo) + "</h3>" + g.items.map(function (it) {
        return '<div class="doc' + (it.falta ? " falta" : "") + '"><div><strong>' + esc(it.t) + '</strong><p class="vacio">' + esc(it.d) + "</p></div>" +
          (it.falta ? '<span class="pend">Por subir</span>' : '<div class="docb">' + it.f.map(function (f) {
            var url = f[1].charAt(0) === "/" ? f[1] : "/admin/docs/" + f[1];
            return '<a class="btn chico claro" href="' + url + '"' + (/\/$/.test(url) ? ' target="_blank" rel="noopener"' : " download") + ">" + esc(f[0]) + "</a>";
          }).join("") + "</div>") + "</div>";
      }).join("") + "</div>";
    });
    v.innerHTML = h;
  }

  function vAjustes(v) {
    var a = D.ajustes;
    var tel = String(a.whatsapp || "").replace(/^52/, "");
    var h = "<h2>Ajustes</h2>" +
      '<div class="caja"><h3>Precios de venta</h3><p class="vacio" style="margin-bottom:10px">Son los botones que salen al registrar una venta. Los reportes separan lo vendido en cada precio.</p><div id="lprecios">' +
      a.precios.map(filaPrecio).join("") + '</div><button class="enlace" id="addp">+ Agregar precio</button></div>' +
      '<div class="caja"><div class="rejilla2"><label>Costo por bolsa<input id="acosto" inputmode="decimal" value="' + esc(a.costo) + '"><span style="display:flex;align-items:center;gap:8px;font-weight:500;margin-top:8px"><input type="checkbox" id="acostotodo" style="width:20px;height:20px"> Aplicar también a la mercancía que ya llegó</span></label>' +
      '<label>Avisar cuando queden<input id="abajo" inputmode="numeric" value="' + esc(a.stockBajo) + '"></label>' +
      '<label>Pedido mínimo a domicilio (bolsas)<input id="amin" inputmode="numeric" value="' + esc(a.minimo || 10) + '"></label></div>' +
      '<p class="vacio" style="margin-top:6px">La página pide este mínimo de bolsas para pedir a domicilio.</p>' +
      '<label style="display:flex;align-items:center;gap:10px;margin-top:10px;font-weight:500"><input type="checkbox" id="aagot" style="width:22px;height:22px"' + (a.mostrarAgotados ? " checked" : "") + '> Marcar en la página los sabores agotados</label>' +
      '<p class="vacio" style="margin-top:4px">Apagado: todos los sabores salen disponibles y tú confirmas por WhatsApp qué hay.</p>' +
      '<label style="margin-top:10px">WhatsApp de la página (10 dígitos)<input id="awa" inputmode="tel" value="' + esc(tel) + '"></label>' +
      '<p class="vacio" style="margin-top:6px">' + (variasCiudades() ? "Respaldo: los pedidos llegan al WhatsApp de cada ciudad (abajo, en Ciudades)." : "A este número llegan los pedidos de crunchitos.mx.") + '</p></div>' +
      '<button class="btn" id="gaj" style="width:100%;margin-bottom:20px">Guardar ajustes</button><p class="error" id="aerr"></p>';
    h += '<div class="caja"><h3>Dónde encontrarnos (sale en la página)</h3>' +
      ((D.puntos || []).length ? "<table><tbody>" + D.puntos.map(function (x) {
        return "<tr><td><strong>" + esc(x.nombre) + "</strong><br><span class=vacio>" + esc(x.direccion) + "</span></td><td class=num>" +
          (x.mapa ? '<a href="' + esc(x.mapa) + '" target="_blank" rel="noopener" style="color:var(--tinta);font-weight:600;margin-right:6px">Mapa</a>' : "") +
          '<label class="btn chico claro" style="cursor:pointer">' + (x.tieneFoto ? "Cambiar foto" : "Subir foto") + '<input type="file" accept="image/*" data-fpunto="' + x.id + '" hidden></label> ' +
          '<button class="btn chico peligro" data-qpunto="' + x.id + '">Quitar</button></td></tr>';
      }).join("") + "</tbody></table>" : '<p class="vacio">Todavía no hay lugares.</p>') +
      '<form id="fpunto" style="margin-top:12px"><label>Nombre del lugar<input id="pnom" placeholder="Ej. Tortillería De Jesús"></label>' +
      '<label style="margin-top:8px">Dirección corta<input id="pdir" placeholder="Calle y número, colonia"></label>' +
      '<label style="margin-top:8px">Foto de la fachada (opcional, ayuda a que la ubiquen)<input id="pfoto" type="file" accept="image/*"></label>' +
      '<label style="margin-top:8px">Liga de Google Maps (opcional)<input id="pmap" inputmode="url" placeholder="https://maps.app.goo.gl/…"></label>' +
      '<p class="vacio" style="margin-top:6px">En Google Maps busca el lugar → Compartir → Copiar vínculo, y pégalo aquí.</p>' +
      '<button class="btn chico" style="width:100%;margin-top:10px">Agregar lugar</button></form></div>';
    h += '<div class="caja"><h3>Ciudades</h3><p class="vacio" style="margin-bottom:10px">Cada ciudad lleva su inventario, su caja y sus puntos de venta. A su WhatsApp llegan los pedidos de esa ciudad.</p><table><tbody>' +
      D.ciudades.map(function (c) { return "<tr><td><strong>" + esc(c.nombre) + "</strong><br><span class=vacio>" + esc(String(c.whatsapp || "").replace(/^52/, "")) + "</span></td><td class=num>" +
        '<label style="display:inline-flex;align-items:center;gap:6px;font-weight:500;font-size:13px"><input type="checkbox" data-cpub="' + esc(c.id) + '"' + (c.publica ? " checked" : "") + (D.esDueno ? "" : " disabled") + ' style="width:20px;height:20px"> En la página</label></td></tr>'; }).join("") + "</tbody></table>" +
      '<p class="vacio" style="margin-top:6px">"En la página": la ciudad sale para elegir en crunchitos.mx y en el kit. Apágala mientras no haya mercancía ahí.</p>' +
      (D.esDueno ? '<form id="fciu" class="rejilla2" style="margin-top:12px"><label>Ciudad<input id="cnom" placeholder="Ej. Monterrey"></label><label>WhatsApp (10 dígitos)<input id="cwa" inputmode="tel" placeholder="81…"></label><button class="btn chico" style="grid-column:1/-1">Agregar o actualizar ciudad</button></form><p class="vacio" style="margin-top:6px">Para cambiar el WhatsApp de una ciudad, escribe el mismo nombre con el número nuevo.</p>' : "") + "</div>";
    h += '<div class="caja"><h3>Equipo con acceso</h3><table><tbody><tr><td>Sebas</td><td>' + esc(D.dueno) + "</td><td></td></tr>" +
      D.equipo.map(function (e) {
        return "<tr><td>" + esc(e.nombre || "—") + "</td><td>" + esc(e.email) +
          (variasCiudades() ? '<br><select data-eqc="' + esc(e.email) + '"' + (D.esDueno ? "" : " disabled") + ' style="margin-top:4px;font:500 13px Poppins,sans-serif;border-radius:8px;padding:3px 6px">' + D.ciudades.map(function (c) { return '<option value="' + esc(c.id) + '"' + ((e.ciudad || "chihuahua") === c.id ? " selected" : "") + ">" + esc(c.nombre) + "</option>"; }).join("") + "</select>" : "") +
          "</td><td class=num>" + (D.esDueno ? '<button class="btn chico peligro" data-quitar="' + esc(e.email) + '">Quitar</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table>" +
      (D.esDueno ? '<form id="feq" class="rejilla2" style="margin-top:12px"><label>Nombre<input id="enom" placeholder="Paola"></label><label>Correo<input id="eem" type="email" placeholder="correo@gmail.com"></label><button class="btn chico" style="grid-column:1/-1">Dar acceso</button></form>'
        : '<p class="vacio" style="margin-top:8px">Solo Sebas puede agregar o quitar personas.</p>') + "</div>";
    v.innerHTML = h;
    function filaPrecio(p) {
      return '<div class="fila" style="margin-bottom:8px;flex-wrap:nowrap"><input class="pn" value="' + esc(p.nombre) + '" placeholder="Nombre" aria-label="Nombre del precio"><input class="pv" inputmode="decimal" value="' + esc(p.valor) + '" style="width:90px" aria-label="Precio"><button class="btn chico peligro qp" type="button" aria-label="Quitar precio">×</button></div>';
    }
    var fc = document.getElementById("fciu");
    if (fc) fc.onsubmit = function (ev) {
      ev.preventDefault();
      api("POST", "/ciudades", { nombre: document.getElementById("cnom").value, whatsapp: document.getElementById("cwa").value, ciudad: undefined }).then(function (r) {
        if (!r.ok) { aviso(r.error || "No se pudo", true); return; } aviso("Ciudad guardada"); cargar();
      });
    };
    v.querySelectorAll("[data-cpub]").forEach(function (cb) {
      cb.onchange = function () { api("POST", "/ciudades/" + cb.getAttribute("data-cpub") + "/publica", { publica: cb.checked }).then(function (r) { aviso(r.ok ? (cb.checked ? "Ya sale en la página" : "Ya no sale en la página") : (r.error || "No se pudo"), !r.ok); cargar(); }); };
    });
    v.querySelectorAll("[data-eqc]").forEach(function (sel) {
      sel.onchange = function () { api("POST", "/equipo/ciudad", { email: sel.getAttribute("data-eqc"), ciudad: sel.value }).then(function (r) { aviso(r.ok ? "Listo" : (r.error || "No se pudo"), !r.ok); cargar(); }); };
    });
    function engancharQuitar() { v.querySelectorAll(".qp").forEach(function (b) { b.onclick = function () { b.parentNode.remove(); }; }); }
    engancharQuitar();
    document.getElementById("addp").onclick = function () {
      document.getElementById("lprecios").insertAdjacentHTML("beforeend", filaPrecio({ nombre: "", valor: "" })); engancharQuitar();
    };
    document.getElementById("gaj").onclick = function () {
      var precios = [].map.call(v.querySelectorAll("#lprecios .fila"), function (f) {
        return { nombre: f.querySelector(".pn").value, valor: parseFloat(f.querySelector(".pv").value) };
      }).filter(function (p) { return p.nombre.trim() && !isNaN(p.valor); }).sort(function (a, b) { return a.valor - b.valor; });
      api("PUT", "/ajustes", { precios: precios, costo: parseFloat(document.getElementById("acosto").value), aplicarCosto: document.getElementById("acostotodo").checked, stockBajo: parseInt(document.getElementById("abajo").value, 10), minimo: parseInt(document.getElementById("amin").value, 10), mostrarAgotados: document.getElementById("aagot").checked, whatsapp: document.getElementById("awa").value }).then(function (r) {
        if (!r.ok) { var ae = document.getElementById("aerr"); ae.textContent = r.error || "No se pudo guardar."; aviso(r.error || "No se pudo guardar", true); ae.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
        aviso("Ajustes guardados"); cargar();
      });
    };
    v.querySelectorAll("[data-quitar]").forEach(function (b) {
      b.onclick = function () {
        if (!b.classList.contains("seguro")) { b.classList.add("seguro"); b.textContent = "¿Seguro?"; return; }
        api("DELETE", "/equipo/" + encodeURIComponent(b.getAttribute("data-quitar"))).then(function (r) { aviso(r.ok ? "Acceso quitado" : r.error); cargar(); });
      };
    });
    v.querySelectorAll("[data-qpunto]").forEach(function (b) {
      b.onclick = function () {
        if (!b.classList.contains("seguro")) { b.classList.add("seguro"); b.textContent = "¿Seguro?"; return; }
        api("DELETE", "/puntos/" + b.getAttribute("data-qpunto")).then(function (r) { aviso(r.ok ? "Lugar quitado" : r.error); cargar(); });
      };
    });
    v.querySelectorAll("[data-fpunto]").forEach(function (inp) {
      inp.onchange = function () {
        if (!inp.files[0]) return;
        aviso("Subiendo foto…");
        achicarFoto(inp.files[0]).then(function (foto) { return api("PUT", "/puntos/" + inp.getAttribute("data-fpunto") + "/foto", { foto: foto }); })
          .then(function (r) { aviso(r.ok ? "Foto lista" : r.error || "No se pudo subir."); cargar(); }, function () { aviso("No se pudo leer la foto."); });
      };
    });
    document.getElementById("fpunto").onsubmit = function (e) {
      e.preventDefault();
      var archivo = document.getElementById("pfoto").files[0];
      (archivo ? achicarFoto(archivo) : Promise.resolve("")).then(function (foto) {
        return api("POST", "/puntos", { nombre: document.getElementById("pnom").value, direccion: document.getElementById("pdir").value, mapa: document.getElementById("pmap").value, foto: foto });
      }).then(function (r) {
        if (!r.ok) { aviso(r.error || "No se pudo agregar."); return; }
        aviso("Listo, ya sale en la página"); cargar();
      });
    };
    var feq = document.getElementById("feq");
    if (feq) feq.onsubmit = function (e) {
      e.preventDefault();
      api("POST", "/equipo", { nombre: document.getElementById("enom").value, email: document.getElementById("eem").value }).then(function (r) {
        if (!r.ok) { aviso(r.error || "No se pudo agregar."); return; }
        aviso("Listo, ya puede entrar"); cargar();
      });
    };
  }

  cargar();
})();
