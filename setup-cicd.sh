#!/bin/bash
set -euo pipefail

# Configuration - Update these or pass as environment variables
PROJECT_NAME="pbxscribe-api-backend"
ENV="${ENV:-dev}" # or prod — override with: ENV="prod" bash setup-cicd.sh
GITHUB_REPO="digicom-technology-solutions/pbxscribe"
STACK_NAME="${PROJECT_NAME}-${ENV}-github-oidc"

echo "Step 1: Deploying CloudFormation stack ($STACK_NAME)..."

# If the stack is in ROLLBACK_COMPLETE it cannot be updated — delete and recreate
STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].StackStatus" \
  --output text 2>/dev/null || echo "DOES_NOT_EXIST")

if [ "$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then
  echo "  Stack is in ROLLBACK_COMPLETE — deleting before redeploy..."
  aws cloudformation delete-stack --stack-name "$STACK_NAME"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME"
  echo "  Stack deleted."
fi

# If the GitHub OIDC provider already exists in this account (e.g. created by another env),
# pass CreateOIDCProvider=false so we don't try to create a duplicate.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" &>/dev/null; then
  CREATE_OIDC="false"
else
  CREATE_OIDC="true"
fi
echo "  OIDC provider exists: $CREATE_OIDC == false → CreateOIDCProvider=$CREATE_OIDC"

aws cloudformation deploy \
  --template-file infra/foundation/github-oidc.yml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ProjectName="$PROJECT_NAME" \
    Environment="$ENV" \
    GitHubOrg="${GITHUB_REPO%/*}" \
    GitHubRepo="${GITHUB_REPO#*/}" \
    CreateOIDCProvider="$CREATE_OIDC"

echo "Step 2: Retrieving DeployRoleArn from stack outputs..."
ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" \
  --output text)

if [ -z "$ROLE_ARN" ]; then
  echo "Error: Could not retrieve Role ARN from stack."
  exit 1
fi

echo "  Role ARN: $ROLE_ARN"

echo "Step 3: Storing secret in GitHub Environment: $ENV"
gh secret set AWS_DEPLOY_ROLE_ARN \
  --body "$ROLE_ARN" \
  --repo "$GITHUB_REPO" \
  --env "$ENV"

echo "Done! GitHub Actions can now assume the role in the '$ENV' environment."
