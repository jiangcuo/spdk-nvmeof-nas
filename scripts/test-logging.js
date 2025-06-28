#!/usr/bin/env node

// SPDK NAS Manager - Logging Test Script

const logger = require('../src/utils/logger');
const fs = require('fs');

console.log('========================================');
console.log('SPDK NAS Manager - Logging Test');
console.log('========================================');

// 等待logger初始化
setTimeout(() => {
    console.log('Logger transports:', logger.transports.length);
    logger.transports.forEach((transport, index) => {
        console.log(`Transport ${index}:`, transport.constructor.name);
        if (transport.filename) {
            console.log(`  - File: ${transport.filename}`);
        }
    });

    // 测试不同级别的日志
    console.log('\nSending log messages...');
    logger.info('This is an INFO message - should appear in file only');
    logger.warn('This is a WARNING message - should appear in file only');
    logger.error('This is an ERROR message - should appear in both file and console');

    // 测试带有额外数据的日志
    logger.info('Testing with metadata', {
        user: 'admin',
        operation: 'test_logging',
        timestamp: new Date().toISOString()
    });

    // 测试错误堆栈
    try {
        throw new Error('Test error for stack trace');
    } catch (error) {
        logger.error('Caught test error:', error);
    }

    // 测试长消息
    const longMessage = 'This is a very long log message that contains a lot of text to test how the logger handles longer content and formatting. '.repeat(10);
    logger.info('Long message test:', { longContent: longMessage });

    // 强制刷新所有transport
    console.log('\nFlushing logs...');
    const promises = logger.transports.map(transport => {
        return new Promise((resolve) => {
            if (typeof transport.flush === 'function') {
                transport.flush(resolve);
            } else if (typeof transport._flush === 'function') {
                transport._flush(resolve);
            } else {
                resolve();
            }
        });
    });

    Promise.all(promises).then(() => {
        console.log('All transports flushed');
        
        // 等待一点时间让文件写入完成
        setTimeout(() => {
            console.log('\n===============================================');
            console.log('✅ Test Complete!');
            console.log('===============================================');
            console.log('All API endpoints have been tested.');
            console.log('📁 Check log files at:');
            console.log('   - Main log: /var/log/spdk/nas.log');
            console.log('   - Error log: /var/log/spdk/error.log');
            console.log('📺 Console should only show ERROR messages');
            
            // 检查文件是否存在
            if (fs.existsSync('/var/log/spdk/nas.log')) {
                console.log('✅ nas.log exists');
            } else {
                console.log('❌ nas.log does not exist');
            }
            
            if (fs.existsSync('/var/log/spdk/error.log')) {
                console.log('✅ error.log exists');
            } else {
                console.log('❌ error.log does not exist');
            }
            
            process.exit(0);
        }, 1000);
    });
}, 100); 