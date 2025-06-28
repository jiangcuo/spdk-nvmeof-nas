const net = require('net');
const fs = require('fs');
const logger = require('../utils/logger');
const globalConfig = require('../config/global');

class SPDKRpcClient {
    constructor() {
        this.requestId = 1;
    }

    /**
     * 获取SPDK socket路径
     */
    get socketPath() {
        return globalConfig.getSpdkSocketPath();
    }

    /**
     * 获取RPC超时时间
     */
    get timeout() {
        return globalConfig.getTimeout();
    }

    /**
     * 检查SPDK socket是否存在且可连接
     */
    async checkConnection() {
        try {
            if (!fs.existsSync(this.socketPath)) {
                throw new Error(`SPDK socket not found: ${this.socketPath}`);
            }
            
            // 测试连接
            const testClient = net.createConnection(this.socketPath);
            return new Promise((resolve, reject) => {
                testClient.on('connect', () => {
                    testClient.end();
                    resolve(true);
                });
                testClient.on('error', (err) => {
                    reject(new Error(`Cannot connect to SPDK: ${err.message}`));
                });
                setTimeout(() => {
                    testClient.destroy();
                    reject(new Error('Connection timeout'));
                }, 5000);
            });
        } catch (error) {
            throw new Error(`SPDK connection check failed: ${error.message}`);
        }
    }

    /**
     * 通用方法调用SPDK RPC
     */
    async call(method, params = null) {
        return await this.sendRpcRequest(method, params);
    }

