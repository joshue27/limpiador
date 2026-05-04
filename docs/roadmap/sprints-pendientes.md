# Roadmap de sprints pendientes

Este documento resume lo que falta para llevar `limpiador` desde el estado actual de pruebas locales hasta una versión usable en producción.

## Estado base actual

Ya existe:

- App Next.js en Docker.
- Login, usuarios, roles y sesiones.
- Inbox conectado a WhatsApp Cloud API.
- Webhook validado con Meta.
- Recepción y envío de mensajes.
- Descarga y preview de multimedia: imágenes, audio y video.
- Marcado de comprobantes desde el chat y desde `/comprobantes`.
- Departamentos, asignación, tomar conversación y transferir.
- Worker BullMQ para multimedia.

---

## Sprint 1 — Estabilización del chat operativo

Objetivo: que el inbox se sienta como un chat real y confiable.

### Pendiente

- Corregir definitivamente el scroll interno del historial para que la conversación no expanda la vista.
- Mejorar actualización en vivo:
  - reemplazar `router.refresh()` completo por endpoint liviano, polling inteligente o SSE.
  - evitar parpadeos o saltos visuales.
- Mejorar auto-scroll:
  - bajar al último mensaje solo si el operador ya estaba cerca del final.
  - no forzar scroll si el operador está leyendo mensajes antiguos.
- Mostrar estados claros por mensaje:
  - enviado
  - entregado
  - leído
  - fallido
- Mejorar errores visibles cuando falla el envío.

### Criterio de aceptación

- El operador puede mantener una conversación sin refrescar manualmente.
- El chat no rompe el layout aunque haya muchos mensajes.
- Enviar con Enter no recarga la página.

---

## Sprint 2 — Responder citando y eliminar mensajes

Objetivo: acercar la experiencia al uso normal de WhatsApp.

### Pendiente

- Responder citando un mensaje:
  - botón “Responder” en cada mensaje.
  - preview del mensaje citado encima del composer.
  - guardar referencia local al mensaje citado.
  - enviar a WhatsApp con contexto si Cloud API lo soporta para ese tipo de mensaje.
- Eliminar mensaje para mí:
  - ocultar mensaje solo para el usuario actual.
  - mantener auditoría.
- Eliminar mensaje para todos en la app:
  - ocultar globalmente para todos los operadores.
  - registrar quién lo eliminó y cuándo.
- Investigar/confirmar si WhatsApp Cloud API permite borrar mensajes ya entregados del teléfono del cliente.

### Criterio de aceptación

- El operador puede citar un mensaje y responderlo.
- El operador puede ocultar mensajes sin destruir trazabilidad.
- Toda eliminación queda auditada.

---

## Sprint 3 — Comprobantes y multimedia

Objetivo: convertir el manejo de adjuntos en una herramienta cómoda para operación diaria.

### Pendiente

- Mejorar expansión de imágenes:
  - modal real o visor amplio.
  - zoom básico.
  - cerrar con Escape/click fuera.
- Mejorar comprobantes desde chat:
  - feedback visual más claro al marcar/desmarcar.
  - filtrar conversación por comprobantes.
  - mostrar “marcado por” y fecha en el chat.
- Agregar “reintentar descarga” para multimedia fallida.
- Preview de PDF dentro del chat.
- Validar límites de tamaño y tipos permitidos por negocio.

### Criterio de aceptación

- El operador puede revisar comprobantes sin salir del chat.
- Los adjuntos fallidos se pueden diagnosticar y reintentar.
- Las imágenes se ven cómodamente en pantalla grande.

---

## Sprint 4 — Bandeja, búsqueda y productividad

Objetivo: que el operador encuentre y gestione conversaciones rápido.

### Pendiente

- Mejorar búsqueda dentro del chat.
- Filtros rápidos:
  - no leídos
  - asignados a mí
  - por departamento
  - con comprobantes
  - con multimedia fallida
- Acciones masivas de conversaciones.
- Mejorar indicador de ventana de 24 horas.
- Notificaciones visuales/sonoras para mensajes nuevos.
- Atajos de teclado básicos.

