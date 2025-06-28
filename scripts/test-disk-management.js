#!/usr/bin/env node

const axios = require('axios');
const readline = require('readline');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let authToken = '';

/**
 * 打印测试结果
 */
function printResult(testName, success, data, error) {
    console.log(`\n========== ${testName} ==========`);
    if (success) {
        console.log('✅ 成功');
        if (data) {
            console.log('返回数据:', JSON.stringify(data, null, 2));
        }
    } else {
        console.log('❌ 失败');
        if (error) {
            console.log('错误信息:', error.message || error);
            if (error.response && error.response.data) {
                console.log('响应数据:', JSON.stringify(error.response.data, null, 2));
            }
        }
    }
}

/**
 * 用户认证
 */
async function authenticate() {
    return new Promise((resolve) => {
        rl.question('请输入用户名 (默认: admin): ', (username) => {
            username = username || 'admin';
            rl.question('请输入密码 (默认: admin123): ', async (password) => {
                password = password || 'admin123';
                
                try {
                    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
                        username,
                        password
                    });
                    
                    authToken = response.data.token;
                    console.log('✅ 认证成功');
                    resolve(true);
                } catch (error) {
                    console.log('❌ 认证失败:', error.message);
                    resolve(false);
                }
            });
        });
    });
}

/**
 * 测试获取所有磁盘
 */
async function testGetAllDisks() {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult('获取所有物理磁盘', true, response.data);
        return response.data;
    } catch (error) {
        printResult('获取所有物理磁盘', false, null, error);
        return null;
    }
}

/**
 * 测试获取磁盘统计
 */
async function testGetDiskStats() {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks/stats`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult('获取磁盘统计', true, response.data);
        return response.data;
    } catch (error) {
        printResult('获取磁盘统计', false, null, error);
        return null;
    }
}

/**
 * 测试获取可用磁盘
 */
async function testGetAvailableDisks() {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks/available`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult('获取可用磁盘', true, response.data);
        return response.data;
    } catch (error) {
        printResult('获取可用磁盘', false, null, error);
        return null;
    }
}

/**
 * 测试获取特定磁盘信息
 */
async function testGetDiskInfo(deviceName) {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks/${deviceName}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult(`获取磁盘 ${deviceName} 详细信息`, true, response.data);
        return response.data;
    } catch (error) {
        printResult(`获取磁盘 ${deviceName} 详细信息`, false, null, error);
        return null;
    }
}

/**
 * 测试获取磁盘健康状态
 */
async function testGetDiskHealth(deviceName) {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks/${deviceName}/health`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult(`获取磁盘 ${deviceName} 健康状态`, true, response.data);
        return response.data;
    } catch (error) {
        printResult(`获取磁盘 ${deviceName} 健康状态`, false, null, error);
        return null;
    }
}

/**
 * 测试获取磁盘SMART信息
 */
async function testGetDiskSmart(deviceName) {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks/${deviceName}/smart`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult(`获取磁盘 ${deviceName} SMART信息`, true, response.data);
        return response.data;
    } catch (error) {
        printResult(`获取磁盘 ${deviceName} SMART信息`, false, null, error);
        return null;
    }
}

/**
 * 测试刷新磁盘扫描
 */
async function testRefreshDiskScan() {
    try {
        const response = await axios.post(`${BASE_URL}/api/disks/scan/refresh`, {}, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult('刷新磁盘扫描', true, response.data);
        return response.data;
    } catch (error) {
        printResult('刷新磁盘扫描', false, null, error);
        return null;
    }
}

/**
 * 测试不存在的磁盘
 */
async function testNonExistentDisk() {
    try {
        const response = await axios.get(`${BASE_URL}/api/disks/nonexistent`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        printResult('测试不存在的磁盘', false, null, new Error('应该返回404错误'));
        return null;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            printResult('测试不存在的磁盘 (预期404错误)', true, error.response.data);
        } else {
            printResult('测试不存在的磁盘', false, null, error);
        }
        return null;
    }
}

/**
 * 主测试函数
 */
async function runTests() {
    console.log('========== SPDK NAS Manager 物理磁盘管理功能测试 ==========\n');

    // 认证
    const authenticated = await authenticate();
    if (!authenticated) {
        console.log('认证失败，退出测试');
        rl.close();
        return;
    }

    console.log('\n开始执行物理磁盘管理测试...\n');

    try {
        // 1. 获取磁盘统计
        await testGetDiskStats();

        // 2. 获取所有磁盘
        const allDisks = await testGetAllDisks();

        // 3. 获取可用磁盘
        await testGetAvailableDisks();

        // 4. 刷新磁盘扫描
        await testRefreshDiskScan();

        // 5. 如果有磁盘，测试特定磁盘功能
        if (allDisks && allDisks.length > 0) {
            const firstDisk = allDisks[0];
            console.log(`\n使用第一个磁盘进行详细测试: ${firstDisk.name}`);

            // 获取特定磁盘信息
            await testGetDiskInfo(firstDisk.name);

            // 获取磁盘健康状态
            await testGetDiskHealth(firstDisk.name);

            // 获取SMART信息（如果支持）
            await testGetDiskSmart(firstDisk.name);
        } else {
            console.log('\n⚠️ 没有找到任何磁盘，跳过特定磁盘测试');
        }

        // 6. 测试错误处理
        await testNonExistentDisk();

        console.log('\n========== 测试总结 ==========');
        console.log('物理磁盘管理功能测试完成！');
        
        if (allDisks) {
            console.log(`\n找到的磁盘:`);
            allDisks.forEach(disk => {
                console.log(`- ${disk.name} (${disk.size}) - ${disk.type.toUpperCase()} - ${disk.model}`);
                console.log(`  路径: ${disk.device_path}`);
                console.log(`  挂载: ${disk.is_mounted ? '是' : '否'}`);
                console.log(`  SPDK: ${disk.is_spdk_bdev ? '是' : '否'}`);
                console.log(`  分区数: ${disk.partitions ? disk.partitions.length : 0}`);
                console.log('');
            });
        }

    } catch (error) {
        console.log('\n测试过程中发生错误:', error.message);
    }

    rl.close();
}

// 处理命令行参数
if (process.argv.length > 2) {
    const command = process.argv[2];
    
    switch (command) {
        case '--help':
        case '-h':
            console.log(`
使用方法: node test-disk-management.js [options]

选项:
  -h, --help    显示帮助信息
  
环境变量:
  API_BASE_URL  API服务器地址 (默认: http://localhost:3000)

示例:
  node test-disk-management.js
  API_BASE_URL=http://192.168.1.100:3000 node test-disk-management.js
`);
            process.exit(0);
            break;
        default:
            console.log('未知参数，使用 --help 查看帮助');
            process.exit(1);
    }
} else {
    // 运行测试
    runTests().catch(error => {
        console.error('测试执行失败:', error);
        process.exit(1);
    });
} 