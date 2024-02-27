// Zeppelin test helpers
const {
	BN,
	balance,
	constants,
	expectEvent,
	expectRevert,
} = require("@openzeppelin/test-helpers");
const {
	ZERO_ADDRESS,
	ZERO_BYTES32,
	MAX_UINT256,
} = constants;
const {
	assert,
	expect,
} = require("chai");
// enable chai-subset to allow containSubset instead of deep equals, see https://www.chaijs.com/plugins/chai-subset/
require("chai").use(require("chai-subset"));

// block utils
const {
	expect_gas,
} = require("@ai-protocol/v3-core/test/include/block_utils");

// bonding curves
const {
	get_buy_price_after_fee_erc20: get_buy_price_after_fee,
} = require("./include/curves");

// RBAC
const {
	ROLE_TOKEN_CREATOR,
	ROLE_SHARES_REGISTRAR,
} = require("@ai-protocol/v3-core/test/include/features_roles");

// deployment routines in use
const {
	SharesImplementationType: ImplType,
	deploy_royal_nft,
	deploy_factory_and_configure,
	factory_deploy_shares: fds,
	factory_deploy_shares_eip712: fds_eip712,
} = require("./include/deployment_routines");

// redefine the shares deployment functions to make ERC20 deployment type the default ones
const factory_deploy_shares =
	async(a0, factory, subject, issuer, impl_type = ImplType.ERC20, amount, value) =>
		await fds(a0, factory, subject, issuer, impl_type, amount, value);
const factory_deploy_shares_eip712 =
	async(signer, relayer, factory, subject, issuer, impl_type = ImplType.ERC20, amount, value, sig_valid_from, sig_expires_at, sig_nonce) =>
		await fds_eip712(signer, relayer, factory, subject, issuer, impl_type, amount, value, sig_valid_from, sig_expires_at, sig_nonce);

