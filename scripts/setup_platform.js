const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const platform = await AfriPropertyPlatform.deployed();
    
    console.log("\n=== AfriProperty Platform Setup ===\n");
    
    const OPERATOR_ROLE = web3.utils.keccak256("OPERATOR_ROLE");
    const VERIFIER_ROLE = web3.utils.keccak256("VERIFIER_ROLE");
    
    console.log("Platform Address:", platform.address);
    console.log("Admin Account:", accounts[0]);
    
    if (accounts.length > 1) {
      console.log("\nGranting roles...");
      await platform.grantRole(OPERATOR_ROLE, accounts[1]);
      console.log("Operator role granted to:", accounts[1]);
      
      await platform.grantRole(VERIFIER_ROLE, accounts[2] || accounts[1]);
      console.log("Verifier role granted to:", accounts[2] || accounts[1]);
    }
    
    const platformFee = await platform.platformFeePercentage();
    const feeCollector = await platform.feeCollector();
    
    console.log("\n=== Configuration ===");
    console.log("Platform Fee:", platformFee.toString(), "basis points (", platformFee / 100, "%)");
    console.log("Fee Collector:", feeCollector);
    
    console.log("\n=== Next Steps ===");
    console.log("1. Create properties: truffle exec scripts/create_property.js");
    console.log("2. Update frontend: REACT_APP_PLATFORM_ADDRESS=" + platform.address);
    console.log("3. Deploy frontend: cd frontend && npm run build");
    
    callback();
  } catch (error) {
    console.error(error);
    callback(error);
  }
};
