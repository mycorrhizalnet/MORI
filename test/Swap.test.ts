import { buildPoseidon } from "circomlibjs";
import {
  generateMainCircuit,
  cleanupMainCircuit,
  SparseMerkleTree,
} from "./utils.ts";
import { zeroAddress } from "viem";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);

describe("Swap Circuit", function () {
  let poseidon: any;
  let circuit: any;
  let tree: SparseMerkleTree;
  const userSecret = BigInt(123456);
  const DEPTH = 20;
  let initialDepositLeafValue: string;

  before(async () => {
    // Initialize Poseidon hash function
    poseidon = await buildPoseidon();

    // Generate a main.circom for the Withdrawal circuit
    const templateName = "Swap";
    const params = [DEPTH.toString()]; // Depth of the Merkle tree

    circuit = await generateMainCircuit(templateName, params);
  });

  beforeEach(() => {
    tree = new SparseMerkleTree(poseidon);

    // Make a deposit so we have something to swap
    initialDepositLeafValue = poseidon.F.toString(
      poseidon([zeroAddress, BigInt(100), '1123']),
    );
    tree.updateLeaf(0, initialDepositLeafValue);
  })

  after(() => {
    // Clean up the generated main.circom
    cleanupMainCircuit();
  });

  it("should verify a valid swap within balance", async function () {
    // Withdrawal Circuit Inputs
    const withdrawalAmount = BigInt(50);
    const withdrawalNullifier = poseidon.F.toString(poseidon([userSecret, initialDepositLeafValue]));
    const withdrawalCurrencyAddress = zeroAddress;
    const withdrawalOldRandomness = '1123';
    const withdrawalCurrentBalance = BigInt(100);
    const withdrawalNewRandomness = '11';
    const oldRoot = tree.getRoot();
    const { pathElements: withdrawalOldPathElements, pathIndices: withdrawalOldPathIndices } = tree.getPath(0);
    const { pathElements: withdrawalNewPathElements, pathIndices: withdrawalNewPathIndices, root: intermediateTokenRoot } = tree.updateLeaf(0, poseidon.F.toString(poseidon([zeroAddress, BigInt(50), withdrawalNewRandomness])));

    // Deposit Circuit Inputs
    const depositAmount = BigInt(50);
    const depositNullifier = poseidon.F.toString(poseidon([userSecret, 0]));
    const depositCurrencyAddress = "0x0000000000000000000000000000000000000111"; // Random ERC-20 address
    const depositOldRandomness = 0;
    const depositCurrentBalance = 0;
    const depositNewRandomness = '22';
    const { pathElements: depositOldPathElements, pathIndices: depositOldPathIndices } = tree.getPath(3);
    const { pathElements: depositNewPathElements, pathIndices: depositNewPathIndices, root: newRoot } = tree.updateLeaf(0, poseidon.F.toString(poseidon([depositCurrencyAddress, BigInt(50), depositNewRandomness])));

    // Prepare the circuit inputs
    const input = {
      oldRoot,
      newRoot,
      intermediateTokenRoot,
      userSecret,
      withdrawalAmount,
      withdrawalNullifier,
      withdrawalCurrencyAddress,
      withdrawalOldRandomness,
      withdrawalNewRandomness,
      withdrawalCurrentBalance,
      withdrawalOldPathElements,
      withdrawalOldPathIndices,
      withdrawalNewPathElements,
      withdrawalNewPathIndices,
      depositAmount,
      depositNullifier,
      depositCurrencyAddress,
      depositOldRandomness,
      depositCurrentBalance,
      depositNewRandomness,
      depositOldPathElements,
      depositOldPathIndices,
      depositNewPathElements,
      depositNewPathIndices,
    };

    const witness = await circuit.calculateWitness(input, true);
    // TODO remove this when we have solidity verifier working
    await circuit.checkConstraints(witness);
  });

  it("should reject a swap that exceeds the balance", async function () {
    // Withdrawal Circuit Inputs
    const withdrawalAmount = BigInt(150); // Withdraw more than balance
    const withdrawalNullifier = poseidon.F.toString(poseidon([userSecret, initialDepositLeafValue]));
    const withdrawalCurrencyAddress = zeroAddress;
    const withdrawalOldRandomness = '1123';
    const withdrawalCurrentBalance = BigInt(100);
    const withdrawalNewRandomness = '11';
    const oldRoot = tree.getRoot();
    const { pathElements: withdrawalOldPathElements, pathIndices: withdrawalOldPathIndices } = tree.getPath(0);
    const { pathElements: withdrawalNewPathElements, pathIndices: withdrawalNewPathIndices, root: intermediateTokenRoot } = tree.updateLeaf(0, poseidon.F.toString(poseidon([zeroAddress, BigInt(50), withdrawalNewRandomness])));

    // Deposit Circuit Inputs
    const depositAmount = BigInt(50);
    const depositNullifier = poseidon.F.toString(poseidon([userSecret, 0]));
    const depositCurrencyAddress = "0x0000000000000000000000000000000000000111"; // Random ERC-20 address
    const depositOldRandomness = 0;
    const depositCurrentBalance = 0;
    const depositNewRandomness = '22';
    const { pathElements: depositOldPathElements, pathIndices: depositOldPathIndices } = tree.getPath(3);
    const { pathElements: depositNewPathElements, pathIndices: depositNewPathIndices, root: newRoot } = tree.updateLeaf(0, poseidon.F.toString(poseidon([depositCurrencyAddress, BigInt(50), depositNewRandomness])));

    // Prepare the circuit inputs
    const input = {
      oldRoot,
      newRoot,
      intermediateTokenRoot,
      userSecret,
      withdrawalAmount,
      withdrawalNullifier,
      withdrawalCurrencyAddress,
      withdrawalOldRandomness,
      withdrawalNewRandomness,
      withdrawalCurrentBalance,
      withdrawalOldPathElements,
      withdrawalOldPathIndices,
      withdrawalNewPathElements,
      withdrawalNewPathIndices,
      depositAmount,
      depositNullifier,
      depositCurrencyAddress,
      depositOldRandomness,
      depositCurrentBalance,
      depositNewRandomness,
      depositOldPathElements,
      depositOldPathIndices,
      depositNewPathElements,
      depositNewPathIndices,
    };

    await chai.expect(circuit.calculateWitness(input, true)).to.be.rejectedWith("Assert Failed");
  });
});
