// Ethers.js signature utils  for EIP712 signing
const ethSigUtil = require("eth-sig-util");

// enable chai-subset to allow containSubset instead of deep equals, see https://www.chaijs.com/plugins/chai-subset/
require("chai").use(require("chai-subset"));

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

// block utils
const {
	default_deadline,
} = require("../include/block_utils");

// EIP712 utils
const {
	EIP712Domain,
	domainSeparator,
} = require("./include/eip712");

// RBAC
const {
	FEATURE_ALL,
	FEATURE_STAKING,
	FEATURE_UNSTAKING,
	FEATURE_ALLOW_HIVE_CREATION,
	FEATURE_ALLOW_ASSET_LINKING,
	FEATURE_ALLOW_ASSET_UNLINKING,
	ROLE_DPT_REGISTRAR,
	ROLE_POD_WHITELIST_MANAGER,
	ROLE_CATEGORY_MANAGER,
	ROLE_HIVE_TOKEN_MANAGER,
	not
} = require("../include/features_roles");

// deployment routines in use
const {
	deploy_ali_erc20,
	deploy_hive_registry_pure,
	deploy_royal_nft,
} = require("./include/deployment_routines");

const {
	linker_v3_deploy,
	nft_staking_deploy_pure,
} = require("@ai-protocol/v2/test/protocol/include/deployment_routines");

const {
	royal_nft_deploy
} = require("@ai-protocol/v2/test/erc721/include/deployment_routines");
const {TypedDataUtils} = require("eth-sig-util");

