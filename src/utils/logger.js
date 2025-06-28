const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logDir = '/var/log/spdk';
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    // 测试写入权限
    fs.writeFileSync(path.join(logDir, 'test-write'), 'test');
    fs.unlinkSync(path.join(logDir, 'test-write'));
} catch (error) {
    console.error('Cannot write to /var/log/spdk, check permissions:', error.message);
    throw error;
}

// 日志格式配置
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, service, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}] [${service || 'spdk-nas-manager'}] ${message}`;
        if (stack) {
            log += `\n${stack}`;
        }
        if (Object.keys(meta).length > 0) {
            log += `\n${JSON.stringify(meta, null, 2)}`;
        }
        return log;
    })
);

// Console transport - 只输出 error 级别
const consoleTransport = new winston.transports.Console({
    level: 'error',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
            format: 'HH:mm:ss'
        }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            let output = `${timestamp} ${level}: ${message}`;
            if (stack) {
                output += `\n${stack}`;
            }
            return output;
        })
    )
});

// 主日志文件配置 - 支持轮转和压缩
const fileRotateTransport = new DailyRotateFile({
    filename: path.join(logDir, 'nas.log'),
    maxSize: '10m',        // 文件达到 10M 时轮转
    maxFiles: '30d',       // 保留 30 天的日志
    zippedArchive: true,   // 压缩旧日志文件为 gz
    format: logFormat
});

// 错误日志文件配置 - 支持轮转和压缩
const errorRotateTransport = new DailyRotateFile({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    maxSize: '10m',        // 文件达到 10M 时轮转
    maxFiles: '30d',       // 保留 30 天的日志
    zippedArchive: true,   // 压缩旧日志文件为 gz
    format: logFormat
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: 'spdk-nas-manager' },
    transports: [
        fileRotateTransport,    // 主日志文件（所有级别）
        errorRotateTransport,   // 错误日志文件（仅错误）
        consoleTransport        // 控制台（仅错误）
    ],
    exitOnError: false
});

// 创建符号链接指向当前日志文件的函数
function createLogSymlinks() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const mainLogFile = path.join(logDir, `nas.log.${today}`);
        const errorLogFile = path.join(logDir, `error.log.${today}`);
        const mainLogLink = path.join(logDir, 'nas.log');
        const errorLogLink = path.join(logDir, 'error.log');

        // 删除旧的符号链接
        if (fs.existsSync(mainLogLink)) {
            fs.unlinkSync(mainLogLink);
        }
        if (fs.existsSync(errorLogLink)) {
            fs.unlinkSync(errorLogLink);
        }

        // 创建新的符号链接（如果目标文件存在）
        if (fs.existsSync(mainLogFile)) {
            fs.symlinkSync(`nas.log.${today}`, mainLogLink);
        }
        if (fs.existsSync(errorLogFile)) {
            fs.symlinkSync(`error.log.${today}`, errorLogLink);
        }
    } catch (error) {
        console.error('Error creating log symlinks:', error.message);
    }
}

// 监听日志轮转事件
fileRotateTransport.on('rotate', function(oldFilename, newFilename) {
    logger.info(`Main log file rotated: ${oldFilename} -> ${newFilename}`);
    createLogSymlinks();
});

fileRotateTransport.on('archive', function(zipFilename) {
    logger.info(`Main log file archived and compressed: ${zipFilename}`);
});

errorRotateTransport.on('rotate', function(oldFilename, newFilename) {
    logger.info(`Error log file rotated: ${oldFilename} -> ${newFilename}`);
    createLogSymlinks();
});

errorRotateTransport.on('archive', function(zipFilename) {
    logger.info(`Error log file archived and compressed: ${zipFilename}`);
});

// 监听新文件创建事件
fileRotateTransport.on('new', function(newFilename) {
    createLogSymlinks();
});

errorRotateTransport.on('new', function(newFilename) {
    createLogSymlinks();
});

// 监听错误
fileRotateTransport.on('error', function(err) {
    console.error('Main log rotation error:', err);
});

errorRotateTransport.on('error', function(err) {
    console.error('Error log rotation error:', err);
});

// 初始创建符号链接
setTimeout(createLogSymlinks, 1000);

// 测试日志是否正常工作
try {
    logger.info('Logger initialized with file rotation and compression');
    logger.info(`Main log file: ${path.join(logDir, 'nas.log')}`);
    logger.info(`Error log file: ${path.join(logDir, 'error.log')}`);
    logger.info('Console output: errors only');
    logger.info('Log rotation: enabled (10MB files, 30 days retention, gzip compression)');
} catch (error) {
    console.error('Logger initialization failed:', error);
}

module.exports = logger; 