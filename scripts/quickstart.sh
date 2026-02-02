#!/bin/bash
echo "🚀 AfriProperty Quick Start"
echo ""

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Setup environment
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
    exit 1
fi

# Start Ganache
echo "Starting local blockchain..."
ganache-cli --deterministic --gasLimit 12000000 > /dev/null 2>&1 &
GANACHE_PID=$!
sleep 3

# Deploy contracts
echo "Deploying contracts..."
truffle migrate --network development

# Setup platform
echo "Setting up platform..."
truffle exec scripts/setup_platform.js --network development

# Create sample property
echo "Creating sample property..."
truffle exec scripts/create_property.js --network development

# Start frontend
echo "Starting frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Create frontend .env
cat > .env << EOF
REACT_APP_PLATFORM_ADDRESS=$(truffle networks | grep "AfriPropertyPlatform" | awk '{print $2}')
REACT_APP_NETWORK_ID=1337
REACT_APP_CHAIN_NAME=Localhost
EOF

npm start &
FRONTEND_PID=$!

echo ""
echo "✓ AfriProperty is running!"
echo ""
echo "Frontend: http://localhost:3000"
echo "Blockchain: http://localhost:8545"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $GANACHE_PID $FRONTEND_PID 2>/dev/null" EXIT
wait

chmod +x deploy.sh quickstart.sh
