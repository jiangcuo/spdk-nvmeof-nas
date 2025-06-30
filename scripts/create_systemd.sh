#!/bin/bash

SCRIPT_PATH=$(cd $(dirname $0); pwd)
PROJECT_PATH=$(dirname $SCRIPT_PATH)

cat <<EOF > /etc/systemd/system/spdk-nas-manager.service
[Unit]
Description=SPDK NAS Manager
After=network.target

[Service]
WorkingDirectory=$PROJECT_PATH
ExecStart=npm run start
Restart=always
RestartSec=10
User=root
Group=root
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable spdk-nas-manager
sudo systemctl start spdk-nas-manager





