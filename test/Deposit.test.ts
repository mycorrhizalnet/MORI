import { buildPoseidon } from "circomlibjs";
import {
  generateMainCircuit,
  cleanupMainCircuit,
  loadPrecomputedSparseTree,
  updateSparseMerkleTree,
} from "./utils.ts";
import { zeroAddress } from "viem";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

describe("Deposit Circuit", function () {
  let poseidon: any;
  let circuit: any;
  let precomputedTree: string[][];
  const DEPTH = 20;

  before(async () => {
    // Initialize Poseidon hash function
    poseidon = await buildPoseidon();

    // Generate a main.circom for the Deposit circuit
    const templateName = "Deposit";
    const params = [DEPTH.toString()]; // Depth of the Merkle tree

    circuit = await generateMainCircuit(templateName, params);

    // Load the precomputed tree from file
    precomputedTree = await loadPrecomputedSparseTree(DEPTH);
  });

  after(() => {
    // Clean up the generated main.circom
    cleanupMainCircuit();
  });

  it("should verify a valid initial deposit", async function () {
    // User defined private inputs
    const userSecret = BigInt(123456); // Arbitrary secret
    const currentBalance = BigInt(0);
    const randomness = 1; // Arbitrary randomness

    // Public inputs, except for new root which we must compute
    const depositAmount = BigInt(100);
    const currencyAddress = zeroAddress;
    const oldRoot = precomputedTree[DEPTH][0];
    const userAddress = 0x0000000000000000000000000000000000000001;
    const nullifier = poseidon.F.toString(poseidon([userSecret, 0])); // Nullifier is derived from userSecret and initial leaf value (which is 0 for a first time deposit)

    const oldLeafIndex = parseInt(
      (
        BigInt(
          poseidon.F.toString(
            poseidon([currencyAddress, userAddress, randomness]),
          ),
        ) % BigInt(2 ** DEPTH)
      ).toString(),
    );
    const oldLeafValue = precomputedTree[0][oldLeafIndex];

    // Get the old path elements and indices (by "updating" the tree with no new data)
    const { pathElements: oldPathElements, pathIndices: oldPathIndices } =
      await updateSparseMerkleTree(
        precomputedTree,
        DEPTH,
        oldLeafIndex,
        parseInt(oldLeafValue),
      );

    // Compute the new leaf value
    const newLeafValue = poseidon.F.toString(
      poseidon([currencyAddress, currentBalance + depositAmount, randomness]),
    );
    // Compute the new leaf index
    const newLeafIndex = parseInt(
      (
        BigInt(
          poseidon.F.toString(
            poseidon([currencyAddress, userAddress, randomness]),
          ),
        ) % BigInt(2 ** DEPTH)
      ).toString(),
    );

    // Get the new path elements and indices (by updating the tree with the new leaf value)
    const {
      root: newRoot,
      pathElements: newPathElements,
      pathIndices: newPathIndices,
    } = await updateSparseMerkleTree(
      precomputedTree,
      DEPTH,
      newLeafIndex,
      newLeafValue,
    );

    // Prepare the circuit inputs
    const input = {
      depositAmount,
      currencyAddress,
      oldRoot,
      newRoot,
      currentBalance,
      oldPathElements,
      oldPathIndices,
      newPathElements,
      newPathIndices,
      userSecret,
      oldRandomness: randomness,
      newRandomness: randomness,
      nullifier,
    };

    // Verify the circuit constraints
    const witness = await circuit.calculateWitness(input, true);

    // Assert the computed root matches the expected new root
    await circuit.checkConstraints(witness);
  });

  it("should verify an additional deposit", async function () {
    // User defined private inputs
    const userSecret = BigInt(123456); // Arbitrary secret
    let currentBalance = BigInt(0);
    let randomness = 1; // Arbitrary randomness

    // Public inputs, except for new root which we must compute
    let depositAmount = BigInt(100);
    let currencyAddress = zeroAddress;
    let oldRoot = precomputedTree[DEPTH][0];
    let userAddress = 0x0000000000000000000000000000000000000001;
    let nullifier = poseidon.F.toString(poseidon([userSecret, 0])); // Nullifier is derived from userSecret and initial leaf value (which is 0 for a first time deposit)

    let oldLeafIndex = 11; // Arbitrary leaf index
    let oldLeafValue = precomputedTree[0][oldLeafIndex];

    // Get the old path elements and indices (by "updating" the tree with no new data)
    let { pathElements: oldPathElements, pathIndices: oldPathIndices } =
      await updateSparseMerkleTree(
        precomputedTree,
        DEPTH,
        oldLeafIndex,
        parseInt(oldLeafValue),
      );

    // Compute the new leaf value after the first deposit
    let newLeafValue = poseidon.F.toString(
      poseidon([currencyAddress, currentBalance + depositAmount, randomness]),
    );

    // Compute the new leaf index
    let newLeafIndex = 12; // Arbitrary leaf index

    // Get the new path elements and indices (by updating the tree with the new leaf value) for the *first* deposit
    let {
      root: newRoot,
      pathElements: newPathElements,
      pathIndices: newPathIndices,
    } = await updateSparseMerkleTree(
      precomputedTree,
      DEPTH,
      newLeafIndex,
      newLeafValue,
    );

    // Update our variables to prepare for the second deposit
    oldRoot = newRoot;
    oldLeafValue = newLeafValue;
    oldLeafIndex = newLeafIndex;
    oldPathElements = newPathElements;
    oldPathIndices = newPathIndices;
    nullifier = poseidon.F.toString(poseidon([userSecret, oldLeafValue]));

    // Compute the new leaf value after the second deposit
    depositAmount = BigInt(200);
    randomness = 2; // Arbitrary randomness
    newLeafValue = poseidon.F.toString(
      poseidon([currencyAddress, currentBalance + depositAmount, randomness]),
    );

    // Get the new path elements and indices (by updating the tree with the new leaf value) for the *second* deposit
    const updateResult = await updateSparseMerkleTree(
      precomputedTree,
      DEPTH,
      newLeafIndex,
      newLeafValue,
    );
    newRoot = updateResult.root;
    newPathElements = updateResult.pathElements;
    newPathIndices = updateResult.pathIndices;

    // Prepare the circuit inputs
    const input = {
      depositAmount,
      currencyAddress,
      oldRoot,
      newRoot,
      currentBalance,
      oldPathElements,
      oldPathIndices,
      newPathElements,
      newPathIndices,
      userSecret,
      oldRandomness: randomness,
      newRandomness: randomness,
      nullifier,
    };

    // Verify the circuit constraints
    const witness = await circuit.calculateWitness(input, true);

    // Assert the computed root matches the expected new root
    await circuit.checkConstraints(witness);
  });
});
