#!/bin/bash

echo "🚀 Iniciando Deploy do SMILESRender no VPS..."

# 1. Parar containers antigos
docker compose down

# 2. Build e Start (Build das IAs e do Frontend)
echo "📦 Construindo containers (isso pode demorar alguns minutos)..."
docker compose up --build -d

# 3. Limpar imagens antigas para economizar espaço no VPS
docker image prune -f

echo "✅ Deploy concluído com sucesso!"
echo "🌐 O servidor está rodando na porta 80/443 via Nginx."
echo "🔍 Use 'docker compose logs -f' para acompanhar o status."
