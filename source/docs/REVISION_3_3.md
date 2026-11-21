# Revisión 3.3 de Calma Vial

Fecha: 21 de noviembre de 2026.

## Interfaz y navegación

Se retiraron el texto Web + app móvil del encabezado de acceso y la nota sobre alcance y motocicletas junto al vehículo. Las opciones siguen siendo Particular, Transporte público y Transporte comercial.

Los cuatro indicadores del panel general son enlaces: Comunidad abre Usuarios y evolución; Evaluaciones abre Evaluaciones de la comunidad; Atención pendiente abre las conversaciones no resueltas ni archivadas; Participación abre el seguimiento de usuarios con y sin evaluaciones. Los tres accesos inferiores abren usuarios, bandeja y avisos. La delegación de enlaces internos responde también al pulsar sus textos o iconos y permite volver a abrir la vista actual. Se mantienen los enlaces nativos y el acceso por teclado.

El panel general presenta una síntesis operativa. Usuarios y evolución contiene el directorio y las acciones de cuenta, sin repetir los gráficos del panel. Evaluaciones permite buscar por persona/correo/vehículo, filtrar por nivel y consultar respuestas o evolución. Participación muestra usuarios con y sin evaluaciones y su proporción; excluye administradores y bajas. Todos los destinos administrativos comprueban el rol. La navegación móvil se organiza en dos columnas y las tablas pueden desplazarse dentro de su contenedor.

## Eliminación de usuarios

Eliminar usuario es una baja recuperable propia de Calma Vial. Se distingue de Suspender acceso: retira a la persona del directorio y de los indicadores de población vigente, bloquea su acceso y la conserva en Usuarios eliminados. La confirmación solicita un motivo de 10 a 300 caracteres y escribir ELIMINAR. Restaurar exige motivo y RESTAURAR. Si existía una suspensión previa, restaurar la baja la conserva; reactivar el acceso es una acción separada.

La identidad de Supabase Auth y los registros no se destruyen. Esta versión no implementa un borrado irreversible de identidades compartidas con Android y otras aplicaciones. La interfaz indica expresamente que la baja es recuperable. Ninguna persona real se elimina para probar la función.

La nueva tabla privada usuarios_baja tiene RLS y ningún acceso directo de anon/authenticated. Las funciones públicas invocan funciones privadas que comprueban el rol administrativo real en perfiles, bloquean administradores y autobajas, validan confirmación y motivo, bloquean la fila durante la operación y guardan auditoría. cuenta_activa comprueba bajas y suspensiones, de modo que las políticas existentes bloquean también una sesión anterior. Las funciones fijan search_path vacío y no conceden ejecución a anon/PUBLIC.

## Verificación

- Suite local: 98 pruebas aprobadas, cero fallos. Incluye clics en los cuatro indicadores y los tres accesos inferiores, destinos distintos, apertura de respuestas, filtros, estados vacíos, baja/restauración con motivo y confirmación, errores recuperables y restricciones de roles.
- PostgreSQL real: primero se probó la migración con rollback; después se aplicó y se repitieron database/verificacion-3-3.sql y database/verificacion-3-2.sql. Resultado REGRESION_3_2_Y_BAJAS_3_3_OK, cero cuentas temporales y RLS de bajas activado.
- Las pruebas SQL comprobaron denegación a usuario/anónimo, autobaja denegada, confirmación incorrecta, baja y restauración, bloqueo de lecturas/escrituras con JWT anterior, conservación de evaluaciones, mantenimiento de una suspensión previa y auditoría.
- HTTP real: Auth responde 200; tablas y RPC protegidas rechazan acceso anónimo, incluidas bajas y diagnóstico; CORS de GitHub Pages correcto.
- Chrome con sesión administrativa existente: se comprobaron los seis destinos principales de tarjetas, el filtro por nivel, búsqueda sin coincidencias y apertura de respuestas. Se abrió y canceló la confirmación de baja sin modificar usuarios reales.

La evidencia final de publicación y paquete se entrega junto con el resultado. Las pruebas de acceso con contraseñas y fixtures son simuladas. No se afirma una prueba física de Android ni entrega de correos reales de registro o recuperación.

## Código y colaboración

La fuente vigente está en source/ del repositorio público. Sus carpetas separan html, css, js, assets, vendor, tests, scripts y database. Los scripts de backend están versionados y requieren aplicación autorizada aparte; GitHub Actions no recibe credenciales de Supabase. Las propuestas se prueban y los cambios integrados en main se publican después de superar las comprobaciones.

Los compañeros pueden hacer Fork, commits en su copia y Pull request con una cuenta GitHub. La escritura directa en la rama principal requiere invitar colaboradores identificados: GitHub no ofrece edición anónima del repositorio por enlace.
