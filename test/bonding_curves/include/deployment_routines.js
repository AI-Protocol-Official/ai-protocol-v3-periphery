// Ethers.js signature utils  for EIP712 signing
const ethSigUtil = require("eth-sig-util");

// Zeppelin helper constants
const {
	ZERO_ADDRESS,
	ZERO_BYTES32,
	MAX_UINT256,
} = require("@openzeppelin/test-helpers/src/constants");

// ERC20 deployment routines to reuse
const {
	ali_erc20_deploy: deploy_ali_erc20,
} = require("@ai-protocol/v3-core/test/ali_token/include/deployment_routines")

// ERC721 deployment routines to reuse
const {
	royal_nft_deploy: deploy_royal_nft,
} = require("@ai-protocol/v3-core/test/erc721/include/deployment_routines")

// BN utils
const {
	BN,
} = require("@ai-protocol/v3-core/test/include/bn_utils");

// block utils
const {
	default_deadline,
} = require("@ai-protocol/v3-core/test/include/block_utils");

// EIP712 utils
const {
	EIP712Domain,
	domainSeparator,
} = require("./eip712");

// SharesFactory.ImplementationType
const {
	SharesImplementationType,
} = require("./enums");

// RBAC
const {
	FEATURE_ALL,
	ROLE_TOKEN_CREATOR,
} = require("@ai-protocol/v3-core/test/include/features_roles");

/**
 * Deploys SharesFactory via ERC1967 Proxy with all the features enabled
 *      and fees configured
 * Deploys ALI ERC20 token instance as a payment token if required
 *
 * @param a0 contract deployer and super admin, required
 * @param shares_owner_address address which owns newly deployed SharesFactory instances,
 *      optional, defaults to zero address (not set)
 * @param protocol_fee_destination the address receiving the protocol fee, optional
 * @param protocol_fee_percent protocol fee percent, optional, defaults to 4%
 * @param holders_fee_percent shares holders fee percent, optional, defaults to 3%
 * @param subject_fee_percent subject fee percent, optional, defaults to 3%
 * @param payment_token ERC20 payment token instance or address, optionals
 * @param version implementation version, optional, defaults to 1
 * @param eth_impl_address deployed ETHShares instance address, optional
 * @param erc20_impl_address deployed ERC20Shares instance address, optional
 * @param distributor_impl_address deployed HoldersRewardsDistributor instance address, optional
 * @returns SharesFactory instance
 */
async function deploy_factory_and_configure(
	a0,
	shares_owner_address,
	protocol_fee_destination,
	protocol_fee_percent = new BN("40000000000000000"), // 4%
	holders_fee_percent = new BN("30000000000000000"), // 3%
	subject_fee_percent = new BN("30000000000000000"), // 3%
	payment_token,
	version = 1,
	eth_impl_address,
	erc20_impl_address,
	distributor_impl_address,
) {
	let factory; ({payment_token, factory} = await factory_deploy_restricted(a0, payment_token, version));

	if(shares_owner_address) {
		await factory.setSharesOwnerAddress(shares_owner_address, {from: a0});
	}

	// deploy fee distributor contract if required
	if(!protocol_fee_destination) {
		({address: protocol_fee_destination} = await deploy_protocol_fee_distributor(a0, payment_token));
	}

	await factory.setProtocolFee(
		protocol_fee_destination,
		protocol_fee_percent,
		holders_fee_percent,
		subject_fee_percent,
		{from: a0},
	);
	await factory.updateFeatures(FEATURE_ALL, {from: a0});

	if(!eth_impl_address) {
		const {shares} = await deploy_shares_ETH(a0);
		eth_impl_address = shares.address;
	}

	if(!erc20_impl_address) {
		const {shares} = await deploy_shares_ERC20(a0, payment_token);
		erc20_impl_address = shares.address;
	}
	if(!distributor_impl_address) {
		({address: distributor_impl_address} = await deploy_holders_rewards_distributor(a0, payment_token));
	}

	await factory.setSharesImplAddress(SharesImplementationType.ETH, eth_impl_address, {from: a0});
	await factory.setSharesImplAddress(SharesImplementationType.ERC20, erc20_impl_address, {from: a0});
	await factory.setDistributorImplAddress(SharesImplementationType.ETH, distributor_impl_address, {from: a0});
	await factory.setDistributorImplAddress(SharesImplementationType.ERC20, distributor_impl_address, {from: a0});

	return {protocol_fee_destination, protocol_fee_percent, holders_fee_percent, subject_fee_percent, payment_token, factory};
}

