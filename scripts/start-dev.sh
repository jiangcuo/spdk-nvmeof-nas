#!/bin/bash

echo "=== SPDK NAS Manager Development Setup ==="

# 检查Node.js版本
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
echo "Node.js version: $NODE_VERSION"

if [[ "$NODE_VERSION" == "not found" ]]; then
    echo "Error: Node.js is not installed. Please install Node.js 16.x or higher."
    exit 1
fi

# 检查npm
NPM_VERSION=$(npm --version 2>/dev/null || echo "not found")
echo "npm version: $NPM_VERSION"

if [[ "$NPM_VERSION" == "not found" ]]; then
    echo "Error: npm is not found. Please install npm."
    exit 1
fi

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# 检查环境文件
if [ ! -f ".env" ]; then
    echo "Note: No .env file found. You can create one with these variables:"
    echo "PORT=3000"
    echo "JWT_SECRET=your-secret-key"
    echo "DEFAULT_SPDK_SOCKET=/var/tmp/spdk.sock"
    echo "DATABASE_PATH=./data/spdk_nas.db"
    echo ""
fi

# 创建必要的目录
mkdir -p data logs

echo "Starting SPDK NAS Manager in development mode..."
echo "API will be available at: http://localhost:3000/api"
echo "Documentation will be available at: http://localhost:3000/api-docs"
echo ""
echo "Default admin credentials:"
echo "Username: admin"
echo "Password: admin123"
echo ""
echo "Usage examples:"
echo "  npm run dev                                    # Use default socket (/var/tmp/spdk.sock)"
echo "  npm run dev -- --socket /custom/path/spdk.sock # Use custom socket path"
echo "  npm run dev -- --port 8080 --socket /var/tmp/spdk.sock"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# 启动开发服务器，传递所有命令行参数
npm run dev -- "$@" 