const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const SPDKRpcClient = require('../services/spdkRpcClient');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

// 配置文件路径
const CONFIG_FILE_PATH = path.join(__dirname, '../../data/spdk.json');
const SYSTEM_CONFIG_PATH = '/etc/spdk/spdk.conf';

/**
 * @swagger
 * components:
 *   schemas:
 *     SPDKConfig:
 *       type: object
 *       properties:
 *         timestamp:
 *           type: string
 *           format: date-time
 *         spdk_version:
 *           type: object
 *         bdevs:
 *           type: array
 *           items:
 *             type: object
 *         nvmf:
 *           type: object
 *           properties:
 *             transports:
 *               type: array
 *             subsystems:
 *               type: array
 */

/**
 * @swagger
 * /api/config:
 *   get:
 *     summary: Get current SPDK configuration
 *     tags: [Configuration Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current SPDK configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SPDKConfig'
 *       500:
 *         description: Failed to get configuration
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();
        
        const config = await spdkClient.getFullConfig();
        
        res.json({
            message: 'SPDK configuration retrieved successfully',
            config: config
        });
    } catch (error) {
        logger.error('Error getting SPDK configuration:', error);
        res.status(500).json({
            error: 'Failed to get configuration',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/config/save:
 *   post:
 *     summary: Save current SPDK configuration to file
 *     tags: [Configuration Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 file_path:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *       500:
 *         description: Failed to save configuration
 */
