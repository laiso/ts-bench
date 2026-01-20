#!/bin/bash
# Native SWE-Lancer E2E Test Runner
# Usage: ./scripts/native-swelancer-test.sh <issue_id>

set -e

ISSUE_ID="${1:-}"
if [ -z "$ISSUE_ID" ]; then
    echo "Usage: $0 <issue_id>"
    echo "Example: $0 16912_4"
    exit 1
fi

# Paths
TS_BENCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SWELANCER_DIR="$TS_BENCH_DIR/repos/frontier-evals/project/swelancer"
EXPENSIFY_DIR="$TS_BENCH_DIR/repos/expensify-app"
ISSUES_DIR="$SWELANCER_DIR/issues"
RUNTIME_SCRIPTS="$SWELANCER_DIR/runtime_scripts"
VENV="$SWELANCER_DIR/.venv"

# Set up Node.js (use direct path to avoid nvm slow auto-detect)
export NVM_DIR="/.sprite/languages/node/nvm"
export PATH="$NVM_DIR/versions/node/v20.15.1/bin:$PATH"

# Export ISSUE_ID for replay.py
export ISSUE_ID="$ISSUE_ID"

# Cleanup function
cleanup_processes() {
    echo "Cleaning up stale processes..."
    pkill -f "webpack" 2>/dev/null || true
    pkill -f "mitmdump" 2>/dev/null || true
    pkill -f "node.*web" 2>/dev/null || true
    pkill -f "proxy.ts" 2>/dev/null || true
    sleep 2
}

# Function to check if port is listening using ss
port_listening() {
    ss -tlnp 2>/dev/null | grep -q ":$1 " && return 0 || return 1
}

# Clean up before starting
cleanup_processes

# Check if issue exists
if [ ! -d "$ISSUES_DIR/$ISSUE_ID" ]; then
    echo "Error: Issue $ISSUE_ID not found in $ISSUES_DIR"
    exit 1
fi

echo "=== Setting up SWE-Lancer E2E test for issue: $ISSUE_ID ==="

# Get commit ID
COMMIT_ID=$(cat "$ISSUES_DIR/$ISSUE_ID/commit_id.txt" | tr -d '\n')
echo "Commit ID: $COMMIT_ID"

# Checkout the commit
cd "$EXPENSIFY_DIR"
echo "Checking out commit $COMMIT_ID..."
git reset --hard "$COMMIT_ID"
git submodule update --init --recursive 2>/dev/null || true

# Check Node version
echo "Using Node $(node --version) and npm $(npm --version)"

# Apply bug reintroduce patch if exists and non-empty
PATCH_FILE="$ISSUES_DIR/$ISSUE_ID/bug_reintroduce.patch"
if [ -f "$PATCH_FILE" ] && [ -s "$PATCH_FILE" ]; then
    echo "Applying bug reintroduce patch..."
    git apply "$PATCH_FILE" || echo "Patch already applied or failed (continuing)"
fi

# Generate SSL certificates if missing (git reset may remove them)
if [ ! -f "config/webpack/key.pem" ] || [ ! -f "config/webpack/certificate.pem" ]; then
    echo "Generating SSL certificates..."
    openssl req -x509 -newkey rsa:2048 -keyout config/webpack/key.pem -out config/webpack/certificate.pem -days 365 -nodes -subj "/CN=dev.new.expensify.com" 2>/dev/null
fi

# Install dependencies (only if needed)
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "Installing npm dependencies..."
    npm install --legacy-peer-deps 2>&1 | tail -30
    if [ ! -d "node_modules" ]; then
        echo "ERROR: npm install failed - node_modules not found"
        exit 1
    fi
else
    echo "node_modules already exists, skipping npm install"
fi
echo "Dependencies ready"

# Build webpack (skip - let npm run web handle it)
echo "Skipping standalone webpack build (npm run web will handle it)"

# Create logs directory
mkdir -p "$SWELANCER_DIR/logs/$ISSUE_ID"

# Add hosts entry for dev.new.expensify.com
if ! grep -q "dev.new.expensify.com" /etc/hosts; then
    echo "Adding dev.new.expensify.com to /etc/hosts..."
    echo "127.0.0.1 dev.new.expensify.com" | sudo tee -a /etc/hosts
fi

# Start dev server in background
echo "Starting Expensify dev server..."
npm run web > "$SWELANCER_DIR/logs/$ISSUE_ID/npm_run_web.log" 2>&1 &
NPM_PID=$!
echo "Dev server PID: $NPM_PID"
echo "Check logs at: $SWELANCER_DIR/logs/$ISSUE_ID/npm_run_web.log"

# Start mitmproxy with replay script
echo "Starting mitmproxy..."
cd "$SWELANCER_DIR"
"$VENV/bin/mitmdump" -s runtime_scripts/replay.py --ssl-insecure --quiet > "$SWELANCER_DIR/logs/$ISSUE_ID/mitmdump.log" 2>&1 &
MITM_PID=$!
echo "mitmproxy PID: $MITM_PID"

# Wait for services to start (webpack can take 6+ minutes to compile)
echo "Waiting for services to start (this may take 6-10 minutes for webpack compilation)..."
for i in {1..300}; do
    # Check mitmproxy (port 8080)
    if port_listening 8080; then
        MITM_OK="UP"
    else
        MITM_OK="DOWN"
    fi

    # Check web server (port 8082) AND proxy (port 9000)
    if port_listening 8082 && port_listening 9000; then
        WEB_OK="UP"
    else
        WEB_OK="DOWN"
    fi

    if [ "$MITM_OK" = "UP" ] && [ "$WEB_OK" = "UP" ]; then
        echo "Services are ready! (mitmproxy: $MITM_OK, web: $WEB_OK)"
        echo "Waiting 10 more seconds for webpack to fully stabilize..."
        sleep 10
        break
    fi
    if [ $((i % 15)) -eq 0 ]; then
        echo "Waiting... (attempt $i/300, elapsed: $((i*2))s, mitm: $MITM_OK, web: $WEB_OK)"
    fi
    sleep 2
done

# Check if services actually started
if [ "$MITM_OK" != "UP" ] || [ "$WEB_OK" != "UP" ]; then
    echo "ERROR: Services failed to start within timeout"
    echo "Check logs: $SWELANCER_DIR/logs/$ISSUE_ID/"
    cleanup_processes
    exit 1
fi

# Run tests
echo "Running pytest..."
cd "$SWELANCER_DIR"
"$VENV/bin/pytest" "issues/$ISSUE_ID/test.py" -v 2>&1 | tee "$SWELANCER_DIR/logs/$ISSUE_ID/pytest.log"
TEST_EXIT_CODE=${PIPESTATUS[0]}

# Cleanup
echo "Cleaning up..."
kill $NPM_PID 2>/dev/null || true
kill $MITM_PID 2>/dev/null || true
cleanup_processes

echo "=== Test completed with exit code: $TEST_EXIT_CODE ==="
exit $TEST_EXIT_CODE
