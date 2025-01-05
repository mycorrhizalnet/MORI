pragma circom 2.2.1;

include "./SwapTemplate.circom";

component main {public [oldRoot, newRoot, intermediateTokenRoot, withdrawalAmount, withdrawalNullifier, withdrawalCurrencyAddress, depositAmount, depositNullifier, depositCurrencyAddress]} = Swap(20);