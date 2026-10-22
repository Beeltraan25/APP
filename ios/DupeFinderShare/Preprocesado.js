// Safari ejecuta esto en la página antes de abrir la extensión.
// Solo envía lo que la app necesita (cabecera y datos de producto), no la página entera.
var Preprocesado = function () {};

Preprocesado.prototype = {
  run: function (argumentos) {
    var partes = [document.head ? document.head.outerHTML : ""];
    var datos = document.querySelectorAll('body script[type="application/ld+json"], body meta[property], body meta[itemprop]');
    for (var i = 0; i < datos.length; i++) {
      partes.push(datos[i].outerHTML);
    }
    argumentos.completionFunction({
      url: document.URL,
      html: "<html>" + partes.join("\n") + "</html>"
    });
  }
};

var ExtensionPreprocessingJS = new Preprocesado();
