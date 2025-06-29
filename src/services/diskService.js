const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const SPDKRpcClient = require('./spdkRpcClient');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

class DiskService {
    constructor() {
        this.spdkClient = new SPDKRpcClient();
    }

    /**
     * 获取所有物理磁盘信息
     */
    async getAllDisks() {
        try {
            const [blockDevices, nvmeDevices, spdkBdevs, mountInfo, nvmeDiscovered] = await Promise.all([
                this.getBlockDevices(),
                this.getNvmeDevices(),
                this.getSpdkBdevs(),
                this.getMountInfo(),
                this.getDiscoveredNvmeDevices()
            ]);

            // 用于存储所有磁盘的Map，避免重复检测同一物理设备
            const diskMap = new Map();
            
            // 添加内核态块设备（包括内核态NVMe）
            for (const disk of blockDevices) {
                let key;
                if (disk.type === 'nvme' && disk.pcie_addr) {
                    // 内核态NVMe使用PCIe地址作为key和显示名称
                    key = `nvme_${disk.pcie_addr}`;
                    disk.display_name = disk.pcie_addr; // 使用PCIe地址作为显示名称
                    disk.original_name = disk.name; // 保存原始设备名
                } else {
                    // 其他设备使用设备路径作为key
                    key = `device_${disk.device_path}`;
                    disk.display_name = disk.name; // 保持原名称
                }
                diskMap.set(key, disk);
            }
            
            // 添加用户态NVMe设备，避免与内核态重复
            for (const disk of nvmeDevices) {
                // 检查是否与内核态设备重复（通过设备路径和序列号）
                let isDuplicate = false;
                for (const [existingKey, existingDisk] of diskMap.entries()) {
                    if (existingDisk.type === 'nvme' && 
                        existingDisk.device_path === disk.device_path &&
                        existingDisk.serial === disk.serial &&
                        existingDisk.model === disk.model) {
                        logger.debug(`Skipping duplicate user-mode NVMe device ${disk.name} - already exists as kernel-mode device ${existingDisk.display_name}`);
                        isDuplicate = true;
                        break;
                    }
                }
                
                if (!isDuplicate) {
                    // 尝试从discovered信息中找到对应的设备以获取PCIe地址
                    const discoveredDevice = nvmeDiscovered.find(nvme => {
                        // 通过模型和序列号匹配
                        return nvme.model_number && disk.model && 
                               nvme.model_number.trim() === disk.model.trim() &&
                               nvme.serial_number && disk.serial &&
                               nvme.serial_number.trim() === disk.serial.trim();
                    });
                    
                    let key;
                    if (discoveredDevice && discoveredDevice.pcie_addr) {
                        key = `nvme_${discoveredDevice.pcie_addr}`;
                    } else {
                        // 如果没有discovered信息，使用设备路径和序列号组合作为key
                        key = `user_nvme_${disk.device_path}_${disk.serial}`;
                    }
                    
                    disk.display_name = disk.name; // 用户态设备保持原名称
                    diskMap.set(key, disk);
                }
            }
            
            // 添加从discovery获取的纯用户态NVMe设备（没有对应的nvme-cli设备）
            for (const discoveredDevice of nvmeDiscovered) {
                const pcieAddr = discoveredDevice.pcie_addr;
                const key = `nvme_${pcieAddr}`;
                
                // 检查是否已经存在（内核态或通过nvme-cli获取的用户态）
                if (!diskMap.has(key)) {
                    // 创建纯用户态设备记录
                    const userNvmeDevice = {
                        name: `nvme_${pcieAddr.replace(/:/g, '_').replace(/\./g, '_')}`, // 生成设备名
                        display_name: `nvme_${pcieAddr.replace(/:/g, '_').replace(/\./g, '_')}`, // 用户态设备保持设备名
                        device_path: null, // 用户态设备没有内核设备路径
                        size: this.formatSize(discoveredDevice.total_capacity_bytes || 0),
                        size_bytes: discoveredDevice.total_capacity_bytes || 0,
                        type: 'nvme',
                        transport: 'nvme',
                        model: discoveredDevice.model_number ? discoveredDevice.model_number.trim() : 'Unknown',
                        serial: discoveredDevice.serial_number ? discoveredDevice.serial_number.trim() : 'Unknown',
                        vendor: 'Unknown',
                        firmware: discoveredDevice.firmware_version || 'Unknown',
                        rotational: false,
                        readonly: false,
                        removable: false,
                        hotplug: true,
                        physical_sector_size: 512, // 默认值
                        logical_sector_size: 512, // 默认值
                        partitions: [],
                        mountpoints: [],
                        fstype: null,
                        uuid: null,
                        part_uuid: null,
                        kernel_mode: false, // 标记为用户态设备
                        pcie_addr: pcieAddr // 保存PCIe地址
                    };
                    
                    diskMap.set(key, userNvmeDevice);
                    logger.debug(`Added pure user-mode NVMe device from discovery: ${pcieAddr}`);
                }
            }
            
            // 转换为数组
            const allDisks = Array.from(diskMap.values());
            
            // 整合发现的NVMe信息 - 只给用户态设备添加discovery信息
            this.mergeDiscoveredNvmeInfo(allDisks, nvmeDiscovered);
            
            // 添加 SPDK 和挂载状态
            for (const disk of allDisks) {
                disk.is_mounted = this.checkIfMounted(disk, mountInfo);
                disk.is_spdk_bdev = this.checkIfSpdkBdev(disk, spdkBdevs);
                disk.spdk_bdev_info = this.getSpdkBdevInfo(disk, spdkBdevs);
            }

            return allDisks;

        } catch (error) {
            logger.error('Error getting all disks:', error);
            throw new Error(`Failed to get disk information: ${error.message}`);
        }
    }

