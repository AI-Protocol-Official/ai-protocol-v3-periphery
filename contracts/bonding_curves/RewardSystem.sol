// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@ai-protocol/v3-core/contracts/interfaces/ERC20Spec.sol";
import "../utils/UpgradeableAccessControl.sol";
import "../utils/Transfers.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title Leaderboard Reward System
 *
 * @notice leaderboard reward system designated to release reward for all leaderboard winner
 *
 * @notice reward system uses merkle root to maintain list of winners and reward amounts,
 *      once new winner list is announced, merkle root will be update which include
 *      new winner list and past winners and tier respective won reward amount.
 *
 * @notice leaderboard reward system is proxy upgradeable.
 *
 */
contract RewardSystem is UpgradeableAccessControl {
	// Use Zeppelin MerkleProof Library to verify Merkle proofs
	using MerkleProof for bytes32[];

	// Input data root, Merkle tree root for an array of (address, totalReward) pairs,
	// Merkle root effectively "compresses" the (potentially) huge array of data elements
	// and allows to store it in a single 256-bits storage slot on-chain
	bytes32 public root;

	// userAddress => total claimed reward
	mapping(address => uint256) public claimedReward;

	// ERC20 reward token address
	// reward system type:
	// zero address means contract supports ETH reward
	// non-zero address means contract supports ERC20 reward
	ERC20 public erc20RewardToken;

	// cumulative reward claimed
	uint256 public totalClaimedReward;

	/**
	 * @notice Data Root manager is responsible for supplying the valid input data array
	 *      Merkle root which then can be used to check total reward won by user.
	 *
	 * @dev Role ROLE_DATA_ROOT_MANAGER allows setting the Merkle tree root via setInputDataRoot()
	 */
	uint32 public constant ROLE_DATA_ROOT_MANAGER = 0x0001_0000;

	/**
	 * @notice Enables the airdrop, redeeming the tokens
	 *
	 * @dev Feature FEATURE_CLAIM_ACTIVE must be enabled in order to
	 *      allow user to claim pending reward
	 */
	uint32 public constant FEATURE_CLAIM_ACTIVE = 0x0000_0001;

	/**
	 * @dev Fired in setInputDataRoot()
	 *
	 * @param by an address which executed the operation
	 * @param root new Merkle root value
	 */
	event RootChanged(address indexed by, bytes32 root);

	/**
	 * @dev Fired in claimEthReward()
	 *
	 * @param user user address
	 * @param amount amount of reward transferred
	 */
	event EthRewardClaimed(address indexed user, uint256 amount);

	/**
	 * @dev Fired in claimErc20Reward()
	 *
	 * @param rewardToken erc20 reward token address
	 * @param user user address
	 * @param amount amount of reward transferred
	 */
	event ERC20RewardClaimed(address indexed rewardToken, address indexed user, uint256 amount);

	/**
	 * @dev Fired in the default receive()
	 *
	 * @param value amount received 
	 */
	event PaymentReceived(uint256 value);

	/**
	 * @dev "Constructor replacement" for a smart contract with a delayed initialization (post-deployment initialization)
	 *
	 * @param _erc20RewardToken ERC20 reward token address
	 *      zero address means contract supports ETH reward
	 *      non-zero address means contract supports ERC20 reward
	 */
	function postConstruct(address _erc20RewardToken) public virtual initializer {
		// execute parent initializer
		_postConstruct(msg.sender);

		// zero address is OK meaning we use ETH reward mode
		erc20RewardToken = ERC20(_erc20RewardToken);
	}

	// Function to receive Ether. msg.data must be empty
	receive() external payable {
		require(rewardSystemType(), "ETH payments not supported");
		emit PaymentReceived(msg.value);
	}

	/**
	 * @notice total amount of token `_totalReward` to an address `_to`, verifying the validity
	 *      of a `(_to, _totalReward)` pair via the Merkle proof `_proof`
	 *
	 * @dev Merkle tree and proof can be constructed using the `web3-utils`, `merkletreejs`,
	 *      and `keccak256` npm packages:
	 *      1. Hash the original array data elements (_to, _totalReward) via `web3.utils.soliditySha3`,
	 *         making sure the packing order.
	 *      2. Create a sorted MerkleTree (`merkletreejs`) from the hashed array, use `keccak256`
	 *         from the `keccak256` npm package as a hashing function, do not hash leaves
	 *         (already hashed in step 1); Ex. MerkleTree options: {hashLeaves: false, sortPairs: true}
	 *      3. For any given data element (_to, _totalReward) the proof is constructed by hashing it
	 *         (as in step 1) and querying the MerkleTree for a proof, providing the hashed element
	 *         as a leaf
	 *
	 * @dev Throws is the data or merkle proof supplied is not valid
	 *
	 * @param _to an address to whom reward to be sent
	 * @param _totalReward total reward accumulated by a user across all competitions
	 * @param _proof Merkle proof for the (_to, _totalReward) pair supplied
	 */
	function claimReward(address payable _to, uint256 _totalReward, bytes32[] memory _proof) external {
		// verify airdrop is in active state
		require(isFeatureEnabled(FEATURE_CLAIM_ACTIVE), "redeems are disabled");

		// verify the `(_to, _totalReward)` pair is valid
		require(isClaimValid(_to, _totalReward, _proof), "invalid request");

		// check user has reward to claim
		require(claimedReward[_to] < _totalReward, "nothing to claim");
		uint256 claimableAmount = _totalReward - claimedReward[_to];

		// update reward details
		claimedReward[_to] += claimableAmount;
		totalClaimedReward += claimableAmount;

		if (rewardSystemType()) {
			// transfer ether to user
			Transfers.transfer(_to, claimableAmount);

			// emit an event
			emit EthRewardClaimed(_to, claimableAmount);
		}
		else {
			// transfer erc20 reward token to user
			erc20RewardToken.transfer(_to, claimableAmount);

			// emit an event
			emit ERC20RewardClaimed(address(erc20RewardToken), _to, claimableAmount);
		}
	}

	/**
	 * @notice Restricted access function to update input data root (Merkle tree root),
	 *      and to define, effectively, the tokens to be created by this smart contract
	 *
	 * @dev Requires executor to have `ROLE_DATA_MANAGER` permission
	 *
	 * @param _root Merkle tree root for the input data array
	 */
	function setInputDataRoot(bytes32 _root) public {
		// verify the access permission
		require(isSenderInRole(ROLE_DATA_ROOT_MANAGER), "access denied");

		// update input data Merkle tree root
		root = _root;

		// emit an event
		emit RootChanged(msg.sender, _root);
	}

	/**
	 * @notice Verifies the validity of a `(_to, _totalReward)` pair supplied based on the Merkle root
	 *      of the entire `(_to, _totalReward)` data array (pre-stored in the contract), and the Merkle
	 *      proof `_proof` for the particular `(_to, _totalReward)` pair supplied
	 *
	 * @dev Merkle tree and proof can be constructed using the `web3-utils`, `merkletreejs`,
	 *      and `keccak256` npm packages:
	 *      1. Hash the original array data elements (_to, _totalReward) via `web3.utils.soliditySha3`,
	 *         making sure the packing order.
	 *      2. Create a sorted MerkleTree (`merkletreejs`) from the hashed array, use `keccak256`
	 *         from the `keccak256` npm package as a hashing function, do not hash leaves
	 *         (already hashed in step 1); Ex. MerkleTree options: {hashLeaves: false, sortPairs: true}
	 *      3. For any given data element (_to, _totalReward) the proof is constructed by hashing it
	 *         (as in step 1) and querying the MerkleTree for a proof, providing the hashed element
	 *         as a leaf
	 *
	 * @param _to an address to whom reward to be sent
	 * @param _totalReward total reward accumulated by a user across all competitions
	 * @param _proof Merkle proof for the (_to, _totalReward) pair supplied
	 * @return true if Merkle proof is valid (data belongs to the original array), false otherwise
	 */
	function isClaimValid(address _to, uint256 _totalReward, bytes32[] memory _proof) public view returns(bool) {
		// construct Merkle tree leaf from the inputs supplied
		bytes32 leaf = keccak256(abi.encodePacked(_to, _totalReward));

		// verify the proof supplied, and return the verification result
		return _proof.verify(root, leaf);
	}

	/**
	 * @notice Reward system type
	 *
	 * @return true if contract supports ETH reward
	 *         false if contract supports ERC20 reward
	 */
	function rewardSystemType() public view returns(bool) {
		// derive from the token address
		return address(erc20RewardToken) == address(0);
	}
}