/**
 * Deploys SharesFactory via ERC1967 Proxy with all the features enabled
 * Deploys ALI ERC20 token instance as a payment token if required
 *
 * @param a0 contract deployer and super admin, required
 * @param payment_token ERC20 payment token instance or address, optionals
 * @param version implementation version, optional, defaults to 1
 * @returns SharesFactory instance
 */
async function deploy_factory(a0, payment_token, version = 1) {
	let factory; ({payment_token, factory} = await factory_deploy_restricted(a0, payment_token, version));
	await factory.updateFeatures(FEATURE_ALL, {from: a0});
	return {payment_token, factory};
}

/**
 * Deploys SharesFactory via ERC1967 Proxy with no features enabled
 * Deploys ALI ERC20 token instance as a payment token if required
 *
 * @param a0 contract deployer and super admin, required
 * @param payment_token ERC20 payment token instance or address, optionals
 * @param version implementation version, optional, defaults to 1
 * @returns SharesFactory instance
 */
async function factory_deploy_restricted(a0, payment_token, version = 1) {
	// make sure ALI ERC20 token is defined
	if(!payment_token) {
		payment_token = await deploy_ali_erc20(a0);
	}
	else if(!payment_token.address) {
		const ERC20 = artifacts.require("ERC20");
		payment_token = await ERC20.at(payment_token);
	}

	// deploy the factory
	const factory = await factory_deploy_pure(a0, payment_token.address, version);

	// return the result
	return {payment_token, factory};
}

/**
 * Deploys SharesFactory via ERC1967 Proxy
 *
 * @param a0 contract deployer and super admin, required
 * @param payment_token_address ERC20 payment token address, required
 * @param version implementation version, optional, defaults to 1
 * @returns SharesFactory instance
 */
async function factory_deploy_pure(a0, payment_token_address, version = 1) {
	// deploy implementation
	const SharesFactory = artifacts.require("SharesFactoryV" + version);
	const impl = await SharesFactory.new({from: a0});

	// prepare the proxy initialization call bytes
	const init_data = impl.contract.methods.postConstruct(payment_token_address).encodeABI();

	// deploy the ERC1967 proxy
	const ERC1967Proxy = artifacts.require("ERC1967Proxy");
	const proxy = await ERC1967Proxy.new(impl.address, init_data, {from: a0});

	// cast proxy to the correct ABI
	return await SharesFactory.at(proxy.address);
}

/**
 * Deploys TradeableShares implementation through the factory
 *
 * @param a0 transaction executor, required
 * @param factory SharesFactory instance to use for deployment, required
 * @param subject shares subject, (NFT contract address, NFT ID), optional
 * @param issuer the address to mint subject NFT to, optional, defaults to a0, used if subject is not specified
 * @param impl_type TradeableShares implementation type, optional, defaults to SharesImplementationType.ETH
 * @param amount amount of shares to buy immediately, optional, defaults to zero
 * @param value ETH value to submit
 * @returns TradeableShares instance
 */
async function factory_deploy_shares(
	a0,
	factory,
	subject,
	issuer = a0,
	impl_type = SharesImplementationType.ETH,
	amount = new BN(0),
	value = new BN(0),
) {
	// if subject is not provided deploy the NFT and create a subject
	if(!subject) {
		const nft = await deploy_royal_nft(a0);
		subject = {
			tokenAddress: nft.address,
			tokenId: "1086432204",
		};
		await nft.mint(issuer, subject.tokenId, {from: a0});
	}

	// deploy shares contract
	const receipt = await factory.mintSubjectAndDeployShares(impl_type, subject, issuer, amount, {from: a0, value});

	// parse the deployment
	const {creator, shares, distributor} = await parse_shares_deployment(receipt);

	// return the results
	return {subject, issuer: creator, shares, distributor, receipt};
}

