#!/usr/bin/env bash
set -euo pipefail

# AgentLens — Build, package, and upload for one-click CloudFormation deployment
# Usage: ./publish.sh --bucket=my-artifact-bucket

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BUCKET=""
for arg in "$@"; do
  case $arg in
    --bucket=*) BUCKET="${arg#*=}" ;;
    *) echo -e "${RED}Unknown arg: $arg${NC}"; exit 1 ;;
  esac
done

if [ -z "$BUCKET" ]; then
  echo -e "${RED}Error: --bucket=BUCKET_NAME is required${NC}"
  echo "Usage: ./publish.sh --bucket=my-artifact-bucket"
  exit 1
fi

# --- Prerequisites ---
echo -e "${CYAN}[prereq]${NC} Checking prerequisites..."
for cmd in aws node npm zip; do
  if ! command -v $cmd &>/dev/null; then
    echo -e "${RED}Missing: $cmd${NC}"; exit 1
  fi
done
echo -e "${GREEN}  All prerequisites found.${NC}"

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST"

# ============================================================
# Step 1: Build proxy.zip
# ============================================================
echo -e "\n${BOLD}[1/4] Building proxy.zip${NC}"

PROXY_TMP=$(mktemp -d)
trap "rm -rf $PROXY_TMP" EXIT

# Copy proxy source
cp -r "$ROOT/proxy/src/"* "$PROXY_TMP/"

# Create a minimal package.json with only production deps
node -e "
  const pkg = require('$ROOT/package.json');
  const prod = { ...pkg.dependencies };
  // Remove local file: deps that won't resolve in Lambda
  Object.keys(prod).forEach(k => { if (prod[k].startsWith('file:')) delete prod[k]; });
  const mini = { name: pkg.name, version: pkg.version, dependencies: prod };
  require('fs').writeFileSync('$PROXY_TMP/package.json', JSON.stringify(mini, null, 2));
"

# Install production deps
(cd "$PROXY_TMP" && npm install --production --no-audit --no-fund --silent 2>&1 | tail -1)

# Zip
(cd "$PROXY_TMP" && zip -qr "$DIST/proxy.zip" .)
PROXY_SIZE=$(du -h "$DIST/proxy.zip" | cut -f1)
echo -e "${GREEN}  proxy.zip ($PROXY_SIZE)${NC}"

# ============================================================
# Step 2: Build dashboard.zip
# ============================================================
echo -e "\n${BOLD}[2/4] Building dashboard${NC}"

# Build with placeholder — CloudFormation custom resource rewrites API_BASE
# to the actual proxy URL after stack creation.
(cd "$ROOT/dashboard" && REACT_APP_API_BASE="__AGENTLENS_API_BASE__" npm run build --silent 2>&1 | tail -3)

(cd "$ROOT/dashboard" && zip -qr "$DIST/dashboard.zip" build/)
DASH_SIZE=$(du -h "$DIST/dashboard.zip" | cut -f1)
echo -e "${GREEN}  dashboard.zip ($DASH_SIZE)${NC}"

# Copy CloudFormation template
cp "$ROOT/infra/template.yaml" "$DIST/cloudformation.yaml"

# ============================================================
# Step 3: Upload to S3
# ============================================================
echo -e "\n${BOLD}[3/4] Uploading to s3://$BUCKET/agentlens/${NC}"

aws s3 cp "$DIST/proxy.zip"          "s3://$BUCKET/agentlens/proxy.zip"       --quiet
aws s3 cp "$DIST/dashboard.zip"      "s3://$BUCKET/agentlens/dashboard.zip"   --quiet
aws s3 cp "$DIST/cloudformation.yaml" "s3://$BUCKET/agentlens/cloudformation.yaml" --quiet

echo -e "${GREEN}  3 artifacts uploaded.${NC}"

# ============================================================
# Step 4: Generate Launch Stack URL
# ============================================================
TEMPLATE_URL="https://${BUCKET}.s3.amazonaws.com/agentlens/cloudformation.yaml"
LAUNCH_URL="https://console.aws.amazon.com/cloudformation/home#/stacks/create/review"
LAUNCH_URL+="?templateURL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TEMPLATE_URL', safe=''))")"
LAUNCH_URL+="&stackName=agentlens"
LAUNCH_URL+="&param_ArtifactBucket=$BUCKET"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  AgentLens — One-Click Deploy                              ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}                                                              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${GREEN}Launch Stack URL:${NC}                                          ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                              ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}$LAUNCH_URL${NC}"
echo ""
echo -e "Artifacts on S3:"
echo -e "  s3://$BUCKET/agentlens/proxy.zip"
echo -e "  s3://$BUCKET/agentlens/dashboard.zip"
echo -e "  s3://$BUCKET/agentlens/cloudformation.yaml"
echo ""
echo -e "${GREEN}Done.${NC} Paste the URL above into your browser to deploy."
