// run: npx hardhat deploy --network base_goerli --tags setup-SharesFactory-eth_impl

// script is built for hardhat-deploy plugin:
// A Hardhat Plugin For Replicable Deployments And Easy Testing
// https://www.npmjs.com/package/hardhat-deploy

// BN utils
const {
	toBN,
	print_amt,
} = require("../../scripts/include/bn_utils");

// implementation types
const {
	SharesImplementationType: ImplType,
} = require("../../test/bonding_curves/include/enums");

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

	// setup SharesFactory (Proxy)
	{
		// get impl deployment details
		const v1_deployment = await deployments.get("SharesFactoryV1");
		const v1_contract = new web3.eth.Contract(v1_deployment.abi, v1_deployment.address);

		// get proxy deployment details
		const proxy_deployment = await deployments.get("SharesFactory_Proxy");
		const proxy_contract = new web3.eth.Contract(v1_deployment.abi, proxy_deployment.address);

		// ETHShares sharesImplAddress
		const ethSharesImplAddress = await proxy_contract.methods.getSharesImplAddress(
			ImplType.ETH
		).call();
		const {address: reqEthSharesImplAddress} = await deployments.get("ETHShares");
		if(ethSharesImplAddress !== reqEthSharesImplAddress) {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setSharesImplAddress(
				ImplType.ETH,
				reqEthSharesImplAddress
			).encodeABI();

			// setSharesImplAddress
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setSharesImplAddress(SharesImplementationType.ETH, reqEthSharesImplAddress)
			});
			console.log(
				"SharesFactory_Proxy.setSharesImplAddress(ETH/%o, %o): %o",
				parseInt(ImplType.ETH),
				reqEthSharesImplAddress,
				receipt.transactionHash
			);
		}
		else {
			console.log(
				"SharesFactory_Proxy.getSharesImplAddress(ETH/%o): %o",
				parseInt(ImplType.ETH),
				ethSharesImplAddress
			);
		}

		// ETH distributorImplAddress
		const ethDistributorImplAddress = await proxy_contract.methods.getDistributorImplAddress(
			ImplType.ETH
		).call();
		const {address: reqEthDistributorImplAddress} = await deployments.get("HoldersRewardsDistributor");
		if(ethDistributorImplAddress !== reqEthDistributorImplAddress) {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setDistributorImplAddress(
				ImplType.ETH,
				reqEthDistributorImplAddress
			).encodeABI();

			// setDistributorImplAddress
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setDistributorImplAddress(SharesImplementationType.ETH, reqEthDistributorImplAddress)
			});
			console.log(
				"SharesFactory_Proxy.setDistributorImplAddress(ETH/%o, %o): %o",
				parseInt(ImplType.ETH),
				reqEthDistributorImplAddress, receipt.transactionHash
			);
		}
		else {
			console.log(
				"SharesFactory_Proxy.getDistributorImplAddress(ETH/%o): %o",
				parseInt(ImplType.ETH),
				ethDistributorImplAddress
			);
		}
	}
};

// Tags represent what the deployment script acts on. In general, it will be a single string value,
// the name of the contract it deploys or modifies.
// Then if another deploy script has such tag as a dependency, then when the latter deploy script has a specific tag
// and that tag is requested, the dependency will be executed first.
// https://www.npmjs.com/package/hardhat-deploy#deploy-scripts-tags-and-dependencies
module.exports.tags = ["setup-SharesFactory-eth_impl", "v3_0", "setup", "eth_impl"];
module.exports.dependencies = [
	"SharesFactory_Proxy",
	"SharesFactoryV1",
	"ETHShares",
	"HoldersRewardsDistributor",
];