/**
 * Deploys TradeableShares implementation through the factory via the EIP712 meta tx mechanism
 *
 * @param signer account which authorized the transaction and which signs it, required
 * @param relayer transaction relayer, required
 * @param factory SharesFactory instance to use for deployment, required
 * @param subject shares subject, (NFT contract address, NFT ID), optional
 * @param issuer the address to mint subject NFT to, optional, defaults to relayer, used if subject is not specified
 * @param impl_type TradeableShares implementation type, optional, defaults to SharesImplementationType.ETH
 * @param amount amount of shares to buy immediately, optional, defaults to zero
 * @param value ETH value to submit, optional, defaults to zero
 * @param sig_valid_from "validFromTimestamp" signature param, optional
 * @param sig_expires_at "expiresAtTimestamp" signature param, optional
 * @param sig_nonce "nonce" signature param, optional
 * @returns TradeableShares instance
 */
async function factory_deploy_shares_eip712(
	signer,
	relayer,
	factory,
	subject,
	issuer = relayer,
	impl_type = SharesImplementationType.ETH,
	amount = new BN(0),
	value = new BN(0),
	sig_valid_from,
	sig_expires_at,
	sig_nonce,
) {
	// if subject is not provided deploy the NFT and create a subject
	if(!subject) {
		const nft = await deploy_royal_nft(relayer);
		subject = {
			tokenAddress: nft.address,
			tokenId: "1086432204",
		};
		await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: relayer});
	}

	// construct and sign EIP712 message (SharesDeploymentRequest)
	const domain = {
		name: "SharesFactory",
		version: "1",
		chainId: await web3.eth.getChainId(),
		verifyingContract: factory.address,
	};
	const types = {
		EIP712Domain,
		SharesDeploymentRequest: [
			{name: "implementationType", type: "uint8"},
			{name: "sharesSubject", type: "SharesSubject"},
			{name: "issuer", type: "address"},
			{name: "amount", type: "uint256"},
			{name: "validFromTimestamp", type: "uint256"},
			{name: "expiresAtTimestamp", type: "uint256"},
			{name: "nonce", type: "uint256"},
		],
		SharesSubject: [
			{name: "tokenAddress", type: "address"},
			{name: "tokenId", type: "uint256"},
		],
	};
	// any BN must be converted into Number or String
	const request = {
		implementationType: parseInt(impl_type),
		sharesSubject: subject,
		issuer,
		amount: parseInt(amount),
		validFromTimestamp: parseInt(sig_valid_from || await default_deadline(0)),
		expiresAtTimestamp: parseInt(sig_expires_at || await default_deadline(60)),
		nonce: parseInt(sig_nonce || await factory.getNonce(issuer)),
	};
	const signature = ethSigUtil.signTypedMessage(Buffer.from(web3.utils.hexToBytes(signer.privateKey || signer)), {
		data: {
			domain,
			types,
			primaryType: "SharesDeploymentRequest",
			message: request,
		},
	});

	// deploy shares contract
	const receipt = await factory.executeDeploymentRequest(request, signature, {from: relayer, value});

	// parse the deployment
	const {creator, shares, distributor} = await parse_shares_deployment(receipt);

	// return the results
	return {subject, issuer: creator, shares, distributor, receipt};
}

/**
 * Extracts SharesSubject, creator (issuer) and TradeableShares contract
 * from the TradeableShares deployment transaction receipt
 *
 * @param receipt TradeableShares deployment receipt, containing SharesContractRegistered event
 * @returns shares, creator, subject
 */
async function parse_shares_deployment(receipt) {
	// extract the required data from the event log
	const {
		implementationType,
		sharesSubject: subject,
		creator,
		implementationContract,
		holdersRewardsDistributor,
		newDeployment,
	} = receipt.logs.find(log => log.event === "SharesContractRegistered").args;

	// connect to the shares contract
	let TradeableShares;
	switch(parseInt(implementationType)) {
		case parseInt(SharesImplementationType.ETH): {
			TradeableShares = artifacts.require("ETHShares");
			break;
		}
		case parseInt(SharesImplementationType.ERC20): {
			TradeableShares = artifacts.require("ERC20Shares");
			break;
		}
		default: {
			TradeableShares = artifacts.require("TradeableShares");
			break;
		}
	}
	const shares = await TradeableShares.at(implementationContract);

	const Distributor = artifacts.require("HoldersRewardsDistributorV1");
	const distributor = holdersRewardsDistributor === ZERO_ADDRESS? null: await Distributor.at(holdersRewardsDistributor);

	// return the results
	return {subject, creator, shares, distributor};
}

