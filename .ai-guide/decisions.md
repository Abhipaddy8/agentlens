# Decisions Log — AgentLens

### 2026-03-10 Decision: Use Node.js for proxy / Reason: OpenAI SDK is Node-native, Lambda has first-class Node support, matches team skills
### 2026-03-10 Decision: DynamoDB over Postgres / Reason: Serverless, scales with Lambda, sub-100ms reads, no connection pooling needed, pay-per-request
### 2026-03-10 Decision: React for dashboard / Reason: Fastest path to 5 screens, massive ecosystem, deploys to S3+CloudFront trivially
### 2026-03-10 Decision: CloudFormation over Terraform / Reason: Native AWS, customers click one link in AWS console, no external tooling required
### 2026-03-10 Decision: Monorepo structure (proxy/ dashboard/ infra/ demo/) / Reason: Single repo for all components, simpler CI, one git history
### 2026-03-10 Decision: OpenAI-compatible endpoint only (v1) / Reason: 80%+ of enterprise LLM spend is OpenAI. Anthropic/others come after first customer.
