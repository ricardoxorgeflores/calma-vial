# Colaborar en Calma Vial

Repositorio: https://github.com/ricardoxorgeflores/calma-vial

El repositorio es público. Cualquier persona con una cuenta de GitHub puede hacer un **Fork**, modificar su copia, guardar commits y enviar un **Pull request**. La persona propietaria revisa e integra la propuesta. Tener el enlace no concede escritura directa sobre el repositorio principal: GitHub exige invitar colaboradores identificados para ello.

## Desde el navegador

1. Abre el repositorio y pulsa **Fork** para crear tu copia.
2. Crea una rama para tu cambio y edita los archivos de `source/`.
3. Guarda tus cambios con **Commit changes**.
4. En tu copia, pulsa **Contribute → Open pull request** hacia `ricardoxorgeflores/calma-vial`, rama `main`.
5. Describe qué cambiaste y cómo lo comprobaste. Las pruebas automáticas se muestran en la propuesta; el propietario puede tener que autorizar su primera ejecución para contribuciones externas.

## Desde Visual Studio Code

Clona tu fork, abre `source/` y ejecuta con Node.js 22 o posterior:

```sh
npm ci --ignore-scripts
npm run dev
npm run format:check
npm test
npm run build
```

La aplicación local está en http://localhost:4174/. Los recursos publicados se construyen desde `source/html`, `source/css`, `source/js`, `source/assets` y `source/vendor`. Edita esos archivos fuente. Los archivos estáticos de la raíz se conservan como copia de publicación; el flujo de GitHub Pages construye `source/dist` y publica únicamente esa salida.

## Reglas del proyecto

- Conserva los valores de rol `usuario` y `admin` y el contrato compartido con Android.
- Nunca subas contraseñas, tokens de sesión, claves privilegiadas, exportaciones de usuarios ni datos personales de pruebas.
- Las pruebas locales usan servicios simulados. Los scripts SQL transaccionales deben ejecutarse por una persona autorizada en Supabase; no se entregan credenciales del backend a colaboradores externos.
- La web admite tres categorías del estudio: Particular, Transporte público y Transporte comercial. El historial conserva sus categorías originales.
- Los cambios en preguntas crean versiones y requieren una justificación. No publiques cambios arbitrarios del instrumento para probar una interfaz.
- Antes de integrar un cambio visual, revisa escritorio, móvil, navegación por teclado y movimiento reducido.

## Publicación

Las propuestas externas se prueban sin secretos ni permiso para publicar. Al integrar cambios en `main`, GitHub Actions vuelve a ejecutar las pruebas y publica `source/dist` en GitHub Pages si terminan correctamente. Los cambios SQL requieren revisión y aplicación separada en el proyecto correcto de Supabase.
