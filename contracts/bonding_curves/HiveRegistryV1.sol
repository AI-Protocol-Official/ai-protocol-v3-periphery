// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@ai-protocol/v3-core/contracts/interfaces/ERC721SpecExt.sol";
import "../utils/UpgradeableAccessControl.sol";
import "./SharesSubjectLib.sol";
import "./TypedStructLib.sol";
import "@ai-protocol/v3-core/contracts/protocol/IntelligentNFTv2.sol";
import "../interfaces/NFTStaking.sol";
import "./HiveRegistry.sol";

import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";

/**
 * @title Hive Registry (Implementation, V1)
 *
 * @notice see HiveRegistry
 */
contract HiveRegistryV1 is HiveRegistry, UpgradeableAccessControl, EIP712Upgradeable {
	// libraries in use
	using ECDSAUpgradeable for bytes32;
	using SharesSubjectLib for TradeableShares.SharesSubject;

	/**
	 * @dev AI Personality contract defined by `personalityContract` (effectively immutable)
	 */
	address public personalityContract;

	/**
	 * @dev iNFT Linker contract defined by `iNftContract` (effectively immutable)
	 */
	address public iNftContract;

	/**
	 * @dev AI Personality staking contract defined by `podStakingContract` (effectively immutable)
	 */
	address public podStakingContract;

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
	 * @dev Keeps track of Level 5 AI Pods
	 *      maps AI Pod ID => is Level 5?
	 */
	mapping(uint256 => bool) private whitelistedPods;

	/**
	 * @dev Enumerable of all the Hives. Hive index in the array is a Hive ID.
	 */
	TradeableShares.SharesSubject[] private hives;

	/**
	 * @dev Keeps track of the Hives' ERC20 economy tokens
	 *      Maps Hive ID => Hive economy ERC20 token address
	 */
	mapping(uint256 => address) private hiveToken;

	/**
	 * @dev Keeps track of which AI Pods created which Hives
	 *      Maps keccak256(AI Pod address, ID) => Hive ID
	 */
	mapping(bytes32 => uint256) private hiveIndex;

	/**
	 * @dev Keeps track of the Hive URIs
	 *      Maps Hive ID => Hive URI
	 */
	mapping(uint256 => string) private hiveURI;

	/**
	 * @dev Enumerable of all categories. Category index in the array is a Category ID
	 */
	CategoryInfo[] public globalCategories;

	/**
	 * @dev Keeps track of the linked assets categories
	 *      Maps Category Name => category ID / Index
	 */
	mapping(string => uint16) private categoryIndex;

	/**
	 * @dev Keeps track of the bound assets to the Hive as a categories catalog
	 *      Maps Hive ID => Category ID => Enumerable of the linked assets
	 */
	mapping(uint256 => mapping(uint16 => TradeableShares.SharesSubject[])) public assetCatalogue;

	/**
	 * @dev Keeps track of the assets linked to the Hive
	 *      Maps an asset keccak256(ERC721 address, ID) => (Hive ID, Category ID, asset Index in `assetBindings`)
	 */
	mapping(bytes32 => AssetLinkDetails) private linkedAssets;

	/**
	 * @notice Total number of assets linked (counter)
	 */
	uint256 public totalNumOfAssetsLinked;

	/**
	 * @notice Enables hive creation
	 *
	 * @dev Feature FEATURE_ALLOW_HIVE_CREATION must be enabled
	 *      as a prerequisite for `launchHive()` function to succeed
	 */
	uint32 public constant FEATURE_ALLOW_HIVE_CREATION = 0x0000_0001;

	/**
	 * @notice Enables asset linking with hives
	 *
	 * @dev Feature FEATURE_ALLOW_ASSET_LINKING must be enabled
	 *      as a prerequisite for `linkAsset()` function to succeed
	 */
	uint32 public constant FEATURE_ALLOW_ASSET_LINKING = 0x0000_0002;

	/**
	 * @notice Enables asset unlink from hives
	 *
	 * @dev Feature FEATURE_ALLOW_ASSET_UNLINKING must be enabled
	 *      as a prerequisite for `unlinkAsset()` function to succeed
	 */
	uint32 public constant FEATURE_ALLOW_ASSET_UNLINKING = 0x0000_0004;

	/**
	 * @notice registers DPTs with Hive registry on other behalf using meta-tx
	 *
	 * @dev Role ROLE_SHARES_REGISTRAR is required to execute `registerDPTRequest` functions
	 *
	 */
	uint32 public constant ROLE_DPT_REGISTRAR = 0x0001_0000;

	/**
	 * @notice allows to update pods of whitelisted list which are allowed to create hive
	 *
	 * @dev Role ROLE_POD_WHITELIST_MANAGER is required to execute `whitelistPods` & 'delistPods' functions
	 *
	 */
	uint32 public constant ROLE_POD_WHITELIST_MANAGER = 0x0002_0000;

	/**
	 * @notice allows to add new asset global category to hive registry
	 *
	 * @dev Role ROLE_CATEGORY_MANAGER is required to execute `addCategory` functions
	 *
	 */
	uint32 public constant ROLE_CATEGORY_MANAGER = 0x0004_0000;

	/**
	 * @notice allows to set ERC20 token address associated with particular hive
	 *
	 * @dev Role ROLE_HIVE_TOKEN_MANAGER is required to execute `updateHiveToken` functions
	 *
	 */
	uint32 public constant ROLE_HIVE_TOKEN_MANAGER = 0x0008_0000;

	/**
	 * @dev "Constructor replacement" for upgradeable, must be execute immediately after proxy deployment
	 *      see https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializers
	 *
	 */
	function postConstruct(address _personalityContract, address _iNftContract, address _podStakingContract) public initializer {
		// execute parent initializer(s)
		__EIP712_init_unchained("HiveRegistry", "1");
		_postConstruct(msg.sender);

		// initialize immutables
		iNftContract = _iNftContract;
		podStakingContract = _podStakingContract;
		personalityContract = _personalityContract;

		// we have pushed first place as dummy, to start indexing from 1 onwards
		hives.push();
		globalCategories.push();

		// add default global categories
		globalCategories.push(CategoryInfo({
			category: "Intelligence_POD",
			allowedCollection: _personalityContract
		}));
		categoryIndex["Intelligence_POD"] = uint16(globalCategories.length - 1);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function eip712RegisterAsDPT(RegisterAsDPTRequest calldata _req, bytes calldata _signature) external virtual {
		// verify the request validity
		require(_req.validFromTimestamp <= block.timestamp, "not yet valid");
		require(_req.expiresAtTimestamp > block.timestamp, "expired");

		// verify and use nonce
		__useNonce(_req.dptOwner, _req.nonce);

		// derive the request signer
		// this also verifies that the signature is valid
		address signer = _hashTypedDataV4(__hashStruct(_req)).recover(_signature);

		// Register the DPT
		__registerDPT(_req.asset, signer);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function registerAsDPT(TradeableShares.SharesSubject calldata _dpt) external virtual {
		// Register the DPT with the sender as the authorized party
		__registerDPT(_dpt, msg.sender);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function fastForwardTheNonce(address _issuer, uint256 _nonce) external {
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
	function createHive(uint256 _podId, string calldata _hiveURI) external {
		// make sure hive creation is allowed
		require(isFeatureEnabled(FEATURE_ALLOW_HIVE_CREATION), "hive creation disabled");

		// make sure supplied podId is whitelisted and personalityContract is set
		require(personalityContract != address(0) && whitelistedPods[_podId], "not allowed");

		// wrap the inputs into SharesSubject struct
		TradeableShares.SharesSubject memory pod = TradeableShares.SharesSubject({
			tokenAddress: personalityContract,
			tokenId: _podId
		});
		// verify pod ownership
		require(
			ERC721(personalityContract).ownerOf(_podId) == msg.sender || __isPodStaked(pod) || __isPodLinkedWithINFT(pod),
			"not authorized"
		);

		// calculate the key
		bytes32 podKey = SharesSubjectLib.getSharesKey(personalityContract, _podId);
		// make sure hive is not exist against particular pod
		require(hiveIndex[podKey] == 0, "already exists");

		// make sure pod is not liked as asset
		require(linkedAssets[podKey].hiveId == 0, "pod linked as an asset");

		// update state variables
		hives.push(pod);
		hiveIndex[podKey] = hives.length - 1;
		hiveURI[hives.length - 1] = _hiveURI;

		// emit an event
		emit HiveCreated(msg.sender, hives.length - 1, pod.tokenAddress, pod.tokenId, block.timestamp);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function linkAsset(
		TradeableShares.SharesSubject calldata _asset,
		uint16 _hiveId,
		string calldata _categoryName
	) external {
		// delegate to linkAsset (with categoryId)
		linkAsset(_asset, _hiveId, categoryIndex[_categoryName]);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function linkAsset(
		TradeableShares.SharesSubject calldata _asset,
		uint16 _hiveId,
		uint16 _categoryId
	) public {
		// make sure asset linking is allowed
		require(isFeatureEnabled(FEATURE_ALLOW_ASSET_LINKING), "asset linking is disabled");

		// verify asset ownership
		require(
			ERC721(_asset.tokenAddress).ownerOf(_asset.tokenId) == msg.sender
			|| (_asset.tokenAddress == personalityContract && (__isPodStaked(_asset) || __isPodLinkedWithINFT(_asset))),
			"not authorized"
		);

		// validate hive ID
		require(_hiveId > 0, "invalid hiveId");

		// validate category ID
		require(_categoryId > 0 && _categoryId < globalCategories.length, "invalid category");

		// make sure asset linked under allowed category only
		require(
			globalCategories[_categoryId].allowedCollection == address(0)
			|| globalCategories[_categoryId].allowedCollection == _asset.tokenAddress,
			"asset linking restricted for supplied category"
		);

		bytes32 assetKey = SharesSubjectLib.getSharesKey(_asset.tokenAddress, _asset.tokenId);
		// make sure asset is not already linked with other hive
		require(linkedAssets[assetKey].hiveId == 0, "asset already linked");

		// make sure hive is not been create again requested asset
		require(hiveIndex[assetKey] == 0, "asset is associated with hive");

		// increase total number of asset linked with hive registry
		totalNumOfAssetsLinked++;
		// update state variable
		assetCatalogue[_hiveId][_categoryId].push(_asset);
		linkedAssets[assetKey] = AssetLinkDetails({
			hiveId: _hiveId,
			categoryId: _categoryId,
			assetIndex: uint16(assetCatalogue[_hiveId][_categoryId].length - 1)
		});

		// emit an event
		emit AssetLinked(msg.sender, _asset.tokenAddress, _asset.tokenId, _hiveId, _categoryId, block.timestamp);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function unlinkAsset(TradeableShares.SharesSubject calldata _asset) external {
		// make sure asset unlinking is allowed
		require(isFeatureEnabled(FEATURE_ALLOW_ASSET_UNLINKING), "asset unlinking is disabled");

		bytes32 assetKey = SharesSubjectLib.getSharesKey(_asset.tokenAddress, _asset.tokenId);
		// make sure asset is linked with any hive
		require(linkedAssets[assetKey].hiveId != 0, "unlinked asset");

		// verify ownership of asset
		require(
			ERC721(_asset.tokenAddress).ownerOf(_asset.tokenId) == msg.sender
			|| (_asset.tokenAddress == personalityContract && (__isPodStaked(_asset) || __isPodLinkedWithINFT(_asset))),
			"not authorized"
		);

		// get linked asset details
		AssetLinkDetails memory assetLinkDetails = linkedAssets[assetKey];
		uint256 linkedAssetsLength = assetCatalogue[assetLinkDetails.hiveId][assetLinkDetails.categoryId].length;

		// if more then 1 asset is been linked with hive under particular category,
		// then we need to swap indexing of last connected asset with requested asset index
		if(linkedAssetsLength > 1) {
			TradeableShares.SharesSubject memory lastAsset = assetCatalogue[assetLinkDetails.hiveId][assetLinkDetails.categoryId][linkedAssetsLength - 1];
			bytes32 lastAssetKey = SharesSubjectLib.getSharesKey(lastAsset.tokenAddress, lastAsset.tokenId);

			// swap indexing of asset
			assetCatalogue[assetLinkDetails.hiveId][assetLinkDetails.categoryId][assetLinkDetails.assetIndex] = lastAsset;
			linkedAssets[lastAssetKey].assetIndex = assetLinkDetails.assetIndex;
		}

		// delete request asset details
		assetCatalogue[assetLinkDetails.hiveId][assetLinkDetails.categoryId].pop();
		delete linkedAssets[assetKey];
		// update total number of asset linked with hive registry
		totalNumOfAssetsLinked--;

		// emit an event
		emit AssetUnlinked(
			msg.sender,
			_asset.tokenAddress,
			_asset.tokenId,
			assetLinkDetails.hiveId,
			assetLinkDetails.categoryId,
			block.timestamp
		);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function setHiveTokenAddress(uint256 _hiveId, address _tokenAddress) external {
		// verify the access permission
		require(isSenderInRole(ROLE_HIVE_TOKEN_MANAGER), "access denied");

		// valid hive ID
		require(_hiveId > 0 && _hiveId < hives.length, "invalid hiveId");

		// make sure token is not address been set for particular hive
		require(hiveToken[_hiveId] == address(0), "token address is already set");

		// update hive token address
		hiveToken[_hiveId] = _tokenAddress;

		// emit an event
		emit HiveTokenUpdated(msg.sender, _hiveId, _tokenAddress);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function updateHiveURI(uint256 _hiveId, string calldata _hiveURI) external {
		// validate supplied hive ID
		require(_hiveId > 0 && _hiveId < hives.length, "invalid hiveId");

		TradeableShares.SharesSubject memory nftDetail = hives[_hiveId];
		// verify hive ownership
		require(
			ERC721(nftDetail.tokenAddress).ownerOf(nftDetail.tokenId) == msg.sender
			|| __isPodStaked(nftDetail)
			|| __isPodLinkedWithINFT(nftDetail),
			"not authorized"
		);

		// update hive metadata URI
		hiveURI[_hiveId] = _hiveURI;

		// emit an event
		emit HiveUriUpdated(msg.sender, _hiveId, _hiveURI);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function addCategory(string calldata _categoryName, address _allowedCollection) external {
		// verify the access permission
		require(isSenderInRole(ROLE_CATEGORY_MANAGER), "access denied");

		// make sure request category hasn't already been added
		require(categoryIndex[_categoryName] == 0, "category exists!");

		// add category to global category catalogue
		globalCategories.push(CategoryInfo({
			category: _categoryName,
			allowedCollection: _allowedCollection
		}));

		// update new category index
		categoryIndex[_categoryName] = uint16(globalCategories.length - 1);

		// emit an event
		emit CategoryAdded(msg.sender, globalCategories.length - 1, _categoryName, _allowedCollection);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function whitelistPods(uint256[] calldata _pods) external {
		// verify the access permission
		require(isSenderInRole(ROLE_POD_WHITELIST_MANAGER), "access denied");

		uint256 length = _pods.length;
		for(uint256 i = 0; i < length; i++) {
			// whitelist pods if not already whitelisted
			if(whitelistedPods[_pods[i]] == false) {
				// whitelist pod
				whitelistedPods[_pods[i]] = true;

				// emit an event
				emit PodWhitelisted(msg.sender, _pods[i]);
			}
		}
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function delistPods(uint256[] calldata _pods) external {
		// verify the access permission
		require(isSenderInRole(ROLE_POD_WHITELIST_MANAGER), "access denied");

		uint256 length = _pods.length;
		for(uint256 i = 0; i < length; i++) {
			// delist pods if whitelisted
			if(whitelistedPods[_pods[i]] == true) {
				//delist pod
				whitelistedPods[_pods[i]] = false;

				// emit an event
				emit PodDelisted(msg.sender, _pods[i]);
			}
		}
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getLinkedAssetDetails(TradeableShares.SharesSubject calldata _asset) external view returns(
		uint256 hiveId,
		uint256 categoryId,
		string memory category
	) {
		bytes32 assetKey = SharesSubjectLib.getSharesKey(_asset.tokenAddress, _asset.tokenId);

		// throw expection if asset is not linked
		require(linkedAssets[assetKey].hiveId !=0, "not linked");

		return (
			linkedAssets[assetKey].hiveId,
			linkedAssets[assetKey].categoryId,
			globalCategories[linkedAssets[assetKey].categoryId].category
		);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function isAssetLinked(TradeableShares.SharesSubject calldata _asset) external view returns (bool status) {
		bytes32 assetKey = SharesSubjectLib.getSharesKey(_asset.tokenAddress, _asset.tokenId);

		return (linkedAssets[assetKey].hiveId != 0);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getNumOfAssetsLinkedWithHive(uint16 _hiveId) external view returns (uint256 numOfAssets) {
		uint256 length = globalCategories.length;
		// returns total number of Asset linked to hive
		for(uint16 i = 1; i < length; i++) {
			numOfAssets += assetCatalogue[_hiveId][i].length;
		}

		return numOfAssets;
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getNumOfAssetsLinkedWithHive(uint16 _hiveId, uint16 _category) external view returns (uint256 numOfAssets) {
		// returns number of Asset linked to hive under particular category
		return assetCatalogue[_hiveId][_category].length;
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getCategoryIndex(string memory _category) external view returns (uint16 categoryId) {
		return categoryIndex[_category];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getHiveId(uint256 _podId) external view returns (uint256 hiveId) {
		return hiveIndex[SharesSubjectLib.getSharesKey(personalityContract, _podId)];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getHiveCreatorPod(uint256 _hiveId) external view returns (TradeableShares.SharesSubject memory pod) {
		// throw expection if hiveId is invalid
		require(_hiveId != 0 && _hiveId < hives.length, "invalid hiveId");

		return hives[_hiveId];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getHiveToken(uint256 _hiveId) external view returns (address tokenAddr) {
		return hiveToken[_hiveId];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getHiveURI(uint16 _hiveId) external view returns (string memory hiveUri) {
		return hiveURI[_hiveId];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getHiveDetails(
		uint16 _hiveId
	) external view returns (
		TradeableShares.SharesSubject memory pod,
		address hiveOwner,
		address hiveTokenAddr,
		string memory hiveUri
	) {
		// throw expection if hiveId is invalid
		require(_hiveId != 0 && _hiveId < hives.length, "invalid hiveId");

		return (
			hives[_hiveId],
			ERC721(hives[_hiveId].tokenAddress).ownerOf(hives[_hiveId].tokenId),
			hiveToken[_hiveId],
			hiveURI[_hiveId]
		);
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function isPodWhitelisted(uint256 _podId) external view returns (bool status) {
		return whitelistedPods[_podId];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getNumOfHives() external view returns (uint256 noOfHives) {
		return hives.length - 1;
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getNumOfGlobalCategories() external view returns (uint256 noOfCategories) {
		return globalCategories.length - 1;
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function isDPTRegistered(TradeableShares.SharesSubject calldata _dpt) external view returns (bool status) {
		return dptLinkStatus[SharesSubjectLib.getSharesKey(_dpt.tokenAddress, _dpt.tokenId)];
	}

	/**
	 * @inheritdoc HiveRegistry
	 */
	function getNonce(address clientAddress) external view returns (uint256 nonce) {
		// read the nonce from the storage
		return nonces[clientAddress];
	}

	/**
	 * @dev Internal function to check pod stake state
	 *
	 * @param _pod The TradeableShares.SharesSubject struct representing the pod.
	 * @return status true if pod is staked and owned by requested user, otherwise false
	 */
	function __isPodStaked(TradeableShares.SharesSubject memory _pod) internal view returns (bool status) {
		// if podStakingContract is not set, no need to process further
		if(podStakingContract == address(0)) {
			return false;
		}

		// get number of stake been created for particular pod
		uint256 numStakes = NFTStaking(podStakingContract).numStakes(uint32(_pod.tokenId));
		// if number of stake is zero means pod is not stacked
		if(numStakes == 0) {
			return false;
		}

		// retrieve owner and unstaked time of latest stake
		(address owner, , uint32 unstakedOn) = NFTStaking(podStakingContract).tokenStakes(uint32(_pod.tokenId), numStakes - 1);

		// if unstake time is non-zero indicate pod is already be unstaked.
		return (unstakedOn == 0 && owner == msg.sender);
	}

	/**
	 * @dev Internal function to check pod iNft fuse state
	 *
	 * @param _pod The TradeableShares.SharesSubject struct representing the pod.
	 * @return status true if pod is been fused and owned by requested user, otherwise false
	 */
	function __isPodLinkedWithINFT(TradeableShares.SharesSubject memory _pod) internal view returns (bool status) {
		// if iNftContract is not set, no need to process further
		if(iNftContract == address(0)) {
			return false;
		}

		// retrieve record ID of fused Pod
		uint256 recordId = IntelligentNFTv2(iNftContract).personalityBindings(_pod.tokenAddress, _pod.tokenId);
		// if recordId is zero, indicate pod is not fused here
		return (recordId != 0 && IntelligentNFTv2(iNftContract).ownerOf(recordId) == msg.sender);
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
			// allow REGISTRAR to register
			isSenderInRole(ROLE_DPT_REGISTRAR)
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
		emit DPTRegistered(_authorizedBy, _dpt.tokenAddress, _dpt.tokenId, block.timestamp);
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
	 * @notice RegisterAsDPTRequest typeHash
	 */
	function __hashType(RegisterAsDPTRequest calldata) internal pure returns (bytes32) {
		// hashType(RegisterAsDPTRequest) = keccak256("RegisterAsDPTRequest(TradeableShares.SharesSubject dpt,address dptHolder,uint256 validFromTimestamp,uint256 expiresAtTimestamp,uint256 nonce)")
		return 0x5e5980812e14d500287e9b3d75ae309eac0fb0d30f0d40d19ea443de698eef00;
	}

	/**
	 * @notice RegisterDPTRequest hashStruct
	 */
	function __hashStruct(RegisterAsDPTRequest calldata _request) internal pure returns (bytes32) {
		return keccak256(abi.encode(
			__hashType(_request),
			TypedStructLib.hashStruct(_request.asset),
			_request.dptOwner,
			_request.validFromTimestamp,
			_request.expiresAtTimestamp,
			_request.nonce
		));
	}
}
