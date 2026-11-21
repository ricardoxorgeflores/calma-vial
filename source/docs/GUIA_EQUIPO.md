# Guía del proyecto para el equipo

En el repositorio y el ZIP, abre la carpeta **source** en Visual Studio Code. La aplicación se ejecuta por HTTP; no abras el HTML con doble clic.

## Organización

| Carpeta dentro de source | Contenido |
| --- | --- |
| html | Estructura HTML y contenedores de las pantallas |
| css | Colores, estilos generales, acceso, navegación y adaptación móvil |
| js/auth | Interacción del formulario de acceso |
| js/domain | Reglas y validaciones independientes de la interfaz |
| js/services | Acceso a Supabase y conversión de datos |
| js/features | Paneles administrativos, conversaciones, fotos e informes |
| js/ui | Formato de texto e iconos |
| assets | Imágenes y fuentes locales |
| vendor | Bibliotecas del navegador y licencias |
| database | Scripts SQL y pruebas transaccionales del backend |
| tests | Pruebas automatizadas con datos sintéticos |
| scripts | Construcción y verificaciones de recursos y backend |
| docs | Decisiones, alcance, evidencia y esta guía |

Los archivos package.json y package-lock.json fijan las herramientas del proyecto. server.mjs sirve únicamente los recursos públicos autorizados. El directorio dist se genera mediante el build y no es la fuente editable.

## Ejecutar

Instala Node.js 22 o posterior. Desde source:

```sh
npm ci --ignore-scripts
npm run dev
```

Abre http://localhost:4174/. Para revisar un cambio:

```sh
npm run format
npm run format:check
npm test
npm run build
```

`npm start` sirve el build en http://localhost:4173/. Las pruebas usan API aislada y no deben apuntarse a cuentas reales para generar datos ficticios.

## Colaborar

Abre https://github.com/ricardoxorgeflores/calma-vial y pulsa Fork. Haz commits en una rama de tu copia y envía un Pull request hacia main. La cuenta propietaria revisa la propuesta. Las pruebas se ejecutan automáticamente; los cambios integrados se publican cuando pasan. La guía completa está en CONTRIBUTING.md, en la raíz del repositorio.

La configuración pública del cliente no concede acceso administrativo. Los cambios de base de datos requieren una persona autorizada en el proyecto correspondiente de Supabase. No compartas contraseñas, tokens, exportaciones de usuarios ni claves privilegiadas.

El ZIP permite editar y probar el proyecto localmente. Para integrar los cambios con el equipo, trabaja sobre tu fork y utiliza Git para conservar el historial.
