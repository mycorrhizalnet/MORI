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

describe("Withdrawal Circuit", function () {
  let poseidon: any;
  let circuit: any;
  let initialTree: string[][];
  let initialBalance: bigint;
  let initialLeafValue: string;
  let initialPathElements: string[];
  let initialPathIndices: number[];
  let initialRoot: string;
  const DEPTH = 20;

  before(async () => {
    // Initialize Poseidon hash function
    poseidon = await buildPoseidon();

    // Generate a main.circom for the Withdrawal circuit
    const templateName = "Withdrawal";
    const params = [DEPTH.toString()]; // Depth of the Merkle tree

    circuit = await generateMainCircuit(templateName, params);
  });

  after(() => {
    // Clean up the generated main.circom
    cleanupMainCircuit();
  });

  beforeEach(async () => {
    // First, make a deposit
    initialBalance = BigInt(100);
    const randomness = 1123;
    const leafIndex = 11;

    const leafValue = poseidon.F.toString(
      poseidon([zeroAddress, initialBalance, randomness]),
    );
    let { root, pathElements, pathIndices, tree } =
      await updateSparseMerkleTree(
        await loadPrecomputedSparseTree(DEPTH),
        DEPTH,
        leafIndex,
        leafValue,
      );

    initialLeafValue = leafValue;
    initialTree = tree;
    initialPathElements = pathElements;
    initialPathIndices = pathIndices;
    initialRoot = root;
  });

  it("should verify a valid withdrawal within balance", async function () {
    // User-defined private inputs
    const oldLeafValue = initialLeafValue;
    const currentBalance = initialBalance;
    const oldPathElements = initialPathElements;
    const oldPathIndices = initialPathIndices;
    const userSecret = BigInt(123456); // Arbitrary secret
    const randomness = BigInt(1123); // Arbitrary randomness

    // Public inputs
    const withdrawalAmount = BigInt(10); // Withdraw less than balance
    const currencyAddress = zeroAddress;
    const oldRoot = initialRoot;
    const nullifier = poseidon.F.toString(poseidon([userSecret, oldLeafValue]));

    // Compute the new balance and new leaf value
    const newBalance = currentBalance - withdrawalAmount;
    const newLeafValue = poseidon.F.toString(
      poseidon([currencyAddress, newBalance, randomness]),
    );
    const newLeafIndex = 123;

    // Get new path elements and indices after updating the tree
    const {
      root: newRoot,
      pathElements: newPathElements,
      pathIndices: newPathIndices,
    } = await updateSparseMerkleTree(
      initialTree,
      DEPTH,
      newLeafIndex,
      newLeafValue,
    );

    // Prepare the circuit inputs
    const input = {
      withdrawalAmount,
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

  it("should reject a withdrawal that exceeds the balance", async function () {
    // User-defined private inputs
    const oldLeafValue = initialLeafValue;
    const currentBalance = initialBalance;
    const oldPathElements = initialPathElements;
    const oldPathIndices = initialPathIndices;
    const userSecret = BigInt(123456); // Arbitrary secret
    const randomness = BigInt(1123); // Arbitrary randomness

    // Public inputs
    const withdrawalAmount = BigInt(initialBalance + BigInt(100)); // Withdraw more than balance
    const currencyAddress = zeroAddress;
    const oldRoot = initialRoot;
    const nullifier = poseidon.F.toString(poseidon([userSecret, oldLeafValue]));

    // Compute the new balance and new leaf value
    const newBalance = currentBalance - withdrawalAmount;
    const newLeafValue = poseidon.F.toString(
      poseidon([currencyAddress, newBalance, randomness]),
    );
    const newLeafIndex = 123;

    // Get new path elements and indices after updating the tree
    const {
      root: newRoot,
      pathElements: newPathElements,
      pathIndices: newPathIndices,
    } = await updateSparseMerkleTree(
      initialTree,
      DEPTH,
      newLeafIndex,
      newLeafValue,
    );

    // Prepare the circuit inputs
    const input = {
      withdrawalAmount,
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
    const witness = await chai
      .expect(circuit.calculateWitness(input, true))
      .to.be.rejectedWith("Assert Failed");
  });

  it("should verify a withdrawal that is exactly the balance", async function () {
    // User-defined private inputs
    const oldLeafValue = initialLeafValue;
    const currentBalance = initialBalance;
    const oldPathElements = initialPathElements;
    const oldPathIndices = initialPathIndices;
    const userSecret = BigInt(123456); // Arbitrary secret
    const randomness = BigInt(1123); // Arbitrary randomness

    // Public inputs
    const withdrawalAmount = initialBalance; // Withdraw exactly the balance
    const currencyAddress = zeroAddress;
    const oldRoot = initialRoot;
    const nullifier = poseidon.F.toString(poseidon([userSecret, oldLeafValue]));

    // Compute the new balance and new leaf value
    const newBalance = currentBalance - withdrawalAmount;
    const newLeafValue = poseidon.F.toString(
      poseidon([currencyAddress, newBalance, randomness]),
    );
    const newLeafIndex = 123;

    // Get new path elements and indices after updating the tree
    const {
      root: newRoot,
      pathElements: newPathElements,
      pathIndices: newPathIndices,
    } = await updateSparseMerkleTree(
      initialTree,
      DEPTH,
      newLeafIndex,
      newLeafValue,
    );

    // Prepare the circuit inputs
    const input = {
      withdrawalAmount,
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
