const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");

module.exports = async function (deployer, network, accounts) {
  const feeCollector = process.env.FEE_COLLECTOR_ADDRESS || accounts[0];
  
  console.log("Deploying AfriPropertyPlatform...");
  console.log("Network:", network);
  console.log("Fee Collector:", feeCollector);
  
  await deployer.deploy(AfriPropertyPlatform, feeCollector);
  const platform = await AfriPropertyPlatform.deployed();
  
  console.log("AfriPropertyPlatform deployed at:", platform.address);
  
  if (network === "development" || network === "polygon_mumbai") {
    console.log("Setting up roles for", network);
    const OPERATOR_ROLE = web3.utils.keccak256("OPERATOR_ROLE");
    const VERIFIER_ROLE = web3.utils.keccak256("VERIFIER_ROLE");
    
    if (accounts.length > 1) {
      await platform.grantRole(OPERATOR_ROLE, accounts[1]);
      await platform.grantRole(VERIFIER_ROLE, accounts[2] || accounts[1]);
      console.log("Roles granted");
    }
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Platform Address:", platform.address);
  console.log("Platform Fee:", (await platform.platformFeePercentage()).toString(), "basis points");
  console.log("========================\n");
};

