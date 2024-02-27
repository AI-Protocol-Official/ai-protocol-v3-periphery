// Zeppelin test helpers
const {
	BN,
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

// bonding curves
const {
	get_buy_price_eth: get_buy_price,
} = require("./include/curves");

// RBAC
const {
	not,
	FEATURE_SHARES_DEPLOYMENT_ENABLED,
	FEATURE_ALLOW_PAUSED_DEPLOYMENTS,
	FEATURE_ALLOW_EXCLUSIVE_BUY,
	ROLE_TOKEN_CREATOR,
	ROLE_PROTOCOL_FEE_MANAGER,
	ROLE_HOLDERS_FEE_MANAGER,
	ROLE_SUBJECT_FEE_MANAGER,
	ROLE_SHARES_REGISTRAR,
	ROLE_FACTORY_DEPLOYMENT_MANAGER,
} = require("../include/features_roles");

// deployment routines in use
const {
	SharesImplementationType: ImplType,
	deploy_royal_nft,
	deploy_shares_ETH,
	deploy_shares_ERC20,
	deploy_factory,
	factory_deploy_pure,
	deploy_protocol_fee_distributor,
	deploy_holders_rewards_distributor,
} = require("./include/deployment_routines");

// run SharesFactory tests
contract("SharesFactory", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;

	it("cannot deploy a factory with the zero ERC20 payment token", async function() {
		await expectRevert(factory_deploy_pure(a0, ZERO_ADDRESS), "zero address");
	});
	describe("after the factory is deployed", function() {
		const alt_fee_dest = a1;
		const issuer = a2;
		const someone = a3;
		const operator = a4;
		const shares_owner = a5;
		let protocol_fee_destination, payment_token, factory;
		beforeEach(async function() {
			({payment_token, factory} = await deploy_factory(a0));
			({address: protocol_fee_destination} = await deploy_protocol_fee_distributor(a0, payment_token));
		});
		it("paymentToken gets set correctly", async function() {
			expect(await factory.getPaymentToken()).to.be.equal(payment_token.address);
		});
		it("getSharesOwnerAddress is initially zero", async function() {
			expect(await factory.getSharesOwnerAddress()).to.be.equal(ZERO_ADDRESS);
		});
		it("postConstruct() initializer is no longer executable", async function() {
			await expectRevert(
				factory.postConstruct(payment_token.address, {from: a0}),
				"Initializable: contract is already initialized"
			);
		});

		describe("getters/setters", function() {
			const TEN_PERCENT = web3.utils.toWei(new BN(1), "ether").divn(10);
			const THIRTY_PERCENT = TEN_PERCENT.muln(3);
			const ONE_PERCENT = TEN_PERCENT.divn(10);
			const TEN_PERCENT_MALFORMED = new BN(10);

			describe("sharesOwnerAddress", function() {
				function succeedsToSetSharesOwnerAddress(value) {
					let receipt;
					beforeEach(async function() {
						receipt = await factory.setSharesOwnerAddress(value, {from: a0});
					});
					it('"SharesOwnerAddressUpdated" event is emitted', async function() {
						expectEvent(receipt, "SharesOwnerAddressUpdated", {sharesOwnerAddress: value});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getSharesOwnerAddress()).to.be.equal(value);
					});
				}
				describe("successfully sets zero address", function() {
					succeedsToSetSharesOwnerAddress(ZERO_ADDRESS);
				});
				describe("successfully sets non-zero address", function() {
					succeedsToSetSharesOwnerAddress(someone);
				});
			});
			describe("sharesImplAddress", function() {
				function succeedsToSetSharesImplAddress(value, impl_type = ImplType.ERC20) {
					let receipt;
					beforeEach(async function() {
						receipt = await factory.setSharesImplAddress(impl_type, value, {from: a0});
					});
					it('"SharesImplAddressUpdated" event is emitted', async function() {
						expectEvent(receipt, "SharesImplAddressUpdated", {
							implementationType: impl_type,
							implementationAddress: value,
						});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getSharesImplAddress(impl_type)).to.be.equal(value);
					});
				}
				describe("successfully sets zero address", function() {
					succeedsToSetSharesImplAddress(ZERO_ADDRESS);
				});
				describe("successfully sets non-zero address", function() {
					succeedsToSetSharesImplAddress(someone);
				});
			});
			describe("distributorImplAddress", function() {
				function succeedsToSetDistributorImplAddress(value, impl_type = ImplType.ERC20) {
					let receipt;
					beforeEach(async function() {
						receipt = await factory.setDistributorImplAddress(impl_type, value, {from: a0});
					});
					it('"DistributorImplAddressUpdated" event is emitted', async function() {
						expectEvent(receipt, "DistributorImplAddressUpdated", {
							implementationType: impl_type,
							implementationAddress: value,
						});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getDistributorImplAddress(impl_type)).to.be.equal(value);
					});
				}

				describe("successfully sets zero address", function() {
					succeedsToSetDistributorImplAddress(ZERO_ADDRESS);
				});
				describe("successfully sets non-zero address", function() {
					succeedsToSetDistributorImplAddress(someone);
				});
			});
			describe("protocolFeeDestination", function() {
				function succeedsToSetProtocolFeeDestination(value) {
					let receipt;
					beforeEach(async function() {
						receipt = await factory.setProtocolFeeDestination(value, {from: a0});
					});
					it('"ProtocolFeeUpdated" event is emitted', async function() {
						expectEvent(receipt, "ProtocolFeeUpdated", {protocolFeeDestination: value});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getProtocolFeeDestination()).to.be.equal(value);
					});
				}
				async function failsToSetProtocolFeeDestination(value, error) {
					await expectRevert(factory.setProtocolFeeDestination(value, {from: a0}), error);
				}
				describe("when protocolFeePercent is not zero", function() {
					beforeEach(async function() {
						await factory.setProtocolFeeDestination(protocol_fee_destination, {from: a0});
						await factory.setProtocolFeePercent(ONE_PERCENT, {from: a0});
					});
					it("fails to set zero address", async function() {
						await failsToSetProtocolFeeDestination(ZERO_ADDRESS, "protocolFeePercent must be set to zero first");
					});
					describe("successfully sets non-zero address", function() {
						succeedsToSetProtocolFeeDestination(someone);
					});
				});
				describe("when protocolFeePercent is zero", function() {
					beforeEach(async function() {
						await factory.setProtocolFeePercent(0, {from: a0});
					});
					describe("successfully sets zero address", function() {
						succeedsToSetProtocolFeeDestination(ZERO_ADDRESS);
					});
					describe("successfully sets non-zero address", function() {
						succeedsToSetProtocolFeeDestination(someone);
					});
				});
			});
			describe("protocolFeePercent", function() {
				function succeedsToSetProtocolFeePercent(value) {
					value = new BN(value);

					let receipt;
					beforeEach(async function() {
						receipt = await factory.setProtocolFeePercent(value, {from: a0});
					});
					it('"ProtocolFeeUpdated" event is emitted', async function() {
						expectEvent(receipt, "ProtocolFeeUpdated", {protocolFeePercent: value});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getProtocolFeePercent()).to.be.bignumber.that.equals(value);
					});
				}
				async function failsToSetProtocolFeePercent(value, error) {
					await expectRevert(factory.setProtocolFeePercent(value, {from: a0}), error);
				}
				describe("when protocolFeeDestination is not zero", function() {
					beforeEach(async function() {
						await factory.setProtocolFeeDestination(someone, {from: a0});
					});
					describe("successfully sets zero value", function() {
						succeedsToSetProtocolFeePercent(0);
					});
					describe("successfully sets non-zero value", function() {
						succeedsToSetProtocolFeePercent(ONE_PERCENT);
					});
					it("fails to set malformed value (too small)", async function() {
						await failsToSetProtocolFeePercent(TEN_PERCENT_MALFORMED, "malformed fee percent");
					});
					it("fails to set malformed value (too big)", async function() {
						await failsToSetProtocolFeePercent(THIRTY_PERCENT, "malformed fee percent");
					});
				});
				describe("when protocolFeeDestination is zero", function() {
					beforeEach(async function() {
						await factory.setProtocolFeeDestination(ZERO_ADDRESS, {from: a0});
					});
					describe("successfully sets zero value", function() {
						succeedsToSetProtocolFeePercent(0);
					});
					it("fails to set non-zero value", async function() {
						await failsToSetProtocolFeePercent(ONE_PERCENT, "protocolFeeDestination must be set first");
					});
				});
			});
			describe("holdersFeePercent", function() {
				function succeedsToSetHoldersFeePercent(value) {
					value = new BN(value);

					let receipt;
					beforeEach(async function() {
						receipt = await factory.setHoldersFeePercent(value, {from: a0});
					});
					it('"ProtocolFeeUpdated" event is emitted', async function() {
						expectEvent(receipt, "ProtocolFeeUpdated", {holdersFeePercent: value});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getHoldersFeePercent()).to.be.bignumber.that.equals(value);
					});
				}
				async function failsToSetHoldersFeePercent(value, error) {
					await expectRevert(factory.setHoldersFeePercent(value, {from: a0}), error);
				}
				describe("successfully sets zero value", function() {
					succeedsToSetHoldersFeePercent(0);
				});
				describe("successfully sets non-zero value", function() {
					succeedsToSetHoldersFeePercent(ONE_PERCENT);
				});
				it("fails to set malformed value (too small)", async function() {
					await failsToSetHoldersFeePercent(TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it("fails to set malformed value (too big)", async function() {
					await failsToSetHoldersFeePercent(THIRTY_PERCENT, "malformed fee percent");
				});
			});
			describe("subjectFeePercent", function() {
				function succeedsToSetSubjectFeePercent(value) {
					value = new BN(value);

					let receipt;
					beforeEach(async function() {
						receipt = await factory.setSubjectFeePercent(value, {from: a0});
					});
					it('"ProtocolFeeUpdated" event is emitted', async function() {
						expectEvent(receipt, "ProtocolFeeUpdated", {subjectFeePercent: value});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getSubjectFeePercent()).to.be.bignumber.that.equals(value);
					});
				}
				async function failsToSetSubjectFeePercent(value, error) {
					await expectRevert(factory.setSubjectFeePercent(value, {from: a0}), error);
				}
				describe("successfully sets zero value", function() {
					succeedsToSetSubjectFeePercent(0);
				});
				describe("successfully sets non-zero value", function() {
					succeedsToSetSubjectFeePercent(ONE_PERCENT);
				});
				it("fails to set malformed value (too small)", async function() {
					await failsToSetSubjectFeePercent(TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it("fails to set malformed value (too big)", async function() {
					await failsToSetSubjectFeePercent(THIRTY_PERCENT, "malformed fee percent");
				});
			});
			describe("protocolFee", function() {
				function succeedsToSetProtocolFee(
					protocol_fee_destination,
					protocol_fee_percent,
					holders_fee_percent,
					subject_fee_percent,
				) {
					protocol_fee_percent = new BN(protocol_fee_percent);
					holders_fee_percent = new BN(holders_fee_percent);
					subject_fee_percent = new BN(subject_fee_percent);

					let receipt;
					beforeEach(async function() {
						receipt = await factory.setProtocolFee(
							protocol_fee_destination,
							protocol_fee_percent,
							holders_fee_percent,
							subject_fee_percent,
							{from: a0},
						);
					});
					it('"ProtocolFeeUpdated" event is emitted', async function() {
						expectEvent(receipt, "ProtocolFeeUpdated", {
							protocolFeeDestination: protocol_fee_destination,
							protocolFeePercent: protocol_fee_percent,
							holdersFeePercent: holders_fee_percent,
							subjectFeePercent: subject_fee_percent,
						});
					});
					it("values get set correctly", async function() {
						expect(await factory.getProtocolFeeDestination(), "protocolFeeDestination").to.equal(protocol_fee_destination);
						expect(await factory.getProtocolFeePercent(), "protocolFeePercent").to.be.bignumber.that.equals(protocol_fee_percent);
						expect(await factory.getHoldersFeePercent(), "holdersFeePercent").to.be.bignumber.that.equals(holders_fee_percent);
						expect(await factory.getSubjectFeePercent(), "subjectFeePercents").to.be.bignumber.that.equals(subject_fee_percent);
					});
				}
				async function failsToSetProtocolFee(
					protocol_fee_destination,
					protocol_fee_percent,
					holders_fee_percent,
					subject_fee_percent,
					error,
				) {
					await expectRevert(factory.setProtocolFee(
						protocol_fee_destination,
						protocol_fee_percent,
						holders_fee_percent,
						subject_fee_percent,
						{from: a0},
					), error);
				}
				describe("successfully sets zero values", function() {
					succeedsToSetProtocolFee(ZERO_ADDRESS, 0, 0, 0);
				});
				describe("successfully sets non-zero values", function() {
					succeedsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, ONE_PERCENT, ONE_PERCENT);
				});
				it("fails to set inconsistent values", async function() {
					await failsToSetProtocolFee(ZERO_ADDRESS, 1, 1, 1, "zero address");
				});
				let i = 1;
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, TEN_PERCENT_MALFORMED, ONE_PERCENT, ONE_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, TEN_PERCENT_MALFORMED, ONE_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, ONE_PERCENT, TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, THIRTY_PERCENT, ONE_PERCENT, ONE_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, THIRTY_PERCENT, ONE_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, ONE_PERCENT, THIRTY_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, TEN_PERCENT_MALFORMED, 0, ONE_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, TEN_PERCENT_MALFORMED, 0, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, 0, ONE_PERCENT, TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, THIRTY_PERCENT, 0, ONE_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, ONE_PERCENT, THIRTY_PERCENT, 0, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, 0, ONE_PERCENT, THIRTY_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, TEN_PERCENT_MALFORMED, THIRTY_PERCENT, 0, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, 0, TEN_PERCENT_MALFORMED, THIRTY_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, THIRTY_PERCENT, 0, TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, TEN_PERCENT_MALFORMED, THIRTY_PERCENT, THIRTY_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, THIRTY_PERCENT, TEN_PERCENT_MALFORMED, THIRTY_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, THIRTY_PERCENT, THIRTY_PERCENT, TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, TEN_PERCENT_MALFORMED, THIRTY_PERCENT, TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, TEN_PERCENT_MALFORMED, TEN_PERCENT_MALFORMED, THIRTY_PERCENT, "malformed fee percent");
				});
				it(`fails to set malformed values (${i++})`, async function() {
					await failsToSetProtocolFee(alt_fee_dest, THIRTY_PERCENT, TEN_PERCENT_MALFORMED, TEN_PERCENT_MALFORMED, "malformed fee percent");
				});
			});
			describe("nonce (rewindNonce)", function() {
				function succeedsToRewindNonce(value) {
					value = new BN(value);

					let receipt;
					beforeEach(async function() {
						receipt = await factory.rewindNonce(issuer, value, {from: a0});
					});
					it('"NonceUsed" event is emitted', async function() {
						expectEvent(receipt, "NonceUsed", {issuer, nonce: value.subn(1)});
					});
					it("value gets set correctly", async function() {
						expect(await factory.getNonce(issuer)).to.be.bignumber.that.equals(value);
					});
				}
				async function failsToRewindNonce(value, error) {
					await expectRevert(factory.rewindNonce(issuer, value, {from: a0}), error);
				}
				it("fails to set non-zero value (rewind back)", async function() {
					await failsToRewindNonce(0, "new nonce must be bigger than the current one");
				});
				describe("successfully sets non-zero value (rewind forward)", function() {
					succeedsToRewindNonce(1);
				});
			});
		});

		it("determineImplementationType: ETH", async function() {
			const {shares} = await deploy_shares_ETH(a0);
			expect(await factory.determineImplementationType(shares.address)).to.be.bignumber.that.equals(ImplType.ETH);
		});
		it("determineImplementationType: ERC20", async function() {
			const {shares} = await deploy_shares_ERC20(a0, payment_token);
			expect(await factory.determineImplementationType(shares.address)).to.be.bignumber.that.equals(ImplType.ERC20);
		});
		it("determineImplementationType: Unknown", async function() {
			const {shares} = await deploy_shares_ERC20(a0);
			await expectRevert(factory.determineImplementationType(shares.address), "unknown ERC20 implementation type");
		});

		describe("role-based access control (RBAC)", function() {
			{
				let impl_type, impl_address, subject;
				beforeEach(async function() {
					impl_type = ImplType.ETH;
					impl_address = (await deploy_shares_ETH(a0)).shares.address;
					await factory.setSharesImplAddress(impl_type, impl_address, {from: a0});
					const nft = await deploy_royal_nft(a0);
					subject = {
						tokenAddress: nft.address,
						tokenId: "1086432204",
					};
					await nft.mint(issuer, subject.tokenId, {from: a0});
				});

				// deploySharesContract FEATURE_SHARES_DEPLOYMENT_ENABLED
				{
					async function deploySharesContract() {
						const receipt = await factory.deploySharesContract(impl_type, subject, {from: issuer});
						expectEvent(receipt, "SharesContractRegistered", {creator: issuer});
					}

					describe("when feature FEATURE_SHARES_DEPLOYMENT_ENABLED is enabled", function() {
						beforeEach(async function() {
							await factory.updateFeatures(FEATURE_SHARES_DEPLOYMENT_ENABLED, {from: a0});
						});
						it("deploySharesContract succeeds", async function() {
							await deploySharesContract();
						});
					});
					describe("when feature FEATURE_SHARES_DEPLOYMENT_ENABLED is disabled", function() {
						beforeEach(async function() {
							await factory.updateFeatures(not(FEATURE_SHARES_DEPLOYMENT_ENABLED), {from: a0});
						});
						it("deploySharesContract fails", async function() {
							await expectRevert(deploySharesContract(), "shares deployments disabled");
						});
					});
				}

				// deploySharesContractPaused FEATURE_ALLOW_PAUSED_DEPLOYMENTS
				{
					async function deploySharesContractPaused() {
						const receipt = await factory.deploySharesContractPaused(impl_type, subject, {from: issuer});
						expectEvent(receipt, "SharesContractRegistered", {creator: issuer});
					}

					describe("when feature FEATURE_ALLOW_PAUSED_DEPLOYMENTS is enabled", function() {
						beforeEach(async function() {
							await factory.updateFeatures(FEATURE_SHARES_DEPLOYMENT_ENABLED | FEATURE_ALLOW_PAUSED_DEPLOYMENTS, {from: a0});
						});
						it("deploySharesContractPaused succeeds", async function() {
							await deploySharesContractPaused();
						});
					});
					describe("when feature FEATURE_ALLOW_PAUSED_DEPLOYMENTS is disabled", function() {
						beforeEach(async function() {
							await factory.updateFeatures(not(FEATURE_ALLOW_PAUSED_DEPLOYMENTS), {from: a0});
						});
						it("deploySharesContractPaused fails", async function() {
							await expectRevert(deploySharesContractPaused(), "paused deployments disabled");
						});
					});
				}

				// deploySharesContractAndBuy FEATURE_ALLOW_EXCLUSIVE_BUY
				{
					async function deploySharesContractAndBuy() {
						const amount = 2;
						const value = get_buy_price(0, amount);
						const receipt = await factory.deploySharesContractAndBuy(impl_type, subject, amount, {from: issuer, value});
						expectEvent(receipt, "SharesContractRegistered", {creator: issuer});
					}

					describe("when feature FEATURE_ALLOW_EXCLUSIVE_BUY is enabled", function() {
						beforeEach(async function() {
							await factory.updateFeatures(FEATURE_SHARES_DEPLOYMENT_ENABLED | FEATURE_ALLOW_EXCLUSIVE_BUY, {from: a0});
						});
						it("deploySharesContractAndBuy succeeds", async function() {
							await deploySharesContractAndBuy();
						});
					});
					describe("when feature FEATURE_ALLOW_EXCLUSIVE_BUY is disabled", function() {
						beforeEach(async function() {
							await factory.updateFeatures(not(FEATURE_ALLOW_EXCLUSIVE_BUY), {from: a0});
						});
						it("deploySharesContractAndBuy fails", async function() {
							await expectRevert(deploySharesContractAndBuy(), "exclusive buys disabled");
						});
					});
				}
			}
			// setProtocolFeeDestination, setProtocolFeePercent ROLE_PROTOCOL_FEE_MANAGER
			{
				async function setProtocolFeeDestination() {
					const receipt = await factory.setProtocolFeeDestination(protocol_fee_destination, {from: operator});
					expectEvent(receipt, "ProtocolFeeUpdated", {
						protocolFeeDestination: protocol_fee_destination,
					});
				}
				async function setProtocolFeePercent() {
					await factory.setProtocolFeeDestination(protocol_fee_destination, {from: a0});
					const fee_percent = new BN("15000000000000000");
					const receipt = await factory.setProtocolFeePercent(fee_percent, {from: operator});
					expectEvent(receipt, "ProtocolFeeUpdated", {
						protocolFeePercent: fee_percent,
					});
				}

				describe("when executed by ROLE_PROTOCOL_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_PROTOCOL_FEE_MANAGER, {from: a0});
					});
					it("setProtocolFeeDestination succeeds", async function() {
						await setProtocolFeeDestination();
					});
					it("setProtocolFeePercent succeeds", async function() {
						await setProtocolFeePercent();
					});
				});
				describe("when executed not by ROLE_PROTOCOL_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_PROTOCOL_FEE_MANAGER), {from: a0});
					});
					it("setProtocolFeeDestination fails", async function() {
						await expectRevert(setProtocolFeeDestination(), "access denied");
					});
					it("setProtocolFeePercent fails", async function() {
						await expectRevert(setProtocolFeePercent(), "access denied");
					});
				});
			}

			// setHoldersFeePercent ROLE_HOLDERS_FEE_MANAGER
			{
				async function setHoldersFeePercent() {
					const fee_percent = new BN("15000000000000000");
					const receipt = await factory.setHoldersFeePercent(fee_percent, {from: operator});
					expectEvent(receipt, "ProtocolFeeUpdated", {
						holdersFeePercent: fee_percent,
					});
				}

				describe("when executed by ROLE_HOLDERS_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_HOLDERS_FEE_MANAGER, {from: a0});
					});
					it("setHoldersFeePercent succeeds", async function() {
						await setHoldersFeePercent();
					});
				});
				describe("when executed not by ROLE_HOLDERS_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_HOLDERS_FEE_MANAGER), {from: a0});
					});
					it("setHoldersFeePercent fails", async function() {
						await expectRevert(setHoldersFeePercent(), "access denied");
					});
				});
			}

			// setSubjectFeePercent ROLE_SUBJECT_FEE_MANAGER
			{
				async function setSubjectFeePercent() {
					const fee_percent = new BN("15000000000000000");
					const receipt = await factory.setSubjectFeePercent(fee_percent, {from: operator});
					expectEvent(receipt, "ProtocolFeeUpdated", {
						subjectFeePercent: fee_percent,
					});
				}

				describe("when executed by ROLE_SUBJECT_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_SUBJECT_FEE_MANAGER, {from: a0});
					});
					it("setSubjectFeePercent succeeds", async function() {
						await setSubjectFeePercent();
					});
				});
				describe("when executed not by ROLE_SUBJECT_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_SUBJECT_FEE_MANAGER), {from: a0});
					});
					it("setSubjectFeePercent fails", async function() {
						await expectRevert(setSubjectFeePercent(), "access denied");
					});
				});
			}

			// setProtocolFee ROLE_PROTOCOL_FEE_MANAGER + ROLE_HOLDERS_FEE_MANAGER + ROLE_SUBJECT_FEE_MANAGER
			{
				async function setProtocolFee() {
					const fee_percent = new BN("15000000000000000");
					const receipt = await factory.setProtocolFee(
						protocol_fee_destination,
						fee_percent,
						fee_percent,
						fee_percent,
						{from: operator},
					);
					expectEvent(receipt, "ProtocolFeeUpdated", {
						protocolFeeDestination: protocol_fee_destination,
						protocolFeePercent: fee_percent,
						holdersFeePercent: fee_percent,
						subjectFeePercent: fee_percent,
					});
				}

				describe("when executed by ROLE_PROTOCOL_FEE_MANAGER + ROLE_HOLDERS_FEE_MANAGER + ROLE_SUBJECT_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_PROTOCOL_FEE_MANAGER | ROLE_HOLDERS_FEE_MANAGER | ROLE_SUBJECT_FEE_MANAGER, {from: a0});
					});
					it("setProtocolFee succeeds", async function() {
						await setProtocolFee();
					});
				});
				describe("when executed not by ROLE_PROTOCOL_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_PROTOCOL_FEE_MANAGER), {from: a0});
					});
					it("setProtocolFee fails", async function() {
						await expectRevert(setProtocolFee(), "access denied");
					});
				});
				describe("when executed not by ROLE_HOLDERS_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_HOLDERS_FEE_MANAGER), {from: a0});
					});
					it("setProtocolFee fails", async function() {
						await expectRevert(setProtocolFee(), "access denied");
					});
				});
				describe("when executed not by ROLE_SUBJECT_FEE_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_SUBJECT_FEE_MANAGER), {from: a0});
					});
					it("setProtocolFee fails", async function() {
						await expectRevert(setProtocolFee(), "access denied");
					});
				});
			}

			// mintSubjectAndDeployShares ROLE_SHARES_REGISTRAR
			{
				let impl_type, impl_address, subject;
				beforeEach(async function() {
					impl_type = ImplType.ETH;
					impl_address = (await deploy_shares_ETH(a0)).shares.address;
					await factory.setSharesImplAddress(impl_type, impl_address, {from: a0});
					const nft = await deploy_royal_nft(a0);
					subject = {
						tokenAddress: nft.address,
						tokenId: "1086432204",
					};
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				});

				async function mintSubjectAndDeployShares(amount) {
					const value = get_buy_price(0, amount);
					const receipt = await factory.mintSubjectAndDeployShares(impl_type, subject, issuer, amount, {from: operator, value});
					expectEvent(receipt, "SharesContractRegistered", {creator: issuer});
				}

				describe("when executed by ROLE_SHARES_REGISTRAR", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_SHARES_REGISTRAR, {from: a0});
					});
					it("mintSubjectAndDeployShares succeeds [amount = 0]", async function() {
						await mintSubjectAndDeployShares(0);
					});
					it("mintSubjectAndDeployShares succeeds [amount = 1]", async function() {
						await mintSubjectAndDeployShares(1);
					});
					it("mintSubjectAndDeployShares succeeds [amount > 1]", async function() {
						await mintSubjectAndDeployShares(2);
					});
				});
				describe("when executed not by ROLE_SHARES_REGISTRAR", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_SHARES_REGISTRAR), {from: a0});
					});
					it("mintSubjectAndDeployShares fails [amount = 0]", async function() {
						await expectRevert(mintSubjectAndDeployShares(0), "access denied");
					});
					it("mintSubjectAndDeployShares fails [amount = 1]", async function() {
						await expectRevert(mintSubjectAndDeployShares(1), "access denied");
					});
					it("mintSubjectAndDeployShares fails [amount > 1]", async function() {
						await expectRevert(mintSubjectAndDeployShares(2), "access denied");
					});
				});
			}

			// rewindNonce ROLE_SHARES_REGISTRAR
			{
				async function rewindNonce() {
					let receipt = await factory.rewindNonce(issuer, 1, {from: operator});
					expectEvent(receipt, "NonceUsed", {issuer, nonce: "0"});
				}

				describe("when executed by ROLE_SHARES_REGISTRAR", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_SHARES_REGISTRAR, {from: a0});
					});
					it("rewindNonce succeeds", async function() {
						await rewindNonce();
					});
				});
				describe("when executed not by ROLE_SHARES_REGISTRAR", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_SHARES_REGISTRAR), {from: a0});
					});
					it("rewindNonce fails", async function() {
						await expectRevert(rewindNonce(), "access denied");
					});
				});
			}

			// registerSharesContract ROLE_SHARES_REGISTRAR
			{
				async function registerSharesContract() {
					const {shares} = await deploy_shares_ETH(a0);
					const receipt = await factory.registerSharesContract(shares.address, {from: operator});
					expectEvent(receipt, "SharesContractRegistered", {
						implementationContract: shares.address,
					});
				}

				describe("when executed by ROLE_SHARES_REGISTRAR", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_SHARES_REGISTRAR, {from: a0});
					});
					it("registerSharesContract succeeds", async function() {
						await registerSharesContract();
					});
				});
				describe("when executed not by ROLE_SHARES_REGISTRAR", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_SHARES_REGISTRAR), {from: a0});
					});
					it("registerSharesContract fails", async function() {
						await expectRevert(registerSharesContract(), "access denied");
					});
				});
			}

			// setSharesImplAddress, setDistributorImplAddress, setSharesOwnerAddress ROLE_FACTORY_DEPLOYMENT_MANAGER
			{
				async function setSharesImplAddress() {
					const impl_type = ImplType.ETH;
					const {shares} = await deploy_shares_ETH(a0);
					const receipt = await factory.setSharesImplAddress(impl_type, shares.address, {from: operator});
					expectEvent(receipt, "SharesImplAddressUpdated", {
						implementationType: impl_type,
						implementationAddress: shares.address,
					});
				}
				async function setDistributorImplAddress() {
					const impl_type = ImplType.ETH;
					const distributor = await deploy_holders_rewards_distributor(a0);
					const receipt = await factory.setDistributorImplAddress(impl_type, distributor.address, {from: operator});
					expectEvent(receipt, "DistributorImplAddressUpdated", {
						implementationType: impl_type,
						implementationAddress: distributor.address,
					});
				}
				async function setSharesOwnerAddress() {
					const receipt = await factory.setSharesOwnerAddress(shares_owner, {from: operator});
					expectEvent(receipt, "SharesOwnerAddressUpdated", {
						sharesOwnerAddress: shares_owner,
					});
				}

				describe("when executed by ROLE_FACTORY_DEPLOYMENT_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, ROLE_FACTORY_DEPLOYMENT_MANAGER, {from: a0});
					});
					it("setSharesImplAddress succeeds", async function() {
						await setSharesImplAddress();
					});
					it("setDistributorImplAddress succeeds", async function() {
						await setDistributorImplAddress();
					});
					it("setSharesOwnerAddress succeeds", async function() {
						await setSharesOwnerAddress();
					});
				});
				describe("when executed not by ROLE_FACTORY_DEPLOYMENT_MANAGER", function() {
					beforeEach(async function() {
						await factory.updateRole(operator, not(ROLE_FACTORY_DEPLOYMENT_MANAGER), {from: a0});
					});
					it("setSharesImplAddress fails", async function() {
						await expectRevert(setSharesImplAddress(), "access denied");
					});
					it("setDistributorImplAddress fails", async function() {
						await expectRevert(setDistributorImplAddress(), "access denied");
					});
					it("setSharesOwnerAddress fails", async function() {
						await expectRevert(setSharesOwnerAddress(), "access denied");
					});
				});
			}

			// notifySubjectUpdated - only from the registered contract
			{
				let shares, subject;
				beforeEach(async function() {
					({shares} = await deploy_shares_ETH(a0));
					const nft = await deploy_royal_nft(a0);
					subject = {
						tokenAddress: nft.address,
						tokenId: "1086432204",
					};
					await nft.mint(issuer, subject.tokenId, {from: a0});
				})

				async function notifySubjectUpdated() {
					const receipt = await shares.methods["updateSharesSubject((address,uint256),address)"](subject, factory.address, {from: a0});
					expectEvent(receipt, "SharesSubjectUpdated", {factory: factory.address});
				}
				describe("when executed by registered shares contract", function() {
					beforeEach(async function() {
						await factory.registerSharesContract(shares.address, {from: a0});
					});
					it("notifySubjectUpdated succeeds", async function() {
						await notifySubjectUpdated();
					});
				});
				describe("when executed by non-registered shares contract", function() {
					it("notifySubjectUpdated fails", async function() {
						await expectRevert(notifySubjectUpdated(), "not registered");
					});
				});
			}
		});
	});
});
