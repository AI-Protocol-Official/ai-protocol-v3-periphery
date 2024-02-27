# Summary #

| ID | Title                                                            | Resolution   |
|----|------------------------------------------------------------------|--------------|
| 1  | Consider accumulating fees instead of transferring directly      | Acknowledged |
| 2  | prefer encodeWithSelector over encodeWithSignature               | Fixed        |
| 3  | receive/fallback functions accept ETH for no apparent reason     | Fixed        |
| 4  | Transfers.transfer may not use enough gas                        | Not Valid    |
| 5  | Merkle root can be arbitrarily changed                           | Acknowledged |
| 6  | receive() accepts funds even after `lastRewardBlock` has expired | Fixed        |
| 7  | fallback usage seems unnecessary                                 | Mitigated    |
| 8  | fees can exceed 100%                                             | Fixed        |

# Resolution Details #

## #1 Consider accumulating fees instead of transferring directly ##
While consideration makes perfect sense, especially on Ethereum, this doesn't align with our business
requirements. The solution is primarily targeting L2 networks like Base.
Ethereum, while still supported, is not a priority.

## #6 receive() accepts funds even after `lastRewardBlock` has expired ##

Naming and soldoc improved to reflect the variable points to a block which is always in the past.
New name is `lastDistributionBlock`.

## #7 fallback usage seems unnecessary ##

The finding is correct. However, we can't eliminate this kind of logic completely – it will still persist in
the ERC20 function `onTransferReceived`, thus we keeping it as is.

Since the data field is parsed, it is unlikely that fallback activates accidentally as the data field
must match the decoding routine.

As a mitigation we've added a validation for the data field length.

## #4 Transfers.transfer may not use enough gas ##
4,900 gas stipend should be enough to log an event and maybe do some simple calculation or static call,
but it should not be enough to modify any storage variable, internally or externally. 

## #5 Merkle root can be arbitrarily changed ##

The finding is correct. The RewardSystem contract is just a frontend for the functionality which happens on the
backend in a centralized way. The contract is there to shift the gas fees to the reward receivers. It doesn't
any significant functionality or decentralization properties.
