# Calma Vial 3.4

Código editable de la aplicación web con Supabase.

Ejecuta npm ci --ignore-scripts, npm run dev, npm test y npm run build desde esta carpeta. El servidor abre http://localhost:4174/. El build produce dist/.

Lee ../CONTRIBUTING.md y docs/REVISION_3_4.md. Las pruebas locales usan API aislada; los scripts SQL se prueban aparte con rollback y acceso autorizado a Supabase. No se incluyen credenciales privilegiadas.

La carpeta html contiene la entrada real. El servidor y el build la sirven como index.html. No abras HTML mediante file://.

