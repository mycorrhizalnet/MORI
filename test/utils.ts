import { buildPoseidon, Poseidon } from "circomlibjs";
import fs from "fs";
import path from "path";
// @ts-ignore
import { wasm as circomTester } from "circom_tester";
import { fileURLToPath } from "url";
import { zeroAddress } from "viem";
import { CircuitSignals } from "snarkjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates a main.circom file dynamically for testing.
 *
 * @param templateName - The name of the Circom template to instantiate.
 * @param params - An array of parameters to pass to the template.
 * @param outputDir - The directory where the main.circom file will be created.
 * @returns The path to the generated main.circom file.
 */
export function generateMainCircuit(
  templateName: string,
  params: string[],
): any {
  return circomTester(
    path.join(__dirname, `../circuits/${templateName}.circom`),
  );
}

/**
 * Cleans up the generated main.circom file.
 *
 * @param outputDir - The directory containing the main.circom file.
 */
export function cleanupMainCircuit(): void {
  const mainFilePath = path.join(__dirname, "../circuits/main.circom");
  if (fs.existsSync(mainFilePath)) {
    fs.unlinkSync(mainFilePath);
    console.log("Removed main.circom after test.");
  }
}

export async function loadPrecomputedSparseTree(
  depth: number,
): Promise<string[][]> {
  const poseidon = await buildPoseidon();

  /// Load the precomputed tree from file
  const treeFile = path.join(__dirname, "./data/precomputedSparseTree.json");
  if (!fs.existsSync(treeFile)) {
    throw new Error("Precomputed sparse tree file not found.");
  }

  return JSON.parse(fs.readFileSync(treeFile, "utf8")).map((level: string[]) =>
    level.map((hash) => poseidon.F.toString(poseidon.F.e(hash))),
  );
}

export async function updateSparseMerkleTree(
  tree: string[][],
  depth: number,
  leafIndex: number,
  leafValue: string | number,
): Promise<{
  root: string;
  pathElements: string[];
  pathIndices: number[];
  tree: string[][];
}> {
  const poseidon = await buildPoseidon();
  // Clone precomputed tree
  const nodes = tree.map((level) => [...level]);

  // Update the specific leaf
  nodes[0][leafIndex] = poseidon.F.toString(poseidon.F.e(leafValue));

  // Update the affected branches up to the root
  let currentIndex = leafIndex;
  for (let d = 0; d < depth; d++) {
    const siblingIndex = currentIndex ^ 1; // XOR to find sibling index
    const left =
      currentIndex % 2 === 0
        ? poseidon.F.e(nodes[d][currentIndex])
        : poseidon.F.e(nodes[d][siblingIndex]);
    const right =
      currentIndex % 2 === 0
        ? poseidon.F.e(nodes[d][siblingIndex])
        : poseidon.F.e(nodes[d][currentIndex]);
    nodes[d + 1][Math.floor(currentIndex / 2)] = poseidon.F.toString(
      poseidon([left, right]),
    );
    currentIndex = Math.floor(currentIndex / 2);
  }

  const root = nodes[depth][0];
  const pathElements: string[] = [];
  const pathIndices: number[] = [];

  // Compute the path for the selected leaf
  currentIndex = leafIndex;
  for (let d = 0; d < depth; d++) {
    const siblingIndex = currentIndex ^ 1;
    pathElements.push(nodes[d][siblingIndex]);
    pathIndices.push(currentIndex % 2);
    currentIndex = Math.floor(currentIndex / 2);
  }

  return { root, pathElements, pathIndices, tree: nodes };
}

export async function updateTreeWithDeposit({
  tree,
  userSecret,
  currentBalance,
  randomness,
  depositAmount,
  currencyAddress,
  userAddress,
  leafIndex,
}: {
  tree: string[][];
  userSecret: bigint;
  currentBalance: bigint;
  randomness: number;
  depositAmount: bigint;
  currencyAddress: string;
  userAddress: string;
  leafIndex: number;
}): Promise<{
  root: string;
  pathElements: string[];
  pathIndices: number[];
  tree: string[][];
}> {
  const poseidon = await buildPoseidon();

  // Compute the new leaf value
  const newLeafValue = poseidon.F.toString(
    poseidon([currencyAddress, currentBalance + depositAmount, randomness]),
  );

  // Get the new path elements and indices (by updating the tree with the new leaf value)
  const {
    root: newRoot,
    pathElements: newPathElements,
    pathIndices: newPathIndices,
  } = await updateSparseMerkleTree(tree, 20, leafIndex, newLeafValue);

  return {
    root: newRoot,
    pathElements: newPathElements,
    pathIndices: newPathIndices,
    tree,
  };
}

