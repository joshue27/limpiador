# Limpiador WhatsApp Cloud

Plataforma web para operar conversaciones de WhatsApp, gestionar contactos, lanzar campañas, administrar plantillas, resguardar archivos y auditar acciones del equipo. Está construida con Next.js, PostgreSQL, Redis y un worker separado para procesos en segundo plano.

## Inicio rápido

### Desarrollo local

1. Instalá Docker y Docker Compose.
2. Copiá la configuración base:

   ```bash
   cp .env.example .env
   ```

3. Levantá el entorno:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
   ```

4. Verificá salud:

   ```bash
   curl http://localhost:3000/api/health
   ```

5. Si es la primera vez y no existen usuarios, creá el admin inicial:

   ```bash
   curl -X POST http://localhost:3000/api/dev/bootstrap-admin \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@dominio.com","password":"Contraseña123!"}'
   ```

## Producción en Ubuntu VPS

La ruta recomendada es usar el instalador guiado:

```bash
curl -fsSL https://raw.githubusercontent.com/joshue27/limpiador/main/scripts/deploy/install-ubuntu.sh -o install-ubuntu.sh
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

Ese script:
- instala Docker y Docker Compose
- clona o actualiza el repo desde GitHub
- crea `.env` desde la plantilla de producción
- genera secretos base
- puede configurar HTTPS con Caddy
- despliega el stack con Docker Compose

Guía completa: [`docs/deployment/ubuntu-install.md`](docs/deployment/ubuntu-install.md)

## Qué incluye

- Inbox multioperador para conversaciones de WhatsApp
- Bandejas por estado y asignación por operador/departamento
- Gestión de contactos, etiquetas y envío manual de mensajes
- Campañas por plantillas aprobadas con importación CSV
- Repositorio de multimedia y comprobantes
- Exportación y restauración de conversaciones
- Auditoría de acciones administrativas
- Worker dedicado para colas, campañas, descargas y tareas programadas

## Stack técnico

| Capa | Tecnología |
|---|---|
| App web / API | Next.js 15 + React 18 |
| Lenguaje | TypeScript |
| Base de datos | PostgreSQL |
| Colas / cache | Redis + BullMQ |
| ORM | Prisma |
| Contenedores | Docker + Docker Compose |
| Reverse proxy | Nginx en contenedor / Caddy opcional en VPS |

## Servicios del stack

El `docker-compose.yml` de producción levanta:

- `web`: aplicación Next.js
- `worker`: jobs en segundo plano
- `nginx`: reverse proxy interno
- `postgres`: base de datos
- `redis`: colas y cache

Además se persisten volúmenes para:

- `postgres-data`
- `redis-data`
- `media`
- `exports`
- `config`

## Variables importantes

Base para producción: [`.env.production.example`](.env.production.example)

Variables críticas:

- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_SETTINGS_KEY`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## Scripts útiles

```bash
npm run dev
npm run test
npm run test:integration
npm run test:e2e
npm run prisma:generate
npm run prisma:deploy
npm run worker:dev
```

## Estructura principal

```text
src/app/                    rutas UI y API
src/worker/                 procesos en segundo plano
prisma/                     schema, migraciones y seed
docker/nginx/               configuración de nginx
scripts/deploy/             utilidades de despliegue y operación
docs/                       documentación técnica, usuario y despliegue
```

## Integración con Meta WhatsApp Cloud API

Webhook server-side:

```text
/api/webhooks/whatsapp
```

La app ya soporta:
- challenge `GET` de Meta
- validación de firma HMAC en `POST`
- ingreso idempotente de mensajes
- envío de mensajes desde inbox

Guía de configuración: [`docs/whatsapp/meta-cloud-setup.md`](docs/whatsapp/meta-cloud-setup.md)

## Documentación disponible

- [`docs/deployment/ubuntu-install.md`](docs/deployment/ubuntu-install.md)
- [`docs/deployment/hostinger-vps.md`](docs/deployment/hostinger-vps.md)
- [`docs/whatsapp/meta-cloud-setup.md`](docs/whatsapp/meta-cloud-setup.md)
- [`docs/whatsapp/number-readiness.md`](docs/whatsapp/number-readiness.md)
- `docs/manual-tecnico.html`
- `docs/manual-usuario.html`

## Notas de producción

- NO expongás PostgreSQL ni Redis a internet.
- Para webhooks de Meta necesitás dominio + HTTPS.
- No guardés secretos en variables `NEXT_PUBLIC_*`.
- El worker debe estar arriba o se frenan campañas, descargas y tareas automáticas.

## Estado

El proyecto ya tiene base funcional para operación por WhatsApp Cloud y despliegue con contenedores. El README apunta a la ruta de instalación y operación más segura para VPS Ubuntu.
