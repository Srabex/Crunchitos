# Crunchitos — crunchitos.mx

Snacks deshidratados (chips de jícama, pepino, camote y plátano; 12 sabores, bolsa de 100 g).
Marca propia del equipo de Asesor Sebas; una fábrica socia produce y el equipo distribuye en Chihuahua.
Panel para Sebas, Paola (Pao, paolardzmq@gmail.com) y Víctor (victor.hernandez.lider@gmail.com).

## Redes
- Facebook: https://www.facebook.com/mxcrunchitos · Instagram: https://www.instagram.com/mxcrunchitos/ (correo mxcrunchitos@gmail.com). Ligadas en el pie de la página y en `sameAs`.

## Dominio
- **crunchitos.mx** (comprado en Cloudflare Registrar, 20 nov 2026). `www.crunchitos.mx` redirige al dominio sin www (src/worker.js).
- Los dominios se conectan solos al publicar (`routes` con `custom_domain` en wrangler.jsonc).

## Cómo está armado
- **Sin dependencias ni compilación**: un Worker de Cloudflare (`src/worker.js`) + archivos estáticos (`public/`).
- Deploy: Cloudflare Workers Builds desde GitHub `Srabex/Crunchitos`, rama `main`, comando `npx wrangler deploy`.
- Base de datos: **Cloudflare D1** `crunchitos` (binding `DB`). Las tablas se crean solas y se llenan la primera vez con el inventario real del 20 nov 2026 (100 bolsas, 6 vendidas a $40, 2 tomadas por Sebas).
- Letras locales en `public/fonts/` (Bubblegum Sans, Gochi Hand, Poppins recortada a español).

## Página pública (`public/index.html`)
- "Así llega tu bolsa": foto de grupo `public/img/fotos/surtido.webp` (montaje de las 12 bolsas (plátano con sal = bolsa de natural en espejo con su calca) reales sobre la mesa; las fotos viejas de la galería quedaron sin usar).
- Hero con logo y los 4 Crunchis, 12 sabores (foto de la bolsa en `public/img/bolsas/<id>.webp` para los de `CON_FOTO`; los demás muestran su etiqueta de `public/img/etiquetas/<id>.webp`; fotos editadas con IA poniendo la calca v2 sobre la bolsa real) con botón de WhatsApp por sabor, sección para negocios/eventos y cierre.
- El WhatsApp y los sabores agotados vienen de `/api/publico` (se cambia el número desde el panel → Ajustes). Si un sabor llega a 0, sale "Agotado por ahora" y el botón cambia a "Avísame cuando haya".
- Voz de marca: decir "snacks deshidratados" (nunca "botana") y resaltar "deshidratados". No decir "100% natural", "saludable", "sin conservadores" ni "no frito" (NOM-051 / falta confirmar con la fábrica).
- Imagen para compartir: `public/og.jpg` (fuente editable `diseno/og.html`, captura a 1200×630). Favicons e íconos en `public/`.

