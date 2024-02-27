// deploy: npx hardhat deploy --network base_goerli --tags ETHShares
// verify: npx hardhat etherscan-verify --network base_goerli --api-url https://api-goerli.basescan.org/ --api-key $BASESCAN_KEY
// mainnet: https://api.basescan.org

// script is built for hardhat-deploy plugin:
// A Hardhat Plugin For Replicable Deployments And Easy Testing
// https://www.npmjs.com/package/hardhat-deploy

// BN utils
const {
	toBN,
	print_amt,
} = require("../../scripts/include/bn_utils");

// Zeppelin helper constants
const {
	ZERO_ADDRESS,
	ZERO_BYTES32,
	MAX_UINT256,
} = require("@openzeppelin/test-helpers/src/constants");

// deployment utils (contract state printers)
const {
	print_contract_details,
} = require("../../scripts/deployment_utils");

// to be picked up and executed by hardhat-deploy plugin
module.exports = async function({deployments, getChainId, getNamedAccounts, getUnnamedAccounts}) {
	// print some useful info on the account we're using for the deployment
	const chainId = await getChainId();
	const accounts = await web3.eth.getAccounts();
	// do not use the default account for tests
	const A0 = network.name === "hardhat"? accounts[1]: accounts[0];
	const nonce = await web3.eth.getTransactionCount(A0);
	const balance = await web3.eth.getBalance(A0);

	// print initial debug information
	console.log("script: %o", require("path").basename(__filename));
	console.log("network %o %o", chainId, network.name);
	console.log("accounts: %o, service account %o, nonce: %o, balance: %o ETH", accounts.length, A0, nonce, print_amt(balance));

	// ETHShares
	{
		// deploy if required
		await deployments.deploy("ETHShares", {
			// address (or private key) that will perform the transaction.
			// you can use `getNamedAccounts` to retrieve the address you want by name.
			from: A0,
			contract: "ETHKeys",
			// the list of argument for the constructor (or the upgrade function in case of proxy)
			args: [
				ZERO_ADDRESS, // address _owner,
				{tokenAddress: ZERO_ADDRESS, tokenId: "0"}, // SharesSubject memory _sharesSubject,
				ZERO_ADDRESS, 0, // address _protocolFeeDestination, uint64 _protocolFeePercent,
				ZERO_ADDRESS, 0, // HoldersRewardsDistributor _holdersFeeDestination, uint64 _holdersFeePercent,
				0, // uint64 _subjectFeePercent
				0, // uint256 _amount,
				ZERO_ADDRESS, // address _beneficiary,
			],
			// if set it to true, will not attempt to deploy even if the contract deployed under the same name is different
			skipIfAlreadyDeployed: true,
			// if true, it will log the result of the deployment (tx hash, address and gas used)
			log: true,
		});

		// get deployment details
		const deployment = await deployments.get("ETHShares");
		const contract = new web3.eth.Contract(deployment.abi, deployment.address);

		// print deployment details
		await print_contract_details(A0, deployment.abi, deployment.address);
	}
};

// Tags represent what the deployment script acts on. In general, it will be a single string value,
// the name of the contract it deploys or modifies.
// Then if another deploy script has such tag as a dependency, then when the latter deploy script has a specific tag
// and that tag is requested, the dependency will be executed first.
// https://www.npmjs.com/package/hardhat-deploy#deploy-scripts-tags-and-dependencies
module.exports.tags = ["ETHShares", "v3_0", "deploy"];
