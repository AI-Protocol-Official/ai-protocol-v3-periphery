# Summary #

| ID | Title                                             | Resolution   |
|----|---------------------------------------------------|--------------|
| 1  | Insufficient Upper Bounds Check on Fee Percentage | Fixed        |
| 2  | Inconsistent Interdependency Between Variables    | Fixed        |
| 3  | Deprecated Usage of Native Transfers              | Mitigated    |
| 4  | Unsafe Method For ERC20 Token Transfer            | Acknowledged |
| 5  | Unsafe External Calls Can Allow Reentrancy        | Not Valid    |

# Resolution Details #

## #1 Insufficient Upper Bounds Check on Fee Percentage ##
Fixed outside ImmuneBytes audit resolution, as part of the Miguel's audit resolution.

## #2 Inconsistent Interdependency Between Variables ##
Fixed as part of the #1 fix: the function to update all the fees altogether was added.

## #3 Deprecated Usage of Native Transfers ##
The finding is correct. However we take the risk of reentrancies here more seriously than the risk of failed transfers.
We have also mitigated this issue by increasing the gas limit from 2300 to 4900.

## #4 Unsafe Method For ERC20 Token Transfer ##
This can be indeed an issue when copy pasting the code into other projects which use other ERC20 implementations.
We do distinguish, however, from the very beginning, _our_ implementation (ALI ERC20 token) and all other
implementations and use the SafeERC20 library only for "foreign" implementations.

## #5 Unsafe External Calls Can Allow Reentrancy ##
According to OZ documentation, the `ReentrancyGuard` is a _mitigation_ instrument.
Therefore our approach is to try avoiding using it not to fall into a false impression of reentrancy safety.
We try to stick to CEI pattern wherever is possible, or, if it is not possible, limit the gas supplied so that
no storage modification can be made in the external code.
