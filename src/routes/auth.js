const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../config/database');
const globalConfig = require('../config/global');
const { validate, userSchemas } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: User ID
 *         username:
 *           type: string
 *           description: Username
 *         email:
 *           type: string
 *           format: email
 *           description: Email address
 *         role:
 *           type: string
 *           enum: [admin, user]
 *           description: User role
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Account creation time
 *         last_login:
 *           type: string
 *           format: date-time
 *           description: Last login time
 *     LoginRequest:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           description: Username
 *         password:
 *           type: string
 *           description: Password
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - username
 *         - email
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           minLength: 3
 *           maxLength: 30
 *           description: Username (3-30 alphanumeric characters)
 *         email:
 *           type: string
 *           format: email
 *           description: Email address
 *         password:
 *           type: string
 *           minLength: 6
 *           description: Password (minimum 6 characters)
 *         role:
 *           type: string
 *           enum: [admin, user]
 *           default: user
 *           description: User role
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error or user already exists
 *       500:
 *         description: Internal server error
 */
router.post('/register', validate(userSchemas.register), async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // 检查用户是否已存在
        const existingUser = await database.get(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUser) {
            return res.status(400).json({
                error: 'User already exists',
                message: 'Username or email already registered'
            });
        }

        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);

        // 创建用户
        const result = await database.run(
            `INSERT INTO users (username, email, password_hash, role)
             VALUES (?, ?, ?, ?)`,
            [username, email, hashedPassword, role]
        );

        // 获取新创建的用户信息
        const newUser = await database.get(
            'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
            [result.id]
        );

        logger.info(`New user registered: ${username}`);

        res.status(201).json({
            message: 'User registered successfully',
            user: newUser
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: 'Internal server error during registration'
        });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                   description: JWT access token
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post('/login', validate(userSchemas.login), async (req, res) => {
    try {
        const { username, password } = req.body;

        // 查找用户
        const user = await database.get(
            'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = ?',
            [username]
        );

        if (!user || !user.is_active) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password is incorrect'
            });
        }

        // 验证密码
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password is incorrect'
            });
        }

        // 生成JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            globalConfig.getJwtSecret(),
            { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
        );

        // 更新最后登录时间
        await database.run(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        logger.info(`User logged in: ${username}`);

        // 返回用户信息（不包含密码）
        const { password_hash, ...userInfo } = user;

        res.json({
            message: 'Login successful',
            token,
            user: userInfo
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: 'Internal server error during login'
        });
    }
});

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await database.get(
            'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
            [req.user.id]
        );

        res.json(user);
    } catch (error) {
        logger.error('Profile retrieval error:', error);
        res.status(500).json({
            error: 'Failed to get profile',
            message: 'Internal server error'
        });
    }
});

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/profile', 
    authenticateToken,
    validate(userSchemas.updateProfile),
    auditLog('update_profile', 'user'),
    async (req, res) => {
        try {
            const { email, password } = req.body;
            const updates = [];
            const values = [];

            if (email) {
                // 检查邮箱是否被其他用户使用
                const existingUser = await database.get(
                    'SELECT id FROM users WHERE email = ? AND id != ?',
                    [email, req.user.id]
                );

                if (existingUser) {
                    return res.status(400).json({
                        error: 'Email already in use',
                        message: 'This email is already registered to another user'
                    });
                }

                updates.push('email = ?');
                values.push(email);
            }

            if (password) {
                const hashedPassword = await bcrypt.hash(password, 10);
                updates.push('password_hash = ?');
                values.push(hashedPassword);
            }

            if (updates.length === 0) {
                return res.status(400).json({
                    error: 'No updates provided',
                    message: 'At least one field must be provided for update'
                });
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(req.user.id);

            await database.run(
                `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
                values
            );

            logger.info(`Profile updated for user: ${req.user.username}`);

            res.json({
                message: 'Profile updated successfully'
            });
        } catch (error) {
            logger.error('Profile update error:', error);
            res.status(500).json({
                error: 'Profile update failed',
                message: 'Internal server error'
            });
        }
    }
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: User logout (client-side token invalidation)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authenticateToken, (req, res) => {
    // 由于使用JWT，实际的注销需要在客户端删除token
    // 这里只是提供一个端点用于审计和统计
    logger.info(`User logged out: ${req.user.username}`);
    
    res.json({
        message: 'Logout successful. Please remove the token from client side.'
    });
});

module.exports = router; 