    /**
     * 获取传统块设备信息 (使用 lsblk)
     */
    async getBlockDevices() {
        try {
            const { stdout } = await execAsync('lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,UUID,PARTUUID,MODEL,SERIAL,VENDOR,TRAN,ROTA,RO,RM,HOTPLUG,PHY-SEC,LOG-SEC');
            const lsblkData = JSON.parse(stdout);
            
            const devices = [];
            
            for (const device of lsblkData.blockdevices) {
                if (device.type === 'disk') {
                    const diskInfo = await this.processBlockDevice(device);
                    devices.push(diskInfo);
                }
            }

            return devices;

        } catch (error) {
            logger.warn('Error getting block devices:', error.message);
            return [];
        }
    }

    /**
     * 获取 NVMe 设备信息 (使用 nvme cli)
     */
    async getNvmeDevices() {
        try {
            // 检查 nvme 命令是否可用
            await execAsync('which nvme');
            
            const { stdout } = await execAsync('nvme list -o json');
            const nvmeData = JSON.parse(stdout);
            
            const devices = [];
            
            if (nvmeData.Devices) {
                for (const device of nvmeData.Devices) {
                    const diskInfo = await this.processNvmeDevice(device);
                    devices.push(diskInfo);
                }
            }

            return devices;

        } catch (error) {
            logger.warn('Error getting NVMe devices (nvme-cli might not be installed):', error.message);
            return [];
        }
    }

    /**
     * 处理传统块设备
     */
    async processBlockDevice(device) {
        const diskInfo = {
            name: device.name,
            device_path: `/dev/${device.name}`,
            size: device.size,
            size_bytes: await this.getSizeInBytes(device.name),
            type: 'block',
            transport: device.tran || 'unknown',
            model: device.model || 'Unknown',
            serial: device.serial || 'Unknown',
            vendor: device.vendor || 'Unknown',
            rotational: device.rota === '1',
            readonly: device.ro === '1',
            removable: device.rm === '1',
            hotplug: device.hotplug === '1',
            physical_sector_size: device['phy-sec'] || 'Unknown',
            logical_sector_size: device['log-sec'] || 'Unknown',
            partitions: [],
            mountpoints: [],
            fstype: device.fstype || null,
            uuid: device.uuid || null,
            part_uuid: device.partuuid || null,
            kernel_mode: true // Mark as kernel mode device
        };

        // Check if this is a kernel-mode NVMe device
        if (this.isKernelNvmeDevice(device.name, device.tran)) {
            diskInfo.type = 'nvme';
            diskInfo.transport = 'nvme';
            diskInfo.rotational = false; // NVMe devices are always non-rotational
            
            // Get PCIe address for kernel-mode NVMe devices
            diskInfo.pcie_addr = await this.getKernelNvmePcieAddress(device.name);
        }

        // 处理分区
        if (device.children) {
            for (const child of device.children) {
                if (child.type === 'part') {
                    diskInfo.partitions.push({
                        name: child.name,
                        device_path: `/dev/${child.name}`,
                        size: child.size,
                        mountpoint: child.mountpoint,
                        fstype: child.fstype,
                        uuid: child.uuid,
                        part_uuid: child.partuuid
                    });
                    
                    if (child.mountpoint) {
                        diskInfo.mountpoints.push(child.mountpoint);
                    }
                }
            }
        }

        // 如果主设备有挂载点
        if (device.mountpoint) {
            diskInfo.mountpoints.push(device.mountpoint);
        }

        return diskInfo;
    }

