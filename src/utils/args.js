const path = require('path');

/**
 * 解析命令行参数
 */
function parseCommandLineArgs() {
    const args = process.argv.slice(2);
    const config = {
        socketPath: process.env.DEFAULT_SPDK_SOCKET || '/var/tmp/spdk_tgt.sock',
        port: process.env.PORT || 3000,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--socket':
            case '-s':
                if (i + 1 < args.length) {
                    config.socketPath = args[i + 1];
                    i++; // 跳过下一个参数，因为已经处理了
                } else {
                    console.error('Error: --socket option requires a path argument');
                    process.exit(1);
                }
                break;
                
            case '--port':
            case '-p':
                if (i + 1 < args.length) {
                    const port = parseInt(args[i + 1], 10);
                    if (isNaN(port) || port < 1 || port > 65535) {
                        console.error('Error: Invalid port number');
                        process.exit(1);
                    }
                    config.port = port;
                    i++;
                } else {
                    console.error('Error: --port option requires a port number');
                    process.exit(1);
                }
                break;
                
            case '--help':
            case '-h':
                config.help = true;
                break;
                
            default:
                console.error(`Error: Unknown option '${arg}'`);
                showHelp();
                process.exit(1);
        }
    }

    if (config.help) {
        showHelp();
        process.exit(0);
    }

    // 验证socket路径
    if (!path.isAbsolute(config.socketPath)) {
        console.error('Error: Socket path must be an absolute path');
        process.exit(1);
    }

    return config;
}

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`
SPDK NAS Manager - RESTful API for SPDK management

Usage: node src/app.js [options]

Options:
  -s, --socket <path>     SPDK RPC socket path (default: /var/tmp/spdk.sock)
  -p, --port <number>     Server port (default: 3000)
  -h, --help             Show this help message

Examples:
  node src/app.js --socket /var/tmp/spdk.sock --port 3000
  node src/app.js -s /custom/path/spdk.sock -p 8080
  npm start -- --socket /var/tmp/spdk.sock

Environment Variables:
  PORT                   Server port (can be overridden by --port)
  DEFAULT_SPDK_SOCKET    Default SPDK socket path (can be overridden by --socket)
  JWT_SECRET             JWT secret key for authentication
  DATABASE_PATH          SQLite database file path
  LOG_LEVEL              Logging level (error, warn, info, debug)
`);
}

module.exports = {
    parseCommandLineArgs,
    showHelp
}; 