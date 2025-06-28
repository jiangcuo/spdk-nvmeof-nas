const express = require('express');
const database = require('../config/database');
const SPDKRpcClient = require('../services/spdkRpcClient');
const { validate, raidSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Raid:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         raid_level:
 *           type: string
 *           enum: [raid0, raid1, raid5f, concat]
 *         strip_size:
 *           type: integer
 *         num_base_bdevs:
 *           type: integer
 *         base_bdevs:
 *           type: string
 *           description: JSON array of base bdev names
 *         created_at:
 *           type: string
 *           format: date-time
 *         is_active:
 *           type: boolean
 */

/**
 * @swagger
 * /api/raids:
 *   get:
 *     summary: Get all RAID arrays
 *     tags: [RAID Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *     responses:
 *       200:
 *         description: List of RAID arrays
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 raids:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Raid'
 *                 total:
 *                   type: integer
 *                 spdk_raids:
 *                   type: array
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const raids = await database.all(
            'SELECT * FROM raids WHERE is_active = 1 ORDER BY created_at DESC'
        );

        // 解析base_bdevs JSON字符串
        raids.forEach(raid => {
            try {
                raid.base_bdevs = JSON.parse(raid.base_bdevs);
            } catch (e) {
                raid.base_bdevs = [];
            }
        });

                 // 获取SPDK实时数据
         let spdkRaids = [];
         try {
             const spdkClient = new SPDKRpcClient();
             await spdkClient.checkConnection();
             spdkRaids = await spdkClient.getRaidBdevs();
         } catch (spdkError) {
             logger.warn('Failed to get SPDK RAIDs:', spdkError.message);
         }

        res.json({
            raids: raids,
            total: raids.length,
            spdk_raids: spdkRaids
        });
    } catch (error) {
        logger.error('Error getting RAIDs:', error);
        res.status(500).json({
            error: 'Failed to get RAIDs',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/raids:
 *   post:
 *     summary: Create a new RAID array
 *     tags: [RAID Management]
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
 *               - raid_level
 *               - base_bdevs
 *             properties:
 *               name:
 *                 type: string
 *                 description: RAID array name
 *               raid_level:
 *                 type: string
 *                 enum: [raid0, raid1, raid5f, concat]
 *                 description: RAID level
 *               base_bdevs:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 description: Array of base block device names
 *               strip_size:
 *                 type: integer
 *                 minimum: 1
 *                 description: Strip size for RAID (optional)
 *     responses:
 *       201:
 *         description: RAID array created successfully
 *       400:
 *         description: Validation error or RAID already exists
 *       500:
 *         description: SPDK operation failed
 */
router.post('/',
    authenticateToken,
    requireAdmin,
    validate(raidSchemas.create),
    auditLog('create_raid', 'raid'),
    async (req, res) => {
        try {
            const { name, raid_level, base_bdevs, strip_size } = req.body;

            // 检查RAID是否已存在
            const existingRaid = await database.get(
                'SELECT id FROM raids WHERE name = ?',
                [name]
            );

            if (existingRaid) {
                return res.status(400).json({
                    error: 'RAID already exists',
                    message: 'A RAID with this name already exists'
                });
            }

            // 创建SPDK RAID - 先获取连接
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 验证base bdevs是否存在于SPDK中
            try {
                const spdkBdevs = await spdkClient.getBdevs();
                const availableBdevNames = spdkBdevs.map(bdev => bdev.name);
                
                for (const bdevName of base_bdevs) {
                    if (!availableBdevNames.includes(bdevName)) {
                        return res.status(400).json({
                            error: 'Base bdev not found',
                            message: `Block device '${bdevName}' does not exist in SPDK`
                        });
                    }
                }
            } catch (bdevError) {
                logger.error('Failed to get SPDK BDEVs for validation:', bdevError);
                return res.status(500).json({
                    error: 'Failed to validate BDEVs',
                    message: 'Unable to connect to SPDK or get BDEV list'
                });
            }

            // 使用已创建的SPDK客户端创建RAID
            try {
                const result = await spdkClient.createRaid(name, raid_level, base_bdevs, strip_size);
                logger.info(`SPDK RAID created: ${name}`);

                // 保存到数据库
                const dbResult = await database.run(
                    `INSERT INTO raids (name, raid_level, strip_size, num_base_bdevs, base_bdevs, created_by)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        name,
                        raid_level,
                        strip_size,
                        base_bdevs.length,
                        JSON.stringify(base_bdevs),
                        req.user.id
                    ]
                );

                const newRaid = await database.get(
                    'SELECT * FROM raids WHERE id = ?',
                    [dbResult.id]
                );

                // 解析base_bdevs
                newRaid.base_bdevs = JSON.parse(newRaid.base_bdevs);

                logger.info(`RAID created by ${req.user.username}: ${name}`);

                res.status(201).json({
                    message: 'RAID array created successfully',
                    raid: newRaid
                });

            } catch (spdkError) {
                logger.error('SPDK RAID creation failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error creating RAID:', error);
            res.status(500).json({
                error: 'Failed to create RAID',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/raids/{id}:
 *   get:
 *     summary: Get RAID array by ID
 *     tags: [RAID Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: RAID ID
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *     responses:
 *       200:
 *         description: RAID array details
 *       404:
 *         description: RAID not found
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const raid = await database.get(
            'SELECT * FROM raids WHERE id = ? AND is_active = 1',
            [req.params.id]
        );

        if (!raid) {
            return res.status(404).json({
                error: 'RAID not found',
                message: 'The requested RAID does not exist'
            });
        }

        // 解析base_bdevs
        try {
            raid.base_bdevs = JSON.parse(raid.base_bdevs);
        } catch (e) {
            raid.base_bdevs = [];
        }

        // 获取SPDK实时数据
        let spdkRaid = null;
        try {
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();
            const raids = await spdkClient.getRaidBdevs();
            spdkRaid = raids.find(r => r.name === raid.name);
        } catch (spdkError) {
            logger.warn('Failed to get SPDK RAID:', spdkError.message);
        }

        res.json({
            ...raid,
            spdk_raid: spdkRaid
        });
    } catch (error) {
        logger.error('Error getting RAID:', error);
        res.status(500).json({
            error: 'Failed to get RAID',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/raids/{id}:
 *   delete:
 *     summary: Delete RAID array
 *     tags: [RAID Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: RAID ID
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *     responses:
 *       200:
 *         description: RAID array deleted successfully
 *       404:
 *         description: RAID not found
 */
router.delete('/:id',
    authenticateToken,
    requireAdmin,
    auditLog('delete_raid', 'raid'),
    async (req, res) => {
        try {
            const raid = await database.get(
                'SELECT * FROM raids WHERE id = ? AND is_active = 1',
                [req.params.id]
            );

            if (!raid) {
                return res.status(404).json({
                    error: 'RAID not found',
                    message: 'The requested RAID does not exist'
                });
            }

            // 删除SPDK RAID
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            try {
                await spdkClient.deleteRaid(raid.name);
                logger.info(`SPDK RAID deleted: ${raid.name}`);
            } catch (spdkError) {
                logger.warn('SPDK RAID deletion failed:', spdkError.message);
                // 继续执行数据库删除
            }

            // 软删除数据库记录
            await database.run(
                'UPDATE raids SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [req.params.id]
            );

            logger.info(`RAID deleted by ${req.user.username}: ${raid.name}`);

            res.json({
                message: 'RAID array deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting RAID:', error);
            res.status(500).json({
                error: 'Failed to delete RAID',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/raids/name/{name}:
 *   delete:
 *     summary: Delete RAID array by name
 *     tags: [RAID Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: RAID name
 *       - in: query
 *         name: socket_path
 *         schema:
 *           type: string
 *         description: Custom SPDK socket path
 *     responses:
 *       200:
 *         description: RAID array deleted successfully
 *       404:
 *         description: RAID not found
 */
router.delete('/name/:name',
    authenticateToken,
    requireAdmin,
    auditLog('delete_raid', 'raid'),
    async (req, res) => {
        try {
            const raidName = req.params.name;

            // 删除SPDK RAID
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            try {
                await spdkClient.deleteRaid(raidName);
                logger.info(`SPDK RAID deleted: ${raidName}`);
            } catch (spdkError) {
                logger.error('SPDK RAID deletion failed:', spdkError.message);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

            // 软删除数据库记录（如果存在）
            const raid = await database.get(
                'SELECT * FROM raids WHERE name = ? AND is_active = 1',
                [raidName]
            );
            
            if (raid) {
                await database.run(
                    'UPDATE raids SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
                    [raidName]
                );
            }

            logger.info(`RAID deleted by ${req.user.username}: ${raidName}`);

            res.json({
                message: 'RAID array deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting RAID:', error);
            res.status(500).json({
                error: 'Failed to delete RAID',
                message: error.message
            });
        }
    }
);

module.exports = router; 