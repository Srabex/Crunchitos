# Crunchitos — crunchitos.mx

Snacks deshidratados (chips de jícama, pepino, camote y plátano; 12 sabores, bolsa única).
- **Sin gramaje** en la página ni en ningún lado (23 nov 2026): el peso varía entre 85, 90 y 100 g según el sabor, así que se habla de "bolsa" o "bolsa única" sin gramos.
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
- El WhatsApp y los sabores agotados vienen de `/api/publico` (se cambia el número desde el panel → Ajustes). Agotados: solo si en Ajustes está prendido "Marcar en la página los sabores agotados" (`mostrarAgotados`, apagado por defecto desde 25 nov 2026: todo sale disponible y Sebas confirma por WhatsApp); prendido, un sabor en 0 sale "Agotado por ahora" con botón "Avísame cuando haya".
- Voz de marca: decir "snacks deshidratados" (nunca "botana") y resaltar "deshidratados". No decir "100% natural", "saludable", "sin conservadores" ni "no frito" (NOM-051 / falta confirmar con la fábrica).
- Imagen para compartir: `public/og.jpg` (fuente editable `diseno/og.html`, captura a 1200×630). Favicons e íconos en `public/`.
- **Precio y pedido (23 nov 2026):** **la página no muestra precios** (cada distribuidor pone el suyo; el sugerido $55 solo va en el PDF y el kit). Pedido a domicilio solo si no hay tienda cerca: botones +/− por sabor y barra fija; "Pedir precio" se activa al llegar al mínimo (`minimo` en Ajustes, 10 bolsas) y manda la lista por WhatsApp pidiendo el precio. "Dónde encontrar" va justo después del hero. Sección `#vende` "¿Quieres vender Crunchitos?" con beneficios, sin precios de emprendedor (se mandan por WhatsApp). La consigna no se publica.
- Migración `precios_v2`: si los precios seguían en 30/40/50, pasan a Costo / socio 30 · Paquete Mayorista 38.46 · Paquete Emprendedor 40 · Paquete Inicial 41.67 · Consigna 45 · Público / domicilio 55 (iguales al PDF de emprendedores).
- Carteles QR media carta (tienditas y a domicilio): fuente editable `diseno/cartel.html?tipo=tienda|domicilio`, captura 600×927 a escala 2.75 (≈300 dpi). Sin gramaje (23 nov 2026).

