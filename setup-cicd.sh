#!/bin/bash

# Configuration - Update these or pass as environment variables
PROJECT_NAME="pbxscribe-api-backend"
ENV="dev" # or prod
GITHUB_REPO="digicom-dts/pbxscribe"
STACK_NAME="${PROJECT_NAME}-${ENV}-github-oidc"

echo "Step 1: Deploying CloudFormation stack..."
aws cloudformation deploy \
  --template-file infra/github-oidc.yml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ProjectName="$PROJECT_NAME" \
    Environment="$ENV" \
    GitHubOrg="${GITHUB_REPO%/*}" \
    GitHubRepo="${GITHUB_REPO#*/}"

echo "Step 2: Retrieving DeployRoleArn from stack outputs..."
ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" \
  --output text)

if [ -z "$ROLE_ARN" ]; then
  echo "Error: Could not retrieve Role ARN from stack."
  exit 1
fi

echo "Step 3: Storing secret in GitHub Environment: $ENV"
# Note: This requires the GitHub CLI (gh) to be authenticated
gh secret set AWS_DEPLOY_ROLE_ARN \
  --body "$ROLE_ARN" \
  --repo "$GITHUB_REPO" \
  --env "$ENV"

echo "Done! GitHub Actions can now assume the role in the '$ENV' environment."