// SPDX-License-Identifier: MIT
// File: contracts/AfriPropertyPlatform.sol
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title PropertyToken
 * @dev ERC20 token representing fractional ownership of a specific property
 */
contract PropertyToken is ERC20, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    uint256 public immutable propertyId;
    uint256 public immutable maxSupply;
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 _propertyId,
        uint256 _maxSupply,
        address admin
    ) ERC20(name, symbol) {
        propertyId = _propertyId;
        maxSupply = _maxSupply;
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }
    
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= maxSupply, "Exceeds max supply");
        _mint(to, amount);
    }
    
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}

/**
 * @title AfriPropertyPlatform
 * @dev Main platform contract for managing real estate tokenization
 */
contract AfriPropertyPlatform is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    
    struct Property {
        uint256 id;
        string name;
        string location;
        string country;
        uint256 totalValue;
        uint256 tokenSupply;
        address tokenContract;
        address owner;
        PropertyStatus status;
        string documentHash;
        uint256 createdAt;
        uint256 rentalYield;
    }
    
    enum PropertyStatus {
        Pending,
        Verified,
        Active,
        Suspended,
        Completed
    }
    
    struct Investment {
        uint256 propertyId;
        address investor;
        uint256 tokenAmount;
        uint256 investmentDate;
        uint256 totalPaid;
    }
    
    uint256 public propertyCounter;
    uint256 public platformFeePercentage = 250;
    address public feeCollector;
    
    mapping(uint256 => Property) public properties;
    mapping(address => uint256[]) public investorProperties;
    mapping(uint256 => Investment[]) public propertyInvestments;
    mapping(uint256 => uint256) public propertyRentalPool;
    
    event PropertyCreated(
        uint256 indexed propertyId,
        string name,
        string country,
        uint256 totalValue,
        address tokenContract
    );
    event PropertyVerified(uint256 indexed propertyId, address verifier);
    event PropertyStatusChanged(uint256 indexed propertyId, PropertyStatus newStatus);
    event TokensPurchased(
        uint256 indexed propertyId,
        address indexed investor,
        uint256 tokenAmount,
        uint256 cost
    );
    event RentalIncomeDistributed(
        uint256 indexed propertyId,
        uint256 totalAmount,
        uint256 timestamp
    );
    event RentalIncomeClaimed(
        uint256 indexed propertyId,
        address indexed investor,
        uint256 amount
    );
    
    constructor(address _feeCollector) {
        require(_feeCollector != address(0), "Invalid fee collector");
        feeCollector = _feeCollector;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }
    
    function createProperty(
        string memory name,
        string memory location,
        string memory country,
        uint256 totalValue,
        uint256 tokenSupply,
        string memory documentHash,
        uint256 rentalYield
    ) external onlyRole(OPERATOR_ROLE) returns (uint256) {
        require(bytes(name).length > 0, "Name required");
        require(totalValue > 0, "Invalid value");
        require(tokenSupply > 0, "Invalid supply");
        require(rentalYield <= 10000, "Yield too high");
        
        propertyCounter++;
        uint256 propertyId = propertyCounter;
        
        PropertyToken token = new PropertyToken(
            string(abi.encodePacked("AfriProperty ", name)),
            string(abi.encodePacked("AFP", _uint2str(propertyId))),
            propertyId,
            tokenSupply,
            address(this)
        );
        
        properties[propertyId] = Property({
            id: propertyId,
            name: name,
            location: location,
            country: country,
            totalValue: totalValue,
            tokenSupply: tokenSupply,
            tokenContract: address(token),
            owner: msg.sender,
            status: PropertyStatus.Pending,
            documentHash: documentHash,
            createdAt: block.timestamp,
            rentalYield: rentalYield
        });
        
        emit PropertyCreated(propertyId, name, country, totalValue, address(token));
        return propertyId;
    }
    
    function verifyProperty(uint256 propertyId) external onlyRole(VERIFIER_ROLE) {
        Property storage property = properties[propertyId];
        require(property.id != 0, "Property not found");
        require(property.status == PropertyStatus.Pending, "Already verified");
        
        property.status = PropertyStatus.Verified;
        emit PropertyVerified(propertyId, msg.sender);
    }
    
    function activateProperty(uint256 propertyId) external onlyRole(OPERATOR_ROLE) {
        Property storage property = properties[propertyId];
        require(property.status == PropertyStatus.Verified, "Not verified");
        
        property.status = PropertyStatus.Active;
        emit PropertyStatusChanged(propertyId, PropertyStatus.Active);
    }
    
    function purchaseTokens(uint256 propertyId, uint256 tokenAmount) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
    {
        Property storage property = properties[propertyId];
        require(property.status == PropertyStatus.Active, "Property not active");
        
        uint256 tokenPrice = (property.totalValue * 1e18) / property.tokenSupply;
        uint256 totalCost = (tokenPrice * tokenAmount) / 1e18;
        uint256 platformFee = (totalCost * platformFeePercentage) / 10000;
        uint256 totalRequired = totalCost + platformFee;
        
        require(msg.value >= totalRequired, "Insufficient payment");
        
        PropertyToken token = PropertyToken(property.tokenContract);
        token.mint(msg.sender, tokenAmount);
        
        Investment memory investment = Investment({
            propertyId: propertyId,
            investor: msg.sender,
            tokenAmount: tokenAmount,
            investmentDate: block.timestamp,
            totalPaid: msg.value
        });
        
        propertyInvestments[propertyId].push(investment);
        investorProperties[msg.sender].push(propertyId);
        
        payable(property.owner).transfer(totalCost);
        payable(feeCollector).transfer(platformFee);
        
        if (msg.value > totalRequired) {
            payable(msg.sender).transfer(msg.value - totalRequired);
        }
        
        emit TokensPurchased(propertyId, msg.sender, tokenAmount, totalCost);
    }
    
    function distributeRentalIncome(uint256 propertyId) 
        external 
        payable 
        onlyRole(OPERATOR_ROLE) 
    {
        Property storage property = properties[propertyId];
        require(property.status == PropertyStatus.Active, "Property not active");
        require(msg.value > 0, "No income to distribute");
        
        propertyRentalPool[propertyId] += msg.value;
        emit RentalIncomeDistributed(propertyId, msg.value, block.timestamp);
    }
    
    function claimRentalIncome(uint256 propertyId) external nonReentrant {
        Property storage property = properties[propertyId];
        require(property.status == PropertyStatus.Active, "Property not active");
        
        PropertyToken token = PropertyToken(property.tokenContract);
        uint256 investorBalance = token.balanceOf(msg.sender);
        require(investorBalance > 0, "No tokens owned");
        
        uint256 totalPool = propertyRentalPool[propertyId];
        require(totalPool > 0, "No rental income");
        
        uint256 investorShare = (totalPool * investorBalance) / token.totalSupply();
        require(investorShare > 0, "No income to claim");
        
        propertyRentalPool[propertyId] -= investorShare;
        payable(msg.sender).transfer(investorShare);
        
        emit RentalIncomeClaimed(propertyId, msg.sender, investorShare);
    }
    
    function getProperty(uint256 propertyId) 
        external 
        view 
        returns (Property memory) 
    {
        return properties[propertyId];
    }
    
    function getInvestorProperties(address investor) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return investorProperties[investor];
    }
    
    function getTokenPrice(uint256 propertyId) external view returns (uint256) {
        Property storage property = properties[propertyId];
        require(property.id != 0, "Property not found");
        return (property.totalValue * 1e18) / property.tokenSupply;
    }
    
    function setPlatformFee(uint256 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFee <= 1000, "Fee too high");
        platformFeePercentage = newFee;
    }
    
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}


