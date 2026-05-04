#!/bin/bash
# =============================================
# Limpiador WhatsApp Cloud — Instalador Linux
# =============================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}============================================="
echo "   Limpiador WhatsApp Cloud — Instalador"
echo -e "=============================================${NC}"
echo ""

# ─── Paso 0: Verificar / instalar Docker ───
echo -e "${YELLOW}Paso 0: Verificando Docker...${NC}"

if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker ya está instalado ($(docker --version))${NC}"

    # Check Docker Compose (plugin or standalone)
    if docker compose version &> /dev/null; then
        echo -e "${GREEN}✓ Docker Compose disponible${NC}"
    elif command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}✓ Docker Compose (legacy) disponible${NC}"
    else
        echo -e "${RED}✗ Docker Compose no encontrado. Instalando...${NC}"
        sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin
        echo -e "${GREEN}✓ Docker Compose instalado${NC}"
    fi
else
    echo -e "${YELLOW}Docker no encontrado. Instalando...${NC}"
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✓ Docker instalado. Es posible que necesites cerrar sesión y volver a entrar.${NC}"
    echo -e "${YELLOW}Ejecutando docker sin sudo (puede requerir reinicio de sesión)...${NC}"
    # Try to use docker in the current session via newgrp or just continue
    if ! docker ps &> /dev/null; then
        echo -e "${RED}No se pudo ejecutar docker. Cerrá sesión y volvé a entrar, luego ejecutá ./install.sh de nuevo.${NC}"
        exit 1
    fi
fi

echo ""

# ─── Paso 1: Variables fundamentales ───
echo -e "${YELLOW}Paso 1/5: Configuración de base de datos${NC}"
read -p "Contraseña de PostgreSQL [cambiar]: " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-cambiar}

echo ""
read -p "URL pública de la app (ej: https://miapp.com) [http://localhost:3000]: " APP_URL
APP_URL=${APP_URL:-http://localhost:3000}

# ─── Paso 2: WhatsApp API ───
echo ""
echo -e "${YELLOW}Paso 2/5: WhatsApp Cloud API${NC}"
read -p "Phone Number ID: " WHATSAPP_PHONE_NUMBER_ID
read -p "Business Account ID: " WHATSAPP_BUSINESS_ACCOUNT_ID
read -p "Access Token: " WHATSAPP_ACCESS_TOKEN
read -p "App Secret: " WHATSAPP_APP_SECRET
read -p "Webhook Verify Token [limpiador-webhook]: " WHATSAPP_WEBHOOK_VERIFY_TOKEN
WHATSAPP_WEBHOOK_VERIFY_TOKEN=${WHATSAPP_WEBHOOK_VERIFY_TOKEN:-limpiador-webhook}

# ─── Paso 3: Seguridad ───
echo ""
echo -e "${YELLOW}Paso 3/5: Seguridad${NC}"
SESSION_SECRET=$(openssl rand -base64 32)
echo "Session secret generado: ${SESSION_SECRET:0:20}..."

# ─── Paso 4: Admin ───
echo ""
echo -e "${YELLOW}Paso 4/5: Usuario administrador${NC}"
read -p "Nombre del admin [Administrador]: " ADMIN_NAME
ADMIN_NAME=${ADMIN_NAME:-Administrador}
read -p "Email del admin [admin@limpiador.local]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@limpiador.local}
read -sp "Contraseña [Admin12345678!]: " ADMIN_PASSWORD
ADMIN_PASSWORD=${ADMIN_PASSWORD:-Admin12345678!}
echo ""

# ─── Paso 5: Crear .env ───
echo ""
echo -e "${YELLOW}Paso 5/5: Generando archivos de configuración...${NC}"

cat > .env << EOF
NODE_ENV=production
APP_URL=${APP_URL}

DATABASE_URL=postgresql://limpiador:${DB_PASSWORD}@postgres:5432/limpiador?schema=public
TEST_DATABASE_URL=postgresql://limpiador:${DB_PASSWORD}@localhost:5433/limpiador_test?schema=public
REDIS_URL=redis://redis:6379
TEST_REDIS_URL=redis://localhost:6380

SESSION_SECRET=${SESSION_SECRET}
SESSION_COOKIE_NAME=limpiador_session
SESSION_TTL_SECONDS=604800

LOGIN_RATE_LIMIT_WINDOW_SECONDS=900
LOGIN_RATE_LIMIT_MAX=10
API_RATE_LIMIT_WINDOW_SECONDS=60
API_RATE_LIMIT_MAX=120

WHATSAPP_GRAPH_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=${WHATSAPP_PHONE_NUMBER_ID}
WHATSAPP_BUSINESS_ACCOUNT_ID=${WHATSAPP_BUSINESS_ACCOUNT_ID}
WHATSAPP_ACCESS_TOKEN=${WHATSAPP_ACCESS_TOKEN}
WHATSAPP_APP_SECRET=${WHATSAPP_APP_SECRET}
WHATSAPP_WEBHOOK_VERIFY_TOKEN=${WHATSAPP_WEBHOOK_VERIFY_TOKEN}

PRIVATE_MEDIA_ROOT=./media
PRIVATE_EXPORT_ROOT=./exports
MEDIA_MAX_BYTES=26214400

WHATSAPP_WINDOW_BYPASS=false
DB_PASSWORD=${DB_PASSWORD}
EOF

# ─── Construir y levantar ───
echo ""
echo -e "${GREEN}Construyendo imágenes Docker...${NC}"
docker compose up -d --build

# ─── Esperar a que la app esté lista ───
echo ""
echo -e "${YELLOW}Esperando a que la aplicación esté lista...${NC}"
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Aplicación lista${NC}"
    break
  fi
  sleep 5
done

# ─── Crear admin via API ───
echo ""
echo -e "${YELLOW}Creando usuario administrador...${NC}"
curl -s -X POST http://localhost:3000/api/dev/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" > /dev/null

echo -e "${GREEN}✓ Admin creado: ${ADMIN_EMAIL}${NC}"

# ─── Resumen ───
echo ""
echo -e "${GREEN}============================================="
echo "   ¡Instalación completada!"
echo -e "=============================================${NC}"
echo ""
echo "  URL:          ${APP_URL}/login"
echo "  Admin email:  ${ADMIN_EMAIL}"
echo "  Admin pass:   ${ADMIN_PASSWORD}"
echo ""
echo "  Configuraciones adicionales (SMTP, Drive, branding):"
echo "  → Entrá como admin y andá a Configuración"
echo ""
