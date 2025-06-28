# SPDK NAS Manager

SPDK NAS Manager 是一个综合的存储管理平台，由 RESTful API 后端和现代化 Web 前端组成，用于管理 SPDK (Storage Performance Development Kit) 组件，包括 NVMe-oF 子系统、RAID 阵列、块设备和存储卷管理。

## 🏗️ 架构

- **🎨 前端**: 基于 Vue.js 3 + Element Plus 的现代化 Web 界面 (见 `webapp/` 目录)
- **⚙️ 后端**: 使用 Node.js 和 Express 构建的 RESTful API 服务器

## Features

- **User Authentication**: JWT-based authentication with role-based access control
- **NQN Management**: Create and manage NVMe-oF subsystems and NQNs
- **Block Device Management**: Attach/detach NVMe controllers and manage block devices
- **RAID Management**: Create and manage RAID arrays with various levels
  - Dynamic addition and removal of RAID base bdevs
- **LV Store Management**: Complete lifecycle management of logical volume stores
  - Create, rename, grow, and delete LV stores
- **LVol Management**: Advanced logical volume operations
  - Create, snapshot, clone, and resize logical volumes
  - Thin/thick provisioning conversion
  - Read-only mode, parent decoupling, and shallow copy operations
- **Physical Disk Management**: Comprehensive disk discovery and monitoring
  - Support for both traditional block devices (SATA/SAS) and NVMe devices
  - Real-time disk status monitoring (mounted, SPDK usage)
  - Health monitoring via SMART information
  - Partition and filesystem information
- **Real-time SPDK Integration**: Direct communication with SPDK via RPC interface
- **SQLite Database**: Store configuration and audit logs
- **Swagger Documentation**: Comprehensive API documentation
- **Audit Logging**: Track all operations with detailed logs

## Technology Stack

### Backend
- **Framework**: Node.js with Express.js
- **Database**: SQLite
- **Authentication**: JWT with bcrypt
- **Documentation**: Swagger/OpenAPI 3.0
- **Logging**: Winston
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate limiting

### Frontend
- **Framework**: Vue.js 3 with Composition API
- **UI Library**: Element Plus (全中文)
- **State Management**: Pinia
- **Build Tool**: Vite
- **Routing**: Vue Router 4
- **HTTP Client**: Axios

## 🚀 Quick Start

### 1. Backend Setup

```bash
# Install backend dependencies
npm install

# Start backend server (development mode)
npm run dev

# Or with custom SPDK socket
npm run dev -- --socket /var/tmp/spdk.sock
```

Backend will run on http://localhost:3000

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd webapp

# Install frontend dependencies
npm install

# Start frontend development server
npm run dev
```

Frontend will run on http://localhost:8080 with automatic API proxy to backend.

### 3. Access the Application

- **🎨 Web Interface**: http://localhost:8080
- **📚 API Documentation**: http://localhost:3000/api-docs
- **🔐 Default Login**: admin / admin123

## 📁 Project Structure

```
spdk-nas-manager/
├── webapp/                 # 🎨 Frontend Vue.js application
│   ├── src/
│   │   ├── views/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── services/      # API clients
│   │   └── stores/        # State management
│   ├── package.json
│   └── README.md          # Frontend documentation
├── src/                   # ⚙️ Backend API server
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic
│   ├── middleware/       # Authentication & validation
│   └── utils/            # Utilities
├── docs/                 # 📖 Documentation
├── scripts/              # 🔧 Test scripts
└── README.md             # This file
```

## Prerequisites

- Node.js 16.x or higher
- npm or yarn
- SPDK installed and running with RPC socket available

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd spdk-nas-manager
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env file with your configuration
```

4. Start the server:
```bash
# Development mode with auto-reload (default socket)
npm run dev

# Development mode with custom socket path
npm run dev -- --socket /custom/path/spdk.sock

# Production mode (default socket)
npm start

# Production mode with custom socket and port
npm start -- --socket /var/tmp/spdk.sock --port 8080

# Show help
node src/app.js --help
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `DATABASE_PATH`: SQLite database file path
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRES_IN`: JWT token expiration time
- `DEFAULT_SPDK_SOCKET`: Default SPDK RPC socket path
- `SPDK_TIMEOUT`: RPC request timeout in milliseconds
- `LOG_LEVEL`: Logging level (error/warn/info/debug)

### SPDK Socket Configuration

The API connects to SPDK using a socket path specified at startup time via command line arguments:

```bash
# Start with custom socket path
node src/app.js --socket /custom/path/spdk.sock

# Or using npm scripts
npm start -- --socket /var/tmp/spdk.sock --port 3000
```