/**
 * Deploys ETHShares – TradeableShares implementation working with ETH
 *
 * @param a0 contract deployer, required
 * @param issuer the address to mint subject NFT to, optional, defaults to a0, used if subject is not specified
 * @param subject shares subject, (NFT contract address, NFT ID), optional
 * @param protocol_fee_destination the address receiving the protocol fee, optional
 * @param protocol_fee_percent protocol fee percent, optional, defaults to 4%
 * @param holders_fee_rewards_distributor HoldersRewardsDistributor instance (or its address),
 *        receiving the shares holders fees, optional
 * @param holders_fee_percent shares holders fee percent, optional, defaults to 3%
 * @param subject_fee_percent subject fee percent, optional, defaults to 3%
 * @param amount amount of shares to buy immediately, optional, defaults to zero
 * @param beneficiary an address receiving first shares, optional, defaults to a0
 * @param owner an address receiving all the permissions, optional, defaults to a0
 * @returns ETHShares instance
 */
async function deploy_shares_ETH(
	a0,
	issuer = a0,
	subject,
	protocol_fee_destination,
	protocol_fee_percent = new BN("40000000000000000"), // 4%
	holders_fee_rewards_distributor,
	holders_fee_percent = new BN("30000000000000000"), // 3%
	subject_fee_percent = new BN("30000000000000000"), // 3%
	amount = new BN(0),
	beneficiary = a0,
	owner = a0,
) {
	// if subject is not provided deploy the NFT and create a subject
	if(!subject) {
		const nft = await deploy_royal_nft(a0);
		subject = {
			tokenAddress: nft.address,
			tokenId: "1086432204",
		};
		await nft.mint(issuer, subject.tokenId, {from: a0});
	}

	// deploy protocol fee distributor contract if required
	if(!protocol_fee_destination) {
		const payment_token = await deploy_ali_erc20(a0);
		({address: protocol_fee_destination} = await deploy_protocol_fee_distributor(a0, payment_token));
	}

	// deploy holders fee distributor contract if required
	if(!holders_fee_rewards_distributor) {
		holders_fee_rewards_distributor = await deploy_holders_rewards_distributor(a0);
	}
	else if(!holders_fee_rewards_distributor.address && holders_fee_rewards_distributor !== ZERO_ADDRESS) {
		const HoldersRewardsDistributor = artifacts.require("HoldersRewardsDistributor");
		holders_fee_rewards_distributor = await HoldersRewardsDistributor.at(holders_fee_rewards_distributor);
	}

	// deploy
	const ETHShares = artifacts.require("ETHShares");
	const shares = await ETHShares.new(
		owner,
		subject,
		protocol_fee_destination.address || protocol_fee_destination,
		protocol_fee_percent,
		holders_fee_rewards_distributor.address || holders_fee_rewards_distributor,
		holders_fee_percent,
		subject_fee_percent,
		amount,
		beneficiary,
		{from: a0},
	);

	const holders_fee_distributor = holders_fee_rewards_distributor.address? holders_fee_rewards_distributor: undefined;

	// when deploying shares and distributor contracts separately, one of them needs to be updated
	// with the address of another one after the deployment
	if(holders_fee_distributor) {
		await holders_fee_distributor.initializeSharesContractAddressIfRequired(shares.address, {from: a0});
	}

	// return the results
	return {
		owner,
		subject,
		protocol_fee_destination,
		protocol_fee_percent,
		holders_fee_destination: holders_fee_rewards_distributor.address || holders_fee_rewards_distributor,
		holders_fee_distributor,
		holders_fee_percent,
		subject_fee_percent,
		amount,
		beneficiary,
		shares,
	};
}

/**
 * Deploys ETHShares – TradeableShares implementation working with ERC20 as a payment token
 *
 * @param a0 contract deployer, required
 * @param payment_token deployed ERC20 token instance or address used as a payment token, optional
 * @param issuer the address to mint subject NFT to, optional, defaults to a0, used if subject is not specified
 * @param subject shares subject, (NFT contract address, NFT ID), optional
 * @param protocol_fee_destination the address receiving the protocol fee, optional, defaults to a0
 * @param protocol_fee_percent protocol fee percent, optional, defaults to 4%
 * @param holders_fee_rewards_distributor HoldersRewardsDistributor instance (or its address),
 *        receiving the shares holders fees, optional
 * @param holders_fee_percent shares holders fee percent, optional, defaults to 3%
 * @param subject_fee_percent subject fee percent, optional, defaults to 3%
 * @param amount amount of shares to buy immediately, optional, defaults to zero
 * @param beneficiary an address receiving first shares, optional, defaults to a0
 * @param owner an address receiving all the permissions, optional, defaults to a0
 * @returns ETHShares instance
 */
