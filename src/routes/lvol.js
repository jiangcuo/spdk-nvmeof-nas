const express = require('express');
const router = express.Router();
const { validate, lvolSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const SPDKRpcClient = require('../services/spdkRpcClient');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/lvol:
 *   get:
 *     summary: Get all logical volumes
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: LVols retrieved successfully
 */
router.get('/',
    authenticateToken,
    async (req, res) => {
        try {
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            const lvols = await spdkClient.getLvols();

            res.json(lvols);

        } catch (error) {
            logger.error('Error getting LVols:', error);
            res.status(500).json({
                error: 'Failed to get LVols',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol:
 *   post:
 *     summary: Create logical volume
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lvol_store_uuid
 *               - lvol_name
 *               - size
 *             properties:
 *               lvol_store_uuid:
 *                 type: string
 *                 description: LV store UUID
 *               lvol_name:
 *                 type: string
 *                 description: LVol name
 *               size:
 *                 type: number
 *                 description: Size in bytes
 *               thin_provision:
 *                 type: boolean
 *                 default: true
 *               clear_method:
 *                 type: string
 *                 enum: [none, unmap, write_zeroes]
 */
router.post('/',
    authenticateToken,
    requireAdmin,
    validate(lvolSchemas.create),
    auditLog('create_lvol', 'lvol'),
    async (req, res) => {
        try {
            const { uuid, lvol_name, size_in_mib, thin_provision, clear_method } = req.body;

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

            // 检查 LVol 名称是否已存在
            const existingLvols = await spdkClient.getLvols();
            const existingLvol = existingLvols.find(lvol => lvol.name === `${lvstore.name}/${lvol_name}`);
            
            if (existingLvol) {
                return res.status(400).json({
                    error: 'LVol name already exists',
                    message: `LVol '${lvol_name}' already exists in LV store '${lvstore.name}'`
                });
            }

            // 创建 LVol
            const result = await spdkClient.createLvol(uuid, lvol_name, size_in_mib, thin_provision, clear_method);
            
            logger.info(`LVol created by ${req.user.username}: ${lvol_name} in ${lvstore.name}`);

            res.status(201).json({
                message: 'LVol created successfully',
                lvol: result
            });

        } catch (error) {
            logger.error('Error creating LVol:', error);
            res.status(500).json({
                error: 'Failed to create LVol',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/snapshot:
 *   post:
 *     summary: Create LVol snapshot
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.post('/snapshot',
    authenticateToken,
    requireAdmin,
    validate(lvolSchemas.snapshot),
    auditLog('create_lvol_snapshot', 'lvol'),
    async (req, res) => {
        try {
            const { lvol_name, snapshot_name } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.name === lvol_name);
            
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${lvol_name}' does not exist`
                });
            }

            // 创建快照
            const result = await spdkClient.createLvolSnapshot(lvol_name, snapshot_name);
            
            logger.info(`LVol snapshot created by ${req.user.username}: ${snapshot_name} from ${lvol_name}`);

            res.status(201).json({
                message: 'LVol snapshot created successfully',
                snapshot: result
            });

        } catch (error) {
            logger.error('Error creating LVol snapshot:', error);
            res.status(500).json({
                error: 'Failed to create LVol snapshot',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/clone:
 *   post:
 *     summary: Create LVol clone
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.post('/clone',
    authenticateToken,
    requireAdmin,
    validate(lvolSchemas.clone),
    auditLog('create_lvol_clone', 'lvol'),
    async (req, res) => {
        try {
            const { snapshot_name, clone_name } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查快照是否存在
            const lvols = await spdkClient.getLvols();
            const snapshot = lvols.find(lv => lv.name === snapshot_name);
            
            if (!snapshot) {
                return res.status(404).json({
                    error: 'Snapshot not found',
                    message: `Snapshot '${snapshot_name}' does not exist`
                });
            }

            // 创建克隆
            const result = await spdkClient.createLvolClone(snapshot_name, clone_name);
            
            logger.info(`LVol clone created by ${req.user.username}: ${clone_name} from ${snapshot_name}`);

            res.status(201).json({
                message: 'LVol clone created successfully',
                clone: result
            });

        } catch (error) {
            logger.error('Error creating LVol clone:', error);
            res.status(500).json({
                error: 'Failed to create LVol clone',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/clone-bdev:
 *   post:
 *     summary: Create LVol clone from non-LVol bdev
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.post('/clone-bdev',
    authenticateToken,
    requireAdmin,
    validate(lvolSchemas.cloneBdev),
    auditLog('create_lvol_clone_bdev', 'lvol'),
    async (req, res) => {
        try {
            const { bdev_name, lvol_name, lvol_store_uuid } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 bdev 是否存在
            const bdevs = await spdkClient.getBdevs();
            const bdev = bdevs.find(bd => bd.name === bdev_name);
            
            if (!bdev) {
                return res.status(404).json({
                    error: 'Bdev not found',
                    message: `Bdev '${bdev_name}' does not exist`
                });
            }

            // 检查 LV store 是否存在
            const lvstores = await spdkClient.getLvstores();
            const lvstore = lvstores.find(lvs => lvs.uuid === lvol_store_uuid);
            
            if (!lvstore) {
                return res.status(404).json({
                    error: 'LV store not found',
                    message: `LV store with UUID '${lvol_store_uuid}' does not exist`
                });
            }

            // 创建克隆
            const result = await spdkClient.createLvolCloneBdev(bdev_name, lvol_name, lvol_store_uuid);
            
            logger.info(`LVol clone from bdev created by ${req.user.username}: ${lvol_name} from ${bdev_name}`);

            res.status(201).json({
                message: 'LVol clone from bdev created successfully',
                clone: result
            });

        } catch (error) {
            logger.error('Error creating LVol clone from bdev:', error);
            res.status(500).json({
                error: 'Failed to create LVol clone from bdev',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/rename:
 *   put:
 *     summary: Rename LVol
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.put('/rename',
    authenticateToken,
    requireAdmin,
    validate(lvolSchemas.rename),
    auditLog('rename_lvol', 'lvol'),
    async (req, res) => {
        try {
            const { old_name, new_name } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.name === old_name);
            
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${old_name}' does not exist`
                });
            }

            // 重命名 LVol
            await spdkClient.renameLvol(old_name, new_name);
            
            logger.info(`LVol renamed by ${req.user.username}: ${old_name} -> ${new_name}`);

            res.json({
                message: 'LVol renamed successfully',
                old_name: old_name,
                new_name: new_name
            });

        } catch (error) {
            logger.error('Error renaming LVol:', error);
            res.status(500).json({
                error: 'Failed to rename LVol',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/{name}/inflate:
 *   put:
 *     summary: Convert thin provisioned LVol to thick provisioned
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:name/inflate',
    authenticateToken,
    requireAdmin,
    auditLog('inflate_lvol', 'lvol'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.name === name);
            
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${name}' does not exist`
                });
            }

            // 膨胀 LVol
            await spdkClient.inflateLvol(name);
            
            logger.info(`LVol inflated by ${req.user.username}: ${name}`);

            res.json({
                message: 'LVol inflated successfully',
                name: name
            });

        } catch (error) {
            logger.error('Error inflating LVol:', error);
            res.status(500).json({
                error: 'Failed to inflate LVol',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/{name}/decouple-parent:
 *   put:
 *     summary: Decouple LVol parent
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:name/decouple-parent',
    authenticateToken,
    requireAdmin,
    auditLog('decouple_lvol_parent', 'lvol'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.name === name);
            
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${name}' does not exist`
                });
            }

            // 解耦父级
            await spdkClient.decoupeLvolParent(name);
            
            logger.info(`LVol parent decoupled by ${req.user.username}: ${name}`);

            res.json({
                message: 'LVol parent decoupled successfully',
                name: name
            });

        } catch (error) {
            logger.error('Error decoupling LVol parent:', error);
            res.status(500).json({
                error: 'Failed to decouple LVol parent',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/{name}/resize:
 *   put:
 *     summary: Resize LVol
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:name/resize',
    authenticateToken,
    requireAdmin,
    validate(lvolSchemas.resize),
    auditLog('resize_lvol', 'lvol'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);
            const { size } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.name === name);
            
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${name}' does not exist`
                });
            }

            // 调整大小
            await spdkClient.resizeLvol(name, size);
            
            logger.info(`LVol resized by ${req.user.username}: ${name} to ${size} bytes`);

            res.json({
                message: 'LVol resized successfully',
                name: name,
                size: size
            });

        } catch (error) {
            logger.error('Error resizing LVol:', error);
            res.status(500).json({
                error: 'Failed to resize LVol',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/{name}/read-only:
 *   put:
 *     summary: Set LVol as read-only
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:name/read-only',
    authenticateToken,
    requireAdmin,
    auditLog('set_lvol_readonly', 'lvol'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.name === name);
            
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${name}' does not exist`
                });
            }

            // 设为只读
            await spdkClient.setLvolReadOnly(name);
            
            logger.info(`LVol set to read-only by ${req.user.username}: ${name}`);

            res.json({
                message: 'LVol set to read-only successfully',
                name: name
            });

        } catch (error) {
            logger.error('Error setting LVol to read-only:', error);
            res.status(500).json({
                error: 'Failed to set LVol to read-only',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/lvol/{name}:
 *   delete:
 *     summary: Delete LVol
 *     tags: [LVol Management]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:name',
    authenticateToken,
    requireAdmin,
    auditLog('delete_lvol', 'lvol'),
    async (req, res) => {
        try {
            const { name: encodedName } = req.params;
            const name = decodeURIComponent(encodedName);

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 LVol 是否存在
            const lvols = await spdkClient.getLvols();
            const lvol = lvols.find(lv => lv.uuid === name);
            if (!lvol) {
                return res.status(404).json({
                    error: 'LVol not found',
                    message: `LVol '${name}' does not exist`
                });
            }

            // 删除 LVol
            await spdkClient.deleteLvol(name);
            
            logger.info(`LVol deleted by ${req.user.username}: ${name}`);

            res.json({
                message: 'LVol deleted successfully',
                name: name
            });

        } catch (error) {
            logger.error('Error deleting LVol:', error);
            res.status(500).json({
                error: 'Failed to delete LVol',
                message: error.message
            });
        }
    }
);

module.exports = router; 