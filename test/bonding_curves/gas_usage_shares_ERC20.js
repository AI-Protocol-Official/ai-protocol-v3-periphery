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

// deployment routines in use
const {
	deploy_ali_erc20,
	deploy_shares_ERC20,
} = require("./include/deployment_routines");

// run gas usage tests (ETHShares)
contract("ETHShares: gas usage", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;

	// define the "players"
	const issuer = H0;
	const buyer = a3;
	const someone = a4;
	const operator = a5;

	// deploy the token and give it all to the buyer
	let payment_token;
	beforeEach(async function() {
		payment_token = await deploy_ali_erc20(a0, H0);
	});

	// shared receipt variable used across all the tests
	let receipt;

	function consumes_no_more_than(gas) {
		// tests marked with @skip-on-coverage are removed from solidity-coverage,
		// see yield-solcover.js, see https://github.com/sc-forks/solidity-coverage/blob/master/docs/advanced.md
		it(`consumes no more than ${gas} gas  [ @skip-on-coverage ]`, async function() {
			expect_gas(receipt, gas);
		});
	}

	describe("when standalone shares contract is deployed with all the fees set", function() {
		let shares, protocol_fee_percent, holders_fee_percent, subject_fee_percent;
		beforeEach(async function() {
			({
				shares,
				protocol_fee_percent,
				holders_fee_percent,
				subject_fee_percent,
			} = await deploy_shares_ERC20(a0, payment_token, issuer));
		});
		describe("buying the very first share", function() {
			const init_amount = new BN(1);
			beforeEach(async function() {
				receipt = await shares.buyShares(init_amount, {from: issuer});
			});
			consumes_no_more_than(170894);

			describe("buying next shares", function() {
				const buy_amount = new BN(7);
				beforeEach(async function() {
					const price = get_buy_price_after_fee(
						init_amount,
						buy_amount,
						protocol_fee_percent,
						holders_fee_percent,
						subject_fee_percent,
					);

					await payment_token.transfer(buyer, price, {from: H0});
					await payment_token.approve(shares.address, price, {from: buyer});

					receipt = await shares.buyShares(buy_amount, {from: buyer});
				});
				consumes_no_more_than(325388);

				describe("selling some shares back", function() {
					const sell_amount = buy_amount.subn(3);
					beforeEach(async function() {
						receipt = await shares.sellShares(sell_amount, {from: buyer});
					});
					consumes_no_more_than(214198);
				});
			});
		});
		describe("buying several first shares", function() {
			const init_amount = new BN(5);
			beforeEach(async function() {
				const price = get_buy_price_after_fee(
					0,
					init_amount,
					protocol_fee_percent,
					holders_fee_percent,
					subject_fee_percent,
				);

				await payment_token.approve(shares.address, price, {from: issuer});

				receipt = await shares.buyShares(init_amount, {from: issuer});
			});
			consumes_no_more_than(384849);

			describe("buying next shares", function() {
				const buy_amount = new BN(7);
				beforeEach(async function() {
					const price = get_buy_price_after_fee(
						init_amount,
						buy_amount,
						protocol_fee_percent,
						holders_fee_percent,
						subject_fee_percent,
					);

					await payment_token.transfer(buyer, price, {from: H0});
					await payment_token.approve(shares.address, price, {from: buyer});

					receipt = await shares.buyShares(buy_amount, {from: buyer});
				});
				consumes_no_more_than(249241);

				describe("selling some shares back", function() {
					const sell_amount = buy_amount.subn(3);
					beforeEach(async function() {
						receipt = await shares.sellShares(sell_amount, {from: issuer});
					});
					consumes_no_more_than(173198);
				});
			});
		});
	});
	describe("when standalone shares contract is deployed with no shares holders distributor", function() {
		const holders_fee_percent = new BN(0);
		let shares, protocol_fee_percent, subject_fee_percent;
		beforeEach(async function() {
			({
				shares,
				protocol_fee_percent,
				subject_fee_percent,
			} = await deploy_shares_ERC20(
				a0,
				payment_token,
				issuer,
				undefined,
				undefined,
				undefined,
				ZERO_ADDRESS,
			));
		});
		describe("buying the very first share", function() {
			const init_amount = new BN(1);
			beforeEach(async function() {
				receipt = await shares.buyShares(init_amount, {from: issuer});
			});
			consumes_no_more_than(96278);

			describe("buying next shares", function() {
				const buy_amount = new BN(7);
				beforeEach(async function() {
					const price = get_buy_price_after_fee(
						init_amount,
						buy_amount,
						protocol_fee_percent,
						holders_fee_percent,
						subject_fee_percent,
					);

					await payment_token.transfer(buyer, price, {from: H0});
					await payment_token.approve(shares.address, price, {from: buyer});

					receipt = await shares.buyShares(buy_amount, {from: buyer});
				});
				consumes_no_more_than(197692);

				describe("selling some shares back", function() {
					const sell_amount = buy_amount.subn(3);
					beforeEach(async function() {
						receipt = await shares.sellShares(sell_amount, {from: buyer});
					});
					consumes_no_more_than(136947);
				});
			});
		});
		describe("buying several first shares", function() {
			const init_amount = new BN(5);
			beforeEach(async function() {
				const price = get_buy_price_after_fee(
					0,
					init_amount,
					protocol_fee_percent,
					holders_fee_percent,
					subject_fee_percent,
				);

				await payment_token.approve(shares.address, price, {from: issuer});

				receipt = await shares.buyShares(init_amount, {from: issuer});
			});
			consumes_no_more_than(220667);

			describe("buying next shares", function() {
				const buy_amount = new BN(7);
				beforeEach(async function() {
					const price = get_buy_price_after_fee(
						init_amount,
						buy_amount,
						protocol_fee_percent,
						holders_fee_percent,
						subject_fee_percent,
					);

					await payment_token.transfer(buyer, price, {from: H0});
					await payment_token.approve(shares.address, price, {from: buyer});

					receipt = await shares.buyShares(buy_amount, {from: buyer});
				});
				consumes_no_more_than(155771);

				describe("selling some shares back", function() {
					const sell_amount = buy_amount.subn(3);
					beforeEach(async function() {
						receipt = await shares.sellShares(sell_amount, {from: issuer});
					});
					consumes_no_more_than(113047);
				});
			});
		});
	});
});
