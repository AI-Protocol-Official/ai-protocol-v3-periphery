# Tradeable Shares #

[Tradeable shares](TradeableShares.sol) is a non-transferable, but tradeable (buyable/sellable) fungible
token-like asset, which is bought/sold solely from/to the shares contract at the predefined by
[the bonding curve](BondingCurve.sol) function price.

Anyone can launch tradeable shares, similarly to how everyone can launch an ERC20 token. Launched tradeable
shares implementations can differ in many ways, including differences in the bonding curve function, but release
3.0 focuses solely on one implementation.

Release 3.0 introduces two implementations (only one to be chosen and used upon launch):

* [ETH-based Implementation](ETHShares.sol), accepting native ETH (or other native currency) as a payment currency
* [ALI-based Implementation](ERC20Shares.sol), accepting ALI token (technically any ERC20 token) as a payment currency

Both implementations are not upgradeable.

## Friend.tech's Bonding Curve ##

Quadratic function of the shares total supply, crossing a (0, 0) point (first share price is zero).
As new shares are bought/minted, the price of the every next share increases rapidly.

See [FriendTechBondingCurve.sol](FriendTechBondingCurve.sol)

## Fees ##

There are 3 types of fees applied to every trade operation:

* protocol fee, 4%
* shares holders fee, 3%
* shares subject fee, 3%

Fees are defined with the 10^18 precision, so that 10^18 is equal one (100%)

| smart contract value      | percent value |
|---------------------------|---------------|
| 1'000'000'000'000'000'000 | 100%          |
| 100'000'000'000'000'000   | 10%           |
| 10'000'000'000'000'000    | 1%            |
| 1'000'000'000'000'000     | 0.1%          |
| 100'000'000'000'000       | 0.01%         |

Shares contracts send all the fees via the push mechanism.

### Protocol Fee ###

Protocol fee is sent to [the protocol fee distributor upgradeable contract](ProtocolFeeDistributorV1.sol) and then
manually distributed to the several parties via the push mechanism by the distribution manager (role).

All the deployed shares contracts send the protocol fee to a single destination.

Fee is send in a non-blocking way: if fee sending internal transaction fails, the containing trade transaction
doesn't revert; failed fee is discarded.

### Shares Holders Fee ###

Holders fee is distributed to the shares holders of the same shares contract proportionally to the amount of shares
they hold and the time period they hold them for.

Shares holders fee distribution is handled by the [HoldersRewardsDistributor](HoldersRewardsDistributorV1.sol)
smart contract. Every shares contract gets its own deployed distributor contract.

Distributor contract not only receives the fees from the shares contract, but it also receives sync messages,
containing the information on every trade happening on the shares contract.
Distributor uses this information to determine the amounts of the rewards to send to the shares holders.
The rewards are sent via pull mechanism.

The sync message is sent in a blocking way: failure to deliver the message fails the containing trade transaction.

### Shares Subject Fee ###

Each shares contract is bound to the shares subject – an NFT, defined by its ERC721 contract address and NFT ID.
The owner of the bound NFT is called also a shares issuer. While shares subject is immutable for every shares contract,
the shares issuer can change when the NFT is traded.

Shares subject fee is sent in a whole to the shares issuer.

Fee is send in a non-blocking way: if fee sending internal transaction fails, the containing trade transaction
doesn't revert; failed fee is discarded.

## Emergency Functions ##

There are several emergency functions, available only to the "admin" MultiSig wallet. These functions can be
executed only manually from the MultiSig and only individually for every deployed shares contract.

* update shares subject; to be used if NFT is stolen
* update protocol fee destination; to be used if deployed protocol fee distributor contract is compromised
* disable shares holders fee; to be used in case of legal issues; once disabled, the fee cannot be enabled
  again; the disabled fee sums up to the protocol fee and is sent to the protocol fee destination

# Shares Factory #

Tradeable shares contract can be deployed by anyone via the [SharesFactory](SharesFactoryV1.sol) smart contract.

To deploy the shares contract, its issuer either

* uses an existing, owned by the issuer NFT which is not already used as a shares subject, or
* mints a new NFT with the permission of the NFT contract owner and uses newly minted NFT as a shares subject

When deploying the shares contract via the factory, an issuer can buy any amount of initial shares immediately.
The first share is always free and it must be bought in order to launch the shares contract (the very first share
can be bought only by the issuer).

## Admin Functions ##

Factory "admin" can

* update the fees,
* update the protocol fee destination address,
* update the addresses of the implementations of the tradeable shares and shares holders rewards distributor contracts,
* register the detached tradeable shares contracts within the factory,
* set the "admin" MultiSig wallet address having the emergency functions on the deployed shares contracts,
* upgrade the factory contract.

Updates done by the factory "admin" don't affect already deployed contracts.

# Holders Rewards Distributor #

Non-upgradeable contract without any "admin" functions. Optionally deployed for every shares contract to enable
shares holders fees distribution feature.

Supports either native ETH payments (if deployed with a zero payment token address), or ERC1363 token payments.

# Protocol Fee Distributor #

Accepts protocol fees from the bonding curve contracts and distributes them later to the list of recipients via
the admin-push mechanism.

Fully controlled by the "admin" MultiSig, upgradeable.
