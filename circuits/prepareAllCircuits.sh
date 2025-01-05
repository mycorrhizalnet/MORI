#!/bin/bash

# Exit the script on any error (except for specific command failures we handle)
set -e

# Get the directory of the current script
SCRIPT_DIR="$(dirname -- "$0")"

# Find all .circom files in the current directory
CIRCOM_FILES=$(find "$SCRIPT_DIR" -type f -name "*.circom")

# Check if there are any .circom files
if [ -z "$CIRCOM_FILES" ]; then
    echo "No .circom files found in the directory."
    exit 0
fi

# Initialize success and failure lists
SUCCESS_FILES=()
FAILED_FILES=()

# Iterate over all found .circom files and run prepareCircuit.sh
for CIRCUIT in $CIRCOM_FILES; do
    echo "Preparing circuit: $CIRCUIT"
    if "$SCRIPT_DIR/prepareCircuit.sh" "$CIRCUIT"; then
        echo "Successfully prepared: $CIRCUIT"
        SUCCESS_FILES+=("$CIRCUIT")
    else
        echo "Failed to prepare: $CIRCUIT. Skipping..."
        FAILED_FILES+=("$CIRCUIT")
    fi
done

# Display summary of successes and failures
echo
echo "Circuit Preparation Summary:"
if [ ${#SUCCESS_FILES[@]} -gt 0 ]; then
    echo "Successfully prepared:"
    for FILE in "${SUCCESS_FILES[@]}"; do
        echo "  - $FILE"
    done
else
    echo "No circuits were successfully prepared."
fi

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
    echo "Failed to prepare:"
    for FILE in "${FAILED_FILES[@]}"; do
        echo "  - $FILE"
    done
else
    echo "No circuits failed."
fi
