#!/bin/bash
set -e

# AgentLens — One-click deploy to AWS
# Usage: ./infra/deploy.sh [stack-name] [openai-api-key]

STACK_NAME="${1:-agentlens}"
OPENAI_KEY="${2:-$OPENAI_API_KEY}"
REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "⚡ AgentLens Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Stack:  $STACK_NAME"
echo "  Region: $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
  echo "ERROR: aws CLI not found. Install: https://aws.amazon.com/cli/"
  exit 1
fi

if ! command -v sam &> /dev/null; then
  echo "ERROR: SAM CLI not found. Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
  exit 1
fi

if [ -z "$OPENAI_KEY" ]; then
  echo "ERROR: OpenAI API key required."
  echo "  Usage: ./infra/deploy.sh [stack-name] [openai-api-key]"
  echo "  Or set OPENAI_API_KEY environment variable."
  exit 1
fi

# Step 1: Build dashboard
echo "[1/4] Building dashboard..."
cd "$PROJECT_DIR/dashboard"
REACT_APP_API_BASE="" npx react-scripts build --silent 2>/dev/null || npx react-scripts build
echo "  ✓ Dashboard built"

# Step 2: SAM build
echo "[2/4] Packaging Lambda..."
cd "$PROJECT_DIR"
sam build \
  --template-file infra/template.yaml \
  --use-container \
  --build-dir .aws-sam/build \
  2>&1 | grep -E '(Build|Error|Warning)' || true
echo "  ✓ Lambda packaged"

# Step 3: SAM deploy
echo "[3/4] Deploying stack to AWS..."
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    OpenAIApiKey="$OPENAI_KEY" \
    DefaultRPM=60 \
    CacheTTLHours=24 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  2>&1 | tail -20

# Step 4: Upload dashboard to S3
echo "[4/4] Deploying dashboard..."
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardBucketName'].OutputValue" \
  --output text)

PROXY_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ProxyEndpoint'].OutputValue" \
  --output text)

DASHBOARD_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DashboardUrl'].OutputValue" \
  --output text)

# Rebuild dashboard with correct API base
cd "$PROJECT_DIR/dashboard"
REACT_APP_API_BASE="$PROXY_URL" npx react-scripts build --silent 2>/dev/null || REACT_APP_API_BASE="$PROXY_URL" npx react-scripts build

aws s3 sync build/ "s3://$BUCKET/" --delete --region "$REGION" --quiet
echo "  ✓ Dashboard deployed"

# Done
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ AgentLens is LIVE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Proxy:     $PROXY_URL"
echo "  Dashboard: $DASHBOARD_URL"
echo ""
echo "  Quick start:"
echo "  1. Set OPENAI_BASE_URL=$PROXY_URL"
echo "  2. Add x-agent-id header to each agent"
echo "  3. Open $DASHBOARD_URL"
echo ""
echo "  To tear down: aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION"
echo ""
