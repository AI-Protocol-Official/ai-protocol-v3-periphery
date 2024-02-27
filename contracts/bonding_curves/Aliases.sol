// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ERC20Shares.sol";
import "./ETHShares.sol";
import "./TradeableShares.sol";

/**
 * @title Tradeable Keys Alias
 *
 * @notice Displays the function names using the "keys" word instead of "shares"
 *      in MetaMask, Etherscan, etc.
 */
interface TradeableKeys is TradeableShares {
	/**
	 * @notice buyShares alias
	 */
	function buyKeys(uint256 amount) external payable;

	/**
	 * @notice buySharesTo alias
	 */
	function buyKeysTo(uint256 amount, address beneficiary) external payable;

	/**
	 * @notice sellShares alias
	 */
	function sellKeys(uint256 amount) external;

	/**
	 * @notice sellSharesTo alias
	 */
	function sellKeysTo(uint256 amount, address payable beneficiary) external;
}

/**
 * @title ERC20 Keys Alias
 *
 * @notice Displays the function names using the "keys" word instead of "shares"
 *      in MetaMask, Etherscan, etc.
 */
contract ERC20Keys is ERC20Shares, TradeableKeys {
	constructor(address _owner, SharesSubject memory _sharesSubject, address _protocolFeeDestination, uint64 _protocolFeePercent, HoldersRewardsDistributor _holdersFeeDestination, uint64 _holdersFeePercent, uint64 _subjectFeePercent, uint256 _amount, address _beneficiary, ERC1363 _paymentToken
	) ERC20Shares(      _owner,                      _sharesSubject,         _protocolFeeDestination,        _protocolFeePercent,                           _holdersFeeDestination,        _holdersFeePercent,        _subjectFeePercent,         _amount,         _beneficiary,         _paymentToken){}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function buyKeys(uint256 amount) public payable {
		buyShares(amount);
	}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function buyKeysTo(uint256 amount, address beneficiary) public payable {
		buySharesTo(amount, beneficiary);
	}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function sellKeys(uint256 amount) public {
		sellShares(amount);
	}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function sellKeysTo(uint256 amount, address payable beneficiary) public {
		sellSharesTo(amount, beneficiary);
	}
}

/**
 * @title ETH Keys Alias
 *
 * @notice Displays the function names using the "keys" word instead of "shares"
 *      in MetaMask, Etherscan, etc.
 */
contract ETHKeys is ETHShares, TradeableKeys {
	constructor(address _owner, SharesSubject memory _sharesSubject, address _protocolFeeDestination, uint64 _protocolFeePercent, HoldersRewardsDistributor _holdersFeeDestination, uint64 _holdersFeePercent, uint64 _subjectFeePercent, uint256 _amount, address _beneficiary
	) ETHShares(        _owner,                      _sharesSubject,         _protocolFeeDestination,        _protocolFeePercent,                           _holdersFeeDestination,        _holdersFeePercent,        _subjectFeePercent,         _amount,         _beneficiary){}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function buyKeys(uint256 amount) public payable {
		buyShares(amount);
	}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function buyKeysTo(uint256 amount, address beneficiary) public payable {
		buySharesTo(amount, beneficiary);
	}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function sellKeys(uint256 amount) public {
		sellShares(amount);
	}

	/**
	 * @inheritdoc TradeableKeys
	 */
	function sellKeysTo(uint256 amount, address payable beneficiary) public {
		sellSharesTo(amount, beneficiary);
	}
}
