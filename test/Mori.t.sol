pragma solidity ^0.8.0;

import {Mori} from "../contracts/Mori.sol";
import {PoseidonDeployer} from "../contracts/PoseidonDeployer.sol";
import { SwapVerifier } from "../contracts/SwapVerifier.sol";
import { DepositVerifier } from "../contracts/DepositVerifier.sol";
import { WithdrawalVerifier } from "../contracts/WithdrawalVerifier.sol";
import { MoriToken } from "../contracts/MoriToken.sol";
import { Test } from "forge-std/Test.sol";
import {IUniswapV3Pool} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import {IUniswapV3Factory} from '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import {IERC721Receiver} from '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import {ISwapRouter} from '../contracts/interfaces/ISwapRouter.sol';
import {INonfungiblePositionManager} from './interfaces/INonfungiblePositionManager.sol';
import {WETH9} from '../contracts/WETH9.sol';
import {IWETH9} from '../contracts/interfaces/IWETH9.sol';
import {TickMath} from "./TickMath.sol";
import {console} from "forge-std/console.sol";

interface IPoseidon {
    function poseidon(uint256[2] calldata inputs) external pure returns (uint256);
}


contract MoriTestHarness is Mori {
    constructor(SwapVerifier _swapVerifier, DepositVerifier _depositVerifier, WithdrawalVerifier _withdrawalVerifier, ISwapRouter _swapRouter, MoriToken _moriToken, IWETH9 _weth, uint32 _levels, address _poseidonContract) Mori(_swapVerifier, _depositVerifier, _withdrawalVerifier, _swapRouter, _moriToken, _weth, _levels, _poseidonContract) {}

    function performSwap(SwapPublicInputs calldata _publicInputs, uint24 _poolFee) public {
        _performSwap(_publicInputs, _poolFee);
    }

    function buyBurnWithSlippage(uint256 _amount) public {
        _buyBurnWithSlippage(_amount);
    }

    function acceptDepositFunds(uint256 _amount, address _currencyAddress) public {
        _acceptDepositFunds(_amount, _currencyAddress);
    }

    function sendWithdrawalFunds(uint256 _amount, address _currencyAddress, address _destination) public {
        _sendWithdrawalFunds(_amount, _currencyAddress, _destination);
    }
}


