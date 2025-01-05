import fs from "fs";
import { buildPoseidon } from "circomlibjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const poseidon = await buildPoseidon();
  const depth = 20; // Tree depth

  // Initialize the tree with empty leaves
  let currentLevel = Array(Math.pow(2, depth)).fill(
    poseidon.F.toString(poseidon.F.e(0)),
  );
  const precomputedTree = [currentLevel.map((hash) => hash.toString())];

  // Build the tree level by level
  for (let d = 0; d < depth; d++) {
    console.log("Building level", d);
    const nextLevel: any[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const L = poseidon.F.e(currentLevel[i]);
      const R = poseidon.F.e(currentLevel[i + 1]);
      nextLevel.push(poseidon.F.toString(poseidon([L, R])));
    }
    currentLevel = nextLevel;
    precomputedTree.push(currentLevel);
  }

  // Save the entire tree to a file
  fs.writeFileSync(
    path.join(__dirname, "../test/data/precomputedSparseTree.json"),
    JSON.stringify(precomputedTree, null, 2),
  );

  console.log(
    "Precomputed sparse tree saved to ",
    path.join(__dirname, "../test/data/precomputedSparseTree.json"),
  );
})();
