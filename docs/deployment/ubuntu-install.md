# Instalación en Ubuntu VPS

Este proyecto YA tiene una base de despliegue con Docker Compose. Para producción en Ubuntu, la ruta correcta es clonar desde GitHub, preparar `.env`, desplegar `web + worker + postgres + redis` y, si ya tenés dominio, poner HTTPS delante.

## Script recomendado

Desde el VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/joshue27/limpiador/main/scripts/deploy/install-ubuntu.sh -o install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

## Qué hace

1. Verifica que el servidor sea Ubuntu.
2. Instala paquetes base.
3. Instala Docker Engine + Docker Compose.
4. Clona o actualiza el repo desde GitHub.
5. Crea `.env` desde `.env.production.example`.
6. Genera secretos base.
7. Te obliga a revisar las variables sensibles que faltan.
8. Puede configurar Caddy para HTTPS automático si ya tenés dominio.
9. Levanta el stack con Docker Compose.

## Variables que TENÉS que completar

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Importante para producción

- No publiques esto solo por IP si vas a recibir webhooks de Meta. Necesitás dominio y HTTPS.
- `DATABASE_URL` y `REDIS_URL` apuntan a los contenedores internos; no abras Postgres ni Redis a internet.
- El stack usa volúmenes persistentes para `postgres`, `redis`, `media`, `exports` y `config`.
- Si cambiás de branch o querés actualizar, corré de nuevo el script y elegí el mismo directorio.

## Verificación rápida

```bash
cd /opt/limpiador
docker compose -f docker-compose.yml -f docker-compose.server.override.yml ps
docker compose -f docker-compose.yml -f docker-compose.server.override.yml logs -f web
```

Si configuraste dominio + Caddy, la salud debería quedar en:

```text
https://tu-dominio.com/api/health
```
