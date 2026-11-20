# Crunchitos — crunchitos.mx

Snacks de frutas y verduras (chips de jícama, pepino, camote y plátano; 12 sabores, bolsa de 100 g).
Marca propia del equipo de Asesor Sebas; una fábrica socia produce y el equipo distribuye en Chihuahua.
Panel para Sebas, Paola (Pao) y Víctor.

## Dominio
- **crunchitos.mx** (comprado en Cloudflare Registrar, 20 nov 2026). `www.crunchitos.mx` redirige al dominio sin www (src/worker.js).
- Los dominios se conectan solos al publicar (`routes` con `custom_domain` en wrangler.jsonc).

## Cómo está armado
- **Sin dependencias ni compilación**: un Worker de Cloudflare (`src/worker.js`) + archivos estáticos (`public/`).
- Deploy: Cloudflare Workers Builds desde GitHub `Srabex/Crunchitos`, rama `main`, comando `npx wrangler deploy`.
- Base de datos: **Cloudflare D1** `crunchitos` (binding `DB`). Las tablas se crean solas y se llenan la primera vez con el inventario real del 20 nov 2026 (100 bolsas, 6 vendidas a $40, 2 tomadas por Sebas).
- Letras locales en `public/fonts/` (Bubblegum Sans, Gochi Hand, Poppins recortada a español).

## Página pública (`public/index.html`)
- Hero con logo y los 4 Crunchis, 12 sabores (etiquetas en `public/img/etiquetas/<id>.webp`) con botón de WhatsApp por sabor, sección para negocios/eventos y cierre.
- El WhatsApp y los sabores agotados vienen de `/api/publico` (se cambia el número desde el panel → Ajustes). Si un sabor llega a 0, sale "Agotado por ahora" y el botón cambia a "Avísame cuando haya".
- Voz de marca: no decir "100% natural", "saludable", "sin conservadores" ni "no frito" (NOM-051 / falta confirmar con la fábrica).
- Imagen para compartir: `public/og.jpg` (fuente editable `diseno/og.html`, captura a 1200×630). Favicons e íconos en `public/`.

## Panel (`/admin/`)
- Sin contraseñas: código de 6 dígitos por correo (Resend). Entra el dueño (`DUENO` en src/worker.js = Sebas) y los correos de la tabla `equipo`, que Sebas agrega en Ajustes → Equipo.
- **Inicio**: vendido, ganancia (con costo promedio de las entradas), lo que queda, tomadas/merma; ventas por precio ($30/$40/$50…), por sabor, por persona y mejores clientes; filtro por periodo; aviso de sabores por acabarse.
- **Vender**: venta (precio por bolsa con botones + "otro", cliente opcional), "me llevé / regalo" y merma. Avisa si no alcanza el inventario (se puede guardar de todos modos).
- **Inventario**: por sabor (llegó, vendidas, otras, quedan) y botón "Llegó mercancía" (entrada con costo por bolsa).
- **Historial**: movimientos agrupados, borrar (doble toque) y descarga CSV para Excel.
- **Gastos**: monto, categoría (etiquetas e impresión, envío de la fábrica, gasolina, empaque, publicidad, otro), concepto, quién lo pagó, fecha y nota. Descarga CSV.
- **Inicio** también muestra gastos del periodo, **ganancia real** (ganancia de las bolsas − gastos), gastos por categoría y quién ha puesto.
- **Historial**: "Cambiar precio" / "Cambiar costo" en ventas y entradas (para corregir el costo real por paquete).
- **Ajustes**: precios, costo, aviso de stock bajo, WhatsApp de la página, equipo.

## Datos (D1)
- `productos` (12 sabores), `movimientos` (grupo, tipo entrada/venta/tomada/merma, producto, cantidad, precio, cliente, nota, quién, fecha), `gastos` (fecha, categoría, concepto, monto, pagó, nota, registró), `meta` (ajustes en JSON), `equipo`, `codigos`.
- Inventario = entradas − ventas − tomadas − merma.

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
