#!/bin/bash
set -e

# AgentLens — Deploy a single agent to AWS
# Usage: ./infra/deploy-agent.sh --agent-id my-agent --agent-name "My Agent" --trigger webhook --proxy-url https://...
#
# Required flags:
#   --agent-id      Unique agent identifier (lowercase, hyphens)
#   --agent-name    Human-readable agent name
#   --trigger       Trigger type: webhook | cron | manual
#   --proxy-url     AgentLens proxy endpoint URL
#
# Optional flags:
#   --cron-schedule  Cron expression (required if --trigger=cron), e.g. "rate(1 hour)"
#   --openai-key     OpenAI API key (defaults to $OPENAI_API_KEY env var)
#   --region         AWS region (defaults to $AWS_REGION or us-east-1)
#   --no-memory      Disable memory table
#   --no-checkpoint  Disable checkpoint table

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
REGION="${AWS_REGION:-us-east-1}"
OPENAI_KEY="${OPENAI_API_KEY:-}"
MEMORY_ENABLED="true"
CHECKPOINT_ENABLED="true"
CRON_SCHEDULE=""
AGENT_ID=""
AGENT_NAME=""
TRIGGER_TYPE=""
PROXY_URL=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-id)      AGENT_ID="$2";       shift 2 ;;
    --agent-name)    AGENT_NAME="$2";     shift 2 ;;
    --trigger)       TRIGGER_TYPE="$2";   shift 2 ;;
    --proxy-url)     PROXY_URL="$2";      shift 2 ;;
    --cron-schedule) CRON_SCHEDULE="$2";  shift 2 ;;
    --openai-key)    OPENAI_KEY="$2";     shift 2 ;;
    --region)        REGION="$2";         shift 2 ;;
    --no-memory)     MEMORY_ENABLED="false"; shift ;;
    --no-checkpoint) CHECKPOINT_ENABLED="false"; shift ;;
    *)
      echo "ERROR: Unknown flag: $1"
      exit 1
      ;;
  esac
done

# Validate required args
if [ -z "$AGENT_ID" ]; then
  echo "ERROR: --agent-id is required"
  exit 1
fi
if [ -z "$AGENT_NAME" ]; then
  echo "ERROR: --agent-name is required"
  exit 1
fi
if [ -z "$TRIGGER_TYPE" ]; then
  echo "ERROR: --trigger is required (webhook | cron | manual)"
  exit 1
fi
if [ -z "$PROXY_URL" ]; then
  echo "ERROR: --proxy-url is required"
  exit 1
fi
if [ -z "$OPENAI_KEY" ]; then
  echo "ERROR: OpenAI API key required. Use --openai-key or set OPENAI_API_KEY env var."
  exit 1
fi
if [ "$TRIGGER_TYPE" = "cron" ] && [ -z "$CRON_SCHEDULE" ]; then
  echo "ERROR: --cron-schedule is required when --trigger=cron"
  exit 1
fi

STACK_NAME="agentlens-agent-${AGENT_ID}"

echo ""
echo "AgentLens Agent Deploy"
echo "------------------------------------"
echo "  Agent:   $AGENT_NAME ($AGENT_ID)"
echo "  Trigger: $TRIGGER_TYPE"
echo "  Region:  $REGION"
echo "  Stack:   $STACK_NAME"
echo "------------------------------------"
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
  echo "ERROR: aws CLI not found. Install: https://aws.amazon.com/cli/"
  exit 1
fi

# Step 1: Get the deploy bucket from the main AgentLens stack
echo "[1/4] Looking up deploy bucket..."

# Find the main AgentLens stack to get the deploy bucket
DEPLOY_BUCKET=$(aws cloudformation describe-stacks \
  --region "$REGION" \
  --query "Stacks[?contains(StackName,'agentlens')].Outputs[?OutputKey=='AgentDeployBucket'].OutputValue | [0]" \
  --output text 2>/dev/null || echo "")

