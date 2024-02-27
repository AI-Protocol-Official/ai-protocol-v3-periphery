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
	ETH,
	get_price_erc20: get_price,
	get_buy_price_after_fee_erc20: get_buy_price_after_fee,
} = require("./include/curves");

// RBAC
const {
	ROLE_TOKEN_CREATOR,
	ROLE_SHARES_REGISTRAR,
} = require("@ai-protocol/v3-core/test/include/features_roles");

// custom balance tracker for the ERC20 token
const balance = require("./include/balance");

// import total supply constant for the ALI ERC20 token we're using here
const {TOTAL_SUPPLY: S0}  = require("@ai-protocol/v3-core/test/ali_token/include/ali_erc20_constants");

// deployment routines in use
const {
	SharesImplementationType: ImplType,
	deploy_royal_nft,
	deploy_factory,
	deploy_factory_and_configure,
	factory_deploy_shares: fds,
	factory_deploy_shares_eip712: fds_eip712,
	deploy_shares_ERC20,
} = require("./include/deployment_routines");

// redefine the shares deployment functions to make ERC20 deployment type the default ones
const factory_deploy_shares =
	    async(a0, factory, subject, issuer, impl_type = ImplType.ERC20, amount, value) =>
	await fds(a0, factory, subject, issuer, impl_type,                  amount, value);
const factory_deploy_shares_eip712 =
	           async(signer, relayer, factory, subject, issuer, impl_type = ImplType.ERC20, amount, value, sig_valid_from, sig_expires_at, sig_nonce) =>
	await fds_eip712(signer, relayer, factory, subject, issuer, impl_type,                  amount, value, sig_valid_from, sig_expires_at, sig_nonce);