## Panel (`/admin/`)
- Sin contraseñas: código de 6 dígitos por correo (Resend). Entra el dueño (`DUENO` en src/worker.js = Sebas) y los correos de la tabla `equipo`, que Sebas agrega en Ajustes → Equipo.
- **Inicio**: vendido, ganancia (con costo promedio de las entradas), lo que queda, tomadas/merma; ventas por precio ($30/$40/$50…), por sabor, por persona y mejores clientes; filtro por periodo; aviso de sabores por acabarse.
- **Vender**: venta (botones de precio + campo libre de precio por bolsa y "total cobrado" que se calculan entre sí; cliente opcional), "me llevé / regalo" y merma. Avisa si no alcanza el inventario (se puede guardar de todos modos).
- **Inventario**: por sabor (llegó, vendidas, otras, quedan) y botón "Llegó mercancía" (entrada con costo por bolsa).
- **Historial**: movimientos agrupados, borrar (doble toque) y descarga CSV para Excel.
- **Consigna**: en Vender → "Consigna" se dejan bolsas a una tienda o persona con precio acordado (las tiendas que ya tienen consigna salen como botones para no escribir el nombre distinto; al tocarla se llena su WhatsApp del último recibo) (salen de bodega, no cuentan como venta). En Inventario → "En consigna" se ve cada tienda (bolsas por sabor, valor, días) y **Pasar a cobrar** registra cuántas se vendieron (venta con `consigna = 1`) y cuántas regresan (`devolucion`, vuelven a bodega).
- **Recibo de consigna (remisión)**: al guardar una consigna se abre "Recibo de consigna" con 3 formas de que la tienda confirme sin usuario: enviar la liga por WhatsApp (campo opcional "WhatsApp de la tienda"), que escaneen un QR, o "Que confirme aquí en mi cel" si no tienen datos. La liga es `/r/<grupo>` (página `public/r/index.html`, API pública `/api/remision/<grupo>` y `/confirmar`): ven sabores, bolsas, precio y condiciones, ponen su nombre, firman con el dedo (opcional) y tocan "Confirmo que recibí". El estado (⏳ falta / ✓ confirmó + firma) sale en Inventario → En consigna y en Historial (botón "Recibo"). Tabla `remisiones`. QR con `public/admin/qrcode.js` (Kazuhiko Arase, MIT).
- **Dónde encontrarnos**: Ajustes → "Dónde encontrarnos" agrega/quita puntos de venta (nombre, dirección, liga de Google Maps). Salen en la página en la sección verde `#donde` (vía `/api/publico`, caché 60 s); si no hay ninguno, la sección se oculta. Foto de fachada opcional: se sube desde el panel (el cel la reduce a 800 px JPEG y se guarda en `puntos.foto` como data URL, servida en `/api/punto-foto/<id>`); la de la tortillería es estática en `public/img/puntos/de-jesus.webp`. Tabla `puntos`; el primero (Tortillería De Jesús, Col. Álamos) entra solo con meta `puntos_v1`.
- **Gastos**: monto, categoría (etiquetas e impresión, envío de la fábrica, gasolina, empaque, publicidad, otro), concepto, quién lo pagó, fecha y nota. Descarga CSV.
- **Inicio** también muestra gastos del periodo, **ganancia real** (ganancia de las bolsas − gastos), gastos por categoría y quién ha puesto.
- **Historial**: "Cambiar precio" / "Cambiar costo" en ventas y entradas (para corregir el costo real por paquete).
- **Ajustes**: precios, costo, aviso de stock bajo, WhatsApp de la página, equipo.

## Datos (D1)
- 21 nov 2026: lo registrado como "plátano con sal" era plátano natural; se corrigió una sola vez (meta `fix_platano_sal_v1`).
- `productos` (12 sabores), `movimientos` (grupo, tipo entrada/venta/tomada/merma, producto, cantidad, precio, cliente, nota, quién, fecha), `gastos` (fecha, categoría, concepto, monto, pagó, nota, registró), `meta` (ajustes en JSON), `equipo`, `codigos`.
- Bodega = entradas + devoluciones − ventas − tomadas − merma − consigna (los movimientos con `consigna = 1` no tocan bodega). En tienda = consigna − ventas/devoluciones/merma con `consigna = 1` de esa tienda (campo `cliente`).

## Variables en Cloudflare (Settings → Variables and Secrets, tipo Secret)
- `RESEND_API_KEY`: la misma de Aura (dominio asesorsebas.com verificado en Resend).
- `SESSION_SECRET`: texto aleatorio largo.
- `EMAIL_FROM` (opcional): por defecto `Crunchitos <crunchitos@asesorsebas.com>`.

## Probar en local
- Sin wrangler: `node` 22 con una D1 simulada sobre `node:sqlite` (ver historial del chat). `MODO_PRUEBA=1` devuelve el código en la respuesta en lugar de mandarlo por correo; **nunca** ponerlo en Cloudflare.

## Reglas
- Explicar a Sebas en español, claro y sin tecnicismos.
- Cambios grandes en rama aparte; a `main` solo lo probado.
- Commits en español.
- Toda decisión se justifica por vender más o ahorrar tiempo de operación.
- Estándar de sitios (OG, favicon, /pago): doc `claude/estandar-sitios.md` del proyecto Asesor Sebas. Marca: `claude/marca-crunchitos.md`.