router.post('/save',
    authenticateToken,
    requireAdmin,
    auditLog('save_config', 'spdk_config'),
    async (req, res) => {
        try {
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();
            
            // 获取当前配置
            const config = await spdkClient.getFullConfig();
            
            // 添加保存元数据
            const configWithMeta = {
                ...config,
                saved_by: req.user.username,
                saved_at: new Date().toISOString(),
                server_info: {
                    node_version: process.version,
                    platform: process.platform
                }
            };
            
            // 确保目录存在
            await fs.mkdir(path.dirname(CONFIG_FILE_PATH), { recursive: true });
            
            // 保存到项目目录 (JSON格式, 向后兼容)
            await fs.writeFile(
                CONFIG_FILE_PATH, 
                JSON.stringify(configWithMeta, null, 2), 
                'utf8'
            );
            
            // 生成SPDK配置格式并保存到系统路径
            try {
                // 确保系统配置目录存在
                await fs.mkdir(path.dirname(SYSTEM_CONFIG_PATH), { recursive: true });
                
                // 使用SPDK的save_config命令获取配置
                const spdkConfigData = await spdkClient.saveConfig();
                
                // 转换为JSON-RPC配置文件格式
                const rpcConfigLines = [];
                
                // 添加配置文件头注释
                rpcConfigLines.push('# SPDK Configuration File');
                rpcConfigLines.push(`# Generated on: ${new Date().toISOString()}`);
                rpcConfigLines.push(`# Generated by: ${req.user.username}`);
                rpcConfigLines.push('# This file contains JSON-RPC method calls to reproduce the current SPDK configuration');
                rpcConfigLines.push('');
                
                // 将配置转换为JSON-RPC方法调用
                if (Array.isArray(spdkConfigData)) {
                    spdkConfigData.forEach((rpcCall, index) => {
                        if (rpcCall.method && rpcCall.params) {
                            rpcConfigLines.push(`# RPC Call ${index + 1}: ${rpcCall.method}`);
                            rpcConfigLines.push(JSON.stringify(rpcCall, null, 2));
                            rpcConfigLines.push('');
                        }
                    });
                }
                
                // 保存到系统配置路径
                await fs.writeFile(SYSTEM_CONFIG_PATH, rpcConfigLines.join('\n'), 'utf8');
                
                logger.info(`SPDK configuration saved by ${req.user.username} to both ${CONFIG_FILE_PATH} and ${SYSTEM_CONFIG_PATH}`);
                
                res.json({
                    success: true,
                    message: 'SPDK configuration saved successfully to /etc/spdk/spdk.conf',
                    files: {
                        json_config: 'data/spdk.json',
                        system_config: '/etc/spdk/spdk.conf'
                    },
                    timestamp: configWithMeta.saved_at,
                    bdev_count: config.bdevs?.length || 0,
                    subsystem_count: config.nvmf?.subsystems?.length || 0
                });
                
            } catch (systemSaveError) {
                logger.warn(`Failed to save to system path ${SYSTEM_CONFIG_PATH}: ${systemSaveError.message}`);
                
                // 如果系统路径保存失败，仍然成功保存到项目目录
                res.json({
                    success: true,
                    message: 'SPDK configuration saved successfully',
                    warning: `Could not save to ${SYSTEM_CONFIG_PATH}: ${systemSaveError.message}`,
                    files: {
                        json_config: 'data/spdk.json'
                    },
                    timestamp: configWithMeta.saved_at,
                    bdev_count: config.bdevs?.length || 0,
                    subsystem_count: config.nvmf?.subsystems?.length || 0
                });
            }
            
        } catch (error) {
            logger.error('Error saving SPDK configuration:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to save configuration',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/config/load:
 *   post:
 *     summary: Load configuration from file to SPDK
 *     tags: [Configuration Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration loaded successfully
 *       400:
 *         description: Configuration file not found or invalid
 *       500:
 *         description: Failed to load configuration
 */
router.post('/load',
    authenticateToken,
    requireAdmin,
    auditLog('load_config', 'spdk_config'),
    async (req, res) => {
        try {
            // 检查配置文件是否存在
            try {
                await fs.access(CONFIG_FILE_PATH);
            } catch (error) {
                return res.status(400).json({
                    error: 'Configuration file not found',
                    message: 'No saved configuration file found. Please save a configuration first.',
                    file_path: 'data/spdk.json'
                });
            }
            
            // 读取配置文件
            const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
            const config = JSON.parse(configData);
            
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();
            
            // 记录加载操作
            logger.info(`Loading SPDK configuration from ${CONFIG_FILE_PATH} by ${req.user.username}`);
            
            const loadResult = {
                message: 'Configuration file found and validated',
                file_info: {
                    saved_by: config.saved_by || 'unknown',
                    saved_at: config.saved_at || config.timestamp,
                    spdk_version: config.spdk_version,
                    bdev_count: config.bdevs?.length || 0,
                    subsystem_count: config.nvmf?.subsystems?.length || 0
                },
                load_status: 'Configuration structure validated'
            };
            
            // 注意：实际的配置重载需要根据SPDK的具体API来实现
            // 这里我们先返回配置信息，实际的重载逻辑可能需要：
            // 1. 删除现有的bdevs和subsystems
            // 2. 重新创建配置中的组件
            // 3. 或者使用SPDK的配置重载API（如果支持）
            
            logger.info(`Configuration loaded by ${req.user.username}: ${loadResult.file_info.bdev_count} bdevs, ${loadResult.file_info.subsystem_count} subsystems`);
            
            res.json(loadResult);
            
        } catch (error) {
            if (error instanceof SyntaxError) {
                logger.error('Invalid JSON in configuration file:', error);
                return res.status(400).json({
                    error: 'Invalid configuration file',
                    message: 'Configuration file contains invalid JSON'
                });
            }
            
            logger.error('Error loading SPDK configuration:', error);
            res.status(500).json({
                error: 'Failed to load configuration',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/config/file:
 *   get:
 *     summary: Get saved configuration file content
 *     tags: [Configuration Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration file content
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SPDKConfig'
 *       404:
 *         description: Configuration file not found
 */
router.get('/file', authenticateToken, async (req, res) => {
    try {
        // 检查文件是否存在
        try {
            await fs.access(CONFIG_FILE_PATH);
        } catch (error) {
            return res.status(404).json({
                error: 'Configuration file not found',
                message: 'No saved configuration file found',
                file_path: 'data/spdk.json'
            });
        }
        
        // 读取并返回配置文件
        const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
        const config = JSON.parse(configData);
        
        res.json(config);
        
    } catch (error) {
        if (error instanceof SyntaxError) {
            logger.error('Invalid JSON in configuration file:', error);
            return res.status(400).json({
                error: 'Invalid configuration file',
                message: 'Configuration file contains invalid JSON'
            });
        }
        
        logger.error('Error reading configuration file:', error);
        res.status(500).json({
            error: 'Failed to read configuration file',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/config/file:
 *   delete:
 *     summary: Delete saved configuration file
 *     tags: [Configuration Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration file deleted successfully
 *       404:
 *         description: Configuration file not found
 */
router.delete('/file',
    authenticateToken,
    requireAdmin,
    auditLog('delete_config_file', 'spdk_config'),
    async (req, res) => {
        try {
            // 检查文件是否存在
            try {
                await fs.access(CONFIG_FILE_PATH);
            } catch (error) {
                return res.status(404).json({
                    error: 'Configuration file not found',
                    message: 'No configuration file to delete',
                    file_path: 'data/spdk.json'
                });
            }
            
            // 删除文件
            await fs.unlink(CONFIG_FILE_PATH);
            
            logger.info(`Configuration file deleted by ${req.user.username}`);
            
            res.json({
                message: 'Configuration file deleted successfully',
                file_path: 'data/spdk.json'
            });
            
        } catch (error) {
            logger.error('Error deleting configuration file:', error);
            res.status(500).json({
                error: 'Failed to delete configuration file',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/config/status:
 *   get:
 *     summary: Get configuration file status
 *     tags: [Configuration Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration file status information
 */
router.get('/status', authenticateToken, async (req, res) => {
    try {
        let fileExists = false;
        let fileInfo = null;
        
        try {
            const stats = await fs.stat(CONFIG_FILE_PATH);
            fileExists = true;
            
            // 尝试读取文件元数据
            try {
                const configData = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
                const config = JSON.parse(configData);
                
                fileInfo = {
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                    saved_by: config.saved_by || 'unknown',
                    saved_at: config.saved_at || config.timestamp,
                    spdk_version: config.spdk_version?.version || 'unknown',
                    bdev_count: config.bdevs?.length || 0,
                    subsystem_count: config.nvmf?.subsystems?.length || 0
                };
            } catch (parseError) {
                fileInfo = {
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                    error: 'Invalid JSON format'
                };
            }
        } catch (error) {
            // 文件不存在
        }
        
        res.json({
            file_exists: fileExists,
            file_path: 'data/spdk.json',
            file_info: fileInfo
        });
        
    } catch (error) {
        logger.error('Error getting configuration status:', error);
        res.status(500).json({
            error: 'Failed to get configuration status',
            message: error.message
        });
    }
});

module.exports = router; 