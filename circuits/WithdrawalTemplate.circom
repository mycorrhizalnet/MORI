pragma circom 2.2.1;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/compconstant.circom";
include "./MerklePathInclusionTemplate.circom";

template Withdrawal(merkleTreeDepth) {
    // Public inputs
    signal input withdrawalAmount;        // Amount being withdrawn
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

    // Validate Merkle path inclusion for the current state
    component merklePathInclusion = MerklePathInclusion(merkleTreeDepth);
    merklePathInclusion.leaf <== oldLeafValue;
    merklePathInclusion.root <== oldRoot;
    merklePathInclusion.pathElements <== oldPathElements;
    merklePathInclusion.pathIndices <== oldPathIndices;
    merklePathInclusion.validate <== 1;

    // Ensure nullifier is correctly derived from the current state
    signal expectedNullifier;
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== userSecret;
    nullifierHasher.inputs[1] <== oldLeafValue;
    expectedNullifier <== nullifierHasher.out;
    expectedNullifier === nullifier;  // Constraint: Ensure nullifier matches

    // Compute the new balance after deposit
    signal newBalance;
    newBalance <== currentBalance - withdrawalAmount;

    // Ensure the withdrawal amount is less than the current balance
    component isNegative = IsNegative();
    isNegative.in <== newBalance;
    isNegative.out === 0;

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


template IsNegative() {
    signal input in;
    signal output out;

    component num2bits = Num2Bits(254);
    component cc = CompConstant(10944121435919637611123202872628637544274182200208017171849102093287904247808);
    
    num2bits.in <== in;
    cc.in <== num2bits.out;

    out <== cc.out;   
}