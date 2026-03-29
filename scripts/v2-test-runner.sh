#!/usr/bin/env bash
# v2 test runner for SWE-Lancer monolith container.
# Launched by ts-bench --test-only --dataset v2 inside the Docker container.
# Mounted from host via: -v $PWD:/ts-bench-host:ro
# Invoked as: bash /ts-bench-host/scripts/v2-test-runner.sh
#
# The .patches/ directory is mounted read-write at /patches.
# ISSUE_ID must be set as an environment variable.

set -o pipefail

MITMDUMP=/opt/conda/envs/testbed/bin/mitmdump
LOG_DIR=/app/tests/logs/${ISSUE_ID}
mkdir -p "$LOG_DIR"

# Apply agent patch if available
if [ -f "/patches/${ISSUE_ID}.patch" ] && [ -s "/patches/${ISSUE_ID}.patch" ]; then
  git apply "/patches/${ISSUE_ID}.patch" && echo "Patch applied for $ISSUE_ID"
fi

# Install Chrome (not included in monolith image)
apt-get update -qq
wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
dpkg -i /tmp/chrome.deb 2>/dev/null
apt-get install -f -y -qq > /dev/null 2>&1

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
export DISPLAY=:99
sleep 2
fluxbox > /dev/null 2>&1 &
x11vnc -display :99 -forever -rfbport 5900 -noxdamage > /dev/null 2>&1 &
websockify --web=/usr/share/novnc/ 5901 localhost:5900 > /dev/null 2>&1 &

# /etc/hosts entries required by Expensify + Pusher
echo "127.0.0.1 ws-mt1.pusher.com" >> /etc/hosts
echo "127.0.0.1 dev.new.expensify.com" >> /etc/hosts

# Start Pusher-Fake (Ruby)
cd /app
rvm use 3.2.4 do \
  pusher-fake \
    --id "${PUSHER_APP_ID:-268df511a204fbb60884}" \
    --key "${PUSHER_APP_KEY:-268df511a204fbb60884}" \
    --secret "${PUSHER_APP_SECRET:-secret}" \
    --web-host 0.0.0.0 --web-port 57004 \
    --socket-host 0.0.0.0 --socket-port 57003 \
    --verbose > /dev/null 2>&1 &

# Start nginx (Pusher WebSocket SSL proxy)
nginx -g "daemon off;" > /dev/null 2>&1 &
sleep 2

# Generate mitmproxy CA certificate
# NOTE: /usr/local/bin/mitmdump is deleted by setup_expensify.yml's pip uninstall.
# /root/.local/bin/mitmdump is hidden by the CLI cache mount (-v cli:/root/.local).
# Use the conda testbed copy instead.
cd /app/expensify
nohup $MITMDUMP --mode regular --showhost > /tmp/mitmdump_setup.log 2>&1 &
MITM_SETUP_PID=$!
sleep 10
kill $MITM_SETUP_PID 2>/dev/null || true
wait $MITM_SETUP_PID 2>/dev/null || true

if [ ! -f /root/.mitmproxy/mitmproxy-ca-cert.pem ]; then
  echo "ERROR: mitmproxy CA cert not generated"
  cat /tmp/mitmdump_setup.log
  exit 1
fi

# Install CA cert to system + browser trust stores
mkdir -p /usr/local/share/ca-certificates/extra
cp /root/.mitmproxy/mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/extra/mitmproxy-ca-cert.crt
update-ca-certificates > /dev/null 2>&1
apt-get install -y -qq libnss3-tools > /dev/null 2>&1
certutil --empty-password -d sql:/root/.pki/nssdb -A -t "C,," \
  -n mitmproxy-ca-cert -i /root/.mitmproxy/mitmproxy-ca-cert.pem

# Recompile webpack (includes any applied patch changes)
unset NPM_CONFIG_PREFIX npm_config_prefix NPM_PREFIX
source /root/.nvm/nvm.sh
npx webpack --config ./config/webpack/webpack.dev.ts 2>&1 | tail -3

# Start Expensify dev server
bash -c "unset NPM_CONFIG_PREFIX npm_config_prefix NPM_PREFIX && source /root/.nvm/nvm.sh && nohup npm run web" \
  > "$LOG_DIR/npm_run_dev.log" 2>&1 &

# Start mitmdump replay proxy
cd /app/tests
nohup $MITMDUMP -s replay.py --ssl-insecure --quiet \
  > "$LOG_DIR/mitmdump.log" 2>&1 &

# Wait for dev server
for i in $(seq 1 120); do
  curl -sk https://127.0.0.1:8082 > /dev/null 2>&1 && break
  sleep 1
done

# Rewrite test file + start screen recording
python3.12 rewrite_test.py "issues/$ISSUE_ID/test.py" 2>/dev/null || true
mkdir -p "attempts/$ISSUE_ID"
nohup ffmpeg -y -f x11grab -video_size 1920x1080 -i :99 \
  -c:v libx264 -preset ultrafast -crf 18 -movflags +faststart \
  "attempts/$ISSUE_ID/output.mp4" > "$LOG_DIR/ffmpeg.log" 2>&1 &

# Run pytest
ISSUE_ID="$ISSUE_ID" pytest "issues/$ISSUE_ID/test.py" -v 2>&1 | tee "$LOG_DIR/pytest.log"
exit "${PIPESTATUS[0]}"
