#!/bin/bash

# Exit script on any error
set -e

# Check if circuit file is provided
if [ "$#" -lt 1 ]; then
    echo "Usage: ./prepareCircuit.sh <circuit.circom>"
    exit 1
fi

# Variables
CIRCUIT_FILE=$1
CIRCUIT_NAME=$(basename "$CIRCUIT_FILE" .circom)
OUTPUT_DIR="$(dirname -- "$0")/${CIRCUIT_NAME}_js"
PTAU_FILE="$(dirname -- "$0")/ppot_0080_24.ptau"  # Use the provided prepared PTAU file for PLONK
ZKEY_FILE="$(dirname -- "$0")/${CIRCUIT_NAME}_final.zkey"
VERIFICATION_KEY_FILE="$(dirname -- "$0")/${CIRCUIT_NAME}_verification_key.json"
SOLIDITY_VERIFIER_FILE="$(dirname -- "$0")/${CIRCUIT_NAME}Verifier.sol"
CONTRACTS_DIR="$(dirname -- "$0")/../contracts"


echo "Preparing circuit: $CIRCUIT_NAME"

# Compile the circuit
echo "Compiling the circuit..."
circom "$CIRCUIT_FILE" --r1cs --wasm --sym -o $(dirname -- "$0")/.

# Verify the PTAU file exists
if [ ! -f "$PTAU_FILE" ]; then
    # @dev: Prepared PTAU files are available at https://github.com/privacy-scaling-explorations/perpetualpowersoftau?tab=readme-ov-file#prepared-and-truncated-files
    echo "Error: PTAU file $PTAU_FILE not found. Ensure it exists in this directory."
    exit 1
fi

# Generate the zkey file for PLONK
echo "Generating zkey file with PLONK..."
snarkjs plonk setup "$(dirname -- "$0")/$CIRCUIT_NAME.r1cs" "$PTAU_FILE" "$ZKEY_FILE"

# Export the verification key
echo "Exporting verification key..."
snarkjs zkey export verificationkey "$ZKEY_FILE" "$VERIFICATION_KEY_FILE"

# Generate the Solidity verifier
echo "Generating Solidity verifier..."
snarkjs zkey export solidityverifier "$ZKEY_FILE" "$SOLIDITY_VERIFIER_FILE"

sed -i -e "s/contract PlonkVerifier/contract ${CIRCUIT_NAME}Verifier/g" "$SOLIDITY_VERIFIER_FILE"

# Move the Solidity verifier to the contracts directory
if [ ! -d "$CONTRACTS_DIR" ]; then
    echo "Creating contracts directory: $CONTRACTS_DIR"
    mkdir -p "$CONTRACTS_DIR"
fi
mv "$SOLIDITY_VERIFIER_FILE" "$CONTRACTS_DIR/"


# Output paths
echo "Circuit prepared successfully!"
echo "Generated files:"
echo "  - WASM: ${OUTPUT_DIR}/${CIRCUIT_NAME}.wasm"
echo "  - ZKey: $ZKEY_FILE"
echo "  - Verification Key: $VERIFICATION_KEY_FILE"
echo "  - Solidity Verifier: $SOLIDITY_VERIFIER_FILE"