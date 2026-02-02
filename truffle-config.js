require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    polygon_mumbai: {
      provider: () => new HDWalletProvider(
        process.env.PRIVATE_KEY || process.env.MNEMONIC,
        `https://rpc-mumbai.maticvigil.com`
      ),
      network_id: 80001,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
      chainId: 80001
    },
    polygon: {
      provider: () => new HDWalletProvider(
        process.env.PRIVATE_KEY || process.env.MNEMONIC,
        `https://polygon-rpc.com`
      ),
      network_id: 137,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true,
      gasPrice: 50000000000,
      chainId: 137
    }
  },
  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  plugins: ['truffle-plugin-verify'],
  api_keys: {
    polygonscan: process.env.POLYGONSCAN_API_KEY
  }
};

