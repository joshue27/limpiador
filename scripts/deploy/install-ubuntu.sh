#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="limpiador"
DEFAULT_REPO_URL="https://github.com/joshue27/limpiador.git"
DEFAULT_BRANCH="main"
DEFAULT_APP_DIR="/opt/limpiador"

if [ -t 1 ]; then
  GREEN="\033[0;32m"
  YELLOW="\033[1;33m"
  RED="\033[0;31m"
  BLUE="\033[0;34m"
  NC="\033[0m"
else
  GREEN=""
  YELLOW=""
  RED=""
  BLUE=""
  NC=""
fi

log() {
  printf "%b==>%b %s\n" "$BLUE" "$NC" "$1"
}

success() {
  printf "%b✔%b %s\n" "$GREEN" "$NC" "$1"
}

warn() {
  printf "%b!%b %s\n" "$YELLOW" "$NC" "$1"
}

fail() {
  printf "%b✖%b %s\n" "$RED" "$NC" "$1" >&2
  exit 1
}

ask() {
  local prompt="$1"
  local default_value="${2-}"
  local answer=""

  if [ -n "$default_value" ]; then
    read -r -p "$prompt [$default_value]: " answer
    printf '%s' "${answer:-$default_value}"
  else
    read -r -p "$prompt: " answer
    printf '%s' "$answer"
  fi
}

ask_yes_no() {
  local prompt="$1"
  local default_value="$2"
  local suffix="[y/N]"
  local answer=""

  if [ "$default_value" = "y" ]; then
    suffix="[Y/n]"
  fi

  read -r -p "$prompt $suffix: " answer
  answer="${answer:-$default_value}"

  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

ask_secret() {
  local prompt="$1"
  local answer=""
  read -r -s -p "$prompt: " answer
  printf "\n" >&2
  printf '%s' "$answer"
}

require_ubuntu() {
  [ -r /etc/os-release ] || fail "No pude detectar el sistema operativo"
  . /etc/os-release
  [ "${ID:-}" = "ubuntu" ] || fail "Este script está pensado para Ubuntu"
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    fail "Ejecutá este script con sudo"
  fi
}

apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
}

install_base_packages() {
  log "Instalando paquetes base"
  apt-get update
  apt_install ca-certificates curl git gnupg lsb-release nano openssl ufw
  success "Paquetes base instalados"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    success "Docker y Docker Compose ya están instalados"
    return
  fi

  log "Instalando Docker Engine y Docker Compose"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" \
    "$(. /etc/os-release && printf '%s' "$VERSION_CODENAME")" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  success "Docker instalado"
}

install_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    success "Caddy ya está instalado"
    return
  fi

  log "Instalando Caddy para HTTPS automático"
  apt_install debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt_install caddy
  systemctl enable --now caddy
  success "Caddy instalado"
}

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped_value=""

  escaped_value="$(printf '%s' "$value" | sed 's/[&]/\\&/g')"

  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

clone_or_update_repo() {
  local repo_url="$1"
  local branch="$2"
  local app_dir="$3"

  if [ -d "$app_dir/.git" ]; then
    log "Actualizando repositorio existente"
    git -C "$app_dir" fetch --all --prune
    git -C "$app_dir" checkout "$branch"
    git -C "$app_dir" pull --ff-only origin "$branch"
  else
    log "Clonando proyecto desde GitHub"
    mkdir -p "$(dirname "$app_dir")"
    git clone --branch "$branch" "$repo_url" "$app_dir"
  fi

  success "Repositorio listo en $app_dir"
}

prepare_env_file() {
  local app_dir="$1"
  local env_file="$app_dir/.env"
  local domain="$2"
  local db_password="$3"

  [ -f "$app_dir/.env.production.example" ] || fail "No encontré .env.production.example"

  if [ ! -f "$env_file" ]; then
    cp "$app_dir/.env.production.example" "$env_file"
    success "Archivo .env creado desde la plantilla de producción"
  else
    warn "Ya existe .env; voy a reutilizarlo"
  fi

  if [ -n "$domain" ]; then
    upsert_env "$env_file" "APP_URL" "https://$domain"
  fi

  upsert_env "$env_file" "DB_PASSWORD" "$db_password"
  upsert_env "$env_file" "DATABASE_URL" "postgresql://limpiador:${db_password}@postgres:5432/limpiador?schema=public"
  upsert_env "$env_file" "SESSION_SECRET" "$(openssl rand -base64 32 | tr -d '\n')"
  upsert_env "$env_file" "WHATSAPP_SETTINGS_KEY" "$(openssl rand -hex 32)"
}

