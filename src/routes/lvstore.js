const express = require('express');
const router = express.Router();
const { validate, lvstoreSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const SPDKRpcClient = require('../services/spdkRpcClient');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/lvstore:
 *   get:
 *     summary: Get all LV stores
 *     tags: [LV Store Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: LV stores retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uuid:
 *                     type: string
 *                   name:
 *                     type: string
 *                   base_bdev:
 *                     type: string
 *                   cluster_size:
 *                     type: number
 *                   total_data_clusters:
 *                     type: number
 *                   free_clusters:
 *                     type: number
 */
router.get('/',
    authenticateToken,
    async (req, res) => {
        try {
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            const lvstores = await spdkClient.getLvstores();

            res.json(lvstores);

        } catch (error) {
            logger.error('Error getting LV stores:', error);
            res.status(500).json({
                error: 'Failed to get LV stores',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvstore:
 *   post:
 *     summary: Create LV store
 *     tags: [LV Store Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bdev_name
 *               - lvs_name
 *             properties:
 *               bdev_name:
 *                 type: string
 *                 description: Base bdev name for the LV store
 *                 example: malloc0
 *               lvs_name:
 *                 type: string
 *                 description: LV store name
 *                 example: lvs0
 *               cluster_sz:
 *                 type: number
 *                 description: Cluster size in bytes (optional)
 *                 example: 65536
 *     responses:
 *       201:
 *         description: LV store created successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Base bdev not found
 */
router.post('/',
    authenticateToken,
    requireAdmin,
    validate(lvstoreSchemas.create),
    auditLog('create_lvstore', 'lvstore'),
    async (req, res) => {
        try {
            const { bdev_name, lvs_name, cluster_sz } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查基础 bdev 是否存在
            const bdevs = await spdkClient.getBdevs();
            const baseBdev = bdevs.find(bdev => bdev.name === bdev_name);
            
            if (!baseBdev) {
                return res.status(404).json({
                    error: 'Base bdev not found',
                    message: `Base bdev '${bdev_name}' does not exist`
                });
            }

            // 检查 LV store 名称是否已存在
            const existingLvstores = await spdkClient.getLvstores();
            const existingLvstore = existingLvstores.find(lvs => lvs.name === lvs_name);
            
            if (existingLvstore) {
                return res.status(400).json({
                    error: 'LV store name already exists',
                    message: `LV store '${lvs_name}' already exists`
                });
            }

            // 创建 LV store
            const result = await spdkClient.createLvstore(bdev_name, lvs_name, cluster_sz);
            
            logger.info(`LV store created by ${req.user.username}: ${lvs_name} on ${bdev_name}`);

            res.status(201).json({
                message: 'LV store created successfully',
                lvstore: result
            });

        } catch (error) {
            logger.error('Error creating LV store:', error);
            res.status(500).json({
                error: 'Failed to create LV store',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvstore/rename:
 *   put:
 *     summary: Rename LV store
 *     tags: [LV Store Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - old_name
 *               - new_name
 *             properties:
 *               old_name:
 *                 type: string
 *                 description: Current LV store name
 *                 example: lvs0
 *               new_name:
 *                 type: string
 *                 description: New LV store name
 *                 example: lvs_renamed
 *     responses:
 *       200:
 *         description: LV store renamed successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: LV store not found
 */
router.put('/rename',
    authenticateToken,
    requireAdmin,
    validate(lvstoreSchemas.rename),
    auditLog('rename_lvstore', 'lvstore'),
    async (req, res) => {
        try {
            const { old_name, new_name } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查原 LV store 是否存在
            const lvstores = await spdkClient.getLvstores();
            const existingLvstore = lvstores.find(lvs => lvs.name === old_name);
            
            if (!existingLvstore) {
                return res.status(404).json({
                    error: 'LV store not found',
                    message: `LV store '${old_name}' does not exist`
                });
            }

            // 检查新名称是否已存在
            const nameConflict = lvstores.find(lvs => lvs.name === new_name);
            if (nameConflict) {
                return res.status(400).json({
                    error: 'LV store name already exists',
                    message: `LV store '${new_name}' already exists`
                });
            }

            // 重命名 LV store
            await spdkClient.renameLvstore(old_name, new_name);
            
            logger.info(`LV store renamed by ${req.user.username}: ${old_name} -> ${new_name}`);

            res.json({
                message: 'LV store renamed successfully',
                old_name: old_name,
                new_name: new_name
            });

        } catch (error) {
            logger.error('Error renaming LV store:', error);
            res.status(500).json({
                error: 'Failed to rename LV store',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvstore/{uuid}/grow:
 *   put:
 *     summary: Grow LV store to underlying bdev size
 *     tags: [LV Store Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: LV store UUID
 *     responses:
 *       200:
 *         description: LV store grown successfully
 *       404:
 *         description: LV store not found
 */
router.put('/:uuid/grow',
    authenticateToken,
    requireAdmin,
    auditLog('grow_lvstore', 'lvstore'),
    async (req, res) => {
        try {
            const { uuid } = req.params;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LV store 是否存在
            const lvstores = await spdkClient.getLvstores();
            const lvstore = lvstores.find(lvs => lvs.uuid === uuid);
            
            if (!lvstore) {
                return res.status(404).json({
                    error: 'LV store not found',
                    message: `LV store with UUID '${uuid}' does not exist`
                });
            }

            // 扩展 LV store
            await spdkClient.growLvstore(uuid);
            
            logger.info(`LV store grown by ${req.user.username}: ${uuid}`);

            res.json({
                message: 'LV store grown successfully',
                uuid: uuid
            });

        } catch (error) {
            logger.error('Error growing LV store:', error);
            res.status(500).json({
                error: 'Failed to grow LV store',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvstore/{uuid}:
 *   delete:
 *     summary: Delete LV store
 *     tags: [LV Store Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *         description: LV store UUID
 *     responses:
 *       200:
 *         description: LV store deleted successfully
 *       404:
 *         description: LV store not found
 */
router.delete('/:uuid',
    authenticateToken,
    requireAdmin,
    auditLog('delete_lvstore', 'lvstore'),
    async (req, res) => {
        try {
            const { uuid } = req.params;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LV store 是否存在
            const lvstores = await spdkClient.getLvstores();
            const lvstore = lvstores.find(lvs => lvs.uuid === uuid);
            
            if (!lvstore) {
                return res.status(404).json({
                    error: 'LV store not found',
                    message: `LV store with UUID '${uuid}' does not exist`
                });
            }

            // 检查是否有相关的 LVol
            const lvols = await spdkClient.getLvols();
            const relatedLvols = lvols.filter(lvol => lvol.lvol_store_uuid === uuid);
            
            if (relatedLvols.length > 0) {
                return res.status(400).json({
                    error: 'LV store has associated LVols',
                    message: `Cannot delete LV store '${uuid}' because it has ${relatedLvols.length} associated LVol(s)`,
                    associated_lvols: relatedLvols.map(lvol => lvol.name)
                });
            }

            // 删除 LV store
            await spdkClient.deleteLvstore(uuid);
            
            logger.info(`LV store deleted by ${req.user.username}: ${uuid} (${lvstore.name})`);

            res.json({
                message: 'LV store deleted successfully',
                uuid: uuid,
                name: lvstore.name
            });

        } catch (error) {
            logger.error('Error deleting LV store:', error);
            res.status(500).json({
                error: 'Failed to delete LV store',
                message: error.message
            });
        }
    }
);

module.exports = router; 