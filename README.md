# La Espartana Escrutinios — prueba iOS

Rama independiente para preparar la primera compilación y prueba nativa en iPhone. No fusionar esta rama tal cual sobre la web publicada: `main` mantiene GitHub Pages.

## Configuración

- Entrada: `index.next.js` / `App.next.js`.
- Proyecto Expo: `@mouai300s-team/la-espartana-escrutinios`.
- Perfil EAS: `testflight`, distribución `store`.
- Módulos nativos propios para protección local y lectura de documentos.
- SQLCipher activado; sin actualizaciones OTA.

El paquete contiene código y recursos de la app, no combinaciones TXT, fotos, PDF ni copias de usuarios. El catálogo de partidos es una copia histórica pública; no hay LiveScore conectado ni recepción directa desde WhatsApp.

## Estado de validación

185 pruebas locales correctas en el proyecto de desarrollo. Empaquetado JavaScript comprobado. Swift, SQLCipher, biometría, lectura y exportación aún deben compilarse y probarse en un iPhone. La presencia de esta rama no significa que exista una compilación ni una versión enviada a TestFlight, ni constituye una garantía de seguridad.

Las credenciales de Apple, la primera compilación, la revisión de cifrado para exportación y el envío a TestFlight están pendientes. No se incluyen credenciales en el repositorio.
