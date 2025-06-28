const express = require('express');
const database = require('../config/database');
const SPDKRpcClient = require('../services/spdkRpcClient');
const { validate, nqnSchemas } = require('../middleware/validation');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     NQN:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         nqn:
 *           type: string
 *         subsystem_name:
 *           type: string
 *         serial_number:
 *           type: string
 *         model_number:
 *           type: string
 *         max_namespaces:
 *           type: integer
 *         allow_any_host:
 *           type: boolean
 *         transport_type:
 *           type: string
 *           enum: [tcp, rdma, fc]
 *         target_address:
 *           type: string
 *         target_port:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         is_active:
 *           type: boolean
 *     CreateNQNRequest:
 *       type: object
 *       required:
 *         - nqn
 *         - subsystem_name
 *       properties:
 *         nqn:
 *           type: string
 *           pattern: '^nqn\.\d{4}-\d{2}\..*'
 *           description: NQN in format nqn.yyyy-mm.domain:identifier
 *         subsystem_name:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           description: Subsystem name
 *         serial_number:
 *           type: string
 *           maxLength: 50
 *           description: Serial number
 *         model_number:
 *           type: string
 *           maxLength: 50
 *           description: Model number
 *         max_namespaces:
 *           type: integer
 *           minimum: 1
 *           maximum: 1024
 *           default: 256
 *           description: Maximum namespaces
 *         allow_any_host:
 *           type: boolean
 *           default: false
 *           description: Allow any host
 *         transport_type:
 *           type: string
 *           enum: [tcp, rdma, fc]
 *           default: tcp
 *           description: Transport type
 *         target_address:
 *           type: string
 *           format: ipv4
 *           description: Target address
 *         target_port:
 *           type: integer
 *           minimum: 1
 *           maximum: 65535
 *           description: Target port
 */

/**
 * @swagger
 * /api/nqns:
 *   get:
 *     summary: Get all NVMe-oF subsystems
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of NVMe-oF subsystems from SPDK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subsystems:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        // 直接从 SPDK 获取 subsystem 数据
        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();
        const subsystems = await spdkClient.getSubsystems();

        res.json({
            subsystems: subsystems,
            total: subsystems.length
        });
    } catch (error) {
        logger.error('Error getting subsystems from SPDK:', error);
        res.status(500).json({
            error: 'Failed to get NVMe-oF subsystems',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nqns:
 *   post:
 *     summary: Create a new NVMe-oF subsystem
 *     tags: [NQN Management]
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
 *                 pattern: '^nqn\.\d{4}-\d{2}\.[\w\-\.]+:[\w\-\.]+'
 *                 description: NVMe Qualified Name in format nqn.yyyy-mm.reverse-domain:identifier
 *                 example: nqn.2016-06.io.spdk:cnode1
 *               allow_any_host:
 *                 type: boolean
 *                 default: false
 *                 description: Allow any host to connect without explicit authorization
 *               serial_number:
 *                 type: string
 *                 maxLength: 50
 *                 description: Serial number for the subsystem
 *                 example: SN123456789
 *               model_number:
 *                 type: string
 *                 maxLength: 50
 *                 description: Model number for the subsystem
 *                 example: SPDK Controller
 *               transport_type:
 *                 type: string
 *                 enum: [tcp, rdma, fc]
 *                 default: tcp
 *                 description: Transport type for listener
 *               target_address:
 *                 type: string
 *                 format: ipv4
 *                 description: IP address for listener (optional)
 *                 example: 10.13.16.50
 *               target_port:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 65535
 *                 description: Port number for listener (optional)
 *                 example: 4420
 *     responses:
 *       201:
 *         description: NVMe-oF subsystem created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 subsystem:
 *                   type: object
 *       400:
 *         description: Validation error or subsystem already exists
 *       500:
 *         description: SPDK operation failed
 */
