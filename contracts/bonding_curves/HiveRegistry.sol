// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./TradeableShares.sol";

/**
 * @title Hive Registry (Interface)
 *
 * @notice Hive Registry keeps track of and manages the Hives
 *
 * @notice The Hive is a record in the `HiveRegistry` smart contract; the Hive:
 *      1) is bound to one (and only one) AI Pod,
 *      2) has one (and only one) ERC20 token enabling the Hive economy,
 *      3) has one and only one hiveURI pointing to some off-chain resource with the information about the Hive
 *         (possibly a website),
 *      4) has any number of NFTs (assets) bound to it (pre-sorted by category), and each NFT asset
 *         * has one (and only one) category within the Hive;
 *           * category examples: GPU Provider, Dataset Provider, AI Model Provider, etc.
 *         * cannot join other hives (can only join 1 Hive at a time)
 *         * NFT which created a Hive cannot join the same Hive, or any other Hive
 *
 * @dev Hive Registry provides functions to register Hive, register DPTs within the Hive, etc.
 */
interface HiveRegistry {
	/**
	 * @dev RegisterAsDPTRequest represents a EIP712 signed request to to register an NFT as DPT within a Hive
	 * @dev See `registerAsDPT()`
	 */
	struct RegisterAsDPTRequest {
		/// @dev NFT/DPT details (ERC721 address, ERC721 ID)
		TradeableShares.SharesSubject asset;
		// @dev NFT/DPT owner address
		address dptOwner;
		/// @dev unix timestamp when the request becomes valid
		uint256 validFromTimestamp;
		/// @dev unix timestamp when the request expires (becomes invalid)
		uint256 expiresAtTimestamp;
		/// @dev nonce of the request (sequential number, increased by one)
		uint256 nonce;
	}

	/**
	 * @dev Where an asset is linked:
	 *      - which hive (ID)
	 *      - under what category (ID)
	 *      - for enumeration support - asset index in the collections
	 */
	struct AssetLinkDetails {
		/// @dev Hive Id to which asset is linked
		uint16 hiveId;
		/// @dev category under which asset is linked
		uint16 categoryId;
		/// @dev Index of an asset within the linked asset array
		uint224 assetIndex;
	}

	/**
	 * @dev Category Info:
	 *      - category type in string value
	 *      - nft collection address which are allowed to link under
	 *        particular category, if set as ZERO address then any nft
	 *        collection can link.
	 */
	struct CategoryInfo {
		/// @dev categoryType in string format
		string category;
		/// @dev nft collection allowed to link under particular category
		address allowedCollection;
	}

	/**
	 * @dev Fired in register()
	 *
	 * @param by an address requested for DPT registration
	 * @param dptAddress DPT token address
	 * @param dptId DPT token ID
	 * @param timestamp time at which DTP is registered
	 */
	event DPTRegistered(address indexed by, address indexed dptAddress, uint256 indexed dptId, uint256 timestamp);

	/**
	 * @dev Fired in `register()` and in `fastForward()`
	 */
	event NonceUsed(address indexed issuer, uint256 nonce);

	/**
	 * @dev Fired in whitelistPods()
	 *
	 * @param by an address who execute transaction
	 * @param podId POD token ID
	 */
	event PodWhitelisted(address indexed by, uint256 podId);

	/**
	 * @dev Fired in delistPods()
	 *
	 * @param by an address who execute transaction
	 * @param podId POD token ID
	 */
	event PodDelisted(address indexed by, uint256 podId);

	/**
	 * @dev Fired in createHive()
	 *
	 * @param by an address who execute transaction
	 * @param hiveId an new created hive ID
	 * @param tokenAddress pod token address
	 * @param tokenId pod token ID
	 * @param timestamp time at which hive is created
	 */
	event HiveCreated(address indexed by, uint256 indexed hiveId, address tokenAddress, uint256 indexed tokenId, uint256 timestamp);

	/**
	 * @dev Fired in setHiveTokenAddress()
	 *
	 * @param by an address who execute transaction
	 * @param hiveId an hive ID
	 * @param tokenAddress ERC20 token against hive
	 */
	event HiveTokenUpdated(address indexed by, uint256 indexed hiveId, address indexed tokenAddress);

	/**
	 * @dev Fired in updateHiveURI()
	 *
	 * @param by an address who execute transaction
	 * @param hiveId an hive ID
	 * @param hiveURI hive metadata URI
	 */
	event HiveUriUpdated(address indexed by, uint256 indexed hiveId, string hiveURI);

	/**
	 * @dev Fired in addCategory()
	 *
	 * @param by an address who execute transaction
	 * @param categoryIndex an global category index
	 * @param category category in string
	 * @param allowedCollection nft collection address
	 */
	event CategoryAdded(address indexed by, uint256 indexed categoryIndex, string category, address allowedCollection);

