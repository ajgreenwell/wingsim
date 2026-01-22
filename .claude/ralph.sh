#!/bin/bash

# ralph.sh - Automated Claude loop for implementing a plan
# Runs claude with a prompt file, then checks if implementation is complete

set -e

# Defaults
PLAN_PATH=""
PROMPT_FILE="@src/types/prompts.ts"
CLAUDE_PATH=$(which claude)
CLAUDE_CMD="${CLAUDE_CMD:-$CLAUDE_PATH}"
BACKGROUND=false

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --plan <path>       Path to the plan file to check completion for (required)"
    echo "  --prompt <path>     Path to the prompt file (default: @src/types/prompts.ts)"
    echo "  --background        Run claude in non-interactive mode (prints final result only)"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --plan PowerHandlersPlan.md"
    echo "  $0 --plan ./plans/MyPlan.md --prompt PROMPT.md"
    echo "  $0 --plan /path/to/plan.md --background"
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --plan)
            PLAN_PATH="$2"
            shift 2
            ;;
        --prompt)
            PROMPT_FILE="$2"
            shift 2
            ;;
        --background)
            BACKGROUND=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required arguments
if [[ -z "$PLAN_PATH" ]]; then
    echo "Error: Plan path is required (--plan)"
    usage
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed"
    exit 1
fi

# Check for claude
if [[ ! -x "$CLAUDE_CMD" ]]; then
    echo "Error: claude not found at $CLAUDE_CMD"
    echo "Set CLAUDE_CMD environment variable to the path of the claude binary"
    exit 1
fi

# Extract plan name from path for display
PLAN_NAME=$(basename "$PLAN_PATH")

CHECK_PROMPT="Has the plan in @${PLAN_PATH} been fully implemented? Look for checkboxes or other similar indicators of progress to make your decision."

CHECK_SCHEMA="{
  \"type\": \"object\",
  \"properties\": {
    \"complete\": {
      \"type\": \"boolean\",
      \"description\": \"Whether the plan in ${PLAN_PATH} has been fully implemented\"
    }
  },
  \"required\": [\"complete\"],
  \"additionalProperties\": false
}"

iteration=0

echo "========================================="
echo "Starting implementation loop"
echo "Plan: ${PLAN_PATH}"
echo "Prompt: ${PROMPT_FILE}"
echo "========================================="
echo ""

while true; do
    iteration=$((iteration + 1))
    echo "Iteration $iteration:"

    # Run claude with the prompt file
    if [[ "$BACKGROUND" == "true" ]]; then
        # Non-interactive mode: prints final result only
        "$CLAUDE_CMD" -p "$(cat "${PROMPT_FILE}")" --dangerously-skip-permissions
    else
        # Interactive mode: streams output as it works
        cat "${PROMPT_FILE}" | "$CLAUDE_CMD" --dangerously-skip-permissions
    fi
    
    echo "Iteration $iteration finished."
    echo "Checking if plan is complete..."

    # Ask claude if the plan is complete, using JSON schema constraint
    response=$("$CLAUDE_CMD" -p "$CHECK_PROMPT" --output-format json --json-schema "$CHECK_SCHEMA" --dangerously-skip-permissions)

    # Extract the complete field from the constrained JSON response
    complete=$(echo "$response" | jq -r '.structured_output.complete')

    if [[ "$complete" == "true" ]]; then
        echo ""
        echo "========================================="
        echo "${PLAN_NAME} implementation complete!"
        echo "Total iterations: $iteration"
        echo "========================================="
        break
    else
        echo "Plan is not complete. Continuing..."
    fi
done
