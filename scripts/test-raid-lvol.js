#!/usr/bin/env node

const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000/api';
let authToken = null;

// 颜色输出
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 错误处理
function handleError(error, context) {
    if (error.response) {
        log(`❌ ${context} 失败: ${error.response.status} - ${error.response.data.message || error.response.data.error}`, 'red');
    } else {
        log(`❌ ${context} 失败: ${error.message}`, 'red');
    }
}

// 认证
async function authenticate() {
    try {
        log('🔐 正在进行身份认证...', 'blue');
        const response = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        
        authToken = response.data.token;
        log('✅ 身份认证成功', 'green');
    } catch (error) {
        handleError(error, '身份认证');
        process.exit(1);
    }
}

// 创建 HTTP 客户端
function createClient() {
    return axios.create({
        baseURL: BASE_URL,
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        }
    });
}

// 等待函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试 RAID 管理功能
async function testRaidManagement() {
    const client = createClient();
    
    log('\n📦 测试 RAID 管理功能', 'cyan');
    
    try {
        // 首先创建一些 malloc bdev 用作基础设备
        log('创建 malloc bdev 用于测试...', 'yellow');
        await client.post('/bdevs/malloc', {
            name: 'malloc_test1',
            num_blocks: 1000,
            block_size: 512
        });
        
        await client.post('/bdevs/malloc', {
            name: 'malloc_test2',
            num_blocks: 1000,
            block_size: 512
        });
        
        await client.post('/bdevs/malloc', {
            name: 'malloc_test3',
            num_blocks: 1000,
            block_size: 512
        });
        log('✅ Malloc bdev 创建成功', 'green');
        
        // 创建 RAID 0
        log('创建 RAID 0...', 'yellow');
        await client.post('/raids', {
            name: 'test_raid0',
            raid_level: 'raid0',
            base_bdevs: ['malloc_test1', 'malloc_test2'],
            strip_size: 64
        });
        log('✅ RAID 0 创建成功', 'green');
        
        // 测试添加基础 bdev 到 RAID
        log('向 RAID 添加基础 bdev...', 'yellow');
        await client.post('/raid/base-bdev', {
            raid_bdev: 'test_raid0',
            base_bdev: 'malloc_test3'
        });
        log('✅ 基础 bdev 添加成功', 'green');
        
        // 等待一下
        await sleep(1000);
        
        // 测试从 RAID 移除基础 bdev
        log('从 RAID 移除基础 bdev...', 'yellow');
        await client.delete('/raid/base-bdev', {
            data: {
                raid_bdev: 'test_raid0',
                base_bdev: 'malloc_test3'
            }
        });
        log('✅ 基础 bdev 移除成功', 'green');
        
    } catch (error) {
        handleError(error, 'RAID 管理测试');
    }
}

// 测试 LV Store 管理功能
async function testLVStoreManagement() {
    const client = createClient();
    
    log('\n💾 测试 LV Store 管理功能', 'cyan');
    
    try {
        // 创建 malloc bdev 用于 LV Store
        log('创建 malloc bdev 用于 LV Store...', 'yellow');
        await client.post('/bdevs/malloc', {
            name: 'malloc_lvs',
            num_blocks: 10000,
            block_size: 512
        });
        log('✅ Malloc bdev 创建成功', 'green');
        
        // 创建 LV Store
        log('创建 LV Store...', 'yellow');
        const lvstoreResponse = await client.post('/lvstore', {
            bdev_name: 'malloc_lvs',
            lvs_name: 'test_lvstore',
            cluster_sz: 65536
        });
        log('✅ LV Store 创建成功', 'green');
        
        // 获取 LV Store 列表
        log('获取 LV Store 列表...', 'yellow');
        const lvstoresResponse = await client.get('/lvstore');
        const lvstore = lvstoresResponse.data.find(lvs => lvs.name === 'test_lvstore');
        
        if (!lvstore) {
            throw new Error('创建的 LV Store 未找到');
        }
        log(`✅ LV Store 获取成功，UUID: ${lvstore.uuid}`, 'green');
        
        // 重命名 LV Store
        log('重命名 LV Store...', 'yellow');
        await client.put('/lvstore/rename', {
            old_name: 'test_lvstore',
            new_name: 'renamed_lvstore'
        });
        log('✅ LV Store 重命名成功', 'green');
        
        // 测试扩展 LV Store
        log('扩展 LV Store...', 'yellow');
        await client.put(`/lvstore/${lvstore.uuid}/grow`);
        log('✅ LV Store 扩展成功', 'green');
        
        return lvstore.uuid;
        
    } catch (error) {
        handleError(error, 'LV Store 管理测试');
        return null;
    }
}

