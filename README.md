# AI Protocol Protocol #
Version 3.0.1

This repo contains AI Protocol ERC20 Token (ALI) v2, Personality Pod ERC721 token, Intelligent Token (iNFT) v2,
iNFT Linker, and other helper smart contracts powering the AI Protocol iNFT Protocol.

The project is built using
* [Hardhat](https://hardhat.org/), a popular Ethereum development environment,
* [Web3.js](https://web3js.readthedocs.io/), a collection of libraries that allows interacting with
local or remote Ethereum node using HTTP, IPC or WebSocket, and
* [Truffle](https://www.trufflesuite.com/truffle), a popular development framework for Ethereum.

Smart contracts deployment is configured to use [Infura](https://infura.io/)
and [HD Wallet](https://www.npmjs.com/package/@truffle/hdwallet-provider)

## Repository Description ##
What's inside?

* [AI Protocol Protocol On-chain Architecture](docs/AI%20Protocol%20On-chain%20Architecture.pdf), containing
   * Protocol Overview
   * Access Control Technical Design
   * ERC20 Shares Technical Design

* Keys contracts
  * Smart Contract(s):
    * [ERC20](contracts/bonding_curves/ERC20Shares.sol) - ERC20 implementation
    * [ETH](contracts/bonding_curves/ETHShares.sol) - ETH implementation
    * Abstract implementation
      * [AbstractShares](contracts/bonding_curves/AbstractShares.sol) 
    * Libraries
      * [TypedStructLib](contracts/bonding_curves/TypedStructLib.sol)
      * [SharesSubjectLib](contracts/bonding_curves/SharesSubjectLib.sol)
    * Interfaces
      * [BondingCurve](contracts/bonding_curves/BondingCurve.sol)
      * [TradeableShares](contracts/bonding_curves/TradeableShares.sol)
    * Test(s):
      * Functional Requirements
        * [shares_ERC20](test/bonding_curves/shares_ERC20.js)
        * [shares_ETH](test/bonding_curves/shares_ETH.js)
        * [buy_sell_sim_ERC20](test/bonding_curves/buy_sell_sim_ERC20.js)
        * [buy_sell_sim_ETH](test/bonding_curves/buy_sell_sim_ETH.js)
      * Non-functional Requirements
        * [gas_usage_shares_ERC20](test/bonding_curves/gas_usage_shares_ERC20.js)
        * [gas_usage_shares_ETH](test/bonding_curves/gas_usage_shares_ETH.js)

* SharesFactory factory contract to deploy keys contracts
  * Smart Contract(s):
    * [SharesFactory](contracts/bonding_curves//SharesFactoryV1.sol) - Shares Factory implementation
    * Interfaces
      * [SharesFactory](contracts/bonding_curves/SharesFactory.sol)
  * Test(s):
    * Functional Requirements
      * [factory](test/bonding_curves/factory.js)
      * [factory_shares_ERC20](test/bonding_curves/factory_shares_ERC20.js)
      * [factory_shares_ETH](test/bonding_curves/factory_shares_ETH.js)
    * Non-functional Requirements
      * [gas_usage_factory_shares_ERC20](test/bonding_curves/gas_usage_shares_ERC20.js)
      * [gas_usage_factory_shares_ETH](test/bonding_curves/gas_usage_shares_ETH.js)

* Holders Rewards Distributor used by keys contracts
  * Smart Contract(s):
    * [HoldersRewardsDistributor](contracts/bonding_curves/HoldersRewardsDistributorV1.sol) - Holders Rewards Distributor implementation
    * Interfaces
      * [HoldersRewardsDistributor](contracts/bonding_curves/HoldersRewardsDistributor.sol)
  * Test(s):
    * Functional Requirements
      * [holder_reward_distributor](test/bonding_curves/holder_reward_distributor.js)

* Protocol Fee Distributor
  * Smart Contract(s):
    * [ProtocolFeeDistributor](contracts/bonding_curves/ProtocolFeeDistributorV1.sol)
  * Test(s)
    * Functional Requirements
      * [protocol_fee_distributor](test/bonding_curves/protocol_fee_distributor.js)

* Reward System
  * Smart Contract(s):
    * [RewardSystem](contracts/bonding_curves/RewardSystem.sol)
  * Test(s):
    * Functional Requirements
      * [reward_system](test/bonding_curves/reward_system.js)

* Deployment Script(s)
   * [v3_0/*](deploy/v3_0) – deployment and configuration scripts for v3.0 / v3.0.1 releases,
     including bonding curves a.k.a. tradeable shares, trading fees distributors, leaderboard reward system
* Audits:
   * v3.0.x:
     * v3.0.x by Darren
       * [initial audit](docs/audits/v3_0/v3_0_darren.pdf)
       * [resolution](docs/audits/v3_0/v3_0_darren_resolution.md)
       * [final audit](docs/audits/v3_0/v3_0_darren_v1_1.pdf)
     * v3.0.x by ImmuneBytes
       * [initial audit](docs/audits/v3_0/v3_0_ibytes.pdf)
       * [resolution](docs/audits/v3_0/v3_0_ibytes_resolution.md)
       * [final audit](docs/audits/v3_0/v3_0_ibytes_final.pdf)
     * v3.0.x by Miguel Palhas:
       * [initial audit](docs/audits/v3_0/v3_0_miguel.pdf)
       * [resolution](docs/audits/v3_0/v3_0_miguel_resolution.md)

## Installation ##

Following steps were tested to work in macOS Catalina

1. Clone the repository  
   ```git clone git@github.com:AI ProtocolAI/AI Protocol-contracts.git```
2. Navigate into the cloned repository  
   ```cd AI Protocol-contracts```
3. Install [Node Version Manager (nvm)](https://github.com/nvm-sh/nvm) – latest  
   ```brew install nvm```
4. Install [Node package manager (npm)](https://www.npmjs.com/) and [Node.js](https://nodejs.org/) – version 16  
   ```nvm install 16```
5. Activate node version installed  
   ```nvm use 16```
6. Install project dependencies  
   ```npm install```

### Troubleshooting ###
* After executing ```nvm use 16``` I get  
   ```
   nvm is not compatible with the npm config "prefix" option: currently set to "/usr/local/Cellar/nvm/0.35.3/versions/node/v16.4.0"
   Run `npm config delete prefix` or `nvm use --delete-prefix v16.4.0` to unset it.
   ```
   Fix:  
   ```
   nvm use --delete-prefix v16.4.0
   npm config delete prefix
   npm config set prefix "/usr/local/Cellar/nvm/0.37.2/versions/node/v16.4.0"
   ```
* After executing ```npm install``` I get
   ```
   npm ERR! code 127
   npm ERR! path ./AI Protocol-contracts/node_modules/utf-8-validate
   npm ERR! command failed
   npm ERR! command sh -c node-gyp-build
   npm ERR! sh: node-gyp-build: command not found
   
   npm ERR! A complete log of this run can be found in:
   npm ERR!     ~/.npm/_logs/2021-08-30T07_10_23_362Z-debug.log
   ```
   Fix:  
   ```
   npm install -g node-gyp
   npm install -g node-gyp-build
   ```

### Notes on Ubuntu 20.04 LTS ###
- [How to install Node.js 16 on Ubuntu 20.04 LTS](https://joshtronic.com/2021/05/09/how-to-install-nodejs-16-on-ubuntu-2004-lts/)
- [How to Run Linux Commands in Background](https://linuxize.com/post/how-to-run-linux-commands-in-background/)

## Configuration ##
1. Create or import 12-word mnemonics for
   1. Mainnet
   2. Goerli
   3. Polygon
   4. Mumbai (Polygon Testnet)
   5. Binance Smart Chain (BSC) Mainnet
   6. BSC Testnet
   7. opBNB
   8. opBNB Testnet
   9. Base Mainnet
   10. Base Goerli (Testnet)

   You can use MetaMask to create mnemonics: https://metamask.io/

   Note: you can use same mnemonic for test networks (ropsten, rinkeby and kovan).
   Always use a separate one for mainnet, keep it secure.

   Note: you can add more configurations to connect to the networks not listed above.
   Check and add configurations required into the [hardhat.config.js](hardhat.config.js).

   Note: you can use private keys instead of mnemonics (see Alternative Configuration section below)

2. Create an infura access key at https://infura.io/

   Note: you can use alchemy API key instead of infura access key (see Alternative Configuration section below)

3. Create etherscan API key at https://etherscan.io/

4. Export mnemonics, infura access key, and etherscan API key as system environment variables
   (they should be available for hardhat):

   | Name          | Value                  |
   |---------------|------------------------|
   | MNEMONIC1     | Mainnet mnemonic       |
   | MNEMONIC5     | Goerli mnemonic        |
   | MNEMONIC137   | Polygon mnemonic       |
   | MNEMONIC80001 | Mumbai mnemonic        |
   | MNEMONIC56    | BSC mnemonic           |
   | MNEMONIC97    | BSC Testnet mnemonic   |
   | MNEMONIC204   | opBNB mnemonic         |
   | MNEMONIC5611  | opBNB Testnet mnemonic |
   | MNEMONIC8453  | Base Mainnet mnemonic  |
   | MNEMONIC84531 | Base Goerli mnemonic   |
   | INFURA_KEY    | Infura access key      |
   | ETHERSCAN_KEY | Etherscan API key      |
   | POLYSCAN_KEY  | PolygonScan API key    |
   | BSCSCAN_KEY   | BscSca API key         |
   | BASESCAN_KEY  | BaseScan API key       |

Note:  
Read [How do I set an environment variable?](https://www.schrodinger.com/kb/1842) article for more info on how to
set up environment variables in Linux, Windows and macOS.

### Example Script: macOS Catalina ###
```
export MNEMONIC1="slush oyster cash hotel choice universe puzzle slot reflect sword intact fat"
export MNEMONIC5="result mom hard lend adapt where result mule address ivory excuse embody"
export MNEMONIC137="slush oyster cash hotel choice universe puzzle slot reflect sword intact fat"
export MNEMONIC80001="result mom hard lend adapt where result mule address ivory excuse embody"
export MNEMONIC56="slush oyster cash hotel choice universe puzzle slot reflect sword intact fat"
export MNEMONIC97="result mom hard lend adapt where result mule address ivory excuse embody"
export MNEMONIC204="slush oyster cash hotel choice universe puzzle slot reflect sword intact fat"
export MNEMONIC5611="result mom hard lend adapt where result mule address ivory excuse embody"
export MNEMONIC8453="slush oyster cash hotel choice universe puzzle slot reflect sword intact fat"
export MNEMONIC84531="result mom hard lend adapt where result mule address ivory excuse embody"
export INFURA_KEY="000ba27dfb1b3663aadfc74c3ab092ae"
export ETHERSCAN_KEY="9GEEN6VPKUR7O6ZFBJEKCWSK49YGMPUBBG"
export POLYSCAN_KEY=8HRLD3CMYTN5E4XGAFWPSQMJ69ZHLUECAG
export BSCSCAN_KEY=5DSKF2BNWVM8F7RCDEJTXQLK48SHFMECBD
export BASESAN_KEY=3QWJF4ZLXUH9A5YDCEVTSNRK27ZGQOECDE
```

## Alternative Configuration: Using Private Keys instead of Mnemonics, and Alchemy instead if Infura ##
Alternatively to using mnemonics, private keys can be used instead.
When both mnemonics and private keys are set in the environment variables, private keys are used.

Similarly, alchemy can be used instead of infura.
If both infura and alchemy keys are set, alchemy is used.

1. Create or import private keys of the accounts for
   1. Mainnet
   2. Goerli
   3. Polygon
   4. Mumbai (Polygon Testnet)
   5. Binance Smart Chain (BSC) Mainnet
   6. BSC Testnet
   7. opBNB
   8. opBNB Testnet
   9. Base Mainnet
   10. Base Goerli (Testnet)

   You can use MetaMask to export private keys: https://metamask.io/

   Note: you can use the same private key for test networks (ropsten, rinkeby and kovan).
   Always use a separate one for mainnet, keep it secure.

2. Create an alchemy API key at https://alchemy.com/

3. Create etherscan API key at https://etherscan.io/

4. Export private keys, infura access key, and etherscan API key as system environment variables
   (they should be available for hardhat):

   | Name          | Value                     |
   |---------------|---------------------------|
   | P_KEY1        | Mainnet private key       |
   | P_KEY5        | Goerli private key        |
   | P_KEY137      | Polygon private key       |
   | P_KEY80001    | Mumbai private key        |
   | P_KEY56       | BSC private key           |
   | P_KEY97       | BSC Testnet private key   |
   | P_KEY204      | opBNB private key         |
   | P_KEY5611     | opBNB Testnet private key |
   | P_KEY8453     | Base Mainnet private key  |
   | P_KEY84531    | Base Goerli private key   |
   | ALCHEMY_KEY   | Alchemy API key           |
   | ETHERSCAN_KEY | Etherscan API key         |
   | POLYSCAN_KEY  | PolygonScan API key       |
   | BSCSCAN_KEY   | BscSca API key            |
   | BASESCAN_KEY  | BaseScan API key          |

Note: private keys should start with ```0x```

### Example Script: macOS Catalina ###
```
export P_KEY1="0x5ed21858f273023c7fc0683a1e853ec38636553203e531a79d677cb39b3d85ad"
export P_KEY5="0xfb84b845b8ea672939f5f6c9a43b2ae53b3ee5eb8480a4bfc5ceeefa459bf20c"
export P_KEY137="0x5ed21858f273023c7fc0683a1e853ec38636553203e531a79d677cb39b3d85ad"
export P_KEY80001="0xfb84b845b8ea672939f5f6c9a43b2ae53b3ee5eb8480a4bfc5ceeefa459bf20c"
export P_KEY56="0x5ed21858f273023c7fc0683a1e853ec38636553203e531a79d677cb39b3d85ad"
export P_KEY97="0xfb84b845b8ea672939f5f6c9a43b2ae53b3ee5eb8480a4bfc5ceeefa459bf20c"
export P_KEY204="0x5ed21858f273023c7fc0683a1e853ec38636553203e531a79d677cb39b3d85ad"
export P_KEY5611="0xfb84b845b8ea672939f5f6c9a43b2ae53b3ee5eb8480a4bfc5ceeefa459bf20c"
export P_KEY8453="0x5ed21858f273023c7fc0683a1e853ec38636553203e531a79d677cb39b3d85ad"
export P_KEY84531="0xfb84b845b8ea672939f5f6c9a43b2ae53b3ee5eb8480a4bfc5ceeefa459bf20c"
export ALCHEMY_KEY="hLe1XqWAUlvmlW42Ka5fdgbpb97ENsMJ"
export ETHERSCAN_KEY="9GEEN6VPKUR7O6ZFBJEKCWSK49YGMPUBBG"
export POLYSCAN_KEY="8HRLD3CMYTN5E4XGAFWPSQMJ69ZHLUECAG"
export BSCSCAN_KEY="5DSKF2BNWVM8F7RCDEJTXQLK48SHFMECBD"
export BASESAN_KEY="3QWJF4ZLXUH9A5YDCEVTSNRK27ZGQOECDE"
```

## Using Custom JSON-RPC Endpoint URL ##
To use custom JSON-RPC endpoint instead of infura/alchemy public endpoints, set the corresponding RPC URL as
an environment variable:

| Name                   | Value                               |
|------------------------|-------------------------------------|
| MAINNET_RPC_URL        | Mainnet JSON-RPC endpoint URL       |
| GOERLI_RPC_URL         | Goerli JSON-RPC endpoint URL        |
| POLYGON_RPC_URL        | Polygon JSON-RPC endpoint URL       |
| MUMBAI_RPC_URL         | Mumbai JSON-RPC endpoint URL        |
| BSC_RPC_URL            | BSC JSON-RPC endpoint URL           |
| BSC_TESTNET_RPC_URL    | BSC Testnet JSON-RPC endpoint URL   |
| OP_BNB_RPC_URL         | OpBNB JSON-RPC endpoint URL         |
| OP_BNB_TESTNET_RPC_URL | OpBNB Testnet JSON-RPC endpoint URL |
| BASE_RPC_URL           | Base JSON-RPC endpoint URL          |
| BASE_GOERLI_RPC_URL    | Base Goerli JSON-RPC endpoint URL   |

## Compilation ##
Execute ```npx hardhat compile``` command to compile smart contracts.

Compilation settings are defined in [hardhat.config.js](./hardhat.config.js) ```solidity``` section.

Note: Solidity files *.sol use strict compiler version, you need to change all the headers when upgrading the
compiler to another version 

## Testing ##
Smart contract tests are built with Truffle – in JavaScript (ES6) and [web3.js](https://web3js.readthedocs.io/)

The tests are located in [test](./test) folder. 
They can be run with built-in [Hardhat Network](https://hardhat.org/hardhat-network/).


## Test Coverage ##
Smart contracts test coverage is powered by [solidity-coverage] plugin.

Run `npx hardhat coverage` to run test coverage and generate the report.

### Troubleshooting ###
* After running the coverage I get
   ```
   <--- Last few GCs --->

   [48106:0x7f9b09900000]  3878743 ms: Scavenge 3619.3 (4127.7) -> 3606.1 (4128.2) MB, 5.2 / 0.0 ms  (average mu = 0.262, current mu = 0.138) task
   [48106:0x7f9b09900000]  3878865 ms: Scavenge 3620.6 (4128.2) -> 3606.9 (4129.2) MB, 4.9 / 0.0 ms  (average mu = 0.262, current mu = 0.138) allocation failure
   [48106:0x7f9b09900000]  3882122 ms: Mark-sweep 3619.5 (4129.2) -> 3579.6 (4128.4) MB, 3221.6 / 0.7 ms  (average mu = 0.372, current mu = 0.447) task scavenge might not succeed


   <--- JS stacktrace --->

   FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
    1: 0x10610e065 node::Abort() (.cold.1) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    2: 0x104dabc19 node::Abort() [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    3: 0x104dabd8f node::OnFatalError(char const*, char const*) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    4: 0x104f29ef7 v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*, bool) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    5: 0x104f29e93 v8::internal::V8::FatalProcessOutOfMemory(v8::internal::Isolate*, char const*, bool) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    6: 0x1050f8be5 v8::internal::Heap::FatalProcessOutOfMemory(char const*) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    7: 0x1050fccb6 v8::internal::Heap::RecomputeLimits(v8::internal::GarbageCollector) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    8: 0x1050f94f6 v8::internal::Heap::PerformGarbageCollection(v8::internal::GarbageCollector, v8::GCCallbackFlags) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
    9: 0x1050f6c4d v8::internal::Heap::CollectGarbage(v8::internal::AllocationSpace, v8::internal::GarbageCollectionReason, v8::GCCallbackFlags) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
   10: 0x105103dca v8::internal::Heap::AllocateRawWithLightRetrySlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
   11: 0x105103e51 v8::internal::Heap::AllocateRawWithRetryOrFailSlowPath(int, v8::internal::AllocationType, v8::internal::AllocationOrigin, v8::internal::AllocationAlignment) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
   12: 0x1050d425c v8::internal::Factory::NewFillerObject(int, bool, v8::internal::AllocationType, v8::internal::AllocationOrigin) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
   13: 0x10546fe0f v8::internal::Runtime_AllocateInYoungGeneration(int, unsigned long*, v8::internal::Isolate*) [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
   14: 0x105839d19 Builtins_CEntry_Return1_DontSaveFPRegs_ArgvOnStack_NoBuiltinExit [/usr/local/opt/nvm/versions/node/v16.4.0/bin/node]
   Abort trap: 6
   ```

   Fix: increase Node.js memory limit to 8 GB:
   ```
   export NODE_OPTIONS="--max-old-space-size=8192"
   ```

## Deployment ##
Deployments are implemented via [hardhat-deploy plugin](https://github.com/wighawag/hardhat-deploy) by Ronan Sandford.

Deployment scripts perform smart contracts deployment itself and their setup configuration.
Executing a script may require several transactions to complete, which may fail. To help troubleshoot
partially finished deployment, the scripts are designed to be rerunnable and execute only the transactions
which were not executed in previous run(s).

Deployment scripts are located under [deploy](./deploy) folder.
Deployment execution state is saved under [deployments](./deployments) folder.

To run fresh deployment (goerli):

1. Delete [deployments/goerli](./deployments/goerli) folder contents.

2. Run the deployment of interest with the ```npx hardhat deploy``` command
   ```
   npx hardhat deploy --network goerli --tags v2_5_deploy
   ```
   where ```v2_5_deploy``` specifies the deployment script tag to run,
   and ```--network goerli``` specifies the network to run script for
   (see [hardhat.config.js](./hardhat.config.js) for network definitions).

3. Verify source code on Etherscan with the ```npx hardhat verify``` command
   ```
   npx hardhat verify --network goerli
   ```

4. Enable the roles (see Access Control) required by the protocol
   ```
   npx hardhat deploy --network goerli --tags v2_5_roles
   ```
   Note: this step can be done via Etherscan UI manually

5. Enable the features (see Access Control) required by the protocol
   ```
   npx hardhat deploy --network goerli --tags v2_5_features
   ```
   Note: this step can be done via Etherscan UI manually

To rerun the deployment script and continue partially completed script skip the first step
(do not cleanup the [deployments](./deployments) folder).

## Connecting to the Live Infrastructure ##
The core of the iNFT protocol is permissionless, meaning it is possible for developers to create their own
interfaces to interact with the protocol.

### ALI ERC20 Token (Artificial Liquid Intelligence ERC20 Token) ###
| Network          | Address                                      |
|------------------|----------------------------------------------|
| Ethereum Mainnet | `0x6B0b3a982b4634aC68dD83a4DBF02311cE324181` |
| Polygon Mainnet  | `0xbfc70507384047aa74c29cdc8c5cb88d0f7213ac` |
| BNB Mainnet      | `0xfcCF7b2caEE328A02042Ac19f1B3970Ca683E806` |
| Base Mainnet     | `0x97c806e7665d3AFd84A8Fe1837921403D59F3Dcc` |

### iNFT Protocol: Ethereum Mainnet ###
| Contract         | Ethereum Mainnet Address                     |
|------------------|----------------------------------------------|
| AI Pod ERC721    | `0xDd70AF84BA86F29bf437756B655110D134b5651C` |
| iNFT             | `0xa189121eE045AEAA8DA80b72F7a1132e3B216237` |
| iNFT Linker      | `0xB9F02FC926b2ab66CAdd6eA1Ee90FB0D8698790b` |

`iNFT` contract locks the AI Pod, "attaching" it to the target NFT. `iNFT` contract is available for reading only,
writing interaction (creation of iNFT record) is possible via `iNFT Linker` helper contract.

### DPT<sup>1</sup> Protocol ###
| Contract      | Base Mainnet Address                         |
|---------------|----------------------------------------------|
| Curve Factory | `0xe5Df7751D1d6EE72856728526963A271b4405123` |
| DPT ERC721    | `0x87a841FEd39A6B8A257aD1dF1dC50B7A2Cb3d234` |
| Leaderboard   | `0x17554551c72501619Ebc56d41c3A229eD59eE049` |

<sup>1)</sup> Decentralized Pre-Trained Transformers

(c) 2021-2024 [AI Protocol AI](https://AI Protocol.ai/)
