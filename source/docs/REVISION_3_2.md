# Revisión 3.2 de Calma Vial

Fecha: 21 de noviembre de 2026.

## Funciones administrativas

El diagnóstico existente sí consulta PostgreSQL. Se convierte en una sección desplegable de mantenimiento, cerrada inicialmente, con explicación de uso, carga, errores y resultados fechados. Comprueba siete tablas seleccionadas con RLS y un resumen agregado de hashes bcrypt. Una respuesta incompleta se rechaza y una nueva consulta borra el resultado previo para evitar confundirlo con una respuesta actual. No certifica toda la seguridad del sistema.

La acción antes denominada Eliminar usuario se presenta como Suspender acceso y Reactivar acceso. La confirmación exige un motivo y explica que se conservan identidad e historial. Las acciones y el estado se separan visualmente en la tabla. Se reutiliza la autorización y auditoría PostgreSQL existentes, que impiden suspender administradores o a uno mismo y bloquean a cuentas suspendidas incluso con JWT anterior. No se incorpora borrado permanente de identidades de Supabase compartidas con otras aplicaciones.

## Alcance de vehículos

Se revisó el documento Word suministrado por el usuario, titulado Aplicación web para la evaluación de factores y niveles de ira mediante la Driving Anger Scale en conductores de la avenida Ballivián entre las calles 8 y 21 de Calacoto. Su sección 1.5.4 contempla vehículos particulares, transporte público y comercial; sus criterios de inclusión no excluyen expresamente motociclistas. El documento no aporta una adaptación o evidencia específica para interpretar los ítems desde una motocicleta.

La decisión de esta revisión es acotar las categorías de nuevas evaluaciones web a las tres descritas, retirando Motocicleta, Otro y duplicados. Es una decisión de alcance del prototipo para su defensa, no una afirmación de invalidez universal del DAS en motociclistas. Las 14 preguntas, escala, factores y cálculo no cambian. Los registros anteriores conservan su vehículo y textos. La función versionada web valida el alcance también en PostgreSQL; la función original del APK permanece compatible. Los reintentos de solicitudes ya guardadas se conservan.

La memoria académica debería explicitar esta delimitación si se pretende excluir motociclistas del reclutamiento: quitar una opción de interfaz no sustituye el protocolo metodológico. Se mantiene la distinción entre categorías orientativas del prototipo y diagnóstico clínico.

## Diseño

Paleta turquesa y grafito inspirada en las referencias de color del usuario. Principal #007F79, oscuro #005F5C, acento #19C7B8, texto #172E32 y superficies claras. Se conserva el automóvil existente y la marca Calma Vial; no se incorporan logotipos ni fotografías de Mercedes o Petronas. Los fondos de acceso usan degradados, los botones principales son redondeados con brillo discreto, y la tipografía Roboto variable mantiene jerarquías y legibilidad. El logotipo y los colores del informe PDF siguen la paleta. Las animaciones existentes respetan movimiento reducido.

## Colaboración

El repositorio público incluye código editable en source/, guía CONTRIBUTING.md, plantilla de pull request y flujo de pruebas y publicación en GitHub Actions. Cualquiera puede hacer commits en su fork y proponer cambios por pull request con una cuenta GitHub. La escritura directa en el repositorio principal requiere colaboradores identificados; no existe un permiso de edición anónima por enlace. No se otorga acceso de Supabase a quienes visitan el repositorio.

## Evidencia

- 93 pruebas locales aprobadas, 0 fallidas; formato Prettier correcto y build 3.2.0.
- Instalación desde cero: se detectó una dependencia transitiva no disponible en la versión de pruebas anterior. Se fijó linkedom 0.18.12, se regeneró package-lock.json y npm ci --ignore-scripts instaló correctamente 39 paquetes. La copia colaborativa volvió a superar las 93 pruebas y el build. No se modificó el SDK de Supabase ni la biblioteca PDF del navegador.
- PostgreSQL real: database/verificacion-3-2.sql devolvió ALCANCE_SUSPENSION_REACTIVACION_JWT_DIAGNOSTICO_OK. Guardado de tres categorías, rechazo de motocicleta/otro/nulo, cálculo, idempotencia, diagnóstico limitado a administrador, suspensión y reactivación y bloqueo de lectura/escritura con JWT anterior. Todo se revirtió; comprobación posterior: cero cuentas qa-32 temporales restantes.
- HTTP real: Auth 200; tablas y RPC protegidas rechazan acceso anónimo; preflight CORS de Pages correcto.
- Chrome con sesión administrativa existente: diagnóstico real muestra 10/10 cuentas con hash bcrypt y 7/7 tablas seleccionadas con RLS. Se abrió y canceló la confirmación de suspensión sin suspender personas reales.
- Diseño inspeccionado en escritorio y a 390 píxeles; el acceso no presentó desbordamiento horizontal. Se guardaron capturas locales, excluidas del repositorio público cuando contienen datos de cuenta.

No se usaron contraseñas de cuentas reales. Las pruebas de interfaz y login con fixtures son simuladas; las pruebas SQL utilizan identidades sintéticas y rollback. No se afirma una prueba física de Android ni de correos reales de recuperación. El APK conserva su contrato anterior, por lo que la delimitación nueva se aplica al guardado versionado de esta web.
