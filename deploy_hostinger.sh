#!/bin/bash
# ============================================================
# SmileRender — Deploy Script for Hostinger VPS (Ubuntu 22.04)
# VPS: srv1626969.hstgr.cloud | 177.7.42.245
# Plan: KVM 2 (2 CPU, 8GB RAM, 100GB)
# ============================================================
set -e

echo "========================================="
echo "  SmileRender — VPS Deploy"
echo "========================================="

# 1. System updates & dependencies
echo "[1/7] Installing system dependencies..."
apt update && apt upgrade -y
apt install -y python3 python3-pip python3-venv python3-dev \
  git nginx certbot python3-certbot-nginx \
  build-essential libxrender1 libxext6 \
  libcairo2-dev pkg-config

# 2. Clone repository
echo "[2/7] Cloning SmileRender..."
cd /opt
if [ -d "SmileRender" ]; then
  cd SmileRender && git pull origin master
else
  git clone https://github.com/cShiraishi/SMILESRender.git SmileRender
  cd SmileRender
fi

# 3. Python virtual environment
echo "[3/7] Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate

# 4. Install Python packages
echo "[4/7] Installing Python packages (this may take 5-10 minutes)..."
pip install --upgrade pip setuptools wheel
pip install flask==3.0.3 waitress==3.0.1 python-dotenv==1.0.1
pip install numpy==2.1.3 pillow==11.0.0 pandas==2.2.3 openpyxl==3.1.5
pip install rdkit==2024.3.6
pip install celery==5.4.0 redis==5.2.1
pip install reportlab==4.4.10
pip install PepLink==0.1.0

# Install Torch CPU first to save space and avoid CUDA issues
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

pip install admet-ai chemprop
pip install scikit-learn==1.7.2

# Warm up ADMET-AI (downloads weights now so it doesn't timeout later)
echo "Warming up ADMET-AI models (downloading weights)..."
venv/bin/python -c "from admet_ai import ADMETModel; ADMETModel()"

# 5. Create systemd service
echo "[5/7] Creating systemd service..."
cat > /etc/systemd/system/smilerender.service << 'EOF'
[Unit]
Description=SmileRender - Molecular Intelligence Platform
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/SmileRender/src
ExecStart=/opt/SmileRender/venv/bin/python main.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
Environment=PORT=3000
Environment=THREADS=4

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable smilerender
systemctl restart smilerender

# 6. Configure Nginx reverse proxy
echo "[6/7] Configuring Nginx..."
cat > /etc/nginx/sites-available/smilerender << 'NGINX'
server {
    listen 80;
    server_name 177.7.42.245 srv1626969.hstgr.cloud;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Increased timeouts for docking
        proxy_read_timeout 600s;
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
    }

    location /static/ {
        alias /opt/SmileRender/src/static/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/smilerender /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

# 7. Firewall
echo "[7/7] Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "========================================="
echo "  ✅ SmileRender deployed successfully!"
echo "  URL: http://177.7.42.245"
echo "========================================="
echo ""
echo "Useful commands:"
echo "  systemctl status smilerender   — check status"
echo "  systemctl restart smilerender  — restart app"
echo "  journalctl -u smilerender -f   — view logs"
echo ""
echo "To add/renew SSL (both apex and www):"
echo "  certbot --nginx --expand -d smilesrender.com -d www.smilesrender.com"
echo ""
