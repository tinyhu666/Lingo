#!/usr/bin/env bash

set -euo pipefail

target_dir="${1:?usage: install-systemd.sh TARGET_DIR}"
service_name="lingo-translate-proxy"
service_user="lingo-translate"
service_group="$service_user"

case "$target_dir" in
  /opt/*|/srv/*|/home/*) ;;
  *)
    echo "Refusing unsafe target directory: $target_dir"
    exit 1
    ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  elevate=()
else
  elevate=(sudo -n)
fi

node_path="$(command -v node)"
if [ -z "$node_path" ]; then
  echo "Node.js is required on the target server."
  exit 1
fi

if ! getent group "$service_group" >/dev/null; then
  "${elevate[@]}" groupadd --system "$service_group"
fi
if ! getent passwd "$service_user" >/dev/null; then
  "${elevate[@]}" useradd \
    --system \
    --gid "$service_group" \
    --home-dir "$target_dir" \
    --shell /usr/sbin/nologin \
    "$service_user"
fi

cd "$target_dir"
npm ci --omit=dev

"${elevate[@]}" install -d -m 0750 -o "$service_user" -g "$service_group" "$target_dir/data"
"${elevate[@]}" chown -R "$service_user:$service_group" "$target_dir/data"
"${elevate[@]}" chown root:"$service_group" "$target_dir/.env"
"${elevate[@]}" chmod 0640 "$target_dir/.env"

unit_file="$(mktemp)"
trap 'rm -f "$unit_file"' EXIT
cat > "$unit_file" <<UNIT
[Unit]
Description=Lingo Translation Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
Group=$service_group
WorkingDirectory=$target_dir
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
EnvironmentFile=$target_dir/.env
ExecStart=$node_path $target_dir/src/server.mjs
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=strict
ReadWritePaths=$target_dir/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
RestrictSUIDSGID=true
MemoryMax=256M
TasksMax=96

[Install]
WantedBy=multi-user.target
UNIT

"${elevate[@]}" install -m 0644 "$unit_file" "/etc/systemd/system/$service_name.service"
"${elevate[@]}" systemctl daemon-reload
"${elevate[@]}" systemctl enable "$service_name.service"
"${elevate[@]}" systemctl restart "$service_name.service"

for attempt in {1..20}; do
  if curl -fsS http://127.0.0.1:8787/healthz; then
    exit 0
  fi
  sleep 1
done

"${elevate[@]}" systemctl status "$service_name.service" --no-pager
exit 1
