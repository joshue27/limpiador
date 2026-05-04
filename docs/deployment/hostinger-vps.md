# Hostinger VPS deployment groundwork

This app is designed for a Hostinger VPS with HTTPS, a reverse proxy, PostgreSQL, Redis, private media/export volumes, and separate `web`/`worker` processes.

## Checklist

1. Provision the VPS with Docker Engine and Docker Compose.
2. Create a non-root deploy user and restrict SSH access.
3. Copy `.env.example` to `.env` on the server and fill real secrets there only.
4. Point the domain to the VPS and terminate TLS with Caddy or Nginx.
5. Reverse proxy public HTTPS traffic to `web:3000`.
6. Configure Meta webhook URL as `https://<domain>/api/webhooks/whatsapp`.
7. Keep Postgres, Redis, `media`, and `exports` on persistent volumes.
8. Install the backup and logrotate snippets from `scripts/deploy/`.
9. Block public access to Postgres/Redis with firewall rules.
10. Before go-live, complete the WABA/number migration checklist in `docs/whatsapp/number-readiness.md`.

## Caddy reverse-proxy example

```caddyfile
limpiador.example.com {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3000
}
```

## Nginx reverse-proxy example

```nginx
server {
  listen 443 ssl http2;
  server_name limpiador.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## Operational notes

- Do not store WhatsApp tokens in browser-visible `NEXT_PUBLIC_*` variables.
- Media and exports are private volumes; never serve those directories directly from the reverse proxy.
- Hostinger backups are useful for disaster recovery, but monthly comprobante exports remain an app feature.
