// Ciudad del distribuidor: decide a qué WhatsApp llegan sus pedidos. Pinta botones en cada .elige-ciudad
// y llama window.alCambiarCiudad(whatsapp, nombre). Guarda la elección en el cel.
(function () {
  var K = "crunchitos-ciudad-pub", sel = "";
  try { sel = localStorage.getItem(K) || ""; } catch (e) {}
  fetch("/api/publico").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var cs = (d && d.ciudades) || [];
    if (!cs.length) return;
    if (!cs.some(function (c) { return c.id === sel; })) sel = cs[0].id;
    function pinta() {
      var c = cs.find(function (x) { return x.id === sel; }) || cs[0];
      document.querySelectorAll(".elige-ciudad").forEach(function (el) {
        el.hidden = cs.length < 2;
        el.innerHTML = '<span>Tu ciudad:</span>' + cs.map(function (x) {
          return '<button type="button" data-cid="' + x.id + '" aria-pressed="' + (x.id === sel) + '">' + x.nombre.replace(/[<>&"]/g, "") + "</button>";
        }).join("");
      });
      document.querySelectorAll("[data-wa-ciudad]").forEach(function (a) { a.href = "https://wa.me/" + c.whatsapp + "?text=" + encodeURIComponent(a.getAttribute("data-wa-ciudad")); });
      if (window.alCambiarCiudad) window.alCambiarCiudad(c.whatsapp, c.nombre);
    }
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cid]"); if (!b) return;
      sel = b.getAttribute("data-cid"); try { localStorage.setItem(K, sel); } catch (er) {}
      pinta();
    });
    pinta();
  }).catch(function () {});
})();