    /**
     * 处理 NVMe 设备
     */
    async processNvmeDevice(device) {
        const deviceName = path.basename(device.DevicePath);
        
        const diskInfo = {
            name: deviceName,
            device_path: device.DevicePath,
            size: this.formatSize(device.PhysicalSize),
            size_bytes: device.PhysicalSize,
            type: 'nvme',
            transport: 'nvme',
            model: device.ModelNumber || 'Unknown',
            serial: device.SerialNumber || 'Unknown',
            vendor: device.Vendor || 'Unknown',
            firmware: device.Firmware || 'Unknown',
            rotational: false, // NVMe devices are always non-rotational
            readonly: false,
            removable: false,
            hotplug: true,
            physical_sector_size: device.SectorSize || 512,
            logical_sector_size: device.SectorSize || 512,
            partitions: [],
            mountpoints: [],
            fstype: null,
            uuid: null,
            part_uuid: null,
            kernel_mode: false, // Mark as user-mode device (from nvme-cli)
            nvme_info: {
                namespace_id: device.NameSpace,
                usage: device.UsedBytes,
                utilization: device.MaximumLBA
            }
        };

        // 获取 NVMe 设备的分区信息
        try {
            const { stdout } = await execAsync(`lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,UUID,PARTUUID /dev/${deviceName}`);
            const lsblkData = JSON.parse(stdout);
            
            if (lsblkData.blockdevices && lsblkData.blockdevices[0]) {
                const nvmeBlock = lsblkData.blockdevices[0];
                
                if (nvmeBlock.children) {
                    for (const child of nvmeBlock.children) {
                        if (child.type === 'part') {
                            diskInfo.partitions.push({
                                name: child.name,
                                device_path: `/dev/${child.name}`,
                                size: child.size,
                                mountpoint: child.mountpoint,
                                fstype: child.fstype,
                                uuid: child.uuid,
                                part_uuid: child.partuuid
                            });
                            
                            if (child.mountpoint) {
                                diskInfo.mountpoints.push(child.mountpoint);
                            }
                        }
                    }
                }

                if (nvmeBlock.mountpoint) {
                    diskInfo.mountpoints.push(nvmeBlock.mountpoint);
                }
                
                diskInfo.fstype = nvmeBlock.fstype;
                diskInfo.uuid = nvmeBlock.uuid;
                diskInfo.part_uuid = nvmeBlock.partuuid;
            }
        } catch (error) {
            logger.warn(`Could not get partition info for ${deviceName}:`, error.message);
        }

        return diskInfo;
    }

    /**
     * 获取设备字节大小
     */
    async getSizeInBytes(deviceName) {
        try {
            const { stdout } = await execAsync(`blockdev --getsize64 /dev/${deviceName}`);
            return parseInt(stdout.trim());
        } catch (error) {
            logger.warn(`Could not get size for ${deviceName}:`, error.message);
            return 0;
        }
    }

