const express = require('express');
const SPDKRpcClient = require('../services/spdkRpcClient');
const globalConfig = require('../config/global');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const os = require('os');

const router = express.Router();

/**
 * @swagger
 * /api/system/status:
 *   get:
 *     summary: Get system status and SPDK information
 *     tags: [System Information]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spdk_connected:
 *                   type: boolean
 *                 spdk_info:
 *                   type: object
 *                 server_info:
 *                   type: object
 *                 socket_path:
 *                   type: string
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const systemInfo = {
            server_info: {
                node_version: process.version,
                platform: process.platform,
                uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                timestamp: new Date().toISOString()
            },
            socket_path: globalConfig.getSpdkSocketPath(),
            spdk_connected: false,
            spdk_info: null
        };

        // 尝试连接SPDK并获取信息
        try {
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();
            
            systemInfo.spdk_connected = true;
            systemInfo.spdk_info = await spdkClient.getSystemInfo();
            
        } catch (spdkError) {
            logger.warn('SPDK connection failed:', spdkError.message);
            systemInfo.spdk_error = spdkError.message;
        }

        res.json(systemInfo);
    } catch (error) {
        logger.error('Error getting system status:', error);
        res.status(500).json({
            error: 'Failed to get system status',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/system/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System Information]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

/**
 * @swagger
 * /api/system/network-interfaces:
 *   get:
 *     summary: Get local network interfaces and IP addresses
 *     tags: [System Information]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Network interfaces information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 interfaces:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: Interface name
 *                       addresses:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             address:
 *                               type: string
 *                               description: IP address
 *                             family:
 *                               type: string
 *                               enum: [IPv4, IPv6]
 *                             internal:
 *                               type: boolean
 *                               description: Whether it's an internal interface
 *                 ipv4_addresses:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: All IPv4 addresses
 *                 ipv6_addresses:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: All IPv6 addresses
 */
router.get('/network-interfaces', authenticateToken, (req, res) => {
    try {
        const networkInterfaces = os.networkInterfaces();
        const interfaces = [];
        const ipv4Addresses = [];
        const ipv6Addresses = [];

        for (const [name, addresses] of Object.entries(networkInterfaces)) {
            const interfaceInfo = {
                name,
                addresses: []
            };

            for (const addr of addresses) {
                const addressInfo = {
                    address: addr.address,
                    family: addr.family,
                    internal: addr.internal,
                    netmask: addr.netmask,
                    mac: addr.mac
                };

                interfaceInfo.addresses.push(addressInfo);

                // 收集非内部接口的IP地址
                if (!addr.internal) {
                    if (addr.family === 'IPv4') {
                        ipv4Addresses.push(addr.address);
                    } else if (addr.family === 'IPv6') {
                        ipv6Addresses.push(addr.address);
                    }
                }
            }

            interfaces.push(interfaceInfo);
        }

        res.json({
            interfaces,
            ipv4_addresses: ipv4Addresses,
            ipv6_addresses: ipv6Addresses
        });

    } catch (error) {
        logger.error('Error getting network interfaces:', error);
        res.status(500).json({
            error: 'Failed to get network interfaces',
            message: error.message
        });
    }
});

module.exports = router; 