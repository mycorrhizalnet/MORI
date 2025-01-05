import { assert } from "chai";
import path from "path";
import { BigNumberish, buildPoseidon, Poseidon } from "circomlibjs";
// @ts-ignore
import { wasm as circom_tester } from "circom_tester";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// TODO: move to utils
function uint8ArrayToBigInt(arr: Uint8Array): BigInt {
  return BigInt(
    "0x" +
      Array.from(arr)
        .reverse() // Circom expects little-endian format
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
  );
}

describe("ShallowMerkle Path Inclusion Circuit", function () {
  let poseidon: Poseidon;
  let circuit: any;

  function hasher(left: BigNumberish, right: BigNumberish) {
    const unreduced = poseidon([left, right], undefined, 1);
    const reduced = poseidon.F.e(unreduced);
    return reduced;
  }

  before(async () => {
    // Initialize Poseidon hash function
    poseidon = await buildPoseidon();
    circuit = await circom_tester(
      path.join(__dirname, "../circuits/ShallowMerklePathInclusion.circom"),
    );
  });

  it("should verify a valid Merkle path for a tree of depth 2", async function () {
    // Tree parameter
    const initialLeafValue = poseidon.F.e(0);

    // Compute root
    const pathElements: Uint8Array[] = [];
    const pathIndices: number[] = [];

    pathElements[0] = initialLeafValue; // The sibling of L1 is L2, which is also empty
    pathIndices[0] = 0; // L1 is on the left side of the path
    pathElements[1] = hasher(initialLeafValue, initialLeafValue); // The sibling of Node 1 is Node 2, which is hash(L3, L4)
    pathIndices[1] = 0; // Node 1 is on the left side of the path

    const root = hasher(
      hasher(initialLeafValue, initialLeafValue),
      hasher(initialLeafValue, initialLeafValue),
    );
    // const root = "7423237065226347324353380772367382631490014989348495481811164164159255474657"

    // Test path for Leaf1
    const inputLeaf1 = {
      leaf: poseidon.F.toString(initialLeafValue),
      root: poseidon.F.toString(root),
      pathElements: pathElements.map((e) => poseidon.F.toString(e)),
      pathIndices,
    };

    // console.log("inputLeaf1", inputLeaf1);
    // Calculate witness for Leaf1
    const witnessLeaf1 = await circuit.calculateWitness(inputLeaf1, true);

    await circuit.checkConstraints(witnessLeaf1);
  });
});