write_compose_override() {
  local app_dir="$1"
  local use_caddy="$2"
  local override_file="$app_dir/docker-compose.server.override.yml"

  if [ "$use_caddy" = "yes" ]; then
    cat > "$override_file" <<'EOF'
services:
  nginx:
    ports:
      - "127.0.0.1:8080:80"
EOF
  else
    cat > "$override_file" <<'EOF'
services:
  nginx:
    ports:
      - "80:80"
EOF
  fi

  success "Override de Docker Compose generado"
}

configure_caddy() {
  local domain="$1"

  [ -n "$domain" ] || fail "Necesito un dominio para configurar HTTPS con Caddy"

  cat > /etc/caddy/Caddyfile <<EOF
$domain {
  encode gzip zstd
  reverse_proxy 127.0.0.1:8080
}
EOF

  systemctl reload caddy
  success "Caddy quedó apuntando a https://$domain"
}

configure_firewall() {
  log "Configurando firewall básico"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  yes | ufw enable >/dev/null 2>&1 || true
  success "Firewall configurado"
}

edit_env_if_needed() {
  local env_file="$1"

  warn "Todavía tenés que completar variables reales de WhatsApp y SMTP en $env_file"
  printf '\nVariables críticas pendientes:\n'
  printf '  - WHATSAPP_PHONE_NUMBER_ID\n'
  printf '  - WHATSAPP_BUSINESS_ACCOUNT_ID\n'
  printf '  - WHATSAPP_ACCESS_TOKEN\n'
  printf '  - WHATSAPP_APP_SECRET\n'
  printf '  - WHATSAPP_WEBHOOK_VERIFY_TOKEN\n'
  printf '  - SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM\n\n'

  if ask_yes_no "¿Querés abrir .env ahora con nano?" "y"; then
    nano "$env_file"
  fi
}

deploy_stack() {
  local app_dir="$1"
  log "Levantando stack de producción"
  docker compose -f "$app_dir/docker-compose.yml" -f "$app_dir/docker-compose.server.override.yml" up -d --build
  success "Stack desplegado"
}

show_summary() {
  local app_dir="$1"
  local domain="$2"
  local use_caddy="$3"

  printf '\n'
  success "Instalación base finalizada"
  printf 'Proyecto: %s\n' "$app_dir"
  if [ "$use_caddy" = "yes" ]; then
    printf 'URL esperada: https://%s\n' "$domain"
  else
    printf 'URL esperada: http://IP_DEL_VPS\n'
  fi
  printf '\nComandos útiles:\n'
  printf '  cd %s\n' "$app_dir"
  printf '  docker compose -f docker-compose.yml -f docker-compose.server.override.yml ps\n'
  printf '  docker compose -f docker-compose.yml -f docker-compose.server.override.yml logs -f web\n'
  printf '\nIMPORTANTE: no pongás en producción final sin dominio + HTTPS + secretos reales.\n'
}

main() {
  require_ubuntu
  require_root

  printf '\nInstalador Ubuntu para %s\n' "$APP_NAME"
  printf 'Este proceso clona el repo, instala Docker, prepara .env y despliega la app.\n\n'

  local repo_url
  local branch
  local app_dir
  local domain
  local db_password
  local use_caddy="no"

  repo_url="$(ask 'Repositorio GitHub' "$DEFAULT_REPO_URL")"
  branch="$(ask 'Branch a desplegar' "$DEFAULT_BRANCH")"
  app_dir="$(ask 'Directorio de instalación' "$DEFAULT_APP_DIR")"
  domain="$(ask 'Dominio público (vacío si todavía no existe)' '')"
  db_password="$(ask_secret 'Contraseña para PostgreSQL interno (mejor solo letras, números y guiones)')"

  if [ -z "$db_password" ]; then
    fail "La contraseña de PostgreSQL no puede quedar vacía"
  fi

  if [ -n "$domain" ] && ask_yes_no "¿Querés configurar HTTPS automático con Caddy?" "y"; then
    use_caddy="yes"
  fi

  install_base_packages
  install_docker
  if [ "$use_caddy" = "yes" ]; then
    install_caddy
  fi

  clone_or_update_repo "$repo_url" "$branch" "$app_dir"
  prepare_env_file "$app_dir" "$domain" "$db_password"
  write_compose_override "$app_dir" "$use_caddy"
  edit_env_if_needed "$app_dir/.env"

  if [ "$use_caddy" = "yes" ]; then
    configure_caddy "$domain"
  fi

  if ask_yes_no "¿Querés habilitar firewall básico (SSH, 80, 443)?" "y"; then
    configure_firewall
  fi

  if ask_yes_no "¿Querés desplegar ahora mismo?" "y"; then
    deploy_stack "$app_dir"
  else
    warn "Deploy omitido. Ejecutalo manualmente cuando termines de revisar el .env"
  fi

  show_summary "$app_dir" "$domain" "$use_caddy"
}

main "$@"