**Command Line Options:**
- `-s, --socket <path>`: SPDK RPC socket path (default: /var/tmp/spdk.sock)
- `-p, --port <number>`: Server port (default: 3000)
- `-h, --help`: Show help message

### JWT Authentication Configuration

The application uses an intelligent JWT secret strategy based on the running environment:

#### Development Mode (Default)
```bash
# Development mode - uses fixed JWT secret
npm run dev
node src/app.js

# Output: JWT Secret: development (fixed)
# ✅ Tokens remain valid after server restarts
# ✅ Convenient for debugging and testing
```

#### Production Mode
```bash
# Production mode - generates random JWT secret
NODE_ENV=production npm start
NODE_ENV=production node src/app.js

# Output: JWT Secret: production (random)
# ✅ Unique random secret for each startup
# ✅ Enhanced security for production deployment
```

#### Custom JWT Secret
```bash
# Override with environment variable
JWT_SECRET="your-custom-secret-key" npm start

# Output: JWT Secret: environment variable
# ✅ Use your own JWT secret
# ✅ Works in both development and production
```

**Security Features:**
- 🔐 **Smart JWT Secret Strategy**: 
  - **Development Mode**: Uses fixed JWT secret for debugging convenience (tokens persist across restarts)
  - **Production Mode**: Generates unique 128-bit random JWT secret on each startup
  - **Environment Override**: Respects `JWT_SECRET` environment variable when set
- 🛡️ **No manual configuration required**: JWT authentication works out-of-the-box
- 🚀 **Developer Friendly**: Development tokens remain valid after server restarts
- 🔒 **Production Secure**: Each production instance uses unique random keys

## API Documentation

Once the server is running, visit:
- **📚 Interactive API Documentation: `http://localhost:3000/api-docs`** (Full Swagger UI with 15 endpoints)
- 🔍 Health Check: `http://localhost:3000/health`

**✨ Features:**
- 🎯 Interactive API testing directly in browser
- 📖 Complete endpoint documentation with examples
- 🔐 JWT authentication testing support  
- 📝 Request/response schema validation
- 🏷️ Organized by 5 functional modules

## Default Credentials

**Username**: `admin`  
**Password**: `admin123`

⚠️ **Important**: Change the default password immediately after first login!

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/logout` - User logout

### NQN Management
- `GET /api/nqns` - List all NQNs
- `POST /api/nqns` - Create new NQN subsystem
- `GET /api/nqns/{id}` - Get NQN details
- `PUT /api/nqns/{id}` - Update NQN
- `DELETE /api/nqns/{id}` - Delete NQN
- `POST /api/nqns/{id}/namespaces` - Add namespace to NQN
- `DELETE /api/nqns/{id}/namespaces/{nsid}` - Remove namespace

### Block Device Management
- `GET /api/bdevs` - List all block devices
- `POST /api/bdevs/nvme/attach` - Attach NVMe controller
- `POST /api/bdevs/malloc` - Create malloc bdev (testing)
- `DELETE /api/bdevs/{name}` - Delete block device

### RAID Management
- `GET /api/raids` - List all RAID arrays
- `POST /api/raids` - Create new RAID array
- `GET /api/raids/{id}` - Get RAID details
- `DELETE /api/raids/{id}` - Delete RAID array
- `POST /api/raid/base-bdev` - Add base bdev to RAID
- `DELETE /api/raid/base-bdev` - Remove base bdev from RAID

### LV Store Management
- `GET /api/lvstore` - List all LV stores
- `POST /api/lvstore` - Create new LV store
- `PUT /api/lvstore/rename` - Rename LV store
- `PUT /api/lvstore/{uuid}/grow` - Grow LV store to underlying bdev size
- `DELETE /api/lvstore/{uuid}` - Delete LV store

### LVol Management
- `GET /api/lvol` - List all logical volumes
- `POST /api/lvol` - Create new logical volume
- `POST /api/lvol/snapshot` - Create LVol snapshot
- `POST /api/lvol/clone` - Create LVol clone from snapshot
- `POST /api/lvol/clone-bdev` - Create LVol clone from non-LVol bdev
- `PUT /api/lvol/rename` - Rename LVol
- `PUT /api/lvol/{name}/inflate` - Convert thin provisioned to thick provisioned
- `PUT /api/lvol/{name}/decouple-parent` - Decouple LVol parent relationship
- `PUT /api/lvol/{name}/resize` - Resize LVol
- `PUT /api/lvol/{name}/read-only` - Set LVol as read-only
- `DELETE /api/lvol/{name}` - Delete LVol

### Physical Disk Management
- `GET /api/disks` - List all physical disks
- `GET /api/disks/stats` - Get disk statistics
- `GET /api/disks/available` - Get available disks (not mounted and not used by SPDK)
- `GET /api/disks/{deviceName}` - Get specific disk information
- `GET /api/disks/{deviceName}/health` - Get disk health status via SMART
- `GET /api/disks/{deviceName}/smart` - Get disk SMART information
- `POST /api/disks/scan/refresh` - Refresh disk scan (admin only)

### System Information
- `GET /api/system/status` - Get system and SPDK status
- `GET /api/system/health` - Health check

## Authentication

All API endpoints (except auth and health) require JWT authentication:

```bash
curl -H "Authorization: Bearer <your-jwt-token>" \
     http://localhost:3000/api/nqns
