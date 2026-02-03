// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import './App.css';

// Import contract ABIs (you'll generate these after compiling)
import PlatformABI from './contracts/AfriPropertyPlatform.json';
import TokenABI from './contracts/PropertyToken.json';

const PLATFORM_ADDRESS = process.env.REACT_APP_PLATFORM_ADDRESS || '0x...';

function App() {
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState('');
  const [platform, setPlatform] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [activeTab, setActiveTab] = useState('explore');
  const [tokenAmount, setTokenAmount] = useState(100);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, []);

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      setAccount('');
    } else {
      setAccount(accounts[0]);
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const web3Instance = new Web3(window.ethereum);
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const accounts = await web3Instance.eth.getAccounts();
        
        setWeb3(web3Instance);
        setAccount(accounts[0]);

        const platformContract = new web3Instance.eth.Contract(
          PlatformABI.abi,
          PLATFORM_ADDRESS
        );
        setPlatform(platformContract);
        
        await loadProperties(platformContract, web3Instance);
      } catch (error) {
        console.error("Error connecting wallet:", error);
        alert("Failed to connect wallet. Please try again.");
      }
    } else {
      alert("Please install MetaMask to use this application");
      window.open('https://metamask.io/download/', '_blank');
    }
  };

  const disconnectWallet = () => {
    setAccount('');
    setPlatform(null);
    setProperties([]);
  };

  const loadProperties = async (platformContract, web3Instance) => {
    setLoading(true);
    try {
      const propertyCount = await platformContract.methods.propertyCounter().call();
      const propertiesData = [];

      for (let i = 1; i <= propertyCount; i++) {
        const property = await platformContract.methods.getProperty(i).call();
        const tokenPrice = await platformContract.methods.getTokenPrice(i).call();
        
        const tokenContract = new web3Instance.eth.Contract(
          TokenABI.abi,
          property.tokenContract
        );
        const soldTokens = await tokenContract.methods.totalSupply().call();
        // Try to read claimable rental income for this property (if contract exposes it)
        let claimable = '0';
        try {
          if (platformContract.methods.claimable) {
            claimable = await platformContract.methods.claimable(i).call();
          }
        } catch (e) {
          // method may not exist or call may fail; default to '0'
          claimable = '0';
        }
        
        propertiesData.push({
          ...property,
          tokenPrice,
          soldTokens,
          percentageSold: (soldTokens / property.tokenSupply * 100).toFixed(2),
          claimable
        });
      }

      setProperties(propertiesData);
    } catch (error) {
      console.error("Error loading properties:", error);
      alert("Failed to load properties. Please refresh the page.");
    }
    setLoading(false);
  };

  const purchaseTokens = async (propertyId, amount) => {
    if (!account || !platform) {
      alert("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const property = properties.find(p => p.id === propertyId);
      const tokenPrice = web3.utils.toBN(property.tokenPrice);
      const cost = tokenPrice.mul(web3.utils.toBN(amount)).div(web3.utils.toBN(10).pow(web3.utils.toBN(18)));
      
      const platformFee = await platform.methods.platformFeePercentage().call();
      const fee = cost.mul(web3.utils.toBN(platformFee)).div(web3.utils.toBN(10000));
      const totalPayment = cost.add(fee);

      await platform.methods.purchaseTokens(propertyId, amount).send({
        from: account,
        value: totalPayment.toString()
      });

      alert(`Successfully purchased ${amount} tokens!`);
      await loadProperties(platform, web3);
      setSelectedProperty(null);
    } catch (error) {
      console.error("Purchase error:", error);
      alert("Transaction failed. Please try again.");
    }
    setLoading(false);
  };

  const claimRentalIncome = async (propertyId) => {
    if (!account || !platform) {
      alert("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      await platform.methods.claimRentalIncome(propertyId).send({
        from: account
      });

      alert("Rental income claimed successfully!");
    } catch (error) {
      console.error("Claim error:", error);
      alert("Failed to claim income. You may not have any available.");
    }
    setLoading(false);
  };

  const refreshClaimable = async (propertyId) => {
    if (!platform || !web3) return;
    try {
      let claim = '0';
      if (platform.methods.claimable) {
        claim = await platform.methods.claimable(propertyId).call();
      }
      setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, claimable: claim } : p));
    } catch (err) {
      console.warn('refreshClaimable failed', err);
      setProperties(prev => prev.map(p => p.id === propertyId ? { ...p, claimable: '0' } : p));
    }
  };

  const getStatusColor = (status) => {
    const colors = ['#FF9800', '#2196F3', '#4CAF50', '#F44336', '#9E9E9E'];
    return colors[status] || '#9E9E9E';
  };

  const getStatusText = (status) => {
    const texts = ['Pending', 'Verified', 'Active', 'Suspended', 'Completed'];
    return texts[status] || 'Unknown';
  };

  const calculateCost = (price, amount) => {
    if (!web3 || !price) return '0';
    const cost = web3.utils.toBN(price).mul(web3.utils.toBN(amount)).div(web3.utils.toBN(10).pow(web3.utils.toBN(18)));
    const fee = cost.mul(web3.utils.toBN(250)).div(web3.utils.toBN(10000));
    return web3.utils.fromWei(cost.add(fee), 'ether');
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <h1>🏠 AfriProperty</h1>
            <p>Fractional Real Estate in Africa</p>
          </div>
          
          {account ? (
            <div className="wallet-connected">
              <span className="account">{account.substring(0, 6)}...{account.substring(38)}</span>
              <button onClick={disconnectWallet} className="btn-disconnect">Disconnect</button>
            </div>
          ) : (
            <button onClick={connectWallet} className="btn-connect">Connect Wallet</button>
          )}
        </div>
      </header>

      <nav className="nav-tabs">
        <button 
          className={activeTab === 'explore' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('explore')}
        >
          Explore
        </button>
        <button 
          className={activeTab === 'portfolio' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('portfolio')}
        >
          Portfolio
        </button>
        <button 
          className={activeTab === 'analytics' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </nav>

      <main className="main-content">
        {loading && <div className="loader">Loading...</div>}

        {activeTab === 'explore' && (
          <div className="explore-section">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">🏘️</div>
                <div className="stat-info">
                  <p className="stat-label">Total Properties</p>
                  <p className="stat-value">{properties.length}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-info">
                  <p className="stat-label">Total Value</p>
                  <p className="stat-value">$2.45M</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <p className="stat-label">Active Investors</p>
                  <p className="stat-value">1,247</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-info">
                  <p className="stat-label">Avg Yield</p>
                  <p className="stat-value">8.5%</p>
                </div>
              </div>
            </div>

            <h2>Available Properties</h2>
            <div className="properties-grid">
              {properties.map((property) => (
                <div key={property.id} className="property-card">
                  <div className="property-image" style={{
                    backgroundImage: `url(https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop)`
                  }}>
                    <span className="status-badge" style={{ backgroundColor: getStatusColor(property.status) }}>
                      {getStatusText(property.status)}
                    </span>
                  </div>
                  
                  <div className="property-info">
                    <h3>{property.name}</h3>
                    <p className="location">📍 {property.location}, {property.country}</p>
                    
                    <div className="property-stats">
                      <div>
                        <span className="label">Value</span>
                        <span className="value">${parseInt(web3?.utils.fromWei(property.totalValue || '0', 'ether')).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="label">Token Price</span>
                        <span className="value">${parseFloat(web3?.utils.fromWei(property.tokenPrice || '0', 'ether')).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="label">Yield</span>
                        <span className="value green">{(property.rentalYield / 100).toFixed(1)}%</span>
                      </div>
                    </div>

                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${property.percentageSold}%` }}></div>
                      <span className="progress-text">{property.percentageSold}% Funded</span>
                    </div>

                    <div className="property-actions">
                      {property.status === '2' && (
                        <>
                          <button 
                            className="btn-invest"
                            onClick={() => setSelectedProperty(property)}
                          >
                            Invest Now
                          </button>

                          <div className="claim-block">
                            <div className="claim-amount">
                              Claimable: {web3 ? parseFloat(web3.utils.fromWei(property.claimable || '0', 'ether')).toFixed(6) : '0.000000'} ETH
                            </div>
                            {account && (
                              <>
                                <button
                                  className="btn-claim"
                                  onClick={() => claimRentalIncome(property.id)}
                                  disabled={loading || (property.claimable === '0' || property.claimable === undefined)}
                                >
                                  {loading ? 'Processing...' : 'Claim'}
                                </button>
                                <button
                                  className="btn-refresh"
                                  onClick={() => refreshClaimable(property.id)}
                                  disabled={loading}
                                >
                                  Refresh
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {properties.length === 0 && !loading && (
              <div className="empty-state">
                <p>No properties available yet. Check back soon!</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div className="portfolio-section">
            {!account ? (
              <div className="empty-state">
                <h3>Connect Your Wallet</h3>
                <p>Connect your wallet to view your portfolio</p>
                <button onClick={connectWallet} className="btn-connect">Connect Wallet</button>
              </div>
            ) : (
              <div className="portfolio-content">
                <div className="portfolio-summary">
                  <h3>Total Portfolio Value</h3>
                  <p className="portfolio-value">$0.00</p>
                  <p className="portfolio-stats">0 Properties • 0% Average Yield</p>
                </div>
                
                <div className="empty-state">
                  <h3>No Investments Yet</h3>
                  <p>Start building your real estate portfolio today</p>
                  <button onClick={() => setActiveTab('explore')} className="btn-primary">
                    Explore Properties
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-section">
            <h2>Platform Analytics</h2>
            <div className="analytics-grid">
              <div className="analytics-card">
                <h3>Investment Trends</h3>
                <div className="chart-placeholder">
                  <p>Chart visualization coming soon</p>
                </div>
              </div>
              <div className="analytics-card">
                <h3>Property Distribution</h3>
                <div className="distribution-list">
                  <div className="distribution-item">
                    <span>Kenya</span>
                    <div className="distribution-bar">
                      <div className="bar-fill" style={{ width: '60%' }}></div>
                      <span>60%</span>
                    </div>
                  </div>
                  <div className="distribution-item">
                    <span>Nigeria</span>
                    <div className="distribution-bar">
                      <div className="bar-fill" style={{ width: '25%' }}></div>
                      <span>25%</span>
                    </div>
                  </div>
                  <div className="distribution-item">
                    <span>South Africa</span>
                    <div className="distribution-bar">
                      <div className="bar-fill" style={{ width: '15%' }}></div>
                      <span>15%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {selectedProperty && (
        <div className="modal-overlay" onClick={() => setSelectedProperty(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProperty(null)}>×</button>
            
            <h2>{selectedProperty.name}</h2>
            <p className="modal-location">📍 {selectedProperty.location}, {selectedProperty.country}</p>
            
            <div className="modal-input-group">
              <label>Number of Tokens</label>
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(Math.max(1, parseInt(e.target.value) || 0))}
                min="1"
              />
            </div>
            
            <div className="modal-summary">
              <div className="summary-row">
                <span>Token Price:</span>
                <span>${parseFloat(web3?.utils.fromWei(selectedProperty.tokenPrice || '0', 'ether')).toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Tokens:</span>
                <span>{tokenAmount}</span>
              </div>
              <div className="summary-row">
                <span>Platform Fee (2.5%):</span>
                <span>${(parseFloat(web3?.utils.fromWei(selectedProperty.tokenPrice || '0', 'ether')) * tokenAmount * 0.025).toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span>Total Cost:</span>
                <span>${calculateCost(selectedProperty.tokenPrice, tokenAmount)} ETH</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setSelectedProperty(null)}>
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={() => purchaseTokens(selectedProperty.id, tokenAmount)}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Confirm Investment'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>© 2025 AfriProperty - Powered by Ethereum & Polygon</p>
        <p>Platform Address: {PLATFORM_ADDRESS}</p>
      </footer>
    </div>
  );
}

export default App;
