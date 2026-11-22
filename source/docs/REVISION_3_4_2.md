# Revisión 3.4.2

El cierre voluntario invalida las lecturas pendientes antes de revocar el acceso. Las respuestas de la sesión anterior no pueden mostrar errores ni rellenar la pantalla de acceso. Se detienen nuevas recargas mientras se cierra sesión. Si Auth informa explícitamente que la sesión ya no existe, la salida se completa y se limpia el aviso previo del formulario. Los errores reales de red siguen mostrándose y permiten reintentar; una caducidad durante el uso normal sigue siendo visible.

La regresión de interfaz usa API aislada: lectura detenida, cierre pendiente, respuesta JWT expired tardía y AuthSessionMissingError. También comprueba la caducidad anterior al cierre. El resto de pruebas conserva salida de ambos roles, fallo de red y nuevo acceso posterior. No equivale a introducir credenciales de cuentas reales.

La imagen sube 32 px y la línea del pie baja 8 px para dar más separación al vehículo. Móvil mantiene su composición y no presenta desbordamiento horizontal en 390x844; escritorio revisado en 1280x960.

Validación: formato Prettier uniforme, 99 pruebas automáticas aprobadas y compilación de recursos estáticos. Comentarios centrados en el motivo de invalidar respuestas asíncronas. Se mantienen HTML, CSS, módulos JavaScript, recursos, SQL y pruebas en carpetas separadas. Sin cambios de tablas, permisos ni cuentas.

Referencia de cierre local: https://supabase.com/docs/reference/javascript/auth-signout