// run SharesFactory and ERC20Shares tests
contract("SharesFactory and ERC20Shares", function(accounts) {
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

	describe("after the factory is deployed but not configured", function() {
		let payment_token, factory;
		beforeEach(async function() {
			({payment_token, factory} = await deploy_factory(a0));
		});
		it("shares deployment fails because there is no implementation registered", async function() {
			await expectRevert(factory_deploy_shares(a0, factory), "implementation not registered");
		});
	});

	describe("after the factory is deployed and configured", function() {
		let protocol_fee_destination, protocol_fee_percent, holders_fee_percent, subject_fee_percent, payment_token, factory;
		beforeEach(async function() {
			({
				protocol_fee_destination,
				protocol_fee_percent,
				holders_fee_percent,
				subject_fee_percent,
				payment_token,
				factory,
			} = await deploy_factory_and_configure(a0, shares_owner));
			// move the tokens to the issuer
			await payment_token.transfer(issuer, S0, {from: a0});
		});

		it("shares deployment fails if subject points to non-callable address", async function() {
			const zero_subject = {
				tokenAddress: ZERO_ADDRESS,
				tokenId: "0",
			};
			await expectRevert.unspecified(factory_deploy_shares(a0, factory, zero_subject));
		});
		it("shares deployment fails if subject points to non-ERC721 callable address", async function() {
			const invalid_subject = {
				tokenAddress: factory.address,
				tokenId: "0",
			};
			await expectRevert.unspecified(factory_deploy_shares(a0, factory, invalid_subject));
		});
		it("shares deployment fails if non-zero value is supplied (zero shares)", async function() {
			await expectRevert(factory_deploy_shares(
				a0,
				factory,
				undefined,
				issuer,
				ImplType.ERC20,
				0,
				1,
			), "non-zero value");
		});
		it("shares deployment fails if non-zero value is supplied (one share)", async function() {
			await expectRevert(factory_deploy_shares(
				a0,
				factory,
				undefined,
				issuer,
				ImplType.ERC20,
				1,
				1,
			), "non-zero value");
		});
		it("shares deployment fails if non-zero value is supplied (two shares)", async function() {
			await expectRevert(factory_deploy_shares(
				a0,
				factory,
				undefined,
				issuer,
				ImplType.ERC20,
				2,
				1,
			), "non-zero value");
		});
		describe("only SHARES_REGISTRAR can deploy someone else's subject", function() {
			let subject;
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				await nft.mint(issuer, subject.tokenId, {from: a0});
			});
			it("shares deployment fails if done not by the issuer and not by SHARES_REGISTRAR", async function() {
				await expectRevert(factory_deploy_shares(someone, factory, subject), "access denied");
			});
			describe("shares deployment succeeds if done by the issuer", function() {
				let _issuer;
				beforeEach(async function() {
					({issuer: _issuer} = await factory_deploy_shares(issuer, factory, subject));
				});
				it("issuer is resolved correctly", async function() {
					expect(_issuer).to.be.equal(issuer);
				});
			});
			describe("shares deployment succeeds if done by SHARES_REGISTRAR", function() {
				let _issuer;
				beforeEach(async function() {
					({issuer: _issuer} = await factory_deploy_shares(a0, factory, subject));
				});
				it("issuer is resolved correctly", async function() {
					expect(_issuer).to.be.equal(issuer);
				});
			});
		});
		describe("only SHARES_REGISTRAR can mint the subject", function() {
			let subject;
			beforeEach(async function() {
				const nft = await deploy_royal_nft(a0);
				subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
			});
			it("shares deployment fails if done not by the issuer and not by SHARES_REGISTRAR", async function() {
				await expectRevert(factory_deploy_shares(someone, factory, subject), "access denied");
			});
			it("shares deployment fails if done by the issuer and not by SHARES_REGISTRAR", async function() {
				await expectRevert(factory_deploy_shares(issuer, factory, subject), "access denied");
			});
			it("shares deployment fails if done by SHARES_REGISTRAR and issuer is not specified", async function() {
				await expectRevert(factory_deploy_shares(a0, factory, subject, ZERO_ADDRESS), "invalid subject");
			});
			describe("shares deployment succeeds if done by SHARES_REGISTRAR", function() {
				let _issuer;
				beforeEach(async function() {
					({issuer: _issuer} = await factory_deploy_shares(a0, factory, subject, issuer));
				});
				it("issuer is resolved correctly", async function() {
					expect(_issuer).to.be.equal(issuer);
				});
			});
		});
		describe("deploySharesContractPaused: deploying the curve with no initial shares bought", function() {
			let distributor, shares, subject, receipt;
			beforeEach(async function() {
				({distributor, shares, subject, receipt} = await factory_deploy_shares(a0, factory));
			});
			it('"SharesContractRegistered" event is emitted', async function() {
				expectEvent(receipt, "SharesContractRegistered", {
					implementationType: ImplType.ERC20,
					creator: a0,
					newDeployment: true,
				});
			});
			it("lookupSharesContract succeeds", async function() {
				expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
			});
			it("shares holders fee distributor gets set", async function() {
				expect(await shares.getHoldersFeeDestination()).to.be.equal(distributor.address);
			});
			it("shares holders fee percent gets set correctly", async function() {
				expect(await shares.getHoldersFeePercent()).to.be.bignumber.that.equals(holders_fee_percent);
			});
			it("shares contract subject gets set correctly", async function() {
				expect(await shares.getSharesSubject()).to.containSubset(subject);
			});
			it("impossible to deploy shares contract for the same subject", async function() {
				await expectRevert(factory_deploy_shares(a0, factory, subject), "subject in use");
			});
			it("sharesSupply gets set to zero", async function() {
				expect(await shares.getSharesSupply()).to.be.bignumber.that.equals("0");
			});
			it("shares contract owner permissions get set correctly", async function() {
				expect(await shares.getRole(shares_owner)).to.be.bignumber.that.equals(MAX_UINT256);
			});
			it('"SharesTraded" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "SharesTraded");
			});
			it('"FeeReceived" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
			});
		});
		describe("deploySharesContract: deploying the curve with one initial share bought", function() {
			let subject, shares, distributor, receipt;
			beforeEach(async function() {
				({
					subject,
					shares,
					distributor,
					receipt,
				} = await factory_deploy_shares(issuer, factory, undefined, undefined, undefined, 1));
			});
			it('"Trade" event is emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, shares, "Trade", {
					beneficiary: issuer,
					issuer,
					isBuy: true,
					sharesAmount: "1",
					paidAmount: "0",
					protocolFeeAmount: "0",
					subjectFeeAmount: "0",
					supply: "1",
				});
			});
			it('"SharesContractRegistered" event is emitted', async function() {
				expectEvent(receipt, "SharesContractRegistered", {
					implementationType: ImplType.ERC20,
					creator: issuer,
					newDeployment: true,
				});
			});
			it("lookupSharesContract succeeds", async function() {
				expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
			});
			it("sharesSupply gets set to one", async function() {
				expect(await shares.getSharesSupply()).to.be.bignumber.that.equals("1");
			});
			it('"SharesTraded" event is emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, distributor, "SharesTraded", {
					trader: issuer,
					isBuy: true,
					sharesAmount: "1",
				});
			});
			it('"FeeReceived" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
			});
		});
		describe("deploySharesContractAndBuy: deploying the curve with several initial shares bought", function() {
			const init_amount = new BN(3);
			let price, value, protocolFeeAmount, holdersFeeAmount, subjectFeeAmount;
			let protocol_fee_balance_tracker, issuer_balance_tracker;
			let subject, shares, distributor, receipt;
			beforeEach(async function() {
				price = await get_price(0, init_amount);
				protocolFeeAmount = price.mul(protocol_fee_percent).div(ETH);
				holdersFeeAmount = price.mul(holders_fee_percent).div(ETH);
				subjectFeeAmount = price.mul(subject_fee_percent).div(ETH);
				value = price.add(protocolFeeAmount).add(holdersFeeAmount).add(subjectFeeAmount);
				await payment_token.approve(factory.address, value, {from: issuer});

				protocol_fee_balance_tracker = await balance.tracker(protocol_fee_destination, payment_token);
				issuer_balance_tracker = await balance.tracker(issuer, payment_token);

				({
					subject,
					shares,
					distributor,
					receipt,
				} = await factory_deploy_shares(issuer, factory, undefined, undefined, undefined, init_amount));
			});
			it('"SharesContractRegistered" event is emitted', async function() {
				expectEvent(receipt, "SharesContractRegistered", {
					implementationType: ImplType.ERC20,
					creator: issuer,
					newDeployment: true,
				});
			});
			it("lookupSharesContract succeeds", async function() {
				expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
			});
			it('"Trade" event is emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, shares, "Trade", {
					beneficiary: issuer,
					issuer,
					isBuy: true,
					sharesAmount: init_amount,
					paidAmount: price,
					protocolFeeAmount,
					holdersFeeAmount,
					subjectFeeAmount,
					supply: init_amount,
				});
			});
			it("sharesSupply increases by the amount expected", async function() {
				expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount);
			});
			it("sharesBalances increases by the amount expected", async function() {
				expect(await shares.getSharesBalance(issuer)).to.be.bignumber.that.equals(init_amount);
			});
			it("issuer balance decreases by the BuyPriceAfterFee and increases by subjectFeeAmount", async function() {
				const {delta, fees} = await issuer_balance_tracker.deltaWithFees();
				expect(delta.add(fees)).to.be.bignumber.that.equals(value.neg().add(subjectFeeAmount));
			});
			it("shares contract balance increases by price", async function() {
				expect(await payment_token.balanceOf(shares.address)).to.be.bignumber.that.equals(price);
			});
			it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
				expect(await protocol_fee_balance_tracker.delta()).to.be.bignumber.that.equals(protocolFeeAmount);
			});
			it("shares holders fee destination balance increases by holdersFeeAmount", async function() {
				expect(await payment_token.balanceOf(distributor.address)).to.be.bignumber.that.equals(holdersFeeAmount);
			});
			it("factory balance remains zero", async function() {
				expect(await payment_token.balanceOf(factory.address)).to.be.bignumber.that.equals("0");
			});
			it('"SharesTraded" event is emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, distributor, "SharesTraded", {
					trader: issuer,
					isBuy: true,
					sharesAmount: init_amount,
				});
			});
			it('"FeeReceived" event not emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, distributor, "FeeReceived", {
					feeAmount: holdersFeeAmount,
				});
			});
		});
		describe("mintSubjectAndDeployShares: minting NFT and deploying the curve with no initial shares bought", function() {
			let nft, subject, receipt;
			beforeEach(async function() {
				nft = await deploy_royal_nft(a0);
				await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
				subject = {
					tokenAddress: nft.address,
					tokenId: "1",
				};
				({receipt} = await factory_deploy_shares(a0, factory, subject, issuer));
			});
			it('ERC721 "Transfer" event is emitted (NFT is minted)', async function() {
				await expectEvent.inTransaction(receipt.tx, nft, "Transfer", {
					_from: ZERO_ADDRESS,
					_to: issuer,
					_tokenId: subject.tokenId,
				});
			});
		});
		describe("executeDeploymentRequest: EIP712 sign and relay the deployment request", function() {
			// create empty account with known private key
			const signer = web3.eth.accounts.create();
			beforeEach(async function() {
				await factory.updateRole(signer.address, ROLE_SHARES_REGISTRAR, {from: a0});
			});
			it("fails if signed not by a ROLE_SHARES_REGISTRAR", async function() {
				await expectRevert(factory_deploy_shares_eip712(web3.eth.accounts.create(), relayer, factory), "access denied");
			});
			it("fails if the signature is not yet valid", async function() {
				await expectRevert(factory_deploy_shares_eip712(
					signer,
					relayer,
					factory,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					4294967296,
				), "not yet valid");
			});
			it("fails if the signature already expired", async function() {
				await expectRevert(factory_deploy_shares_eip712(
					signer,
					relayer,
					factory,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					1,
				), "expired");
			});
			describe("deploying the curve with no initial shares bought", function() {
				let shares, subject, issuer, distributor, receipt;
				beforeEach(async function() {
					({shares, subject, issuer, distributor, receipt} = await factory_deploy_shares_eip712(signer, relayer, factory));
				});
				it('"SharesContractRegistered" event is emitted', async function() {
					expectEvent(receipt, "SharesContractRegistered", {
						implementationType: ImplType.ERC20,
						creator: relayer,
						newDeployment: true,
					});
				});
				it("lookupSharesContract succeeds", async function() {
					expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
				});
				it("shares contract subject gets set correctly", async function() {
					expect(await shares.getSharesSubject()).to.containSubset(subject);
				});
				it("impossible to deploy another curve for the same subject", async function() {
					await expectRevert(factory_deploy_shares_eip712(signer, relayer, factory, subject), "subject in use");
				});
				it("sharesSupply gets set to zero", async function() {
					expect(await shares.getSharesSupply()).to.be.bignumber.that.equals("0");
				});
				it("shares contract owner permissions get set correctly", async function() {
					expect(await shares.getRole(shares_owner)).to.be.bignumber.that.equals(MAX_UINT256);
				});
				it("distributor contract owner permissions get set correctly", async function() {
					expect(await distributor.getRole(shares_owner)).to.be.bignumber.that.equals(MAX_UINT256);
				});
				it('"NonceUsed" event emitted', async function() {
					expectEvent(receipt, "NonceUsed", {issuer, nonce: "0"});
				});
				it("nonce increases by one", async function() {
					expect(await factory.getNonce(issuer)).to.be.bignumber.that.equals("1");
				});
				it("impossible to deploy shares contract with the same nonce", async function() {
					await expectRevert(factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						undefined,
						undefined,
						undefined,
						undefined,
						undefined,
						undefined,
						undefined,
						"0",
					), "invalid nonce");
				});
				it('"SharesTraded" event is not emitted', async function() {
					await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "SharesTraded");
				});
				it('"FeeReceived" event is not emitted', async function() {
					await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
				});
			});
			describe("minting NFT and deploying the curve with several initial shares bought", function() {
				const init_amount = new BN(3);
				let price, value, protocolFeeAmount, holdersFeeAmount, subjectFeeAmount;
				let signer_balance_tracker, relayer_balance_tracker, protocol_fee_balance_tracker, issuer_balance_tracker;
				let nft, subject, shares, distributor, receipt;
				beforeEach(async function() {
					price = await get_price(0, init_amount);
					protocolFeeAmount = price.mul(protocol_fee_percent).div(ETH);
					holdersFeeAmount = price.mul(holders_fee_percent).div(ETH);
					subjectFeeAmount = price.mul(subject_fee_percent).div(ETH);
					value = price.add(protocolFeeAmount).add(holdersFeeAmount).add(subjectFeeAmount);
					await payment_token.transfer(relayer, value, {from: issuer});
					await payment_token.approve(factory.address, value, {from: relayer});

					signer_balance_tracker = await balance.tracker(signer.address, payment_token);
					relayer_balance_tracker = await balance.tracker(relayer, payment_token);
					protocol_fee_balance_tracker = await balance.tracker(protocol_fee_destination, payment_token);
					issuer_balance_tracker = await balance.tracker(issuer, payment_token);

					nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};

					({shares, distributor, receipt} = await factory_deploy_shares_eip712(
						signer,
						relayer,
						factory,
						subject,
						issuer,
						ImplType.ERC20,
						init_amount,
					));
				});
				it('"SharesContractRegistered" event is emitted', async function() {
					expectEvent(receipt, "SharesContractRegistered", {
						implementationType: ImplType.ERC20,
						sharesSubject: Object.values(subject),
						creator: issuer,
						newDeployment: true,
					});
				});
				it("lookupSharesContract succeeds", async function() {
					expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
				});
				it('ERC721 "Transfer" event is emitted (NFT is minted)', async function() {
					await expectEvent.inTransaction(receipt.tx, nft, "Transfer", {
						_from: ZERO_ADDRESS,
						_to: issuer,
						_tokenId: subject.tokenId,
					});
				});
				it("sharesSupply increases by the amount expected", async function() {
					expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount);
				});
				it("sharesBalances increases by the amount expected", async function() {
					expect(await shares.getSharesBalance(issuer)).to.be.bignumber.that.equals(init_amount);
				});
				it("signer balance doesn't change", async function() {
					expect(await signer_balance_tracker.delta()).to.be.bignumber.that.equals("0");
				});
				it("relayer balance decreases by the BuyPriceAfterFee", async function() {
					const {delta, fees} = await relayer_balance_tracker.deltaWithFees();
					expect(delta.add(fees)).to.be.bignumber.that.equals(value.neg());
				});
				it("issuer balance increases by subjectFeeAmount", async function() {
					expect(await issuer_balance_tracker.delta()).to.be.bignumber.that.equals(subjectFeeAmount);
				});
				it("shares contract balance increases by price", async function() {
					expect(await payment_token.balanceOf(shares.address)).to.be.bignumber.that.equals(price);
				});
				it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
					expect(await protocol_fee_balance_tracker.delta()).to.be.bignumber.that.equals(protocolFeeAmount);
				});
				it("shares holders fee destination balance increases by holdersFeeAmount", async function() {
					expect(await payment_token.balanceOf(distributor.address)).to.be.bignumber.that.equals(holdersFeeAmount);
				});
				it("factory balance remains zero", async function() {
					expect(await payment_token.balanceOf(factory.address)).to.be.bignumber.that.equals("0");
				});
				it('"SharesTraded" event is emitted', async function() {
					await expectEvent.inTransaction(receipt.tx, distributor, "SharesTraded", {
						trader: issuer,
						isBuy: true,
						sharesAmount: init_amount,
					});
				});
				it('"FeeReceived" event not emitted', async function() {
					await expectEvent.inTransaction(receipt.tx, distributor, "FeeReceived", {
						feeAmount: holdersFeeAmount,
					});
				});
			});
			describe("minting third-party NFT and deploying the curve with one share bought", function() {
				// override the signer account with a new one with no special permissions
				const signer = web3.eth.accounts.create();

				let nft, subject;
				beforeEach(async function() {
					nft = await deploy_royal_nft(a0);
					await nft.updateRole(factory.address, ROLE_TOKEN_CREATOR, {from: a0});
					subject = {
						tokenAddress: nft.address,
						tokenId: "1",
					};
				});
				it("fails if signer is not an ERC721 contract owner (OZ ownable)", async function() {
					await expectRevert(
						factory_deploy_shares_eip712(signer, relayer, factory, subject, issuer, ImplType.ERC20, 1),
						"access denied"
					);
				});
				describe("succeeds otherwise", function() {
					let shares, distributor, receipt;
					beforeEach(async function() {
						await nft.transferOwnership(signer.address, {from: a0});
						({shares, distributor, receipt} = await factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
							ImplType.ERC20,
							1,
						));
					});
					it('"SharesContractRegistered" event is emitted', async function() {
						expectEvent(receipt, "SharesContractRegistered", {
							implementationType: ImplType.ERC20,
							sharesSubject: Object.values(subject),
							creator: issuer,
							newDeployment: true,
						});
					});
					it("lookupSharesContract succeeds", async function() {
						expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
					});
					it('ERC721 "Transfer" event is emitted (NFT is minted)', async function() {
						await expectEvent.inTransaction(receipt.tx, nft, "Transfer", {
							_from: ZERO_ADDRESS,
							_to: issuer,
							_tokenId: subject.tokenId,
						});
					});
					it("shares contract subject gets set correctly", async function() {
						expect(await shares.getSharesSubject()).to.containSubset(subject);
					});
					it("impossible to deploy another curve for the same subject", async function() {
						await expectRevert(factory_deploy_shares_eip712(signer, relayer, factory, subject), "subject in use");
					});
					it("sharesSupply gets set to one", async function() {
						expect(await shares.getSharesSupply()).to.be.bignumber.that.equals("1");
					});
					it("shares contract owner permissions get set correctly", async function() {
						expect(await shares.getRole(shares_owner)).to.be.bignumber.that.equals(MAX_UINT256);
					});
					it("distributor contract owner permissions get set correctly", async function() {
						expect(await distributor.getRole(shares_owner)).to.be.bignumber.that.equals(MAX_UINT256);
					});
					it('"NonceUsed" event emitted', async function() {
						expectEvent(receipt, "NonceUsed", {issuer, nonce: "0"});
					});
					it("nonce increases by one", async function() {
						expect(await factory.getNonce(issuer)).to.be.bignumber.that.equals("1");
					});
					it("impossible to deploy shares contract with the same nonce", async function() {
						const subject = {
							tokenAddress: nft.address,
							tokenId: "2",
						};
						await expectRevert(factory_deploy_shares_eip712(
							signer,
							relayer,
							factory,
							subject,
							issuer,
							undefined,
							undefined,
							undefined,
							undefined,
							undefined,
							"0",
						), "invalid nonce");
					});
					it('"SharesTraded" event is emitted', async function() {
						await expectEvent.inTransaction(receipt.tx, distributor, "SharesTraded", {
							trader: issuer,
							isBuy: true,
							sharesAmount: "1",
						});
					});
					it('"FeeReceived" event is not emitted', async function() {
						await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
					});
				});
			});
		});
		describe("registerSharesContract", function() {
			let subject, holders_fee_destination, shares;
			beforeEach(async function() {
				({subject, holders_fee_destination, shares} = await deploy_shares_ERC20(a0, payment_token, issuer, undefined, protocol_fee_destination));
			});
			describe("registering the detached shares contract", function() {
				let receipt;
				beforeEach(async function() {
					receipt = await factory.registerSharesContract(shares.address, {from: a0});
				});
				it('"SharesContractRegistered" event is emitted', async function() {
					expectEvent(receipt, "SharesContractRegistered", {
						implementationType: ImplType.ERC20,
						sharesSubject: Object.values(subject),
						creator: issuer,
						implementationContract: shares.address,
						holdersRewardsDistributor: holders_fee_destination,
						newDeployment: false,
					});
				});
				it("lookupSharesContract succeeds", async function() {
					expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
				});
				describe("re-registering same contract doesn't have any effect", function() {
					let receipt;
					beforeEach(async function() {
						receipt = await factory.registerSharesContract(shares.address, {from: a0});
					});
					it('"SharesContractRegistered" event is NOT emitted', async function() {
						expectEvent.notEmitted(receipt, "SharesContractRegistered");
					});
				});
				describe("after changing the subject on the registered contract", function() {
					const new_subject = {
						tokenAddress: ZERO_ADDRESS,
						tokenId: "0",
					};
					let receipt;
					beforeEach(async function() {
						receipt = await shares.updateSharesSubject(new_subject, {from: a0});
					});
					it('"SharesSubjectUpdated" event is emitted with no factory notification', async function() {
						expectEvent(receipt, "SharesSubjectUpdated", {
							oldSubject: Object.values(subject),
							newSubject: Object.values(new_subject),
							factory: ZERO_ADDRESS,
						});
					});
					it('"SharesContractRegistered" event is not emitted on the factory', async function() {
						await expectEvent.notEmitted.inTransaction(receipt.tx, factory, "SharesContractRegistered");
					});
					describe("re-registering the contract with the modified subject succeeds", function() {
						let receipt;
						beforeEach(async function() {
							receipt = await factory.registerSharesContract(shares.address, {from: a0});
						});
						it('"SharesContractRegistered" event is emitted', async function() {
							expectEvent(receipt, "SharesContractRegistered", {
								implementationType: ImplType.ERC20,
								sharesSubject: Object.values(new_subject),
								creator: ZERO_ADDRESS,
								implementationContract: shares.address,
								holdersRewardsDistributor: holders_fee_destination,
								newDeployment: false,
							});
						});
						it("new subject: lookupSharesContract succeeds", async function() {
							expect(await factory.lookupSharesContract(new_subject)).to.be.equal(shares.address);
						});
						it("old subject: lookupSharesContract fails (returns zero)", async function() {
							expect(await factory.lookupSharesContract(subject)).to.be.equal(ZERO_ADDRESS);
						});
					});
				});
				describe("changing the subject on the registered contract with the factory notification", function() {
					it("fails if new subject is invalid", async function() {
						const new_subject = {
							tokenAddress: ZERO_ADDRESS,
							tokenId: "0",
						};
						await expectRevert(
							shares.methods["updateSharesSubject((address,uint256),address)"](new_subject, factory.address, {from: a0}),
							"invalid subject"
						);
					});
					it("fails if new subject doesn't exist", async function() {
						const nft = await deploy_royal_nft(a0);
						const new_subject = {
							tokenAddress: nft.address,
							tokenId: "1",
						};
						await expectRevert(
							shares.methods["updateSharesSubject((address,uint256),address)"](new_subject, factory.address, {from: a0}),
							"invalid subject"
						);
					});
					it("fails if new subject is already assigned to another curve", async function() {
						const {subject: new_subject} = await factory_deploy_shares(a0, factory);
						await expectRevert(
							shares.methods["updateSharesSubject((address,uint256),address)"](new_subject, factory.address, {from: a0}),
							"subject in use"
						);
					});
					describe("succeeds otherwise", function() {
						describe("goes silent if the subject is the same", function() {
							let receipt;
							beforeEach(async function() {
								receipt = await shares.methods["updateSharesSubject((address,uint256),address)"](subject, factory.address, {from: a0});
							});
							it('"SharesSubjectUpdated" event is emitted with the factory notification', async function() {
								expectEvent(receipt, "SharesSubjectUpdated", {
									oldSubject: Object.values(subject),
									newSubject: Object.values(subject),
									factory: factory.address,
								});
							});
							it('"SharesContractRegistered" event is not emitted on the factory', async function() {
								await expectEvent.notEmitted.inTransaction(receipt.tx, factory, "SharesContractRegistered");
								it("lookupSharesContract succeeds", async function() {
									expect(await factory.lookupSharesContract(subject)).to.be.equal(shares.address);
								});
							});
						});
						describe("if the subject is not the same", function() {
							let new_subject, receipt;
							beforeEach(async function() {
								const nft = await deploy_royal_nft(a0);
								new_subject = {
									tokenAddress: nft.address,
									tokenId: "1",
								};
								await nft.mint(issuer, new_subject.tokenId, {from: a0});

								receipt = await shares.methods["updateSharesSubject((address,uint256),address)"](new_subject, factory.address, {from: a0});
							});
							it('"SharesSubjectUpdated" event is emitted with the factory notification', async function() {
								expectEvent(receipt, "SharesSubjectUpdated", {
									oldSubject: Object.values(subject),
									newSubject: Object.values(new_subject),
									factory: factory.address,
								});
							});
							it('"SharesContractRegistered" event is emitted on the factory', async function() {
								await expectEvent.inTransaction(receipt.tx, factory, "SharesContractRegistered", {
									implementationType: ImplType.ERC20,
									sharesSubject: Object.values(new_subject),
									creator: issuer,
									implementationContract: shares.address,
									holdersRewardsDistributor: holders_fee_destination,
									newDeployment: false,
								});
							});
							it("new subject: lookupSharesContract succeeds", async function() {
								expect(await factory.lookupSharesContract(new_subject)).to.be.equal(shares.address);
							});
							it("old subject: lookupSharesContract fails (returns zero)", async function() {
								expect(await factory.lookupSharesContract(subject)).to.be.equal(ZERO_ADDRESS);
							});
						});
					});
				});
				describe("registering another detached contract with the same subject", function() {
					let shares;
					beforeEach(async function() {
						({shares} = await deploy_shares_ERC20(a0, payment_token, issuer, subject, protocol_fee_destination));
					});
					it("fails", async function() {
						await expectRevert(factory.registerSharesContract(shares.address, {from: a0}), "subject in use");
					});
				});
			});
		});
	});

	describe("after the factory is deployed and configured without the shares holders distributor fee", function() {
		let protocol_fee_destination, protocol_fee_percent, holders_fee_percent, subject_fee_percent, payment_token, factory;
		beforeEach(async function() {
			holders_fee_percent = new BN(0);
			({
				protocol_fee_destination,
				protocol_fee_percent,
				/*holders_fee_percent,*/
				subject_fee_percent,
				payment_token,
				factory,
			} = await deploy_factory_and_configure(
				a0,
				shares_owner,
				undefined,
				undefined,
				holders_fee_percent,
			));
			// move the tokens to the issuer
			await payment_token.transfer(issuer, S0, {from: a0});
		});
		describe("when the curve is deployed with no initial shares bought", function() {
			let distributor, shares, subject, receipt;
			beforeEach(async function() {
				({distributor, shares, subject, receipt} = await factory_deploy_shares(a0, factory));
			});
			it('"SharesTraded" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "SharesTraded");
			});
			it('"FeeReceived" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
			});
		});
		describe("when the curve is deployed with one initial share bought", function() {
			let distributor, shares, subject, receipt;
			beforeEach(async function() {
				({distributor, shares, subject, receipt} = await factory_deploy_shares(
					a0,
					factory,
					undefined,
					issuer,
					undefined,
					1,
				));
			});
			it('"SharesTraded" event is emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, distributor, "SharesTraded", {
					trader: issuer,
					isBuy: true,
					sharesAmount: "1",
				});
			});
			it('"FeeReceived" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
			});
		});
		describe("when the curve is deployed with several initial shares bought", function() {
			const init_amount = new BN(7);
			let distributor, shares, subject, receipt;
			beforeEach(async function() {
				const price = await get_buy_price_after_fee(
					0,
					init_amount,
					protocol_fee_percent,
					holders_fee_percent,
					subject_fee_percent
				);
				await payment_token.approve(factory.address, price, {from: issuer});
				({distributor, shares, subject, receipt} = await factory_deploy_shares(
					issuer,
					factory,
					undefined,
					issuer,
					undefined,
					init_amount,
				));
			});
			it('"SharesTraded" event is emitted', async function() {
				await expectEvent.inTransaction(receipt.tx, distributor, "SharesTraded", {
					trader: issuer,
					isBuy: true,
					sharesAmount: init_amount,
				});
			});
			it('"FeeReceived" event is not emitted', async function() {
				await expectEvent.notEmitted.inTransaction(receipt.tx, distributor, "FeeReceived");
			});
		});
	});
	describe("after the factory is deployed and configured without the shares holders distributor", function() {
		let protocol_fee_destination, protocol_fee_percent, holders_fee_percent, subject_fee_percent, payment_token, factory;
		beforeEach(async function() {
			holders_fee_percent = new BN(0);
			({
				protocol_fee_destination,
				protocol_fee_percent,
				/*holders_fee_percent,*/
				subject_fee_percent,
				payment_token,
				factory,
			} = await deploy_factory_and_configure(
				a0,
				shares_owner,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				ZERO_ADDRESS,
			));
			// move the tokens to the issuer
			await payment_token.transfer(issuer, S0, {from: a0});
		});
		describe("when the curve is deployed with no initial shares bought", function() {
			let receipt;
			beforeEach(async function() {
				({receipt} = await factory_deploy_shares(a0, factory));
			});
			it('"SharesContractRegistered" event is emitted with a zero distributor', async function() {
				expectEvent(receipt, "SharesContractRegistered", {holdersRewardsDistributor: ZERO_ADDRESS});
			});
		});
		describe("when the curve is deployed with one initial share bought", function() {
			let receipt;
			beforeEach(async function() {
				({receipt} = await factory_deploy_shares(
					a0,
					factory,
					undefined,
					issuer,
					undefined,
					1,
				));
			});
			it('"SharesContractRegistered" event is emitted with a zero distributor', async function() {
				expectEvent(receipt, "SharesContractRegistered", {holdersRewardsDistributor: ZERO_ADDRESS});
			});
		});
		describe("when the curve is deployed with several initial shares bought", function() {
			const init_amount = new BN(6);
			let receipt;
			beforeEach(async function() {
				const price = await get_buy_price_after_fee(
					0,
					init_amount,
					protocol_fee_percent,
					holders_fee_percent,
					subject_fee_percent,
				);
				await payment_token.approve(factory.address, price, {from: issuer});
				({receipt} = await factory_deploy_shares(
					issuer,
					factory,
					undefined,
					issuer,
					undefined,
					init_amount,
				));
			});
			it('"SharesContractRegistered" event is emitted with a zero distributor', async function() {
				expectEvent(receipt, "SharesContractRegistered", {holdersRewardsDistributor: ZERO_ADDRESS});
			});
		});
	});
});
