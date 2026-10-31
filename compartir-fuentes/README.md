# Escrutinio compartido — primera prueba

Página independiente de La Espartana: `compartir.html`. No modifica el historial ni el almacenamiento de la aplicación principal.

## Uso

1. Abrir la página desde el enlace de WhatsApp, Safari u otro navegador.
2. Elegir una jornada disponible: sus quince partidos se rellenan desde la copia pública de Lotería 300. Después adjuntar el TXT. El nombre se toma del archivo y el precio inicial es 0,75 euros.
3. Pulsar «Enviar por WhatsApp» al principio de la combinación y elegir WhatsApp en el menú del móvil. Si el menú no está disponible, se copia el enlace o se muestra para copiarlo manualmente.
4. El destinatario abre la combinación, sin adjuntar archivos ni instalar nada, y puede editar su propia consulta.

«Opciones y partidos de la jornada» permite cambiar nombre, temporada y precio, y pegar los quince encuentros si la jornada no está disponible en el catálogo. Al compartir se validan e incluyen los nombres sin un paso adicional de confirmación. El botón «Ver los partidos en la consulta» solo sirve para previsualizarlos antes. No se crean enlaces nuevos sin los quince partidos. Los resultados y los premios unitarios siguen editándose manualmente.

Los resultados y premios son manuales. Los partidos proceden de `partidos-loteria300.json`, una copia del boleto público y de las otras jornadas que permite elegir Lotería 300. La selección valida temporada, fecha, jornada y los quince nombres. No se adivinan identificadores ni se asignan los equipos de una jornada a otra. Los enlaces recibidos conservan sus equipos y no se sustituyen por la jornada actual.

La descarga del catálogo desde el navegador es automática; su actualización periódica en el repositorio está pendiente de autorización y NO está instalada. El botón «Volver a cargar jornadas» vuelve a leer esa copia, no obliga a Lotería 300 a generar información nueva. Se muestra la fecha de la copia. Cada enlace es una instantánea: los cambios posteriores requieren generar otro enlace. No hay sincronización entre destinatarios. Al cambiar de temporada o jornada se borran de la consulta los nombres de equipos, resultados y premios anteriores, para no atribuirlos a otra jornada. Los enlaces antiguos siguen abriéndose y escrutándose; los antiguos sin equipos requieren completar los quince antes de crear un nuevo enlace.

Cada enlace contiene exactamente un TXT. Límites de esta prueba: 1.000 apuestas, archivo de 64 KiB y URL de 10.000 caracteres. Si no cabe, se rechaza; no se omiten apuestas. Hay un ejemplo ficticio para probar sin documentos propios. No incluye captura PDF, OCR ni Elige 8, porque un TXT de columnas no proporciona sus ocho selecciones independientes.

## Privacidad y límites

Las columnas se empaquetan sin pérdidas en el fragmento `#q1...` de la URL. Esa parte no se envía al alojamiento en la petición HTTP de la página; se procesa en el navegador ([MDN](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)). No se publican apuestas dentro del repositorio ni se utilizan analítica o bibliotecas de terceros en esta página. La CSP permite conexiones de datos únicamente al mismo origen para leer el catálogo público. La página no lee ni escribe localStorage/IndexedDB. El catálogo no contiene apuestas, documentos, cookies, tokens ni datos de cuentas.

El lector `sync-loteria300.cjs` se ejecuta manualmente, obtiene una sesión anónima nueva de la página pública y utiliza únicamente las jornadas ofrecidas por su selector mediante la misma consulta de lectura de la web. No inicia sesión ni valida apuestas. Los datos de esa sesión no se escriben en el catálogo ni en el registro. El lector no escribe Git ni realiza publicaciones remotas.

El enlace no está cifrado ni protegido por contraseña. Quien lo reciba podrá leerlo y reenviarlo. Puede quedar en el historial del navegador, portapapeles o mensajes, y no hay revocación ni caducidad. No acredita autenticidad, propiedad de las apuestas ni premios oficiales. El propio alojamiento sigue compartiendo origen con la aplicación principal; esto no resuelve toda la auditoría de seguridad pendiente.

Compartir utiliza el menú nativo cuando el navegador lo permite; los destinos dependen del dispositivo ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)). WhatsApp y Safari en un iPhone real deben comprobarse en la prueba del usuario; no se ha enviado ningún mensaje real desde el desarrollo.

## Construcción y pruebas sin dependencias adicionales

Requiere Node.js v24.22.1. Desde el repositorio publicado, si las fuentes están en `compartir-fuentes`:

```text
node --test --test-isolation=none compartir-fuentes/tests/share.test.cjs
node --test --test-isolation=none compartir-fuentes/tests/fixtures.test.cjs
node compartir-fuentes/sync-loteria300.cjs partidos-loteria300.json
node compartir-fuentes/build.cjs
```

La salida se crea en `dist-compartir`. Las cuatro rutas de interfaz constan en su `archivos-publicacion.json`. Debe disponer además de `logo.png`, ya existente en la aplicación publicada, y del catálogo `partidos-loteria300.json`. Los nombres de JS/CSS incluyen una huella de su contenido. La construcción no requiere npm ni incorpora Expo, PDF.js o Tesseract.

La suite contiene 23 pruebas automáticas: 14 de combinación/enlace y nueve del lector, catálogo, temporada, fechas y fallos de origen. También se comprobó localmente que las 428 apuestas del TXT de referencia se conservan exactamente en un enlace sin equipos, sin publicar esas apuestas. Añadir nombres aumenta la longitud y se sigue comprobando el límite del enlace.
