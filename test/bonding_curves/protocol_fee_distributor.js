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

// ACL features and roles
const {
	not,
	ROLE_RECIPIENT_LIST_MANAGER,
	ROLE_DISTRIBUTION_MANAGER
} = require("@ai-protocol/v3-core/test/include/features_roles");

// enable chai-subset to allow containSubset instead of deep equals, see https://www.chaijs.com/plugins/chai-subset/
require("chai").use(require("chai-subset"));

// deployment routines in use
const {
	ali_erc20_deploy,
} = require("@ai-protocol/v3-core/test/ali_token/include/deployment_routines");

// deployment routines in use
const {
	deploy_protocol_fee_distributor,
} = require("./include/deployment_routines");

// run ProtocolFeeDistributorV1.sol contract
contract("Protocol Fee Distributor", function(accounts) {
	// extract accounts to be used:
	// A0 – special default zero account accounts[0] used by Truffle, reserved
	// a0 – deployment account having all the permissions, reserved
	// H0 – initial token holder account
	// a1, a2,... – working accounts to perform tests on
	const [A0, a0, H0, a1, a2, a3, a4, a5] = accounts;
	let fee_distributor, token;
	const MAX_RECIPIENTS_ALLOWED = new BN(5);
	const deposit_value = web3.utils.toWei(new BN(1), "ether");
	describe("deployment and initialization", function() {
		beforeEach(async function() {
			token = await ali_erc20_deploy(a0);
		});

		it("impossible to deploy fee distributor without the payment token address", async function() {
			await expectRevert(
				deploy_protocol_fee_distributor(a0, ZERO_ADDRESS), "zero address"
			);
		});

		describe("success, otherwise", function() {
			beforeEach(async function() {
				fee_distributor = await deploy_protocol_fee_distributor(a0, token.address);
			});

			it("ERC20 payment token address is set correctly", async function() {
				expect(await fee_distributor.getPaymentToken()).to.equal(token.address);
			});

			it("MAX_RECIPIENTS_ALLOWED is set correctly", async function() {
				expect(await fee_distributor.MAX_RECIPIENTS_ALLOWED()).to.be.bignumber.that.equals(MAX_RECIPIENTS_ALLOWED);
			});
		});
	});
	describe("fee distribution ACL", function() {
		beforeEach(async function() {
			token = await ali_erc20_deploy(a0);
			fee_distributor = await deploy_protocol_fee_distributor(a0, token.address);
		});
		describe("when admin doesn't have ROLE_RECIPIENT_LIST_MANAGER permission", function() {
			it("fails to update recipients list", async function() {
				const recipient1Details = {recipient: a0, allocationPercent: '100000'};
				await expectRevert(fee_distributor.updateRecipientsList(
						[recipient1Details],
						{from: a1}),
					"access denied"
				);
			});
		});
		describe("when admin have ROLE_RECIPIENT_LIST_MANAGER permission", function() {
			beforeEach(async function() {
				await fee_distributor.updateRole(a1, ROLE_RECIPIENT_LIST_MANAGER, {from: a0});
			});
			it("fails, if try to update recipients list no address", async function() {
				await expectRevert(fee_distributor.updateRecipientsList(
						[],
						{from: a1}),
					"recipients list is empty"
				);
			});
			it("fails, if try to update recipients list with zero address", async function() {
				const recipient1Details = {recipient: a0, allocationPercent: '500000'};
				const recipient2Details = {recipient: ZERO_ADDRESS, allocationPercent: '500000'};
				await expectRevert(fee_distributor.updateRecipientsList(
						[recipient1Details, recipient2Details],
						{from: a1}),
					"zero recipient"
				);

			});
			it("fails, if try to update recipients list with wrong allocation", async function() {
				const recipient1Details = {recipient: a0, allocationPercent: '500000'};
				const recipient2Details = {recipient: a1, allocationPercent: '600000'};
				await expectRevert(fee_distributor.updateRecipientsList(
						[recipient1Details, recipient2Details],
						{from: a1}),
					"totalAllocation must be 100%"
				);
			});
			it("fails, if try to update recipients list more then allowed max limit", async function() {
				const recipient1Details = {recipient: a0, allocationPercent: '200000'};
				const recipient2Details = {recipient: a1, allocationPercent: '200000'};
				const recipient3Details = {recipient: a2, allocationPercent: '200000'};
				const recipient4Details = {recipient: a3, allocationPercent: '200000'};
				const recipient5Details = {recipient: a4, allocationPercent: '100000'};
				const recipient6Details = {recipient: a5, allocationPercent: '100000'};
				await expectRevert(fee_distributor.updateRecipientsList(
						[recipient1Details, recipient2Details, recipient3Details, recipient4Details, recipient5Details, recipient6Details],
						{from: a1}),
					"recipients list is too big"
				);

			});
			describe("succeed, otherwise", function() {
				let recipient1Details, recipient2Details, receipt;
				beforeEach(async function() {
					recipient1Details = {recipient: a2, allocationPercent: '500000'};
					recipient2Details = {recipient: a3, allocationPercent: '500000'};
					receipt = await fee_distributor.updateRecipientsList([recipient1Details, recipient2Details], {from: a0});
				});
				it("number of added recipient is set as expected", async function() {
					expect(await fee_distributor.getRecipientsLength()).to.be.bignumber.that.equals(new BN(2));
				});
				it("recipient address is set as expected", async function() {
					const recipient1Details = await fee_distributor.getRecipient(0);
					const recipient2Details = await fee_distributor.getRecipient(1);
					expect(recipient1Details.recipient).to.equals(recipient1Details.recipient);
					expect(recipient2Details.recipient).to.equals(recipient2Details.recipient);
				});
				it("recipient allocation is set as expected", async function() {
					const recipient1Details = await fee_distributor.getRecipient(0);
					const recipient2Details = await fee_distributor.getRecipient(1);
					expect(recipient1Details.allocationPercent).to.be.bignumber.that.equals(new BN(recipient1Details.allocationPercent));
					expect(recipient2Details.allocationPercent).to.be.bignumber.that.equals(new BN(recipient2Details.allocationPercent));
				});
				it("'RecipientsListUpdated' event is emitted", async function() {
					expectEvent(receipt, "RecipientsListUpdated", {
						recipient: recipient1Details.recipient,
						allocation: new BN(recipient1Details.allocationPercent)
					});

					expectEvent(receipt, "RecipientsListUpdated", {
						recipient: recipient2Details.recipient,
						allocation: new BN(recipient2Details.allocationPercent)
					});
				});
			});
		});
	});
	describe("distribute ETH", function() {
		let recipient1Balance, recipient2Balance, receipt;
		beforeEach(async function() {
			token = await ali_erc20_deploy(a0);
			fee_distributor = await deploy_protocol_fee_distributor(a0, token.address);
		});
		describe("when admin doesn't have ROLE_DISTRIBUTION_MANAGER permission", function() {
			it("fails, if try to distribute ETH", async function() {
				await web3.eth.sendTransaction({
					to: fee_distributor.address,
					value: deposit_value, // Sends exactly 1.0 ether
					from: a0
				});
				await expectRevert(fee_distributor.distributeETH({from: a1}), "access denied");
			});
		});
		describe("when admin has ROLE_DISTRIBUTION_MANAGER permission", function() {
			beforeEach(async function() {
				await fee_distributor.updateRole(a1, ROLE_DISTRIBUTION_MANAGER, {from: a0});
			});
			it("fails, if no ether is available to distribute", async function() {
				await expectRevert(fee_distributor.distributeETH({from: a1}), "nothing to distribute");
			});
			it("fails, if recipients list is empty", async function() {
				await web3.eth.sendTransaction({
					to: fee_distributor.address,
					value: deposit_value, // Sends exactly 1.0 ether
					from: a0
				});
				await expectRevert(fee_distributor.distributeETH({from: a1}), "recipients list is empty");
			});
			describe("succeed, otherwise", function() {
				const recipient1Details = {recipient: a2, allocationPercent: '500000'};
				const recipient2Details = {recipient: a3, allocationPercent: '500000'};
				beforeEach(async function() {
					await fee_distributor.updateRecipientsList([recipient1Details, recipient2Details], {from: a0});
					recipient1Balance = new BN(await web3.eth.getBalance(recipient1Details.recipient));
					recipient2Balance = new BN(await web3.eth.getBalance(recipient2Details.recipient));
					await web3.eth.sendTransaction({
						to: fee_distributor.address,
						value: deposit_value, // Sends exactly 1.0 ether
						from: a0
					});
					receipt = await fee_distributor.distributeETH({from: a1});
				});
				it("recipient-1 received ETH as expected", async function() {
					const postTransferBalance = new BN(await web3.eth.getBalance(recipient1Details.recipient));
					expect(postTransferBalance.sub(recipient1Balance)).to.be.bignumber.that.equals(deposit_value.divn(2));
				});
				it("recipient-2 received ETH as expected", async function() {
					const postTransferBalance = new BN(await web3.eth.getBalance(recipient2Details.recipient));
					expect(postTransferBalance.sub(recipient2Balance)).to.be.bignumber.that.equals(deposit_value.divn(2));
				});
				it("'ETHSent' event is emitted", async function() {
					expectEvent(receipt, "ETHSent", {
						recipient: recipient1Details.recipient,
						amount: deposit_value.divn(2)
					});

					expectEvent(receipt, "ETHSent", {
						recipient: recipient2Details.recipient,
						amount: deposit_value.divn(2)
					});
				});
			});
		});
	});
	describe("distribute ERC20 payment token", function() {
		let recipient1Balance, recipient2Balance, receipt;
		beforeEach(async function() {
			token = await ali_erc20_deploy(a0);
			fee_distributor = await deploy_protocol_fee_distributor(a0, token.address);
		});
		describe("when admin doesn't have ROLE_DISTRIBUTION_MANAGER permission", function() {
			it("fails, if try to distribute ERC20 token", async function() {
				await token.transfer(fee_distributor.address, deposit_value, {from: a0});
				await expectRevert(fee_distributor.distributeERC20({from: a1}), "access denied");
			});
		});
		describe("when admin has ROLE_DISTRIBUTION_MANAGER permission", function() {
			beforeEach(async function() {
				await fee_distributor.updateRole(a1, ROLE_DISTRIBUTION_MANAGER, {from: a0});
			})
			it("fails, if no payment token is available to distribute", async function() {
				await expectRevert(fee_distributor.distributeERC20({from: a1}), "nothing to distribute");
			});
			it("fails, if recipients list is empty", async function() {
				await token.transfer(fee_distributor.address, deposit_value, {from: a0});
				await expectRevert(fee_distributor.distributeERC20({from: a1}), "recipients list is empty");
			});
			describe("succeed, otherwise", function() {
				const recipient1Details = {recipient: a2, allocationPercent: '500000'};
				const recipient2Details = {recipient: a3, allocationPercent: '500000'};
				beforeEach(async function() {
					await fee_distributor.updateRecipientsList([recipient1Details, recipient2Details], {from: a0});
					recipient1Balance = new BN(await token.balanceOf(recipient1Details.recipient));
					recipient2Balance = new BN(await token.balanceOf(recipient2Details.recipient));
					await token.transfer(fee_distributor.address, deposit_value, {from: a0});
					receipt = await fee_distributor.distributeERC20({from: a1});
				});
				it("recipient-1 received ERC20 as expected", async function() {
					const postTransferBalance = new BN(await token.balanceOf(recipient1Details.recipient));
					expect(postTransferBalance.sub(recipient1Balance)).to.be.bignumber.that.equals(deposit_value.divn(2));
				});
				it("recipient-2 received ERC20 as expected", async function() {
					const postTransferBalance = new BN(await token.balanceOf(recipient2Details.recipient));
					expect(postTransferBalance.sub(recipient2Balance)).to.be.bignumber.that.equals(deposit_value.divn(2));
				});
				it("'ERC20Sent' event is emitted", async function() {
					expectEvent(receipt, "ERC20Sent", {
						recipient: recipient1Details.recipient,
						amount: deposit_value.divn(2)
					});

					expectEvent(receipt, "ERC20Sent", {
						recipient: recipient2Details.recipient,
						amount: deposit_value.divn(2)
					});
				});
			});
		});
	});
});