async function deploy_shares_ERC20(
	a0,
	payment_token,
	issuer = a0,
	subject,
	protocol_fee_destination,
	protocol_fee_percent = new BN("40000000000000000"), // 4%
	holders_fee_rewards_distributor,
	holders_fee_percent = new BN("30000000000000000"), // 3%
	subject_fee_percent = new BN("30000000000000000"), // 3%
	amount = new BN(0),
	beneficiary = a0,
	owner = a0,
) {
	// make sure ERC20 token is defined
	if(!payment_token) {
		payment_token = await deploy_ali_erc20(a0);
	}
	else if(!payment_token.address) {
		const ERC20 = artifacts.require("contracts/interfaces/ERC20Spec.sol:ERC20");
		payment_token = await ERC20.at(payment_token);
	}

	// if subject is not provided deploy the NFT and create a subject
	if(!subject) {
		const nft = await deploy_royal_nft(a0);
		subject = {
			tokenAddress: nft.address,
			tokenId: "1086432204",
		};
		await nft.mint(issuer, subject.tokenId, {from: a0});
	}

	// deploy fee distributor contract if required
	if(!protocol_fee_destination) {
		({address: protocol_fee_destination} =  await deploy_protocol_fee_distributor(a0, payment_token));
	}

	// deploy holders fee distributor contract if required
	if(!holders_fee_rewards_distributor) {
		holders_fee_rewards_distributor = await deploy_holders_rewards_distributor(a0, payment_token);
	}
	else if(!holders_fee_rewards_distributor.address && holders_fee_rewards_distributor !== ZERO_ADDRESS) {
		const HoldersRewardsDistributor = artifacts.require("HoldersRewardsDistributor");
		holders_fee_rewards_distributor = await HoldersRewardsDistributor.at(holders_fee_rewards_distributor);
	}

	// deploy
	const ERC20Shares = artifacts.require("ERC20Shares");
	const shares = await ERC20Shares.new(
		owner,
		subject,
		protocol_fee_destination.address || protocol_fee_destination,
		protocol_fee_percent,
		holders_fee_rewards_distributor.address || holders_fee_rewards_distributor,
		holders_fee_percent,
		subject_fee_percent,
		amount,
		beneficiary,
		payment_token.address,
		{from: a0},
	);

	const holders_fee_distributor = holders_fee_rewards_distributor.address? holders_fee_rewards_distributor: undefined;

	// when deploying shares and distributor contracts separately, one of them needs to be updated
	// with the address of another one after the deployment
	if(holders_fee_distributor) {
		await holders_fee_distributor.initializeSharesContractAddressIfRequired(shares.address, {from: a0});
	}

	// return the results
	return {
		owner,
		payment_token,
		subject,
		protocol_fee_destination,
		protocol_fee_percent,
		holders_fee_destination: holders_fee_rewards_distributor.address || holders_fee_rewards_distributor,
		holders_fee_distributor,
		holders_fee_percent,
		subject_fee_percent,
		amount,
		beneficiary,
		shares,
	};
}

/**
 * Deploys the ProtocolFeeDistributorV1 via ERC1967 proxy
 *
 * @param a0 deployer address, required
 * @param reward_token rewards ERC20 token address, required
 * @param malicious true to deploy a malicious impl mock consuming all the gas
 * @returns ProtocolFeeDistributorV1 instance
 */
async function deploy_protocol_fee_distributor(a0, reward_token, malicious = false) {
	// deploy implementation
	const FeeDistributor = artifacts.require(malicious? "MaliciousFeeDistributor": "ProtocolFeeDistributorV1");
	const impl = await FeeDistributor.new({from: a0});

	// prepare the proxy initialization call bytes
	const init_data = impl.contract.methods.postConstruct(reward_token.address || reward_token).encodeABI();

	// deploy the ERC1967 proxy
	const ERC1967Proxy = artifacts.require("ERC1967Proxy");
	const proxy = await ERC1967Proxy.new(impl.address, init_data, {from: a0});

	// cast proxy to the correct ABI
	return await FeeDistributor.at(proxy.address);
}

