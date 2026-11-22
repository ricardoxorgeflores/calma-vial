# Calma Vial

[Probar la aplicación](https://ricardoxorgeflores.github.io/calma-vial/) · [Cómo colaborar](CONTRIBUTING.md)

Versión 3.4: fotografía de Fórmula 1, tema negro carbono/grafito/turquesa y textos de acceso simplificados. Conserva las funciones administrativas de la revisión 3.3.

## Para tus compañeros

Cualquier persona con cuenta GitHub puede hacer Fork, crear commits en su copia y enviar Pull request. La escritura directa al repositorio principal requiere invitación a colaboradores identificados. [Guía paso a paso](CONTRIBUTING.md).

## Código editable y publicación

La fuente vigente está en **source/**, con HTML, CSS, JavaScript, pruebas, scripts y SQL. Abre esa carpeta en Visual Studio Code y ejecuta:

```sh
cd source
npm ci --ignore-scripts
npm run dev
```

Antes de proponer cambios: npm run format:check, npm test y npm run build. GitHub Actions prueba los pull requests. Al integrar cambios en main, publica únicamente source/dist si las pruebas pasan. Los recursos estáticos de la raíz y las carpetas históricas se conservan; edita source/ para el flujo actual.

Supabase administra Auth, PostgreSQL y RLS. El cliente incluye solamente configuración pública. Los colaboradores no reciben acceso administrativo a la base ni datos de cuentas. Los scripts SQL requieren aplicación separada y pruebas transaccionales.

[Decisiones y evidencia de la revisión](source/docs/REVISION_3_4.md). Las pruebas de interfaz simuladas no equivalen a una prueba física de Android ni a una certificación clínica o de seguridad.

