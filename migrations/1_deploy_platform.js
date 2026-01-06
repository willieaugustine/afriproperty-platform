// migrations/1_deploy_platform.js
const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");

module.exports = async function (deployer, network, accounts) {
  const feeCollector = accounts[0]; // Use first account as fee collector
  
  console.log("Deploying AfriPropertyPlatform...");
  console.log("Network:", network);
  console.log("Fee Collector:", feeCollector);
  
  await deployer.deploy(AfriPropertyPlatform, feeCollector);
  const platform = await AfriPropertyPlatform.deployed();
  
  console.log("AfriPropertyPlatform deployed at:", platform.address);
  
  // Grant roles for testing (in production, use multi-sig)
  if (network === "development" || network === "testnet") {
    console.log("Setting up roles for development...");
    const OPERATOR_ROLE = web3.utils.keccak256("OPERATOR_ROLE");
    const VERIFIER_ROLE = web3.utils.keccak256("VERIFIER_ROLE");
    
    await platform.grantRole(OPERATOR_ROLE, accounts[1]);
    await platform.grantRole(VERIFIER_ROLE, accounts[2]);
    
    console.log("Operator role granted to:", accounts[1]);
    console.log("Verifier role granted to:", accounts[2]);
  }
  
  console.log("\n=== Deployment Summary ===");
  console.log("Platform Address:", platform.address);
  console.log("Platform Fee:", (await platform.platformFeePercentage()).toString(), "basis points");
  console.log("========================\n");
};

// scripts/create_property.js
const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const platform = await AfriPropertyPlatform.deployed();
    
    console.log("Creating sample property...");
    
    const propertyData = {
      name: "Nairobi Commercial Plaza",
      location: "Westlands, Nairobi",
      country: "Kenya",
      totalValue: web3.utils.toWei("500000", "ether"), // $500,000 in wei equivalent
      tokenSupply: 100000, // 100,000 tokens
      documentHash: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", // Sample IPFS hash
      rentalYield: 800 // 8% annual yield
    };
    
    const tx = await platform.createProperty(
      propertyData.name,
      propertyData.location,
      propertyData.country,
      propertyData.totalValue,
      propertyData.tokenSupply,
      propertyData.documentHash,
      propertyData.rentalYield,
      { from: accounts[1] } // Operator account
    );
    
    const propertyId = tx.logs[0].args.propertyId.toString();
    console.log("Property created with ID:", propertyId);
    console.log("Token contract:", tx.logs[0].args.tokenContract);
    
    // Verify the property
    await platform.verifyProperty(propertyId, { from: accounts[2] }); // Verifier account
    console.log("Property verified");
    
    // Activate the property
    await platform.activateProperty(propertyId, { from: accounts[1] }); // Operator account
    console.log("Property activated and ready for investment");
    
    callback();
  } catch (error) {
    console.error(error);
    callback(error);
  }
};

// scripts/invest.js
const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");
const PropertyToken = artifacts.require("PropertyToken");

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const platform = await AfriPropertyPlatform.deployed();
    
    const propertyId = 1; // First property
    const tokenAmount = 1000; // Buy 1000 tokens (1% of supply)
    
    // Get property details
    const property = await platform.getProperty(propertyId);
    console.log("Property:", property.name);
    console.log("Total Value:", web3.utils.fromWei(property.totalValue, "ether"));
    console.log("Token Supply:", property.tokenSupply.toString());
    
    // Calculate cost
    const tokenPrice = await platform.getTokenPrice(propertyId);
    const totalCost = tokenPrice.mul(web3.utils.toBN(tokenAmount)).div(web3.utils.toBN(10).pow(web3.utils.toBN(18)));
    const platformFee = await platform.platformFeePercentage();
    const fee = totalCost.mul(platformFee).div(web3.utils.toBN(10000));
    const totalPayment = totalCost.add(fee);
    
    console.log("\nInvestment Details:");
    console.log("Tokens to purchase:", tokenAmount);
    console.log("Cost:", web3.utils.fromWei(totalCost, "ether"), "ETH");
    console.log("Platform fee:", web3.utils.fromWei(fee, "ether"), "ETH");
    console.log("Total payment:", web3.utils.fromWei(totalPayment, "ether"), "ETH");
    
    // Purchase tokens
    console.log("\nPurchasing tokens...");
    await platform.purchaseTokens(propertyId, tokenAmount, {
      from: accounts[3],
      value: totalPayment
    });
    
    console.log("Tokens purchased successfully!");
    
    // Check balance
    const tokenContract = await PropertyToken.at(property.tokenContract);
    const balance = await tokenContract.balanceOf(accounts[3]);
    console.log("Investor token balance:", balance.toString());
    
    callback();
  } catch (error) {
    console.error(error);
    callback(error);
  }
};

// scripts/distribute_rental.js
const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");

module.exports = async function(callback) {
  try {
    const accounts = await web3.eth.getAccounts();
    const platform = await AfriPropertyPlatform.deployed();
    
    const propertyId = 1;
    const rentalIncome = web3.utils.toWei("10", "ether"); // $10,000 monthly rental
    
    console.log("Distributing rental income for property", propertyId);
    console.log("Amount:", web3.utils.fromWei(rentalIncome, "ether"), "ETH");
    
    await platform.distributeRentalIncome(propertyId, {
      from: accounts[1], // Operator
      value: rentalIncome
    });
    
    console.log("Rental income distributed successfully!");
    
    // Check rental pool
    const pool = await platform.propertyRentalPool(propertyId);
    console.log("Current rental pool:", web3.utils.fromWei(pool, "ether"), "ETH");
    
    callback();
  } catch (error) {
    console.error(error);
    callback(error);
  }
};