// run gas usage tests (Deploying ERC20Shares via SharesFactory)
contract("Deploying ERC20Shares via SharesFactory: gas usage", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;

	const issuer = a2;
	const someone = a3;
	const relayer = a4;
	const shares_owner = a5;

	const protocol_fee_percent = new BN("40000000000000000"); // 4%
	const holders_fee_percent = new BN("30000000000000000"); // 3%
	const subject_fee_percent = new BN("30000000000000000"); // 3%

	const init_amount = new BN(3);
	const price = get_buy_price_after_fee(
		0,
		init_amount,
		protocol_fee_percent,
		holders_fee_percent,
		subject_fee_percent,
	);

	// shared receipt variable used across all the tests
	let receipt;

	function consumes_no_more_than(gas) {
		// tests marked with @skip-on-coverage are removed from solidity-coverage,
		// see yield-solcover.js, see https://github.com/sc-forks/solidity-coverage/blob/master/docs/advanced.md
		it(`consumes no more than ${gas} gas  [ @skip-on-coverage ]`, async function() {
			expect_gas(receipt, gas);
		});
	}

	describe("after the factory is deployed and configured with all the fees set", function() {
		let payment_token, factory;
		beforeEach(async function() {
			({payment_token, factory} = await deploy_factory_and_configure(
				a0,
				shares_owner,
				undefined,
				protocol_fee_percent,
				holders_fee_percent,
				subject_fee_percent,
			));
		});

		describe("deploySharesContractPaused: deploying the curve with no initial shares bought", async function() {
			beforeEach(async function() {
				({receipt} = await factory_deploy_shares(a0, factory));
			});
			consumes_no_more_than(508271);
		});
		describe("deploySharesContract: deploying the curve with one initial share bought", function() {
			beforeEach(async function() {
				({receipt} = await factory_deploy_shares(
					issuer,
					factory,
					undefined,
					undefined,
					undefined,
					1,
				));
			});
			consumes_no_more_than(630759);
		});
		describe("deploySharesContractAndBuy: deploying the curve with several initial shares bought", function() {
			beforeEach(async function() {
				await payment_token.transfer(issuer, price, {from: a0});
				await payment_token.approve(factory.address, price, {from: issuer});
				({receipt} = await factory_deploy_shares(
					issuer,
					factory,
					undefined,
					undefined,
					undefined,
					init_amount,
				));
			});
			consumes_no_more_than(852592);
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with no initial shares bought", function() {
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				const subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				({receipt} = await factory_deploy_shares(a0, factory, subject, issuer));
			});
			consumes_no_more_than(623607);
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with one initial share bought", function() {
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				const subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				({receipt} = await factory_deploy_shares(
					a0,
					factory,
					subject,
					issuer,
					undefined,
					1,
				));
			});
			consumes_no_more_than(746095);
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with several initial shares bought", function() {
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				const subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};

				await payment_token.approve(factory.address, price, {from: a0});
				({receipt} = await factory_deploy_shares(
					a0,
					factory,
					subject,
					issuer,
					undefined,
					init_amount,
				));
			});
			consumes_no_more_than(991829);
		});
		describe("executeDeploymentRequest: EIP712 sign and relay the deployment request", function() {
			// create empty account with known private key
			const signer = web3.eth.accounts.create();
			beforeEach(async function() {
				await factory.updateRole(signer.address, ROLE_SHARES_REGISTRAR, {from: a0});
			});
			describe("deploying the curve with no initial shares bought", function() {
				beforeEach(async function() {
					({receipt} = await factory_deploy_shares_eip712(signer, relayer, factory));
				});
				consumes_no_more_than(659936);
			});
			describe("deploying the curve with one initial share bought", function() {
				beforeEach(async function() {
					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						undefined,
						undefined,
						undefined,
						1,
					));
				});
				consumes_no_more_than(782444);
			});
			describe("deploying the curve with several initial shares bought", function() {
				beforeEach(async function() {
					await payment_token.transfer(relayer, price, {from: a0});
					await payment_token.approve(factory.address, price, {from: relayer});
					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						undefined,
						undefined,
						undefined,
						init_amount,
					));
				});
				consumes_no_more_than(1004258);
			});
			describe("minting NFT and deploying the curve with no initial shares bought", function() {
				beforeEach(async function() {
					const nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					const subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
					));
				});
				consumes_no_more_than(659920);
			});
			describe("minting NFT and deploying the curve with one initial share bought", function() {
				beforeEach(async function() {
					const nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					const subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
						undefined,
						1,
					));
				});
				consumes_no_more_than(782408);
			});
			describe("minting NFT and deploying the curve with several initial shares bought", function() {
				beforeEach(async function() {
					const nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					const subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					await payment_token.transfer(relayer, price, {from: a0});
					await payment_token.approve(factory.address, price, {from: relayer});
					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
						undefined,
						init_amount,
					));
				});
				consumes_no_more_than(1023318);
			});
			{
				// override the signer account with a new one with no special permissions
				const signer = web3.eth.accounts.create();
				describe("minting third-party NFT and deploying the curve with no initial shares bought", function() {
					beforeEach(async function() {
						const nft = await deploy_royal_nft(a0);
						await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
						const subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await nft.transferOwnership(signer.address, {from: a0});

						({receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
						));
					});
					consumes_no_more_than(663721);
				});
				describe("minting third-party NFT and deploying the curve with one initial share bought", function() {
					beforeEach(async function() {
						const nft = await deploy_royal_nft(a0);
						await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
						const subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await nft.transferOwnership(signer.address, {from: a0});

						({receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
							undefined,
							1,
						));
					});
					consumes_no_more_than(786217);
				});
				describe("minting third-party NFT and deploying the curve with several initial shares bought", function() {
					beforeEach(async function() {
						const nft = await deploy_royal_nft(a0);
						await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
						const subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await nft.transferOwnership(signer.address, {from: a0});

						await payment_token.transfer(relayer, price, {from: a0});
						await payment_token.approve(factory.address, price, {from: relayer});
						({receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
							undefined,
							init_amount,
						));
					});
					consumes_no_more_than(1027143);
				});
			}
		});
	});
	describe("after the factory is deployed and configured without the shares holders distributor", function() {
		// override the price so that holdersFeeAmount is not taken into account
		const price = get_buy_price_after_fee(
			0,
			init_amount,
			protocol_fee_percent,
			new BN(0),
			subject_fee_percent,
		);

		let payment_token, factory;
		beforeEach(async function() {
			({payment_token, factory} = await deploy_factory_and_configure(
				a0,
				shares_owner,
				undefined,
				protocol_fee_percent,
				holders_fee_percent,
				subject_fee_percent,
				undefined,
				undefined,
				undefined,
				undefined,
				ZERO_ADDRESS,
			));
		});

		describe("deploySharesContractPaused: deploying the curve with no initial shares bought", async function() {
			beforeEach(async function() {
				({receipt} = await factory_deploy_shares(a0, factory));
			});
			consumes_no_more_than(329780);
		});
		describe("deploySharesContract: deploying the curve with one initial share bought", function() {
			beforeEach(async function() {
				({receipt} = await factory_deploy_shares(
					issuer,
					factory,
					undefined,
					undefined,
					undefined,
					1,
				));
			});
			consumes_no_more_than(385949);
		});
		describe("deploySharesContractAndBuy: deploying the curve with several initial shares bought", function() {
			beforeEach(async function() {
				await payment_token.transfer(issuer, price, {from: a0});
				await payment_token.approve(factory.address, price, {from: issuer});
				({receipt} = await factory_deploy_shares(
					issuer,
					factory,
					undefined,
					undefined,
					undefined,
					init_amount,
				));
			});
			consumes_no_more_than(538558);
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with no initial shares bought", function() {
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				const subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				({receipt} = await factory_deploy_shares(a0, factory, subject, issuer));
			});
			consumes_no_more_than(445116);
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with one initial share bought", function() {
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				const subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				({receipt} = await factory_deploy_shares(
					a0,
					factory,
					subject,
					issuer,
					undefined,
					1,
				));
			});
			consumes_no_more_than(501297);
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with several initial shares bought", function() {
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				const subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};

				await payment_token.approve(factory.address, price, {from: a0});
				({receipt} = await factory_deploy_shares(
					a0,
					factory,
					subject,
					issuer,
					undefined,
					init_amount,
				));
			});
			consumes_no_more_than(677795);
		});
		describe("executeDeploymentRequest: EIP712 sign and relay the deployment request", function() {
			// create empty account with known private key
			const signer = web3.eth.accounts.create();
			beforeEach(async function() {
				await factory.updateRole(signer.address, ROLE_SHARES_REGISTRAR, {from: a0});
			});
			describe("deploying the curve with no initial shares bought", function() {
				beforeEach(async function() {
					({receipt} = await factory_deploy_shares_eip712(signer, relayer, factory));
				});
				consumes_no_more_than(481465);
			});
			describe("deploying the curve with one initial share bought", function() {
				beforeEach(async function() {
					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						undefined,
						undefined,
						undefined,
						1,
					));
				});
				consumes_no_more_than(537626);
			});
			describe("deploying the curve with several initial shares bought", function() {
				beforeEach(async function() {
					await payment_token.transfer(relayer, price, {from: a0});
					await payment_token.approve(factory.address, price, {from: relayer});
					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						undefined,
						undefined,
						undefined,
						init_amount,
					));
				});
				consumes_no_more_than(690244);
			});
			describe("minting NFT and deploying the curve with no initial shares bought", function() {
				beforeEach(async function() {
					const nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					const subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
					));
				});
				consumes_no_more_than(481429);
			});
			describe("minting NFT and deploying the curve with one initial share bought", function() {
				beforeEach(async function() {
					const nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					const subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
						undefined,
						1,
					));
				});
				consumes_no_more_than(537610);
			});
			describe("minting NFT and deploying the curve with several initial shares bought", function() {
				beforeEach(async function() {
					const nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					const subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					await payment_token.transfer(relayer, price, {from: a0});
					await payment_token.approve(factory.address, price, {from: relayer});
					({receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
						undefined,
						init_amount,
					));
				});
				consumes_no_more_than(709288);
			});
			{
				// override the signer account with a new one with no special permissions
				const signer = web3.eth.accounts.create();
				describe("minting third-party NFT and deploying the curve with no initial shares bought", function() {
					beforeEach(async function() {
						const nft = await deploy_royal_nft(a0);
						await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
						const subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await nft.transferOwnership(signer.address, {from: a0});

						({receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
						));
					});
					consumes_no_more_than(485238);
				});
				describe("minting third-party NFT and deploying the curve with one initial share bought", function() {
					beforeEach(async function() {
						const nft = await deploy_royal_nft(a0);
						await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
						const subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await nft.transferOwnership(signer.address, {from: a0});

						({receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
							undefined,
							1,
						));
					});
					consumes_no_more_than(541431);
				});
				describe("minting third-party NFT and deploying the curve with several initial shares bought", function() {
					beforeEach(async function() {
						const nft = await deploy_royal_nft(a0);
						await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
						const subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await nft.transferOwnership(signer.address, {from: a0});

						await payment_token.transfer(relayer, price, {from: a0});
						await payment_token.approve(factory.address, price, {from: relayer});
						({receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
							undefined,
							init_amount,
						));
					});
					consumes_no_more_than(713105);
				});
			}
		});
	});
});
