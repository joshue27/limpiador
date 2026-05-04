# =============================================
# Limpiador WhatsApp Cloud — Instalador Windows
# =============================================

Write-Host "=============================================" -ForegroundColor Green
Write-Host "   Limpiador WhatsApp Cloud — Instalador" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# ─── Paso 0: Verificar Docker ───
Write-Host "Paso 0: Verificando Docker..." -ForegroundColor Yellow
$dockerVersion = docker --version 2>$null
if ($dockerVersion) {
    Write-Host "✓ Docker ya está instalado ($dockerVersion)" -ForegroundColor Green
} else {
    Write-Host "✗ Docker no encontrado." -ForegroundColor Red
    Write-Host "Instalá Docker Desktop desde: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    Write-Host "Luego ejecutá este script de nuevo."
    exit 1
}

if (docker compose version 2>$null) {
    Write-Host "✓ Docker Compose disponible" -ForegroundColor Green
} else {
    Write-Host "✗ Docker Compose no encontrado. Asegurate de tener Docker Desktop actualizado." -ForegroundColor Red
    exit 1
}

Write-Host ""

# ─── Paso 1: DB ───
Write-Host "Paso 1/5: Configuración de base de datos" -ForegroundColor Yellow
$DB_PASSWORD = Read-Host "Contraseña de PostgreSQL [cambiar]"
if (-not $DB_PASSWORD) { $DB_PASSWORD = "cambiar" }

$APP_URL = Read-Host "URL pública de la app [http://localhost:3000]"
if (-not $APP_URL) { $APP_URL = "http://localhost:3000" }

# ─── Paso 2: WhatsApp ───
Write-Host ""
Write-Host "Paso 2/5: WhatsApp Cloud API" -ForegroundColor Yellow
$WHATSAPP_PHONE_NUMBER_ID = Read-Host "Phone Number ID"
$WHATSAPP_BUSINESS_ACCOUNT_ID = Read-Host "Business Account ID"
$WHATSAPP_ACCESS_TOKEN = Read-Host "Access Token"
$WHATSAPP_APP_SECRET = Read-Host "App Secret"
$WHATSAPP_WEBHOOK_VERIFY_TOKEN = Read-Host "Webhook Verify Token [limpiador-webhook]"
if (-not $WHATSAPP_WEBHOOK_VERIFY_TOKEN) { $WHATSAPP_WEBHOOK_VERIFY_TOKEN = "limpiador-webhook" }

# ─── Paso 3: Seguridad ───
Write-Host ""
Write-Host "Paso 3/5: Seguridad" -ForegroundColor Yellow
$SESSION_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
Write-Host "Session secret generado: $($SESSION_SECRET.Substring(0,20))..."

# ─── Paso 4: Admin ───
Write-Host ""
Write-Host "Paso 4/5: Usuario administrador" -ForegroundColor Yellow
$ADMIN_NAME = Read-Host "Nombre del admin [Administrador]"
if (-not $ADMIN_NAME) { $ADMIN_NAME = "Administrador" }
$ADMIN_EMAIL = Read-Host "Email del admin [admin@limpiador.local]"
if (-not $ADMIN_EMAIL) { $ADMIN_EMAIL = "admin@limpiador.local" }
$ADMIN_PASSWORD = Read-Host "Contraseña [Admin12345678!]" -AsSecureString
$ADMIN_PASSWORD_PLAIN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ADMIN_PASSWORD))
if (-not $ADMIN_PASSWORD_PLAIN) { $ADMIN_PASSWORD_PLAIN = "Admin12345678!" }

# ─── Paso 5: Crear .env ───
Write-Host ""
Write-Host "Paso 5/5: Generando .env..." -ForegroundColor Yellow

$envContent = @"
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
"@

$envContent | Out-File -FilePath .env -Encoding utf8

# ─── Construir y levantar ───
Write-Host ""
Write-Host "Construyendo imágenes Docker..." -ForegroundColor Green
docker compose up -d --build

# ─── Esperar ───
Write-Host "Esperando a que la app esté lista..." -ForegroundColor Yellow
for ($i = 1; $i -le 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) {
            Write-Host "✓ Aplicación lista" -ForegroundColor Green
            break
        }
    } catch { }
    Start-Sleep -Seconds 5
}

# ─── Crear admin ───
Write-Host ""
Write-Host "Creando usuario administrador..." -ForegroundColor Yellow
$body = "{`"email`":`"$ADMIN_EMAIL`",`"password`":`"$ADMIN_PASSWORD_PLAIN`"}"
Invoke-RestMethod -Uri "http://localhost:3000/api/dev/bootstrap-admin" -Method POST -ContentType "application/json" -Body $body | Out-Null

Write-Host "✓ Admin creado: $ADMIN_EMAIL" -ForegroundColor Green

# ─── Resumen ───
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "   ¡Instalación completada!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL:          $APP_URL/login"
Write-Host "  Admin email:  $ADMIN_EMAIL"
Write-Host "  Admin pass:   $ADMIN_PASSWORD_PLAIN"
Write-Host ""
Write-Host "  Configuraciones adicionales (SMTP, Drive, branding):"
Write-Host "  → Entrá como admin y andá a Configuración"
Write-Host ""
