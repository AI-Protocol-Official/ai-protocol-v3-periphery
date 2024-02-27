// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../bonding_curves/ProtocolFeeDistributorV1.sol";

/**
 * @title Malicious Fee Distributor
 *
 * @notice Tries to consume all the gas when payment is sent
 */
contract MaliciousFeeDistributor is ProtocolFeeDistributorV1 {
	// Function to receive Ether. msg.data must be empty
	receive() external payable override {
		// try to consume all the gas and fail the entire transaction
		uint256 i = 0;
		while(true) {
			i++;
		}
	}
}