// 测试 LVol 管理功能
async function testLVolManagement(lvstoreUuid) {
    if (!lvstoreUuid) {
        log('⚠️ 跳过 LVol 测试，因为 LV Store 创建失败', 'yellow');
        return;
    }
    
    const client = createClient();
    
    log('\n📂 测试 LVol 管理功能', 'cyan');
    
    try {
        // 创建 LVol
        log('创建 LVol...', 'yellow');
        await client.post('/lvol', {
            lvol_store_uuid: lvstoreUuid,
            lvol_name: 'test_lvol',
            size: 1048576, // 1MB
            thin_provision: true
        });
        log('✅ LVol 创建成功', 'green');
        
        // 获取 LVol 列表
        log('获取 LVol 列表...', 'yellow');
        const lvolsResponse = await client.get('/lvol');
        const lvol = lvolsResponse.data.find(lv => lv.name.includes('test_lvol'));
        
        if (!lvol) {
            throw new Error('创建的 LVol 未找到');
        }
        log(`✅ LVol 获取成功: ${lvol.name}`, 'green');
        
        // 创建快照
        log('创建 LVol 快照...', 'yellow');
        await client.post('/lvol/snapshot', {
            lvol_name: lvol.name,
            snapshot_name: 'test_snapshot'
        });
        log('✅ LVol 快照创建成功', 'green');
        
        // 创建克隆
        log('创建 LVol 克隆...', 'yellow');
        await sleep(1000); // 等待快照完成
        const updatedLvolsResponse = await client.get('/lvol');
        const snapshot = updatedLvolsResponse.data.find(lv => lv.name.includes('test_snapshot'));
        
        if (snapshot) {
            await client.post('/lvol/clone', {
                snapshot_name: snapshot.name,
                clone_name: 'test_clone'
            });
            log('✅ LVol 克隆创建成功', 'green');
        } else {
            log('⚠️ 未找到快照，跳过克隆测试', 'yellow');
        }
        
        // 重命名 LVol
        log('重命名 LVol...', 'yellow');
        await client.put('/lvol/rename', {
            old_name: lvol.name,
            new_name: lvol.name.replace('test_lvol', 'renamed_lvol')
        });
        log('✅ LVol 重命名成功', 'green');
        
        // 调整大小
        log('调整 LVol 大小...', 'yellow');
        const newName = lvol.name.replace('test_lvol', 'renamed_lvol');
        await client.put(`/lvol/${encodeURIComponent(newName)}/resize`, {
            size: 2097152 // 2MB
        });
        log('✅ LVol 大小调整成功', 'green');
        
        // 设为只读
        log('设置 LVol 为只读...', 'yellow');
        await client.put(`/lvol/${encodeURIComponent(newName)}/read-only`);
        log('✅ LVol 设为只读成功', 'green');
        
        // 膨胀 LVol（如果是精简配置的）
        log('膨胀 LVol...', 'yellow');
        try {
            await client.put(`/lvol/${encodeURIComponent(newName)}/inflate`);
            log('✅ LVol 膨胀成功', 'green');
        } catch (error) {
            log('⚠️ LVol 膨胀失败（可能已经是厚配置）', 'yellow');
        }
        
    } catch (error) {
        handleError(error, 'LVol 管理测试');
    }
}

// 清理测试资源
async function cleanup() {
    const client = createClient();
    
    log('\n🧹 清理测试资源...', 'cyan');
    
    try {
        // 获取并删除所有 LVol
        const lvolsResponse = await client.get('/lvol');
        for (const lvol of lvolsResponse.data) {
            if (lvol.name.includes('test_') || lvol.name.includes('renamed_')) {
                try {
                    await client.delete(`/lvol/${encodeURIComponent(lvol.name)}`);
                    log(`✅ 删除 LVol: ${lvol.name}`, 'green');
                } catch (error) {
                    log(`⚠️ 删除 LVol 失败: ${lvol.name}`, 'yellow');
                }
            }
        }
        
        // 等待一下
        await sleep(1000);
        
        // 获取并删除所有 LV Store
        const lvstoresResponse = await client.get('/lvstore');
        for (const lvstore of lvstoresResponse.data) {
            if (lvstore.name.includes('test_') || lvstore.name.includes('renamed_')) {
                try {
                    await client.delete(`/lvstore/${lvstore.uuid}`);
                    log(`✅ 删除 LV Store: ${lvstore.name}`, 'green');
                } catch (error) {
                    log(`⚠️ 删除 LV Store 失败: ${lvstore.name}`, 'yellow');
                }
            }
        }
        
        // 删除 RAID
        const raidsResponse = await client.get('/raids');
        for (const raid of raidsResponse.data) {
            if (raid.name.includes('test_')) {
                try {
                    await client.delete(`/raids/${raid.name}`);
                    log(`✅ 删除 RAID: ${raid.name}`, 'green');
                } catch (error) {
                    log(`⚠️ 删除 RAID 失败: ${raid.name}`, 'yellow');
                }
            }
        }
        
        // 删除 malloc bdev
        const bdevsResponse = await client.get('/bdevs');
        for (const bdev of bdevsResponse.data) {
            if (bdev.name.includes('malloc_test') || bdev.name.includes('malloc_lvs')) {
                try {
                    await client.delete(`/bdevs/malloc/${bdev.name}`);
                    log(`✅ 删除 malloc bdev: ${bdev.name}`, 'green');
                } catch (error) {
                    log(`⚠️ 删除 malloc bdev 失败: ${bdev.name}`, 'yellow');
                }
            }
        }
        
    } catch (error) {
        handleError(error, '清理');
    }
}

// 主测试函数
async function runTests() {
    log('🚀 开始 RAID 和 LVol 功能测试', 'magenta');
    
    try {
        await authenticate();
        
        await testRaidManagement();
        
        const lvstoreUuid = await testLVStoreManagement();
        
        await testLVolManagement(lvstoreUuid);
        
        await cleanup();
        
        log('\n🎉 所有测试完成！', 'green');
        
    } catch (error) {
        log(`\n💥 测试过程中出现错误: ${error.message}`, 'red');
        process.exit(1);
    }
}

// 运行测试
if (require.main === module) {
    runTests().catch(error => {
        log(`测试失败: ${error.message}`, 'red');
        process.exit(1);
    });
}

module.exports = { runTests }; 