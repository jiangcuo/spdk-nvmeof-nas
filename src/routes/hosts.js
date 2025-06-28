const express = require('express');
const database = require('../config/database');
const { validate, hostSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Host:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         nqn:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/hosts:
 *   get:
 *     summary: Get all NVMe-oF hosts
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: List of hosts
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { active } = req.query;
        
        let query = 'SELECT * FROM nvmeof_hosts';
        const params = [];
        
        if (active !== undefined) {
            query += ' WHERE is_active = ?';
            params.push(active === 'true' ? 1 : 0);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const hosts = await database.all(query, params);
        
        res.json({
            hosts: hosts,
            total: hosts.length
        });
    } catch (error) {
        logger.error('Error getting hosts:', error);
        res.status(500).json({
            error: 'Failed to get hosts',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/hosts:
 *   post:
 *     summary: Create a new NVMe-oF host
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nqn
 *             properties:
 *               nqn:
 *                 type: string
 *                 description: Host NQN
 *               name:
 *                 type: string
 *                 description: Host name
 *               description:
 *                 type: string
 *                 description: Host description
 *     responses:
 *       201:
 *         description: Host created successfully
 */
router.post('/',
    authenticateToken,
    requireAdmin,
    // validate(hostSchemas.create),
    auditLog('create_host', 'host'),
    async (req, res) => {
        try {
            const { nqn, name, description } = req.body;
            
            // 检查NQN是否已存在
            const existingHost = await database.get(
                'SELECT id FROM nvmeof_hosts WHERE nqn = ?',
                [nqn]
            );
            
            if (existingHost) {
                return res.status(400).json({
                    error: 'Host already exists',
                    message: `Host with NQN '${nqn}' already exists`
                });
            }
            
            // 创建新主机
            const result = await database.run(
                'INSERT INTO nvmeof_hosts (nqn, name, description, created_by) VALUES (?, ?, ?, ?)',
                [nqn, name, description, req.user.userId]
            );
            
            const newHost = await database.get(
                'SELECT * FROM nvmeof_hosts WHERE id = ?',
                [result.lastID]
            );
            
            logger.info(`Host created by ${req.user.username}: ${nqn}`);
            
            res.status(201).json({
                message: 'Host created successfully',
                host: newHost
            });
        } catch (error) {
            logger.error('Error creating host:', error);
            res.status(500).json({
                error: 'Failed to create host',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/hosts/{id}:
 *   get:
 *     summary: Get host by ID
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Host details
 *       404:
 *         description: Host not found
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const host = await database.get(
            'SELECT * FROM nvmeof_hosts WHERE id = ?',
            [id]
        );
        
        if (!host) {
            return res.status(404).json({
                error: 'Host not found',
                message: `Host with ID ${id} not found`
            });
        }
        
        res.json(host);
    } catch (error) {
        logger.error('Error getting host:', error);
        res.status(500).json({
            error: 'Failed to get host',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/hosts/{id}:
 *   put:
 *     summary: Update host
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Host updated successfully
 */
router.put('/:id',
    authenticateToken,
    requireAdmin,
    // validate(hostSchemas.update),
    auditLog('update_host', 'host'),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, is_active } = req.body;
            
            // 检查主机是否存在
            const existingHost = await database.get(
                'SELECT * FROM nvmeof_hosts WHERE id = ?',
                [id]
            );
            
            if (!existingHost) {
                return res.status(404).json({
                    error: 'Host not found',
                    message: `Host with ID ${id} not found`
                });
            }
            
            // 更新主机
            await database.run(
                'UPDATE nvmeof_hosts SET name = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [name, description, is_active ? 1 : 0, id]
            );
            
            const updatedHost = await database.get(
                'SELECT * FROM nvmeof_hosts WHERE id = ?',
                [id]
            );
            
            logger.info(`Host updated by ${req.user.username}: ${existingHost.nqn}`);
            
            res.json({
                message: 'Host updated successfully',
                host: updatedHost
            });
        } catch (error) {
            logger.error('Error updating host:', error);
            res.status(500).json({
                error: 'Failed to update host',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/hosts/{id}:
 *   delete:
 *     summary: Delete host
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Host deleted successfully
 */
router.delete('/:id',
    authenticateToken,
    requireAdmin,
    auditLog('delete_host', 'host'),
    async (req, res) => {
        try {
            const { id } = req.params;
            
            // 检查主机是否存在
            const existingHost = await database.get(
                'SELECT * FROM nvmeof_hosts WHERE id = ?',
                [id]
            );
            
            if (!existingHost) {
                return res.status(404).json({
                    error: 'Host not found',
                    message: `Host with ID ${id} not found`
                });
            }
            
            // 删除主机
            await database.run('DELETE FROM nvmeof_hosts WHERE id = ?', [id]);
            
            logger.info(`Host deleted by ${req.user.username}: ${existingHost.nqn}`);
            
            res.json({
                message: 'Host deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting host:', error);
            res.status(500).json({
                error: 'Failed to delete host',
                message: error.message
            });
        }
    }
);

module.exports = router; 