    /**
     * 发送RPC请求到SPDK
     */
    async sendRpcRequest(method, params = null, customTimeout = null) {
        return new Promise((resolve, reject) => {
            const client = net.createConnection(this.socketPath);
            let responseData = '';

            const request = {
                jsonrpc: '2.0',
                id: this.requestId++,
                method: method
            };

            // 只有当params不为null且不为空对象时才添加params字段
            if (params !== null && params !== undefined) {
                // 如果是字符串、数字或其他原始类型，直接设置
                if (typeof params !== 'object' || Array.isArray(params)) {
                    request.params = params;
                } else if (Object.keys(params).length > 0) {
                    // 如果是对象且不为空，才设置
                    request.params = params;
                }
            }

            const requestJson = JSON.stringify(request) + '\n';

            // 使用自定义超时时间或默认超时时间
            const timeoutMs = customTimeout || this.timeout;
            const timeout = setTimeout(() => {
                client.destroy();
                reject(new Error(`RPC request timeout for method: ${method} (timeout: ${timeoutMs}ms)`));
            }, timeoutMs);

            client.on('connect', () => {
                logger.info(`Sending RPC request: ${method}`, { params });
                client.write(requestJson);
            });

            client.on('data', (data) => {
                responseData += data.toString();
                
                // 检查是否收到完整的JSON响应
                try {
                    const lines = responseData.split('\n').filter(line => line.trim());
                    if (lines.length > 0) {
                        const response = JSON.parse(lines[lines.length - 1]);
                        clearTimeout(timeout);
                        client.end();
                        
                        if (response.error) {
                            reject(  new Error(`SPDK RPC Error: ${response.error.message}`));
                        } else {
                            resolve(response.result);
                        }
                    }
                } catch (parseError) {
                    // 继续等待更多数据
                }
            });

            client.on('error', (err) => {
                clearTimeout(timeout);
                logger.error(`RPC connection error: ${err.message}`);
                reject(new Error(`RPC connection failed: ${err.message}`));
            });

            client.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }

    // ========== Bdev Management ==========

    /**
     * 获取所有块设备列表
     */
    async getBdevs(name = null) {
        const params = name ? { name } : {};
        return await this.sendRpcRequest('bdev_get_bdevs', params);
    }

    /**
     * 连接NVMe控制器
     */
    async attachNvmeController(name, trtype, traddr, adrfam = null, trsvcid = null) {
        const params = {
            name: name,
            trtype: trtype,
            traddr: traddr
        };
        
        if (adrfam) params.adrfam = adrfam;
        if (trsvcid) params.trsvcid = trsvcid;
        
        return await this.sendRpcRequest('bdev_nvme_attach_controller', params);
    }

    /**
     * 分离NVMe控制器
     */
    async detachNvmeController(name) {
        return await this.sendRpcRequest('bdev_nvme_detach_controller', { name });
    }

    /**
     * 创建malloc块设备（用于测试）
     */
    async createMallocBdev(name, numBlocks, blockSize = 512) {
        return await this.sendRpcRequest('bdev_malloc_create', {
            name: name,
            num_blocks: numBlocks,
            block_size: blockSize
        });
    }

    /**
     * 分离NVMe控制器
     */
    async detachNvmeController(name) {
        return await this.sendRpcRequest('bdev_nvme_detach_controller', { name });
    }

    /**
     * 创建AIO块设备
     */
    async createAioBdev(name, filename, blockSize = 512) {
        return await this.sendRpcRequest('bdev_aio_create', {
            name: name,
            filename: filename,
            block_size: blockSize
        });
    }

    /**
     * 删除AIO块设备
     */
    async deleteAioBdev(name) {
        return await this.sendRpcRequest('bdev_aio_delete', { name });
    }

    /**
     * 删除 NVMe 控制器和相关的块设备
     */
    async deleteNvmeBdev(name) {
        return await this.sendRpcRequest('bdev_nvme_detach_controller', { name });
    }

    /**
     * 删除 Malloc 块设备
     */
    async deleteMallocBdev(name) {
        return await this.sendRpcRequest('bdev_malloc_delete', { name });
    }

    /**
     * 删除 Null 块设备
     */
    async deleteNullBdev(name) {
        return await this.sendRpcRequest('bdev_null_delete', { name });
    }

    /**
     * 删除 RBD 块设备
     */
    async deleteRbdBdev(name) {
        return await this.sendRpcRequest('bdev_rbd_delete', { name });
    }

    // ========== RAID Management ==========

    /**
     * 创建RAID
     */
    async createRaid(name, raidLevel, baseBdevs, stripSize = null) {
        // 转换RAID级别格式：前端发送的是raid0, raid1, raid5f，但SPDK期望的是对应字符串
        let spdkRaidLevel = raidLevel;
        if (raidLevel === 'raid0') spdkRaidLevel = 'raid0';
        else if (raidLevel === 'raid1') spdkRaidLevel = 'raid1';
        else if (raidLevel === 'raid5f') spdkRaidLevel = 'raid5f';
        
        const params = {
            name: name,
            raid_level: spdkRaidLevel,
            base_bdevs: baseBdevs
        };
        
        // RAID1不支持条带大小设置，RAID0和RAID5需要条带大小
        if (spdkRaidLevel === 'raid1') {
            // RAID1不设置strip_size参数
        } else if ((spdkRaidLevel === 'raid0' || spdkRaidLevel === 'raid5f') && stripSize) {
            params.strip_size_kb = stripSize;
        }
        
        return await this.sendRpcRequest('bdev_raid_create', params);
    }

    /**
     * 删除RAID
     */
    async deleteRaid(name) {
        return await this.sendRpcRequest('bdev_raid_delete', { name });
    }

    /**
     * 获取RAID BDEV列表
     */
    async getRaidBdevs() {
        try {
            // 首先尝试使用专门的RAID获取命令
            const raidData = await this.sendRpcRequest('bdev_raid_get_bdevs', 'all');
            logger.info('Successfully got RAID data using bdev_raid_get_bdevs:', raidData);
            return raidData;
        } catch (error) {
            logger.warn('bdev_raid_get_bdevs failed, using fallback method:', error.message);
            
            // 如果失败，尝试从普通BDEV列表中过滤RAID设备，然后提取driver_specific.raid信息
            const bdevs = await this.getBdevs();
            const raidBdevs = bdevs.filter(bdev => 
                bdev.product_name === 'Raid Volume' || 
                bdev.driver_name === 'raid' ||
                (bdev.driver_specific && bdev.driver_specific.raid)
            );
            
            // 从BDEV的driver_specific.raid中提取真正的RAID信息
            return raidBdevs.map(bdev => {
                if (bdev.driver_specific && bdev.driver_specific.raid) {
                    return {
                        // 首先使用BDEV的名称
                        name: bdev.name,
                        ...bdev.driver_specific.raid,
                        // 保留一些BDEV的基本信息
                        block_size: bdev.block_size,
                        num_blocks: bdev.num_blocks,
                        claimed: bdev.claimed
                    };
                }
                return bdev;
            });
        }
    }

    // ========== NVMe-oF Target Management ==========

    /**
     * 创建传输层
     */
    async createTransport(trtype, tgtAddr = null, tgtPort = null) {
        const params = {
            trtype: trtype
        };
        
        if (tgtAddr) params.tgt_name = tgtAddr;
        if (tgtPort) params.trsvcid = tgtPort;
        
        return await this.sendRpcRequest('nvmf_create_transport', params);
    }

    /**
     * 获取传输层列表
     */
    async getTransports() {
        return await this.sendRpcRequest('nvmf_get_transports');
    }

    /**
     * 创建子系统
     */
    async createSubsystem(nqn, allowAnyHost = true, serialNumber = null, modelNumber = null) {
        const params = {
            nqn: nqn,
            allow_any_host: allowAnyHost
        };
        
        if (serialNumber) params.serial_number = serialNumber;
        if (modelNumber) params.model_number = modelNumber;
        
        return await this.sendRpcRequest('nvmf_create_subsystem', params);
    }

    /**
     * 删除子系统
     */
    async deleteSubsystem(nqn) {
        return await this.sendRpcRequest('nvmf_delete_subsystem', { nqn });
    }

    /**
     * 获取子系统列表
     */
    async getSubsystems() {
        return await this.sendRpcRequest('nvmf_get_subsystems');
    }

    /**
     * 为子系统添加监听器
     */
    async addSubsystemListener(nqn, trtype, traddr, trsvcid, adrfam = 'ipv4') {
        return await this.sendRpcRequest('nvmf_subsystem_add_listener', {
            nqn: nqn,
            listen_address: {
                trtype: trtype,
                traddr: traddr,
                trsvcid: trsvcid,
                adrfam: adrfam
            }
        });
    }

    /**
     * 删除子系统监听器
     */
    async removeSubsystemListener(nqn, trtype, traddr, trsvcid, adrfam = 'ipv4') {
        return await this.sendRpcRequest('nvmf_subsystem_remove_listener', {
            nqn: nqn,
            listen_address: {
                trtype: trtype,
                traddr: traddr,
                trsvcid: trsvcid,
                adrfam: adrfam
            }
        });
    }

    /**
     * 为子系统添加命名空间
     */
    async addSubsystemNamespace(nqn, bdevName, nsid = null, uuid = null) {
        const params = {
            nqn: nqn,
            namespace: {
                bdev_name: bdevName
            }
        };
        
        if (nsid) params.namespace.nsid = nsid;
        if (uuid) params.namespace.uuid = uuid;
        
        return await this.sendRpcRequest('nvmf_subsystem_add_ns', params);
    }

    /**
     * 删除子系统命名空间
     */
    async removeSubsystemNamespace(nqn, nsid) {
        return await this.sendRpcRequest('nvmf_subsystem_remove_ns', {
            nqn: nqn,
            nsid: nsid
        });
    }

    /**
     * 添加主机到子系统
     */
    async addSubsystemHost(nqn, hostNqn) {
        return await this.sendRpcRequest('nvmf_subsystem_add_host', {
            nqn: nqn,
            host: hostNqn
        });
    }

    /**
     * 从子系统移除主机
     */
    async removeSubsystemHost(nqn, hostNqn) {
        return await this.sendRpcRequest('nvmf_subsystem_remove_host', {
            nqn: nqn,
            host: hostNqn
        });
    }

    // ========== Configuration Management ==========

    /**
     * 获取完整的SPDK配置
     */
    async getFullConfig() {
        try {
            const [bdevs, subsystems, transports] = await Promise.all([
                this.getBdevs(),
                this.getSubsystems(), 
                this.getTransports()
            ]);

            return {
                timestamp: new Date().toISOString(),
                spdk_version: await this.getVersion(),
                bdevs: bdevs,
                nvmf: {
                    transports: transports,
                    subsystems: subsystems
                }
            };
        } catch (error) {
            throw new Error(`Failed to get full config: ${error.message}`);
        }
    }

    /**
     * 保存配置到SPDK（如果支持的话）
     */
    async saveConfig(filename = null) {
        const params = filename ? { filename } : {};
        return await this.sendRpcRequest('save_config', params);
    }

    /**
     * 从文件加载配置到SPDK（如果支持的话）
     */
    async loadConfig(filename) {
        return await this.sendRpcRequest('load_config', { filename });
    }

    /**
     * 获取框架配置
     */
    async getFrameworkConfig() {
        return await this.sendRpcRequest('framework_get_config');
    }

    // ========== System Information ==========

    /**
     * 获取SPDK版本信息
     */
    async getVersion() {
        return await this.sendRpcRequest('spdk_get_version');
    }

    /**
     * 获取系统状态
     */
    async getSystemInfo() {
        try {
            const [version, bdevs, subsystems, transports] = await Promise.all([
                this.getVersion(),
                this.getBdevs(),
                this.getSubsystems(),
                this.getTransports()
            ]);

            return {
                version,
                bdev_count: bdevs.length,
                subsystem_count: subsystems.length,
                transport_count: transports.length,
                socket_path: this.socketPath
            };
        } catch (error) {
            throw new Error(`Failed to get system info: ${error.message}`);
        }
    }

    // ========== RAID Management ==========

    /**
     * 向RAID添加基础bdev
     */
    async addRaidBaseBdev(raidBdev, baseBdev) {
        return await this.sendRpcRequest('bdev_raid_add_base_bdev', {
            raid_bdev: raidBdev,
            base_bdev: baseBdev
        });
    }

    /**
     * 从RAID中移除基础bdev
     */
    async removeRaidBaseBdev(raidBdev, baseBdev) {
        return await this.sendRpcRequest('bdev_raid_remove_base_bdev', {
            raid_bdev: raidBdev,
            base_bdev: baseBdev
        });
    }

    // ========== LV Store Management ==========

    /**
     * 创建LV Store
     */
    async createLvstore(bdevName, lvstoreName, clusterSize = null) {
        const params = {
            bdev_name: bdevName,
            lvs_name: lvstoreName
        };
        
        if (clusterSize) {
            params.cluster_sz = clusterSize;
        }
        
        // LVStore创建可能需要很长时间，特别是大容量存储，设置3分钟超时
        return await this.sendRpcRequest('bdev_lvol_create_lvstore', params, 180000);
    }

    /**
     * 重命名LV Store
     */
    async renameLvstore(oldName, newName) {
        return await this.sendRpcRequest('bdev_lvol_rename_lvstore', {
            old_name: oldName,
            new_name: newName
        });
    }

    /**
     * 扩展LV Store大小到底层bdev大小
     */
    async growLvstore(uuid) {
        return await this.sendRpcRequest('bdev_lvol_grow_lvstore', {
            uuid: uuid
        });
    }

    /**
     * 删除LV Store
     */
    async deleteLvstore(uuid) {
        // LVStore删除也可能需要较长时间，设置2分钟超时
        return await this.sendRpcRequest('bdev_lvol_delete_lvstore', {
            uuid: uuid
        }, 120000);
    }

    /**
     * 获取LV Store列表
     */
    async getLvstores() {
        return await this.sendRpcRequest('bdev_lvol_get_lvstores');
    }

    /**
     * 获取LV卷列表
     */
    async getLvols() {
        return await this.sendRpcRequest('bdev_lvol_get_lvols');
    }

    // ========== LVol Management ==========

    /**
     * 创建逻辑卷
     */
    async createLvol(lvstoreUuid, lvolName, sizeInMib, thinProvision = true, clearMethod = null) {
        // SPDK expects size_in_mib parameter directly (no conversion needed)
        const params = {
            uuid: lvstoreUuid,              // Use 'uuid' instead of 'lvol_store_uuid'
            lvol_name: lvolName,
            size_in_mib: sizeInMib,         // Use size directly (already in MiB)
            thin_provision: thinProvision
        };
        
        if (clearMethod) {
            params.clear_method = clearMethod;
        }
        
        return await this.sendRpcRequest('bdev_lvol_create', params);
    }

    /**
     * 创建LVol快照
     */
    async createLvolSnapshot(lvolName, snapshotName) {
        return await this.sendRpcRequest('bdev_lvol_snapshot', {
            lvol_name: lvolName,
            snapshot_name: snapshotName
        });
    }

    /**
     * 创建LVol克隆
     */
    async createLvolClone(snapshotName, cloneName) {
        return await this.sendRpcRequest('bdev_lvol_clone', {
            snapshot_name: snapshotName,
            clone_name: cloneName
        });
    }

    /**
     * 创建非LVol bdev的克隆
     */
    async createLvolCloneBdev(bdevName, cloneName, lvstoreName) {
        return await this.sendRpcRequest('bdev_lvol_clone_bdev', {
            bdev: bdevName,           // Use 'bdev' instead of 'bdev_name'
            clone_name: cloneName,    // Use 'clone_name' instead of 'lvol_name'
            lvs_name: lvstoreName     // Use 'lvs_name' instead of 'lvol_store_uuid'
        });
    }

    /**
     * 重命名LVol
     */
    async renameLvol(oldName, newName) {
        return await this.sendRpcRequest('bdev_lvol_rename', {
            old_name: oldName,
            new_name: newName
        });
    }

    /**
     * 将精简配置的LVol变为厚配置
     */
    async inflateLvol(name) {
        return await this.sendRpcRequest('bdev_lvol_inflate', {
            name: name
        });
    }

    /**
     * 解耦LVol的父级
     */
    async decoupeLvolParent(name) {
        return await this.sendRpcRequest('bdev_lvol_decouple_parent', {
            name: name
        });
    }

    /**
     * 调整LVol大小
     */
    async resizeLvol(name, sizeInMib) {
        // SPDK expects size_in_mib parameter directly (no conversion needed)
        return await this.sendRpcRequest('bdev_lvol_resize', {
            name: name,
            size_in_mib: sizeInMib
        });
    }

    /**
     * 设置LVol为只读
     */
    async setLvolReadOnly(name) {
        return await this.sendRpcRequest('bdev_lvol_set_read_only', {
            name: name
        });
    }

    /**
     * 删除LVol
     */
    async deleteLvol(name) {
        return await this.sendRpcRequest('bdev_lvol_delete', {
            name: name
        });
    }

    /**
     * 开始LVol浅拷贝
     */
    async startLvolShallowCopy(srcLvolName, dstBdevName) {
        return await this.sendRpcRequest('bdev_lvol_start_shallow_copy', {
            src_lvol_name: srcLvolName,
            dst_bdev_name: dstBdevName
        });
    }

    /**
     * 检查LVol浅拷贝状态
     */
    async checkLvolShallowCopy(name) {
        return await this.sendRpcRequest('bdev_lvol_check_shallow_copy', {
            name: name
        });
    }

    /**
     * 设置LVol的父快照
     */
    async setLvolParent(name, parentName) {
        return await this.sendRpcRequest('bdev_lvol_set_parent', {
            name: name,
            parent_name: parentName
        });
    }

    /**
     * 设置LVol的外部父快照
     */
    async setLvolParentBdev(name, parentBdevName) {
        return await this.sendRpcRequest('bdev_lvol_set_parent_bdev', {
            name: name,
            parent_bdev_name: parentBdevName
        });
    }

    // ========== NVMe-oF Advanced Management ==========

    /**
     * 获取子系统的控制器信息
     */
    async getSubsystemControllers(nqn) {
        return await this.sendRpcRequest('nvmf_subsystem_get_controllers', {
            nqn: nqn
        });
    }

    /**
     * 获取子系统的队列对信息
     */
    async getSubsystemQpairs(nqn) {
        return await this.sendRpcRequest('nvmf_subsystem_get_qpairs', {
            nqn: nqn
        });
    }

    /**
     * 设置子系统是否允许任意主机连接
     */
    async setSubsystemAllowAnyHost(nqn, allowAnyHost) {
        const params = {
            nqn: nqn,
            allow_any_host: allowAnyHost
        };
        
        return await this.sendRpcRequest('nvmf_subsystem_allow_any_host', params);
    }

    /**
     * 获取子系统的命名空间信息
     */
    async getSubsystemNamespaces(nqn) {
        try {
            // 首先获取子系统信息
            const subsystems = await this.getSubsystems();
            const subsystem = subsystems.find(sub => sub.nqn === nqn);
            
            if (subsystem && subsystem.namespaces) {
                return subsystem.namespaces;
            }
            
            return [];
        } catch (error) {
            logger.warn(`Failed to get namespaces for subsystem ${nqn}:`, error.message);
            return [];
        }
    }
}

module.exports = SPDKRpcClient; 