	/**
	 * @dev Fired in linkAsset()
	 *
	 * @param by an address who execute transaction
	 * @param tokenAddress asset token address
	 * @param tokenId asset token ID
	 * @param hiveId hive ID
	 * @param category category index
	 * @param timestamp time at which asset is linked
	 */
	event AssetLinked(address by, address indexed tokenAddress, uint256 indexed tokenId, uint16 indexed hiveId, uint16 category, uint256 timestamp);

	/**
	 * @dev Fired in unlinkAsset()
	 *
	 * @param by an address who execute transaction
	 * @param tokenAddress asset token address
	 * @param tokenId asset token ID
	 * @param hiveId hive ID
	 * @param category category index
	 * @param timestamp time at which asset is unlinked
	 */
	event AssetUnlinked(address by, address indexed tokenAddress, uint256 indexed tokenId, uint16 indexed hiveId, uint16 category, uint256 timestamp);

	/**
	 * @notice Registers an NFT as DPT by the request with a valid signature.
	 *
	 * @param req The RegisterAssetRequest struct containing request details.
	 * @param signature The signature of the request.
	 */
	function eip712RegisterAsDPT(RegisterAsDPTRequest calldata req, bytes calldata signature) external;

	/**
	 * @notice Registers an NFT as DPT directly by the authorizer.
	 *
	 * @param _dpt The TradeableShares.SharesSubject struct representing the DPT.
	 */
	function registerAsDPT(TradeableShares.SharesSubject calldata _dpt) external;

	/**
	 * @notice Fast forward the nonce for the issuer specified, used to
	 *      discard one or more signed requests to `registerDPTRequest`
	 *
	 * @dev Implementation must not allow to decrease the nonce, only increasing (rewinding)
	 *      must be possible
	 *
	 * @param _issuer the issuer address to rewind the nonce for
	 * @param _nonce the nonce value to rewind to
	 */
	function fastForwardTheNonce(address _issuer, uint256 _nonce) external;

	/**
	 * @notice Creates a Hive. Available only for level 5 AI Pods
	 *
	 * @param podId Level 5 AI PodId
	 * @param hiveURI hive URI pointing to some off-chain resource
	 */
	function createHive(uint256 podId, string calldata hiveURI) external;

	/**
	 * @notice Links an asset (NFT) to the Hive under certain category
	 *
	 * @param asset an NFT (ERC721 address, ERC721 ID)
	 * @param hiveId ID of the hive to join
	 * @param categoryName asset category name within the Hive
	 */
	function linkAsset(TradeableShares.SharesSubject calldata asset, uint16 hiveId, string calldata categoryName) external;

	/**
	 * @notice Links an asset (NFT) to the Hive under certain category
	 *
	 * @param asset an NFT (ERC721 address, ERC721 ID)
	 * @param hiveId ID of the hive to join
	 * @param categoryId asset category ID within the Hive
	 */
	function linkAsset(TradeableShares.SharesSubject calldata asset, uint16 hiveId, uint16 categoryId) external;

	/**
	 * @notice Unlinks an asset (NFT) from the Hive
	 *
	 * @param asset an NFT (ERC721 address, ERC721 ID)
	 */
	function unlinkAsset(TradeableShares.SharesSubject calldata asset) external;

	/**
	 * @notice Sets ERC20 Hive economy token address; can be done only once
	 *
	 * @param hiveId Hive ID
	 * @param tokenAddress ERC20 token address to set
	 */
	function setHiveTokenAddress(uint256 hiveId, address tokenAddress) external;

	/**
	 * @notice Updates Hive URI
	 *
	 * @param hiveId Hive ID
	 * @param hiveURI Hive URI
	 */
	function updateHiveURI(uint256 hiveId, string calldata hiveURI) external;

	/**
	 * @notice Add global category and assign it an index
	 *
	 * @param categoryName category name
	 * @param allowedCollection nft collection linking permitted within specific category.
	 *      If allowedCollection is ZERO_ADDRESS, any NFT collection may
	 *      link within that category.
	 */
	function addCategory(string calldata categoryName, address allowedCollection) external;

	/**
	 * @notice Whitelists the AI Pods, that is marks podIds as level 5 pods,
	 *      meaning these pods become capable of launching Hives
	 *
	 * @param podIds array of level 5 AI Pod IDs
	 */
	function whitelistPods(uint256[] calldata podIds) external;

	/**
	 * @notice Blacklists the AI Pods
	 *
	 * @param podIds array of AI Pod IDs do delist
	 */
	function delistPods(uint256[] calldata podIds) external;

