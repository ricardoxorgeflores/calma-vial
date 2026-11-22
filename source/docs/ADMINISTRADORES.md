# Dar acceso administrativo a una cuenta

Estos pasos son para el propietario del proyecto Supabase. Administrar Calma Vial y editar el repositorio GitHub son permisos separados.

1. Tu amigo se registra en Calma Vial con su propio correo y confirma su cuenta si se solicita.
2. En Supabase, proyecto `wezudavlgzyevhlchuww`, abre Table Editor, tabla `public.perfiles`.
3. Busca su correo exacto, comprueba su identidad y cambia únicamente `rol` de `usuario` a `admin`. Guarda la fila. No cambies su UUID, correo ni contraseña.
4. Tu amigo cierra sesión y vuelve a entrar seleccionando Administrador.

El nuevo administrador puede consultar evaluaciones y gestionar usuarios, conversaciones y avisos dentro de los permisos del sistema. No necesita tu contraseña ni acceso al panel de Supabase. Si la cuenta estaba suspendida o eliminada de forma recuperable, restaura/reactiva su acceso antes de cambiar su rol.

Para retirar este permiso, el propietario cambia `rol` de `admin` a `usuario` y el amigo vuelve a iniciar sesión. La selección de Administrador en la pantalla de acceso por sí sola no concede privilegios.

Si también necesita editar código, utiliza el Fork y Pull request del repositorio o invítalo como colaborador por su usuario GitHub; esto no le concede administración de Calma Vial.

Referencia del editor de tablas: https://supabase.com/docs/guides/database/tables
