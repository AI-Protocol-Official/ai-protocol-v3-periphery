// upgrade: npx hardhat deploy --network base_goerli --tags upgrade-SharesFactoryV1

// script is built for hardhat-deploy plugin:
// A Hardhat Plugin For Replicable Deployments And Easy Testing
// https://www.npmjs.com/package/hardhat-deploy

// BN utils
const {
	toBN,
	print_amt,
} = require("../../scripts/include/bn_utils");

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

	// SharesFactoryV1.1
	{
		// get deployment details
		const v1_deployment = await deployments.get("SharesFactoryV1");
		const v1_contract = new web3.eth.Contract(v1_deployment.abi, v1_deployment.address);

		// print v1.1 deployment details
		await print_contract_details(A0, v1_deployment.abi, v1_deployment.address);

		// get proxy deployment details
		const proxy_deployment = await deployments.get("SharesFactory_Proxy");
		const proxy_contract = new web3.eth.Contract(v1_deployment.abi, proxy_deployment.address);

		// print proxy deployment details
		const {implementation_address} = await print_contract_details(A0, v1_deployment.abi, proxy_deployment.address);

		// check if upgrade is not yet done
		if(implementation_address !== web3.utils.toChecksumAddress(v1_deployment.address)) {
			// prepare the upgradeTo call bytes
			const proxy_upgrade_data = v1_contract.methods.upgradeTo(v1_deployment.address).encodeABI();

			// update the implementation address in the proxy
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: proxy_upgrade_data, // upgradeTo(v1_deployment.address)
			});
			console.log("SharesFactory_Proxy.upgradeTo(%o): %o", v1_deployment.address, receipt.transactionHash);
		}
	}
};

// Tags represent what the deployment script acts on. In general, it will be a single string value,
// the name of the contract it deploys or modifies.
// Then if another deploy script has such tag as a dependency, then when the latter deploy script has a specific tag
// and that tag is requested, the dependency will be executed first.
// https://www.npmjs.com/package/hardhat-deploy#deploy-scripts-tags-and-dependencies
module.exports.tags = ["upgrade-SharesFactoryV1", "v3_0-", "upgrade"];
module.exports.dependencies = ["SharesFactoryV1", "SharesFactory_Proxy"];