	/**
	 * @notice Checks whether the give AI Pod is whitelisted, that is a Level 5
	 *      pod capable of creating a Hive (or already having a Hive)
	 *
	 * @param podId AI Pod ID to query
	 */
	function isPodWhitelisted(uint256 podId) external view returns (bool);

	/**
	 * @notice Gets the info of the linked asset, the hiveID and categoryId where it is linked to
	 *
	 * @dev Zero return values indicate the asset is not linked
	 *
	 * @param asset an NFT (ERC721 address, ERC721 ID)
	 * @return hiveId Hive ID where asset is linked to, zero if it is not linked
	 * @return categoryId category ID where the asset is registered within a Hive, or zero if not linked
	 * @return categoryName category where the asset is registered within a Hive in string value
	 */
	function getLinkedAssetDetails(TradeableShares.SharesSubject calldata asset) external view returns (
		uint256 hiveId,
		uint256 categoryId,
		string memory categoryName
	);

	/**
	 * @notice Checks whether asset is linked to any Hive
	 *
	 * @param asset an NFT (ERC721 address, ERC721 ID)
	 * @return true if asset is linked, false otherwise
	 */
	function isAssetLinked(TradeableShares.SharesSubject calldata asset) external view returns (bool);

	/**
	 * @notice How many assets are linked with the given Hive
	 *
	 * @param hiveId Hive ID to query
	 * @return number of assets linked with the Hive
	 */
	function getNumOfAssetsLinkedWithHive(uint16 hiveId) external view returns (uint256);

	/**
	 * @notice How many assets are linked with the given Hive in the give category
	 *
	 * @param hiveId Hive ID to query
	 * @param categoryId category ID (index)
	 * @return number of assets linked with the Hive
	 */
	function getNumOfAssetsLinkedWithHive(uint16 hiveId, uint16 categoryId) external view returns (uint256);

	/**
	 * @notice Resolve category ID (index) by its name
	 *
	 * @param categoryName category name
	 * @return category ID (index)
	 */
	function getCategoryIndex(string calldata categoryName) external view returns (uint16);

	/**
	 * @notice Resolve Hive ID where the given asset is linked; an asset can also be an AI Pod
	 *      which created the Hive
	 *
	 * @param podId AI Pod ID
	 * @return Hive ID
	 */
	function getHiveId(uint256 podId) external view returns (uint256);

	/**
	 * @notice Finds which AI Pod created the Hive
	 *
	 * @param hiveId ID of the Hive to query for
	 * @return AI-pod (ERC721 address, ERC721 ID)
	 */
	function getHiveCreatorPod(uint256 hiveId) external view returns (TradeableShares.SharesSubject memory);

	/**
	 * @notice Finds the URI of the given Hive
	 *
	 * @param hiveId ID of the Hive to query for
	 * @return Hive URL
	 */
	function getHiveURI(uint16 hiveId) external view returns (string memory);

	/**
	 * @notice Finds the economy ERC20 token address assigned to the Hive
	 *
	 * @param hiveId ID of the Hive to query for
	 * @return address of the ERC20 token representing the economy of the Hive
	 */
	function getHiveToken(uint256 hiveId) external view returns (address);

	/**
	 * @notice Finds the all details associated with Hive
	 *
	 * @param hiveId ID of the Hive to query for
	 * @return pod AI-Pod details asossiated with hive
	 * @return hiveOwner owner of AI-Pod cum hive
	 * @return hiveToken address of the ERC20 token representing the economy of the Hive
	 * @return hiveUri Hive metadata URL
	 */
	function getHiveDetails(uint16 hiveId) external view returns (TradeableShares.SharesSubject memory pod, address hiveOwner, address hiveToken, string memory hiveUri);

	/**
	 * @notice Total number of Hives registered within the registry
	 *
	 * @return Total number of Hives
	 */
	function getNumOfHives() external view returns (uint256);

	/**
	 * @notice Total number of asset categories known to the Hives
	 *
	 * @return Total number of categories
	 */
	function getNumOfGlobalCategories() external view returns (uint256);

	/**
	 * @notice Gets current (unused) nonce for the given client address;
	 *      unused nonce is required to build the RegisterDPTRequest and sign it
	 *      nonces increment by one after each use
	 *
	 * @param client the client address to get the nonce for
	 * @return current (unused) nonce; incremented by one after
	 *      each successful execution of the `registerDPTRequest` function
	 */
	function getNonce(address client) external view returns(uint256);

	/**
	 * @notice Checks whether a DPT is already registered.
	 *
	 * @param _dpt The TradeableShares.SharesSubject struct representing the DPT.
	 * @return True if the DPT is registered, false otherwise.
	 */
	function isDPTRegistered(TradeableShares.SharesSubject calldata _dpt) external view returns(bool);
}
