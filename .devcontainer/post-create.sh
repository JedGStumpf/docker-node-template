#!/bin/sh
set -e

echo "=== Installing pipx and CLASI ==="
pip install --user pipx
pipx ensurepath
pipx install git+https://github.com/ericbusboom/claude-agent-skills.git

echo "=== Installing age ==="
# age is needed for SOPS secret decryption
AGE_VERSION="1.2.0"
curl -sLO "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-amd64.tar.gz"
tar -xzf "age-v${AGE_VERSION}-linux-amd64.tar.gz"
sudo mv age/age age/age-keygen /usr/local/bin/
rm -rf age "age-v${AGE_VERSION}-linux-amd64.tar.gz"

echo "=== Installing project dependencies ==="
npm ci
cd server && npm ci && cd ..
cd client && npm ci && cd ..

echo "=== Initializing CLASI ==="
export PATH="$HOME/.local/bin:$PATH"
clasi init || echo "CLASI init skipped (may already be initialized)"

echo "=== Done ==="