router.post('/', 
    authenticateToken,
    requireAdmin,
    validate(nqnSchemas.create),
    auditLog('create_nqn', 'nqn'),
    async (req, res) => {
        try {
            const {
                nqn, allow_any_host = false, serial_number, model_number,
                transport_type = 'tcp', target_address, target_port
            } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查 NQN 是否已存在（从 SPDK 查询）
            const existingSubsystems = await spdkClient.getSubsystems();
            const existingSubsystem = existingSubsystems.find(sub => sub.nqn === nqn);

            if (existingSubsystem) {
                return res.status(400).json({
                    error: 'NQN already exists',
                    message: 'This NQN subsystem is already registered'
                });
            }

            try {
                // 创建 SPDK 子系统
                await spdkClient.createSubsystem(nqn, allow_any_host, serial_number, model_number);
                
                // 如果提供了监听地址，添加监听器
                if (target_address && target_port) {
                    try {
                        // 确保 transport 存在
                        const transports = await spdkClient.getTransports();
                        const transportExists = transports.some(t => 
                            t.trtype.toLowerCase() === transport_type.toLowerCase()
                        );
                        
                        if (!transportExists) {
                            logger.info(`Creating ${transport_type} transport...`);
                            await spdkClient.createTransport(transport_type.toUpperCase());
                        }
                        
                        // 添加监听器
                        await spdkClient.addSubsystemListener(nqn, transport_type.toUpperCase(), target_address, target_port.toString());
                        logger.info(`Listener added: ${target_address}:${target_port}`);
                    } catch (listenerError) {
                        logger.warn(`Failed to add listener: ${listenerError.message}`);
                        // 不让监听器错误影响子系统创建
                    }
                }

                logger.info(`SPDK subsystem created: ${nqn}`);

                // 获取新创建的子系统信息
                const updatedSubsystems = await spdkClient.getSubsystems();
                const newSubsystem = updatedSubsystems.find(sub => sub.nqn === nqn);

                logger.info(`NQN subsystem created by ${req.user.username}: ${nqn}`);

                res.status(201).json({
                    message: 'NVMe-oF subsystem created successfully',
                    subsystem: newSubsystem
                });

            } catch (spdkError) {
                logger.error('SPDK subsystem creation failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error creating NQN:', error);
            res.status(500).json({
                error: 'Failed to create NQN',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/{nqn}:
 *   get:
 *     summary: Get NVMe-oF subsystem by NQN
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *     responses:
 *       200:
 *         description: NVMe-oF subsystem details
 *       404:
 *         description: Subsystem not found
 */
router.get('/:nqn', authenticateToken, async (req, res) => {
    try {
        const nqnParam = req.params.nqn;

        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();
        
        // 从 SPDK 获取子系统信息
        const subsystems = await spdkClient.getSubsystems();
        const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

        if (!subsystem) {
            return res.status(404).json({
                error: 'Subsystem not found',
                message: 'The requested NVMe-oF subsystem does not exist'
            });
        }

        // 获取该子系统的命名空间信息
        let namespaces = [];
        try {
            namespaces = await spdkClient.getSubsystemNamespaces(nqnParam);
        } catch (error) {
            logger.warn('Failed to get subsystem namespaces:', error.message);
        }

        res.json({
            subsystem: subsystem,
            namespaces: namespaces
        });
    } catch (error) {
        logger.error('Error getting subsystem:', error);
        res.status(500).json({
            error: 'Failed to get NVMe-oF subsystem',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nqns/{nqn}:
 *   delete:
 *     summary: Delete NVMe-oF subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *     responses:
 *       200:
 *         description: NVMe-oF subsystem deleted successfully
 *       404:
 *         description: Subsystem not found
 */
router.delete('/:nqn',
    authenticateToken,
    requireAdmin,
    auditLog('delete_nqn', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            try {
                await spdkClient.deleteSubsystem(nqnParam);
                logger.info(`SPDK subsystem deleted: ${nqnParam}`);

                logger.info(`NVMe-oF subsystem deleted by ${req.user.username}: ${nqnParam}`);

                res.json({
                    message: 'NVMe-oF subsystem deleted successfully'
                });

            } catch (spdkError) {
                logger.error('SPDK subsystem deletion failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error deleting NQN:', error);
            res.status(500).json({
                error: 'Failed to delete NQN',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/by-id/{id}/namespaces:
 *   post:
 *     summary: Add namespace to NQN by ID subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: NQN ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - namespace_id
 *               - bdev_name
 *             properties:
 *               namespace_id:
 *                 type: integer
 *                 minimum: 1
 *               bdev_name:
 *                 type: string
 *               uuid:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Namespace added successfully
 */
router.post('/by-id/:id/namespaces',
    authenticateToken,
    requireAdmin,
    validate(nqnSchemas.addNamespace),
    auditLog('add_namespace', 'nqn_namespace'),
    async (req, res) => {
        try {
            const { namespace_id, bdev_name, uuid } = req.body;

            const nqn = await database.get(
                'SELECT * FROM nqns WHERE id = ? AND is_active = 1',
                [req.params.id]
            );

            if (!nqn) {
                return res.status(404).json({
                    error: 'NQN not found',
                    message: 'The requested NQN does not exist'
                });
            }

            // 检查命名空间是否已存在
            const existingNamespace = await database.get(
                'SELECT id FROM nqn_namespaces WHERE nqn_id = ? AND namespace_id = ?',
                [nqn.id, namespace_id]
            );

            if (existingNamespace) {
                return res.status(400).json({
                    error: 'Namespace already exists',
                    message: 'This namespace ID is already in use for this NQN'
                });
            }

            // 添加SPDK命名空间
            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            try {
                await spdkClient.addSubsystemNamespace(nqn.nqn, bdev_name, namespace_id, uuid);
                logger.info(`SPDK namespace added: ${nqn.nqn}:${namespace_id}`);
            } catch (spdkError) {
                logger.error('SPDK namespace addition failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

            // 保存到数据库
            const result = await database.run(
                `INSERT INTO nqn_namespaces (nqn_id, namespace_id, bdev_name, uuid)
                 VALUES (?, ?, ?, ?)`,
                [nqn.id, namespace_id, bdev_name, uuid]
            );

            logger.info(`Namespace added by ${req.user.username}: ${nqn.nqn}:${namespace_id}`);

            res.status(201).json({
                message: 'Namespace added successfully',
                namespace: {
                    id: result.id,
                    nqn_id: nqn.id,
                    namespace_id,
                    bdev_name,
                    uuid
                }
            });

        } catch (error) {
            logger.error('Error adding namespace:', error);
            res.status(500).json({
                error: 'Failed to add namespace',
                message: error.message
            });
        }
    }
);

// ========== Host Management APIs ==========

/**
 * @swagger
 * /api/nqns/{nqn}/hosts:
 *   get:
 *     summary: Get hosts for NVMe-oF subsystem
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *     responses:
 *       200:
 *         description: List of hosts for the subsystem
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hosts:
 *                   type: array
 *                   items:
 *                     type: string
 *                 total:
 *                   type: integer
 *       404:
 *         description: Subsystem not found
 */
router.get('/:nqn/hosts', authenticateToken, async (req, res) => {
    try {
        const nqnParam = req.params.nqn;

        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();

        // 检查子系统是否存在
        const subsystems = await spdkClient.getSubsystems();
        const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

        if (!subsystem) {
            return res.status(404).json({
                error: 'Subsystem not found',
                message: 'The requested NVMe-oF subsystem does not exist'
            });
        }

        // 获取子系统的主机列表，提取 nqn 字符串
        const hosts = (subsystem.hosts || []).map(host => 
            typeof host === 'string' ? host : host.nqn
        );

        res.json({
            hosts: hosts,
            total: hosts.length
        });
    } catch (error) {
        logger.error('Error getting subsystem hosts:', error);
        res.status(500).json({
            error: 'Failed to get subsystem hosts',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nqns/{nqn}/hosts:
 *   post:
 *     summary: Add host to NVMe-oF subsystem
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - host_nqn
 *             properties:
 *               host_nqn:
 *                 type: string
 *                 pattern: '^nqn\.\d{4}-\d{2}\..*'
 *                 description: Host NQN (client NQN)
 *                 example: nqn.2014-08.org.nvmexpress:uuid:12345678-1234-1234-1234-123456789abc
 *     responses:
 *       201:
 *         description: Host added successfully
 *       400:
 *         description: Host already exists or invalid data
 *       404:
 *         description: Subsystem not found
 */
router.post('/:nqn/hosts',
    authenticateToken,
    requireAdmin,
    validate(nqnSchemas.addHost),
    auditLog('add_host', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;
            const { host_nqn } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            // 检查主机是否已存在，处理对象数组格式
            const existingHosts = (subsystem.hosts || []).map(host => 
                typeof host === 'string' ? host : host.nqn
            );
            if (existingHosts.includes(host_nqn)) {
                return res.status(400).json({
                    error: 'Host already exists',
                    message: 'This host is already added to the subsystem'
                });
            }

            try {
                await spdkClient.addSubsystemHost(nqnParam, host_nqn);
                logger.info(`Host added to subsystem: ${nqnParam} <- ${host_nqn}`);

                logger.info(`Host added by ${req.user.username}: ${nqnParam} <- ${host_nqn}`);

                res.status(201).json({
                    message: 'Host added successfully',
                    subsystem_nqn: nqnParam,
                    host_nqn: host_nqn
                });

            } catch (spdkError) {
                logger.error('SPDK add host failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error adding host to subsystem:', error);
            res.status(500).json({
                error: 'Failed to add host to subsystem',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/{nqn}/hosts/{hostNqn}:
 *   delete:
 *     summary: Remove host from NVMe-oF subsystem
 *     tags: [Host Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *       - in: path
 *         name: hostNqn
 *         required: true
 *         schema:
 *           type: string
 *         description: Host NQN to remove
 *         example: nqn.2014-08.org.nvmexpress:uuid:12345678-1234-1234-1234-123456789abc
 *     responses:
 *       200:
 *         description: Host removed successfully
 *       404:
 *         description: Subsystem or host not found
 */
router.delete('/:nqn/hosts/:hostNqn',
    authenticateToken,
    requireAdmin,
    auditLog('remove_host', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;
            const hostNqn = req.params.hostNqn;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            // 检查主机是否存在，处理对象数组格式
            const existingHosts = (subsystem.hosts || []).map(host => 
                typeof host === 'string' ? host : host.nqn
            );
            if (!existingHosts.includes(hostNqn)) {
                return res.status(404).json({
                    error: 'Host not found',
                    message: 'This host is not added to the subsystem'
                });
            }

            try {
                await spdkClient.removeSubsystemHost(nqnParam, hostNqn);
                logger.info(`Host removed from subsystem: ${nqnParam} -> ${hostNqn}`);

                logger.info(`Host removed by ${req.user.username}: ${nqnParam} -> ${hostNqn}`);

                res.json({
                    message: 'Host removed successfully',
                    subsystem_nqn: nqnParam,
                    host_nqn: hostNqn
                });

            } catch (spdkError) {
                logger.error('SPDK remove host failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error removing host from subsystem:', error);
            res.status(500).json({
                error: 'Failed to remove host from subsystem',
                message: error.message
            });
        }
    }
);

// ========== Listener Management APIs ==========

/**
 * @swagger
 * /api/nqns/{nqn}/listeners:
 *   get:
 *     summary: Get listeners for NVMe-oF subsystem
 *     tags: [Listener Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *     responses:
 *       200:
 *         description: List of listeners for the subsystem
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 listeners:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       trtype:
 *                         type: string
 *                       traddr:
 *                         type: string
 *                       trsvcid:
 *                         type: string
 *                       adrfam:
 *                         type: string
 *                 total:
 *                   type: integer
 *       404:
 *         description: Subsystem not found
 */
router.get('/:nqn/listeners', authenticateToken, async (req, res) => {
    try {
        const nqnParam = req.params.nqn;

        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();

        // 检查子系统是否存在
        const subsystems = await spdkClient.getSubsystems();
        const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

        if (!subsystem) {
            return res.status(404).json({
                error: 'Subsystem not found',
                message: 'The requested NVMe-oF subsystem does not exist'
            });
        }

        // 获取子系统的监听器列表
        const listeners = subsystem.listen_addresses || [];

        res.json({
            listeners: listeners,
            total: listeners.length
        });
    } catch (error) {
        logger.error('Error getting subsystem listeners:', error);
        res.status(500).json({
            error: 'Failed to get subsystem listeners',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nqns/{nqn}/listeners:
 *   post:
 *     summary: Add listener to NVMe-oF subsystem
 *     tags: [Listener Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - trtype
 *               - traddr
 *               - trsvcid
 *             properties:
 *               trtype:
 *                 type: string
 *                 enum: [TCP, RDMA, FC]
 *                 description: Transport type
 *                 example: TCP
 *               traddr:
 *                 type: string
 *                 format: ipv4
 *                 description: Transport address (IP address)
 *                 example: 10.13.16.50
 *               trsvcid:
 *                 oneOf:
 *                   - type: string
 *                   - type: integer
 *                 description: Transport service ID (port number)
 *                 example: 4420
 *               adrfam:
 *                 type: string
 *                 enum: [ipv4, ipv6, ib, fc]
 *                 default: ipv4
 *                 description: Address family
 *     responses:
 *       201:
 *         description: Listener added successfully
 *       400:
 *         description: Listener already exists or invalid data
 *       404:
 *         description: Subsystem not found
 */
router.post('/:nqn/listeners',
    authenticateToken,
    requireAdmin,
    validate(nqnSchemas.addListener),
    auditLog('add_listener', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;
            const { trtype, traddr, trsvcid, adrfam = 'ipv4' } = req.body;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            // 检查监听器是否已存在
            const existingListeners = subsystem.listen_addresses || [];
            const listenerExists = existingListeners.some(listener => 
                listener.trtype === trtype &&
                listener.traddr === traddr &&
                listener.trsvcid === trsvcid.toString()
            );

            if (listenerExists) {
                return res.status(400).json({
                    error: 'Listener already exists',
                    message: 'This listener is already added to the subsystem'
                });
            }

            try {
                // 确保 transport 存在
                const transports = await spdkClient.getTransports();
                const transportExists = transports.some(t => 
                    t.trtype.toLowerCase() === trtype.toLowerCase()
                );
                
                if (!transportExists) {
                    logger.info(`Creating ${trtype} transport...`);
                    await spdkClient.createTransport(trtype);
                }

                // 添加监听器
                await spdkClient.addSubsystemListener(nqnParam, trtype, traddr, trsvcid.toString(), adrfam);
                logger.info(`Listener added to subsystem: ${nqnParam} -> ${traddr}:${trsvcid}`);

                logger.info(`Listener added by ${req.user.username}: ${nqnParam} -> ${traddr}:${trsvcid}`);

                res.status(201).json({
                    message: 'Listener added successfully',
                    subsystem_nqn: nqnParam,
                    listener: {
                        trtype,
                        traddr,
                        trsvcid: trsvcid.toString(),
                        adrfam
                    }
                });

            } catch (spdkError) {
                logger.error('SPDK add listener failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error adding listener to subsystem:', error);
            res.status(500).json({
                error: 'Failed to add listener to subsystem',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/{nqn}/listeners/{trtype}:{traddr}:{trsvcid}:
 *   delete:
 *     summary: Remove listener from NVMe-oF subsystem
 *     tags: [Listener Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string (e.g., nqn.2016-06.io.spdk:cnode1)
 *         example: nqn.2016-06.io.spdk:cnode1
 *       - in: path
 *         name: trtype
 *         required: true
 *         schema:
 *           type: string
 *         description: Transport type
 *         example: TCP
 *       - in: path
 *         name: traddr
 *         required: true
 *         schema:
 *           type: string
 *         description: Transport address
 *         example: 10.13.16.50
 *       - in: path
 *         name: trsvcid
 *         required: true
 *         schema:
 *           type: string
 *         description: Transport service ID
 *         example: "4420"
 *     responses:
 *       200:
 *         description: Listener removed successfully
 *       404:
 *         description: Subsystem or listener not found
 */
router.delete('/:nqn/listeners/:trtype\\::traddr\\::trsvcid',
    authenticateToken,
    requireAdmin,
    auditLog('remove_listener', 'nqn'),
    async (req, res) => {
        try {
            const { nqn: nqnParam, trtype, traddr, trsvcid } = req.params;

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            // 检查监听器是否存在
            const existingListeners = subsystem.listen_addresses || [];
            const listenerExists = existingListeners.some(listener => 
                listener.trtype === trtype &&
                listener.traddr === traddr &&
                listener.trsvcid === trsvcid
            );

            if (!listenerExists) {
                return res.status(404).json({
                    error: 'Listener not found',
                    message: 'This listener is not added to the subsystem'
                });
            }

            // 获取监听器的 adrfam
            const listener = existingListeners.find(l => 
                l.trtype === trtype && l.traddr === traddr && l.trsvcid === trsvcid
            );
            const adrfam = listener.adrfam || 'ipv4';

            try {
                await spdkClient.removeSubsystemListener(nqnParam, trtype, traddr, trsvcid, adrfam);
                logger.info(`Listener removed from subsystem: ${nqnParam} -> ${traddr}:${trsvcid}`);

                logger.info(`Listener removed by ${req.user.username}: ${nqnParam} -> ${traddr}:${trsvcid}`);

                res.json({
                    message: 'Listener removed successfully',
                    subsystem_nqn: nqnParam,
                    listener: {
                        trtype,
                        traddr,
                        trsvcid,
                        adrfam
                    }
                });

            } catch (spdkError) {
                logger.error('SPDK remove listener failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error removing listener from subsystem:', error);
            res.status(500).json({
                error: 'Failed to remove listener from subsystem',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/{nqn}/controllers:
 *   get:
 *     summary: Get controllers for NVMe-oF subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string
 *     responses:
 *       200:
 *         description: List of active controllers
 */
router.get('/:nqn/controllers', authenticateToken, async (req, res) => {
    try {
        const nqnParam = req.params.nqn;

        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();

        // 检查子系统是否存在
        const subsystems = await spdkClient.getSubsystems();
        const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

        if (!subsystem) {
            return res.status(404).json({
                error: 'Subsystem not found',
                message: 'The requested NVMe-oF subsystem does not exist'
            });
        }

        try {
            const controllers = await spdkClient.getSubsystemControllers(nqnParam);
            res.json({
                controllers: controllers || [],
                total: (controllers || []).length
            });
        } catch (spdkError) {
            logger.warn('Failed to get controllers:', spdkError.message);
            res.json({
                controllers: [],
                total: 0
            });
        }

    } catch (error) {
        logger.error('Error getting controllers:', error);
        res.status(500).json({
            error: 'Failed to get controllers',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nqns/{nqn}/qpairs:
 *   get:
 *     summary: Get queue pairs for NVMe-oF subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string
 *     responses:
 *       200:
 *         description: List of active queue pairs
 */
router.get('/:nqn/qpairs', authenticateToken, async (req, res) => {
    try {
        const nqnParam = req.params.nqn;

        const spdkClient = new SPDKRpcClient();
        await spdkClient.checkConnection();

        // 检查子系统是否存在
        const subsystems = await spdkClient.getSubsystems();
        const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

        if (!subsystem) {
            return res.status(404).json({
                error: 'Subsystem not found',
                message: 'The requested NVMe-oF subsystem does not exist'
            });
        }

        try {
            const qpairs = await spdkClient.getSubsystemQpairs(nqnParam);
            res.json({
                qpairs: qpairs || [],
                total: (qpairs || []).length
            });
        } catch (spdkError) {
            logger.warn('Failed to get qpairs:', spdkError.message);
            res.json({
                qpairs: [],
                total: 0
            });
        }

    } catch (error) {
        logger.error('Error getting qpairs:', error);
        res.status(500).json({
            error: 'Failed to get qpairs',
            message: error.message
        });
    }
});

/**
 * @swagger
 * /api/nqns/{nqn}/allow-any-host:
 *   put:
 *     summary: Set allow any host for subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allow_any_host
 *             properties:
 *               allow_any_host:
 *                 type: boolean
 *                 description: Whether to allow any host
 *     responses:
 *       200:
 *         description: Allow any host setting updated
 */
router.put('/:nqn/allow-any-host',
    authenticateToken,
    requireAdmin,
    auditLog('update_allow_any_host', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;
            const { allow_any_host } = req.body;

            if (typeof allow_any_host !== 'boolean') {
                return res.status(400).json({
                    error: 'Invalid parameter',
                    message: 'allow_any_host must be a boolean'
                });
            }

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            try {
                await spdkClient.setSubsystemAllowAnyHost(nqnParam, allow_any_host);
                logger.info(`Allow any host ${allow_any_host ? 'enabled' : 'disabled'} for subsystem: ${nqnParam}`);

                res.json({
                    message: `Allow any host ${allow_any_host ? 'enabled' : 'disabled'} successfully`,
                    subsystem_nqn: nqnParam,
                    allow_any_host: allow_any_host
                });

            } catch (spdkError) {
                logger.error('SPDK allow any host operation failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error updating allow any host:', error);
            res.status(500).json({
                error: 'Failed to update allow any host setting',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/{nqn}/namespaces:
 *   post:
 *     summary: Add namespace to subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bdev_name
 *             properties:
 *               bdev_name:
 *                 type: string
 *                 description: Block device name
 *               nsid:
 *                 type: integer
 *                 description: Namespace ID (optional, auto-assigned if not specified)
 *               uuid:
 *                 type: string
 *                 description: UUID for the namespace (optional)
 *     responses:
 *       201:
 *         description: Namespace added successfully
 */
router.post('/:nqn/namespaces',
    authenticateToken,
    requireAdmin,
    auditLog('add_namespace', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;
            const { bdev_name, nsid, uuid } = req.body;

            if (!bdev_name) {
                return res.status(400).json({
                    error: 'Missing required parameter',
                    message: 'bdev_name is required'
                });
            }

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            // 检查bdev是否存在
            const bdevs = await spdkClient.getBdevs(bdev_name);
            if (!bdevs || bdevs.length === 0) {
                return res.status(404).json({
                    error: 'Block device not found',
                    message: `Block device '${bdev_name}' does not exist`
                });
            }

            try {
                const result = await spdkClient.addSubsystemNamespace(nqnParam, bdev_name, nsid, uuid);
                logger.info(`Namespace added to subsystem: ${nqnParam} -> ${bdev_name}`);

                res.status(201).json({
                    message: 'Namespace added successfully',
                    subsystem_nqn: nqnParam,
                    namespace: {
                        bdev_name: bdev_name,
                        nsid: result?.nsid || nsid,
                        uuid: uuid
                    }
                });

            } catch (spdkError) {
                logger.error('SPDK add namespace failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error adding namespace to subsystem:', error);
            res.status(500).json({
                error: 'Failed to add namespace to subsystem',
                message: error.message
            });
        }
    }
);

/**
 * @swagger
 * /api/nqns/{nqn}/namespaces/{nsid}:
 *   delete:
 *     summary: Remove namespace from subsystem
 *     tags: [NQN Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nqn
 *         required: true
 *         schema:
 *           type: string
 *         description: NQN string
 *       - in: path
 *         name: nsid
 *         required: true
 *         schema:
 *           type: integer
 *         description: Namespace ID
 *     responses:
 *       200:
 *         description: Namespace removed successfully
 */
router.delete('/:nqn/namespaces/:nsid',
    authenticateToken,
    requireAdmin,
    auditLog('remove_namespace', 'nqn'),
    async (req, res) => {
        try {
            const nqnParam = req.params.nqn;
            const nsid = parseInt(req.params.nsid);

            if (isNaN(nsid)) {
                return res.status(400).json({
                    error: 'Invalid parameter',
                    message: 'nsid must be a valid integer'
                });
            }

            const spdkClient = new SPDKRpcClient();
            await spdkClient.checkConnection();

            // 检查子系统是否存在
            const subsystems = await spdkClient.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqnParam);

            if (!subsystem) {
                return res.status(404).json({
                    error: 'Subsystem not found',
                    message: 'The requested NVMe-oF subsystem does not exist'
                });
            }

            // 检查命名空间是否存在
            const namespaces = subsystem.namespaces || [];
            const namespaceExists = namespaces.some(ns => ns.nsid === nsid);

            if (!namespaceExists) {
                return res.status(404).json({
                    error: 'Namespace not found',
                    message: `Namespace with ID ${nsid} does not exist in this subsystem`
                });
            }

            try {
                await spdkClient.removeSubsystemNamespace(nqnParam, nsid);
                logger.info(`Namespace removed from subsystem: ${nqnParam} -> nsid:${nsid}`);

                res.json({
                    message: 'Namespace removed successfully',
                    subsystem_nqn: nqnParam,
                    nsid: nsid
                });

            } catch (spdkError) {
                logger.error('SPDK remove namespace failed:', spdkError);
                return res.status(500).json({
                    error: 'SPDK operation failed',
                    message: spdkError.message
                });
            }

        } catch (error) {
            logger.error('Error removing namespace from subsystem:', error);
            res.status(500).json({
                error: 'Failed to remove namespace from subsystem',
                message: error.message
            });
        }
    }
);

module.exports = router; 