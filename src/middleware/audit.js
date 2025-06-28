const database = require('../config/database');
const logger = require('../utils/logger');

/**
 * 审计日志中间件
 * @param {string} action - 操作类型
 * @param {string} resourceType - 资源类型
 * @returns {Function} Express中间件函数
 */
const auditLog = (action, resourceType) => {
    return async (req, res, next) => {
        const originalSend = res.send;
        
        res.send = function(data) {
            // 记录审计日志
            const logData = {
                user_id: req.user ? req.user.id : null,
                action: action,
                resource_type: resourceType,
                resource_id: req.params.id || req.body.name || req.body.nqn || req.body.raid_bdev || req.body.uuid || 'unknown',
                details: JSON.stringify({
                    method: req.method,
                    url: req.originalUrl,
                    params: req.params,
                    body: req.body,
                    status: res.statusCode,
                    timestamp: new Date().toISOString()
                }),
                ip_address: req.ip || req.connection.remoteAddress
            };

            // 异步记录审计日志，不阻塞响应
            database.run(
                `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [logData.user_id, logData.action, logData.resource_type, 
                 logData.resource_id, logData.details, logData.ip_address]
            ).catch(err => {
                logger.error('Failed to log audit event:', err);
            });

            // 调用原始的send方法
            originalSend.call(this, data);
        };

        next();
    };
};

/**
 * 获取审计日志
 * @param {Object} options - 查询选项
 * @returns {Promise<Array>} 审计日志列表
 */
const getAuditLogs = async (options = {}) => {
    const {
        userId,
        action,
        resourceType,
        startDate,
        endDate,
        limit = 100,
        offset = 0
    } = options;

    let query = `
        SELECT 
            al.*,
            u.username,
            u.email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    `;
    
    const params = [];

    if (userId) {
        query += ' AND al.user_id = ?';
        params.push(userId);
    }

    if (action) {
        query += ' AND al.action = ?';
        params.push(action);
    }

    if (resourceType) {
        query += ' AND al.resource_type = ?';
        params.push(resourceType);
    }

    if (startDate) {
        query += ' AND al.created_at >= ?';
        params.push(startDate);
    }

    if (endDate) {
        query += ' AND al.created_at <= ?';
        params.push(endDate);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    try {
        const logs = await database.all(query, params);
        
        // 解析details JSON字段
        return logs.map(log => ({
            ...log,
            details: log.details ? JSON.parse(log.details) : null
        }));
    } catch (error) {
        logger.error('Error fetching audit logs:', error);
        throw error;
    }
};

/**
 * 统计审计日志
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 统计信息
 */
const getAuditStats = async (options = {}) => {
    const {
        userId,
        resourceType,
        startDate,
        endDate
    } = options;

    let query = `
        SELECT 
            action,
            COUNT(*) as count
        FROM audit_logs
        WHERE 1=1
    `;
    
    const params = [];

    if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
    }

    if (resourceType) {
        query += ' AND resource_type = ?';
        params.push(resourceType);
    }

    if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
    }

    if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
    }

    query += ' GROUP BY action ORDER BY count DESC';

    try {
        const stats = await database.all(query, params);
        
        const totalQuery = `
            SELECT COUNT(*) as total
            FROM audit_logs
            WHERE 1=1
            ${userId ? ' AND user_id = ?' : ''}
            ${resourceType ? ' AND resource_type = ?' : ''}
            ${startDate ? ' AND created_at >= ?' : ''}
            ${endDate ? ' AND created_at <= ?' : ''}
        `;
        
        const totalResult = await database.get(totalQuery, params.slice(0, -1));
        
        return {
            total: totalResult.total,
            by_action: stats
        };
    } catch (error) {
        logger.error('Error fetching audit stats:', error);
        throw error;
    }
};

module.exports = {
    auditLog,
    getAuditLogs,
    getAuditStats
}; 