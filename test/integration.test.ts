import { Anvil, createAnvil, fetchLogs } from "@viem/anvil";
import { poseidonContract as poseidonDeployer, buildPoseidon, Poseidon } from "circomlibjs";
import { createTestClient, createWalletClient, getContract, GetContractReturnType, http, HttpTransport, parseEther, publicActions, testActions, walletActions, WalletClient, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, base, foundry } from "viem/chains";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import * as snarkjs from 'snarkjs';
import DepositVerifierBuild from '../out/DepositVerifier.sol/DepositVerifier.json' assert { type: "json" };
import WithdrawalVerifierBuild from '../out/WithdrawalVerifier.sol/WithdrawalVerifier.json' assert { type: "json" };
import SwapVerifierBuild from '../out/SwapVerifier.sol/SwapVerifier.json' assert { type: "json" };  
import MoriBuild from '../out/Mori.sol/Mori.json' assert { type: "json" };
import WETH9Build from '../out/WETH9.sol/WETH9.json' assert { type: "json" };
import { DepositProofInputs, extractProofCalldata, getProofFiles, SparseMerkleTree } from "./utils.ts";
import dotenv from 'dotenv';
dotenv.config();

chai.use(chaiAsPromised);

describe("Integration Test", function () {
    let anvilInstance: Anvil;
    let walletClient: any;
    let poseidon: Poseidon;
    let poseidonAddress: `0x${string}`;
    let depositVerifierAddress: `0x${string}`;
    let withdrawalVerifierAddress: `0x${string}`;
    let swapVerifierAddress: `0x${string}`;
    let moriContract: any;
    let wethContract: any;
    let tree: SparseMerkleTree;

    before(async () => {
        // Build the poseidon hasher
        poseidon = await buildPoseidon();
        
        // Start Anvil and instantiate the public and wallet clients
        anvilInstance = createAnvil({forkUrl: process.env.BASE_RPC_URL, chainId: foundry.id});
        await anvilInstance.start();
        const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); // default anvil PK
        walletClient = createTestClient({
            account,
            chain: foundry,
            mode: 'anvil',
            transport: http(),
            }).extend(publicActions).extend(walletActions);

        // Give a bunch of ETH to the account
        await walletClient.setBalance({address: account.address, value: parseEther('100')});

        // Deploy the Poseidon contract
        const poseidonBytecode:any = poseidonDeployer.createCode(2);
        const poseidonAbi:any = poseidonDeployer.generateABI(2);
        const poseidonHash = await walletClient.deployContract({
            abi: poseidonAbi,
            bytecode: poseidonBytecode,
            args: []
        });
        const poseidonTransactionReceipt = await walletClient.getTransactionReceipt({hash: poseidonHash});
        poseidonAddress = poseidonTransactionReceipt.contractAddress as `0x${string}`;
        // poseidonContract = getContract({
        //     address: poseidonAddress,
        //     abi: poseidonAbi,
        //     client: walletClient
        // });

        // Deploy the Validators
        const depositVerifierHash = await walletClient.deployContract({
            abi: DepositVerifierBuild.abi,
            bytecode: DepositVerifierBuild.bytecode.object as `0x${string}`,
            args: []
        });
        const depositVerifierTransactionReceipt = await walletClient.getTransactionReceipt({hash: depositVerifierHash});
        depositVerifierAddress = depositVerifierTransactionReceipt.contractAddress as `0x${string}`;
        // depositVerifierContract = getContract({
        //     address: depositVerifierAddress,
        //     abi: DepositVerifierBuild.abi,
        //     client: walletClient
        // });
        const withdrawalVerifierHash = await walletClient.deployContract({
            abi: WithdrawalVerifierBuild.abi,
            bytecode: WithdrawalVerifierBuild.bytecode.object as `0x${string}`,
            args: []
        });
        const withdrawalVerifierTransactionReceipt = await walletClient.getTransactionReceipt({hash: withdrawalVerifierHash});
        withdrawalVerifierAddress = withdrawalVerifierTransactionReceipt.contractAddress as `0x${string}`;
        // withdrawalVerifierContract = getContract({
        //     address: withdrawalVerifierAddress,
        //     abi: WithdrawalVerifierBuild.abi,
        //     client: walletClient
        // });
        const swapVerifierHash = await walletClient.deployContract({
            abi: SwapVerifierBuild.abi,
            bytecode: SwapVerifierBuild.bytecode.object as `0x${string}`,
            args: []
        });
        const swapVerifierTransactionReceipt = await walletClient.getTransactionReceipt({hash: swapVerifierHash});
        swapVerifierAddress = swapVerifierTransactionReceipt.contractAddress as `0x${string}`;
        // swapVerifierContract = getContract({
        //     address: swapVerifierAddress,
        //     abi: SwapVerifierBuild.abi,
        //     client: walletClient
        // });

    })
    beforeEach(async () => {
        tree = new SparseMerkleTree(poseidon);

        // Deploy a fresh Mori contract
        const swapRouterAddress = '0x2626664c2603336E57B271c5C0b26F421741e481';
        // const nonfungiblePositionManagerAddress = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
        // const uniswapFactoryAddress = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
        const wethAddress = '0x4200000000000000000000000000000000000006';
        const moriHash = await walletClient.deployContract({
            abi: MoriBuild.abi,
            bytecode: MoriBuild.bytecode.object as `0x${string}`,
            args: [swapVerifierAddress, depositVerifierAddress, withdrawalVerifierAddress, swapRouterAddress, zeroAddress, wethAddress, 20, poseidonAddress]
        });
        const moriTransactionReceipt = await walletClient.getTransactionReceipt({hash: moriHash});
        const moriAddress = moriTransactionReceipt.contractAddress as `0x${string}`;
        moriContract = getContract({
            address: moriAddress,
            abi: MoriBuild.abi,
            client: walletClient
        });
        wethContract = getContract({
            address: wethAddress,
            abi: WETH9Build.abi,
            client: walletClient
        });
        // Mint some WETH to the account
        await wethContract.write.deposit({value: parseEther('10')});
        await wethContract.write.approve({args: [moriContract.address, parseEther('10')]});
    });

    after(async () => {
        await anvilInstance.stop();
    });

    it('should deploy successfully', async () => {
        const moriAddress = await moriContract.address;
        chai.expect(moriAddress).to.not.be.undefined;
    });

    it('should have a matching initial root', async () => {
        const initialRoot = await moriContract.read.root();
        chai.expect(initialRoot.toString()).to.eq(tree.getRoot());
    });

    describe('Deposit', () => {
        it('should create an initial deposit', async () => {
            const depositAmount = 1000000000000000000n; // 1 ETH
            const depositCurrencyAddress = wethContract.address;
            const depositNullifier = 0;
            const oldRoot = await moriContract.read.root();
            const leafIndex = await moriContract.read.nextIndex();
            const commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount, 0]));
            const userSecret = poseidon.F.toString(123); // Arbitrary user secret
            const randomness = poseidon.F.toString(456); // Arbitrary randomness
            const { pathElements: oldPathElements, pathIndices: oldPathIndices } = tree.getPath(leafIndex);
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);
    
            const proofInputs = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier: depositNullifier,
                currentBalance: 0,
                oldPathElements,
                oldPathIndices,
                newPathElements,
                newPathIndices,
                userSecret,
                oldRandomness: 0,
                newRandomness: randomness
            }
            const { wasm, zkey, vKey } = getProofFiles('Deposit');
            const {proof, publicSignals} = await snarkjs.plonk.fullProve(proofInputs, wasm, zkey);
            // TODO remove this when we have solidity verifier working
            const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);
            chai.expect(res).to.be.true;
            
            const proofCalldata = extractProofCalldata(proof);
            const publicInputs = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: depositNullifier
            }
            const txHash = await moriContract.write.deposit({args: [publicInputs, proofCalldata, commitment]});
            const txReceipt = await walletClient.waitForTransactionReceipt({hash: txHash});
    
            // TODO: parse logs properly with viem
            chai.expect(txReceipt.logs.length).to.be.eq(3);
            // Tree Update Log
            chai.expect(txReceipt.logs[1].address).to.eq(moriContract.address);
            chai.expect(txReceipt.logs[1].topics[0]).to.eq('0x8316ab12e7f421acfc747d81a31961ced97d70b74e1c1a47581d9f3c317e0723');
            chai.expect(BigInt(txReceipt.logs[1].topics[1])).to.eq(BigInt(oldRoot));
            chai.expect(BigInt(txReceipt.logs[1].topics[2])).to.eq(BigInt(newRoot));
            chai.expect(txReceipt.logs[1].data).to.eq('0x000000000000000000000000000000000000000000000000000000000000000022efa2903a9800568238285bbc76c89018247576e57e5156e4696bad4008d1ee')
            // Deposit Processed Log
            chai.expect(txReceipt.logs[2].address).to.eq(moriContract.address);
            chai.expect(txReceipt.logs[2].topics[0]).to.eq('0x5bfaeefda3da63ca85ae8f1475d3cab47dd256000ab15f61732a7de66bdb4dfd');
            chai.expect(txReceipt.logs[2].topics[1]).to.eq('0x0000000000000000000000000000000000000000000000000000000000000000'); // nullifier
            chai.expect(txReceipt.logs[2].topics[2]).to.eq('0x0000000000000000000000004200000000000000000000000000000000000006'); // currencyAddress
            chai.expect(txReceipt.logs[2].data).to.eq('0x0000000000000000000000000000000000000000000000000de0b6b3a7640000'); // (amount)
        })
    
        it('should create 2 valid deposits', async () => {
            const depositAmount = 1000000000000000000n; // 1 ETH
            const depositCurrencyAddress = wethContract.address;
            const userSecret = poseidon.F.toString(123); // Arbitrary user secret
            const randomness1 = poseidon.F.toString(456); // Arbitrary randomness
            let depositNullifier = 0;
            let oldRoot = await moriContract.read.root();
            let leafIndex = await moriContract.read.nextIndex();
            let commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount, randomness1]));
            const { pathElements: oldPathElements, pathIndices: oldPathIndices } = tree.getPath(leafIndex);
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);
    
            const proofInputs = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier: depositNullifier,
                currentBalance: 0,
                oldPathElements,
                oldPathIndices,
                newPathElements,
                newPathIndices,
                userSecret,
                oldRandomness: 0,
                newRandomness: randomness1
            }
            const { wasm, zkey, vKey } = getProofFiles('Deposit');
            const {proof, publicSignals} = await snarkjs.plonk.fullProve(proofInputs, wasm, zkey);
            // TODO remove this when we have solidity verifier working
            const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);
            chai.expect(res).to.be.true;
    
    
            const proofCalldata = extractProofCalldata(proof);
            const publicInputs = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: depositNullifier
            }
            const txHash = await moriContract.write.deposit({args: [publicInputs, proofCalldata, commitment]});
            await walletClient.waitForTransactionReceipt({hash: txHash});
    
            // Second Deposit
            const randomness2 = poseidon.F.toString(789); // Arbitrary randomness
            depositNullifier = poseidon.F.toString(poseidon([userSecret, commitment]));
            oldRoot = newRoot;
            leafIndex = await moriContract.read.nextIndex();
            commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount+depositAmount, randomness2]));
            const oldPathElements2 = newPathElements;
            const oldPathIndices2 = newPathIndices;
            const { pathElements: newPathElements2, pathIndices: newPathIndices2, root: newRoot2 } = tree.updateLeaf(leafIndex, commitment);
    
            const proofInputs2 = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot2,
                nullifier: depositNullifier,
                currentBalance: depositAmount,
                oldPathElements: oldPathElements2,
                oldPathIndices: oldPathIndices2,
                newPathElements: newPathElements2,
                newPathIndices: newPathIndices2,
                userSecret,
                oldRandomness: randomness1,
                newRandomness: randomness2
            }
            const {proof: proof2, publicSignals: publicSignals2} = await snarkjs.plonk.fullProve(proofInputs2, wasm, zkey);
            const res2 = await snarkjs.plonk.verify(vKey, publicSignals2, proof2);
            chai.expect(res2).to.be.true;
    
            const proofCalldata2 = extractProofCalldata(proof2);
            const publicInputs2 = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot2,
                nullifier: depositNullifier
            }
            const txHash2 = await moriContract.write.deposit({args: [publicInputs2, proofCalldata2, commitment]});
            await walletClient.waitForTransactionReceipt({hash: txHash2});
        })

        it('should fail to deposit with a reused nullifier', async () => {
            const depositAmount = 1000000000000000000n; // 1 ETH
            const depositCurrencyAddress = wethContract.address;
            const userSecret = poseidon.F.toString(123); // Arbitrary user secret
            const randomness1 = poseidon.F.toString(456); // Arbitrary randomness
            let depositNullifier = 0;
            let oldRoot = await moriContract.read.root();
            let leafIndex = await moriContract.read.nextIndex();
            let commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount, randomness1]));
            const { pathElements: oldPathElements, pathIndices: oldPathIndices } = tree.getPath(leafIndex);
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);
    
            const proofInputs = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier: depositNullifier,
                currentBalance: 0,
                oldPathElements,
                oldPathIndices,
                newPathElements,
                newPathIndices,
                userSecret,
                oldRandomness: 0,
                newRandomness: randomness1
            }
            const { wasm, zkey, vKey } = getProofFiles('Deposit');
            const {proof, publicSignals} = await snarkjs.plonk.fullProve(proofInputs, wasm, zkey);
            // TODO remove this when we have solidity verifier working
            const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);
            chai.expect(res).to.be.true;
    
    
            const proofCalldata = extractProofCalldata(proof);
            const publicInputs = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: depositNullifier
            }
            const txHash = await moriContract.write.deposit({args: [publicInputs, proofCalldata, commitment]});
            await walletClient.waitForTransactionReceipt({hash: txHash});
    
            // Second Deposit
            const randomness2 = poseidon.F.toString(789); // Arbitrary randomness
            depositNullifier = poseidon.F.toString(poseidon([userSecret, commitment]));
            oldRoot = newRoot;
            leafIndex = await moriContract.read.nextIndex();
            commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount+depositAmount, randomness2]));
            const oldPathElements2 = newPathElements;
            const oldPathIndices2 = newPathIndices;
            const { pathElements: newPathElements2, pathIndices: newPathIndices2, root: newRoot2 } = tree.updateLeaf(leafIndex, commitment);
    
            const proofInputs2 = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot2,
                nullifier: depositNullifier,
                currentBalance: depositAmount,
                oldPathElements: oldPathElements2,
                oldPathIndices: oldPathIndices2,
                newPathElements: newPathElements2,
                newPathIndices: newPathIndices2,
                userSecret,
                oldRandomness: randomness1,
                newRandomness: randomness2
            }
            const {proof: proof2, publicSignals: publicSignals2} = await snarkjs.plonk.fullProve(proofInputs2, wasm, zkey);
            const res2 = await snarkjs.plonk.verify(vKey, publicSignals2, proof2);
            chai.expect(res2).to.be.true;
    
            const proofCalldata2 = extractProofCalldata(proof2);
            const publicInputs2 = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot2,
                nullifier: depositNullifier
            }
            const txHash2 = await moriContract.write.deposit({args: [publicInputs2, proofCalldata2, commitment]});
            await walletClient.waitForTransactionReceipt({hash: txHash2});

            // Should fail to deposit with the same nullifier
            chai.expect(moriContract.write.deposit({args: [publicInputs2, proofCalldata2, commitment], value: depositAmount})).to.eventually.be.rejectedWith('Error: NullifierAlreadySpent()');
        })

        it('should fail to deposit with an unseen oldRoot', async () => {
            const depositAmount = 1000000000000000000n; // 1 ETH
            const depositCurrencyAddress = wethContract.address;
            const depositNullifier = 0;
            const oldRoot = await moriContract.read.root();
            const leafIndex = await moriContract.read.nextIndex();
            const commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount, 0]));
            const userSecret = poseidon.F.toString(123); // Arbitrary user secret
            const randomness = poseidon.F.toString(456); // Arbitrary randomness
            const { pathElements: oldPathElements, pathIndices: oldPathIndices } = tree.getPath(leafIndex);
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);
    
            const proofInputs = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier: depositNullifier,
                currentBalance: 0,
                oldPathElements,
                oldPathIndices,
                newPathElements,
                newPathIndices,
                userSecret,
                oldRandomness: 0,
                newRandomness: randomness
            }
            const { wasm, zkey, vKey } = getProofFiles('Deposit');
            const {proof, publicSignals} = await snarkjs.plonk.fullProve(proofInputs, wasm, zkey);
            // TODO remove this when we have solidity verifier working
            const res = await snarkjs.plonk.verify(vKey, publicSignals, proof);
            chai.expect(res).to.be.true;
            
            const proofCalldata = extractProofCalldata(proof);
            const publicInputs = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: 0,
                nullifier: depositNullifier
            }
            // Should fail to deposit with an unseen oldRoot
            chai.expect(moriContract.write.deposit({args: [publicInputs, proofCalldata, commitment]})).to.eventually.be.rejectedWith('Error: ProofInvalid()');
        })
    })

    describe('Withdrawal', () => {
        const userSecret: string  = '123';
        let initialProofInputs: DepositProofInputs;


        beforeEach(async () => {
            // Make a deposit that we can withdrawFrom
            const depositAmount = 1000000000000000000n; // 1 ETH
            const depositCurrencyAddress = wethContract.address; // ETH
            const depositNullifier = 0;
            const oldRoot = await moriContract.read.root();
            const leafIndex = await moriContract.read.nextIndex();
            const initialDepositRandomness = '456'; // Arbitrary randomness
            const commitment = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount, initialDepositRandomness]));
            const { pathElements: oldPathElements, pathIndices: oldPathIndices } = tree.getPath(leafIndex);
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);

            initialProofInputs = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier: depositNullifier,
                currentBalance: 0n,
                oldPathElements,
                oldPathIndices,
                newPathElements,
                newPathIndices,
                userSecret,
                oldRandomness: '0',
                newRandomness: initialDepositRandomness
            }
            const { wasm, zkey } = getProofFiles('Deposit');
            const {proof} = await snarkjs.plonk.fullProve(initialProofInputs, wasm, zkey);
            const proofCalldata = extractProofCalldata(proof);
            // console.log('proofCalldata', proofCalldata); // TODO: Use to precompute
            
            // Precomputed proof calldata for the above inputs
            // const proofCalldata = [
            //     '10090095715964392542920529034596032470106372710301487740526140440531370986350',
            //     '16518005268374100749762226813913368625412786136554027533213477145104208201848',
            //     '1033919314821562314307394890410360809574986649951190873840702877184399039554',
            //     '3629762136433744728183838626103168798244893593404557473414954827961503590445',
            //     '1836535496013421261246211158532268183611538755029521243937767616198855612496',
            //     '19562481113820851373530863683806649753741285093345850645546686698466794689554',
            //     '4061812234970613859943468499993728423254770916341392633653314608368760178558',
            //     '8982436985943695636254623717590232137669676052212423095135075934550138119385',
            //     '8855354023262650499774731140039249151067766497965680958399675161816186416004',
            //     '11757940600015940446961633902927901570476194724475627777491087755987523966462',
            //     '18262847633794026942014077505582130625377623959153036882989154980812660224270',
            //     '16451798136732786634262790762287134831068075434048610938453589055624445392449',
            //     '12012051653833855137406936299815031623010710684869654534646827924262712614430',
            //     '14967354014520943682333319632078905361062977217195165156590102658337817497159',
            //     '3359666372623918315498664177122271782161869008423352598041609067282582103302',
            //     '19882073856079585407345754212533238130555945339811879645893429259684754751090',
            //     '21616650650861099827073660301389973694528570116715077010194997789864145452125',
            //     '868368073642125652595997169153389844716406162481028207819484090930881330962',
            //     '9214380951858876843006871365676117372500992332270432267074563715535902958246',
            //     '17422677853411129989157379234825250146669776915603641629089086120446281101536',
            //     '3318509966228662455098056483832200693467500286584871975995292323113534354975',
            //     '4078967856045825421954168011662032390970358183763995800245495997555570133184',
            //     '15119547448043155749296542315315880259536026521537626378713728172552671965722',
            //     '420514886442149524876379637276539388957427030870465938944701149523730557521'
            //   ];
            const publicInputs = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: depositNullifier
            }
            const txHash = await moriContract.write.deposit({args: [publicInputs, proofCalldata, commitment]});
            await walletClient.waitForTransactionReceipt({hash: txHash});
        })

        it('should allow a withdrawal', async () => {
            const withdrawalAmount = 500000000000000000n; // 0.5 ETH
            const withdrawalCurrencyAddress = wethContract.address; // ETH
            const oldRoot = await moriContract.read.root();
            const leafIndex = await moriContract.read.nextIndex();
            const randomness = '12312123'; // Arbitrary randomness
            const commitment = poseidon.F.toString(poseidon([withdrawalCurrencyAddress, initialProofInputs.depositAmount - withdrawalAmount, randomness]));
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);

            const oldLeafValue = poseidon.F.toString(poseidon([initialProofInputs.currencyAddress, initialProofInputs.depositAmount, initialProofInputs.newRandomness]))
            const nullifier = poseidon.F.toString(poseidon([userSecret, oldLeafValue]))

            const proofInputs = {
                withdrawalAmount,
                currencyAddress: withdrawalCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier,
                currentBalance: initialProofInputs.depositAmount,
                oldPathElements: initialProofInputs.newPathElements,
                oldPathIndices: initialProofInputs.newPathIndices,
                newPathElements,
                newPathIndices,
                oldRandomness: initialProofInputs.newRandomness,
                newRandomness: randomness,
                userSecret
            }

            const { wasm, zkey } = getProofFiles('Withdrawal');
            const {proof} = await snarkjs.plonk.fullProve(proofInputs, wasm, zkey);
            const proofCalldata = extractProofCalldata(proof);
            const publicInputs = {
                withdrawalAmount: withdrawalAmount,
                currencyAddress: withdrawalCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: nullifier
            }
            const destination = '0x0000000000000000000000000000000000000001';
            const txHash = await moriContract.write.withdraw({args: [publicInputs, proofCalldata, commitment, destination]});
            await walletClient.waitForTransactionReceipt({hash: txHash});
            
            const moriBalance = await wethContract.read.balanceOf({args: [moriContract.address]});
            const destinationBalance = await wethContract.read.balanceOf({args: [destination]});
            chai.expect(moriBalance).to.eq(initialProofInputs.depositAmount - withdrawalAmount);
            chai.expect(destinationBalance).to.eq(500002831997625863n);
        })

        it('should not allow a withdrawal greater than the current balance', async () => {
            const withdrawalAmount = 1000000000000000000n; // 1 ETH
            const withdrawalCurrencyAddress = wethContract.address; // ETH
            const oldRoot = await moriContract.read.root();
            const leafIndex = await moriContract.read.nextIndex();
            const randomness = '12312123'; // Arbitrary randomness
            const commitment = poseidon.F.toString(poseidon([withdrawalCurrencyAddress, initialProofInputs.depositAmount - withdrawalAmount, randomness]));
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, commitment);

            const oldLeafValue = poseidon.F.toString(poseidon([initialProofInputs.currencyAddress, initialProofInputs.depositAmount, initialProofInputs.newRandomness]))
            const nullifier = poseidon.F.toString(poseidon([userSecret, oldLeafValue]))


            // Initially valid so we can get valid proof inputs; we will submit invalid inputs onchain.
            const proofInputs = {
                withdrawalAmount,
                currencyAddress: withdrawalCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier,
                currentBalance: initialProofInputs.depositAmount,
                oldPathElements: initialProofInputs.newPathElements,
                oldPathIndices: initialProofInputs.newPathIndices,
                newPathElements,
                newPathIndices,
                oldRandomness: initialProofInputs.newRandomness,
                newRandomness: randomness,
                userSecret
            }

            const { wasm, zkey } = getProofFiles('Withdrawal');
            chai.expect(snarkjs.plonk.fullProve({...proofInputs, withdrawalAmount: 5000000000000000000n}, wasm, zkey)).to.be.rejectedWith('Assert Failed');

            const {proof} = await snarkjs.plonk.fullProve(proofInputs, wasm, zkey);
            const proofCalldata = extractProofCalldata(proof);
            const publicInputs = {
                withdrawalAmount: 5000000000000000000n, // 5 ETH, more than the current balance
                currencyAddress: withdrawalCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: nullifier
            }
            const destination = '0x0000000000000000000000000000000000000001';
            chai.expect(moriContract.write.withdraw({args: [publicInputs, proofCalldata, commitment, destination]})).to.be.rejectedWith('Error: ProofInvalid()');
        })
    })

    // TODO: deploy uniswap, seed a pool, etc, etc. For now, test with forge and on testnet 
    xdescribe('Swap', () => {
        const userSecret: string  = '13132123';
        let initialProofInputs: DepositProofInputs;
        let initialDepositLeafValue: string;

        beforeEach(async () => {
            // Make a deposit that we can withdrawFrom
            const depositAmount = 1000000000000000000n; // 1 ETH
            const depositCurrencyAddress = wethContract.address; // ETH
            const depositNullifier = 0;
            const oldRoot = await moriContract.read.root();
            const leafIndex = await moriContract.read.nextIndex();
            const initialDepositRandomness = '456'; // Arbitrary randomness
            initialDepositLeafValue = poseidon.F.toString(poseidon([depositCurrencyAddress, depositAmount, initialDepositRandomness]));
            const { pathElements: oldPathElements, pathIndices: oldPathIndices } = tree.getPath(leafIndex);
            const { pathElements: newPathElements, pathIndices: newPathIndices, root: newRoot } = tree.updateLeaf(leafIndex, initialDepositLeafValue);

            initialProofInputs = {
                depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot,
                newRoot,
                nullifier: depositNullifier,
                currentBalance: 0n,
                oldPathElements,
                oldPathIndices,
                newPathElements,
                newPathIndices,
                userSecret,
                oldRandomness: '0',
                newRandomness: initialDepositRandomness
            }
            // const { wasm, zkey } = getProofFiles('Deposit');
            // const {proof} = await snarkjs.plonk.fullProve(initialProofInputs, wasm, zkey);
            // const proofCalldata = extractProofCalldata(proof);
            // console.log('proofCalldata', proofCalldata); // TODO: Use to precompute
            
            // Precomputed proof calldata for the above inputs
            const proofCalldata = [
                '10090095715964392542920529034596032470106372710301487740526140440531370986350',
                '16518005268374100749762226813913368625412786136554027533213477145104208201848',
                '1033919314821562314307394890410360809574986649951190873840702877184399039554',
                '3629762136433744728183838626103168798244893593404557473414954827961503590445',
                '1836535496013421261246211158532268183611538755029521243937767616198855612496',
                '19562481113820851373530863683806649753741285093345850645546686698466794689554',
                '4061812234970613859943468499993728423254770916341392633653314608368760178558',
                '8982436985943695636254623717590232137669676052212423095135075934550138119385',
                '8855354023262650499774731140039249151067766497965680958399675161816186416004',
                '11757940600015940446961633902927901570476194724475627777491087755987523966462',
                '18262847633794026942014077505582130625377623959153036882989154980812660224270',
                '16451798136732786634262790762287134831068075434048610938453589055624445392449',
                '12012051653833855137406936299815031623010710684869654534646827924262712614430',
                '14967354014520943682333319632078905361062977217195165156590102658337817497159',
                '3359666372623918315498664177122271782161869008423352598041609067282582103302',
                '19882073856079585407345754212533238130555945339811879645893429259684754751090',
                '21616650650861099827073660301389973694528570116715077010194997789864145452125',
                '868368073642125652595997169153389844716406162481028207819484090930881330962',
                '9214380951858876843006871365676117372500992332270432267074563715535902958246',
                '17422677853411129989157379234825250146669776915603641629089086120446281101536',
                '3318509966228662455098056483832200693467500286584871975995292323113534354975',
                '4078967856045825421954168011662032390970358183763995800245495997555570133184',
                '15119547448043155749296542315315880259536026521537626378713728172552671965722',
                '420514886442149524876379637276539388957427030870465938944701149523730557521'
              ];
            const publicInputs = {
                depositAmount: depositAmount,
                currencyAddress: depositCurrencyAddress,
                oldRoot: oldRoot,
                newRoot: newRoot,
                nullifier: depositNullifier
            }
            const txHash = await moriContract.write.deposit({args: [publicInputs, proofCalldata, initialDepositLeafValue], value: depositAmount});
            await walletClient.waitForTransactionReceipt({hash: txHash});
        })

        it('should allow a swap', async() => {
            const withdrawalAmount = 500000000000000000n; // 0.5 ETH
            const withdrawalNullifier = poseidon.F.toString(poseidon([userSecret, initialDepositLeafValue]));
            const withdrawalCurrencyAddress = '0x0000000000000000000000000000000000000000'; // ETH

            
        })
    })
});

// TODO list of tests
// ERC-20 Deposits
// ERC-20 Withdrawals
// Cannot reference non-existent historical root
// ETH -> ERC20 Trade
// ERC20 -> ETH Trade
// ERC20 -> ERC20 Trade
//  ^^ For Trades, test that slippage is captured correctly