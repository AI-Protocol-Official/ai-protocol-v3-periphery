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
} = require("@ai-protocol/v3-core/test/include/block_utils");

// EIP712 utils
const {
	EIP712Domain,
	domainSeparator,
} = require("./include/eip712");

// RBAC
const {
	ROLE_DPT_REGISTRAR,
} = require("@ai-protocol/v3-core/test/include/features_roles");

// deployment routines in use
const {
	deploy_hive_registry,
} = require("./include/deployment_routines");

const {
	royal_nft_deploy
} = require("@ai-protocol/v3-core/test/erc721/include/deployment_routines");

// run Hive Registry smart contract
contract("HiveRegistry", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;
	let dpt, dptId = 1;
	const relayer = a2;

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
			RegisterDPTRequest: [
				{name: "dpt", type: "SharesSubject"},
				{name: "dptHolder", type: "address"},
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
			dpt: subject,
			dptHolder: dptHolder,
			validFromTimestamp: parseInt(sig_valid_from || await default_deadline(0)),
			expiresAtTimestamp: parseInt(sig_expires_at || await default_deadline(60)),
			nonce: parseInt(sig_nonce || await hiveRegistry.getNonce(dptHolder)),
		};

		const signature = ethSigUtil.signTypedMessage(Buffer.from(web3.utils.hexToBytes(signer.privateKey || signer)), {
			data: {
				domain,
				types,
				primaryType: "RegisterDPTRequest",
				message: request,
			},
		});

		// return the results
		return {subject, request, signature};
	}

	beforeEach(async function() {
		dpt = await royal_nft_deploy(a0);
	});

	describe("deployment and initialization", function() {
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry(a0);
		});
		it("hive deployed successfully", async function() {
			expect(await hiveRegistry.address).to.not.equal(ZERO_ADDRESS);
		});
		it("postConstruct() initializer is no longer executable", async function() {
			await expectRevert(hiveRegistry.postConstruct({from: a0}), "Initializable: contract is already initialized");
		});
	});

	describe("Register DPT", function() {
		const signer = web3.eth.accounts.create();
		let subject;
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry(a0);
			await dpt.mint(a1, dptId, {from: a0});
			subject = {tokenAddress: dpt.address, tokenId: dptId};
		})

		describe("DPT Holder try to register DPT", function() {
			it("Fails, if user tries to register a DPT which user is not holding", async function() {
				await expectRevert(hiveRegistry.registerDPT(subject, {from: a2}), "not authorized");
			});

			it("Fails, if user tries to register DTP which is already registered", async function() {
				await hiveRegistry.registerDPT(subject, {from: a1});
				await expectRevert(hiveRegistry.registerDPT(subject, {from: a1}), "DPT is already registered!");
			});

			describe("succeed, otherwise", function() {
				let receipt;
				beforeEach(async function() {
					receipt = await hiveRegistry.registerDPT(subject, {from: a1});
				})

				it("Verified, DPT Registered", async function() {
					expect(await hiveRegistry.isDPTRegistered(dpt.address, dptId)).to.be.equal(true);
				});

				it("'DPTRegistered' event is emitted", async function() {
					expectEvent(receipt, "DPTRegistered", {
						by: a1,
						dptAddress: dpt.address,
						dptId : new BN(dptId)
					});
				});
			});
		});

		describe("authorizer try to register DPT", function() {
			let authorizer = a2;
			it("Fails, if signed not by a ROLE_DPT_REGISTRAR role", async function() {
				await expectRevert(hiveRegistry.registerDPT(subject, {from: authorizer}), "not authorized");
			});

			describe("succeed, otherwise", function() {
				let receipt;
				beforeEach(async function() {
					await hiveRegistry.updateRole(authorizer, ROLE_DPT_REGISTRAR, {from: a0});
					receipt = await hiveRegistry.registerDPT(subject, {from: authorizer});
				})

				it("Verified, DPT Registered", async function() {
					expect(await hiveRegistry.isDPTRegistered(dpt.address, dptId)).to.be.equal(true);
				});

				it("'DPTRegistered' event is emitted", async function() {
					expectEvent(receipt, "DPTRegistered", {
						by: authorizer,
						dptAddress: dpt.address,
						dptId : new BN(dptId)
					});
				});

				it("Fails, if user tries to register DTP which is already registered", async function() {
					await expectRevert(hiveRegistry.registerDPT(subject, {from: authorizer}), "DPT is already registered!");
				});
			});
		});

		describe("authorizer try to register DPT using Meta-tx", function() {
			const signer = web3.eth.accounts.create();

			it("Fails, if signed not by a ROLE_DPT_REGISTRAR role", async function() {
				({request, signature} = await get_eip712_request_and_signature(signer,hiveRegistry,subject, a1));
				await expectRevert(hiveRegistry.registerDPTRequest(request, signature, {from: relayer}), "not authorized");
			});

			it("Fails, if nonce is invalid", async function() {
				({request, signature} = await get_eip712_request_and_signature(signer,hiveRegistry,subject, a1, null, null, 1));
				await expectRevert(hiveRegistry.registerDPTRequest(request, signature, {from: relayer}), "invalid nonce");
			});

			it("Fails, if the signature is not yet valid", async function() {
				({request, signature} = await get_eip712_request_and_signature(signer,hiveRegistry,subject, a1, 4294967296));
				await expectRevert(hiveRegistry.registerDPTRequest(request, signature, {from: relayer}), "not yet valid");
			});

			it("fails if the signature already expired", async function() {
				({request, signature} = await get_eip712_request_and_signature(signer,hiveRegistry,subject, a1, null, 1));
				await expectRevert(hiveRegistry.registerDPTRequest(request, signature, {from: relayer}), "expired");
			});

			describe("succeed, otherwise", function() {
				let receipt;
				beforeEach(async function() {
					({request, signature} = await get_eip712_request_and_signature(signer,hiveRegistry,subject, a1));
					await hiveRegistry.updateRole(signer.address, ROLE_DPT_REGISTRAR, {from: a0});
					receipt = await hiveRegistry.registerDPTRequest(request, signature, {from: relayer});
				});

				it("Verified, DPT Registered", async function() {
					expect(await hiveRegistry.isDPTRegistered(dpt.address, dptId)).to.be.equal(true);
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
						dptId : new BN(dptId)
					});
				});
				it("impossible to registered DPT, which is already registered", async function() {
					({request, signature} = await get_eip712_request_and_signature(signer,hiveRegistry,subject, a1));
					await expectRevert(hiveRegistry.registerDPTRequest(request, signature, {from: relayer}), "DPT is already registered!");
				});
			});
		});
	});

	describe("nonce (rewindNonce)", function() {
		beforeEach(async function() {
			hiveRegistry = await deploy_hive_registry(a0);
			await dpt.mint(a1, dptId, {from: a0});
		});
		function succeedsToRewindNonce(value) {
			value = new BN(value);

			let receipt;
			beforeEach(async function() {
				receipt = await hiveRegistry.rewindNonce(a1, value, {from: a0});
			});
			it('"NonceUsed" event is emitted', async function() {
				expectEvent(receipt, "NonceUsed", {issuer: a1, nonce: value.subn(1)});
			});
			it("value gets set correctly", async function() {
				expect(await hiveRegistry.getNonce(a1)).to.be.bignumber.that.equals(value);
			});
		}
		async function failsToRewindNonce(value, error) {
			await expectRevert(hiveRegistry.rewindNonce(a1, value, {from: a0}), error);
		}
		it("fails to set non-zero value (rewind back)", async function() {
			await failsToRewindNonce(0, "new nonce must be bigger than the current one");
		});
		describe("successfully sets non-zero value (rewind forward)", function() {
			succeedsToRewindNonce(1);
		});
	});
});
