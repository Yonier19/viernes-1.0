#!/usr/bin/env bash

echo "=============================================="
echo "    INICIANDO ASISTENTE VIERNES (F.R.I.D.A.Y.)"
echo "=============================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js no está instalado."
    echo "Por favor descárgalo desde: https://nodejs.org/"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias necesarias..."
    npm install
fi

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
fi

echo ""
echo "Iniciando Viernes en http://localhost:3000 ..."

# Abrir navegador según el sistema operativo
if which xdg-open > /dev/null; then
    xdg-open "http://localhost:3000" &
elif which open > /dev/null; then
    open "http://localhost:3000" &
fi

npm run dev
