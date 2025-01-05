import fs from "fs";
import { poseidonContract } from "circomlibjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  // TODO: Deploy the raw output here and save the address as a constant
  const poseidonData = poseidonContract.createCode(2);
  const poseidonABI = poseidonContract.generateABI(2);
  console.log(poseidonABI[1].inputs);
})();