export function getProofFiles(circuitName: string) {
  return {
    wasm: path.join(__dirname, `../circuits/${circuitName}_js/${circuitName}.wasm`),
    zkey: path.join(__dirname, `../circuits/${circuitName}_final.zkey`),
    vKey: JSON.parse(fs.readFileSync(path.join(__dirname, `../circuits/${circuitName}_verification_key.json`), 'utf8')),
  };
}

export function extractProofCalldata(proof: snarkjs.PlonkProof) {
  return [
    proof.A[0],
    proof.A[1],
    proof.B[0],
    proof.B[1],
    proof.C[0],
    proof.C[1],
    proof.Z[0],
    proof.Z[1],
    proof.T1[0],
    proof.T1[1],
    proof.T2[0],
    proof.T2[1],
    proof.T3[0],
    proof.T3[1],
    proof.Wxi[0],
    proof.Wxi[1],
    proof.Wxiw[0],
    proof.Wxiw[1],
    proof.eval_a,
    proof.eval_b,
    proof.eval_c,
    proof.eval_s1,
    proof.eval_s2,
    proof.eval_zw,
  ]
}

export interface DepositProofInputs extends CircuitSignals {
  depositAmount: bigint;
  currencyAddress: string;
  oldRoot: string;
  newRoot: string;
  nullifier: number;
  currentBalance: bigint;
  oldPathElements: string[];
  oldPathIndices: number[];
  newPathElements: string[];
  newPathIndices: number[];
  oldRandomness: string;
  newRandomness: string;
  userSecret: string;
}


export class SparseMerkleTree {
  private poseidon: any;
  private tree: string[][];
  private depth: number;

  constructor(poseidon: Poseidon, depth: number=20) {
    this.depth = depth;
    this.poseidon = poseidon;


    // Load the precomputed tree
    const treeFile = path.join(__dirname, "./data/precomputedSparseTree.json");
    if (!fs.existsSync(treeFile)) {
      throw new Error("Precomputed sparse tree file not found.");
    }

    const rawTree = JSON.parse(fs.readFileSync(treeFile, "utf8"));
    this.tree = rawTree.map((level: string[]) =>
      level.map((hash) => this.poseidon.F.toString(this.poseidon.F.e(hash))),
    );
  }

  /**
   * Returns the root of the current Merkle tree.
   */
  getRoot(): string {
    return this.tree[this.depth][0];
  }

  /**
   * Returns the path elements and path indices for a specific leaf index.
   * @param leafIndex The index of the leaf for which to compute the path.
   */
  getPath(leafIndex: number): { pathElements: string[]; pathIndices: number[] } {
    const pathElements: string[] = [];
    const pathIndices: number[] = [];
    let currentIndex = leafIndex;

    for (let d = 0; d < this.depth; d++) {
      const siblingIndex = currentIndex ^ 1; // XOR to find sibling index
      pathElements.push(this.tree[d][siblingIndex]);
      pathIndices.push(currentIndex % 2); // 0 if left child, 1 if right child
      currentIndex = Math.floor(currentIndex / 2);
    }

    return { pathElements, pathIndices };
  }

  /**
   * Returns the current array of leaves in the tree.
   */
  getLeaves(): string[] {
    return this.tree[0];
  }

  /**
   * Updates the tree with a new leaf value at a specific index.
   * @param leafIndex The index of the leaf to update.
   * @param leafValue The new value of the leaf.
   */
  updateLeaf(leafIndex: number, leafValue: string | number): {
    root: string;
    pathElements: string[];
    pathIndices: number[];
  } {
    const nodes = this.tree.map((level) => [...level]); // Clone the tree

    // Update the specific leaf
    nodes[0][leafIndex] = this.poseidon.F.toString(this.poseidon.F.e(leafValue));

    // Update the affected branches up to the root
    let currentIndex = leafIndex;
    for (let d = 0; d < this.depth; d++) {
      const siblingIndex = currentIndex ^ 1;
      const left =
        currentIndex % 2 === 0
          ? this.poseidon.F.e(nodes[d][currentIndex])
          : this.poseidon.F.e(nodes[d][siblingIndex]);
      const right =
        currentIndex % 2 === 0
          ? this.poseidon.F.e(nodes[d][siblingIndex])
          : this.poseidon.F.e(nodes[d][currentIndex]);
      nodes[d + 1][Math.floor(currentIndex / 2)] = this.poseidon.F.toString(
        this.poseidon([left, right]),
      );
      currentIndex = Math.floor(currentIndex / 2);
    }

    // Update the class tree with the new nodes
    this.tree = nodes;

    const root = nodes[this.depth][0];
    const { pathElements, pathIndices } = this.getPath(leafIndex);

    return { root, pathElements, pathIndices };
  }
}