```

## Example Usage

### 1. Start the server with custom socket:
```bash
# Start with custom SPDK socket path
node src/app.js --socket /var/tmp/spdk.sock --port 3000
```

### 2. Login and get token:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 3. Check system status (shows current socket path):
```bash
curl -X GET http://localhost:3000/api/system/status \
  -H "Authorization: Bearer <token>"
```

### 4. Create a malloc bdev (for testing):
```bash
curl -X POST http://localhost:3000/api/bdevs/malloc \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "test_malloc", "num_blocks": 1024, "block_size": 512}'
```

### 5. Create an NQN subsystem:
```bash
curl -X POST http://localhost:3000/api/nqns \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "nqn": "nqn.2024-01.com.example:test-subsystem",
    "subsystem_name": "test-subsystem",
    "allow_any_host": true,
    "transport_type": "tcp",
    "target_address": "192.168.1.100",
    "target_port": 4420
  }'
```

### 6. Create a RAID array:
```bash
curl -X POST http://localhost:3000/api/raids \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "raid0_test",
    "raid_level": "raid0",
    "base_bdevs": ["bdev1", "bdev2"],
    "strip_size": 64
  }'
```

### 7. Physical disk management:
```bash
# List all physical disks
curl -X GET http://localhost:3000/api/disks \
  -H "Authorization: Bearer <token>"

# Get available disks for SPDK use
curl -X GET http://localhost:3000/api/disks/available \
  -H "Authorization: Bearer <token>"

# Check disk health
curl -X GET http://localhost:3000/api/disks/sda/health \
  -H "Authorization: Bearer <token>"

# Get disk statistics
curl -X GET http://localhost:3000/api/disks/stats \
  -H "Authorization: Bearer <token>"
```

## Development

### Project Structure
```
src/
├── app.js              # Main application file
├── config/             # Configuration files
│   ├── database.js     # Database configuration
│   └── swagger.js      # Swagger configuration
├── middleware/         # Express middleware
│   ├── auth.js         # Authentication middleware
│   └── validation.js   # Request validation
├── routes/             # API route handlers
│   ├── auth.js         # Authentication routes
│   ├── nqns.js         # NQN management routes
│   ├── bdevs.js        # Block device routes
│   ├── raids.js        # RAID management routes
│   ├── raid.js         # RAID advanced management routes
│   ├── lvstore.js      # LV Store management routes
│   ├── lvol.js         # LVol management routes
│   ├── disks.js        # Physical disk management routes
│   └── system.js       # System information routes
├── services/           # Business logic services
│   ├── spdkRpcClient.js # SPDK RPC client
│   └── diskService.js  # Physical disk management service
└── utils/              # Utility functions
    └── logger.js       # Logging configuration
```

### Database Schema

The application uses SQLite with the following main tables:
- `users` - User accounts and authentication
- `nqns` - NQN subsystem configurations
- `bdevs` - Block device records
- `raids` - RAID array configurations
- `nqn_namespaces` - NQN namespace mappings
- `audit_logs` - Operation audit trail

### Adding New Features

1. Create route handlers in `src/routes/`
2. Add validation schemas in `src/middleware/validation.js`
3. Implement business logic in `src/services/`
4. Add Swagger documentation with JSDoc comments
5. Update this README with new endpoints

## Security Considerations

- Change default admin password
- Use strong JWT secret in production
- Enable HTTPS in production
- Implement proper firewall rules
- Regularly update dependencies
- Monitor audit logs

## Troubleshooting

### Common Issues

1. **SPDK Connection Failed**
   - Check if SPDK is running
   - Verify socket path is correct
   - Check socket permissions

2. **Database Errors**
   - Ensure data directory exists and is writable
   - Check disk space

3. **Authentication Issues**
   - Verify JWT secret is set
   - Check token expiration
   - Ensure proper Authorization header format

### Logs

Application logs are stored in:
- `./logs/combined.log` - All logs
- `./logs/error.log` - Error logs only

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Support

For issues and questions, please create an issue in the repository or contact the development team. 