if [ -z "$DEPLOY_BUCKET" ] || [ "$DEPLOY_BUCKET" = "None" ]; then
  # Fallback: construct bucket name from account ID
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  DEPLOY_BUCKET="agentlens-agent-deploy-${ACCOUNT_ID}"
  echo "  No AgentDeployBucket output found. Using: $DEPLOY_BUCKET"

  # Create bucket if it doesn't exist
  if ! aws s3 ls "s3://$DEPLOY_BUCKET" --region "$REGION" 2>/dev/null; then
    echo "  Creating deploy bucket: $DEPLOY_BUCKET"
    aws s3 mb "s3://$DEPLOY_BUCKET" --region "$REGION"
  fi
fi
echo "  Bucket: $DEPLOY_BUCKET"

# Step 2: Package agent runtime code
echo "[2/4] Packaging agent runtime..."

RUNTIME_DIR="$PROJECT_DIR/agent-runtime"
if [ ! -d "$RUNTIME_DIR" ]; then
  echo "ERROR: agent-runtime/ directory not found at $RUNTIME_DIR"
  exit 1
fi

ZIP_FILE="/tmp/agentlens-agent-${AGENT_ID}-runtime.zip"
S3_KEY="agents/${AGENT_ID}/runtime.zip"

cd "$RUNTIME_DIR"
zip -q -r "$ZIP_FILE" . -x '*.git*' 'node_modules/*' '*.test.*' '__tests__/*'
echo "  Packaged: $(du -h "$ZIP_FILE" | cut -f1)"

# Step 3: Upload to S3
echo "[3/4] Uploading runtime to S3..."
aws s3 cp "$ZIP_FILE" "s3://${DEPLOY_BUCKET}/${S3_KEY}" --region "$REGION" --quiet
echo "  Uploaded: s3://${DEPLOY_BUCKET}/${S3_KEY}"
rm -f "$ZIP_FILE"

# Step 4: Deploy CloudFormation stack
echo "[4/4] Deploying CloudFormation stack..."

PARAMS="AgentId=${AGENT_ID}"
PARAMS="${PARAMS} AgentName=${AGENT_NAME}"
PARAMS="${PARAMS} ProxyEndpoint=${PROXY_URL}"
PARAMS="${PARAMS} TriggerType=${TRIGGER_TYPE}"
PARAMS="${PARAMS} OpenAIApiKey=${OPENAI_KEY}"
PARAMS="${PARAMS} RuntimeCodeS3Bucket=${DEPLOY_BUCKET}"
PARAMS="${PARAMS} RuntimeCodeS3Key=${S3_KEY}"
PARAMS="${PARAMS} MemoryEnabled=${MEMORY_ENABLED}"
PARAMS="${PARAMS} CheckpointEnabled=${CHECKPOINT_ENABLED}"

if [ -n "$CRON_SCHEDULE" ]; then
  PARAMS="${PARAMS} CronSchedule=${CRON_SCHEDULE}"
fi

aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/agent-template.yaml" \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides $PARAMS \
  --no-fail-on-empty-changeset

# Get outputs
AGENT_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AgentArn'].OutputValue" \
  --output text)

AGENT_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AgentEndpoint'].OutputValue" \
  --output text)

echo ""
echo "------------------------------------"
echo "Agent Deployed Successfully"
echo "------------------------------------"
echo ""
echo "  Agent ID:  $AGENT_ID"
echo "  ARN:       $AGENT_ARN"
echo "  Endpoint:  $AGENT_ENDPOINT"
echo "  Proxy:     $PROXY_URL"
echo ""
echo "  Stack:     $STACK_NAME"
echo "  Region:    $REGION"
echo ""

if [ "$TRIGGER_TYPE" = "webhook" ]; then
  echo "  Test with:"
  echo "  curl -X POST $AGENT_ENDPOINT -H 'Content-Type: application/json' -d '{\"test\":true}'"
  echo ""
fi

echo "  To tear down:"
echo "  aws cloudformation delete-stack --stack-name $STACK_NAME --region $REGION"
echo ""
