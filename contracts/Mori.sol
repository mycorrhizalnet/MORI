// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {SparseMerkleTreeWithHistory} from "./SparseMerkleTreeWithHistory.sol";
import {ISwapRouter} from './interfaces/ISwapRouter.sol';
import {SwapVerifier} from "./SwapVerifier.sol";
import {DepositVerifier} from "./DepositVerifier.sol";
import {WithdrawalVerifier} from "./WithdrawalVerifier.sol";
import {IWETH9} from "./interfaces/IWETH9.sol";

contract Mori is SparseMerkleTreeWithHistory {
    SwapVerifier public swapVerifier;
    DepositVerifier public depositVerifier;
    WithdrawalVerifier public withdrawalVerifier;
    ISwapRouter public swapRouter;
    ERC20Burnable public moriToken;
    IWETH9 public weth;
    mapping(uint256 => bool) public spentNullifiers;

    event DepositProcessed(uint256 indexed nullifier, address indexed currencyAddress, uint256 depositAmount);
    event WithdrawalProcessed(uint256 indexed nullifier, address indexed currencyAddress, address indexed destination, uint256 withdrawalAmount);
    event SwapProcessed(
        uint256 indexed nullifier,
        address indexed inputCurrencyAddress,
        address indexed outputCurrencyAddress,
        uint256 inputAmount,
        uint256 outputAmount
    );
    event TreeUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event BuyBurned(uint256 ethSpent, uint256 moriBurned);

    error ProofInvalid();
    error DepositAmountTooSmall();
    error ERC20TransferFailed();
    error InvalidHistoricalRoot();
    error NullifierAlreadySpent();
    error WethSwapRequired(); // For now, we only allow swaps between ETH and any ERC-20, not between two ERC-20s

    struct DepositPublicInputs {
        uint256 depositAmount;
        address currencyAddress;
        uint256 oldRoot;
        uint256 newRoot;
        uint256 nullifier;
    }

    struct WithdrawalPublicInputs {
        uint256 withdrawalAmount;
        address currencyAddress;
        uint256 oldRoot;
        uint256 newRoot;
        uint256 nullifier;
    }

    struct SwapPublicInputs {
        uint256 oldRoot;
        uint256 newRoot;
        uint256 intermediateTokenRoot;
        uint256 withdrawalAmount;
        uint256 withdrawalNullifier;
        address withdrawalCurrencyAddress;
        uint256 depositAmount;
        uint256 depositNullifier;
        address depositCurrencyAddress;
    }

    modifier onlyValidHistoricalRoot(uint256 _root) {
        // Don't allow arbitrary roots in the provided proof inputs, only the current or stored historical roots    
        if (!historicalRoots[_root] && _root != root) {
            revert InvalidHistoricalRoot();
        }
        _;
    }

    modifier onlyUnspentNullifier(uint256 _nullifier) {
        // Avoid double spending by validating against the global spent nullifier set
        if (_nullifier != 0 && spentNullifiers[_nullifier]) {
            revert NullifierAlreadySpent();
        }
        _;
    }

    constructor(
        SwapVerifier _swapVerifier,
        DepositVerifier _depositVerifier,
        WithdrawalVerifier _withdrawalVerifier,
        ISwapRouter _swapRouter,
        ERC20Burnable _moriToken,
        IWETH9 _weth,
        uint32 _levels,
        address _poseidonContract
    ) SparseMerkleTreeWithHistory(_levels, _poseidonContract) {
        swapVerifier = _swapVerifier;
        depositVerifier = _depositVerifier;
        withdrawalVerifier = _withdrawalVerifier;
        swapRouter = _swapRouter;
        moriToken = _moriToken;
        weth = _weth;
    }

    /**
     * @dev Deposit funds into Mori.
     * @param _publicInputs The public inputs for the deposit proof.
     * @param _proof The proof for the deposit.
     * @param _commitment The commitment for the deposit Poseidon(currencyAddress, depositAmount, randomness). It is imperative that the commitment is provided by the user is valid, or else they will lose access to their funds.
     */
    function deposit(DepositPublicInputs calldata _publicInputs, uint256[24] calldata _proof, uint256 _commitment) external onlyValidHistoricalRoot(_publicInputs.oldRoot) onlyUnspentNullifier(_publicInputs.nullifier) returns (uint32) {
        _acceptDepositFunds(_publicInputs.depositAmount, _publicInputs.currencyAddress);

        uint256[5] memory pubSignals = [
            _publicInputs.depositAmount,
            uint256(uint160(_publicInputs.currencyAddress)),
            _publicInputs.oldRoot,
            _publicInputs.newRoot,
            _publicInputs.nullifier
        ];
        bool isValidDepositPrrof = depositVerifier.verifyProof(_proof, pubSignals);
        if (!isValidDepositPrrof) {
            revert ProofInvalid();
        }

        // Insert the leaf into the tree
        uint32 leafIndex = _insertLeaf(_commitment);

        spentNullifiers[_publicInputs.nullifier] = true;

        emit DepositProcessed(_publicInputs.nullifier, _publicInputs.currencyAddress, _publicInputs.depositAmount);

        return leafIndex;
    }

    /**
     * @dev Withdraw funds from Mori.
     * @param _publicInputs The public inputs for the withdrawal proof.
     * @param _proof The proof for the withdrawal.
     * @param _commitment The commitment for the withdrawal Poseidon(currencyAddress, withdrawalAmount, randomness). It is imperative that the commitment is provided by the user is valid, or else they will lose access to their funds.
     */
    function withdraw(WithdrawalPublicInputs calldata _publicInputs, uint256[24] calldata _proof, uint256 _commitment, address _destination) external onlyValidHistoricalRoot(_publicInputs.oldRoot) onlyUnspentNullifier(_publicInputs.nullifier) returns (uint32) {
        uint256[5] memory pubSignals = [
            _publicInputs.withdrawalAmount,
            uint256(uint160(_publicInputs.currencyAddress)),
            _publicInputs.oldRoot,
            _publicInputs.newRoot,
            _publicInputs.nullifier
        ];
        bool isValidWithdrawalProof = withdrawalVerifier.verifyProof(_proof, pubSignals);
        if (!isValidWithdrawalProof) {
            revert ProofInvalid();
        }

        // Insert the leaf into the tree
        uint32 leafIndex = _insertLeaf(_commitment);

        spentNullifiers[_publicInputs.nullifier] = true;

        _sendWithdrawalFunds(_publicInputs.withdrawalAmount, _publicInputs.currencyAddress, _destination);

        emit WithdrawalProcessed(_publicInputs.nullifier, _publicInputs.currencyAddress, _destination, _publicInputs.withdrawalAmount);

        return leafIndex;
    }

    /**
     * @dev Swap funds between Mori. Any realized slippage is used to buy and burn $MORI.
     * @param _publicInputs The public inputs for the swap proof.
     * @param _proof The proof for the swap.
     * @param _depositCommitment The commitment for the deposit Poseidon(currencyAddress, depositAmount, randomness). It is imperative that the commitment is provided by the user is valid, or else they will lose access to their funds.
     * @param _withdrawalCommitment The commitment for the withdrawal Poseidon(currencyAddress, withdrawalAmount, randomness). It is imperative that the commitment is provided by the user is valid, or else they will lose access to their funds.
     */
    function swap(SwapPublicInputs calldata _publicInputs, uint256[24] calldata _proof, uint256 _depositCommitment, uint256 _withdrawalCommitment, uint24 _poolFee) external onlyValidHistoricalRoot(_publicInputs.oldRoot) onlyUnspentNullifier(_publicInputs.withdrawalNullifier) onlyUnspentNullifier(_publicInputs.depositNullifier) returns (uint32, uint32) {
        uint256[9] memory pubSignals = [
            _publicInputs.oldRoot,
            _publicInputs.newRoot,
            _publicInputs.intermediateTokenRoot,
            _publicInputs.withdrawalAmount,
            _publicInputs.withdrawalNullifier,
            uint256(uint160(_publicInputs.withdrawalCurrencyAddress)),
            _publicInputs.depositAmount,
            _publicInputs.depositNullifier,
            uint256(uint160(_publicInputs.depositCurrencyAddress))
        ];
        bool isValidSwapProof = swapVerifier.verifyProof(_proof, pubSignals);
        if (!isValidSwapProof) {
            revert ProofInvalid();
        }

        // Perform the swap on uniswap
        _performSwap(_publicInputs, _poolFee);

        // Insert the withdrawal leaf into the tree (i.e. the token being received by the user)
        uint32 withdrawalLeafIndex = _insertLeaf(_withdrawalCommitment);
        // Insert the deposit leaf into the tree (i.e. the token being spent by the user)
        uint32 depositLeafIndex = _insertLeaf(_depositCommitment);


        spentNullifiers[_publicInputs.withdrawalNullifier] = true;
        spentNullifiers[_publicInputs.depositNullifier] = true;

        emit SwapProcessed(_publicInputs.withdrawalNullifier, _publicInputs.withdrawalCurrencyAddress, _publicInputs.depositCurrencyAddress, _publicInputs.withdrawalAmount, _publicInputs.depositAmount);

        return (withdrawalLeafIndex, depositLeafIndex); // Return the leaf indices for the withdrawal and deposit
    }

    function _performSwap(SwapPublicInputs calldata _publicInputs, uint24 _poolFee) internal {
        if(_publicInputs.withdrawalCurrencyAddress != address(weth) && _publicInputs.depositCurrencyAddress != address(weth)) {
            revert WethSwapRequired(); // We only support swaps between WETH and any ERC-20 for now
        }

        // Approve the swapRouter to spend the withdrawal currency
        IERC20(_publicInputs.withdrawalCurrencyAddress).approve(address(swapRouter), _publicInputs.withdrawalAmount);

        if(_publicInputs.withdrawalCurrencyAddress == address(weth)) {
            // If we're going from WETH to an ERC-20, we want to do a swapExactOutputSingle
            uint256 wethSpent = swapRouter.exactOutputSingle(
                ISwapRouter.ExactOutputSingleParams({
                    tokenIn: _publicInputs.withdrawalCurrencyAddress,
                    tokenOut: _publicInputs.depositCurrencyAddress,
                    fee: _poolFee,
                    recipient: address(this),
                    amountOut: _publicInputs.depositAmount,
                    amountInMaximum: _publicInputs.withdrawalAmount,
                    sqrtPriceLimitX96: 0
                })
            );
            if(wethSpent < _publicInputs.withdrawalAmount) {
                _buyBurnWithSlippage(_publicInputs.withdrawalAmount - wethSpent);
            }
        } else {
            // Else if we're going from an ERC-20 to ETH, we want to do a swapExactInputSingle
            uint256 wethReceived = swapRouter.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: _publicInputs.withdrawalCurrencyAddress,
                    tokenOut: _publicInputs.depositCurrencyAddress,
                    fee: _poolFee,
                    recipient: address(this),
                    amountIn: _publicInputs.withdrawalAmount,
                    amountOutMinimum: _publicInputs.depositAmount,
                    sqrtPriceLimitX96: 0
                })
            );
            if(wethReceived > _publicInputs.depositAmount) {
                _buyBurnWithSlippage(wethReceived - _publicInputs.depositAmount);
            }
        }
    }

    function _buyBurnWithSlippage(uint256 _amount) internal {
        weth.approve(address(swapRouter), _amount);
        uint256 tokensBought = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(weth),
                tokenOut: address(moriToken),
                fee: 10000,
                recipient: address(this),
                amountIn: _amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        moriToken.burn(tokensBought);
        emit BuyBurned(_amount, tokensBought);
    }

    function _acceptDepositFunds(uint256 _amount, address _currencyAddress) internal {
        // If the currency is 0x0 (eth), validate the msg.value. Else, sweep the currency from the user
        uint256 balanceBefore = IERC20(_currencyAddress).balanceOf(address(this));
        bool success = IERC20(_currencyAddress).transferFrom(msg.sender, address(this), _amount);
        uint256 balanceAfter = IERC20(_currencyAddress).balanceOf(address(this));
        // Don't allow erc-20s with transfer fees, and fail if the transfer didn't succeed
        if (balanceAfter - balanceBefore != _amount || !success) {
            revert ERC20TransferFailed();
        }
    }

    function _sendWithdrawalFunds(uint256 _amount, address _currencyAddress, address _destination) internal {
        bool success = IERC20(_currencyAddress).transfer(_destination, _amount);
        if (!success) {
            revert ERC20TransferFailed();
        }
    }
}
