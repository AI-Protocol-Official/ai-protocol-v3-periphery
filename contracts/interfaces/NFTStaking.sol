// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@ai-protocol/v3-core/contracts/interfaces/ERC20Spec.sol";
import "@ai-protocol/v3-core/contracts/interfaces/ERC721Spec.sol";

/**
 * @title NFT Staking (Interface)
 *
 * @notice Enables NFT staking for a given NFT smart contract defined on deployment
 *
 * @notice Doesn't introduce any rewards, just tracks the stake/unstake dates for each
 *      token/owner, this data will be used later on to process the rewards
 */
interface NFTStaking {
	/**
	 * @dev Main staking data structure keeping track of a stake,
	 *      used in `tokenStakes` array mapping
	 */
	struct StakeData {
		/**
		 * @dev Who owned and staked the token, who will be the token
		 *      returned to once unstaked
		 */
		address owner;
		/**
		 * @dev When the token was staked and transferred from the owner,
		 *      unix timestamp
		 */
		uint32 stakedOn;
		/**
		 * @dev When token was unstaked and returned back to the owner,
		 *      unix timestamp
		 * @dev Zero value means the token is still staked
		 */
		uint32 unstakedOn;
	}

	/**
	 * @dev Auxiliary data structure to help iterate over NFT owner stakes,
	 *      used in `userStakes` array mapping
	 */
	struct StakeIndex {
		/**
		 * @dev Staked token ID
		 */
		uint32 tokenId;
		/**
		 * @dev Where to look for main staking data `StakeData`
		 *      in `tokenStakes` array mapping
		 */
		uint32 index;
	}

	/**
	 * @dev Fired in stake(), stakeBatch()
	 *
	 * @param _by token owner, tx executor
	 * @param _tokenId token ID staked and transferred into the smart contract
	 * @param _when unix timestamp of when staking happened
	 */
	event Staked(address indexed _by, uint32 indexed _tokenId, uint32 _when);

	/**
	 * @dev Fired in unstake(), unstakeBatch()
	 *
	 * @param _by token owner, tx executor
	 * @param _tokenId token ID unstaked and transferred back to owner
	 * @param _when unix timestamp of when unstaking happened
	 */
	event Unstaked(address indexed _by, uint32 indexed _tokenId, uint32 _when);

	/**
	 * Interface function of mapping(uint32 => StakeData[]) public tokenStakes;
	 * @param tokenId NFT token Id
	 * @param stakeIndex index of StakeData[]
	 * @return owner
	 * @return stakedOn
	 * @return unstakedOn
	 */
	function tokenStakes(uint32 tokenId, uint256 stakeIndex) external view returns (address, uint32, uint32);

	/**
	 * @notice How many times a particular token was staked
	 *
	 * @dev Used to iterate `tokenStakes(tokenId, i)`, `i < numStakes(tokenId)`
	 *
	 * @param tokenId token ID to query number of times staked for
	 * @return number of times token was staked
	 */
	function numStakes(uint32 tokenId) external view returns (uint256);

	/**
	 * @notice How many stakes a particular address has done
	 *
	 * @dev Used to iterate `userStakes(owner, i)`, `i < numStakes(owner)`
	 *
	 * @param owner an address to query number of times it staked
	 * @return number of times a particular address has staked
	 */
	function numStakes(address owner) external view returns (uint256);

	/**
	 * @notice Determines if the token is currently staked or not
	 *
	 * @param tokenId token ID to check state for
	 * @return true if token is staked, false otherwise
	 */
	function isStaked(uint32 tokenId) external view returns (bool);

	/**
	 * @notice Stakes the NFT; the token is transferred from its owner to the staking contract;
	 *      token must be owned by the tx executor and be transferable by staking contract
	 *
	 * @param tokenId token ID to stake
	 */
	function stake(uint32 tokenId) external;

	/**
	 * @notice Stakes several NFTs; tokens are transferred from their owner to the staking contract;
	 *      tokens must be owned by the tx executor and be transferable by staking contract
	 *
	 * @param tokenIds token IDs to stake
	 */
	function stakeBatch(uint32[] memory tokenIds) external;

	/**
	 * @notice Unstakes the NFT; the token is transferred from staking contract back
	 *      its previous owner
	 *
	 * @param tokenId token ID to unstake
	 */
	function unstake(uint32 tokenId) external;

	/**
	 * @notice Unstakes several NFTs; tokens are transferred from staking contract back
	 *      their previous owner
	 *
	 * @param tokenIds token IDs to unstake
	 */
	function unstakeBatch(uint32[] memory tokenIds) external;

	/**
	 * @dev Restricted access function to rescue accidentally sent ERC20 tokens,
	 *      the tokens are rescued via `transfer` function call on the
	 *      contract address specified and with the parameters specified:
	 *      `_contract.transfer(_to, _value)`
	 *
	 * @dev Requires executor to have `ROLE_RESCUE_MANAGER` permission
	 *
	 * @param _contract smart contract address to execute `transfer` function on
	 * @param _to to address in `transfer(_to, _value)`
	 * @param _value value to transfer in `transfer(_to, _value)`
	 */
	function rescueErc20(address _contract, address _to, uint256 _value) external;

	/**
	 * @dev Restricted access function to rescue accidentally sent ERC721 tokens,
	 *      the tokens are rescued via `transferFrom` function call on the
	 *      contract address specified and with the parameters specified:
	 *      `_contract.transferFrom(this, _to, _tokenId)`
	 *
	 * @dev Requires executor to have `ROLE_RESCUE_MANAGER` permission
	 *
	 * @param _contract smart contract address to execute `transferFrom` function on
	 * @param _to to address in `transferFrom(this, _to, _tokenId)`
	 * @param _tokenId token ID to transfer in `transferFrom(this, _to, _tokenId)`
	 */
	function rescueErc721(address _contract, address _to, uint256 _tokenId) external;

	/**
	 * @dev Testing time-dependent functionality may be difficult;
	 *      we override time in the helper test smart contract (mock)
	 *
	 * @return `block.timestamp` in mainnet, custom values in testnets (if overridden)
	 */
	function now32() external view returns (uint32);
}
