pragma circom 2.2.1;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/switcher.circom";
include "./MerklePathInclusionTemplate.circom";

template Deposit(merkleTreeDepth) {
    // Public inputs
    signal input depositAmount;        // Amount being deposited
    signal input currencyAddress;      // Address of the currency (token)
    signal input oldRoot;              // Current Merkle tree root
    signal input newRoot;              // New Merkle tree root after update
    signal input nullifier;            // Nullifier for current state

    // Private inputs
    signal input currentBalance;       // Current user balance
    signal input oldPathElements[merkleTreeDepth];  // Path elements for old root inclusion proof
    signal input oldPathIndices[merkleTreeDepth];   // Path indices for old root inclusion proof
    signal input newPathElements[merkleTreeDepth];  // Path elements for new root inclusion proof
    signal input newPathIndices[merkleTreeDepth];   // Path indices for new root inclusion proof
    signal input oldRandomness;           // Randomness for previous commitment, provided by the user
    signal input newRandomness;           // Randomness for commitment, provided by the user
    signal input userSecret;           // Secret for nullifier derivation

    // Compute the old leaf value
    signal oldLeafValue;
    component oldLeafValueHasher = Poseidon(3);
    oldLeafValueHasher.inputs[0] <== currencyAddress;
    oldLeafValueHasher.inputs[1] <== currentBalance;
    oldLeafValueHasher.inputs[2] <== oldRandomness;
    oldLeafValue <== oldLeafValueHasher.out;

    // Ensure nullifier is correctly derived from the current state, or is 0 if the current balance is 0 (first time deposit)
    signal firstTimeDeposit;
    component hasZeroBalance = IsZero();
    hasZeroBalance.in <== currentBalance;
    firstTimeDeposit <== hasZeroBalance.out; // 1 if 0, 0 if not 0

    // Validate Merkle path inclusion for the current state
    component merklePathInclusion = MerklePathInclusion(merkleTreeDepth);
    merklePathInclusion.leaf <== oldLeafValue;
    merklePathInclusion.root <== oldRoot;
    merklePathInclusion.pathElements <== oldPathElements;
    merklePathInclusion.pathIndices <== oldPathIndices;
    merklePathInclusion.validate <== 1 - firstTimeDeposit;

    signal expectedNullifier;
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== userSecret;
    nullifierHasher.inputs[1] <== oldLeafValue;
    
    component nullifierSwitcher = Switcher();
    nullifierSwitcher.L <== nullifierHasher.out;
    nullifierSwitcher.R <== 0;
    nullifierSwitcher.sel <== firstTimeDeposit;
    
    expectedNullifier <== nullifierSwitcher.outL; // 0 if first time deposit, otherwise nullifierHasher.out

    // Compute the new balance after deposit
    signal newBalance;
    newBalance <== depositAmount + currentBalance;

    // Compute the new leaf value
    signal newLeafValue;
    component balanceHasher = Poseidon(3);
    balanceHasher.inputs[0] <== currencyAddress;
    balanceHasher.inputs[1] <== newBalance;
    balanceHasher.inputs[2] <== newRandomness;
    newLeafValue <== balanceHasher.out;

    // Validate the new Merkle root
    component newMerklePathValidation = MerklePathInclusion(merkleTreeDepth);
    newMerklePathValidation.leaf <== newLeafValue;
    newMerklePathValidation.root <== newRoot;
    newMerklePathValidation.pathElements <== newPathElements;
    newMerklePathValidation.pathIndices <== newPathIndices;
    newMerklePathValidation.validate <== 1;
}