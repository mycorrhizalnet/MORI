pragma circom 2.2.1;

include "./WithdrawalTemplate.circom";

component main {public [withdrawalAmount, currencyAddress, oldRoot, newRoot, nullifier]} = Withdrawal(20);