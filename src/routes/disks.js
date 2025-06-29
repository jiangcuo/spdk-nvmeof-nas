const express = require('express');
const router = express.Router();
const { validate, diskSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const DiskService = require('../services/diskService');
const logger = require('../utils/logger');

const diskService = new DiskService();

/**
 * @swagger
 * /api/disks:
 *   get:
 *     summary: Get all physical disks
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Physical disks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: Device name
 *                   device_path:
 *                     type: string
 *                     description: Device path
 *                   size:
 *                     type: string
 *                     description: Human readable size
 *                   size_bytes:
 *                     type: number
 *                     description: Size in bytes
 *                   type:
 *                     type: string
 *                     enum: [block, nvme]
 *                   transport:
 *                     type: string
 *                     description: Transport type
 *                   model:
 *                     type: string
 *                     description: Device model
 *                   serial:
 *                     type: string
 *                     description: Serial number
 *                   vendor:
 *                     type: string
 *                     description: Vendor name
 *                   rotational:
 *                     type: boolean
 *                     description: Whether disk is rotational
 *                   readonly:
 *                     type: boolean
 *                     description: Whether disk is read-only
 *                   physical_sector_size:
 *                     type: string
 *                     description: Physical sector size
 *                   logical_sector_size:
 *                     type: string
 *                     description: Logical sector size
 *                   kernel_mode:
 *                     type: boolean
 *                     description: Whether device is controlled by kernel driver (true) or user-space driver (false)
 *                   pcie_addr:
 *                     type: string
 *                     description: PCIe address for NVMe devices (format like 0000:00:04.0)
 *                   partitions:
 *                     type: array
 *                     description: Disk partitions
 *                   mountpoints:
 *                     type: array
 *                     description: Mount points
 *                   is_mounted:
 *                     type: boolean
 *                     description: Whether disk is mounted
 *                   is_spdk_bdev:
 *                     type: boolean
 *                     description: Whether disk is used by SPDK
 *                   spdk_bdev_info:
 *                     type: object
 *                     description: SPDK bdev information if applicable
 *                   nvme_discovery_info:
 *                     type: object
 *                     description: NVMe discovery information for user-space devices
 */
router.get('/',
    authenticateToken,
    async (req, res) => {
        try {
            const disks = await diskService.getAllDisks();

            res.json({
                success: true,
                data: {
                    disks: disks,
                    total: disks.length
                }
            });

        } catch (error) {
            logger.error('Error getting physical disks:', error);
            res.status(500).json({
                error: 'Failed to get physical disks',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/disks/stats:
 *   get:
 *     summary: Get disk statistics
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disk statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_disks:
 *                   type: number
 *                   description: Total number of disks
 *                 mounted_disks:
 *                   type: number
 *                   description: Number of mounted disks
 *                 spdk_bdev_disks:
 *                   type: number
 *                   description: Number of disks used by SPDK
 *                 available_disks:
 *                   type: number
 *                   description: Number of available disks
 *                 nvme_disks:
 *                   type: number
 *                   description: Number of NVMe disks
 *                 block_disks:
 *                   type: number
 *                   description: Number of block disks
 *                 total_capacity:
 *                   type: number
 *                   description: Total capacity in bytes
 *                 rotational_disks:
 *                   type: number
 *                   description: Number of rotational disks
 *                 ssd_disks:
 *                   type: number
 *                   description: Number of SSD disks
 */
router.get('/stats',
    authenticateToken,
    async (req, res) => {
        try {
            const stats = await diskService.getDiskStats();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            logger.error('Error getting disk statistics:', error);
            res.status(500).json({
                error: 'Failed to get disk statistics',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/disks/{deviceName}:
 *   get:
 *     summary: Get specific disk information
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceName
 *         required: true
 *         schema:
 *           type: string
 *         description: Device name (e.g., sda, nvme0n1)
 *     responses:
 *       200:
 *         description: Disk information retrieved successfully
 *       404:
 *         description: Disk not found
 */
router.get('/:deviceName',
    authenticateToken,
    async (req, res) => {
        try {
            const { deviceName } = req.params;

            const diskInfo = await diskService.getDiskInfo(deviceName);

            res.json(diskInfo);

        } catch (error) {
            if (error.message.includes('not found')) {
                return res.status(404).json({
                    error: 'Disk not found',
                    message: error.message
                });
            }

            logger.error('Error getting disk information:', error);
            res.status(500).json({
                error: 'Failed to get disk information',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/disks/{deviceName}/health:
 *   get:
 *     summary: Get disk health status
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceName
 *         required: true
 *         schema:
 *           type: string
 *         description: Device name (e.g., sda, nvme0n1)
 *     responses:
 *       200:
 *         description: Disk health status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy, unknown, error]
 *                   description: Health status
 *                 message:
 *                   type: string
 *                   description: Health status message
 *       404:
 *         description: Disk not found
 */
router.get('/:deviceName/health',
    authenticateToken,
    async (req, res) => {
        try {
            const { deviceName } = req.params;

            // 首先检查磁盘是否存在
            await diskService.getDiskInfo(deviceName);

            const healthStatus = await diskService.checkDiskHealth(deviceName);

            res.json(healthStatus);

        } catch (error) {
            if (error.message.includes('not found')) {
                return res.status(404).json({
                    error: 'Disk not found',
                    message: error.message
                });
            }

            logger.error('Error getting disk health:', error);
            res.status(500).json({
                error: 'Failed to get disk health',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/disks/{deviceName}/smart:
 *   get:
 *     summary: Get disk SMART information
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceName
 *         required: true
 *         schema:
 *           type: string
 *         description: Device name (e.g., sda, nvme0n1)
 *     responses:
 *       200:
 *         description: SMART information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: SMART data (format depends on disk type)
 *       404:
 *         description: Disk not found or SMART not supported
 */
router.get('/:deviceName/smart',
    authenticateToken,
    async (req, res) => {
        try {
            const { deviceName } = req.params;

            // 首先检查磁盘是否存在
            await diskService.getDiskInfo(deviceName);

            const smartInfo = await diskService.getDiskSmartInfo(deviceName);

            if (!smartInfo) {
                return res.status(404).json({
                    error: 'SMART data not available',
                    message: `SMART information is not available for disk '${deviceName}'. This may be because the disk doesn't support SMART or smartctl is not installed.`
                });
            }

            res.json(smartInfo);

        } catch (error) {
            if (error.message.includes('not found')) {
                return res.status(404).json({
                    error: 'Disk not found',
                    message: error.message
                });
            }

            logger.error('Error getting SMART information:', error);
            res.status(500).json({
                error: 'Failed to get SMART information',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/disks/scan/refresh:
 *   post:
 *     summary: Refresh disk scan
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disk scan refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 scan_time:
 *                   type: string
 *                 disks_found:
 *                   type: number
 */
router.post('/scan/refresh',
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const startTime = new Date();
            
            // 强制重新扫描磁盘
            const disks = await diskService.getAllDisks();
            
            const endTime = new Date();
            const scanTime = endTime - startTime;

            logger.info(`Disk scan refreshed by ${req.user.username}, found ${disks.length} disks in ${scanTime}ms`);

            res.json({
                message: 'Disk scan refreshed successfully',
                scan_time: `${scanTime}ms`,
                disks_found: disks.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Error refreshing disk scan:', error);
            res.status(500).json({
                error: 'Failed to refresh disk scan',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/disks/available:
 *   get:
 *     summary: Get available disks (not mounted and not used by SPDK)
 *     tags: [Physical Disk Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available disks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 description: Available disk information
 */
router.get('/available',
    authenticateToken,
    async (req, res) => {
        try {
            const allDisks = await diskService.getAllDisks();
            
            // 过滤出可用的磁盘（未挂载且未被SPDK使用）
            const availableDisks = allDisks.filter(disk => 
                !disk.is_mounted && 
                !disk.is_spdk_bdev && 
                !disk.readonly && 
                !disk.removable
            );

            res.json(availableDisks);

        } catch (error) {
            logger.error('Error getting available disks:', error);
            res.status(500).json({
                error: 'Failed to get available disks',
                message: error.message
            });
        }
    }
);

module.exports = router; 