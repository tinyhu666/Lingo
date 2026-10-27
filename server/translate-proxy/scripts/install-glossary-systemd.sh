#!/usr/bin/env bash
set -euo pipefail

target_dir="${1:?usage: install-glossary-systemd.sh TARGET_DIR}"
[[ "$target_dir" =~ ^/(opt|srv|home)/[A-Za-z0-9_./-]+$ ]] || { echo 'Unsupported target directory'; exit 1; }
[[ "$(id -u)" -eq 0 ]] || { echo 'Run this installer as root'; exit 1; }
node_path="$(command -v node)"
state_dir=/var/lib/lingo-glossary

install -d -m 0755 -o root -g root "$state_dir"
flock /run/lock/lingo-glossary.lock "$node_path" "$target_dir/scripts/maintain-glossary.mjs" --initialize "$target_dir" "$state_dir"
install -d -m 0755 /etc/systemd/system/lingo-translate-proxy.service.d
cat > /etc/systemd/system/lingo-translate-proxy.service.d/glossary.conf <<UNIT
[Service]
Environment=GLOSSARY_OFFICIAL_PATH=$state_dir/current/official.json
UNIT

cat > /etc/systemd/system/lingo-glossary-update.service <<UNIT
[Unit]
Description=Validate and activate Lingo official game glossary updates
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=$target_dir
Environment=NODE_ENV=production
ExecStart=/usr/bin/flock --nonblock --conflict-exit-code 75 /run/lock/lingo-glossary.lock $node_path $target_dir/scripts/maintain-glossary.mjs --update $target_dir $state_dir
ExecStopPost=/usr/bin/flock --nonblock --conflict-exit-code 75 /run/lock/lingo-glossary.lock $node_path $target_dir/scripts/maintain-glossary.mjs --recover $target_dir $state_dir
SuccessExitStatus=75
TimeoutStartSec=15min
TimeoutStopSec=180
UMask=0022
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=strict
ReadWritePaths=$state_dir /run/lock
InaccessiblePaths=-$target_dir/.env -$target_dir/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
RestrictSUIDSGID=true
MemoryMax=384M
TasksMax=96
UNIT

cat > /etc/systemd/system/lingo-glossary-update.timer <<'UNIT'
[Unit]
Description=Maintain the Lingo glossary every Monday at 10:00 Shanghai time

[Timer]
OnCalendar=Mon *-*-* 10:00:00 Asia/Shanghai
OnBootSec=2min
Persistent=true
AccuracySec=1min
Unit=lingo-glossary-update.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable lingo-glossary-update.timer
echo 'Glossary schedule installed. Restart the proxy and start lingo-glossary-update.timer after health checks.'
