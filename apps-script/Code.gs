/**
 * Catálogo de equipamiento interactivo Copec
 * Wrapper de Google Apps Script (Web App).
 *
 * Apps Script NO puede alojar los modelos GLB (39–43 MB) ni las ~900 fotos 360°.
 * Por eso el sitio estático real se publica en GitHub Pages (u otro hosting) y
 * este Web App lo muestra a pantalla completa a través de la URL de Apps Script.
 *
 * PASO ÚNICO DE CONFIGURACIÓN:
 *   Reemplaza SITE_URL por la URL pública donde subiste el catálogo.
 *   Ej. GitHub Pages: https://TU-USUARIO.github.io/catalogo-fusion/
 */
var SITE_URL = 'https://cristobalpontigo.github.io/catalogo-fusion/';

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.siteUrl = SITE_URL;
  template.product = (e && e.parameter && e.parameter.product) ? e.parameter.product : '';

  return template
    .evaluate()
    .setTitle('Catálogo de equipamiento interactivo Copec')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