### Criterio de aceptación

- Un operador puede manejar alto volumen sin perder conversaciones.
- Las conversaciones críticas se detectan rápido.

---

## Sprint 5 — Campañas y plantillas

Objetivo: permitir envíos controlados sin romper reglas de WhatsApp.

### Pendiente

- Gestión de plantillas aprobadas.
- Crear campaña desde audiencia filtrada.
- Preparar destinatarios con opt-in válido.
- Lanzamiento explícito con confirmación.
- Worker de envío con throttling.
- Reintentos controlados.
- Estados por destinatario:
  - pendiente
  - enviado
  - entregado
  - leído
  - fallido
- Reconciliar estados recibidos por webhook.

### Criterio de aceptación

- Se puede lanzar una campaña segura y auditable.
- No se envía nada sin confirmación explícita.
- Cada destinatario tiene trazabilidad.

---

## Sprint 6 — Exportaciones mensuales

Objetivo: generar paquetes mensuales de comprobantes.

### Pendiente

- Worker de exportación mensual.
- ZIP con estructura definida.
- Manifest CSV/XLSX.
- Checksums.
- Manejo de meses vacíos.
- UI de solicitar/listar/descargar exportaciones.
- Protección por rol admin.
- Auditoría de descargas.

### Criterio de aceptación

- Un admin puede generar y descargar el paquete mensual de comprobantes.
- La exportación es reproducible y auditable.

---

## Sprint 7 — Administración y auditoría

Objetivo: endurecer operación interna.

### Pendiente

- Mejorar gestión de usuarios.
- Activar/desactivar usuarios con trazabilidad.
- Gestión completa de departamentos.
- Auditoría más filtrable:
  - usuario
  - acción
  - entidad
  - fecha
- Export de auditoría más cómodo.
- Revisar permisos por rol en todos los endpoints nuevos.

### Criterio de aceptación

- Toda acción sensible queda registrada.
- Los roles no pueden acceder a datos fuera de su permiso.

---

## Sprint 8 — Producción / despliegue real

Objetivo: dejar la app lista para VPS/dominio real.

### Pendiente

- Reemplazar túnel local por dominio HTTPS real.
- Cambiar token temporal de Meta por token permanente de System User.
- Revisar variables `.env` productivas.
- Optimizar Docker:
  - no instalar dependencias en cada arranque.
  - Dockerfile propio.
  - healthchecks más rápidos.
- Backups de Postgres.
- Persistencia de media y exports.
- Logs y rotación.
- Checklist de migración del número real.

### Criterio de aceptación

- La app puede correr en VPS sin depender de la máquina local.
- El webhook apunta a dominio definitivo.
- Hay backups y persistencia clara.

---

## Sprint 9 — Testing y calidad

Objetivo: bajar riesgo antes de producción.

### Pendiente

- Tests unitarios:
  - parser de mensajes
  - permisos de inbox
  - routing de departamentos
  - comprobantes
  - composer
- Tests de integración:
  - webhook idempotente
  - descarga multimedia
  - marcar comprobante
  - tomar/transferir conversación
  - campañas
  - exports
- Smoke E2E:
  - login
  - abrir inbox
  - recibir mensaje
  - responder
  - marcar comprobante
  - descargar exportación

### Criterio de aceptación

- Cambios críticos quedan cubiertos.
- Se puede validar una release sin probar todo manualmente.

---

## Prioridad recomendada para continuar

1. Sprint 1 — Estabilización del chat.
2. Sprint 2 — Citar/eliminar mensajes.
3. Sprint 3 — Comprobantes/multimedia.
4. Sprint 8 — Producción si ya se necesita demo real.
5. Sprint 5 y 6 — Campañas/exportaciones.
6. Sprint 9 — Tests antes de cerrar versión estable.

## Notas de producto

- No conviene avanzar fuerte en campañas hasta que el inbox esté sólido.
- El chat es el corazón del sistema: primero estabilidad, luego productividad.
- Toda acción destructiva debe tener auditoría.
- Para “eliminar para todos”, hay que distinguir entre “todos en la app” y “también en el WhatsApp del cliente”.
