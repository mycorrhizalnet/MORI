import path from "path";
import { buildPoseidon, Poseidon } from "circomlibjs";

import {
  generateMainCircuit,
  cleanupMainCircuit,
  loadPrecomputedSparseTree,
  updateSparseMerkleTree,
} from "./utils.ts";

describe("Merkle Path Inclusion Circuit", function () {
  let poseidon: Poseidon;
  let precomputedTree: string[][];
  let circuit: any;

  before(async () => {
    const templateName = "MerklePathInclusion";
    const params = ["20"];

    circuit = await generateMainCircuit(templateName, params);

    // Initialize Poseidon hash function
    poseidon = await buildPoseidon();

    // Load the precomputed tree from file
    precomputedTree = await loadPrecomputedSparseTree(20);
  });

  after(() => {
    // Cleanup main.circom
    cleanupMainCircuit();
  });

  it("should verify a valid Merkle path for an empty tree", async function () {
    const depth = 20;
    const leafIndex = 0;
    const leafValue = 0;

    // Build the path
    const { root, pathElements, pathIndices } = await updateSparseMerkleTree(
      precomputedTree,
      depth,
      leafIndex,
      leafValue,
    );

    const input = {
      leaf: leafValue,
      root,
      pathElements,
      pathIndices,
      validate: 1,
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  it("should verify a valid Merkle path for depth 20", async function () {
    const depth = 20;
    const leafIndex = 123; // Arbitrary leaf index
    const leafValue = 456789; // Arbitrary leaf value

    // Update the tree with the leaf value
    const { root, pathElements, pathIndices } = await updateSparseMerkleTree(
      precomputedTree,
      depth,
      leafIndex,
      leafValue,
    );

    const input = {
      leaf: poseidon.F.toString(poseidon.F.e(leafValue)), // Ensure consistency
      root,
      pathElements,
      pathIndices,
      validate: 1,
    };

    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });
});
