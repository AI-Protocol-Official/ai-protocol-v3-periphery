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

// bonding curves
const {
	ETH,
} = require("./include/curves");

// RBAC
const {
	not,
	ROLE_SHARES_SUBJECT_MANAGER,
	ROLE_PROTOCOL_FEE_DESTINATION_MANAGER,
	ROLE_HOLDERS_FEE_DISABLE_MANAGER,
} = require("@ai-protocol/v3-core/test/include/features_roles");

// deployment routines in use
const {
	deploy_shares_ETH,
	deploy_protocol_fee_distributor,
	deploy_holders_rewards_distributor,
} = require("./include/deployment_routines");

// run ETHShares tests
contract("ETHShares (standalone)", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;

	// define the "players"
	const issuer = a2;
	const buyer = a3;
	const someone = a4;
	const operator = a5;

	// define common variables across all the tests
	let owner, subject, amount, beneficiary, shares;
	let protocol_fee_destination, holders_fee_destination, holders_fee_distributor;
	let protocol_fee_percent, holders_fee_percent, subject_fee_percent;

	// define a generic test routine
	function main_test_suite(has_protocol_fee = true, has_holders_fee = true) {
		// the suite expects the deployment to be ready and common variables be initialized
		it("sharesSubject gets set correctly", async function() {
			expect(await shares.getSharesSubject()).to.containSubset(subject);
		});
		it("protocolFeeDestination gets set correctly", async function() {
			expect(await shares.getProtocolFeeDestination()).to.be.equal(protocol_fee_destination);
		});
		it("protocolFeePercent gets set correctly", async function() {
			expect(await shares.getProtocolFeePercent()).to.be.bignumber.that.equals(protocol_fee_percent);
		});
		it("holdersFeeDestination gets set correctly", async function() {
			expect(await shares.getHoldersFeeDestination()).to.be.equal(holders_fee_destination);
		});
		it("holdersFeePercent gets set correctly", async function() {
			expect(await shares.getHoldersFeePercent()).to.be.bignumber.that.equals(holders_fee_percent);
		});
		it("subjectFeePercent gets set correctly", async function() {
			expect(await shares.getSubjectFeePercent()).to.be.bignumber.that.equals(subject_fee_percent);
		});
		it("sharesSupply gets set to zero", async function() {
			expect(await shares.getSharesSupply()).to.be.bignumber.that.equals("0");
		});
		it("sharesBalances gets set to zero", async function() {
			expect(await shares.getSharesBalance(issuer), "issuer").to.be.bignumber.that.equals("0");
			expect(await shares.getSharesBalance(beneficiary), "beneficiary").to.be.bignumber.that.equals("0");
		});
		it("owner permissions get set correctly", async function() {
			expect(await shares.getRole(owner)).to.be.bignumber.that.equals(MAX_UINT256);
		});
		it("tradeVolume get set to zero", async function() {
			expect(await shares.getTradeVolume()).to.be.bignumber.that.equals("0");
		});
		it("postConstruct() initializer is no longer executable", async function() {
			await expectRevert(shares.postConstruct(
				owner,
				subject,
				protocol_fee_destination,
				protocol_fee_percent,
				holders_fee_destination,
				holders_fee_percent,
				subject_fee_percent,
				amount,
				beneficiary,
				{from: a0},
			), "Initializable: contract is already initialized");
		});

		function buying_the_shares(change = 0) {
			change = new BN(change);

			describe("buying the very first share", function() {
				it("fails if buying not by the issuer", async function() {
					await expectRevert(shares.buyShares(1, {from: buyer}), "only the issuer can buy the first share");
				});
				describe("succeeds otherwise", function() {
					let receipt;
					beforeEach(async function() {
						receipt = await shares.buyShares(1, {from: issuer});
					});
					it('"Trade" event is emitted', async function() {
						expectEvent(receipt, "Trade", {
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
					if(has_holders_fee) {
						it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
							await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
								trader: issuer,
								isBuy: true,
								sharesAmount: "1",
							});
						});
						it('"FeeReceived" event is not emitted on the HoldersRewardsDistributor', async function() {
							await expectEvent.notEmitted.inTransaction(receipt.tx, holders_fee_distributor, "FeeReceived");
						});
					}
					it("sharesSupply increases to one", async function() {
						expect(await shares.getSharesSupply()).to.be.bignumber.that.equals("1");
					});
					it("sharesBalances increases to one", async function() {
						expect(await shares.getSharesBalance(issuer)).to.be.bignumber.that.equals("1");
					});
					it("tradeVolume remains zero", async function() {
						expect(await shares.getTradeVolume()).to.be.bignumber.that.equals("0");
					});
					it("impossible to sell the first/last share back", async function() {
						await expectRevert(shares.sellShares(1, {from: issuer}), "cannot sell the last share");
					});
					describe("buying next shares", function() {
						const amount = new BN(1);
						it("fails if ETH supplied is zero", async function() {
							await expectRevert(
								shares.buyShares(amount, {from: buyer}),
								has_holders_fee && !holders_fee_percent.isZero()? "sync failed": "insufficient value supplied"
							);
						});
						describe("succeeds otherwise", function() {
							let buyer_tracker, shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
							let buy_price, value, effective_value, protocol_fee, holders_fee, subject_fee;
							let receipt;
							beforeEach(async function() {
								buyer_tracker = await balance.tracker(buyer);
								shares_tracker = await balance.tracker(shares.address);
								protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
								holders_fee_tracker = await balance.tracker(holders_fee_destination);
								issuer_tracker = await balance.tracker(issuer);
								buy_price = await shares.getBuyPrice(amount);
								protocol_fee = has_protocol_fee? buy_price.mul(protocol_fee_percent).div(ETH): new BN(0);
								holders_fee = has_holders_fee? buy_price.mul(holders_fee_percent).div(ETH): new BN(0);
								subject_fee = buy_price.mul(subject_fee_percent).div(ETH);
								value = await shares.getBuyPriceAfterFee(amount);
								effective_value = buy_price.add(protocol_fee).add(holders_fee).add(subject_fee);
								receipt = await shares.buyShares(amount, {from: buyer, value: value.add(change)});
							});
							it('"Trade" event is emitted', async function() {
								expectEvent(receipt, "Trade", {
									beneficiary: buyer,
									issuer,
									isBuy: true,
									sharesAmount: amount,
									paidAmount: buy_price,
									protocolFeeAmount: protocol_fee,
									holdersFeeAmount: holders_fee,
									subjectFeeAmount: subject_fee,
									supply: amount.addn(1),
								});
							});
							if(has_holders_fee) {
								it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
									await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
										trader: buyer,
										isBuy: true,
										sharesAmount: "1",
									});
								});
								it('"FeeReceived" event is [not]emitted on the HoldersRewardsDistributor', async function() {
									const fn = holders_fee.isZero()? expectEvent.notEmitted.inTransaction: expectEvent.inTransaction;
									await fn(receipt.tx, holders_fee_distributor, "FeeReceived", {feeAmount: holders_fee});
								});
							}
							it("sharesSupply increases by the amount expected", async function() {
								expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(amount.addn(1));
							});
							it("sharesBalances increases by the amount expected", async function() {
								expect(await shares.getSharesBalance(buyer)).to.be.bignumber.that.equals(amount);
							});
							it("tradeVolume increases by the shares price", async function() {
								expect(await shares.getTradeVolume()).to.be.bignumber.that.equals(buy_price);
							});
							it("buyer balance decreases by the BuyPriceAfterFee", async function() {
								const {delta, fees} = await buyer_tracker.deltaWithFees();
								expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value.neg());
							});
							it("shares contract balance increases by price", async function() {
								expect(await shares_tracker.delta()).to.be.bignumber.that.equals(buy_price);
							});
							it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
								expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
							});
							it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
								expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
							});
							it("issuer balance increases by subjectFeeAmount", async function() {
								expect(await issuer_tracker.delta()).to.be.bignumber.that.equals(subject_fee);
							});
							it("impossible to sell back more shares than what is available on the balance", async function() {
								await expectRevert(shares.sellShares(1, {from: someone}), "insufficient shares");
							});

							describe("issuer can sell the first share back", function() {
								let shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
								let sell_price, value, effective_value, protocol_fee, holders_fee, subject_fee;
								let receipt;
								beforeEach(async function() {
									shares_tracker = await balance.tracker(shares.address);
									protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
									holders_fee_tracker = await balance.tracker(holders_fee_destination);
									issuer_tracker = await balance.tracker(issuer);
									sell_price = await shares.getSellPrice(1);
									protocol_fee = has_protocol_fee? sell_price.mul(protocol_fee_percent).div(ETH): new BN(0);
									holders_fee = has_holders_fee? sell_price.mul(holders_fee_percent).div(ETH): new BN(0);
									subject_fee = sell_price.mul(subject_fee_percent).div(ETH);
									value = await shares.getSellPriceAfterFee(1);
									effective_value = sell_price.sub(protocol_fee).sub(holders_fee).sub(subject_fee);
									receipt = await shares.sellShares(1, {from: issuer});
								});
								it('"Trade" event is emitted', async function() {
									expectEvent(receipt, "Trade", {
										beneficiary: issuer,
										issuer,
										isBuy: false,
										sharesAmount: "1",
										paidAmount: sell_price,
										protocolFeeAmount: protocol_fee,
										holdersFeeAmount: holders_fee,
										subjectFeeAmount: subject_fee,
										supply: amount,
									});
									if(has_holders_fee) {
										it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
											await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
												trader: issuer,
												isBuy: false,
												sharesAmount: "1",
											});
										});
										it('"FeeReceived" event is [not]emitted on the HoldersRewardsDistributor', async function() {
											const fn = holders_fee.isZero()? expectEvent.notEmitted.inTransaction: expectEvent.inTransaction;
											await fn(receipt.tx, holders_fee_distributor, "FeeReceived", {feeAmount: holders_fee});
										});
									}
									it("sharesSupply decreases by one", async function() {
										expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(amount);
									});
									it("sharesBalances decreases by one", async function() {
										expect(await shares.getSharesBalance(buyer)).to.be.bignumber.that.equals(amount.subn(1));
									});
									it("tradeVolume increases by the shares price", async function() {
										expect(await shares.getTradeVolume()).to.be.bignumber.that.equals(buy_price.add(sell_price));
									});
									it("issuer balance increases by the SellPriceAfterFee and increases by subjectFeeAmount", async function() {
										const {delta, fees} = await buyer_tracker.deltaWithFees();
										expect(delta.sub(fees)).to.be.bignumber.that.equals(value.add(subject_fee));
									});
									it("shares contract balance decreases by price", async function() {
										expect(await shares_tracker.delta()).to.be.bignumber.that.equals(sell_price.neg());
									});
									it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
										expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
									});
									it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
										expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
									});
									it("buyer cannot now send his (last) shares back", async function() {
										await expectRevert(shares.sellShares(amount, {from: buyer}), "cannot sell the last share");
									});
								});
							});
						});
					});
				});
			});
			describe("buying several first shares", function() {
				const init_amount = new BN(2);
				it("fails if buying not by the issuer", async function() {
					await expectRevert(shares.buyShares(init_amount, {from: buyer, value: ETH}), "only the issuer can buy the first share");
				});
				it("fails if ETH supplied is zero", async function() {
					await expectRevert(
						shares.buyShares(init_amount, {from: issuer}),
						has_holders_fee && !holders_fee_percent.isZero()? "sync failed": "insufficient value supplied"
					);
				});
				describe("succeeds otherwise", function() {
					let shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
					let first_price, value, effective_value, protocol_fee, holders_fee, subject_fee;
					let receipt;
					beforeEach(async function() {
						shares_tracker = await balance.tracker(shares.address);
						protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
						holders_fee_tracker = await balance.tracker(holders_fee_destination);
						issuer_tracker = await balance.tracker(issuer);
						first_price = await shares.getBuyPrice(init_amount);
						protocol_fee = has_protocol_fee? first_price.mul(protocol_fee_percent).div(ETH): new BN(0);
						holders_fee = has_holders_fee? first_price.mul(holders_fee_percent).div(ETH): new BN(0);
						subject_fee = first_price.mul(subject_fee_percent).div(ETH);
						value = await shares.getBuyPriceAfterFee(init_amount);
						effective_value = first_price.add(protocol_fee).add(holders_fee).add(subject_fee);
						receipt = await shares.buyShares(init_amount, {from: issuer, value: value.add(change)});
					});
					it('"Trade" event is emitted', async function() {
						expectEvent(receipt, "Trade", {
							beneficiary: issuer,
							issuer,
							isBuy: true,
							sharesAmount: init_amount,
							paidAmount: first_price,
							protocolFeeAmount: protocol_fee,
							holdersFeeAmount: holders_fee,
							subjectFeeAmount: subject_fee,
							supply: init_amount,
						});
					});
					if(has_holders_fee) {
						it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
							await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
								trader: issuer,
								isBuy: true,
								sharesAmount: init_amount,
							});
						});
						it('"FeeReceived" event is [not]emitted on the HoldersRewardsDistributor', async function() {
							const fn = holders_fee.isZero()? expectEvent.notEmitted.inTransaction: expectEvent.inTransaction;
							await fn(receipt.tx, holders_fee_distributor, "FeeReceived", {feeAmount: holders_fee});
						});
					}
					it("sharesSupply increases by the amount expected", async function() {
						expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount);
					});
					it("sharesBalances increases by the amount expected", async function() {
						expect(await shares.getSharesBalance(issuer)).to.be.bignumber.that.equals(init_amount);
					});
					it("tradeVolume increases by the shares price", async function() {
						expect(await shares.getTradeVolume()).to.be.bignumber.that.equals(first_price);
					});
					it("issuer balance decreases by the BuyPriceAfterFee and increases by subjectFeeAmount", async function() {
						const {delta, fees} = await issuer_tracker.deltaWithFees();
						expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value.neg().add(subject_fee));
					});
					it("shares contract balance increases by price", async function() {
						expect(await shares_tracker.delta()).to.be.bignumber.that.equals(first_price);
					});
					it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
						expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
					});
					it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
						expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
					});
					describe("buying next shares", function() {
						const buy_amount = new BN(3);
						it("fails if ETH supplied is zero", async function() {
							// here the shares contract sends its own money to pay the holders fee ;)
							// and only after that the security check happens, so we don't have the "sync failed" error
							await expectRevert(shares.buyShares(buy_amount, {from: buyer}), "insufficient value supplied");
						});
						describe("succeeds otherwise", function() {
							let buyer_tracker, shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
							let next_price, value, effective_value, protocol_fee, holders_fee, subject_fee;
							let receipt;
							beforeEach(async function() {
								buyer_tracker = await balance.tracker(buyer);
								shares_tracker = await balance.tracker(shares.address);
								protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
								holders_fee_tracker = await balance.tracker(holders_fee_destination);
								issuer_tracker = await balance.tracker(issuer);
								next_price = await shares.getBuyPrice(buy_amount);
								protocol_fee = has_protocol_fee? next_price.mul(protocol_fee_percent).div(ETH): new BN(0);
								holders_fee = has_holders_fee? next_price.mul(holders_fee_percent).div(ETH): new BN(0);
								subject_fee = next_price.mul(subject_fee_percent).div(ETH);
								value = await shares.getBuyPriceAfterFee(buy_amount);
								effective_value = next_price.add(protocol_fee).add(holders_fee).add(subject_fee);
								receipt = await shares.buyShares(buy_amount, {from: buyer, value: value.add(change)});
							});
							it('"Trade" event is emitted', async function() {
								expectEvent(receipt, "Trade", {
									beneficiary: buyer,
									issuer,
									isBuy: true,
									sharesAmount: buy_amount,
									paidAmount: next_price,
									protocolFeeAmount: protocol_fee,
									holdersFeeAmount: holders_fee,
									subjectFeeAmount: subject_fee,
									supply: init_amount.add(buy_amount),
								});
							});
							if(has_holders_fee) {
								it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
									await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
										trader: buyer,
										isBuy: true,
										sharesAmount: buy_amount,
									});
								});
								it('"FeeReceived" event is [not]emitted on the HoldersRewardsDistributor', async function() {
									const fn = holders_fee.isZero()? expectEvent.notEmitted.inTransaction: expectEvent.inTransaction;
									await fn(receipt.tx, holders_fee_distributor, "FeeReceived", {feeAmount: holders_fee});
								});
							}
							it("sharesSupply increases by the amount expected", async function() {
								expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount.add(buy_amount));
							});
							it("sharesBalances increases by the amount expected", async function() {
								expect(await shares.getSharesBalance(buyer)).to.be.bignumber.that.equals(buy_amount);
							});
							it("tradeVolume increases by the shares price", async function() {
								expect(await shares.getTradeVolume()).to.be.bignumber.that.equals(first_price.add(next_price));
							});
							it("buyer balance decreases by the BuyPriceAfterFee", async function() {
								const {delta, fees} = await buyer_tracker.deltaWithFees();
								expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value.neg());
							});
							it("shares contract balance increases by price", async function() {
								expect(await shares_tracker.delta()).to.be.bignumber.that.equals(next_price);
							});
							it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
								expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
							});
							it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
								expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
							});
							it("issuer balance increases by subjectFeeAmount", async function() {
								expect(await issuer_tracker.delta()).to.be.bignumber.that.equals(subject_fee);
							});

							describe("selling some shares back", function() {
								const seller = buyer;
								const sell_amount = new BN(1);
								let seller_tracker, shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
								let sell_price, value, effective_value, protocol_fee, holders_fee, subject_fee;
								let receipt;
								beforeEach(async function() {
									seller_tracker = await balance.tracker(seller);
									shares_tracker = await balance.tracker(shares.address);
									protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
									holders_fee_tracker = await balance.tracker(holders_fee_destination);
									issuer_tracker = await balance.tracker(issuer);
									sell_price = await shares.getSellPrice(sell_amount);
									protocol_fee = has_protocol_fee? sell_price.mul(protocol_fee_percent).div(ETH): new BN(0);
									holders_fee = has_holders_fee? sell_price.mul(holders_fee_percent).div(ETH): new BN(0);
									subject_fee = sell_price.mul(subject_fee_percent).div(ETH);
									value = await shares.getSellPriceAfterFee(sell_amount);
									effective_value = sell_price.sub(protocol_fee).sub(holders_fee).sub(subject_fee);
									receipt = await shares.sellShares(sell_amount, {from: seller});
								});
								it('"Trade" event is emitted', async function() {
									expectEvent(receipt, "Trade", {
										beneficiary: seller,
										issuer,
										isBuy: false,
										sharesAmount: sell_amount,
										paidAmount: sell_price,
										protocolFeeAmount: protocol_fee,
										holdersFeeAmount: holders_fee,
										subjectFeeAmount: subject_fee,
										supply: init_amount.add(buy_amount).sub(sell_amount),
									});
								});
								if(has_holders_fee) {
									it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
										await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
											trader: seller,
											isBuy: false,
											sharesAmount: sell_amount,
										});
									});
									it('"FeeReceived" event is [not]emitted on the HoldersRewardsDistributor', async function() {
										const fn = holders_fee.isZero()? expectEvent.notEmitted.inTransaction: expectEvent.inTransaction;
										await fn(receipt.tx, holders_fee_distributor, "FeeReceived", {feeAmount: holders_fee});
									});
								}
								it("sharesSupply increases by the amount expected", async function() {
									expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount.add(buy_amount).sub(sell_amount));
								});
								it("sharesBalances increases by the amount expected", async function() {
									expect(await shares.getSharesBalance(seller)).to.be.bignumber.that.equals(buy_amount.sub(sell_amount));
								});
								it("tradeVolume increases by the shares price", async function() {
									expect(await shares.getTradeVolume()).to.be.bignumber.that.equals(first_price.add(next_price).add(sell_price));
								});
								it("seller balance increases by the SellPriceAfterFee", async function() {
									const {delta, fees} = await seller_tracker.deltaWithFees();
									expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value);
								});
								it("shares contract balance decreases by price", async function() {
									expect(await shares_tracker.delta()).to.be.bignumber.that.equals(sell_price.neg());
								});
								it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
									expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
								});
								it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
									expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
								});
								it("issuer balance increases by subjectFeeAmount", async function() {
									expect(await issuer_tracker.delta()).to.be.bignumber.that.equals(subject_fee);
								});
							});
						});
					});
				});
			});
		}
		describe("buying the shares without change (ETH supplied is exact)", function() {
			buying_the_shares(0);
		});
		describe("buying the shares with change (ETH supplied exceeds what is required)", function() {
			buying_the_shares(123456789);
		});

		describe("getProtocolFeeInfo: reading the protocol fee", function() {
			describe("when protocolFeeDestination is not zero", function() {
				beforeEach(async function() {
					await shares.updateProtocolFeeDestination(protocol_fee_destination, {from: a0});
				});
				it("getProtocolFeeInfo() returns non-zero tuple", async function() {
					expect(await shares.getProtocolFeeInfo()).to.containSubset({
						feeDestination: protocol_fee_destination,
						feePercent: protocol_fee_percent,
					});
				});
			});
			describe("when protocolFeeDestination is zero", function() {
				beforeEach(async function() {
					await shares.updateProtocolFeeDestination(ZERO_ADDRESS, {from: a0});
				});
				it("getProtocolFeeInfo() returns zero tuple", async function() {
					expect(await shares.getProtocolFeeInfo()).to.containSubset({
						feeDestination: ZERO_ADDRESS,
						feePercent: new BN(0),
					});
				});
			});
		});
		describe("getHoldersFeeInfo: reading the holders fee", function() {
			if(has_holders_fee) {
				describe("when holdersFeeDestination is not zero", function() {
					it("getHoldersFeeInfo() returns non-zero tuple", async function() {
						expect(await shares.getHoldersFeeInfo()).to.containSubset({
							feeDestination: holders_fee_destination,
							feePercent: holders_fee_percent,
						});
					});
				});
				describe("when holdersFeeDestination is zero", function() {
					beforeEach(async function() {
						await shares.disableHoldersFee({from: a0});
					});
					it("getHoldersFeeInfo() returns zero tuple", async function() {
						expect(await shares.getHoldersFeeInfo()).to.containSubset({
							feeDestination: ZERO_ADDRESS,
							feePercent: new BN(0),
						});
					});
				});
			}
			else {
				describe("when holdersFeeDestination is zero", function() {
					it("getHoldersFeeInfo() returns zero tuple", async function() {
						expect(await shares.getHoldersFeeInfo()).to.containSubset({
							feeDestination: ZERO_ADDRESS,
							feePercent: new BN(0),
						});
					});
				});
			}
		});
		describe("getSubjectFeeInfo: reading the subject fee", function() {
			describe("when shares issuer is not zero", function() {
				beforeEach(async function() {
					await shares.updateSharesSubject(subject, {from: a0});
				});
				it("getSubjectFeeInfo() returns non-zero tuple", async function() {
					expect(await shares.getSubjectFeeInfo()).to.containSubset({
						feeDestination: issuer,
						feePercent: subject_fee_percent,
					});
				});
			});
			describe("when shares issuer is zero", function() {
				beforeEach(async function() {
					await shares.updateSharesSubject({
						tokenAddress: ZERO_ADDRESS,
						tokenId: "0",
					}, {from: a0});
				});
				it("getSubjectFeeInfo() returns zero tuple", async function() {
					expect(await shares.getSubjectFeeInfo()).to.containSubset({
						feeDestination: ZERO_ADDRESS,
						feePercent: new BN(0),
					});
				});
			});
		});
	}

	function rbac_test_suite() {
		describe("role-based access control (RBAC)", function() {
			// updateSharesSubject ROLE_SHARES_SUBJECT_MANAGER
			{
				async function updateSharesSubject() {
					const subject = {
						tokenAddress: ZERO_ADDRESS,
						tokenId: "0",
					};
					const receipt = await shares.updateSharesSubject(subject, {from: operator});
					expectEvent(receipt, "SharesSubjectUpdated", {
						newSubject: Object.values(subject),
					});
				}

				describe("when executed by ROLE_SHARES_SUBJECT_MANAGER", function() {
					beforeEach(async function() {
						await shares.updateRole(operator, ROLE_SHARES_SUBJECT_MANAGER, {from: a0});
					});
					it("updateSharesSubject succeeds", async function() {
						await updateSharesSubject();
					});
				});
				describe("when executed not by ROLE_SHARES_SUBJECT_MANAGER", function() {
					beforeEach(async function() {
						await shares.updateRole(operator, not(ROLE_SHARES_SUBJECT_MANAGER), {from: a0});
					});
					it("updateSharesSubject fails", async function() {
						await expectRevert(updateSharesSubject(), "access denied");
					});
				});
			}
			// updateProtocolFeeDestination ROLE_PROTOCOL_FEE_DESTINATION_MANAGER
			{
				async function updateProtocolFeeDestination() {
					const new_destination = someone;
					const receipt = await shares.updateProtocolFeeDestination(new_destination, {from: operator});
					expectEvent(receipt, "ProtocolFeeDestinationUpdated", {
						newProtocolFeeDestination: new_destination,
					});
				}

				describe("when executed by ROLE_PROTOCOL_FEE_DESTINATION_MANAGER", function() {
					beforeEach(async function() {
						await shares.updateRole(operator, ROLE_PROTOCOL_FEE_DESTINATION_MANAGER, {from: a0});
					});
					it("updateProtocolFeeDestination succeeds", async function() {
						await updateProtocolFeeDestination();
					});
				});
				describe("when executed not by ROLE_PROTOCOL_FEE_DESTINATION_MANAGER", function() {
					beforeEach(async function() {
						await shares.updateRole(operator, not(ROLE_PROTOCOL_FEE_DESTINATION_MANAGER), {from: a0});
					});
					it("updateSharesSubject fails", async function() {
						await expectRevert(updateProtocolFeeDestination(), "access denied");
					});
				});
			}
			// disableHoldersFee ROLE_HOLDERS_FEE_DISABLE_MANAGER
			{
				async function disableHoldersFee() {
					const receipt = await shares.disableHoldersFee({from: operator});
					expectEvent(receipt, "HoldersFeeDisabled");
				}

				describe("when executed by ROLE_HOLDERS_FEE_DISABLE_MANAGER", function() {
					beforeEach(async function() {
						await shares.updateRole(operator, ROLE_HOLDERS_FEE_DISABLE_MANAGER, {from: a0});
					});
					it("disableHoldersFee succeeds", async function() {
						await disableHoldersFee();
					});
				});
				describe("when executed not by ROLE_HOLDERS_FEE_DISABLE_MANAGER", function() {
					beforeEach(async function() {
						await shares.updateRole(operator, not(ROLE_HOLDERS_FEE_DISABLE_MANAGER), {from: a0});
					});
					it("disableHoldersFee fails", async function() {
						await expectRevert(disableHoldersFee(), "access denied");
					});
				});
			}
		});
	}

	function disable_holders_fee_test_suite() {
		describe("when several first shares are bought", function() {
			const init_amount = new BN(3);
			let shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
			let price, value, effective_value, protocol_fee, holders_fee, subject_fee;
			let receipt;
			beforeEach(async function() {
				shares_tracker = await balance.tracker(shares.address);
				protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
				holders_fee_tracker = await balance.tracker(holders_fee_destination);
				issuer_tracker = await balance.tracker(issuer);
				price = await shares.getBuyPrice(init_amount);
				protocol_fee = price.mul(protocol_fee_percent).div(ETH);
				holders_fee = price.mul(holders_fee_percent).div(ETH);
				subject_fee = price.mul(subject_fee_percent).div(ETH);
				value = await shares.getBuyPriceAfterFee(init_amount);
				effective_value = price.add(protocol_fee).add(holders_fee).add(subject_fee);
				receipt = await shares.buyShares(init_amount, {from: issuer, value});
			});
			it('"Trade" event is emitted', async function() {
				expectEvent(receipt, "Trade", {
					beneficiary: issuer,
					issuer,
					isBuy: true,
					sharesAmount: init_amount,
					paidAmount: price,
					protocolFeeAmount: protocol_fee,
					holdersFeeAmount: holders_fee,
					subjectFeeAmount: subject_fee,
					supply: init_amount,
				});
			});
			it('"SharesTraded" event is emitted on the HoldersRewardsDistributor', async function() {
				await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded", {
					trader: issuer,
					isBuy: true,
					sharesAmount: init_amount,
				});
			});
			it('"FeeReceived" event is emitted on the HoldersRewardsDistributor', async function() {
				await expectEvent.inTransaction(receipt.tx, holders_fee_distributor, "FeeReceived", {feeAmount: holders_fee});
			});
			it("sharesSupply increases by the amount expected", async function() {
				expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount);
			});
			it("sharesBalances increases by the amount expected", async function() {
				expect(await shares.getSharesBalance(issuer)).to.be.bignumber.that.equals(init_amount);
			});
			it("issuer balance decreases by the BuyPriceAfterFee and increases by subjectFeeAmount", async function() {
				const {delta, fees} = await issuer_tracker.deltaWithFees();
				expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value.neg().add(subject_fee));
			});
			it("shares contract balance increases by price", async function() {
				expect(await shares_tracker.delta()).to.be.bignumber.that.equals(price);
			});
			it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
				expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
			});
			it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
				expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
			});
			describe("when the shares holders fee is disabled", function() {
				let receipt, new_protocol_fee_percent;
				beforeEach(async function() {
					receipt = await shares.disableHoldersFee({from: a0});
					new_protocol_fee_percent = protocol_fee_percent.add(holders_fee_percent);
				});
				it("impossible to disable it again", async function() {
					await expectRevert(shares.disableHoldersFee({from: a0}), "not enabled");
				});
				it('"HoldersFeeDisabled" event is emitted', async function() {
					expectEvent(receipt, "HoldersFeeDisabled", {
						oldProtocolFeePercent: protocol_fee_percent,
						newProtocolFeePercent: new_protocol_fee_percent,
					});
				});
				it("protocolFeePercent increases by the holdersFeePercent", async function() {
					expect(await shares.getProtocolFeePercent()).to.be.bignumber.that.equals(new_protocol_fee_percent);
				});
				it("holdersFeeDestination gets set to zero", async function() {
					expect(await shares.getHoldersFeeDestination()).to.be.equal(ZERO_ADDRESS);
				});
				it("holdersFeePercent gets set to zero", async function() {
					expect(await shares.getHoldersFeePercent()).to.be.bignumber.that.equals("0");
				});
				describe("buying more shares after the shares holders fee was disabled", function() {
					const buy_amount = new BN(5);
					let buyer_tracker, shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
					let price, value, effective_value, protocol_fee, holders_fee, subject_fee;
					let receipt;
					beforeEach(async function() {
						buyer_tracker = await balance.tracker(buyer);
						shares_tracker = await balance.tracker(shares.address);
						protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
						holders_fee_tracker = await balance.tracker(holders_fee_destination);
						issuer_tracker = await balance.tracker(issuer);
						price = await shares.getBuyPrice(buy_amount);
						protocol_fee = price.mul(new_protocol_fee_percent).div(ETH);
						holders_fee = new BN(0);
						subject_fee = price.mul(subject_fee_percent).div(ETH);
						value = await shares.getBuyPriceAfterFee(buy_amount);
						effective_value = price.add(protocol_fee).add(holders_fee).add(subject_fee);
						receipt = await shares.buyShares(buy_amount, {from: buyer, value});
					});
					it('"Trade" event is emitted', async function() {
						expectEvent(receipt, "Trade", {
							beneficiary: buyer,
							issuer,
							isBuy: true,
							sharesAmount: buy_amount,
							paidAmount: price,
							protocolFeeAmount: protocol_fee,
							holdersFeeAmount: holders_fee,
							subjectFeeAmount: subject_fee,
							supply: init_amount.add(buy_amount),
						});
					});
					it('"SharesTraded" event is not emitted on the HoldersRewardsDistributor', async function() {
						await expectEvent.notEmitted.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded");
					});
					it('"FeeReceived" event is not emitted on the HoldersRewardsDistributor', async function() {
						await expectEvent.notEmitted.inTransaction(receipt.tx, holders_fee_distributor, "FeeReceived");
					});
					it("sharesSupply increases by the amount expected", async function() {
						expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount.add(buy_amount));
					});
					it("sharesBalances increases by the amount expected", async function() {
						expect(await shares.getSharesBalance(buyer)).to.be.bignumber.that.equals(buy_amount);
					});
					it("buyer balance decreases by the BuyPriceAfterFee", async function() {
						const {delta, fees} = await buyer_tracker.deltaWithFees();
						expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value.neg());
					});
					it("shares contract balance increases by price", async function() {
						expect(await shares_tracker.delta()).to.be.bignumber.that.equals(price);
					});
					it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
						expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
					});
					it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
						expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
					});
					it("issuer balance increases by subjectFeeAmount", async function() {
						expect(await issuer_tracker.delta()).to.be.bignumber.that.equals(subject_fee);
					});

					describe("selling some shares back", function() {
						const seller = buyer;
						const sell_amount = new BN(1);
						let seller_tracker, shares_tracker, protocol_fee_tracker, holders_fee_tracker, issuer_tracker;
						let price, value, effective_value, protocol_fee, holders_fee, subject_fee;
						let receipt;
						beforeEach(async function() {
							seller_tracker = await balance.tracker(seller);
							shares_tracker = await balance.tracker(shares.address);
							protocol_fee_tracker = await balance.tracker(protocol_fee_destination);
							holders_fee_tracker = await balance.tracker(holders_fee_destination);
							issuer_tracker = await balance.tracker(issuer);
							price = await shares.getSellPrice(sell_amount);
							protocol_fee = price.mul(new_protocol_fee_percent).div(ETH);
							holders_fee = new BN(0);
							subject_fee = price.mul(subject_fee_percent).div(ETH);
							value = await shares.getSellPriceAfterFee(sell_amount);
							effective_value = price.sub(protocol_fee).sub(holders_fee).sub(subject_fee);
							receipt = await shares.sellShares(sell_amount, {from: seller});
						});
						it('"Trade" event is emitted', async function() {
							expectEvent(receipt, "Trade", {
								beneficiary: seller,
								issuer,
								isBuy: false,
								sharesAmount: sell_amount,
								paidAmount: price,
								protocolFeeAmount: protocol_fee,
								holdersFeeAmount: holders_fee,
								subjectFeeAmount: subject_fee,
								supply: init_amount.add(buy_amount).sub(sell_amount),
							});
						});
						it('"SharesTraded" event is not emitted on the HoldersRewardsDistributor', async function() {
							await expectEvent.notEmitted.inTransaction(receipt.tx, holders_fee_distributor, "SharesTraded");
						});
						it('"FeeReceived" event is [not]emitted on the HoldersRewardsDistributor', async function() {
							await expectEvent.notEmitted.inTransaction(receipt.tx, holders_fee_distributor, "FeeReceived");
						});
						it("sharesSupply increases by the amount expected", async function() {
							expect(await shares.getSharesSupply()).to.be.bignumber.that.equals(init_amount.add(buy_amount).sub(sell_amount));
						});
						it("sharesBalances increases by the amount expected", async function() {
							expect(await shares.getSharesBalance(seller)).to.be.bignumber.that.equals(buy_amount.sub(sell_amount));
						});
						it("seller balance increases by the SellPriceAfterFee", async function() {
							const {delta, fees} = await seller_tracker.deltaWithFees();
							expect(delta.add(fees)).to.be.bignumber.that.equals(effective_value);
						});
						it("shares contract balance decreases by price", async function() {
							expect(await shares_tracker.delta()).to.be.bignumber.that.equals(price.neg());
						});
						it("protocolFeeDestination balance increases by protocolFeeAmount", async function() {
							expect(await protocol_fee_tracker.delta()).to.be.bignumber.that.equals(protocol_fee);
						});
						it("holdersFeeDestination balance increases by holdersFeeAmount", async function() {
							expect(await holders_fee_tracker.delta()).to.be.bignumber.that.equals(holders_fee);
						});
						it("issuer balance increases by subjectFeeAmount", async function() {
							expect(await issuer_tracker.delta()).to.be.bignumber.that.equals(subject_fee);
						});
					});
				});
			});
		});
	}

	describe("when standalone shares contract is deployed with all the fees set", function() {
		beforeEach(async function() {
			({
				owner,
				subject,
				protocol_fee_destination,
				protocol_fee_percent,
				holders_fee_destination,
				holders_fee_distributor,
				holders_fee_percent,
				subject_fee_percent,
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(a0, issuer));
		});
		main_test_suite();
		rbac_test_suite();
		disable_holders_fee_test_suite();
	});

	describe("when standalone shares contract is deployed with no protocol fee", function() {
		beforeEach(async function() {
			protocol_fee_percent = new BN(0);
			({
				owner,
				subject,
				protocol_fee_destination,
				/*protocol_fee_percent,*/
				holders_fee_destination,
				holders_fee_distributor,
				holders_fee_percent,
				subject_fee_percent,
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				undefined,
				protocol_fee_percent,
			));
		});
		main_test_suite();
	});
	describe("when standalone shares contract is deployed with no shares holders fee", function() {
		beforeEach(async function() {
			holders_fee_percent = new BN(0);
			({
				owner,
				subject,
				protocol_fee_destination,
				protocol_fee_percent,
				holders_fee_destination,
				holders_fee_distributor,
				/*holders_fee_percent,*/
				subject_fee_percent,
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				undefined,
				undefined,
				undefined,
				holders_fee_percent,
			));
		});
		main_test_suite();
	});
	describe("when standalone shares contract is deployed with no shares holders distributor", function() {
		beforeEach(async function() {
			holders_fee_destination = ZERO_ADDRESS;
			({
				owner,
				subject,
				protocol_fee_destination,
				protocol_fee_percent,
				holders_fee_destination,
				holders_fee_distributor,
				holders_fee_percent,
				subject_fee_percent,
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				undefined,
				undefined,
				holders_fee_destination,
			));
		});
		main_test_suite(undefined, false);
	});
	describe("when standalone shares contract is deployed with no subject fee", function() {
		beforeEach(async function() {
			subject_fee_percent = new BN(0);
			({
				owner,
				subject,
				protocol_fee_destination,
				protocol_fee_percent,
				holders_fee_destination,
				holders_fee_distributor,
				holders_fee_percent,
				/*subject_fee_percent,*/
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				subject_fee_percent,
			));
		});
		main_test_suite();
	});

	describe("when standalone shares contract is deployed with no fees", function() {
		beforeEach(async function() {
			protocol_fee_percent = new BN(0);
			holders_fee_percent = new BN(0);
			subject_fee_percent = new BN(0);
			({
				owner,
				subject,
				protocol_fee_destination,
				/*protocol_fee_percent,*/
				holders_fee_destination,
				holders_fee_distributor,
				/*holders_fee_percent,*/
				/*subject_fee_percent,*/
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				undefined,
				protocol_fee_percent,
				undefined,
				holders_fee_percent,
				subject_fee_percent,
			));
		});
		main_test_suite();
	});

	describe("when standalone shares contract is deployed with malicious protocol fee destination", function() {
		beforeEach(async function() {
			({address: protocol_fee_destination} = await deploy_protocol_fee_distributor(
				a0,
				web3.eth.accounts.create().address,
				true,
			));
			({
				owner,
				subject,
				/*protocol_fee_destination,*/
				protocol_fee_percent,
				holders_fee_destination,
				holders_fee_distributor,
				holders_fee_percent,
				subject_fee_percent,
				amount,
				beneficiary,
				shares,
			} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				protocol_fee_destination,
			));
		});
		main_test_suite(false);
	});
	describe("when standalone shares contract is deployed with malicious holders fee destination", function() {
		beforeEach(async function() {
			holders_fee_distributor = await deploy_holders_rewards_distributor(a0, ZERO_ADDRESS, ZERO_ADDRESS, true);
			({shares} = await deploy_shares_ETH(
				a0,
				issuer,
				undefined,
				undefined,
				undefined,
				holders_fee_distributor,
			));
		});
		it("buying the share fails", async function() {
			await expectRevert(shares.buyShares(1, {from: issuer, gas: 1_000_000}), "sync failed");
		});
	});
});
