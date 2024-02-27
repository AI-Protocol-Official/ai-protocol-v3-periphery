# Summary #

| ID   | Title                                                                                                                 | Resolution   |
|------|-----------------------------------------------------------------------------------------------------------------------|--------------|
| M-1  | Potential to front run in `HoldersRewardsDistributorV1` affecting `__accept` function                                 | Fixed        |
| M-2  | If `owner` (via the Factory `sharesOwnerAddress`) is not set in the shares contract then it's not possible to manage  | Acknowledged |
| L-1  | `ProtocolFeeDistributorV1` contract `updateRecipientsList` function does not check for duplicate recipient address    | Acknowledged |
| L-2  | Check the shares contract type before setting in `HoldersRewardsDistributorV1`                                        | Acknowledged |
| L-3  | The `RewardSystem` proxy deployment sets the `rewardSystemType` incorrectly                                           | Fixed        |
| L-4  | The `RewardSystem` proxy deployment is missing the ETH `rewardSystemType`.                                            | Acknowledged |
| I-1  | Validate the bridge address is trusted before updating role                                                           | Not Valid    |
| I-2  | Bonding curve price function differs slightly from the FriendTech version                                             | Acknowledged |
| I-3  | Missing detail in comment for keccak256 value                                                                         | Fixed        |
| I-4  | Outdated comment in HoldersRewardsDistributor                                                                         | Fixed        |
| I-5  | Naming convention for contract interfaces                                                                             | Not Valid    |
| I-6  | TODO comments in contract code                                                                                        | Fixed        |
| I-7  | Include an .nvmrc file to set the node version to 16 for devs                                                         | Fixed        |
| I-8  | Describe block in test could be an it block                                                                           | Not Valid    |
| I-9  | Consider using `console.warn`                                                                                         | Fixed        |
| I-10 | JS version of `get_price` in tests is slightly different to the `getPrice` implementation in `FriendTechBondingCurve` | Fixed        |
| I-11 | Missing associated parent or Interface contract                                                                       | Acknowledged |
| I-12 | `receive` function does not need to be marked `virtual`                                                               | Not Valid    |
| I-13 | Emit event when `sharesContractAddress` is set in `HoldersRewardsDistributorV1`                                       | Acknowledged |
| I-14 | Possible to pass any nonce to `rewindNonce` function that is greater than the current which would leave gaps          | Not Valid    |
| I-15 | Comment mentions `ROLE_PROTOCOL_FEE_MANAGER` but the values set is for `ROLE_SUBJECT_FEE_MANAGER`                     | Fixed        |
| I-16 | Potentially missing a deployment dependency in `setup-SharesFactory` script.                                          | Acknowledged |
| I-17 | `determineImplementationType` will always return `ImplementationType.ETH` if any other address is passed              | Acknowledged |
| G-1  | Can reuse `sharesSupply` value                                                                                        | Fixed        |
| G-2  | Function call can be avoided by inline code                                                                           | Not Valid    |
| G-3  | Checking issuer address is not address(0) multiple times                                                              | Fixed        |

# Resolution Details #

## M-2. If `owner` (via the Factory `sharesOwnerAddress`) is not set in the shares contract then it's not possible to manage ##
This is by design. We want to be able to switch the shares contract deployment process into non-manageable mode.

## L-1. `ProtocolFeeDistributorV1` contract `updateRecipientsList` function does not check for duplicate recipient address ##
Yes, this is correct. We believe checking the sum of all the recipient shares to be 100% is enough.

## L-2. Check the shares contract type before setting in `HoldersRewardsDistributorV1`  ##
The finding is valid. A simple fix would break many tests however. We have the tests covering factory behaviour
which ensures that the factory cannot do this mistake of deploying different versions of the shares and distributor
contracts and attaching them together.

## L-3. The `RewardSystem` proxy deployment sets the `rewardSystemType` incorrectly ##
This was fixed outside Darren's audit resolution, as part of the Miguel's audit resolution.

## L-4. The `RewardSystem` proxy deployment is missing the ETH `rewardSystemType`. ##
We plan to deploy only one system eventually – either ETH, or ERC20. We will update the deployment script once we chose.

## I-1. Validate the bridge address is trusted before updating role ##
The bridge is set during the deployment and its address is picked from `hardhat.config`, which is assumed to have
the highest trusting authority during the deployment process.

## I-2. Bonding curve price function differs slightly from the FriendTech version ##
Yes, the original function is not defined in (0, 0) and we've fixed that.

## I-5. Naming convention for contract interfaces ##
From the very beginning, we try to stick to JavaScript naming conventions in the areas where explicit naming conventions
for Solidity don't exist.  
The `I` prefix used by OpenZeppelin and many other projects comes from the C/C++/C#/.NET naming conventions, while
we stick to Solidity/JavaScript/Java conventions.

## I-8. Describe block in test could be an it block ##
The `describe` block mentioned contains other `it` blocks inside it and cannot be converted into `it` itself.

## I-10. JS version of `get_price` in tests is slightly different to the `getPrice` implementation in `FriendTechBondingCurve` ##
Fixed outside the Darren's audit resolution (was found and fixed by the team in parallel).

## I-11. Missing associated parent or Interface contract ##
Yes, we stick to the idea of not adding and interface, until it is really required and it becomes hard or inconvenient
to avoid having it.

## I-13. Emit event when `sharesContractAddress` is set in `HoldersRewardsDistributorV1` ##
We do not emit events in constructors and in functions which replace or adjust the constructors.

## I-14. Possible to pass any nonce to `rewindNonce` function that is greater than the current which would leave gaps ##
This is a correct behaviour implied by the function name and its signature. The function allows to discard any number
of previously issued signatures.

## I-12. `receive` function does not need to be marked `virtual` ##
We override the `receive` function in tests, in `MaliciousFeeDistributor`.

## I-16. Potentially missing a deployment dependency in `setup-SharesFactory` script. ##
The finding is correct. Right now the `setup-SharesFactory` script is acts as a placeholder. We will add mentioned
dependency once we release a real factory upgrade.

## I-17. `determineImplementationType` will always return `ImplementationType.ETH` if any other address is passed ##
`determineImplementationType` function is just a hint, it cannot guarantee anything. It is used in event only.  
From the factory point of view the shares contract having different ERC20 address is completely invalid, it is
neither ETH, nor ERC20; but this is not so important at the moment, since the factory is upgradeable we reserve
a possibility to upgrade this function if it becomes important.

## G-2. Function call can be avoided by inline code ##
`pendingReward` function is public and can be used externally, thus cannot be removed/inlined.
