// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import { ERC20Burnable, ERC20 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract MoriToken is ERC20Burnable {
    constructor(address[] memory _initialRecipients, uint256[] memory _initialAmounts) ERC20("Mori", "MORI") {
        uint256 desiredTotalSupply = 1_000_000_000 * 10 ** 18; // 1 billion $MORI
        uint256 initialSupply = 0;

        require(_initialRecipients.length == _initialAmounts.length, "MoriToken: initialRecipients and initialAmounts must have the same length");
        for (uint256 i = 0; i < _initialRecipients.length; i++) {
            // TODO: implement mDrops or timelocks for initial distribution
            _mint(_initialRecipients[i], _initialAmounts[i]);
            initialSupply += _initialAmounts[i];
        }

        require(initialSupply == desiredTotalSupply, "MoriToken: initialSupply must equal desiredTotalSupply");
    }
}
