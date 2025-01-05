pragma circom 2.2.1;

include "./DepositTemplate.circom";

component main {public [depositAmount, currencyAddress, oldRoot, newRoot, nullifier]} = Deposit(20);