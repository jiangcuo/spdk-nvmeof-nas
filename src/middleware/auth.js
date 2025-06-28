const jwt = require('jsonwebtoken');
const database = require('../config/database');
const globalConfig = require('../config/global');
const logger = require('../utils/logger');

/**
 * JWT认证中间件
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                message: 'Please provide a valid access token'
            });
        }

        const decoded = jwt.verify(token, globalConfig.getJwtSecret());
        
        // 验证用户是否仍然存在且活跃
        const user = await database.get(
            'SELECT id, username, email, role, is_active FROM users WHERE id = ? AND is_active = 1',
            [decoded.userId]
        );

        if (!user) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'User not found or inactive'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Authentication error:', error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Your session has expired. Please login again.'
            });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'Please provide a valid access token'
            });
        }

        return res.status(500).json({
            error: 'Authentication failed',
            message: 'Internal server error during authentication'
        });
    }
};

/**
 * 角色验证中间件
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please login first'
            });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            logger.warn(`Access denied for user ${req.user.username} with role ${userRole}`);
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
};

/**
 * 管理员权限中间件
 */
const requireAdmin = requireRole(['admin']);

module.exports = {
    authenticateToken,
    requireRole,
    requireAdmin
}; 