/**
 * Deploys HoldersRewardsDistributor capable of accepting shares holders fees and
 * capable of accepting the sync messages in the abi.encode(trader, amount) format
 *
 * @param a0 deployer address, required
 * @param payment_token payment token or its address address, optional, defaults to zero (ETH mode)
 * @param shares TradeableShares contract to bind to (or its address), optional, doesn't bind by default
 * @param malicious true to deploy a malicious impl mock consuming all the gas
 * @returns HoldersRewardsDistributor instance
 */
async function deploy_holders_rewards_distributor(
	a0,
	payment_token = ZERO_ADDRESS,
	shares = ZERO_ADDRESS,
	malicious = false,
) {
	const HoldersRewardsDistributor = artifacts.require(malicious? "MaliciousHoldersRewardsDistributor": "HoldersRewardsDistributorV1");
	return await HoldersRewardsDistributor.new(
		a0,
		shares.address || shares,
		payment_token.address || payment_token,
		{from: a0},
	);
}

/**
 * Deploys the Eth Reward System via ERC1967 proxy
 *
 * @param a0 deployer address, required
 * @returns ethRewardSystem instance
 */
async function deploy_eth_reward_system(a0) {
	// deploy implementation
	const RewardSystem = artifacts.require("RewardSystem");
	const impl = await RewardSystem.new({from: a0});

	// prepare the proxy initialization call bytes
	const init_data = impl.contract.methods.postConstruct(ZERO_ADDRESS).encodeABI();

	// deploy the ERC1967 proxy
	const ERC1967Proxy = artifacts.require("ERC1967Proxy");
	const proxy = await ERC1967Proxy.new(impl.address, init_data, {from: a0});

	// cast proxy to the correct ABI
	return await RewardSystem.at(proxy.address);
}

/**
 * Deploys the ERC20 Reward System via ERC1967 proxy
 *
 * @param a0 deployer address, required
 * @param token_address ERC20 token address, required
 * @returns erc20RewardSystem instance
 */
async function deploy_erc20_reward_system(a0, token_address) {
	// deploy implementation
	const RewardSystem = artifacts.require("RewardSystem");
	const impl = await RewardSystem.new({from: a0});

	// prepare the proxy initialization call bytes
	const init_data = impl.contract.methods.postConstruct(token_address).encodeABI();

	// deploy the ERC1967 proxy
	const ERC1967Proxy = artifacts.require("ERC1967Proxy");
	const proxy = await ERC1967Proxy.new(impl.address, init_data, {from: a0});

	// cast proxy to the correct ABI
	return await RewardSystem.at(proxy.address);
}

/**
 * Deploys the Hive Registry smart contract via ERC1967 proxy
 *
 * @param a0 deployer address, required
 * @returns hive registry instance
 */
async function deploy_hive_registry_pure(a0, persona_addr, inft_addr, staking_addr) {
	// deploy implementation
	const HiveRegistry = artifacts.require("HiveRegistryV1");
	const impl = await HiveRegistry.new({from: a0});

	// prepare the proxy initialization call bytes
	const init_data = impl.contract.methods.postConstruct(persona_addr, inft_addr, staking_addr).encodeABI();

	// deploy the ERC1967 proxy
	const ERC1967Proxy = artifacts.require("ERC1967Proxy");
	const proxy = await ERC1967Proxy.new(impl.address, init_data, {from: a0});

	// cast proxy to the correct ABI
	return await HiveRegistry.at(proxy.address);
}

// export public deployment API
module.exports = {
	SharesImplementationType,
	deploy_ali_erc20,
	deploy_royal_nft,
	deploy_factory_and_configure,
	deploy_factory,
	factory_deploy_pure,
	factory_deploy_shares,
	factory_deploy_shares_eip712,
	deploy_shares_ETH,
	deploy_shares_ERC20,
	deploy_protocol_fee_distributor,
	deploy_holders_rewards_distributor,
	deploy_eth_reward_system,
	deploy_erc20_reward_system,
	deploy_hive_registry_pure,
};
