// run: npx hardhat deploy --network base_goerli --tags setup-SharesFactory-shares_owner

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

		// sharesOwnerAddress
		const sharesOwnerAddress = await proxy_contract.methods.getSharesOwnerAddress().call();
		const reqSharesOwnerAddress = A0;
		if(sharesOwnerAddress !== reqSharesOwnerAddress) {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setSharesOwnerAddress(reqSharesOwnerAddress).encodeABI();

			// setSharesOwnerAddress
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setSharesOwnerAddress(reqSharesOwnerAddress)
			});
			console.log("SharesFactory_Proxy.setSharesOwnerAddress(%o): %o", reqSharesOwnerAddress, receipt.transactionHash);
		}
		else {
			console.log("SharesFactory_Proxy.getSharesOwnerAddress(): %o", sharesOwnerAddress);
		}
	}
};

// Tags represent what the deployment script acts on. In general, it will be a single string value,
// the name of the contract it deploys or modifies.
// Then if another deploy script has such tag as a dependency, then when the latter deploy script has a specific tag
// and that tag is requested, the dependency will be executed first.
// https://www.npmjs.com/package/hardhat-deploy#deploy-scripts-tags-and-dependencies
module.exports.tags = ["setup-SharesFactory-shares_owner", "v3_0", "setup", "shares_owner"];
module.exports.dependencies = [
	"SharesFactory_Proxy",
	"SharesFactoryV1",
];