contract MoriTest is Test, IERC721Receiver {
    MoriTestHarness mori;
    IPoseidon poseidon;
    SwapVerifier swapVerifier;
    DepositVerifier depositVerifier;
    WithdrawalVerifier withdrawalVerifier;
    ISwapRouter uniswapRouter;
    INonfungiblePositionManager nonfungiblePositionManager;
    MoriToken moriToken;
    IWETH9 weth;
    IUniswapV3Factory uniswapFactory;
    IUniswapV3Pool uniswapPool;

    function setUp() public {
        PoseidonDeployer poseidonDeployer = new PoseidonDeployer();
        poseidon = IPoseidon(poseidonDeployer.deploy());
        swapVerifier = new SwapVerifier();
        depositVerifier = new DepositVerifier();
        withdrawalVerifier = new WithdrawalVerifier();
        uniswapRouter = ISwapRouter(0x2626664c2603336E57B271c5C0b26F421741e481); // Base mainnet address, assume we're running a fork test
        nonfungiblePositionManager = INonfungiblePositionManager(0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1); // Base mainnet address, assume we're running a fork test
        uniswapFactory = IUniswapV3Factory(0x33128a8fC17869897dcE68Ed026d694621f6FDfD); // Base mainnet address, assume we're running a fork test
        weth = IWETH9(payable(0x4200000000000000000000000000000000000006)); // Base mainnet address, assume we're running a fork test

        address[] memory initialRecipients = new address[](1);
        uint256[] memory initialAmounts = new uint256[](1);
        initialRecipients[0] = address(this);
        initialAmounts[0] = 1_000_000_000 * 10 ** 18; // 1 billion $MORI
        moriToken = new MoriToken(initialRecipients, initialAmounts);
        mori = new MoriTestHarness(swapVerifier, depositVerifier, withdrawalVerifier, uniswapRouter, moriToken, weth, 20, address(poseidon));

        // Deploy a uniswap pool for MORI/ETH
        uint24 poolFee = 10000; // 1% fee
        moriToken.approve(address(nonfungiblePositionManager), type(uint256).max);
        weth.deposit{value: 1 ether}(); // Deposit some weth just in case we need it
        weth.approve(address(nonfungiblePositionManager), type(uint256).max);
        nonfungiblePositionManager.positions(1);
        uint256 initialPoolSize = moriToken.balanceOf(address(this)) / 2;
        int24 tickLower = -887200;
        int24 tickUpper = 219200;
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tickUpper);
        uniswapPool = IUniswapV3Pool(nonfungiblePositionManager.createAndInitializePoolIfNecessary(address(weth), address(moriToken), poolFee, sqrtPriceX96));
        nonfungiblePositionManager.mint(INonfungiblePositionManager.MintParams({
            token0: address(weth),
            token1: address(moriToken),
            fee: poolFee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: 0,
            amount1Desired: initialPoolSize,
            amount0Min: 0,
            amount1Min: 0,
            recipient: address(this),
            deadline: block.timestamp
        }));
    }

    function test_constructor() public {
        assertEq(address(mori.poseidon()), address(poseidon));
        assertEq(address(mori.swapVerifier()), address(swapVerifier));
        assertEq(address(mori.depositVerifier()), address(depositVerifier));
        assertEq(address(mori.withdrawalVerifier()), address(withdrawalVerifier));
        assertEq(mori.levels(), 20);
    }

    function test_performSwapWethInNoSlippage() public {
        vm.deal(address(this), 1 ether);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(mori), 1 ether);

        Mori.SwapPublicInputs memory publicInputs = Mori.SwapPublicInputs({
            oldRoot: 0,
            newRoot: 0,
            intermediateTokenRoot: 0,
            withdrawalAmount: 1 ether,
            withdrawalNullifier: 0,
            withdrawalCurrencyAddress: address(weth),
            depositAmount: 433732883831740096357334024,
            depositNullifier: 0,
            depositCurrencyAddress: address(moriToken)
        });
        mori.performSwap(publicInputs, 10000);

        assertEq(moriToken.balanceOf(address(uniswapPool)), 66267116168259903642627952); // mori pool size after trade
        assertEq(weth.balanceOf(address(uniswapPool)), 1 ether); // weth pool size after trade
        assertEq(moriToken.totalSupply(), 1000000000000000000000000000); // no mori should be burned for an exact swap
        assertEq(weth.balanceOf(address(mori)), 0); // all weth should be spent
        assertEq(moriToken.balanceOf(address(mori)), 433732883831740096357334024); // all mori should be received
    }

    function test_performSwapWethInWithSlippage() public {
        vm.deal(address(this), 1 ether);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(mori), 1 ether);

        Mori.SwapPublicInputs memory publicInputs = Mori.SwapPublicInputs({
            oldRoot: 0,
            newRoot: 0,
            intermediateTokenRoot: 0,
            withdrawalAmount: 1 ether,
            withdrawalNullifier: 0,
            withdrawalCurrencyAddress: address(weth),
            depositAmount: 400000000000000000000000000, // Rounded down
            depositNullifier: 0,
            depositCurrencyAddress: address(moriToken)
        });
        mori.performSwap(publicInputs, 10000);

        assertEq(moriToken.balanceOf(address(uniswapPool)), 66267116168259903687566702); // mori pool size after trade
        assertEq(weth.balanceOf(address(uniswapPool)), 1 ether); // weth pool size after trade
        assertEq(moriToken.totalSupply(), 966267116168259903687604726); // mori should be burned for a swap with slippage
        assertEq(weth.balanceOf(address(mori)), 0); // all weth should be spent
        assertEq(moriToken.balanceOf(address(mori)), publicInputs.depositAmount); // all expected mori should be received, and the slippage should have gone and been burned already
    }

    function test_performSwapErc20InNoSlippage() public {
        vm.deal(address(this), 1 ether);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(mori), 1 ether);
        moriToken.transfer(address(mori), 1 ether);
        
        // Make a deposit to the pool so there is some liquidity available
        Mori.SwapPublicInputs memory depositPublicInputs = Mori.SwapPublicInputs({
            oldRoot: 0,
            newRoot: 0,
            intermediateTokenRoot: 0,
            withdrawalAmount: 1 ether,
            withdrawalNullifier: 0,
            withdrawalCurrencyAddress: address(weth),
            depositAmount: 433732883831740096357334024,
            depositNullifier: 0,
            depositCurrencyAddress: address(moriToken)
        });
        mori.performSwap(depositPublicInputs, 10000);

        // Now, perform a swap in the opposite direction
        Mori.SwapPublicInputs memory withdrawPublicInputs = Mori.SwapPublicInputs({
            oldRoot: 0,
            newRoot: 0,
            intermediateTokenRoot: 0,
            withdrawalAmount: 1 ether,
            withdrawalNullifier: 0,
            withdrawalCurrencyAddress: address(moriToken),
            depositAmount: 17049826580, // Expected amount of WETH to be received
            depositNullifier: 0,
            depositCurrencyAddress: address(weth)
        });
        uint256 wethBalanceBefore = weth.balanceOf(address(mori));
        mori.performSwap(withdrawPublicInputs, 10000);
        uint256 wethBalanceAfter = weth.balanceOf(address(mori));

        assertEq(moriToken.balanceOf(address(uniswapPool)), 66267117168259903642627952); // mori pool size after trade
        assertEq(weth.balanceOf(address(uniswapPool)), 999999982950173420); // weth pool size after trade
        assertEq(moriToken.totalSupply(), 1000000000000000000000000000); // no mori should be burned for an exact swap
        assertEq(weth.balanceOf(address(mori)), 17049826580); // all weth received should be in custody of mori now
        assertEq(wethBalanceAfter - wethBalanceBefore, withdrawPublicInputs.depositAmount); // all expected ETH should be received
    }

    function test_performSwapErc20InWithSlippage() public {
        vm.deal(address(this), 1 ether);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(mori), 1 ether);
        moriToken.transfer(address(mori), 1 ether);
        
        // Make a deposit to the pool so there is some liquidity available
        Mori.SwapPublicInputs memory depositPublicInputs = Mori.SwapPublicInputs({
            oldRoot: 0,
            newRoot: 0,
            intermediateTokenRoot: 0,
            withdrawalAmount: 1 ether,
            withdrawalNullifier: 0,
            withdrawalCurrencyAddress: address(weth),
            depositAmount: 433732883831740096357334024,
            depositNullifier: 0,
            depositCurrencyAddress: address(moriToken)
        });
        mori.performSwap(depositPublicInputs, 10000);

        // Now, perform a swap in the opposite direction
        Mori.SwapPublicInputs memory withdrawPublicInputs = Mori.SwapPublicInputs({
            oldRoot: 0,
            newRoot: 0,
            intermediateTokenRoot: 0,
            withdrawalAmount: 1 ether,
            withdrawalNullifier: 0,
            withdrawalCurrencyAddress: address(moriToken),
            depositAmount: 10000000000, // Rounded down amount of WETH to be received
            depositNullifier: 0,
            depositCurrencyAddress: address(weth)
        });
        uint256 moriBalanceBefore = moriToken.balanceOf(address(mori));
        mori.performSwap(withdrawPublicInputs, 10000);
        uint256 moriBalanceAfter = moriToken.balanceOf(address(mori));

        assertEq(moriToken.balanceOf(address(uniswapPool)), 66267116763004456653968634); // mori pool size after trade
        assertEq(weth.balanceOf(address(uniswapPool)), 999999990000000000); // weth pool size after trade
        assertEq(moriToken.totalSupply(), 999999999594744553011340682); // mori should be burned for a swap with slippage
        assertEq(weth.balanceOf(address(mori)), withdrawPublicInputs.depositAmount); // all excess weth should be used to buy-burn, so expect exact matching to input here
        assertEq(moriBalanceBefore - moriBalanceAfter, withdrawPublicInputs.withdrawalAmount); // exact amount of mori should've been used in the trade
    }

    function test_buyBurnWithSlippage() public {
        vm.deal(address(this), 1 ether);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(mori), 1 ether);

        assertEq(moriToken.balanceOf(address(uniswapPool)), 499999999999999999999961976); // initial pool size
        assertEq(moriToken.totalSupply(), 1000000000000000000000000000);
        mori.buyBurnWithSlippage(1 ether);
        assertEq(moriToken.balanceOf(address(uniswapPool)), 66267116168259903642627952);
        assertEq(moriToken.totalSupply(), 566267116168259903642665976);
    }


    function test_acceptDepositFunds() public {
        uint256 beforeBalance = weth.balanceOf(address(mori));
        vm.deal(address(this), 100 ether);
        weth.deposit{value: 1 ether}();
        weth.approve(address(mori), type(uint256).max);
        mori.acceptDepositFunds(1 ether, address(weth));
        uint256 afterBalance = weth.balanceOf(address(mori));
        assertEq(afterBalance - beforeBalance, 1 ether);
    }

    function test_sendWithdrawalFunds() public {
        vm.deal(address(this), 100 ether);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(mori), 1 ether);

        uint256 beforeMoriBalance = weth.balanceOf(address(mori));
        uint256 beforeUserBalance = weth.balanceOf(address(1));
        mori.sendWithdrawalFunds(1 ether, address(weth), address(1));
        uint256 afterMoriBalance = weth.balanceOf(address(mori));
        uint256 afterUserBalance = weth.balanceOf(address(1));

        assertEq(afterUserBalance - beforeUserBalance, 1 ether);
        assertEq(beforeMoriBalance - afterMoriBalance, 1 ether);
    }

    // For uniswap tests when we set up the pool
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override view returns (bytes4) {
        return this.onERC721Received.selector;
    }
}