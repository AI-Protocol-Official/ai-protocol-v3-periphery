// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./TradeableShares.sol";

/**
 * @title Hive Registry Interface
 *
 * @notice Smart contract managing the Registry of the Decentralized Pre-Trained Transformers (DPTs)
 *
 * @dev This contract extends UpgradeableAccessControl and provides functions
 *      to registerDPTRequest, registerDPT, and check the registration status of DPTs with the Hive.
 *
 */
interface HiveRegistry {

	/**
	 * @dev Register DPT Request is used to register NFT with the Hive via EIP712 meta-transactions
	 * @dev See `registerDPTRequest()`
	 */
	struct RegisterDPTRequest {
		/// @dev DPT token details
		TradeableShares.SharesSubject dpt;
		// @dev address of dpt holder
		address dptHolder;
		/// @dev unix timestamp when the request becomes valid
		uint256 validFromTimestamp;
		/// @dev unix timestamp when the request expires (becomes invalid)
		uint256 expiresAtTimestamp;
		/// @dev nonce of the request (sequential number, increased by one)
		uint256 nonce;
	}

	/**
	 * @dev Fired in registerDPT()
	 *
	 * @param by an address requested for DPT registration
	 * @param dptAddress DPT token address
	 * @param dptId DPT token ID
	 */
	event DPTRegistered(address indexed by, address indexed dptAddress, uint256 dptId);

	/**
	 * @dev Fired in `registerDPTRequest` and in `rewind`
	 */
	event NonceUsed(address indexed issuer, uint256 nonce);

	/**
	 * @notice Registers a DPT request with a valid signature.
	 *
	 * @param req The RegisterDPTRequest struct containing request details.
	 * @param signature The signature of the request.
	 */
	function registerDPTRequest(RegisterDPTRequest calldata req, bytes calldata signature) external;

	/**
	 * @notice Registers a DPT directly by the owner/authorizer.
	 *
	 * @param _dpt The TradeableShares.SharesSubject struct representing the DPT.
	 */
	function registerDPT(TradeableShares.SharesSubject calldata _dpt) external;

	/**
	 * @notice Rewinds forward the nonce for the issuer specified, used to
	 *      discard one or more signed requests to `registerDPTRequest`
	 *
	 * @dev Implementation must not allow to decrease the nonce, only increasing (rewinding)
	 *      must be possible
	 *
	 * @param _issuer the issuer address to rewind the nonce for
	 * @param _nonce the nonce value to rewind to
	 */
	function rewindNonce(address _issuer, uint256 _nonce) external;

	/**
	 * @notice Gets current (unused) nonce for the given issuer address;
	 *      unused nonce is required to build the RegisterDPTRequest and sign it
	 *      nonces increment by one after each use
	 *
	 * @param _issuer the issuer address to get the nonce for
	 * @return current (unused) nonce; incremented by one after
	 *      each successful execution of the `registerDPTRequest` function
	 */
	function getNonce(address _issuer) external view returns(uint256);

	/**
	 * @notice Checks whether a DPT is already registered.
	 *
	 * @param dptAddress The address of the DPT.
	 * @param dptId The ID of the DPT.
	 * @return True if the DPT is registered, false otherwise.
	 */
	function isDPTRegistered(address dptAddress, uint256 dptId) external view returns(bool);
}
