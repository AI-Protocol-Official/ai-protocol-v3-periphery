// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@ai-protocol/v3-core/contracts/interfaces/ERC721Spec.sol";
import "../utils/UpgradeableAccessControl.sol";
import "./SharesSubjectLib.sol";
import "./TypedStructLib.sol";
import "./HiveRegistry.sol";

import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";

/**
 * @title Hive Registry Smart Contract
 *
 * @notice Smart contract managing the Registry of Decentralized Pre-Trained Transformer (DPTs).
 *
 * @dev This contract extends UpgradeableAccessControl and provides functions
 *      to registerDPTRequest, registerDPT, and check the registration status of DPTs with the Hive.
 *
 * @dev Access to certain functions is restricted by roles, ensuring proper
 *      permission control.
 */
contract HiveRegistryV1 is HiveRegistry, UpgradeableAccessControl, EIP712Upgradeable {
	// libraries in use
	using ECDSAUpgradeable for bytes32;
	using SharesSubjectLib for TradeableShares.SharesSubject;

	/**
	 * @notice DPT registry storage, stores binding information for each existing registered DPTs
	 *
	 * @dev Mapping to store the linking status of DPTs identified by their bytes32 representation.
	 */
	mapping(bytes32 => bool) private dptLinkStatus;

	/**
	 * @dev Keeps track of the used nonces for every possible issuer
	 *      Maps address => number of used nonces
	 */
	mapping(address => uint256) private nonces;

	/**
	 * @notice registers DPTs with Hive registry on other behalf using meta-tx
	 *
	 * @dev Role ROLE_SHARES_REGISTRAR is required to execute `registerDPTRequest` functions
	 *
	 */
	uint32 public constant ROLE_DPT_REGISTRAR = 0x0001_0000;

	/**
	 * @dev "Constructor replacement" for upgradeable, must be execute immediately after proxy deployment
	 *      see https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializers
	 *
	 */
	function postConstruct() public initializer {
		// execute parent initializer(s)
		__EIP712_init_unchained("HiveRegistry", "1");
		_postConstruct(msg.sender);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function registerDPTRequest(RegisterDPTRequest calldata _req, bytes calldata _signature) public virtual {
		// verify the request validity
		require(_req.validFromTimestamp <= block.timestamp, "not yet valid");
		require(_req.expiresAtTimestamp > block.timestamp, "expired");

		// verify and use nonce
		__useNonce(_req.dptHolder, _req.nonce);

		// derive the request signer
		// this also verifies that the signature is valid
		address signer = _hashTypedDataV4(hashStruct(_req)).recover(_signature);

		// Register the DPT
		__registerDPT(_req.dpt, signer);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function registerDPT(TradeableShares.SharesSubject calldata _dpt) public virtual {
		// Register the DPT with the sender as the authorized party
		__registerDPT(_dpt, msg.sender);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function rewindNonce(address _issuer, uint256 _nonce) external {
		// verify the access permission
		require(isSenderInRole(ROLE_DPT_REGISTRAR), "access denied");

		// make sure nonce is not decreasing
		require(nonces[_issuer] < _nonce, "new nonce must be bigger than the current one");

		// rewind the nonce to the value requested
		nonces[_issuer] = _nonce;

		// emit an event
		emit NonceUsed(_issuer, _nonce - 1);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function isDPTRegistered(address _tokenAddress, uint256 _tokenId) public view returns (bool) {
		// read data from the storage
		return dptLinkStatus[SharesSubjectLib.getSharesKey(_tokenAddress, _tokenId)];
	}

    /**
	 * @inheritdoc HiveRegistry
	 */
	function getNonce(address _issuer) external view returns(uint256) {
		// read the nonce from the storage
		return nonces[_issuer];
	}

	/**
	 * @dev Internal function to register a DPT.
	 *
	 * @param _dpt The TradeableShares.SharesSubject struct representing the DPT.
	 * @param _authorizedBy The address authorizing the registration.
	 */
	function __registerDPT(TradeableShares.SharesSubject calldata _dpt, address _authorizedBy) internal {
		// Ensure the sender is authorized to register the DPT
		require(
			// allow DPT owner to register
			ERC721(_dpt.tokenAddress).ownerOf(_dpt.tokenId) == msg.sender
			// allow REGISTRAR to register
			|| isSenderInRole(ROLE_DPT_REGISTRAR)
			// allow REGISTRAR to register via EIP712
			|| isOperatorInRole(_authorizedBy, ROLE_DPT_REGISTRAR),
			"not authorized"
		);

		// derive the DPT key
		bytes32 dptKey = SharesSubjectLib.getSharesKey(_dpt.tokenAddress, _dpt.tokenId);
		// verify DPT register state
		require(!dptLinkStatus[dptKey], "DPT is already registered!");

		// update DPT register state
		dptLinkStatus[dptKey] = true;

		// emit an event
		emit DPTRegistered(_authorizedBy, _dpt.tokenAddress, _dpt.tokenId);
	}

	/**
	 * @dev Verifies the nonce is valid and marks it as used
	 *      Throws if nonce is already used or if it is invalid
	 *
	 * @param _issuer the owner of the nonce
	 * @param _nonce the nonce to be used
	 */
	function __useNonce(address _issuer, uint256 _nonce) internal {
		// verify the nonce wasn't yet used and use it
		require(nonces[_issuer]++ == _nonce, "invalid nonce");

		// emit an event
		emit NonceUsed(_issuer, _nonce);
	}

	/**
	 * @notice RegisterDPTRequest typeHash
	 */
	function hashType(RegisterDPTRequest calldata) internal pure returns(bytes32) {
		// hashType(RegisterDPTRequest) = keccak256("RegisterDPTRequest(TradeableShares.SharesSubject dpt,address dptHolder,uint256 validFromTimestamp,uint256 expiresAtTimestamp,uint256 nonce)")
		return 0xb69037152057f2330c0754c0276e42bdca942aa867ec679cb03fddc3428a7caf;
	}

    /**
	 * @notice RegisterDPTRequest hashStruct
	 */
	function hashStruct(RegisterDPTRequest calldata _request) internal pure returns(bytes32) {
		return keccak256(abi.encode(
			hashType(_request),
			TypedStructLib.hashStruct(_request.dpt),
			_request.dptHolder,
			_request.validFromTimestamp,
			_request.expiresAtTimestamp,
			_request.nonce
		));
	}
}
