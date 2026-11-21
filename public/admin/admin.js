// Panel de Crunchitos: inventario, ventas y reportes. Sin librerías.
(function () {
  "use strict";
  var app = document.getElementById("app");
  var D = null; // datos del servidor
  var vista = "inicio";
  var periodo = "30";
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
  function aviso(t) {
    var a = document.getElementById("aviso");
    a.textContent = t; a.hidden = false;
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { a.hidden = true; }, 2600);
  }
  function api(metodo, ruta, body) {
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
    ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  };

  // ——— cálculos
  function stock() {
    var s = {};
    D.productos.forEach(function (p) { s[p.id] = 0; });
    D.movimientos.forEach(function (m) {
      var d = (m.tipo === "entrada" || m.tipo === "devolucion") ? m.cantidad : (m.consigna ? 0 : -m.cantidad);
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
      var r = t[k] = t[k] || { tienda: k, items: {}, precio: 0, desde: null, ultima: null, vendido: 0 };
      if (m.tipo === "consigna") { r.items[m.producto_id] = (r.items[m.producto_id] || 0) + m.cantidad; r.precio = m.precio; if (!r.desde) r.desde = m.fecha; r.ultima = m.fecha; }
      else { r.items[m.producto_id] = (r.items[m.producto_id] || 0) - m.cantidad; if (m.tipo === "venta") r.vendido += m.cantidad * m.precio; }
    });
    return Object.keys(t).map(function (k) {
      var r = t[k], n = 0;
      Object.keys(r.items).forEach(function (id) { if (r.items[id] <= 0) delete r.items[id]; else n += r.items[id]; });
      r.bolsas = n; return r;
    }).filter(function (r) { return r.bolsas > 0; }).sort(function (a, b) { return (a.ultima || "").localeCompare(b.ultima || ""); });
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
      if (!g[m.grupo]) { g[m.grupo] = { grupo: m.grupo, tipo: m.tipo, consigna: m.consigna, fecha: m.fecha, quien: m.quien, cliente: m.cliente, nota: m.nota, precio: m.precio, creado: m.creado, items: [] }; orden.push(m.grupo); }
      g[m.grupo].items.push(m);
    });
    return orden.map(function (k) { return g[k]; });
  }

  // ——— carga
  function cargar() {
    return api("GET", "/datos").then(function (d) {
      if (d._status === 401) { D = null; pintarLogin(); return; }
      if (!d.ok) { app.innerHTML = '<p class="cargando">' + esc(d.error || "No se pudo cargar.") + ' <button class="enlace" id="re">Reintentar</button></p>'; document.getElementById("re").onclick = cargar; return; }
      D = d; D.hoy = hoyLocal() > d.hoy ? hoyLocal() : d.hoy;
      pintar();
    });
  }

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
    var tabs = [["inicio", "Inicio"], ["vender", "Vender"], ["gastos", "Gastos"], ["inventario", "Inventario"], ["historial", "Historial"], ["ajustes", "Ajustes"]];
    app.innerHTML =
      '<header class="top"><img src="/img/logo.svg" alt="Crunchitos"><div class="quien">' + esc(nombrePersona(D.yo)) +
      ' <button class="enlace" id="salir">Salir</button></div></header>' +
      '<main id="vista"></main>' +
      '<nav class="tabs" aria-label="Secciones">' + tabs.map(function (t) {
        var actual = vista === "liquidar" || vista === "entrada" ? "inventario" : vista;
        return '<button data-v="' + t[0] + '"' + (actual === t[0] ? ' aria-current="page"' : "") + '><svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[t[0]] + "</svg>" + t[1] + "</button>";
      }).join("") + "</nav>";
    document.getElementById("salir").onclick = function () { api("POST", "/logout").then(function () { pintarLogin(); }); };
    app.querySelectorAll(".tabs button").forEach(function (b) {
      b.onclick = function () { ir(b.getAttribute("data-v")); };
    });
    var v = document.getElementById("vista");
    ({ inicio: vInicio, vender: vVender, gastos: vGastos, inventario: vInventario, historial: vHistorial, ajustes: vAjustes, entrada: vVender, liquidar: vLiquidar })[vista](v);
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
    var h = '<div class="fila entre"><h2>Cómo vamos</h2></div>' +
      '<div class="chips" role="group" aria-label="Periodo" style="margin-bottom:14px">' + periodos.map(function (p) {
        return '<button class="chip" data-p="' + p[0] + '" aria-pressed="' + (periodo === p[0]) + '">' + p[1] + "</button>";
      }).join("") + "</div>";
    if (bajos.length) h += '<div class="alerta"><strong>Se están acabando:</strong> ' + bajos.map(function (p) { return esc(p.nombre_base + " " + p.sabor) + " (" + st[p.id] + ")"; }).join(", ") + "</div>";
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
    v.querySelectorAll("[data-p]").forEach(function (b) { b.onclick = function () { periodo = b.getAttribute("data-p"); pintar(); }; });
    document.getElementById("irgastos").onclick = function () { ir("gastos"); };
  }

  // ——— gastos
  var CAT = { etiquetas: "Etiquetas e impresión", envio: "Envío de la fábrica", gasolina: "Gasolina", empaque: "Empaque", publicidad: "Publicidad", otro: "Otro" };
  var gform = null;
  function vGastos(v) {
    if (!gform) gform = { monto: "", concepto: "", categoria: "envio", pago: D.yo, fecha: D.hoy, nota: "" };
    var g = gform;
    var personas = [D.dueno].concat(D.equipo.map(function (e) { return e.email; }));
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
        if (!r.ok) { err.textContent = r.error || "No se pudo guardar."; return; }
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
    var def = precios.find(function (p) { return /distrib/i.test(p.nombre); }) || precios[0];
    return { tipo: tipo, items: {}, precio: tipo === "entrada" ? Number(D.ajustes.costo) : (def ? Number(def.valor) : 0), cliente: "", nota: "", fecha: D.hoy, enviando: false };
  }
  function vVender(v) {
    if (!form) form = nuevoForm(vista === "entrada" ? "entrada" : "venta");
    var st = stock(), f = form, esEntrada = f.tipo === "entrada";
    var titulos = { venta: "Registrar venta", consigna: "Dejar a consigna", entrada: "Llegó mercancía", tomada: "Bolsas que se tomaron", merma: "Merma (rotas o caducadas)" };
    var h = "<h2>" + titulos[f.tipo] + "</h2>";
    if (!esEntrada) {
      h += '<div class="chips" role="group" aria-label="Tipo" style="margin-bottom:14px">' + [["venta", "Venta"], ["consigna", "Consigna"], ["tomada", "Me llevé / regalo"], ["merma", "Merma"]].map(function (t) {
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
    if (f.tipo === "venta" || f.tipo === "consigna") {
      var esCons = f.tipo === "consigna";
      if (esCons) h += '<p class="vacio" style="margin:0 0 10px">Las bolsas salen de tu inventario pero no cuentan como vendidas. Cuando pases a cobrar, en Inventario → En consigna marcas cuántas se vendieron.</p>';
      h += "<h3>" + (esCons ? "Precio acordado por bolsa" : "¿A cuánto la vendiste?") + "</h3><div class=\"chips\" style=\"margin-bottom:10px\">" + D.ajustes.precios.map(function (p) {
        return '<button class="chip" type="button" data-precio="' + Number(p.valor) + '" aria-pressed="' + (Number(p.valor) === Number(f.precio)) + '">' + pesos(p.valor) + " · " + esc(p.nombre) + "</button>";
      }).join("") + "</div>" +
        '<div class="rejilla2"><label>Precio por bolsa<input id="fprecio" inputmode="decimal" value="' + (f.precio || "") + '"></label>' +
        '<label>Total cobrado<input id="ftotal" inputmode="decimal" value="' + (totalBolsas() && f.precio ? redondo(totalBolsas() * f.precio) : "") + '" placeholder="$0"></label></div>' +
        '<p class="vacio" style="margin-top:6px;font-size:13px">Toca un precio o escribe el tuyo ($35, $45, $47…). Si diste un trato (ej. 3 por $100), pon el total y se calcula solo.</p>';
      var nombres = {}; D.movimientos.forEach(function (m) { if (m.cliente && (!esCons || m.tipo === "consigna")) nombres[m.cliente] = 1; });
      h += '<div class="rejilla2" style="margin-top:10px"><label>' + (esCons ? "Tienda o persona" : "Cliente (opcional)") + '<input id="fcliente" list="lclientes" value="' + esc(f.cliente) + '" placeholder="' + (esCons ? "Ej. Abarrotes Doña Mary" : "Ej. Gym Fuerza") + '"></label>' +
        '<label>Fecha<input type="date" id="ffecha" value="' + esc(f.fecha) + '" max="' + esc(D.hoy) + '"></label></div>' +
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
    h += '<div class="barra"><button class="btn ' + (f.tipo === "venta" ? "verde" : f.tipo === "consigna" ? "morado" : "") + '" id="guardar"></button></div>';
    v.innerHTML = h;
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
    ["fcliente", "ffecha", "fnota"].forEach(function (id) {
      var e = document.getElementById(id); if (e) e.oninput = function () { guardarCampos(); resumenBoton(); };
    });
    var c = document.getElementById("cancelar"); if (c) c.onclick = function () { ir("inventario"); };
    document.getElementById("guardar").onclick = function () { enviar(false); };
  }
  function guardarCampos() {
    var g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (g("fprecio") !== null) form.precio = parseFloat(String(g("fprecio")).replace(/[$,\s]/g, "")) || 0;
    if (g("fcliente") !== null) form.cliente = g("fcliente");
    if (g("ffecha") !== null) form.fecha = g("ffecha") || D.hoy;
    if (g("fnota") !== null) form.nota = g("fnota");
  }
  function totalBolsas() {
    var t = 0; Object.keys(form.items).forEach(function (k) { t += form.items[k] || 0; }); return t;
  }
  function resumenBoton() {
    var b = document.getElementById("guardar"); if (!b) return;
    var n = totalBolsas();
    var etiqueta = { venta: "Guardar venta", consigna: "Dejar a consigna", entrada: "Guardar entrada", tomada: "Guardar", merma: "Guardar merma" }[form.tipo];
    b.textContent = n ? etiqueta + " · " + n + (n === 1 ? " bolsa" : " bolsas") + (form.tipo === "venta" || form.tipo === "consigna" ? " · " + pesos(n * form.precio) : "") : "Elige las bolsas";
    b.disabled = !n || form.enviando;
  }
  function enviar(forzar) {
    guardarCampos();
    var err = document.getElementById("ferr");
    var items = Object.keys(form.items).filter(function (k) { return form.items[k] > 0; }).map(function (k) { return { producto_id: k, cantidad: form.items[k] }; });
    form.enviando = true; resumenBoton(); err.textContent = "";
    api("POST", "/movimientos", { tipo: form.tipo, items: items, precio: form.precio, cliente: form.cliente, nota: form.nota, fecha: form.fecha, forzar: forzar }).then(function (r) {
      form.enviando = false; resumenBoton();
      if (r._status === 401) { pintarLogin(); return; }
      if (r.sinStock) {
        err.innerHTML = "No alcanza el inventario: " + r.sinStock.map(function (s) { return esc(nombreProd(s.id)) + " (hay " + s.hay + ", pones " + s.pides + ")"; }).join(", ") +
          '. <button class="enlace" id="forzar">Guardar de todos modos</button>';
        document.getElementById("forzar").onclick = function () { enviar(true); };
        return;
      }
      if (!r.ok) { err.textContent = r.error || "No se pudo guardar."; return; }
      var tipo = form.tipo;
      aviso({ venta: "Venta guardada 🙌", consigna: "Consigna guardada", entrada: "Entrada guardada", tomada: "Guardado", merma: "Merma guardada" }[tipo]);
      return cargar().then(function () {
        if (tipo === "entrada" || tipo === "consigna") { vista = "inventario"; form = null; pintar(); }
        else { form = nuevoForm(tipo); pintar(); }
      });
    });
  }

  // ——— inventario
  function vInventario(v) {
    var st = stock(), cp = costoPromedio(), cs = consignas();
    var t = { e: 0, v: 0, t: 0, m: 0, c: 0 };
    var filas = D.productos.map(function (p) {
      var r = { e: 0, v: 0, t: 0, m: 0 };
      D.movimientos.forEach(function (m) {
        if (m.producto_id !== p.id) return;
        var k = { entrada: "e", venta: "v", tomada: "t", merma: "m" }[m.tipo];
        if (k) r[k] += m.cantidad;
      });
      r.c = 0; cs.forEach(function (c) { r.c += c.items[p.id] || 0; }); t.c += r.c;
      Object.keys(t).forEach(function (k) { t[k] += r[k]; });
      var bajo = r.e > 0 && st[p.id] <= (D.ajustes.stockBajo || 0);
      return "<tr><td><span class=\"punto\" style=\"background:" + esc(p.color) + "\"></span>" + esc(p.nombre_base + " " + p.sabor) + "</td><td class=num>" + r.e + "</td><td class=num>" + (r.v || "–") + "</td><td class=num>" + ((r.t + r.m) || "–") + "</td><td class=num>" + (r.c || "–") + '</td><td class="num' + (bajo ? " bajo" : "") + '"><strong>' + st[p.id] + "</strong></td></tr>";
    }).join("");
    var quedan = 0; D.productos.forEach(function (p) { quedan += st[p.id]; });
    v.innerHTML = '<div class="fila entre"><h2>Inventario</h2><button class="btn chico" id="llego">+ Llegó mercancía</button></div>' +
      '<div class="kpis"><div class="kpi amarillo"><span>Quedan</span><strong>' + num(quedan) + "</strong><small>bolsas</small></div>" +
      '<div class="kpi"><span>Valor a costo</span><strong>' + pesos(quedan * cp) + "</strong><small>" + pesos(cp) + " por bolsa</small></div>" +
      '<div class="kpi"><span>Si se venden a público</span><strong>' + pesos(quedan * precioPublico()) + "</strong><small>" + pesos(precioPublico()) + " por bolsa</small></div>" +
      '<div class="kpi"><span>Han llegado</span><strong>' + num(t.e) + "</strong><small>bolsas en total</small></div></div>" +
      vConsignas(cs) +
      '<h2 style="margin-top:20px">Por sabor</h2><div class="caja" style="overflow-x:auto"><table><thead><tr><th>Sabor</th><th class=num>Llegó</th><th class=num>Vend.</th><th class=num title="Tomadas y merma">Otras</th><th class=num title="A consigna en tiendas">Tiendas</th><th class=num title="En bodega">Quedan</th></tr></thead><tbody>' + filas +
      "</tbody><tfoot><tr><td>Total</td><td class=num>" + t.e + "</td><td class=num>" + t.v + "</td><td class=num>" + (t.t + t.m) + "</td><td class=num>" + t.c + "</td><td class=num>" + quedan + "</td></tr></tfoot></table></div>" +
      '<p class="vacio">Quedan = en tu bodega. Tiendas = dejadas a consigna. Otras = bolsas que se tomaron o se echaron a perder. En rojo: sabores con ' + (D.ajustes.stockBajo || 0) + " bolsas o menos. Para corregir un conteo, registra una merma o una entrada con la diferencia.</p>";
    document.getElementById("llego").onclick = function () { ir("entrada"); };
    v.querySelectorAll("[data-cobrar]").forEach(function (b) { b.onclick = function () { lform = null; ltienda = b.getAttribute("data-cobrar"); ir("liquidar"); }; });
    var nc = document.getElementById("nuevacons"); if (nc) nc.onclick = function () { ir("vender"); form.tipo = "consigna"; pintar(); };
  }
  function vConsignas(cs) {
    var h = '<div class="fila entre" style="margin:20px 0 10px"><h2 style="margin:0">En consigna</h2><button class="btn chico" id="nuevacons">+ Dejar a consigna</button></div>';
    if (!cs.length) return h + '<p class="vacio" style="margin-bottom:16px">No hay bolsas dejadas en tiendas.</p>';
    return h + cs.map(function (c) {
      var d = diasDesde(c.ultima);
      return '<div class="mov"><div class="cab"><span style="font-weight:700;color:var(--tinta);font-size:16px">' + esc(c.tienda) + "</span><span" + (d >= 14 ? ' class="bajo"' : "") + ">hace " + d + (d === 1 ? " día" : " días") + "</span></div>" +
        "<ul>" + Object.keys(c.items).map(function (id) { return "<li>" + c.items[id] + " × " + esc(nombreProd(id)) + "</li>"; }).join("") + "</ul>" +
        '<div class="pie"><span><strong>' + c.bolsas + (c.bolsas === 1 ? " bolsa" : " bolsas") + "</strong> · " + pesos(c.precio) + " c/u · <strong>" + pesos(c.bolsas * c.precio) + "</strong></span>" +
        '<button class="btn chico verde" data-cobrar="' + esc(c.tienda) + '">Pasar a cobrar</button></div></div>';
    }).join("");
  }

  // ——— pasar a cobrar una consigna
  var lform = null, ltienda = null;
  function vLiquidar(v) {
    var c = consignas().find(function (x) { return x.tienda === ltienda; });
    if (!c) { vista = "inventario"; pintar(); return; }
    if (!lform) lform = { precio: c.precio, vendidas: {}, devueltas: {}, fecha: D.hoy, nota: "" };
    var f = lform;
    function total(o) { var n = 0; Object.keys(o).forEach(function (k) { n += o[k] || 0; }); return n; }
    var h = '<button class="enlace" id="volver">← Inventario</button><h2>Cobrar a ' + esc(c.tienda) + "</h2>" +
      '<p class="vacio" style="margin:-4px 0 12px">Cuenta lo que queda en la tienda. Pon cuántas se vendieron y cuántas te traes de regreso; las demás se quedan a consigna.</p>' +
      '<button class="btn chico claro" id="todas" style="margin-bottom:12px">Se vendieron todas</button>' +
      '<div class="sabores">' + Object.keys(c.items).map(function (id) {
        var tiene = c.items[id], vnd = f.vendidas[id] || 0, dev = f.devueltas[id] || 0;
        return '<div class="caja" style="margin:0;padding:12px"><div class="fila entre"><strong style="font-size:15px">' + esc(nombreProd(id)) + '</strong><small class="vacio">tiene ' + tiene + "</small></div>" +
          '<div class="rejilla2" style="margin-top:8px">' + ["vendidas", "devueltas"].map(function (k) {
            var n = k === "vendidas" ? vnd : dev;
            return '<div><small style="font-weight:600">' + (k === "vendidas" ? "Se vendieron" : "Regresan") + '</small><div class="paso" style="margin-top:4px"><button type="button" data-l="' + k + '" data-id="' + esc(id) + '" data-d="-1">−</button><input readonly value="' + n + '" aria-label="' + (k === "vendidas" ? "Vendidas" : "Regresan") + '"><button type="button" data-l="' + k + '" data-id="' + esc(id) + '" data-d="1">+</button></div></div>';
          }).join("") + "</div></div>";
      }).join("") + "</div>" +
      '<div class="caja" style="margin-top:14px"><div class="rejilla2"><label>Precio por bolsa<input id="lprecio" inputmode="decimal" value="' + esc(f.precio) + '"></label><label>Fecha<input type="date" id="lfecha" value="' + esc(f.fecha) + '" max="' + esc(D.hoy) + '"></label></div>' +
      '<label style="margin-top:10px">Nota (opcional)<input id="lnota" value="' + esc(f.nota) + '" placeholder="Ej. le dejé 10 más"></label><p class="error" id="lerr" style="margin-top:10px"></p></div>' +
      '<div class="barra"><button class="btn verde" id="lguardar">' + (total(f.vendidas) ? "Cobrar " + pesos(total(f.vendidas) * f.precio) + " · " + total(f.vendidas) + " vendidas" : "Guardar") + (total(f.devueltas) ? " · " + total(f.devueltas) + " regresan" : "") + "</button></div>";
    v.innerHTML = h;
    function leer() { f.precio = parseFloat(document.getElementById("lprecio").value) || 0; f.fecha = document.getElementById("lfecha").value || D.hoy; f.nota = document.getElementById("lnota").value; }
    document.getElementById("volver").onclick = function () { ir("inventario"); };
    document.getElementById("todas").onclick = function () { leer(); f.devueltas = {}; Object.keys(c.items).forEach(function (id) { f.vendidas[id] = c.items[id]; }); pintar(); };
    v.querySelectorAll("[data-l]").forEach(function (b) {
      b.onclick = function () {
        leer();
        var k = b.getAttribute("data-l"), id = b.getAttribute("data-id"), otro = k === "vendidas" ? "devueltas" : "vendidas";
        var n = (f[k][id] || 0) + Number(b.getAttribute("data-d"));
        n = Math.max(0, Math.min(n, c.items[id] - (f[otro][id] || 0)));
        f[k][id] = n; pintar();
      };
    });
    ["lprecio", "lfecha", "lnota"].forEach(function (id) { document.getElementById(id).onchange = function () { leer(); pintar(); }; });
    document.getElementById("lguardar").onclick = function () {
      leer();
      var b = this; b.disabled = true;
      api("POST", "/consigna/liquidar", { tienda: c.tienda, precio: f.precio, fecha: f.fecha, nota: f.nota, vendidas: f.vendidas, devueltas: f.devueltas }).then(function (r) {
        b.disabled = false;
        if (!r.ok) { document.getElementById("lerr").textContent = r.error || "No se pudo guardar."; return; }
        aviso("Listo, cuentas al día con " + c.tienda); lform = null; vista = "inventario"; cargar();
      });
    };
  }

  // ——— historial
  function vHistorial(v) {
    var tipos = [["todos", "Todo"], ["venta", "Ventas"], ["consigna", "Consigna"], ["entrada", "Entradas"], ["tomada", "Tomadas"], ["merma", "Merma"]];
    var gs = grupos(D.movimientos).filter(function (g) {
      if (filtroHist === "todos") return true;
      if (filtroHist === "consigna") return g.tipo === "consigna" || g.consigna;
      return g.tipo === filtroHist;
    });
    var nombres = { venta: "Venta", entrada: "Entrada", tomada: "Tomada", merma: "Merma", consigna: "Consigna", devolucion: "Regresó" };
    var h = '<div class="fila entre"><h2>Historial</h2><a class="btn chico claro" href="/api/movimientos.csv">Descargar Excel</a></div>' +
      '<div class="chips" style="margin-bottom:14px">' + tipos.map(function (t) {
        return '<button class="chip" data-f="' + t[0] + '" aria-pressed="' + (filtroHist === t[0]) + '">' + t[1] + "</button>";
      }).join("") + "</div>";
    h += gs.length ? gs.slice(0, 200).map(function (g) {
      var n = 0; g.items.forEach(function (m) { n += m.cantidad; });
      return '<div class="mov"><div class="cab"><span><span class="pill p-' + g.tipo + '">' + nombres[g.tipo] + (g.consigna && g.tipo !== "devolucion" ? " (consigna)" : "") + "</span> " + esc(fechaBonita(g.fecha)) + "</span><span>" + esc(nombrePersona(g.quien)) + "</span></div>" +
        (g.cliente ? '<div style="font-weight:600;margin-top:6px">' + esc(g.cliente) + "</div>" : "") +
        "<ul>" + g.items.map(function (m) { return "<li>" + m.cantidad + " × " + esc(nombreProd(m.producto_id)) + "</li>"; }).join("") + "</ul>" +
        (g.nota ? '<div style="font-size:13px;color:var(--suave);margin-bottom:8px">' + esc(g.nota) + "</div>" : "") +
        '<div class="pie"><span><strong>' + n + (n === 1 ? " bolsa" : " bolsas") + "</strong>" + (g.tipo === "venta" || g.tipo === "consigna" ? " · " + pesos(g.precio) + " c/u · <strong>" + pesos(n * g.precio) + "</strong>" : g.tipo === "entrada" && g.precio ? " · costo " + pesos(g.precio) : "") + "</span>" +
        '<span class="fila" style="gap:6px">' + (g.tipo === "venta" || g.tipo === "entrada" || g.tipo === "consigna" ? '<button class="btn chico claro" data-precio-g="' + esc(g.grupo) + '" data-actual="' + g.precio + '" data-t="' + g.tipo + '">' + (g.tipo === "entrada" ? "Cambiar costo" : "Cambiar precio") + "</button>" : "") +
        '<button class="btn chico peligro" data-borrar="' + esc(g.grupo) + '">Borrar</button></span></div></div>';
    }).join("") : '<p class="vacio">No hay movimientos.</p>';
    v.innerHTML = h;
    v.querySelectorAll("[data-f]").forEach(function (b) { b.onclick = function () { filtroHist = b.getAttribute("data-f"); pintar(); }; });
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
  function vAjustes(v) {
    var a = D.ajustes;
    var tel = String(a.whatsapp || "").replace(/^52/, "");
    var h = "<h2>Ajustes</h2>" +
      '<div class="caja"><h3>Precios de venta</h3><p class="vacio" style="margin-bottom:10px">Son los botones que salen al registrar una venta. Los reportes separan lo vendido en cada precio.</p><div id="lprecios">' +
      a.precios.map(filaPrecio).join("") + '</div><button class="enlace" id="addp">+ Agregar precio</button></div>' +
      '<div class="caja"><div class="rejilla2"><label>Costo por bolsa (para nuevas entradas)<input id="acosto" inputmode="decimal" value="' + esc(a.costo) + '"></label>' +
      '<label>Avisar cuando queden<input id="abajo" inputmode="numeric" value="' + esc(a.stockBajo) + '"></label></div>' +
      '<label style="margin-top:10px">WhatsApp de la página (10 dígitos)<input id="awa" inputmode="tel" value="' + esc(tel) + '"></label>' +
      '<p class="vacio" style="margin-top:6px">A este número llegan los pedidos de crunchitos.mx.</p></div>' +
      '<button class="btn" id="gaj" style="width:100%;margin-bottom:20px">Guardar ajustes</button><p class="error" id="aerr"></p>';
    h += '<div class="caja"><h3>Equipo con acceso</h3><table><tbody><tr><td>Sebas</td><td>' + esc(D.dueno) + "</td><td></td></tr>" +
      D.equipo.map(function (e) {
        return "<tr><td>" + esc(e.nombre || "—") + "</td><td>" + esc(e.email) + "</td><td class=num>" + (D.esDueno ? '<button class="btn chico peligro" data-quitar="' + esc(e.email) + '">Quitar</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table>" +
      (D.esDueno ? '<form id="feq" class="rejilla2" style="margin-top:12px"><label>Nombre<input id="enom" placeholder="Paola"></label><label>Correo<input id="eem" type="email" placeholder="correo@gmail.com"></label><button class="btn chico" style="grid-column:1/-1">Dar acceso</button></form>'
        : '<p class="vacio" style="margin-top:8px">Solo Sebas puede agregar o quitar personas.</p>') + "</div>";
    v.innerHTML = h;
    function filaPrecio(p) {
      return '<div class="fila" style="margin-bottom:8px;flex-wrap:nowrap"><input class="pn" value="' + esc(p.nombre) + '" placeholder="Nombre" aria-label="Nombre del precio"><input class="pv" inputmode="decimal" value="' + esc(p.valor) + '" style="width:90px" aria-label="Precio"><button class="btn chico peligro qp" type="button" aria-label="Quitar precio">×</button></div>';
    }
    function engancharQuitar() { v.querySelectorAll(".qp").forEach(function (b) { b.onclick = function () { b.parentNode.remove(); }; }); }
    engancharQuitar();
    document.getElementById("addp").onclick = function () {
      document.getElementById("lprecios").insertAdjacentHTML("beforeend", filaPrecio({ nombre: "", valor: "" })); engancharQuitar();
    };
    document.getElementById("gaj").onclick = function () {
      var precios = [].map.call(v.querySelectorAll("#lprecios .fila"), function (f) {
        return { nombre: f.querySelector(".pn").value, valor: parseFloat(f.querySelector(".pv").value) };
      }).filter(function (p) { return p.nombre.trim() && !isNaN(p.valor); }).sort(function (a, b) { return a.valor - b.valor; });
      api("PUT", "/ajustes", { precios: precios, costo: parseFloat(document.getElementById("acosto").value), stockBajo: parseInt(document.getElementById("abajo").value, 10), whatsapp: document.getElementById("awa").value }).then(function (r) {
        if (!r.ok) { document.getElementById("aerr").textContent = r.error || "No se pudo guardar."; return; }
        aviso("Ajustes guardados"); cargar();
      });
    };
    v.querySelectorAll("[data-quitar]").forEach(function (b) {
      b.onclick = function () {
        if (!b.classList.contains("seguro")) { b.classList.add("seguro"); b.textContent = "¿Seguro?"; return; }
        api("DELETE", "/equipo/" + encodeURIComponent(b.getAttribute("data-quitar"))).then(function (r) { aviso(r.ok ? "Acceso quitado" : r.error); cargar(); });
      };
    });
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
