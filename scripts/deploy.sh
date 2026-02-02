#!/bin/bash
set -e

echo "🚀 AfriProperty Platform Deployment"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check prerequisites
echo "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Please install Node.js 16+"
    exit 1
fi
print_success "Node.js found"

if ! command -v npm &> /dev/null; then
    print_error "npm not found"
    exit 1
fi
print_success "npm found"

if ! command -v truffle &> /dev/null; then
    print_warning "Truffle not found. Installing..."
    npm install -g truffle
fi
print_success "Truffle ready"

# Menu
echo ""
echo "Select deployment option:"
echo "1) Local Development (Ganache)"
echo "2) Polygon Mumbai Testnet (FREE)"
echo "3) Polygon Mainnet (Requires MATIC)"
echo "4) Run Tests Only"
echo "5) Exit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "Deploying to local network..."
        print_warning "Make sure Ganache is running on port 8545"
        read -p "Press Enter to continue..."
        
        truffle compile
        truffle migrate --network development
        
        print_success "Deployed to local network"
        echo ""
        echo "Start frontend: cd frontend && npm start"
        ;;
    2)
        echo ""
        echo "Deploying to Polygon Mumbai Testnet..."
        
        if [ ! -f .env ]; then
            print_error ".env file not found"
            echo "Create .env file with your PRIVATE_KEY or MNEMONIC"
            exit 1
        fi
        
        print_warning "Make sure you have test MATIC"
        echo "Get free test tokens from:"
        echo "  https://faucet.polygon.technology/"
        echo "  https://mumbaifaucet.com/"
        read -p "Press Enter to continue..."
        
        truffle compile
        truffle migrate --network polygon_mumbai --reset
        
        print_success "Deployed to Mumbai testnet"
        echo ""
        echo "Verify contracts:"
        echo "  truffle run verify AfriPropertyPlatform --network polygon_mumbai"
        ;;
    3)
        echo ""
        print_warning "⚠️  MAINNET DEPLOYMENT - REAL MONEY INVOLVED ⚠️"
        echo ""
        read -p "Type 'DEPLOY' to confirm: " confirm
        
        if [ "$confirm" != "DEPLOY" ]; then
            print_error "Deployment cancelled"
            exit 1
        fi
        
        truffle compile
        truffle migrate --network polygon --reset
        
        print_success "Deployed to Polygon mainnet"
        ;;
    4)
        echo ""
        echo "Running tests..."
        truffle test
        ;;
    5)
        exit 0
        ;;
    *)
        print_error "Invalid option"
        exit 1
        ;;
