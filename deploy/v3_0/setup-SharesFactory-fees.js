// run: npx hardhat deploy --network base_goerli --tags setup-SharesFactory-fees

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

		// protocolFeeDestination
		const protocolFeeDestination = await proxy_contract.methods.getProtocolFeeDestination().call();
		const {address: reqProtocolFeeDestination} = await deployments.get("ProtocolFeeDistributor_Proxy");
		if(protocolFeeDestination !== reqProtocolFeeDestination) {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setProtocolFeeDestination(reqProtocolFeeDestination).encodeABI();

			// setProtocolFeeDestination
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setProtocolFeeDestination(reqProtocolFeeDestination)
			});
			console.log("SharesFactory_Proxy.setProtocolFeeDestination(%o): %o", reqProtocolFeeDestination, receipt.transactionHash);
		}
		else {
			console.log("SharesFactory_Proxy.getProtocolFeeDestination(): %o", protocolFeeDestination);
		}
		// protocolFeePercent
		const protocolFeePercent = await proxy_contract.methods.getProtocolFeePercent().call();
		const reqProtocolFeePercent = "40000000000000000";
		if(protocolFeePercent === "0") {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setProtocolFeePercent(reqProtocolFeePercent).encodeABI();

			// setProtocolFeePercent
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setProtocolFeePercent(reqProtocolFeePercent)
			});
			console.log("SharesFactory_Proxy.setProtocolFeePercent(%o): %o", reqProtocolFeePercent, receipt.transactionHash);
		}
		else {
			console.log("SharesFactory_Proxy.getProtocolFeePercent(): %o", protocolFeePercent);
		}
		// holdersFeePercent
		const holdersFeePercent = await proxy_contract.methods.getHoldersFeePercent().call();
		const reqHoldersFeePercent = "30000000000000000";
		if(holdersFeePercent === "0") {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setHoldersFeePercent(reqHoldersFeePercent).encodeABI();

			// setHoldersFeePercent
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setHoldersFeePercent(reqHoldersFeePercent)
			});
			console.log("SharesFactory_Proxy.setHoldersFeePercent(%o): %o", reqHoldersFeePercent, receipt.transactionHash);
		}
		else {
			console.log("SharesFactory_Proxy.getHoldersFeePercent(): %o", holdersFeePercent);
		}
		// subjectFeePercent
		const subjectFeePercent = await proxy_contract.methods.getSubjectFeePercent().call();
		const reqSubjectFeePercent = "30000000000000000";
		if(subjectFeePercent === "0") {
			// prepare the call bytes for the contract call
			const call_data = proxy_contract.methods.setSubjectFeePercent(reqSubjectFeePercent).encodeABI();

			// setSubjectFeePercent
			const receipt = await deployments.rawTx({
				from: A0,
				to: proxy_deployment.address,
				data: call_data, // setSubjectFeePercent(reqSubjectFeePercent)
			});
			console.log("SharesFactory_Proxy.setSubjectFeePercent(%o): %o", reqSubjectFeePercent, receipt.transactionHash);
		}
		else {
			console.log("SharesFactory_Proxy.getSubjectFeePercent(): %o", subjectFeePercent);
		}
	}
};

// Tags represent what the deployment script acts on. In general, it will be a single string value,
// the name of the contract it deploys or modifies.
// Then if another deploy script has such tag as a dependency, then when the latter deploy script has a specific tag
// and that tag is requested, the dependency will be executed first.
// https://www.npmjs.com/package/hardhat-deploy#deploy-scripts-tags-and-dependencies
module.exports.tags = ["setup-SharesFactory-fees", "v3_0", "setup", "fees"];
module.exports.dependencies = [
	"SharesFactory_Proxy",
	"SharesFactoryV1",
	"ProtocolFeeDistributor_Proxy",
];
