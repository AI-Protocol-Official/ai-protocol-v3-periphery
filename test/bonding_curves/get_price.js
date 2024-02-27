
// bonding curves
const {
	get_price_eth,
	get_price_erc20,
} = require("./include/curves");

const {random_int} = require("../include/number_utils");
// deployment routines in use
const {
	deploy_shares_ETH,
	deploy_shares_ERC20,
	deploy_protocol_fee_distributor,
	deploy_holders_rewards_distributor,
} = require("./include/deployment_routines");


// run getPrice tests
contract("getPrice: bonding curve", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;

	let shares_eth, shares_erc20;
	before(async function() {
		({shares: shares_eth} = await deploy_shares_ETH(a0));
		({shares: shares_erc20} = await deploy_shares_ERC20(a0));
	});

	let c1, c2;
	function compare_the_curves() {
		it("zero price (0, 0)", async function() {
			expect(await c1(0, 0), "c1").to.be.bignumber.that.equals("0");
			expect(await c2(0, 0), "c2").to.be.bignumber.that.equals("0");
		});
		it("zero price (0, 1)", async function() {
			expect(await c1(0, 1), "c1").to.be.bignumber.that.equals("0");
			expect(await c2(0, 1), "c2").to.be.bignumber.that.equals("0");
		});
		it("getPrice(1, 1)", async function() {
			const v1 = await c1(1, 1);
			const v2 = await c2(1, 1);
			expect(v1).to.be.bignumber.that.equals(v2);
		});
		for(let i = 0; i < 1_000; i++) {
			it(`getPrice(${i}, 1)`, async function() {
				const v1 = await c1(i, 1);
				const v2 = await c2(i, 1);
				expect(v1).to.be.bignumber.that.equals(v2);
			});
		}
	}

	describe("ETHShares.getPrice() vs JS Impl", function() {
		before(async function() {
			c1 = shares_eth.getPrice;
			c2 = (s, a) => get_price_eth(s, a);
		});
		compare_the_curves();
	});
	describe("ERC20Shares.getPrice() vs JS Impl", function() {
		before(async function() {
			c1 = shares_erc20.getPrice;
			c2 = (s, a) => get_price_erc20(s, a);
		});
		compare_the_curves();
	});
});
