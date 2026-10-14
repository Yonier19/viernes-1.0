@echo off
echo ==============================================
echo     INICIANDO ASISTENTE VIERNES (F.R.I.D.A.Y.)
echo ==============================================
echo.

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado en tu PC.
    echo Por favor descargalo gratis desde: https://nodejs.org/
    pause
    exit /b
)

if not exist "node_modules" (
    echo Instalando dependencias necesarias (esto solo toma un minuto)...
    call npm install
)

if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
    )
)

echo.
echo Iniciando Viernes en http://localhost:3000 ...
start http://localhost:3000
call npm run dev
pause