// run Hive Registry smart contract
contract("HiveRegistry Testcase", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;
	let dpt, dptId = 1;
	const deployer = a0;
	const relayer = a2;
	const pod_owner = a1;
	const nft_owner = a2;
	let receipt;
	let persona, ali, iNft, linker, staking, targetNft;
	let persona_addr, iNft_addr, staking_addr;

	async function get_eip712_request_and_signature(
		signer,
		hiveRegistry,
		subject,
		dptHolder,
		sig_valid_from,
		sig_expires_at,
		sig_nonce,
	) {
		// construct and sign EIP712 message (RegistryDPTRequest)
		const domain = {
			name: "HiveRegistry",
			version: "1",
			chainId: await web3.eth.getChainId(),
			verifyingContract: hiveRegistry.address,
		};
		const types = {
			EIP712Domain,
			RegisterAsDPTRequest: [
				{name: "asset", type: "SharesSubject"},
				{name: "dptOwner", type: "address"},
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
			asset: subject,
			dptOwner: dptHolder,
			validFromTimestamp: parseInt(sig_valid_from || await default_deadline(0)),
			expiresAtTimestamp: parseInt(sig_expires_at || await default_deadline(60)),
			nonce: parseInt(sig_nonce || await hiveRegistry.getNonce(dptHolder)),
		};

		const signature = ethSigUtil.signTypedMessage(Buffer.from(web3.utils.hexToBytes(signer.privateKey || signer)), {
			data: {
				domain,
				types,
				primaryType: "RegisterAsDPTRequest",
				message: request,
			},
		});

		// return the results
		return {subject, request, signature};
	}

	async function fuseINft(podId, nftId) {
		await persona.mint(pod_owner, podId, {from: deployer});
		await targetNft.mint(nft_owner, nftId, {from: deployer});
		await persona.approve(linker.address, podId, {from: pod_owner});

		await linker.link(podId, targetNft.address, nftId, {from: pod_owner});
	}

	async function defuseINft(nftId) {
		await linker.unlinkNFT(targetNft.address, nftId, {from: nft_owner});
	}

	async function stakePod(podId) {
		await persona.mint(pod_owner, podId, {from: deployer});
		await persona.approve(staking_addr, podId, {from: pod_owner});

		await staking.stake(podId, {from: pod_owner});
	}

	async function unstakePod(podId) {
		await staking.unstake(podId, {from: pod_owner});
	}

	async function createHive(hiveRegistry, podId) {
		await persona.mint(pod_owner, podId, {from: deployer});
		await hiveRegistry.whitelistPods([podId], {from: deployer});
		await hiveRegistry.updateFeatures(FEATURE_ALLOW_HIVE_CREATION, {from: deployer});
		await hiveRegistry.createHive(podId, "", {from: pod_owner});
	}

	beforeEach(async function() {
		dpt = await royal_nft_deploy(deployer);
		targetNft = await royal_nft_deploy(deployer);

		({ali, persona, iNft, linker} = await linker_v3_deploy(deployer));
		await linker.updateFeatures(FEATURE_ALL, {from: deployer});

		staking = await nft_staking_deploy_pure(deployer, persona.address);
		await staking.updateFeatures(FEATURE_STAKING | FEATURE_UNSTAKING, {from: deployer});

		persona_addr = persona.address;
		iNft_addr = iNft.address;
		staking_addr = staking.address;
	});

	describe("deployment and initialization", function() {
		let hiveRegistry;
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
		});
		it("hive registry deployed successfully", async function() {
			expect(await hiveRegistry.address).to.not.equal(ZERO_ADDRESS);
		});
		it("postConstruct() initializer is no longer executable", async function() {
			await expectRevert(hiveRegistry.postConstruct(persona_addr, iNft_addr, staking_addr, {from: deployer}), "Initializable: contract is already initialized");
		});
		it("personality contract address set correctly", async function() {
			expect(await hiveRegistry.personalityContract()).to.be.equal(persona_addr);
		});
		it("iNft contract address set correctly", async function() {
			expect(await hiveRegistry.iNftContract()).to.be.equal(iNft_addr);
		});
		it("personality staking contract address set correctly", async function() {
			expect(await hiveRegistry.podStakingContract()).to.be.equal(staking_addr);
		});
		it("initial number of hives is set correctly", async function() {
			expect(await hiveRegistry.getNumOfHives()).to.be.bignumber.that.equals(new BN(0));
		});
		it("initial number of global category is set correctly", async function() {
			expect(await hiveRegistry.getNumOfGlobalCategories()).to.be.bignumber.that.equals(new BN(1));
		});
		it("expection thrown if try to get details of 0th index hiveID", async function() {
			await expectRevert(hiveRegistry.getHiveCreatorPod(0), "invalid hiveId");
		});
		it("zeroth index of global category is set correctly", async function() {
			const categoryDetails = await hiveRegistry.globalCategories(0);
			expect(categoryDetails.category).to.be.equal("");
		});
		it("Intelligence_POD global category is set correctly", async function() {
			const categoryDetails = await hiveRegistry.globalCategories(1);
			expect(categoryDetails.category).to.be.equal("Intelligence_POD");
		});
		it("allowed collection of Intelligence_POD global category is set correctly", async function() {
			const categoryDetails = await hiveRegistry.globalCategories(1);
			expect(categoryDetails.allowedCollection).to.be.equal(persona_addr);
		});
		it("category index for Intelligence_POD global category is set correctly", async function() {
			const categoryDetails = await hiveRegistry.globalCategories(1);
			expect(await hiveRegistry.getCategoryIndex(categoryDetails.category)).to.be.bignumber.that.equals(new BN(1));
		});
	});

	describe("Register DPT", function() {
		const signer = web3.eth.accounts.create();
		let subject, hiveRegistry;
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
			await dpt.mint(a1, dptId, {from: deployer});
			subject = {tokenAddress: dpt.address, tokenId: dptId};
		})

		describe("authorizer try to register DPT", function() {
			let authorizer = a2;
			it("fails, if signed not by a ROLE_DPT_REGISTRAR role", async function() {
				await expectRevert(hiveRegistry.registerAsDPT(subject, {from: authorizer}), "not authorized");
			});

			describe("succeed, otherwise", function() {
				beforeEach(async function() {
					await hiveRegistry.updateRole(authorizer, ROLE_DPT_REGISTRAR, {from: deployer});
					receipt = await hiveRegistry.registerAsDPT(subject, {from: authorizer});
				})

				it("Verified, DPT Registered", async function() {
					expect(await hiveRegistry.isDPTRegistered(subject)).to.be.equal(true);
				});

				it("'DPTRegistered' event is emitted", async function() {
					expectEvent(receipt, "DPTRegistered", {
						by: authorizer,
						dptAddress: dpt.address,
						dptId: new BN(dptId)
					});
				});

				it("fails, if user tries to register DTP which is already registered", async function() {
					await expectRevert(hiveRegistry.registerAsDPT(subject, {from: authorizer}), "DPT is already registered!");
				});
			});
		});

		describe("authorizer try to register DPT using Meta-tx", function() {
			const signer = web3.eth.accounts.create();
			it("fails, if signed not by a ROLE_DPT_REGISTRAR role", async function() {
				const {request, signature} = await get_eip712_request_and_signature(signer, hiveRegistry, subject, a1);
				await expectRevert(hiveRegistry.eip712RegisterAsDPT(request, signature, {from: relayer}), "not authorized");
			});

			it("fails, if nonce is invalid", async function() {
				const {
					request,
					signature
				} = await get_eip712_request_and_signature(signer, hiveRegistry, subject, a1, null, null, 1);
				await expectRevert(hiveRegistry.eip712RegisterAsDPT(request, signature, {from: relayer}), "invalid nonce");
			});

			it("fails, if the signature is not yet valid", async function() {
				const {
					request,
					signature
				} = await get_eip712_request_and_signature(signer, hiveRegistry, subject, a1, 4294967296);
				await expectRevert(hiveRegistry.eip712RegisterAsDPT(request, signature, {from: relayer}), "not yet valid");
			});

			it("fails if the signature already expired", async function() {
				const {
					request,
					signature
				} = await get_eip712_request_and_signature(signer, hiveRegistry, subject, a1, null, 1);
				await expectRevert(hiveRegistry.eip712RegisterAsDPT(request, signature, {from: relayer}), "expired");
			});

			describe("succeed, otherwise", function() {
				beforeEach(async function() {
					const {request, signature} = await get_eip712_request_and_signature(signer, hiveRegistry, subject, a1);
					await hiveRegistry.updateRole(signer.address, ROLE_DPT_REGISTRAR, {from: deployer});
					receipt = await hiveRegistry.eip712RegisterAsDPT(request, signature, {from: relayer});
				});

				it("Verified, DPT Registered", async function() {
					expect(await hiveRegistry.isDPTRegistered(subject)).to.be.equal(true);
				});
				it("nonce increases by one", async function() {
					expect(await hiveRegistry.getNonce(a1)).to.be.bignumber.that.equals("1");
				});
				it('"NonceUsed" event emitted', async function() {
					expectEvent(receipt, "NonceUsed", {issuer: a1, nonce: "0"});
				});
				it("'DPTRegistered' event is emitted", async function() {
					expectEvent(receipt, "DPTRegistered", {
						by: signer.address,
						dptAddress: dpt.address,
						dptId: new BN(dptId)
					});
				});
				it("impossible to registered DPT, which is already registered", async function() {
					const {request, signature} = await get_eip712_request_and_signature(signer, hiveRegistry, subject, a1);
					await expectRevert(hiveRegistry.eip712RegisterAsDPT(request, signature, {from: relayer}), "DPT is already registered!");
				});
			});
		});
	});

	describe("nonce (fastForwardTheNonce)", function() {
		let hiveRegistry;
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
			await dpt.mint(a1, dptId, {from: deployer});
		});

		function succeedsToFastForwardNonce(value) {
			value = new BN(value);
			beforeEach(async function() {
				receipt = await hiveRegistry.fastForwardTheNonce(a1, value, {from: deployer});
			});
			it('"NonceUsed" event is emitted', async function() {
				expectEvent(receipt, "NonceUsed", {issuer: a1, nonce: value.subn(1)});
			});
			it("value gets set correctly", async function() {
				expect(await hiveRegistry.getNonce(a1)).to.be.bignumber.that.equals(value);
			});
		}

		async function failsToRewindNonce(value, error) {
			await expectRevert(hiveRegistry.fastForwardTheNonce(a1, value, {from: deployer}), error);
		}

		it("fails to set non-zero value (rewind)", async function() {
			await failsToRewindNonce(0, "new nonce must be bigger than the current one");
		});
		describe("successfully sets non-zero value (fast forward)", function() {
			succeedsToFastForwardNonce(1);
		});
	});

	describe("create hive", function() {
		const podId = 1000, podId_1 = 1001, nftId = 1001;

		describe("hive creation ACL", function() {
			let hiveRegistry;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
			});

			describe("when admin doesn't have ROLE_POD_WHITELIST_MANAGER permission", function() {
				it("fails to whitelist pods", async function() {
					await expectRevert(hiveRegistry.whitelistPods(
							[podId, podId_1],
							{from: a1}),
						"access denied"
					);
				});
				it("fails to delist pods", async function() {
					await expectRevert(hiveRegistry.delistPods(
							[podId, podId_1],
							{from: a1}),
						"access denied"
					);
				});
			});
			describe("when admin have ROLE_POD_WHITELIST_MANAGER permission", function() {
				beforeEach(async function() {
					await hiveRegistry.updateRole(a1, ROLE_POD_WHITELIST_MANAGER, {from: deployer});
				});
				describe("succeed, admin can whitelist pods", function() {
					beforeEach(async function() {
						receipt = await hiveRegistry.whitelistPods([podId, podId_1], {from: a1});
					});

					it("pod is whitelisted", async function() {
						expect(await hiveRegistry.isPodWhitelisted(podId)).to.be.equals(true);
					});
					it("'PodWhitelisted' event is emitted", async function() {
						expectEvent(receipt, "PodWhitelisted", {
							by: a1,
							podId: new BN(podId)
						});
					});
				})
				describe("succeed, admin can remove pods from whitelisted list", function() {
					beforeEach(async function() {
						await hiveRegistry.whitelistPods([podId, podId_1], {from: a1});
						receipt = await hiveRegistry.delistPods([podId_1], {from: a1});
					});

					it("pod is delisted", async function() {
						expect(await hiveRegistry.isPodWhitelisted(podId_1)).to.be.equals(false);
					});
					it("verified whitelisting status of other whitelisted pod", async function() {
						expect(await hiveRegistry.isPodWhitelisted(podId)).to.be.equals(true);
					});
					it("'PodDelisted' event is emitted", async function() {
						expectEvent(receipt, "PodDelisted", {
							by: a1,
							podId: new BN(podId_1)
						});
					});
				});
			});
			describe("when admin doesn't have ROLE_CATEGORY_MANAGER permission", function() {
				it("fails to add new global category", async function() {
					await expectRevert(hiveRegistry.addCategory(
							"TEST_Category",
							ZERO_ADDRESS,
							{from: a1}),
						"access denied"
					);
				});
			});
			describe("when admin have ROLE_CATEGORY_MANAGER permission", function() {
				let newCategory = "Test_Category"
				let categoryDetails;
				beforeEach(async function() {
					await hiveRegistry.updateRole(a1, ROLE_CATEGORY_MANAGER, {from: deployer});
				});

				it("fails, if try to add existing global category", async function() {
					await expectRevert(hiveRegistry.addCategory(
							"Intelligence_POD",
							ZERO_ADDRESS,
							{from: a1}),
						"category exists!"
					);
				});

				describe("succeed, admin can add new global category with restricted nft collection", function() {
					beforeEach(async function() {
						receipt = await hiveRegistry.addCategory(newCategory, targetNft.address, {from: a1});
						categoryDetails = await hiveRegistry.globalCategories(2);
					});

					it("global category count increased by 1", async function() {
						expect(await hiveRegistry.getNumOfGlobalCategories()).to.be.bignumber.that.equals(new BN(2));
					});
					it("new global category set as expected", async function() {
						expect(categoryDetails.category).to.be.equals(newCategory);
					});
					it("allowed collection for global category set as expected", async function() {
						expect(categoryDetails.allowedCollection).to.be.equals(targetNft.address);
					});
					it("new global category index set as expected", async function() {
						expect(await hiveRegistry.getCategoryIndex(newCategory)).to.be.bignumber.that.equals(new BN(2));
					});
					it("'CategoryAdded' event is emitted", async function() {
						expectEvent(receipt, "CategoryAdded", {
							by: a1,
							categoryIndex: new BN(2),
							category: newCategory,
							allowedCollection: targetNft.address,
						});
					});
				});
				describe("succeed, admin can add new global category with any nft collection", function() {
					beforeEach(async function() {
						receipt = await hiveRegistry.addCategory(newCategory, ZERO_ADDRESS, {from: a1});
						categoryDetails = await hiveRegistry.globalCategories(2);
					});

					it("global category count increased by 1", async function() {
						expect(await hiveRegistry.getNumOfGlobalCategories()).to.be.bignumber.that.equals(new BN(2));
					});
					it("new global category set as expected", async function() {
						expect(categoryDetails.category).to.be.equals(newCategory);
					});
					it("allowed collection for global category set as expected", async function() {
						expect(categoryDetails.allowedCollection).to.be.equals(ZERO_ADDRESS);
					});
					it("new global category index set as expected", async function() {
						expect(await hiveRegistry.getCategoryIndex(newCategory)).to.be.bignumber.that.equals(new BN(2));
					});
					it("'CategoryAdded' event is emitted", async function() {
						expectEvent(receipt, "CategoryAdded", {
							by: a1,
							categoryIndex: new BN(2),
							category: newCategory,
							allowedCollection: ZERO_ADDRESS,
						});
					});
				});
			});
			describe("when admin doesn't have ROLE_HIVE_TOKEN_MANAGER permission", function() {
				let hiveToken, pod;
				beforeEach(async function() {
					hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
					await hiveRegistry.updateRole(a1, ROLE_POD_WHITELIST_MANAGER, {from: deployer});
					await hiveRegistry.whitelistPods([podId], {from: a1});
					await hiveRegistry.updateFeatures(FEATURE_ALLOW_HIVE_CREATION, {from: deployer});
					await persona.mint(pod_owner, podId, {from: deployer});
					await hiveRegistry.createHive(podId, "", {from: pod_owner});
					hiveToken = await deploy_ali_erc20(deployer, H0);
				});
				it("fails, if try to update ERC20 token connected with hive", async function() {
					await expectRevert(hiveRegistry.setHiveTokenAddress(
							1,
							hiveToken.address,
							{from: a1}),
						"access denied"
					);
				});
			});
			describe("when admin have ROLE_HIVE_TOKEN_MANAGER permission", function() {
				let hiveToken, pod;
				const hiveId = 1;
				beforeEach(async function() {
					hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
					// pod = {tokenAddress: persona_addr, tokenId: podId};
					await hiveRegistry.updateRole(a1, ROLE_POD_WHITELIST_MANAGER, {from: deployer});
					await hiveRegistry.whitelistPods([podId], {from: a1});
					await hiveRegistry.updateFeatures(FEATURE_ALLOW_HIVE_CREATION, {from: deployer});
					await persona.mint(pod_owner, podId, {from: deployer});
					await hiveRegistry.createHive(podId, "", {from: pod_owner});
					await hiveRegistry.updateRole(a1, ROLE_HIVE_TOKEN_MANAGER, {from: deployer});
					hiveToken = await deploy_ali_erc20(deployer, H0);
				});
				it("fails, if try to update ERC20 token for invalid Hive index", async function() {
					await expectRevert(hiveRegistry.setHiveTokenAddress(
							0,
							hiveToken.address,
							{from: a1}),
						"invalid hiveId"
					);
				});
				describe("succeed, admin can update ERC20 token for any existing hives", function() {
					beforeEach(async function() {
						receipt = await hiveRegistry.setHiveTokenAddress(hiveId, hiveToken.address, {from: a1});
					});

					it("token address is updated as expected", async function() {
						expect(await hiveRegistry.getHiveToken(hiveId)).to.be.equals(hiveToken.address);
					});
					it("'HiveTokenUpdated' event is emitted", async function() {
						expectEvent(receipt, "HiveTokenUpdated", {
							by: a1,
							hiveId: new BN(hiveId),
							tokenAddress: hiveToken.address
						});
					});
					it("fails, if try to update ERC20 token for Hive whose token address is already set", async function() {
						await expectRevert(hiveRegistry.setHiveTokenAddress(
								hiveId,
								hiveToken.address,
								{from: a1}),
							"token address is already set"
						);
					});
				});
			});
		});

		describe("hive creation", function() {
			const hiveURI = "https://hivemetadata/url";
			let hiveRegistry, pod;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
				// pod = {tokenAddress: persona_addr, tokenId: podId};
				await hiveRegistry.updateRole(a1, ROLE_POD_WHITELIST_MANAGER, {from: deployer});
				await hiveRegistry.whitelistPods([podId], {from: a1});
				await hiveRegistry.updateFeatures(FEATURE_ALLOW_HIVE_CREATION, {from: deployer});
			});
			it("fails, if FEATURE_ALLOW_HIVE_CREATION feature is disabled", async function() {
				await hiveRegistry.updateFeatures(not(FEATURE_ALLOW_HIVE_CREATION), {from: deployer});
				await expectRevert(hiveRegistry.createHive(podId, hiveURI, {from: pod_owner}), "hive creation disabled");
			});
			it("fails, if try with podId other then whitelisted", async function() {
				persona.mint(pod_owner, podId_1, {from: deployer});
				await expectRevert(hiveRegistry.createHive(podId_1, hiveURI, {from: pod_owner}), "not allowed");
			});
			it("fails, if try with pod not own by user", async function() {
				persona.mint(pod_owner, podId, {from: deployer});
				await expectRevert(hiveRegistry.createHive(podId, hiveURI, {from: nft_owner}), "not authorized");
			});
			it("fails, if try with pod against which hive is already been created", async function() {
				persona.mint(pod_owner, podId, {from: deployer});
				await hiveRegistry.createHive(podId, hiveURI, {from: pod_owner});
				await expectRevert(hiveRegistry.createHive(podId, hiveURI, {from: pod_owner}), "already exists");
			});
			it("fails, if try with previously fused iNFT pod which is unfused now", async function() {
				await fuseINft(podId, nftId);
				await defuseINft(nftId);
				await expectRevert(hiveRegistry.createHive(podId, hiveURI, {from: pod_owner}), "not authorized");
			});
			it("fails, if try with previously staked pod which is unstaked now", async function() {
				await stakePod(podId);
				await unstakePod(podId);
				// transfer pod to other wallet, so pod wallet ownership won't trigger
				await persona.transferFrom(pod_owner, nft_owner, podId, {from: pod_owner})
				await expectRevert(hiveRegistry.createHive(podId, hiveURI, {from: pod_owner}), "not authorized");
			});

			describe("success, otherwise", function() {
				describe("pod owner creates hive", function() {
					beforeEach(async function() {
						await persona.mint(pod_owner, podId, {from: deployer});
						receipt = await hiveRegistry.createHive(podId, hiveURI, {from: pod_owner});
					});

					it("total hive count increase by one", async function() {
						expect(await hiveRegistry.getNumOfHives()).to.be.bignumber.that.equals(new BN(1));
					});
					it("hiveId is as expected", async function() {
						expect(await hiveRegistry.getHiveId(podId)).to.be.bignumber.that.equals(new BN(1));
					});
					it("hive details are expected", async function() {
						const creatorPod = await hiveRegistry.getHiveCreatorPod(1);
						expect(creatorPod.tokenAddress).to.be.equals(persona_addr);
						expect(creatorPod.tokenId).to.be.bignumber.that.equals(new BN(podId));
					});
					it("hive uri is as expected", async function() {
						expect(await hiveRegistry.getHiveURI(1)).to.be.equals(hiveURI);
					});
					it("'HiveCreated' event is emitted", async function() {
						expectEvent(receipt, "HiveCreated", {
							by: pod_owner,
							hiveId: new BN(1),
							tokenAddress: persona_addr,
							tokenId: new BN(podId),
							timestamp: await now(),
						});
					});
				});
				describe("iNFT owner creates hive", function() {
					beforeEach(async function() {
						await fuseINft(podId, nftId);
						receipt = await hiveRegistry.createHive(podId, hiveURI, {from: nft_owner});
					});

					it("total hive count increase by one", async function() {
						expect(await hiveRegistry.getNumOfHives()).to.be.bignumber.that.equals(new BN(1));
					});
					it("hiveId is as expected", async function() {
						expect(await hiveRegistry.getHiveId(podId)).to.be.bignumber.that.equals(new BN(1));
					});
					it("hive details are expected", async function() {
						const creatorPod = await hiveRegistry.getHiveCreatorPod(1);
						expect(creatorPod.tokenAddress).to.be.equals(persona_addr);
						expect(creatorPod.tokenId).to.be.bignumber.that.equals(new BN(podId));
					});
					it("hive uri is as expected", async function() {
						expect(await hiveRegistry.getHiveURI(1)).to.be.equals(hiveURI);
					});
					it("'HiveCreated' event is emitted", async function() {
						expectEvent(receipt, "HiveCreated", {
							by: nft_owner,
							hiveId: new BN(1),
							tokenAddress: persona_addr,
							tokenId: new BN(podId)
						});
					});
				});
				describe("pod staker creates hive", function() {
					beforeEach(async function() {
						await stakePod(podId);
						receipt = await hiveRegistry.createHive(podId, hiveURI, {from: pod_owner});
					});

					it("total hive count increase by one", async function() {
						expect(await hiveRegistry.getNumOfHives()).to.be.bignumber.that.equals(new BN(1));
					});
					it("hiveId is as expected", async function() {
						expect(await hiveRegistry.getHiveId(podId)).to.be.bignumber.that.equals(new BN(1));
					});
					it("hive details are expected", async function() {
						const creatorPod = await hiveRegistry.getHiveCreatorPod(1);
						expect(creatorPod.tokenAddress).to.be.equals(persona_addr);
						expect(creatorPod.tokenId).to.be.bignumber.that.equals(new BN(podId));
					});
					it("hive uri is as expected", async function() {
						expect(await hiveRegistry.getHiveURI(1)).to.be.equals(hiveURI);
					});
					it("'HiveCreated' event is emitted", async function() {
						expectEvent(receipt, "HiveCreated", {
							by: pod_owner,
							hiveId: new BN(1),
							tokenAddress: persona_addr,
							tokenId: new BN(podId)
						});
					});
				});
				describe("update Hive URI", function() {
					let newHiveURI, hiveId;
					beforeEach(async function() {
						await persona.mint(pod_owner, podId, {from: deployer});
						await hiveRegistry.createHive(podId, hiveURI, {from: pod_owner});
						hiveId = await hiveRegistry.getHiveId(podId);
						newHiveURI = "https://newHiveURI/"
					});
					it("fails, if user other the hive owner try to update hive URI", async function() {
						await expectRevert(hiveRegistry.updateHiveURI(hiveId, newHiveURI, {from: nft_owner}), "not authorized");
					});
					it("fails, if invalid hiveID is supplied", async function() {
						await expectRevert(hiveRegistry.updateHiveURI(0, newHiveURI, {from: nft_owner}), "invalid hiveId");
					});
					describe("succeed, hive owner able to update hive URI", function() {
						beforeEach(async function() {
							receipt = await hiveRegistry.updateHiveURI(hiveId, newHiveURI, {from: pod_owner});
						});

						it("new hive uri is set as expected", async function() {
							expect(await hiveRegistry.getHiveURI(hiveId)).to.be.equals(newHiveURI);
						});
						it("if pod connected with hive is transferred, then new owner should able to update hive URI", async function() {
							persona.transferFrom(pod_owner, nft_owner, podId, {from: pod_owner});
							await hiveRegistry.updateHiveURI(hiveId, "newHiveURI", {from: nft_owner});
							expect(await hiveRegistry.getHiveURI(hiveId)).to.be.equals("newHiveURI");
						});
						it("'HiveUriUpdated' event is emitted", async function() {
							expectEvent(receipt, "HiveUriUpdated", {
								by: pod_owner,
								hiveId: hiveId,
								hiveURI: newHiveURI
							});
						});
					});
				});
			});
		});
	});

	describe("link/unlink asset", function() {
		let asset, assetId, podId, nftId, categoryId, hiveId;
		let hiveRegistry, anyNft;
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, staking_addr);
			anyNft = await royal_nft_deploy(deployer);

			assetId = 1;
			podId = 1000;
			nftId = 1001;
			categoryId = 1;
			await createHive(hiveRegistry, podId);
			hiveId = await hiveRegistry.getHiveId(podId);
			await persona.mint(pod_owner, assetId, {from: deployer});
		});

		describe("link asset", function() {
			beforeEach(async function() {
				await hiveRegistry.updateFeatures(FEATURE_ALLOW_ASSET_LINKING, {from: deployer});
				asset = {tokenAddress: persona_addr, tokenId: assetId};
			});

			it("fails, if FEATURE_ALLOW_ASSET_LINKING feature is disabled", async function() {
				await hiveRegistry.updateFeatures(not(FEATURE_ALLOW_ASSET_LINKING), {from: deployer});
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "asset linking is disabled");
			});
			it("fails, if user other then asset owner try to link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("fails, if user other then pod owner try to link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("fails, if try with previously fused iNFT pod which is unfused now", async function() {
				podId++;
				await fuseINft(podId, nftId);
				await defuseINft(nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				// transfer pod to other wallet, so pod wallet ownership won't trigger
				await persona.transferFrom(nft_owner, pod_owner, podId, {from: nft_owner})

				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("fails, if try with previously staked pod which is unstaked now", async function() {
				podId++;
				await stakePod(podId);
				await unstakePod(podId);
				// transfer pod to other wallet, so pod wallet ownership won't trigger
				await persona.transferFrom(pod_owner, nft_owner, podId, {from: pod_owner})
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if user invalid hiveId", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, 0, categoryId, {from: pod_owner}), "invalid hiveId");
			});
			it("fails, if user invalid categoryId", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, 0, {from: pod_owner}), "invalid category");
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, 3, {from: pod_owner}), "invalid category");
			});
			it("fails, if anyNFT owner try to link asset with pod collection restricted category", async function() {
				anyNft.mint(nft_owner, assetId, {from: deployer});
				asset = {tokenAddress: anyNft.address, tokenId: assetId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "asset linking restricted for supplied category");
			});
			it("fails, hive owner try to link same pod with asset", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "asset is associated with hive");
			});
			it("fails, user try to link asset which is already linked", async function() {
				podId++;
				await persona.mint(pod_owner, podId, {from: deployer});
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "asset already linked");
			});

			describe("success, otherwise", function() {
				beforeEach(async function() {
					await hiveRegistry.updateFeatures(FEATURE_ALLOW_ASSET_LINKING, {from: deployer});
					receipt = await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				});

				it("total number of asset linked is increased by 1", async function() {
					expect(await hiveRegistry.totalNumOfAssetsLinked()).to.be.bignumber.that.equals(new BN(1));
				});
				it("total number of asset linked with hive is increased by 1", async function() {
					expect(await hiveRegistry.getNumOfAssetsLinkedWithHive(hiveId)).to.be.bignumber.that.equals(new BN(1));
				});
				it("linked asset details are as expected", async function() {
					const assetDetails = await hiveRegistry.getLinkedAssetDetails(asset);
					// validate linked HiveId
					expect(assetDetails[0]).to.be.bignumber.that.equals(new BN(hiveId));
					// validate linked categoryId
					expect(assetDetails[1]).to.be.bignumber.that.equals(new BN(categoryId));
					// validate linked category
					const categoryDetails = await hiveRegistry.globalCategories(categoryId);
					expect(assetDetails[2]).to.be.equals(categoryDetails.category);
				});
				it("linked asset binding details are as expected", async function() {
					const assetDetails = await hiveRegistry.assetCatalogue(hiveId, categoryId, 0);
					expect(assetDetails.tokenAddress).to.be.equals(persona_addr);
					expect(assetDetails.tokenId).to.be.bignumber.that.equals(new BN(assetId));
				});
				it("'AssetLinked' event is emitted", async function() {
					expectEvent(receipt, "AssetLinked", {
						by: pod_owner,
						tokenAddress: persona_addr,
						tokenId: new BN(assetId),
						hiveId: new BN(hiveId),
						category: new BN(categoryId),
						timestamp: await now(),
					});
				});
			});

			describe("try, link asset under general/non-restricted global category", function() {
				let newCategory = "AI_Model";
				let anyNftCategoryId = 2;
				beforeEach(async function() {
					await hiveRegistry.addCategory(newCategory, ZERO_ADDRESS, {from: deployer});
				});

				describe("success, linked asset under general/non-restricted category", function() {
					beforeEach(async function() {
						anyNft.mint(nft_owner, assetId, {from: deployer});
						asset = {tokenAddress: anyNft.address, tokenId: assetId};
						receipt = await hiveRegistry.linkAsset(asset, hiveId, anyNftCategoryId, {from: nft_owner});
					});

					it("asset linked state is as expected", async function() {
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(true);
					});
					it("linked asset details are as expected", async function() {
						const assetDetails = await hiveRegistry.getLinkedAssetDetails(asset);
						// validate linked HiveId
						expect(assetDetails[0]).to.be.bignumber.that.equals(new BN(hiveId));
						// validate linked categoryId
						expect(assetDetails[1]).to.be.bignumber.that.equals(new BN(anyNftCategoryId));
						// validate linked category
						const categoryDetails = await hiveRegistry.globalCategories(2);
						expect(assetDetails[2]).to.be.equals(categoryDetails.category);
					});
					it("linked asset binding details are as expected", async function() {
						const assetDetails = await hiveRegistry.assetCatalogue(hiveId, anyNftCategoryId, 0);
						expect(assetDetails.tokenAddress).to.be.equals(anyNft.address);
						expect(assetDetails.tokenId).to.be.bignumber.that.equals(new BN(assetId));
					});
				});
			});
		});

		describe("unlink asset", function() {
			beforeEach(async function() {
				await hiveRegistry.updateFeatures((FEATURE_ALLOW_ASSET_LINKING | FEATURE_ALLOW_ASSET_UNLINKING), {from: deployer});
				asset = {tokenAddress: persona_addr, tokenId: assetId};
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
			});

			it("fails, if FEATURE_ALLOW_ASSET_UNLINKING feature is disabled", async function() {
				await hiveRegistry.updateFeatures(not(FEATURE_ALLOW_ASSET_UNLINKING), {from: deployer});
				await expectRevert(hiveRegistry.unlinkAsset(asset, {from: pod_owner}), "asset unlinking is disabled");
			});
			it("fails, if user other then asset owner try to unlink asset", async function() {
				await expectRevert(hiveRegistry.unlinkAsset(asset, {from: nft_owner}), "not authorized");
			});
			it("fails, if try with previously fused iNFT pod which is unfused now", async function() {
				podId++;
				await fuseINft(podId, nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				await defuseINft(nftId);

				await expectRevert(hiveRegistry.unlinkAsset(asset, {from: pod_owner}), "not authorized");
			});
			it("fails, if try with previously staked pod which is unstaked now", async function() {
				podId++;
				await stakePod(podId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				await unstakePod(podId);
				// transfer pod to other wallet, so pod wallet ownership won't trigger
				await persona.transferFrom(pod_owner, nft_owner, podId, {from: pod_owner})

				await expectRevert(hiveRegistry.unlinkAsset(asset, {from: pod_owner}), "not authorized");
			});
			it("fails, user try to unlink asset which is already linked", async function() {
				await hiveRegistry.unlinkAsset(asset, {from: pod_owner})
				await expectRevert(hiveRegistry.unlinkAsset(asset, {from: pod_owner}), "unlinked asset");
			});

			describe("success, otherwise", function() {
				let podId_1 = 1001;
				let podId_2 = 1002;
				beforeEach(async function() {
					// link 2nd asset
					await fuseINft(podId_1, nftId);
					asset = {tokenAddress: persona_addr, tokenId: podId_1};
					await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});

					// link 3rd asset
					await stakePod(podId_2);
					asset = {tokenAddress: persona_addr, tokenId: podId_2};
					await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});

					asset = {tokenAddress: persona_addr, tokenId: assetId};
					receipt = await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
				});

				it("asset linked state is as expected", async function() {
					expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
				});
				it("total number of linked asset count decreased by 1", async function() {
					expect(await hiveRegistry.totalNumOfAssetsLinked()).to.be.bignumber.that.equals(new BN(2));
				});
				it("total number of asset linked to hive count decreased by 1", async function() {
					expect(await hiveRegistry.getNumOfAssetsLinkedWithHive(hiveId)).to.be.bignumber.that.equals(new BN(2));
				});
				it("'AssetUnlinked' event is emitted", async function() {
					expectEvent(receipt, "AssetUnlinked", {
						by: pod_owner,
						tokenAddress: persona_addr,
						tokenId: new BN(assetId),
						hiveId: new BN(hiveId),
						category: new BN(categoryId),
						timestamp: await now(),
					});
				});
			});

			describe("multiple unlinking asset", function() {
				let podId_1 = 1001;
				let podId_2 = 1002;
				beforeEach(async function() {
					// link 2nd asset
					await fuseINft(podId_1, nftId);
					asset = {tokenAddress: persona_addr, tokenId: podId_1};
					await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});

					// link 3rd asset
					await stakePod(podId_2);
					asset = {tokenAddress: persona_addr, tokenId: podId_2};
					await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				});
				it("successfully, unlink lated linked asset", async function() {
					await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
					expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
				});
				it("successfully, unlink 2nd linked asset", async function() {
					asset = {tokenAddress: persona_addr, tokenId: podId_1};
					await hiveRegistry.unlinkAsset(asset, {from: nft_owner});
					expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
				});
				it("successfully, unlink 1st linked asset", async function() {
					asset = {tokenAddress: persona_addr, tokenId: assetId};
					await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
					expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
				});
				describe("successfully, unlink all connected asset in sequence", function() {
					beforeEach(async function() {
						await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);

						asset = {tokenAddress: persona_addr, tokenId: podId_1};
						await hiveRegistry.unlinkAsset(asset, {from: nft_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);

						asset = {tokenAddress: persona_addr, tokenId: assetId};
						await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
					})

					it("total number of linked asset count is zero", async function() {
						expect(await hiveRegistry.totalNumOfAssetsLinked()).to.be.bignumber.that.equals(new BN(0));
					});
					it("total number of asset linked to hive count is zero", async function() {
						expect(await hiveRegistry.getNumOfAssetsLinkedWithHive(hiveId)).to.be.bignumber.that.equals(new BN(0));
					});
				});
				describe("successfully, unlink all connected asset in reverse sequence", function() {
					beforeEach(async function() {
						asset = {tokenAddress: persona_addr, tokenId: assetId};
						await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);

						asset = {tokenAddress: persona_addr, tokenId: podId_1};
						await hiveRegistry.unlinkAsset(asset, {from: nft_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);

						asset = {tokenAddress: persona_addr, tokenId: podId_2};
						await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
					})

					it("total number of linked asset count is zero", async function() {
						expect(await hiveRegistry.totalNumOfAssetsLinked()).to.be.bignumber.that.equals(new BN(0));
					});
					it("total number of asset linked to hive count is zero", async function() {
						expect(await hiveRegistry.getNumOfAssetsLinkedWithHive(hiveId)).to.be.bignumber.that.equals(new BN(0));
					});
				});
				describe("successfully, unlink all connected asset in random sequence", function() {
					beforeEach(async function() {
						asset = {tokenAddress: persona_addr, tokenId: podId_1};
						await hiveRegistry.unlinkAsset(asset, {from: nft_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);

						asset = {tokenAddress: persona_addr, tokenId: assetId};
						await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);

						asset = {tokenAddress: persona_addr, tokenId: podId_2};
						await hiveRegistry.unlinkAsset(asset, {from: pod_owner});
						expect(await hiveRegistry.isAssetLinked(asset)).to.equals(false);
					})

					it("total number of linked asset count is zero", async function() {
						expect(await hiveRegistry.totalNumOfAssetsLinked()).to.be.bignumber.that.equals(new BN(0));
					});
					it("total number of asset linked to hive count is zero", async function() {
						expect(await hiveRegistry.getNumOfAssetsLinkedWithHive(hiveId)).to.be.bignumber.that.equals(new BN(0));
					});
				});
			});
		});
	});

	describe("corner scenarios", function() {
		const assetId = 1, podId = 1000, nftId = 1001, categoryId = 2, hiveId = 1;
		describe("hiveRegistry without 'pod/iNFT/staking' interface", function() {
			let hiveRegistry, anyNft, asset;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS);
				await hiveRegistry.addCategory("AI_Model", ZERO_ADDRESS, {from: deployer});
				anyNft = await royal_nft_deploy(deployer);

				asset = {tokenAddress: anyNft.address, tokenId: assetId};
				await anyNft.mint(nft_owner, assetId, {from: deployer});
				await hiveRegistry.updateFeatures(FEATURE_ALL, {from: deployer});
			});
			it("fails, try to create new hive", async function() {
				await expectRevert(createHive(hiveRegistry, podId), "not allowed");
			});
			it("fails, if user other then asset link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if pod staker try to link pod with hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await stakePod(podId);
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if iNFT owner try to link pod with hive", async function() {
				await fuseINft(podId, nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("succeed, asset successfully linked to any hive", async function() {
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
		});
		describe("hiveRegistry without 'iNFT/staking' interface", function() {
			let hiveRegistry, anyNft, asset;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, ZERO_ADDRESS, ZERO_ADDRESS);
				await hiveRegistry.addCategory("AI_Model", ZERO_ADDRESS, {from: deployer});
				anyNft = await royal_nft_deploy(deployer);

				asset = {tokenAddress: anyNft.address, tokenId: assetId};
				await anyNft.mint(nft_owner, assetId, {from: deployer});
				await hiveRegistry.updateFeatures(FEATURE_ALL, {from: deployer});
			});
			it("fails, if user other then asset owner try to link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if user other then pod owner try to link asset", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await persona.mint(pod_owner, podId, {from: deployer});
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("fails, if pod staker try to link pod with hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await stakePod(podId);
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if iNFT owner try to link pod with hive", async function() {
				await fuseINft(podId, nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("succeed, new hive created successfully", async function() {
				await createHive(hiveRegistry, podId);
				expect(await hiveRegistry.getHiveId(podId)).to.be.bignumber.that.equals(new BN(hiveId));
			});
			it("succeed, pod successfully linked to any hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await persona.mint(pod_owner, podId, {from: deployer});
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
			it("succeed, asset successfully linked to any hive", async function() {
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
		});
		describe("hiveRegistry without 'staking' interface", function() {
			let hiveRegistry, anyNft, asset;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, iNft_addr, ZERO_ADDRESS);
				await hiveRegistry.addCategory("AI_Model", ZERO_ADDRESS, {from: deployer});
				anyNft = await royal_nft_deploy(deployer);

				asset = {tokenAddress: anyNft.address, tokenId: assetId};
				await anyNft.mint(nft_owner, assetId, {from: deployer});
				await hiveRegistry.updateFeatures(FEATURE_ALL, {from: deployer});
			});
			it("fails, if user other then asset owner try to link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if user other then pod owner try to link asset", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await persona.mint(pod_owner, podId, {from: deployer});
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("fails, if pod staker try to link pod with hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await stakePod(podId);
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("succeed, new hive created successfully", async function() {
				await createHive(hiveRegistry, podId);
				expect(await hiveRegistry.getHiveId(podId)).to.be.bignumber.that.equals(new BN(hiveId));
			});
			it("succeed, pod successfully linked to any hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await persona.mint(pod_owner, podId, {from: deployer});
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
			it("succeed, iNFT owner successfully linked pod to any hive", async function() {
				await fuseINft(podId, nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
			it("succeed, asset successfully linked to any hive", async function() {
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
		});
		describe("hiveRegistry without 'iNFT' interface", function() {
			let hiveRegistry, anyNft, asset;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, persona_addr, ZERO_ADDRESS, staking_addr);
				await hiveRegistry.addCategory("AI_Model", ZERO_ADDRESS, {from: deployer});
				anyNft = await royal_nft_deploy(deployer);

				asset = {tokenAddress: anyNft.address, tokenId: assetId};
				await anyNft.mint(nft_owner, assetId, {from: deployer});
				await hiveRegistry.updateFeatures(FEATURE_ALL, {from: deployer});
			});
			it("fails, if user other then asset owner try to link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if user other then pod owner try to link asset", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await persona.mint(pod_owner, podId, {from: deployer});
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("fails, if iNFT owner try to link pod with hive", async function() {
				await fuseINft(podId, nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("succeed, new hive created successfully", async function() {
				await createHive(hiveRegistry, podId);
				expect(await hiveRegistry.getHiveId(podId)).to.be.bignumber.that.equals(new BN(hiveId));
			});
			it("succeed, pod successfully linked to any hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await persona.mint(pod_owner, podId, {from: deployer});
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
			it("succeed, pod staker successfully linked pod to any hive", async function() {
				await stakePod(podId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
			it("succeed, asset successfully linked to any hive", async function() {
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
		});
		describe("hiveRegistry without 'pod' interface", function() {
			let hiveRegistry, anyNft, asset;
			beforeEach(async function() {
				hiveRegistry = await deploy_hive_registry_pure(deployer, ZERO_ADDRESS, iNft_addr, staking_addr);
				await hiveRegistry.addCategory("AI_Model", ZERO_ADDRESS, {from: deployer});
				anyNft = await royal_nft_deploy(deployer);

				asset = {tokenAddress: anyNft.address, tokenId: assetId};
				await anyNft.mint(nft_owner, assetId, {from: deployer});
				await hiveRegistry.updateFeatures(FEATURE_ALL, {from: deployer});
			});
			it("fails, try to create new hive", async function() {
				await expectRevert(createHive(hiveRegistry, podId), "not allowed");
			});
			it("fails, if user other then asset link asset", async function() {
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if pod staker try to link pod with hive", async function() {
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await stakePod(podId);
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: pod_owner}), "not authorized");
			});
			it("fails, if iNFT owner try to link pod with hive", async function() {
				await fuseINft(podId, nftId);
				asset = {tokenAddress: persona_addr, tokenId: podId};
				await expectRevert(hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner}), "not authorized");
			});
			it("succeed, asset successfully linked to any hive", async function() {
				await hiveRegistry.linkAsset(asset, hiveId, categoryId, {from: nft_owner});
				expect(await hiveRegistry.isAssetLinked(asset)).to.be.equals(true);
			});
		});
	})
});

// AI Protocol: Hardhat time differs from Date.now(), use this function to obtain it
async function now() {
	const latestBlock = await web3.eth.getBlock("latest");
	return new BN(latestBlock.timestamp);
}
