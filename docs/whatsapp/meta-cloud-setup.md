# Meta WhatsApp Cloud API setup

Este proyecto ya tiene el MVP de conexión usando la ruta server-side:

```txt
/api/webhooks/whatsapp
```

## Variables requeridas

Completá estas variables en `.env` del entorno donde corre la app. No uses `NEXT_PUBLIC_`.

```env
WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
```

## Configuración en Meta Developer

En el producto WhatsApp de la app de Meta:

1. Callback URL:

   ```txt
   https://TU-DOMINIO.com/api/webhooks/whatsapp
   ```

   En local necesitás exponer Next.js con una URL HTTPS pública, por ejemplo con un túnel.

2. Verify token:

   Usá exactamente el mismo valor que `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

3. Webhook fields mínimos:

   - `messages`
   - `message_template_status_update` si se van a administrar plantillas

4. App secret:

   Copialo a `WHATSAPP_APP_SECRET`; se usa para validar `x-hub-signature-256`.

## Qué ya hace la app

- Responde el challenge `GET` de Meta.
- Valida firma HMAC SHA-256 en `POST`.
- Ingresa mensajes entrantes de forma idempotente.
- Encola/procesa eventos sin exponer tokens al navegador.
- Envía mensajes desde el inbox usando el cliente de WhatsApp Cloud API.

## Prueba mínima

1. Levantá la app con las variables configuradas.
2. Configurá el webhook en Meta y verificá el callback.
3. Enviá un WhatsApp al número de prueba o número conectado.
4. Confirmá que aparece/actualiza la conversación en el inbox.
5. Respondé desde el inbox durante la ventana de 24 horas o usando una plantilla aprobada.

## Seguridad

- Nunca pegues tokens reales en commits, documentación ni capturas.
- Si el webhook falla con 401, revisá `WHATSAPP_APP_SECRET` y que Meta esté enviando `x-hub-signature-256`.
- Si falla la verificación inicial con 403, revisá que el verify token coincida exactamente.
