const express = require('express');
const router = express.Router();
const { validate, raidSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const SPDKRpcClient = require('../services/spdkRpcClient');
const logger = require('../utils/logger');

/**
 * @swagger
 * /api/raid/base-bdev:
 *   post:
 *     summary: Add base bdev to RAID
 *     tags: [RAID Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - raid_bdev
 *               - base_bdev
 *             properties:
 *               raid_bdev:
 *                 type: string
 *                 description: RAID bdev name
 *                 example: raid0
 *               base_bdev:
 *                 type: string
 *                 description: Base bdev name to add
 *                 example: nvme0n1
 *     responses:
 *       201:
 *         description: Base bdev added successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: RAID or base bdev not found
 */
router.post('/base-bdev',
    authenticateToken,
    requireAdmin,
    validate(raidSchemas.addBaseBdev),
    auditLog('add_raid_base_bdev', 'raid'),
    async (req, res) => {
        try {
            const { raid_bdev, base_bdev } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 RAID bdev 是否存在
            const bdevs = await spdkClient.getBdevs();
            const raidBdev = bdevs.find(bdev => bdev.name === raid_bdev);
            
            if (!raidBdev) {
                return res.status(404).json({
                    error: 'RAID bdev not found',
                    message: `RAID bdev '${raid_bdev}' does not exist`
                });
            }

            // 检查是否为RAID类型
            if (!raidBdev.product_name || !raidBdev.product_name.includes('raid')) {
                return res.status(400).json({
                    error: 'Not a RAID bdev',
                    message: `Bdev '${raid_bdev}' is not a RAID device`
                });
            }

            // 检查基础 bdev 是否存在
            const baseBdev = bdevs.find(bdev => bdev.name === base_bdev);
            if (!baseBdev) {
                return res.status(404).json({
                    error: 'Base bdev not found',
                    message: `Base bdev '${base_bdev}' does not exist`
                });
            }

            // 执行添加操作
            await spdkClient.addRaidBaseBdev(raid_bdev, base_bdev);
            
            logger.info(`Base bdev added to RAID by ${req.user.username}: ${base_bdev} -> ${raid_bdev}`);

            res.status(201).json({
                message: 'Base bdev added to RAID successfully',
                raid_bdev: raid_bdev,
                base_bdev: base_bdev
            });

        } catch (error) {
            logger.error('Error adding base bdev to RAID:', error);
            res.status(500).json({
                error: 'Failed to add base bdev to RAID',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/raid/base-bdev:
 *   delete:
 *     summary: Remove base bdev from RAID
 *     tags: [RAID Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - raid_bdev
 *               - base_bdev
 *             properties:
 *               raid_bdev:
 *                 type: string
 *                 description: RAID bdev name
 *                 example: raid0
 *               base_bdev:
 *                 type: string
 *                 description: Base bdev name to remove
 *                 example: nvme0n1
 *     responses:
 *       200:
 *         description: Base bdev removed successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: RAID or base bdev not found
 */
router.delete('/base-bdev',
    authenticateToken,
    requireAdmin,
    validate(raidSchemas.removeBaseBdev),
    auditLog('remove_raid_base_bdev', 'raid'),
    async (req, res) => {
        try {
            const { raid_bdev, base_bdev } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 RAID bdev 是否存在
            const bdevs = await spdkClient.getBdevs();
            const raidBdev = bdevs.find(bdev => bdev.name === raid_bdev);
            
            if (!raidBdev) {
                return res.status(404).json({
                    error: 'RAID bdev not found',
                    message: `RAID bdev '${raid_bdev}' does not exist`
                });
            }

            // 检查是否为RAID类型
            if (!raidBdev.product_name || !raidBdev.product_name.includes('raid')) {
                return res.status(400).json({
                    error: 'Not a RAID bdev',
                    message: `Bdev '${raid_bdev}' is not a RAID device`
                });
            }

            // 执行移除操作
            await spdkClient.removeRaidBaseBdev(raid_bdev, base_bdev);
            
            logger.info(`Base bdev removed from RAID by ${req.user.username}: ${base_bdev} <- ${raid_bdev}`);

            res.json({
                message: 'Base bdev removed from RAID successfully',
                raid_bdev: raid_bdev,
                base_bdev: base_bdev
            });

        } catch (error) {
            logger.error('Error removing base bdev from RAID:', error);
            res.status(500).json({
                error: 'Failed to remove base bdev from RAID',
                message: error.message
            });
        }
    }
);

module.exports = router; 