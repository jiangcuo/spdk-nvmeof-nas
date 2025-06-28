require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const { parseCommandLineArgs } = require('./utils/args');
const globalConfig = require('./config/global');
const database = require('./config/database');
const swaggerSpecs = require('./config/swagger');
const logger = require('./utils/logger');

// 导入路由
const authRoutes = require('./routes/auth');
const nqnRoutes = require('./routes/nqns');
const bdevRoutes = require('./routes/bdevs');
const raidRoutes = require('./routes/raids');
const systemRoutes = require('./routes/system');
const configRoutes = require('./routes/config');
const raidManagementRoutes = require('./routes/raid');
const lvstoreRoutes = require('./routes/lvstore');
const lvolRoutes = require('./routes/lvol');
const diskRoutes = require('./routes/disks');
const hostRoutes = require('./routes/hosts');
const nvmeDiscoveryRoutes = require('./routes/nvme-discovery');

// 解析命令行参数并初始化全局配置
const cliConfig = parseCommandLineArgs();
globalConfig.initialize(cliConfig);

const app = express();
const PORT = globalConfig.getPort();

// 安全中间件 - 为Swagger UI配置适当的CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https:", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    }
}));
app.use(cors());

// 速率限制
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP最多100个请求
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
    }
});
app.use('/api/', limiter);

// 解析JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 日志中间件
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Swagger JSON端点
app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpecs);
});

// Swagger API文档
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'SPDK NAS Manager API Documentation',
    swaggerOptions: {
        url: '/api-docs/swagger.json'
    }
}));

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: require('../package.json').version
    });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/nqns', nqnRoutes);
app.use('/api/bdevs', bdevRoutes);
app.use('/api/raids', raidRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/config', configRoutes);
app.use('/api/raid', raidManagementRoutes);
app.use('/api/lvstore', lvstoreRoutes);
app.use('/api/lvol', lvolRoutes);
app.use('/api/disks', diskRoutes);
app.use('/api/hosts', hostRoutes);
app.use('/api/nvme', nvmeDiscoveryRoutes);

// 404处理 - 仅处理API路由
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested API endpoint does not exist',
        path: req.originalUrl
    });
});

// 提供前端静态文件
const frontendPath = path.join(__dirname, '../webapp/dist');
app.use(express.static(frontendPath));

// Catch-all handler: send back index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 服务器启动
async function startServer() {
    try {
        // 初始化数据库
        await database.initialize();
        logger.info('Database initialized successfully');

        // 启动服务器
        app.listen(PORT, () => {
            logger.info(`SPDK NAS Manager server started on port ${PORT}`);
            logger.info(`SPDK socket path: ${globalConfig.getSpdkSocketPath()}`);
            logger.info(`JWT secret type: ${globalConfig.getJwtSecretType()}`);
            logger.info(`API Documentation available at: http://localhost:${PORT}/api-docs`);
            logger.info(`Health check available at: http://localhost:${PORT}/health`);
            
            // 输出服务器信息
            console.log('\n=== SPDK NAS Manager ===');
            console.log('Server is running!');
            console.log(`API URL: http://localhost:${PORT}/api`);
            console.log(`Documentation: http://localhost:${PORT}/api-docs`);
            console.log(`SPDK Socket: ${globalConfig.getSpdkSocketPath()}`);
            console.log(`JWT Secret: ${globalConfig.getJwtSecretType()}`);
            console.log('\nDefault Admin Account:');
            console.log('Username: admin');
            console.log('Password: admin123');
            console.log('Please change the default password after first login!');
            console.log('========================\n');
        });

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Graceful shutdown...');
    
    try {
        await database.close();
        logger.info('Database connection closed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Graceful shutdown...');
    
    try {
        await database.close();
        logger.info('Database connection closed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// 启动服务器
startServer();

module.exports = app; 