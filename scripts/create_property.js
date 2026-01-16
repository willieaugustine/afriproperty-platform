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
      totalValue: web3.utils.toWei("500000", "ether"),
      tokenSupply: 100000,
      documentHash: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
      rentalYield: 800
    };
    
    const tx = await platform.createProperty(
      propertyData.name,
      propertyData.location,
      propertyData.country,
      propertyData.totalValue,
      propertyData.tokenSupply,
      propertyData.documentHash,
      propertyData.rentalYield,
      { from: accounts[1] }
    );
    
    const propertyId = tx.logs[0].args.propertyId.toString();
    console.log("Property created with ID:", propertyId);
    console.log("Token contract:", tx.logs[0].args.tokenContract);
    
    await platform.verifyProperty(propertyId, { from: accounts[2] || accounts[0] });
    console.log("Property verified");
    
    await platform.activateProperty(propertyId, { from: accounts[1] });
    console.log("Property activated and ready for investment");
    
    callback();
  } catch (error) {
    console.error(error);
    callback(error);
  }
};
