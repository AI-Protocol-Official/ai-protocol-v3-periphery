// Zeppelin test helpers
const {
	BN,
	constants,
	expectEvent,
	expectRevert,
} = require("@openzeppelin/test-helpers");

// Constants
const {
	ZERO_ADDRESS,
	ZERO_BYTES32,
	MAX_UINT256,
} = constants;

const {
	assert,
	expect,
} = require("chai");

// BN utils
const {
	random_address,
	random_bn,
	ETH,
} = require("../include/bn_utils");

// ACL features and roles
const {
	not,
	ROLE_DATA_ROOT_MANAGER,
	FEATURE_CLAIM_ACTIVE,
} = require("../include/features_roles");

// enable chai-subset to allow containSubset instead of deep equals, see https://www.chaijs.com/plugins/chai-subset/
require("chai").use(require("chai-subset"));

// deployment routines in use
const {
	ali_erc20_deploy,
} = require("@ai-protocol/v3-core/test/ali_token/include/deployment_routines");

// deployment routines in use
const {
	deploy_eth_reward_system,
	deploy_erc20_reward_system,
} = require("./include/deployment_routines");

// Merkle tree and data generation utils
const {
	generate_merkleRoot,
	air_data_to_leaf,
} = require("./include/merkle_utils");

// run rewardSystem contract
contract("Leaderboard Reward System", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;
	let rewardSystem, ali;
	describe("ERC20/ALI reward system", function() {
		describe("deployment and initialization", function() {
			beforeEach(async function() {
				ali = await ali_erc20_deploy(a0);
			});

			describe("success, otherwise", function() {
				beforeEach(async function() {
					rewardSystem = await deploy_erc20_reward_system(a0, ali.address);
				});

				it("reward system type is set correctly", async function() {
					expect(await rewardSystem.rewardSystemType()).to.equal(false);
				});

				it("ali contract address is set correctly", async function() {
					expect(await rewardSystem.erc20RewardToken()).to.equal(ali.address);
				});
			});
		});
		describe("reward system ACL", function() {
			beforeEach(async function() {
				ali = await ali_erc20_deploy(a0);
				rewardSystem = await deploy_erc20_reward_system(a0, ali.address);
			});
			describe("when admin doesn't have ROLE_DATA_ROOT_MANAGER permission", function() {
				it("fails to update input data root", async function() {
					({root: dataRoot} = generate_merkleRoot(10));
					await expectRevert(rewardSystem.setInputDataRoot(
							dataRoot,
							{from: a1}),
						"access denied"
					);
				});
			});
			describe("when admin have ROLE_DATA_ROOT_MANAGER permission", function() {
				describe("succeed, input data root updated", function() {
					let dataRoot, receipt;
					beforeEach(async function() {
						await rewardSystem.updateRole(a1, ROLE_DATA_ROOT_MANAGER, {from: a0});
						({root: dataRoot} = generate_merkleRoot(10));
						receipt = await rewardSystem.setInputDataRoot(dataRoot, {from: a1});
					});

					it("input data root is as expected", async function() {
						expect(await rewardSystem.root()).to.equals(dataRoot);
					});
					it("'RootChanged' event is emitted", async function() {
						expectEvent(receipt, "RootChanged", {
							by: a1,
							root: dataRoot
						});
					});
				});
			});
		});
		describe("user try to claim reward", function() {
			let rewardList, leaves, tree, root;
			beforeEach(async function() {
				ali = await ali_erc20_deploy(a0);
				rewardSystem = await deploy_erc20_reward_system(a0, ali.address);
				({rewardList, leaves, tree, root} = generate_merkleRoot(5));
				await rewardSystem.setInputDataRoot(root, {from: a0});
				await rewardSystem.updateFeatures(FEATURE_CLAIM_ACTIVE, {from: a0});
			});

			it("fails to claim reward if FEATURE_CLAIM_ACTIVE is disable", async function() {
				await rewardSystem.updateFeatures(0, {from: a0});
				const proof = tree.getHexProof(leaves[0]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof,
						{from: a1}),
					"redeems are disabled"
				);
			});
			it("fails, if wrong merkle proof is supplied", async function() {
				const proof = tree.getHexProof(leaves[1]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"invalid request"
				);
			});
			it("fails, user try to claim reward allocated to other user", async function() {
				const proof = tree.getHexProof(leaves[0]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[1].totalReward,
						proof),
					"invalid request"
				);
			});
			it("fails, if reward system doesn't have enough token to give as reward", async function() {
				const proof = tree.getHexProof(leaves[0]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"transfer amount exceeds balance"
				);
			});
			it("fails, if user try to claimed more reward then allocated", async function() {
				await ali.transfer(rewardSystem.address, ETH, {from: a0});
				const proof = tree.getHexProof(leaves[0]);
				await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"nothing to claim"
				);
			});
			it('fails after "ClaimedRewards" reset', async function() {
				await ali.transfer(rewardSystem.address, ETH, {from: a0});
				const proof = tree.getHexProof(leaves[0]);
				await rewardSystem.resetClaimedRewards({from: a0});
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"invalid request"
				);
			});
			describe("success otherwise", function() {
				beforeEach(async function() {
					await ali.transfer(rewardSystem.address, ETH, {from: a0});
				});

				it("merkle root data is as expected", async function() {
					for(let i = 0; i < rewardList.length; i++) {
						const proof = tree.getHexProof(leaves[i]);
						expect(await rewardSystem.isClaimValid(rewardList[i].to, rewardList[i].totalReward, proof)).to.equals(true);
					}
				});
				it("initially user claimed amount should be zero", async function() {
					for(let i = 0; i < rewardList.length; i++) {
						expect(await rewardSystem.claimedReward(rewardList[i].to)).to.be.bignumber.that.equals(new BN(0));
					}
				});
				it("user claim reward as expected", async function() {
					const proof = tree.getHexProof(leaves[0]);
					await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof);

					expect(await ali.balanceOf(rewardList[0].to)).to.be.bignumber.that.equals(new BN(rewardList[0].totalReward));
				});
				it("claimed reward amount post reward claim as expected", async function() {
					const proof = tree.getHexProof(leaves[0]);
					await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof, {from: a0});

					expect(await rewardSystem.claimedReward(rewardList[0].to)).to.be.bignumber.that.equals(new BN(rewardList[0].totalReward));
				});
				it("claimed reward amount post reward claim set to zero if reset", async function() {
					const proof = tree.getHexProof(leaves[0]);
					await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof, {from: a0});
					await rewardSystem.resetClaimedRewards({from: a0});
					expect(await rewardSystem.claimedReward(rewardList[0].to)).to.be.bignumber.that.equals("0");
				});
				it("'ERC20RewardClaimed' event is emitted", async function() {
					const proof = tree.getHexProof(leaves[0]);
					const receipt = await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof);
					expectEvent(receipt, "ERC20RewardClaimed", {
						rewardToken: ali.address,
						user: rewardList[0].to,
						amount: rewardList[0].totalReward
					});
				});
			});
		});
		describe("resetClaimedRewards", function() {
			let receipt;
			beforeEach(async function() {
				receipt = await rewardSystem.resetClaimedRewards({from: a0});
			});
			it('emits "ClaimedRewardsReset" event', async function() {
				expectEvent(receipt, "ClaimedRewardsReset", {size: "2"})
			})
		});
	});
	describe("eth reward system", function() {
		describe("deployment and initialization", function() {
			beforeEach(async function() {
				ali = await ali_erc20_deploy(a0);
			});
			describe("success, eth reward system deployed", function() {
				beforeEach(async function() {
					rewardSystem = await deploy_eth_reward_system(a0);
				});

				it("reward system type is set correctly", async function() {
					expect(await rewardSystem.rewardSystemType()).to.equal(true);
				});

				it("ali contract address is set correctly", async function() {
					expect(await rewardSystem.erc20RewardToken()).to.equal(ZERO_ADDRESS);
				});
			});
		});
		describe("reward system ACL", function() {
			beforeEach(async function() {
				ali = await ali_erc20_deploy(a0);
				rewardSystem = await deploy_eth_reward_system(a0, ali.address);
			});
			describe("when admin doesn't have ROLE_DATA_ROOT_MANAGER permission", function() {
				it("fails to update input data root", async function() {
					({root: dataRoot} = generate_merkleRoot(10));
					await expectRevert(rewardSystem.setInputDataRoot(
							dataRoot,
							{from: a1}),
						"access denied"
					);
				});
			});
			describe("when admin have ROLE_DATA_ROOT_MANAGER permission", function() {
				describe("succeed, input data root updated", function() {
					let dataRoot, receipt;
					beforeEach(async function() {
						await rewardSystem.updateRole(a1, ROLE_DATA_ROOT_MANAGER, {from: a0});
						({root: dataRoot} = generate_merkleRoot(10));
						receipt = await rewardSystem.setInputDataRoot(dataRoot, {from: a1});
					});

					it("input data root is as expected", async function() {
						expect(await rewardSystem.root()).to.equals(dataRoot);
					});
					it("'RootChanged' event is emitted", async function() {
						expectEvent(receipt, "RootChanged", {
							by: a1,
							root: dataRoot
						});
					});
				});
			});
		});
		describe("user try to claim reward", function() {
			let rewardList, leaves, tree, root;
			beforeEach(async function() {
				rewardSystem = await deploy_eth_reward_system(a0);
				({rewardList, leaves, tree, root} = generate_merkleRoot(5));
				await rewardSystem.setInputDataRoot(root, {from: a0});
				await rewardSystem.updateFeatures(FEATURE_CLAIM_ACTIVE, {from: a0});
			});

			it("fails to claim reward if FEATURE_CLAIM_ACTIVE is disable", async function() {
				await rewardSystem.updateFeatures(0, {from: a0});
				const proof = tree.getHexProof(leaves[0]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"redeems are disabled"
				);
			});
			it("fails, if wrong merkle proof is supplied", async function() {
				const proof = tree.getHexProof(leaves[1]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"invalid request"
				);
			});
			it("fails, user try to claim reward allocated to other user", async function() {
				const proof = tree.getHexProof(leaves[0]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[1].totalReward,
						proof),
					"invalid request"
				);
			});
			it("fails, if reward system doesn't have enough ether to give as reward", async function() {
				const proof = tree.getHexProof(leaves[0]);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"failed to send ether"
				);
			});
			it("fails, if user try to claimed more reward then allocated", async function() {
				await web3.eth.sendTransaction({to: rewardSystem.address, value: ETH, from: a0});
				const proof = tree.getHexProof(leaves[0]);
				await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof);
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"nothing to claim"
				);
			});
			it('fails after "ClaimedRewards" reset', async function() {
				await web3.eth.sendTransaction({to: rewardSystem.address, value: ETH, from: a0});
				const proof = tree.getHexProof(leaves[0]);
				await rewardSystem.resetClaimedRewards({from: a0});
				await expectRevert(rewardSystem.claimReward(
						rewardList[0].to,
						rewardList[0].totalReward,
						proof),
					"invalid request"
				);
			});
			describe("success otherwise", function() {
				beforeEach(async function() {
					await web3.eth.sendTransaction({to: rewardSystem.address, value: ETH, from: a0});
				});

				it("merkle root data is as expected", async function() {
					for(let i = 0; i < rewardList.length; i++) {
						const proof = tree.getHexProof(leaves[i]);
						expect(await rewardSystem.isClaimValid(rewardList[i].to, rewardList[i].totalReward, proof)).to.equals(true);
					}
				});
				it("initially user claimed amount should be zero", async function() {
					for(let i = 0; i < rewardList.length; i++) {
						expect(await rewardSystem.claimedReward(rewardList[i].to)).to.be.bignumber.that.equals(new BN(0));
					}
				});
				it("user claim reward as expected", async function() {
					const preClaimBal = new BN(await web3.eth.getBalance(rewardList[0].to));
					const proof = tree.getHexProof(leaves[0]);
					await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof);
					const postClaimBal = new BN(await web3.eth.getBalance(rewardList[0].to));

					expect(postClaimBal.sub(preClaimBal)).to.be.bignumber.that.equals(new BN(rewardList[0].totalReward));
				});
				it("claimed reward amount post reward claim as expected", async function() {
					const proof = tree.getHexProof(leaves[0]);
					await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof, {from: a0});

					expect(await rewardSystem.claimedReward(rewardList[0].to)).to.be.bignumber.that.equals(new BN(rewardList[0].totalReward));
				});
				it("claimed reward amount post reward claim set to zero if reset", async function() {
					const proof = tree.getHexProof(leaves[0]);
					await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof, {from: a0});
					await rewardSystem.resetClaimedRewards({from: a0});
					expect(await rewardSystem.claimedReward(rewardList[0].to)).to.be.bignumber.that.equals("0");
				});
				it("'EthRewardClaimed' event is emitted", async function() {
					const proof = tree.getHexProof(leaves[0]);
					const receipt = await rewardSystem.claimReward(rewardList[0].to, rewardList[0].totalReward, proof);
					expectEvent(receipt, "EthRewardClaimed", {
						user: rewardList[0].to,
						amount: rewardList[0].totalReward
					});
				});
			});
		});
	});
});
