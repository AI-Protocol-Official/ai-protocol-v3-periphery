// Utility functions to create testing airdrop data - (address, totalReward) pairs array,
// and to work with the Merkle tree of this data array

// import Merkle tree related stuff
const {MerkleTree} = require("merkletreejs");
const keccak256 = require("keccak256");

// BN utils
const {
    random_address,
    random_bn,
    ETH
} = require("../../include/bn_utils");

// number utils
const {random_element} = require("../../include/number_utils");

/**
 * Generates the reward data, and its Merkle tree related structures
 *
 * @param addresses array of addresses to participate
 * @param totalReward array of total reward user has won
 */
function import_list(addresses, rewards) {
	// allocate the array of the length required
	const rewardList = new Array(addresses.length);

	// generate the array contents
	for(let i = 0; i < addresses.length; i++) {
		rewardList[i] = {
			to: addresses[i],
			totalReward: rewards[i],
		};
	}

	// generate an array of the leaves for a Merkle tree, the tree itself, and its root
	const leaves = rewardList.map(air_data => air_data_to_leaf(air_data));
	const tree = new MerkleTree(leaves, keccak256, {hashLeaves: false, sortPairs: true});
	const root = tree.getHexRoot();

	// return all the cool stuff
	return {rewardList, leaves, tree, root};
}

/**
 * Generates the Airdrop data, and its Merkle tree related structures
 *
 * @param length number of tokens to generate
 * @param addr_set [optional] addresses to use for the generation
 * @param reward_set [optional] reward amount to use for the generation
 * @return an array of (address, totalReward) pairs, their hashes (Merkle leaves), Merkle tree, and root
 */
function generate_merkleRoot(length, addr_set, reward_set) {
	// generate random addresses
	const addresses = new Array(length).fill("").map(_ => addr_set? random_element(addr_set): random_address());
    const rewards = new Array(length).fill("").map(_ => reward_set? random_element(reward_set): random_bn(0, ETH));

	// and import the list
	return import_list(addresses, rewards);
}

/**
 * Calculates keccak256(abi.encodePacked(...)) for the air data - (address, totalReward) pair
 *
 * @param air_data (address, totalReward) pair
 * @return {Buffer} keccak256 hash of tightly packed PlotData fields
 */
function air_data_to_leaf(air_data) {
	// flatten the input land plot object
	const values = Object.values(air_data);
	// feed the soliditySha3 to get a hex-encoded keccak256
	const hash = web3.utils.soliditySha3(...values);

	// return as Buffer
	return MerkleTree.bufferify(hash);
}

// export public utils API
module.exports = {
	generate_merkleRoot,
	air_data_to_leaf,
}
