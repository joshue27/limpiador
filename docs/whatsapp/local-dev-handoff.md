# Handoff local para continuar mañana

## Estado actual

- La app corre en Docker Compose.
- No levantar `npm run dev` directamente en Windows si Docker está usando el puerto `3000`.
- El webhook de Meta ya fue validado usando Cloudflare Tunnel.
- La ruta del webhook es:

```txt
/api/webhooks/whatsapp
```

## Levantar todo desde cero

Desde la raíz del proyecto:

```powershell
cd C:\Users\infor\OneDrive\Documents\limpiador
docker compose up -d
```

Verificar contenedores:

```powershell
docker ps --filter "name=limpiador"
```

La app debería responder en:

```txt
http://localhost:3000/login
```

Si cambiaste `.env`, NO alcanza con `docker compose restart`. Hay que recrear:

```powershell
docker compose up -d --force-recreate web worker
```

## Levantar túnel para Meta

El archivo `cloudflared.exe` está en la raíz del proyecto.

```powershell
.\cloudflared.exe tunnel --url http://localhost:3000
```

Copiar la URL que termine en:

```txt
.trycloudflare.com
```

En Meta Developer configurar el callback así:

```txt
https://TU-URL.trycloudflare.com/api/webhooks/whatsapp
```

El **Verify token** debe ser exactamente el valor de:

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

## Probar webhook manualmente

Reemplazar `TU-URL` y `VERIFY_TOKEN`:

```powershell
Invoke-WebRequest "https://TU-URL.trycloudflare.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=VERIFY_TOKEN&hub.challenge=test123" -UseBasicParsing
```

Debe devolver:

```txt
test123
```

## Logs útiles

Web:

```powershell
docker logs --tail 120 limpiador-web-1
```

Worker:

```powershell
docker logs --tail 120 limpiador-worker-1
```

Estado de multimedia:

```powershell
docker exec limpiador-postgres-1 psql -U limpiador -d limpiador -c "select id, mime_type, download_status, storage_key, filename, download_error, is_comprobante from media_assets order by created_at desc limit 20;"
```

## Si multimedia queda pendiente

Ya se corrigió el bug de BullMQ: los job IDs no pueden contener `:`.

Si algún adjunto viejo queda sin procesar, reencolar desde el contenedor web:

```powershell
docker compose exec -T web npx tsx -e "import { prisma } from './src/lib/prisma'; import { enqueueMediaDownload } from './src/modules/queue/queues'; async function main(){ const assets = await prisma.mediaAsset.findMany({ where: { storageKey: null, downloadStatus: { in: ['PENDING','FAILED'] } }, select: { id: true } }); for (const asset of assets) { await enqueueMediaDownload(asset.id); } console.log('requeued', assets.length); } main().then(()=>process.exit(0)).catch((error)=>{ console.error(error); process.exit(1); });"
```

## Qué quedó funcionando

- Validación de webhook Meta.
- Recepción de mensajes.
- Descarga de multimedia desde WhatsApp.
- Preview inline para imágenes, audio y video.
- Marcado de comprobantes desde el chat vía endpoint JSON.
- Envío de mensajes desde el inbox sin navegación full-page.
- Polling del inbox cada ~2 segundos.

## Features pendientes / próximos pasos

### Chat e inbox

- Mejorar definitivamente el scroll interno del panel de mensajes si todavía crece el DOM en algunos tamaños.
- Mejorar tiempo real: evaluar endpoint liviano de cambios o Server-Sent Events en vez de `router.refresh()` completo.
- Agregar respuesta citando mensaje:
  - UI para elegir mensaje citado.
  - Guardar referencia local al mensaje citado.
  - Enviar a WhatsApp usando `context.message_id` si aplica.
- Agregar eliminación de mensajes:
  - “Eliminar para mí”: ocultar por usuario.
  - “Eliminar para todos en la app”: ocultar globalmente con auditoría.
  - Confirmar aparte si WhatsApp Cloud API permite borrar también del teléfono del cliente para el tipo de mensaje deseado.

### Comprobantes

- Verificar UX de marcar/desmarcar comprobante desde inbox tras varios refreshes.
- Mejorar vista expandida de imagen si se quiere modal real a pantalla grande.
- Agregar filtros rápidos por comprobantes dentro del chat/contacto.

### Multimedia

- Añadir estados más claros: procesando, listo, falló.
- Agregar acción manual “reintentar descarga” para adjuntos fallidos.
- Revisar previews de documentos PDF dentro del chat.

### Operación / producción

- Reemplazar token temporal de Meta por token permanente de System User para producción.
- Configurar dominio real HTTPS en vez de Cloudflare Tunnel temporal.
- Revisar política de rate limits y auditoría para endpoints nuevos.
- Optimizar Dockerfile/Compose: hoy el contenedor instala dependencias y openssl al arrancar, lo que vuelve lentos los recreates.

## Notas importantes

- No pegar tokens reales en documentación ni chat.
- Si cambia `.env`, recrear contenedores.
- Si Meta falla con webhook, primero probar manualmente el challenge.
- Si ngrok muestra `ERR_NGROK_6024`, usar Cloudflare Tunnel.
