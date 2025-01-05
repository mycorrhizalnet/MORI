pragma circom 2.2.1;

include "./MerklePathInclusionTemplate.circom";
include "./DepositTemplate.circom";
include "./WithdrawalTemplate.circom";

template Swap(merkleTreeDepth) {
    // Public Inputs
    signal input oldRoot;                // Current Merkle root
    signal input newRoot;                // New Merkle root after the swap
    signal input intermediateTokenRoot;  // Intermediate Merkle root after withdrawal

    // Private Inputs
    signal input userSecret;

    // Withdrawal Circuit Inputs
    signal input withdrawalAmount;       // Amount withdrawn
    signal input withdrawalNullifier;    // Nullifier for withdrawal leaf
    signal input withdrawalCurrencyAddress; // Address of withdrawal currency
    signal input withdrawalOldRandomness; 
    signal input withdrawalCurrentBalance; // Current balance of withdrawal currency
    signal input withdrawalNewRandomness; // Randomness for withdrawal leaf
    signal input withdrawalOldPathElements[merkleTreeDepth];
    signal input withdrawalOldPathIndices[merkleTreeDepth];
    signal input withdrawalNewPathElements[merkleTreeDepth];
    signal input withdrawalNewPathIndices[merkleTreeDepth];


    // Deposit Circuit Inputs
    signal input depositAmount;          // Amount deposited
    signal input depositNullifier;       // Nullifier for deposit leaf
    signal input depositCurrencyAddress; // Address of deposit currency
    signal input depositOldRandomness;
    signal input depositCurrentBalance; // Current balance of deposit currency
    signal input depositNewRandomness; // Randomness for deposit leaf
    signal input depositOldPathElements[merkleTreeDepth];
    signal input depositOldPathIndices[merkleTreeDepth];
    signal input depositNewPathElements[merkleTreeDepth];
    signal input depositNewPathIndices[merkleTreeDepth];


    // Step 1: Validate the Withdrawal
    component withdrawalCircuit = Withdrawal(merkleTreeDepth);
    withdrawalCircuit.withdrawalAmount <== withdrawalAmount;
    withdrawalCircuit.currencyAddress <== withdrawalCurrencyAddress;
    withdrawalCircuit.oldRoot <== oldRoot;
    withdrawalCircuit.newRoot <== intermediateTokenRoot; // Intermediate root after withdrawal
    withdrawalCircuit.nullifier <== withdrawalNullifier;
    withdrawalCircuit.currentBalance <== withdrawalCurrentBalance;
    withdrawalCircuit.oldPathElements <== withdrawalOldPathElements;
    withdrawalCircuit.oldPathIndices <== withdrawalOldPathIndices;
    withdrawalCircuit.newPathElements <== withdrawalNewPathElements;
    withdrawalCircuit.newPathIndices <== withdrawalNewPathIndices;
    withdrawalCircuit.userSecret <== userSecret;
    withdrawalCircuit.oldRandomness <== withdrawalOldRandomness;
    withdrawalCircuit.newRandomness <== withdrawalNewRandomness;

    // Step 2: Validate the Deposit
    component depositCircuit = Deposit(merkleTreeDepth);
    depositCircuit.depositAmount <== depositAmount;
    depositCircuit.currencyAddress <== depositCurrencyAddress;
    depositCircuit.oldRoot <== intermediateTokenRoot;
    depositCircuit.newRoot <== newRoot; // Final root after deposit
    depositCircuit.nullifier <== depositNullifier;
    depositCircuit.currentBalance <== depositCurrentBalance;
    depositCircuit.oldPathElements <== depositOldPathElements;
    depositCircuit.oldPathIndices <== depositOldPathIndices;
    depositCircuit.newPathElements <== depositNewPathElements;
    depositCircuit.newPathIndices <== depositNewPathIndices;
    depositCircuit.userSecret <== userSecret;
    depositCircuit.oldRandomness <== depositOldRandomness;
    depositCircuit.newRandomness <== depositNewRandomness;
    // Final Constraint: Ensure the newRoot matches
    depositCircuit.newRoot === newRoot;
}