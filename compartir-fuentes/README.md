# Escrutinio compartido — primera prueba

Página independiente de La Espartana: `compartir.html`. No modifica el historial ni el almacenamiento de la aplicación principal.

## Uso

1. Abrir la página en Safari o en otro navegador.
2. Adjuntar un TXT; revisar nombre, temporada, jornada y precio por apuesta.
3. Introducir los resultados y, cuando proceda, los premios unitarios.
4. Pulsar Compartir enlace y elegir WhatsApp, o Copiar enlace y pegarlo en el chat.
5. El destinatario abre la combinación y puede editar su propia consulta sin instalar nada.

Los resultados y premios son manuales. No se han conectado fuentes de resultados en directo. Cada enlace es una instantánea: los cambios posteriores requieren generar otro enlace. No hay sincronización entre destinatarios.

Cada enlace contiene exactamente un TXT. Límites de esta prueba: 1.000 apuestas, archivo de 64 KiB y URL de 10.000 caracteres. Si no cabe, se rechaza; no se omiten apuestas. Hay un ejemplo ficticio para probar sin documentos propios. No incluye captura PDF, OCR ni Elige 8, porque un TXT de columnas no proporciona sus ocho selecciones independientes.

## Privacidad y límites

Las columnas se empaquetan sin pérdidas en el fragmento `#q1...` de la URL. Esa parte no se envía al alojamiento en la petición HTTP de la página; se procesa en el navegador ([MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)). No se publican apuestas dentro del repositorio ni se utilizan analítica o bibliotecas de terceros en esta página. La CSP bloquea las conexiones de datos desde sus scripts. La página no lee ni escribe localStorage/IndexedDB.

El enlace no está cifrado ni protegido por contraseña. Quien lo reciba podrá leerlo y reenviarlo. Puede quedar en el historial del navegador, portapapeles o mensajes, y no hay revocación ni caducidad. No acredita autenticidad, propiedad de las apuestas ni premios oficiales. El propio alojamiento sigue compartiendo origen con la aplicación principal; esto no resuelve toda la auditoría de seguridad pendiente.

Compartir utiliza el menú nativo cuando el navegador lo permite; los destinos dependen del dispositivo ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)). WhatsApp y Safari en un iPhone real deben comprobarse en la prueba del usuario; no se ha enviado ningún mensaje real desde el desarrollo.

## Construcción y pruebas sin dependencias adicionales

Requiere Node.js v24.22.1. Desde el repositorio publicado, si las fuentes están en `compartir-fuentes`:

```text
node --test --test-isolation=none compartir-fuentes/tests/share.test.cjs
node compartir-fuentes/build.cjs
```

La salida se crea en `dist-compartir`. Las cuatro rutas de publicación constan en su `archivos-publicacion.json`. Debe disponer además de `logo.png`, ya existente en la aplicación publicada. Los nombres de JS/CSS incluyen una huella de su contenido. La construcción no requiere npm ni incorpora Expo, PDF.js o Tesseract.

Se comprobaron las diez pruebas automáticas y el flujo de ejemplo en el navegador: generar/copiar enlace, abrirlo tras recarga completa y recalcular al cambiar el Pleno. También se comprobó localmente que las 428 apuestas del TXT de referencia se conservan exactamente en un enlace de 3.337 caracteres, sin publicar esas apuestas.
