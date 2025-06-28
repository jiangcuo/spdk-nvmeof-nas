/**
 * 全局配置对象
 * 存储应用启动时的配置参数
 */
class GlobalConfig {
    constructor() {
        this.socketPath = '/var/tmp/spdk_tgt.sock';
        this.port = 3000;
        this.timeout = 30000;
        this.jwtSecret = null;
        this.initialized = false;
    }

    /**
     * 初始化配置
     * @param {Object} config - 配置参数
     * @param {string} config.socketPath - SPDK socket路径
     * @param {number} config.port - 服务器端口
     * @param {number} config.timeout - RPC超时时间
     */
    initialize(config) {
        this.socketPath = config.socketPath || this.socketPath;
        this.port = config.port || this.port;
        this.timeout = config.timeout || parseInt(process.env.SPDK_TIMEOUT) || this.timeout;
        
        // JWT密钥设置策略
        if (process.env.JWT_SECRET) {
            // 优先使用环境变量
            this.jwtSecret = process.env.JWT_SECRET;
        } else if (process.env.NODE_ENV === 'production') {
            // 生产模式：生成随机密钥
            this.jwtSecret = this.generateJwtSecret();
        } else {
            // 开发模式：使用固定密钥便于调试
            this.jwtSecret = this.getDevJwtSecret();
        }
        
        this.initialized = true;
    }

    /**
     * 生成随机JWT密钥（生产模式）
     * @returns {string} 随机生成的JWT密钥
     */
    generateJwtSecret() {
        const crypto = require('crypto');
        return crypto.randomBytes(64).toString('hex');
    }

    /**
     * 获取开发模式固定JWT密钥
     * @returns {string} 开发用固定JWT密钥
     */
    getDevJwtSecret() {
        // 开发模式使用固定密钥，便于调试
        return 'spdk-nas-manager-development-jwt-secret-key-for-debugging-purposes-do-not-use-in-production-2025';
    }

    /**
     * 获取SPDK socket路径
     * @returns {string} socket路径
     */
    getSpdkSocketPath() {
        return this.socketPath;
    }

    /**
     * 获取服务器端口
     * @returns {number} 端口号
     */
    getPort() {
        return this.port;
    }

    /**
     * 获取RPC超时时间
     * @returns {number} 超时时间(毫秒)
     */
    getTimeout() {
        return this.timeout;
    }

    /**
     * 获取JWT密钥
     * @returns {string} JWT密钥
     */
    getJwtSecret() {
        return this.jwtSecret;
    }

    /**
     * 获取JWT密钥类型信息
     * @returns {string} JWT密钥类型描述
     */
    getJwtSecretType() {
        if (process.env.JWT_SECRET) {
            return 'environment variable';
        } else if (process.env.NODE_ENV === 'production') {
            return 'production (random)';
        } else {
            return 'development (fixed)';
        }
    }

    /**
     * 检查配置是否已初始化
     * @returns {boolean} 是否已初始化
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * 获取配置信息的字符串表示
     * @returns {string} 配置信息
     */
    toString() {
        return JSON.stringify({
            socketPath: this.socketPath,
            port: this.port,
            timeout: this.timeout,
            jwtSecret: this.jwtSecret ? `${this.jwtSecret.substring(0, 8)}...` : 'not set',
            initialized: this.initialized
        }, null, 2);
    }
}

// 创建全局单例
const globalConfig = new GlobalConfig();

module.exports = globalConfig; 