## Panel (`/admin/`)
- Sin contraseñas: código de 6 dígitos por correo (Resend). Entra el dueño (`DUENO` en src/worker.js = Sebas) y los correos de la tabla `equipo`, que Sebas agrega en Ajustes → Equipo.
- **Inicio**: vendido, ganancia (con costo promedio de las entradas), lo que queda, tomadas/merma; ventas por precio ($30/$40/$50…), por sabor, por persona y mejores clientes; filtro por periodo; aviso de sabores por acabarse.
- **Vender**: venta (botones de precio + campo libre de precio por bolsa y "total cobrado" que se calculan entre sí; cliente opcional), "me llevé / regalo" y merma. Avisa si no alcanza el inventario (se puede guardar de todos modos).
- **Inventario**: por sabor (llegó, vendidas, otras, quedan) y botón "Llegó mercancía" (entrada con costo por bolsa). Botón **"Compartir como imagen"** (24 nov 2026): arma en el cel un PNG con la marca (fecha y hora, quedan/en tiendas/vendidas, tabla por sabor con bajos en rojo, tiendas a consigna) y abre el menú de compartir (WhatsApp); si el navegador no deja, lo descarga. Función `imagenInventario` en admin.js (canvas, sin servidor).
- **Apartados** (25 nov 2026): en Vender → "Apartar" (tipo `apartado`, pide "¿Para quién?" y precio acordado). Resta de disponibles como cualquier salida pero no es venta; suma a "Por cobrar" en Inicio. En Inventario → Apartados: "Entregar como venta" / "Entregar a consigna" (POST `/api/movimientos/<grupo>/entregar`, cambia el tipo del mismo grupo y la fecha; a consigna crea su recibo) o "Cancelar" (borra el grupo).
- **Historial**: movimientos agrupados, borrar (doble toque) y descarga CSV para Excel.
- **Consigna**: en Vender → "Consigna" se dejan bolsas a una tienda o persona con precio acordado (las tiendas que ya tienen consigna salen como botones para no escribir el nombre distinto; al tocarla se llena su WhatsApp del último recibo) (salen de bodega, no cuentan como venta). En Inventario → "En consigna" se ve cada tienda (bolsas por sabor, valor, días) y **Pasar a cobrar** registra cuántas se vendieron (venta con `consigna = 1`) y cuántas regresan (`devolucion`, vuelven a bodega).
- **Recibo de consigna (remisión)**: al guardar una consigna se abre "Recibo de consigna" con 3 formas de que la tienda confirme sin usuario: enviar la liga por WhatsApp (campo opcional "WhatsApp de la tienda"), que escaneen un QR, o "Que confirme aquí en mi cel" si no tienen datos. La liga es `/r/<grupo>` (página `public/r/index.html`, API pública `/api/remision/<grupo>` y `/confirmar`): ven sabores, bolsas, precio y condiciones, ponen su nombre, firman con el dedo (opcional) y tocan "Confirmo que recibí". El estado (⏳ falta / ✓ confirmó + firma) sale en Inventario → En consigna y en Historial (botón "Recibo"). Tabla `remisiones`. QR con `public/admin/qrcode.js` (Kazuhiko Arase, MIT).
- **Dónde encontrarnos**: Ajustes → "Dónde encontrarnos" agrega/quita puntos de venta (nombre, dirección, liga de Google Maps). Salen en la página en la sección verde `#donde` (vía `/api/publico`, caché 60 s); si no hay ninguno, la sección se oculta. Foto de fachada opcional: se sube desde el panel (el cel la reduce a 800 px JPEG y se guarda en `puntos.foto` como data URL, servida en `/api/punto-foto/<id>`); la de la tortillería es estática en `public/img/puntos/de-jesus.webp`. Tabla `puntos`; el primero (Tortillería De Jesús, Col. Álamos) entra solo con meta `puntos_v1`.
- **Gastos**: monto, categoría (etiquetas e impresión, envío de la fábrica, gasolina, empaque, publicidad, otro), concepto, quién lo pagó, fecha y nota. Descarga CSV.
- **Inicio** arriba de los periodos: **En caja (en teoría)** = todo lo cobrado − gastos pagados "La caja"; **Por cobrar** = consigna en tiendas a su precio; y "Se le debe" a quien pagó gastos de su bolsa (25 nov 2026; en Gastos el "¿Quién lo pagó?" trae "La caja" por defecto, `pago = 'caja'`; migración `gastos_caja_v1` pasó los gastos viejos a caja).
- **Inicio** también muestra gastos del periodo, **ganancia real** (ganancia de las bolsas − gastos), gastos por categoría y quién ha puesto.
- **Historial**: "Cambiar precio" / "Cambiar costo" en ventas y entradas (para corregir el costo real por paquete).
- **Instalable como app** (25 nov 2026): `public/admin/manifest.webmanifest` (scope `/admin/`) + `public/admin/sw.js` (service worker mínimo, sin caché, solo para que Chrome Android permita "Instalar"). Igual para `/kit/pedidos/`.
- **Ajustes**: precios, costo, aviso de stock bajo, pedido mínimo a domicilio, WhatsApp de la página, equipo.
- **Archivos** (pestaña): lista `DOCS` en admin.js. Lo interno vive en `public/admin/docs/` y el Worker solo lo sirve con sesión del panel (`/admin/docs/*` → 401 sin sesión): PDF Emprende con Crunchitos, tablas (paquetes, con consigna, interna), manual de identidad v3 en PDF, campaña de redes y las etiquetas para imprenta en **CMYK** (`docs/etiquetas/`, 25 nov 2026; FOGRA39, un solo fondo por base: jícama #CFA481, pepino #91B25B, camote #C88A5F, plátano #F2C54C; acabado brillante). Por versión (sin teléfono, tel Sebas, tel Pao): hoja A4 PDF a 600 ppp, ZIP con las 12 en PDF a 1200 ppp + línea de corte, y TIFF en dos ZIP (01–06 y 07–12) para no pasar los 25 MB por archivo de Workers. Se generaron rasterizando los PDF vectoriales originales (fondos cambiados con pikepdf) y convirtiendo con ImageCms (perfil FOGRA39 de texlive). Las imágenes de la página (`public/img/etiquetas`, fotos de bolsas) siguen con los fondos viejos. Fuentes de las piezas en `diseno/`.
- **Redes de Crunchitos (campaña emprendedores, 23 nov 2026):** 4 posts 1080×1440 y 4 historias 1080×1920 sin precios (`diseno/redes-emprendedores.html?v=1..4&f=post|historia`), en Archivos (`public/admin/docs/redes/`, con ZIP que incluye los textos).
- **Kit para distribuidores** `/kit/` (público pero noindex y fuera de robots): estados 1080×1920 sin precio (`diseno/estado.html?tipo=ya|antojo|sabores`), catálogo de los 12 sabores en PDF/JPG sin precio (`diseno/catalogo.html`, 25 nov 2026), textos para copiar, fotos de los 12 sabores (ZIP), cartel QR para tienditas, logos y Crunchis, preguntas frecuentes (`#preguntas`, acordeón), reglas de marca y botón para resurtir. Liga discreta "Distribuidores" en el pie de la página principal y botones "Página" y "Kit" junto a "Salir" en el panel (abren aparte). Arriba, botón grande "Arma tu pedido" → `/kit/pedidos/` (que tiene "‹ Mi kit" para regresar). Es la liga que se manda a los emprendedores.
- **Anotador de pedidos** `/kit/pedidos/` (24 nov 2026, para vendedores como la hermana de Sebas): nombre y precio propio (opcional), pedido por cliente con +/− por sabor, pagó/entregado, nota; editar y borrar; total por sabor, por entregar y por cobrar; botón "Mandar por WhatsApp" al 614 235 5166 con todo ordenado. Se guarda en el celular (localStorage `crunchitos-pedidos-v1`), sin servidor.

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
