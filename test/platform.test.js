const AfriPropertyPlatform = artifacts.require("AfriPropertyPlatform");
const PropertyToken = artifacts.require("PropertyToken");

contract("AfriPropertyPlatform", (accounts) => {
  let platform;
  const [admin, operator, verifier, investor1, investor2] = accounts;

  beforeEach(async () => {
    platform = await AfriPropertyPlatform.new(admin);
    
    const OPERATOR_ROLE = web3.utils.keccak256("OPERATOR_ROLE");
    const VERIFIER_ROLE = web3.utils.keccak256("VERIFIER_ROLE");
    
    await platform.grantRole(OPERATOR_ROLE, operator);
    await platform.grantRole(VERIFIER_ROLE, verifier);
  });

  describe("Property Creation", () => {
    it("should create a property", async () => {
      const tx = await platform.createProperty(
        "Test Property",
        "Lagos",
        "Nigeria",
        web3.utils.toWei("100000", "ether"),
        10000,
        "QmTest123",
        500,
        { from: operator }
      );

      assert.equal(tx.logs[0].event, "PropertyCreated");
      const property = await platform.getProperty(1);
      assert.equal(property.name, "Test Property");
    });
  });

  describe("Investment", () => {
    let propertyId;

    beforeEach(async () => {
      const tx = await platform.createProperty(
        "Test Property",
        "Lagos",
        "Nigeria",
        web3.utils.toWei("100000", "ether"),
        10000,
        "QmTest123",
        500,
        { from: operator }
      );
      propertyId = tx.logs[0].args.propertyId;
      
      await platform.verifyProperty(propertyId, { from: verifier });
      await platform.activateProperty(propertyId, { from: operator });
    });

    it("should allow token purchase", async () => {
      const tokenPrice = await platform.getTokenPrice(propertyId);
      const tokenAmount = 100;
      const cost = tokenPrice.mul(web3.utils.toBN(tokenAmount))
        .div(web3.utils.toBN(10).pow(web3.utils.toBN(18)));
      const fee = cost.mul(web3.utils.toBN(250)).div(web3.utils.toBN(10000));
      const payment = cost.add(fee);

      await platform.purchaseTokens(propertyId, tokenAmount, {
        from: investor1,
        value: payment
      });

      const property = await platform.getProperty(propertyId);
      const token = await PropertyToken.at(property.tokenContract);
      const balance = await token.balanceOf(investor1);
      
      assert.equal(balance.toString(), tokenAmount.toString());
    });
  });

  describe("Rental Income", () => {
    let propertyId;

    beforeEach(async () => {
      const tx = await platform.createProperty(
        "Test Property",
        "Lagos",
        "Nigeria",
        web3.utils.toWei("100000", "ether"),
        10000,
        "QmTest123",
        500,
        { from: operator }
      );
      propertyId = tx.logs[0].args.propertyId;
      
      await platform.verifyProperty(propertyId, { from: verifier });
      await platform.activateProperty(propertyId, { from: operator });
      
      const tokenPrice = await platform.getTokenPrice(propertyId);
      const tokenAmount = 1000;
      const cost = tokenPrice.mul(web3.utils.toBN(tokenAmount))
        .div(web3.utils.toBN(10).pow(web3.utils.toBN(18)));
      const fee = cost.mul(web3.utils.toBN(250)).div(web3.utils.toBN(10000));
      
      await platform.purchaseTokens(propertyId, tokenAmount, {
        from: investor1,
        value: cost.add(fee)
      });
    });

    it("should distribute and claim rental income", async () => {
      const rentalIncome = web3.utils.toWei("1", "ether");
      
      await platform.distributeRentalIncome(propertyId, {
        from: operator,
        value: rentalIncome
      });

      const balanceBefore = await web3.eth.getBalance(investor1);
      
      const tx = await platform.claimRentalIncome(propertyId, {
        from: investor1
      });

      const balanceAfter = await web3.eth.getBalance(investor1);
      assert(web3.utils.toBN(balanceAfter).gt(web3.utils.toBN(balanceBefore)));
    });
  });
});