    /**
     * 格式化大小显示
     */
    formatSize(bytes) {
        if (!bytes || bytes === 0) return '0B';
        
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)}${sizes[i]}`;
    }

    /**
     * 获取 SPDK bdev 信息
     */
    async getSpdkBdevs() {
        try {
            await this.spdkClient.checkConnection();
            return await this.spdkClient.getBdevs();
        } catch (error) {
            logger.warn('Could not get SPDK bdevs:', error.message);
            return [];
        }
    }

    /**
     * 获取挂载信息
     */
    async getMountInfo() {
        try {
            const { stdout } = await execAsync('mount');
            return stdout;
        } catch (error) {
            logger.warn('Could not get mount info:', error.message);
            return '';
        }
    }

    /**
     * 检查设备是否已挂载
     */
    checkIfMounted(disk, mountInfo) {
        // 用户态设备（device_path 为 null）不会被挂载
        if (!disk.device_path) {
            return false;
        }
        
        if (disk.mountpoints && disk.mountpoints.length > 0) {
            return true;
        }
        
        // 检查分区是否有挂载
        if (disk.partitions) {
            for (const partition of disk.partitions) {
                if (partition.mountpoint) {
                    return true;
                }
            }
        }
        
        // 额外检查 mount 命令输出
        if (mountInfo.includes(disk.device_path)) {
            return true;
        }
        
        return false;
    }

    /**
     * 检查设备是否被 SPDK 使用
     */
    checkIfSpdkBdev(disk, spdkBdevs) {
        // 对于纯用户态设备（device_path 为 null），不会被 SPDK 直接使用
        if (!disk.device_path) {
            return false;
        }
        
        for (const bdev of spdkBdevs) {
            // 检查 NVMe 设备
            if (bdev.driver_specific && bdev.driver_specific.nvme) {
                const nvmeInfo = bdev.driver_specific.nvme;
                if (nvmeInfo.pci_address || nvmeInfo.trid) {
                    // 通过 PCI 地址或设备路径匹配
                    if (disk.device_path.includes(bdev.name) || 
                        bdev.name.includes(disk.name)) {
                        return true;
                    }
                }
            }
            
            // 检查 AIO 设备
            if (bdev.driver_specific && bdev.driver_specific.aio) {
                const aioInfo = bdev.driver_specific.aio;
                if (aioInfo.filename === disk.device_path) {
                    return true;
                }
            }
            
            // 检查其他类型的匹配
            if (bdev.aliases) {
                for (const alias of bdev.aliases) {
                    if (alias.includes(disk.name) || disk.device_path.includes(alias)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    }

    /**
     * 获取 SPDK bdev 详细信息
     */
    getSpdkBdevInfo(disk, spdkBdevs) {
        for (const bdev of spdkBdevs) {
            if (this.checkIfSpdkBdev(disk, [bdev])) {
                return {
                    bdev_name: bdev.name,
                    bdev_type: bdev.product_name,
                    block_size: bdev.block_size,
                    num_blocks: bdev.num_blocks,
                    size_bytes: bdev.block_size * bdev.num_blocks,
                    uuid: bdev.uuid,
                    driver_specific: bdev.driver_specific
                };
            }
        }
        return null;
    }

    /**
     * 获取特定磁盘的详细信息
     */
    async getDiskInfo(deviceName) {
        const allDisks = await this.getAllDisks();
        const disk = allDisks.find(d => d.name === deviceName || d.device_path === deviceName);
        
        if (!disk) {
            throw new Error(`Disk '${deviceName}' not found`);
        }
        
        return disk;
    }

    /**
     * 获取磁盘的 SMART 信息（如果支持）
     */
    async getDiskSmartInfo(deviceName) {
        try {
            // 尝试使用 smartctl 获取 SMART 信息
            const { stdout } = await execAsync(`smartctl -a /dev/${deviceName} -j`);
            return JSON.parse(stdout);
        } catch (error) {
            logger.warn(`Could not get SMART info for ${deviceName}:`, error.message);
            return null;
        }
    }

    /**
     * 检查磁盘健康状态
     */
    async checkDiskHealth(deviceName) {
        try {
            const smartInfo = await this.getDiskSmartInfo(deviceName);
            
            if (!smartInfo) {
                return { status: 'unknown', message: 'SMART data not available' };
            }
            
            const healthStatus = smartInfo.smart_status?.passed;
            
            if (healthStatus === true) {
                return { status: 'healthy', message: 'Disk is healthy' };
            } else if (healthStatus === false) {
                return { status: 'unhealthy', message: 'Disk health check failed' };
            } else {
                return { status: 'unknown', message: 'Could not determine disk health' };
            }
            
        } catch (error) {
            logger.warn(`Health check failed for ${deviceName}:`, error.message);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * 获取磁盘使用统计
     */
    async getDiskStats() {
        try {
            const allDisks = await this.getAllDisks();
            
            const availableDisks = allDisks.filter(d => !d.is_mounted && !d.is_spdk_bdev);
            
            const stats = {
                total_disks: allDisks.length,
                mounted_disks: allDisks.filter(d => d.is_mounted).length,
                spdk_bdev_disks: allDisks.filter(d => d.is_spdk_bdev).length,
                available_disks: availableDisks.length,
                nvme_disks: allDisks.filter(d => d.type === 'nvme').length,
                block_disks: allDisks.filter(d => d.type === 'block').length,
                total_capacity: allDisks.reduce((sum, d) => sum + (d.size_bytes || 0), 0),
                available_capacity: availableDisks.reduce((sum, d) => sum + (d.size_bytes || 0), 0),
                rotational_disks: allDisks.filter(d => d.rotational).length,
                ssd_disks: allDisks.filter(d => !d.rotational).length
            };
            
            return stats;
            
        } catch (error) {
            logger.error('Error getting disk stats:', error);
            throw new Error(`Failed to get disk statistics: ${error.message}`);
        }
    }

    /**
     * 获取发现的NVMe设备信息
     */
    async getDiscoveredNvmeDevices() {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            
            const { stdout } = await execAsync('/usr/bin/nvme_discover_json', { timeout: 30000 });
            const result = JSON.parse(stdout);
            
            logger.info(`NVMe discovery found ${result.total_devices} devices`);
            return result.nvme_devices || [];
            
        } catch (error) {
            logger.warn('Could not discover NVMe devices:', error.message);
            return [];
        }
    }

    /**
     * 整合发现的NVMe信息到磁盘列表中
     * 只为用户态NVMe设备添加discovery信息，内核态设备绝对不添加
     */
    mergeDiscoveredNvmeInfo(disks, discoveredNvme) {
        for (const disk of disks) {
            // 只处理用户态NVMe设备
            if (disk.type === 'nvme' && disk.kernel_mode === false) {
                // 查找匹配的discovered设备
                const discovered = discoveredNvme.find(nvme => {
                    // 方法1: 通过PCIe地址匹配（最准确）
                    if (nvme.pcie_addr && disk.pcie_addr) {
                        return nvme.pcie_addr === disk.pcie_addr;
                    }
                    
                    // 方法2: 通过模型号和序列号精确匹配
                    if (nvme.model_number && disk.model && 
                        nvme.serial_number && disk.serial) {
                        return nvme.model_number.trim() === disk.model.trim() &&
                               nvme.serial_number.trim() === disk.serial.trim();
                    }
                    
                    // 方法3: 如果只有模型号匹配（不太准确，谨慎使用）
                    if (nvme.model_number && disk.model && 
                        !nvme.serial_number && !disk.serial) {
                        return nvme.model_number.trim() === disk.model.trim();
                    }
                    
                    return false;
                });

                if (discovered) {
                    // 添加发现的信息
                    disk.nvme_discovery_info = {
                        pcie_addr: discovered.pcie_addr,
                        vendor_id: discovered.vendor_id,
                        subsystem_vendor_id: discovered.subsystem_vendor_id,
                        firmware_version: discovered.firmware_version,
                        namespace_count: discovered.namespace_count,
                        max_namespaces: discovered.max_namespaces,
                        transport_type: discovered.transport_type,
                        discovery_capacity_gb: discovered.total_capacity_gb,
                        discovery_capacity_bytes: discovered.total_capacity_bytes
                    };
                    
                    // 更新或补充基本信息（只有在信息缺失时才补充）
                    if (!disk.model && discovered.model_number) {
                        disk.model = discovered.model_number.trim();
                    }
                    if (!disk.serial && discovered.serial_number) {
                        disk.serial = discovered.serial_number.trim();
                    }
                    if (!disk.firmware && discovered.firmware_version) {
                        disk.firmware = discovered.firmware_version;
                    }
                    
                    logger.debug(`Merged discovery info for user-mode NVMe device: ${disk.display_name} (${discovered.pcie_addr})`);
                } else {
                    logger.debug(`No discovery info found for user-mode NVMe device: ${disk.display_name}`);
                }
            }
            // 明确记录：内核态NVMe设备不添加discovery信息
            else if (disk.type === 'nvme' && disk.kernel_mode === true) {
                // 确保内核态设备没有discovery信息
                if (disk.nvme_discovery_info) {
                    delete disk.nvme_discovery_info;
                    logger.debug(`Removed discovery info from kernel-mode NVMe device: ${disk.display_name}`);
                }
                logger.debug(`Skipping discovery info for kernel-mode NVMe device: ${disk.display_name}`);
            }
        }
    }

    /**
     * 检查磁盘是否匹配指定的PCIe地址
     */
    matchesPcieAddress(disk, pcieAddr) {
        try {
            // 从设备路径中提取PCIe地址信息
            if (disk.device_path && disk.device_path.includes('nvme')) {
                // 从/sys/block/nvme0n1/device路径获取PCIe地址
                const { execSync } = require('child_process');
                const deviceName = disk.name;
                
                try {
                    // 读取设备的PCIe地址
                    const pcieAddrPath = `/sys/block/${deviceName}/device/device`;
                    const actualPcieAddr = execSync(`readlink -f ${pcieAddrPath} | cut -d'/' -f6`, { encoding: 'utf8' }).trim();
                    
                    return actualPcieAddr === pcieAddr;
                } catch (sysError) {
                    // 如果无法从sys读取，尝试其他方法
                    logger.debug(`Could not read PCIe address from sys for ${deviceName}:`, sysError.message);
                    return false;
                }
            }
            return false;
        } catch (error) {
            logger.debug('Error matching PCIe address:', error.message);
            return false;
        }
    }

    /**
     * Check if a device is a kernel-mode NVMe device
     */
    isKernelNvmeDevice(deviceName, transport) {
        // Check if device name starts with 'nvme'
        if (deviceName && deviceName.toLowerCase().startsWith('nvme')) {
            return true;
        }
        
        // Check if transport is PCIe (common for NVMe)
        if (transport && transport.toLowerCase() === 'pcie') {
            return true;
        }
        
        return false;
    }

    /**
     * Get PCIe address for kernel-mode NVMe device
     */
    async getKernelNvmePcieAddress(deviceName) {
        try {
            const { execSync } = require('child_process');
            
            // Method 1: Try to read from /sys/block/nvmeXnY/device
            try {
                const devicePath = `/sys/block/${deviceName}/device`;
                const realPath = execSync(`readlink -f ${devicePath}`, { encoding: 'utf8' }).trim();
                const pcieAddr = realPath.split('/').slice(-1)[0];
                
                // Validate PCIe address format (should be like 0000:00:04.0)
                if (pcieAddr && /^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$/.test(pcieAddr)) {
                    logger.debug(`Found PCIe address for ${deviceName}: ${pcieAddr}`);
                    return pcieAddr;
                }
            } catch (sysError) {
                logger.debug(`Method 1 failed for ${deviceName}: ${sysError.message}`);
            }
            
            // Method 2: Try using nvme list command if available 
            try {
                const { stdout } = await execAsync('nvme list -o json');
                const nvmeData = JSON.parse(stdout);
                
                if (nvmeData.Devices) {
                    const devicePath = `/dev/${deviceName}`;
                    const nvmeDevice = nvmeData.Devices.find(dev => dev.DevicePath === devicePath);
                    
                    if (nvmeDevice && nvmeDevice.Transport) {
                        // Extract PCIe address if available in transport info
                        const transport = nvmeDevice.Transport;
                        const pcieMatch = transport.match(/([0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7])/);
                        if (pcieMatch) {
                            logger.debug(`Found PCIe address via nvme list for ${deviceName}: ${pcieMatch[1]}`);
                            return pcieMatch[1];
                        }
                    }
                }
            } catch (nvmeError) {
                logger.debug(`Method 2 failed for ${deviceName}: ${nvmeError.message}`);
            }
            
            // Method 3: Try reading from /sys/class/nvme/nvmeX/device
            try {
                const nvmeController = deviceName.replace(/n\d+$/, ''); // Remove namespace part
                const controllerPath = `/sys/class/nvme/${nvmeController}/device`;
                const realPath = execSync(`readlink -f ${controllerPath}`, { encoding: 'utf8' }).trim();
                const pcieAddr = realPath.split('/').slice(-1)[0];
                
                if (pcieAddr && /^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$/.test(pcieAddr)) {
                    logger.debug(`Found PCIe address via controller for ${deviceName}: ${pcieAddr}`);
                    return pcieAddr;
                }
            } catch (controllerError) {
                logger.debug(`Method 3 failed for ${deviceName}: ${controllerError.message}`);
            }
            
            logger.debug(`Could not determine PCIe address for kernel NVMe device ${deviceName}`);
            return null;
            
        } catch (error) {
            logger.debug(`Error getting PCIe address for ${deviceName}:`, error.message);
            return null;
        }
    }
}

module.exports = DiskService; 