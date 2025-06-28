const express = require('express');
const database = require('../config/database');
const SPDKRpcClient = require('../services/spdkRpcClient');
const { validate, bdevSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Bdev:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         type:
 *           type: string
 *         size_bytes:
 *           type: integer
 *         block_size:
 *           type: integer
 *         uuid:
 *           type: string
 *         transport_address:
 *           type: string
 *         namespace_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         is_active:
 *           type: boolean
 */

/**
 * @swagger
 * /api/bdevs:
 *   get:
 *     summary: Get all block devices
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by device type
 *     responses:
 *       200:
 *         description: List of block devices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bdevs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Bdev'
 *                 total:
 *                   type: integer
 *                 spdk_bdevs:
 *                   type: array
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        // 直接从 SPDK 获取实时数据
        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();
        let bdevs = await spdkClient.getBdevs();

        // 如果有类型过滤参数，进行过滤
        if (req.query.type) {
            bdevs = bdevs.filter(bdev => 
                bdev.driver_specific && 
                bdev.driver_specific[req.query.type.toLowerCase()]
            );
        }

        res.json({
            success: true,
            data: {
                bdevs: bdevs,
                total: bdevs.length
            }
        });
    } catch (error) {
        logger.error('Error getting bdevs from SPDK:', error);
        res.status(500).json({
            error: 'Failed to get bdevs',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/bdevs/nvme/attach:
 *   post:
 *     summary: Attach NVMe controller
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - trtype
 *               - traddr
 *             properties:
 *               name:
 *                 type: string
 *                 description: Controller name
 *               trtype:
 *                 type: string
 *                 enum: [pcie, tcp, rdma, fc]
 *                 description: Transport type
 *               traddr:
 *                 type: string
 *                 description: Transport address
 *               adrfam:
 *                 type: string
 *                 enum: [ipv4, ipv6, ib, fc]
 *                 description: Address family
 *               trsvcid:
 *                 type: string
 *                 description: Transport service ID
 *     responses:
 *       201:
 *         description: NVMe controller attached successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: SPDK operation failed
 */
router.post('/nvme/attach',
    authenticateToken,
    requireAdmin,
    validate(bdevSchemas.attachNvme),
    auditLog('attach_nvme', 'bdev'),
    async (req, res) => {
        try {
            const { name, trtype, traddr, adrfam, trsvcid } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查设备是否已存在 (直接从 SPDK 查询)
            const existingBdevs = await spdkClient.getBdevs();
            const existingBdev = existingBdevs.find(bdev => bdev.name === name);

            if (existingBdev) {
                return res.status(400).json({
                    error: 'Bdev already exists',
                    message: 'A block device with this name already exists'
                });
            }

            try {
                const result = await spdkClient.attachNvmeController(name, trtype, traddr, adrfam, trsvcid);
                logger.info(`NVMe controller attached: ${name}`);

                // 获取新创建的bdev信息
                const spdkBdevs = await spdkClient.getBdevs();
                const newBdev = spdkBdevs.find(bdev => bdev.name === name);

                res.status(201).json({
                    message: 'NVMe controller attached successfully',
                    bdev: newBdev || result
                });

            } catch (spdkError) {
                logger.error('NVMe attach failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error attaching NVMe:', error);
            res.status(500).json({
                error: 'Failed to attach NVMe controller',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/bdevs/malloc:
 *   post:
 *     summary: Create malloc block device (for testing)
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - num_blocks
 *             properties:
 *               name:
 *                 type: string
 *                 description: Device name
 *               num_blocks:
 *                 type: integer
 *                 minimum: 1
 *                 description: Number of blocks
 *               block_size:
 *                 type: integer
 *                 enum: [512, 1024, 2048, 4096]
 *                 default: 512
 *                 description: Block size in bytes
 *     responses:
 *       201:
 *         description: Malloc bdev created successfully
 */
router.post('/malloc',
    authenticateToken,
    requireAdmin,
    validate(bdevSchemas.createMalloc),
    auditLog('create_malloc', 'bdev'),
    async (req, res) => {
        try {
            const { name, num_blocks, block_size } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查设备是否已存在 (直接从 SPDK 查询)
            const existingBdevs = await spdkClient.getBdevs();
            const existingBdev = existingBdevs.find(bdev => bdev.name === name);

            if (existingBdev) {
                return res.status(400).json({
                    error: 'Bdev already exists',
                    message: 'A block device with this name already exists'
                });
            }

            try {
                const result = await spdkClient.createMallocBdev(name, num_blocks, block_size);
                logger.info(`Malloc bdev created: ${name}`);

                // 获取新创建的bdev信息
                const spdkBdevs = await spdkClient.getBdevs();
                const newBdev = spdkBdevs.find(bdev => bdev.name === name);

                res.status(201).json({
                    message: 'Malloc bdev created successfully',
                    bdev: newBdev || {
                        name: name,
                        type: 'malloc',
                        size_bytes: num_blocks * block_size,
                        block_size: block_size
                    }
                });

            } catch (spdkError) {
                logger.error('Malloc bdev creation failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error creating malloc bdev:', error);
            res.status(500).json({
                error: 'Failed to create malloc bdev',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/bdevs/{name}:
 *   delete:
 *     summary: Delete block device (type-specific)
 *     description: Delete block device using the appropriate method based on bdev type
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Block device name
 *     responses:
 *       200:
 *         description: Block device deleted successfully
 *       404:
 *         description: Block device not found
 *       400:
 *         description: Unsupported bdev type for deletion
 */
router.delete('/:name',
    authenticateToken,
    requireAdmin,
    auditLog('delete_bdev', 'bdev'),
    async (req, res) => {
        try {
            const bdevName = decodeURIComponent(req.params.name);
            
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 从 SPDK 查找 bdev
            const bdevs = await spdkClient.getBdevs();
            const bdev = bdevs.find(b => b.name === bdevName);

            if (!bdev) {
                return res.status(404).json({
                    error: 'Bdev not found',
                    message: 'The requested block device does not exist'
                });
            }

            try {
                // 根据 bdev 类型选择正确的删除方法
                // 首先尝试从 driver_specific 中获取类型
                let driverType = null;
                
                if (bdev.driver_specific && Object.keys(bdev.driver_specific).length > 0) {
                    // 从 driver_specific 中获取类型（排除 mp_policy）
                    const driverKeys = Object.keys(bdev.driver_specific).filter(key => key !== 'mp_policy');
                    driverType = driverKeys.length > 0 ? driverKeys[0] : null;
                }
                
                // 如果 driver_specific 中没有类型信息，使用 product_name 判断
                if (!driverType && bdev.product_name) {
                    if (bdev.product_name.includes('Malloc')) {
                        driverType = 'malloc';
                    } else if (bdev.product_name.includes('NVMe')) {
                        driverType = 'nvme';
                    } else if (bdev.product_name.includes('AIO')) {
                        driverType = 'aio';
                    } else if (bdev.product_name.includes('Null')) {
                        driverType = 'null';
                    } else if (bdev.product_name.includes('Logical Volume') || bdev.product_name.includes('LVol')) {
                        driverType = 'lvol';
                    } else if (bdev.product_name.includes('RBD')) {
                        driverType = 'rbd';
                    } else if (bdev.product_name.includes('Raid Volume')) {
                        return res.status(400).json({
                            error: 'Cannot delete RAID member',
                            message: 'This BDEV is part of a RAID array. Please delete the RAID first.'
                        });
                    }
                }
                
                if (!driverType) {
                    return res.status(400).json({
                        error: 'Unknown bdev type',
                        message: `Cannot determine bdev type for ${bdevName}. Product: ${bdev.product_name}`
                    });
                }
                
                // 根据类型调用相应的删除方法
                if (driverType === 'nvme') {
                    // 对于NVMe设备，需要从命名空间名称提取控制器名称
                    // 格式通常是: 控制器名称 + 'n' + 命名空间号 (如: nvn1 -> nv1)
                    const controllerName = bdevName.replace(/n\d+$/, '');
                    await spdkClient.deleteNvmeBdev(controllerName);
                } else if (driverType === 'aio') {
                    await spdkClient.deleteAioBdev(bdevName);
                } else if (driverType === 'malloc') {
                    await spdkClient.deleteMallocBdev(bdevName);
                } else if (driverType === 'null') {
                    await spdkClient.deleteNullBdev(bdevName);
                } else if (driverType === 'lvol') {
                    await spdkClient.deleteLvol(bdevName);
                } else if (driverType === 'rbd') {
                    await spdkClient.deleteRbdBdev(bdevName);
                } else {
                    return res.status(400).json({
                        error: 'Unsupported bdev type',
                        message: `Deletion of ${driverType} bdevs is not supported. Supported types: nvme, aio, malloc, null, lvol, rbd`
                    });
                }
                
                logger.info(`Bdev deleted: ${bdevName} (type: ${driverType})`);
            } catch (spdkError) {
                logger.error('SPDK bdev deletion failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

            logger.info(`Bdev deleted by ${req.user.username}: ${bdevName}`);

            res.json({
                message: 'Block device deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting bdev:', error);
            res.status(500).json({
                error: 'Failed to delete block device',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/bdevs/nvme/{name}/detach:
 *   post:
 *     summary: Detach NVMe controller
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: NVMe controller name
 *     responses:
 *       200:
 *         description: NVMe controller detached successfully
 *       404:
 *         description: NVMe controller not found
 */
router.post('/nvme/:name/detach',
    authenticateToken,
    requireAdmin,
    auditLog('detach_nvme', 'bdev'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            try {
                await spdkClient.detachNvmeController(name);
                logger.info(`NVMe controller detached: ${name}`);

                // 更新数据库中对应的 bdev 状态为非活跃
                await database.run(
                    'UPDATE bdevs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE name LIKE ? || "%"',
                    [name]
                );

                res.json({
                    message: 'NVMe controller detached successfully'
                });

            } catch (spdkError) {
                logger.error('NVMe controller detach failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error detaching NVMe controller:', error);
            res.status(500).json({
                error: 'Failed to detach NVMe controller',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/bdevs/aio:
 *   post:
 *     summary: Create AIO block device
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - filename
 *             properties:
 *               name:
 *                 type: string
 *                 description: AIO bdev name
 *               filename:
 *                 type: string
 *                 description: Path to the file or block device
 *               block_size:
 *                 type: integer
 *                 enum: [512, 1024, 2048, 4096]
 *                 default: 512
 *                 description: Block size in bytes
 *     responses:
 *       201:
 *         description: AIO bdev created successfully
 *       400:
 *         description: Invalid input data
 */
router.post('/aio',
    authenticateToken,
    requireAdmin,
    validate(bdevSchemas.createAio),
    auditLog('create_aio', 'bdev'),
    async (req, res) => {
        try {
            const { name, filename, block_size = 512 } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查设备是否已存在 (直接从 SPDK 查询)
            const existingBdevs = await spdkClient.getBdevs();
            const existingBdev = existingBdevs.find(bdev => bdev.name === name);

            if (existingBdev) {
                return res.status(400).json({
                    error: 'Bdev already exists',
                    message: 'A block device with this name already exists'
                });
            }

            try {
                const result = await spdkClient.createAioBdev(name, filename, block_size);
                logger.info(`AIO bdev created: ${name} -> ${filename}`);

                // 获取新创建的bdev信息
                const spdkBdevs = await spdkClient.getBdevs();
                const newBdev = spdkBdevs.find(bdev => bdev.name === name);

                res.status(201).json({
                    message: 'AIO bdev created successfully',
                    bdev: newBdev || {
                        name: name,
                        type: 'aio',
                        filename: filename,
                        block_size: block_size
                    }
                });

            } catch (spdkError) {
                logger.error('AIO bdev creation failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error creating AIO bdev:', error);
            res.status(500).json({
                error: 'Failed to create AIO bdev',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/bdevs/aio/{name}:
 *   delete:
 *     summary: Delete AIO block device
 *     tags: [Block Device Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: AIO bdev name
 *     responses:
 *       200:
 *         description: AIO bdev deleted successfully
 *       404:
 *         description: AIO bdev not found
 */
router.delete('/aio/:name',
    authenticateToken,
    requireAdmin,
    auditLog('delete_aio', 'bdev'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 从 SPDK 查找 AIO bdev
            const bdevs = await spdkClient.getBdevs();
            const bdev = bdevs.find(b => b.name === name && b.driver_specific && b.driver_specific.aio);

            if (!bdev) {
                return res.status(404).json({
                    error: 'AIO bdev not found',
                    message: 'The requested AIO block device does not exist'
                });
            }

            try {
                await spdkClient.deleteAioBdev(name);
                logger.info(`AIO bdev deleted: ${name}`);

                res.json({
                    message: 'AIO bdev deleted successfully'
                });

            } catch (spdkError) {
                logger.error('AIO bdev deletion failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error deleting AIO bdev:', error);
            res.status(500).json({
                error: 'Failed to delete AIO bdev',
                message: error.message
            });
        }
    }
);

module.exports = router; 