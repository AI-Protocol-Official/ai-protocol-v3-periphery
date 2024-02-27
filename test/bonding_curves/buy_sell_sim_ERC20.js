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

// number utils
const {
	random_element,
	random_int,
} = require("@ai-protocol/v3-core/test/include/number_utils");

// BN utils
const {
	print_amt,
	print_symbols,
} = require("@ai-protocol/v3-core/test/include/bn_utils");

// bonding curves
const {
	ERC20_PRICE_MULTIPLIER,
} = require("./include/curves");

// deployment routines in use
const {
	SharesImplementationType: ImplType,
	deploy_royal_nft,
	deploy_factory_and_configure,
	factory_deploy_shares,
} = require("./include/deployment_routines");

// run buy/sell simulation
contract("buy/sell simulation", function(accounts) {
	// extract accounts to be used:
	// A0 - special default zero account accounts[0] used by Truffle, reserved
	// a0 - deployment account having all the permissions, reserved
	// H0 - initial token holder account
	// a1, a2,... - working accounts to perform tests on
	const [A0, a0, H0, a1, a2] = accounts;

	// number of simulation steps
	const SIM_STEPS = 1000;

	// all the participants of the simulation (address is wrapped into the object)
	const participants = accounts.slice(3).map(function(address) {return {address}});

	// influencers are the accounts which deploy curves
	const influencers = participants.slice(0, 20);

	// number of pure influencers, who are not traders
	const pure_influencers = 10;

	// traders are the accounts which buy and sell
	const traders = participants.slice(pure_influencers);

	before(async function() {
		process.stdout.write("initializing...");
	});

	// factory deployment and setup
	let protocol_fee_destination, protocol_fee_percent, holders_fee_percent, subject_fee_percent, payment_token, factory;
	before(async function() {
		({
			protocol_fee_destination,
			protocol_fee_percent,
			holders_fee_percent,
			subject_fee_percent,
			payment_token,
			factory,
		} = await deploy_factory_and_configure(a0));
		process.stdout.write(".");
	});
	// supply all the participants with the payment tokens
	before(async function() {
		const balance = new BN(await web3.eth.getBalance(participants[0].address)).mul(ERC20_PRICE_MULTIPLIER);
		for(let i = 0; i < participants.length; i++) {
			await payment_token.mint(participants[i].address, balance, {from: a0});
			process.stdout.write(".");
		}
	});
	// supply influencers with NFTs
	let nft;
	before(async function() {
		nft = await deploy_royal_nft(a0);
		for(let i = 0; i < influencers.length; i++) {
			await nft.mint(influencers[i].address, i, {from: a0});
			process.stdout.write(".");
		}
	});

	// grant infinite access to the influencers' payment tokens to the shares contracts
	before(async function() {
		for(let i = 0; i < influencers.length; i++) {
			await payment_token.approve(factory.address, MAX_UINT256, {from: influencers[i].address});
			process.stdout.write(".");
		}
	});

	// TODO: this should be part of the simulation main loop
	// influencers deploy the curves and buy `s0` initial shares immediately
	const s0 = 10;
	const deployed_curves = new Array(influencers.length);
	const deployed_distributors = new Array(influencers.length);
	before(async function() {
		for(let i = 0; i < influencers.length; i++) {
			const subject = {
				tokenAddress: nft.address,
				tokenId: "" + i,
			};
			const {
				shares,
				distributor,
			} = await factory_deploy_shares(influencers[i].address, factory, subject, undefined, ImplType.ERC20, s0);
			influencers[i].deployed_curve = shares;
			influencers[i].deployed_distributor = distributor;
			deployed_curves[i] = shares;
			deployed_distributors[i] = distributor;
			process.stdout.write(".");
		}
	});

	// grant infinite access to the traders' payment tokens to the shares contracts
	before(async function() {
		for(let i = 0; i < traders.length; i++) {
			const trader = traders[i];
			for(let j = 0; j < deployed_curves.length; j++) {
				const shares = deployed_curves[j];
				await payment_token.approve(shares.address, MAX_UINT256, {from: trader.address});
				process.stdout.write(".");
			}
		}
	});

	before(async function() {
		process.stdout.write("\ninitialization complete\n");
	});

	// simulation main loop start
	it(`simulation main loop (steps = ${SIM_STEPS}) [ @skip-on-coverage ]`, async function() {
		async function sell_all_shares(log = true) {
			const n = participants.length * deployed_curves.length;
			for(let i = 0; i < participants.length; i++) {
				const participant = participants[i];
				for(let j = 0; j < deployed_curves.length; j++) {
					const shares = deployed_curves[j];
					const balance = BN.min(
						await shares.getSharesBalance(participant.address),
						(await shares.getSharesSupply()).subn(1)
					);
					if(!balance.isZero()) {
						const receipt = await shares.sellShares(balance, {from: participant.address});
						if(log) {
							console.log(
								"%o out of %o: %o.sellShares(%o, %o): %o",
								i * deployed_curves.length + j,
								n,
								shares.address,
								balance.toString(),
								participant.address,
								receipt.tx
							);
						}
					}
				}
			}
		}

		async function claim_all_rewards(log = true) {
			const n = participants.length * deployed_distributors.length;
			for(let i = 0; i < participants.length; i++) {
				const participant = participants[i];
				for(let j = 0; j < deployed_distributors.length; j++) {
					const distributor = deployed_distributors[j];
					if(!(await distributor.pendingReward(participant.address)).isZero()) {
						const receipt = await distributor.claimTheReward({from: participant.address});
						if(log) {
							console.log(
								"%o out of %o: %o.claimTheReward(%o): %o",
								i * deployed_distributors.length + j,
								n,
								distributor.address,
								participant.address,
								receipt.tx
							);
						}
					}
				}
			}
		}

		/**
		 * A trader is an AI agent implementation, executing the trades
		 *
		 * @param trader trader's account address wrapped into an object {address}, required
		 *        the object is used as a context container
		 * @param step_num current simulation step, optional, [0, steps_num)
		 *        if defined, gives the trader an idea how far from the beginning the simulation is
		 * @param steps_num total number of steps the simulation has, optional
		 *        if both `step_num` and `steps_num` are defined, gives the trader an idea how many steps have left
		 */
		async function trader_step(trader, step_num, steps_num) {
			// who am I?
			trader.who_am_i ||= random_element(["dummy", "HODLer", "investor"]);

			switch(trader.who_am_i) {
				case "HODLer": await hodler_step(trader, step_num, steps_num); break;
				case "investor": await investor_step(trader, step_num, steps_num); break;
				default: await dummy_step(trader, step_num, steps_num); break;
			}
		}

		/**
		 * A generic (dummy) trader is a primitive AI agent implementation, executing chaotic trades
		 * 
		 * @param trader trader's account address wrapped into an object {address}, required
		 *        the object is used as a context container
		 */
		async function dummy_step(trader) {
			// agent wants to act?
			if(Math.random() < 0.5) {
				// agent wants to sell?
				if(trader.portfolio && trader.portfolio.total_balance && Math.random() < 0.5) {
					const shares = random_element(deployed_curves.filter(function(shares) {
						return trader.portfolio[shares.address] && trader.portfolio[shares.address].my_balance;
					}));
					const amount = random_int(1, trader.portfolio[shares.address].my_balance - 1);
					await shares.sellShares(amount, {from: trader.address});
					trader.portfolio.total_balance -= amount;
					trader.portfolio[shares.address].my_balance -= amount;
				}
				// agent wants to buy
				else {
					const shares = random_element(deployed_curves);
					const amount = random_int(1, 10);
					// const price = await shares.getBuyPriceAfterFee(amount);
					await shares.buyShares(amount, {from: trader.address});

					if(!trader.portfolio) {
						trader.portfolio = {
							total_balance: 0,
						};
					}
					if(!trader.portfolio[shares.address]) {
						trader.portfolio[shares.address] = {
							my_balance: 0,
						};
					}

					trader.portfolio[shares.address].my_balance += amount;
					trader.portfolio.total_balance += amount;
				}
			}
		}

		/**
		 * HODLer tries to buy early; HODLer doesn't sell
		 *
		 * @param trader trader's account address wrapped into an object {address}, required
		 *        the object is used as a context container
		 * @param step_num current simulation step, optional, [0, steps_num)
		 *        if defined, gives the trader an idea how far from the beginning the simulation is
		 * @param steps_num total number of steps the simulation has, optional
		 *        if both `step_num` and `steps_num` are defined, gives the trader an idea how many steps have left
		 */
		async function hodler_step(trader, step_num, steps_num) {
			// agent wants to act?
			if(step_num < steps_num / 10) {
				// agent wants to buy
				{
					const shares = random_element(deployed_curves);
					const amount = random_int(1, 10);
					//const price = await shares.getBuyPriceAfterFee(amount);
					await shares.buyShares(amount, {from: trader.address});

					if(!trader.portfolio) {
						trader.portfolio = {
							total_balance: 0,
						};
					}
					if(!trader.portfolio[shares.address]) {
						trader.portfolio[shares.address] = {
							my_balance: 0,
						};
					}

					trader.portfolio[shares.address].my_balance += amount;
					trader.portfolio.total_balance += amount;
				}
			}
		}

		/**
		 * Investor tries to buy early and sell late
		 *
		 * @param trader trader's account address wrapped into an object {address}, required
		 *        the object is used as a context container
		 * @param step_num current simulation step, optional, [0, steps_num)
		 *        if defined, gives the trader an idea how far from the beginning the simulation is
		 * @param steps_num total number of steps the simulation has, optional
		 *        if both `step_num` and `steps_num` are defined, gives the trader an idea how many steps have left
		 */
		async function investor_step(trader, step_num, steps_num) {
			// agent wants to act?
			if(step_num < steps_num / 10) {
				// agent wants to buy
				{
					const shares = random_element(deployed_curves);
					const amount = random_int(1, 10);
					// const price = await shares.getBuyPriceAfterFee(amount);
					await shares.buyShares(amount, {from: trader.address});

					if(!trader.portfolio) {
						trader.portfolio = {
							total_balance: 0,
						};
					}
					if(!trader.portfolio[shares.address]) {
						trader.portfolio[shares.address] = {
							my_balance: 0,
						};
					}

					trader.portfolio[shares.address].my_balance += amount;
					trader.portfolio.total_balance += amount;
				}
			}
			// agent wants to act?
			else if(step_num > steps_num / 2 && trader.portfolio && trader.portfolio.total_balance) {
				// agent wants to sell
				{
					const shares = random_element(deployed_curves.filter(function(shares) {
						return trader.portfolio[shares.address] && trader.portfolio[shares.address].my_balance;
					}));
					const amount = random_int(1, trader.portfolio[shares.address].my_balance - 1);
					await shares.sellShares(amount, {from: trader.address});
					trader.portfolio.total_balance -= amount;
					trader.portfolio[shares.address].my_balance -= amount;
				}
			}
		}

		// similar to `print_symbols` but works for a 2-dimensional array
		async function print_portfolios(traders) {
			const matrix = traders.map(function(trader) {
				return deployed_curves.map(function(shares) {
					return trader.portfolio && trader.portfolio.total_balance && trader.portfolio[shares.address]? trader.portfolio[shares.address].my_balance: 0;
				});
			});
			const matrix_max = matrix.flat().reduce((a, v) => a.gte(new BN(v))? a: new BN(v), new BN(0));

			const portfolios = new Array(traders.length);
			for(let i = 0; i < traders.length; i++) {
				const trader = traders[i];
				const arr = matrix[i];

				const who_am_i = (trader.who_am_i || "") + (i < influencers.length - pure_influencers? "+": "");
				const total_balance = trader.portfolio && trader.portfolio.total_balance ? trader.portfolio.total_balance: 0;

				portfolios[i] = (pure_influencers + 1 + i) + ") " + " ".repeat(2 - (Math.log10(pure_influencers + 1 + i) | 0));
				portfolios[i] += print_symbols(arr, matrix_max) + " | ";
				portfolios[i] += who_am_i + " ".repeat(10 - who_am_i.length);
				portfolios[i] += total_balance + " ".repeat(4 - (Math.log10(total_balance) | 0));
				portfolios[i] += print_amt(await payment_token.balanceOf(trader.address));
			}

			return portfolios.join("\n");
		}

		for(let i = 0; i < SIM_STEPS; i++) {
			// give every trader an opportunity to act
			for(const trader of traders) {
				await trader_step(trader, i, SIM_STEPS);
			}

/*
			if(Math.random() < 10 / SIM_STEPS) {
				console.log("recession: participants withdraw the rewards");
				await claim_all_rewards(false);
			}
*/

			console.log(await print_portfolios(traders));
			console.log("loop step %o complete", i + 1);
		}

		console.log("simulation main loop complete. performing the cleanup");
		await sell_all_shares();
		await claim_all_rewards();

		console.log("protocol fees collected: %o", print_amt(await payment_token.balanceOf(protocol_fee_destination)));

		const holders_fees_collected = new BN(0);
		for(const distributor of deployed_distributors) {
			holders_fees_collected.iadd(new BN(await payment_token.balanceOf(distributor.address)));
		}
		console.log("shares holders fees collected: %o", print_amt(holders_fees_collected));

		console.log("final participant balances:");
		for(let i = 0; i < participants.length; i++) {
			const participant = participants[i];
			console.log("%d):\t%o", i + 1, print_amt(await payment_token.balanceOf(participant.address)));
		}
		console.log("final bonding curve balances:");
		for(let i = 0; i < deployed_curves.length; i++) {
			const shares = deployed_curves[i];
			console.log("%d):\t%o", i + 1, print_amt(await payment_token.balanceOf(shares.address)));
		}
		console.log("final holders rewards distributors balances:");
		for(let i = 0; i < deployed_distributors.length; i++) {
			const distributor = deployed_distributors[i];
			console.log("%d):\t%o", i + 1, print_amt(await payment_token.balanceOf(distributor.address)));
		}

		// do zero balance assertions
		const one_gwei = new BN (1_000_000_000);
		for(let i = 0; i < deployed_curves.length; i++) {
			const shares = deployed_curves[i];
			expect(await payment_token.balanceOf(shares.address), `shares ${i + 1} balance`).to.be.bignumber.below(one_gwei);
		}
		for(let i = 0; i < deployed_distributors.length; i++) {
			const distributor = deployed_distributors[i];
			expect(await payment_token.balanceOf(distributor.address), `distributor ${i + 1} balance`).to.be.bignumber.below(one_gwei);
		}
	});
});
