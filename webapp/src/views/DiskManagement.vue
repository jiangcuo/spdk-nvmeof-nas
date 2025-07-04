<template>
  <div class="disk-management">
    <div class="page-header">
      <h1 class="page-title">磁盘管理</h1>
      <div class="button-group">
        <el-button @click="refreshDisks" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新扫描
        </el-button>
        <el-button type="primary" @click="refreshScan" :loading="scanLoading" v-if="userStore.isAdmin">
          <el-icon><Search /></el-icon>
          重新扫描
        </el-button>
        <el-button type="success" @click="showNvmeDiscovery" :loading="nvmeLoading">
          <el-icon><Cpu /></el-icon>
          NVMe 发现
        </el-button>
      </div>
    </div>

    <!-- 磁盘统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon total">
            <el-icon size="24"><Monitor /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ diskStats.total_disks || 0 }}</div>
            <div class="stat-label">总磁盘数</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon available">
            <el-icon size="24"><CircleCheck /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ diskStats.available_disks || 0 }}</div>
            <div class="stat-label">可用磁盘</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon nvme">
            <el-icon size="24"><Cpu /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ diskStats.nvme_disks || 0 }}</div>
            <div class="stat-label">NVMe 磁盘</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-icon capacity">
            <el-icon size="24"><PieChart /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ formatBytes(diskStats.total_capacity) }}</div>
            <div class="stat-label">总容量</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 磁盘列表 -->
    <div class="page-card">
      <div class="card-header">
        <h3>物理磁盘列表</h3>
        <div class="table-controls">
          <el-input
            v-model="searchText"
            placeholder="搜索磁盘..."
            clearable
            style="width: 250px; margin-right: 12px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="typeFilter"
            placeholder="磁盘类型"
            clearable
            style="width: 150px"
          >
            <el-option label="全部" value="" />
            <el-option label="NVMe" value="nvme" />
            <el-option label="SSD" value="ssd" />
            <el-option label="HDD" value="hdd" />
          </el-select>
        </div>
      </div>

      <el-table
        :data="filteredDisks"
        v-loading="loading"
        stripe
        @row-click="showDiskDetails"
        class="disk-table"
      >
        <el-table-column prop="name" label="设备名称" min-width="120">
          <template #default="{ row }">
            <div class="device-name">
              <el-icon class="device-icon" :color="getDeviceIconColor(row.type)">
                <component :is="getDeviceIcon(row.type)" />
              </el-icon>
              <span>{{ row.display_name || row.name }}</span>
              <el-tooltip 
                v-if="row.original_name && row.original_name !== (row.display_name || row.name)"
                :content="`原始设备名: ${row.original_name}`"
                placement="top"
              >
                <el-tag type="info" size="small" class="ml-2">
                  {{ row.original_name }}
                </el-tag>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="model" label="型号" min-width="150" show-overflow-tooltip />
        
        <el-table-column label="设备模式" width="120">
          <template #default="{ row }">
            <div v-if="row.type === 'nvme'" class="device-mode">
              <el-tag 
                :type="row.kernel_mode ? 'success' : 'warning'" 
                size="small"
              >
                {{ row.kernel_mode ? '内核态' : '用户态' }}
              </el-tag>
            </div>
            <span v-else class="text-muted">N/A</span>
          </template>
        </el-table-column>
        
        <el-table-column label="PCIe地址" width="130">
          <template #default="{ row }">
            <span v-if="row.pcie_addr || row.nvme_discovery_info?.pcie_addr" class="pcie-addr">
              {{ row.pcie_addr || row.nvme_discovery_info.pcie_addr }}
            </span>
            <span v-else-if="row.type === 'nvme'" class="text-muted">-</span>
            <span v-else class="text-muted">N/A</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="size" label="容量" width="100">
          <template #default="{ row }">
            {{ row.size }}
          </template>
        </el-table-column>

        <el-table-column prop="type" label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="getTypeTagType(row.type)" size="small">
              {{ row.type?.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <div class="status-badges">
              <el-tag v-if="row.is_mounted" type="warning" size="small">已挂载</el-tag>
              <el-tag v-if="row.is_spdk_bdev" type="info" size="small">SPDK</el-tag>
              <el-tag v-if="!row.is_mounted && !row.readonly" type="success" size="small">可用</el-tag>
              <el-tag v-if="row.readonly" type="danger" size="small">只读</el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <div class="button-group">
              <!-- 查看详情按钮 -->
              <el-button size="small" @click.stop="showDiskDetails(row)">
                <el-icon><View /></el-icon>
              </el-button>
              
              <!-- NVMe驱动切换按钮 -->
              <el-button 
                v-if="row.type === 'nvme'"
                size="small" 
                type="warning"
                :disabled="row.is_spdk_bdev || row.is_mounted"
                @click.stop="showDriverSwitchDialog(row)"
              >
                {{ row.kernel_mode ? '转用户态' : '转内核态' }}
              </el-button>
              
              <!-- 磁盘清除按钮 (只针对内核态设备) -->
              <el-button 
                v-if="row.kernel_mode !== false && row.device_path"
                size="small" 
                type="danger"
                :disabled="row.is_spdk_bdev || row.is_mounted"
                @click.stop="showWipeDialog(row)"
              >
                清除数据
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 磁盘详情对话框 -->
    <el-dialog
      v-model="detailsVisible"
      :title="`磁盘详情 - ${selectedDisk?.display_name || selectedDisk?.name}`"
      width="800px"
    >
      <div v-if="selectedDisk" class="disk-details">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="设备名称">
            {{ selectedDisk.display_name || selectedDisk.name }}
            <el-tag v-if="selectedDisk.original_name && selectedDisk.original_name !== (selectedDisk.display_name || selectedDisk.name)" 
                    type="info" size="small" class="ml-2">
              原始: {{ selectedDisk.original_name }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="设备路径">{{ selectedDisk.device_path }}</el-descriptions-item>
          <el-descriptions-item label="型号">{{ selectedDisk.model }}</el-descriptions-item>
          <el-descriptions-item label="序列号">{{ selectedDisk.serial }}</el-descriptions-item>
          <el-descriptions-item label="制造商">{{ selectedDisk.vendor }}</el-descriptions-item>
          <el-descriptions-item label="容量">{{ selectedDisk.size }}</el-descriptions-item>
          <el-descriptions-item label="字节容量">{{ formatBytes(selectedDisk.size_bytes) }}</el-descriptions-item>
          <el-descriptions-item label="物理扇区大小">{{ selectedDisk.physical_sector_size }} bytes</el-descriptions-item>
          <el-descriptions-item label="逻辑扇区大小">{{ selectedDisk.logical_sector_size }} bytes</el-descriptions-item>
          <el-descriptions-item label="类型">{{ selectedDisk.type?.toUpperCase() }}</el-descriptions-item>
          <el-descriptions-item label="传输接口">{{ selectedDisk.transport }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedDisk.type === 'nvme'" label="设备模式">
            <el-tag :type="selectedDisk.kernel_mode ? 'success' : 'warning'">
              {{ selectedDisk.kernel_mode ? '内核态' : '用户态' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="selectedDisk.pcie_addr || selectedDisk.nvme_discovery_info?.pcie_addr" label="PCIe地址">
            <code class="pcie-address">{{ selectedDisk.pcie_addr || selectedDisk.nvme_discovery_info.pcie_addr }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="是否旋转磁盘">
            <el-tag :type="selectedDisk.rotational ? 'warning' : 'success'">
              {{ selectedDisk.rotational ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="只读">
            <el-tag :type="selectedDisk.readonly ? 'danger' : 'success'">
              {{ selectedDisk.readonly ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="可移动">
            <el-tag :type="selectedDisk.removable ? 'warning' : 'info'">
              {{ selectedDisk.removable ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否挂载">
            <el-tag :type="selectedDisk.is_mounted ? 'warning' : 'success'">
              {{ selectedDisk.is_mounted ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否为SPDK设备">
            <el-tag :type="selectedDisk.is_spdk_bdev ? 'info' : 'success'">
              {{ selectedDisk.is_spdk_bdev ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 挂载点信息 -->
        <div v-if="selectedDisk.mountpoints?.length" class="mt-4">
          <h4>挂载点</h4>
          <el-tag v-for="mp in selectedDisk.mountpoints" :key="mp" class="mr-2 mb-2">
            {{ mp }}
          </el-tag>
        </div>

        <!-- 分区信息 -->
        <div v-if="selectedDisk.partitions?.length" class="mt-4">
          <h4>分区信息</h4>
          <el-table :data="selectedDisk.partitions" size="small">
            <el-table-column prop="name" label="分区名" />
            <el-table-column prop="device_path" label="设备路径" />
            <el-table-column prop="size" label="大小" />
            <el-table-column prop="fstype" label="文件系统" />
            <el-table-column prop="mountpoint" label="挂载点" />
            <el-table-column prop="uuid" label="UUID" show-overflow-tooltip />
          </el-table>
        </div>

        <!-- SPDK BDEV信息 -->
        <div v-if="selectedDisk.spdk_bdev_info" class="mt-4">
          <h4>SPDK BDEV信息</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="BDEV名称">{{ selectedDisk.spdk_bdev_info.bdev_name }}</el-descriptions-item>
            <el-descriptions-item label="BDEV类型">{{ selectedDisk.spdk_bdev_info.bdev_type }}</el-descriptions-item>
            <el-descriptions-item label="块大小">{{ selectedDisk.spdk_bdev_info.block_size }}</el-descriptions-item>
            <el-descriptions-item label="块数量">{{ selectedDisk.spdk_bdev_info.num_blocks }}</el-descriptions-item>
            <el-descriptions-item label="UUID">{{ selectedDisk.spdk_bdev_info.uuid }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- NVMe 发现信息 -->
        <div v-if="selectedDisk.nvme_discovery_info && selectedDisk.type === 'nvme' && selectedDisk.kernel_mode === false" class="mt-4">
          <h4>NVMe 发现信息（用户态设备）</h4>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="PCIe 地址">{{ selectedDisk.nvme_discovery_info.pcie_addr }}</el-descriptions-item>
            <el-descriptions-item label="厂商 ID">{{ selectedDisk.nvme_discovery_info.vendor_id }}</el-descriptions-item>
            <el-descriptions-item label="子系统厂商 ID">{{ selectedDisk.nvme_discovery_info.subsystem_vendor_id }}</el-descriptions-item>
            <el-descriptions-item label="固件版本">{{ selectedDisk.nvme_discovery_info.firmware_version }}</el-descriptions-item>
            <el-descriptions-item label="命名空间数量">
              {{ selectedDisk.nvme_discovery_info.namespace_count }}/{{ selectedDisk.nvme_discovery_info.max_namespaces }}
            </el-descriptions-item>
            <el-descriptions-item label="传输类型">{{ selectedDisk.nvme_discovery_info.transport_type }}</el-descriptions-item>
            <el-descriptions-item label="发现容量">
              {{ formatBytes(selectedDisk.nvme_discovery_info.discovery_capacity_bytes) }}
            </el-descriptions-item>
            <el-descriptions-item label="容量(GB)">
              {{ selectedDisk.nvme_discovery_info.discovery_capacity_gb?.toFixed(2) }} GB
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-dialog>

    <!-- 驱动切换确认对话框 -->
    <el-dialog
      v-model="driverSwitchVisible"
      title="驱动切换确认"
      width="500px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedDiskForOperation">
        <el-alert
          title="危险操作警告"
          type="warning"
          :closable="false"
          show-icon
        >
          <p>您即将切换设备 <strong>{{ selectedDiskForOperation.display_name || selectedDiskForOperation.name }}</strong> 的驱动程序：</p>
          <p>从 <strong>{{ selectedDiskForOperation.kernel_mode ? '内核态(nvme)' : '用户态(vfio-pci)' }}</strong> 
             切换到 <strong>{{ selectedDiskForOperation.kernel_mode ? '用户态(vfio-pci)' : '内核态(nvme)' }}</strong></p>
          <p><strong>此操作可能会影响设备的可用性，请谨慎操作！</strong></p>
        </el-alert>

        <div class="mt-4">
          <div v-if="verificationCode" class="verification-section">
            <p class="verification-hint">
              <el-icon><Warning /></el-icon>
              为确保操作安全，请输入下方图片中的验证码：
            </p>
          </div>
        </div>

        <div v-if="verificationCode" class="mt-4">
          <el-form :model="verificationForm" label-width="120px">
            <el-form-item label="验证码确认">
              <VerificationCode 
                ref="verificationCodeRef"
                v-model="verificationForm.code"
                @verify="handleVerificationResult"
              />
            </el-form-item>
          </el-form>
        </div>
      </div>

      <template #footer>
        <div>
          <el-button @click="driverSwitchVisible = false">取消</el-button>
          <el-button 
            type="primary" 
            :loading="driverSwitchLoading"
            :disabled="!verificationCode || !verificationForm.code"
            @click="confirmDriverSwitch"
          >
            确认切换
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 磁盘清除确认对话框 -->
    <el-dialog
      v-model="wipeVisible"
      title="磁盘清除确认"
      width="500px"
      :close-on-click-modal="false"
    >
      <div v-if="selectedDiskForOperation">
        <el-alert
          title="极度危险操作警告"
          type="error"
          :closable="false"
          show-icon
        >
          <p>您即将清除设备 <strong>{{ selectedDiskForOperation.display_name || selectedDiskForOperation.name }}</strong> 的所有数据：</p>
          <p>设备路径: <strong>{{ selectedDiskForOperation.device_path }}</strong></p>
          <p><strong>此操作将永久删除磁盘上的所有数据，包括分区表、文件系统等！</strong></p>
          <p><strong>此操作不可逆转，请确保您已经备份了重要数据！</strong></p>
        </el-alert>

        <div class="mt-4">
          <div v-if="verificationCode" class="verification-section">
            <p class="verification-hint">
              <el-icon><Warning /></el-icon>
              为确保操作安全，请输入下方图片中的验证码：
            </p>
          </div>
        </div>

        <div v-if="verificationCode" class="mt-4">
          <el-form :model="verificationForm" label-width="120px">
            <el-form-item label="验证码确认">
              <VerificationCode 
                ref="verificationCodeRef"
                v-model="verificationForm.code"
                @verify="handleVerificationResult"
              />
            </el-form-item>
          </el-form>
        </div>
      </div>

      <template #footer>
        <div>
          <el-button @click="wipeVisible = false">取消</el-button>
          <el-button 
            type="danger" 
            :loading="wipeLoading"
            :disabled="!verificationCode || !verificationForm.code"
            @click="confirmWipe"
          >
            确认清除
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useUserStore } from '@/stores/user'
import { ApiService } from '@/services/api'
import { nvmeDiscoveryAPI } from '@/api/nvme-discovery'
import { 
  Refresh, 
  Search,
  View,
  Cpu,
  Warning
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import VerificationCode from '@/components/VerificationCode.vue'

const userStore = useUserStore()

// 数据状态
const loading = ref(false)
const scanLoading = ref(false)
const nvmeLoading = ref(false)
const disks = ref([])
const diskStats = ref({})
const selectedDisk = ref(null)
const nvmeDevices = ref([])

// 对话框状态
const detailsVisible = ref(false)
const driverSwitchVisible = ref(false)
const wipeVisible = ref(false)
const selectedDiskForOperation = ref(null)

// 验证码相关
const verificationLoading = ref(false)
const driverSwitchLoading = ref(false)
const wipeLoading = ref(false)
const verificationCode = ref(true)
const verificationCodeRef = ref(null)
const verificationForm = ref({
  code: ''
})

// 筛选状态
const searchText = ref('')
const typeFilter = ref('')

// 计算属性
const enrichedDisks = computed(() => {
  console.log('🔄 正在计算enrichedDisks...')
  console.log('disks.value:', disks.value)
  
  // 直接使用后端返回的磁盘数据，后端已经正确处理了内核态/用户态的区分
  const processedDisks = disks.value.map(disk => {
    const detectedType = detectDiskType(disk)
    return {
      ...disk,
      type: detectedType // 使用检测到的类型覆盖原始类型
    }
  })
  
  console.log('📊 enrichedDisks结果:', processedDisks)
  console.log('📊 其中NVMe设备数量:', processedDisks.filter(d => d.type === 'nvme').length)
  
  return processedDisks
})

const filteredDisks = computed(() => {
  let filtered = enrichedDisks.value

  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    filtered = filtered.filter(disk => 
      disk.name.toLowerCase().includes(search) ||
      disk.model?.toLowerCase().includes(search) ||
      disk.serial?.toLowerCase().includes(search)
    )
  }

  if (typeFilter.value) {
    filtered = filtered.filter(disk => disk.type === typeFilter.value)
  }

  return filtered
})

// 工具函数
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const getDeviceIcon = (type) => {
  switch (type?.toLowerCase()) {
    case 'nvme': return 'Cpu'
    case 'ssd': return 'Monitor' 
    case 'hdd': return 'Monitor'
    default: return 'Monitor'
  }
}

const getDeviceIconColor = (type) => {
  switch (type?.toLowerCase()) {
    case 'nvme': return '#409EFF'
    case 'ssd': return '#67C23A'
    case 'hdd': return '#E6A23C'
    default: return '#909399'
  }
}

const getTypeTagType = (type) => {
  switch (type?.toLowerCase()) {
    case 'nvme': return ''
    case 'ssd': return 'success'
    case 'hdd': return 'warning'
    default: return 'info'
  }
}

const getTemperatureClass = (temp) => {
  if (temp > 70) return 'text-danger'
  if (temp > 50) return 'text-warning'
  return 'text-success'
}

// 添加磁盘类型检测函数
const detectDiskType = (disk) => {
  // 首先检查原始类型
  if (disk.type === 'nvme') return 'nvme'
  
  // 检查模型名称是否包含NVMe相关关键字
  if (disk.model && disk.model.toLowerCase().includes('nvme')) return 'nvme'
  
  // 检查设备名称是否以nvme开头
  if (disk.name && disk.name.toLowerCase().startsWith('nvme')) return 'nvme'
  
  // 检查是否有PCIe传输类型（通常NVMe使用PCIe）
  if (disk.transport === 'pcie') return 'nvme'
  
  // 如果是非旋转磁盘且不是NVMe，则可能是SSD
  if (!disk.rotational && disk.type !== 'nvme') return 'ssd'
  
  // 如果是旋转磁盘，则是HDD
  if (disk.rotational) return 'hdd'
  
  // 默认返回原始类型或block
  return disk.type || 'block'
}

// 数据加载
const loadDisks = async () => {
  try {
    const response = await ApiService.disks.getAll()
    console.log('磁盘API完整响应:', response)
    console.log('磁盘API response.data:', response.data)
    console.log('磁盘API response.data.success:', response.data.success, typeof response.data.success)
    
    // 修正axios响应结构：response.data包含后端返回的实际数据
    const apiData = response.data
    if (apiData.success && apiData.data && Array.isArray(apiData.data.disks)) {
      disks.value = apiData.data.disks
      console.log('成功加载磁盘数据:', disks.value.length, '个磁盘')
    } else {
      // 兼容旧格式
      disks.value = Array.isArray(apiData) ? apiData : []
      console.log('使用兼容格式加载磁盘数据, apiData类型:', typeof apiData, 'isArray:', Array.isArray(apiData))
    }
    
    // 同时加载NVMe发现数据
    await loadNvmeDevices()
  } catch (error) {
    console.error('加载磁盘列表失败:', error)
    disks.value = []
  }
}

const loadDiskStats = async () => {
  try {
    const response = await ApiService.disks.getStats()
    console.log('磁盘统计API响应:', response)
    
    // 修正axios响应结构
    const apiData = response.data
    if (apiData.success && apiData.data) {
      diskStats.value = apiData.data
      console.log('成功加载磁盘统计:', diskStats.value)
    } else {
      // 兼容旧格式
      diskStats.value = apiData || {}
      console.log('使用兼容格式加载磁盘统计')
    }
  } catch (error) {
    console.error('加载磁盘统计失败:', error)
  }
}

const loadNvmeDevices = async () => {
  try {
    const response = await nvmeDiscoveryAPI.discover()
    console.log('NVMe发现API响应:', response)
    console.log('response.data:', response.data)
    console.log('response.data.success:', response.data.success, typeof response.data.success)
    
    // 修正axios响应结构
    const apiData = response.data
    if (apiData.success && apiData.data && Array.isArray(apiData.data.nvme_devices)) {
      nvmeDevices.value = apiData.data.nvme_devices
      console.log('成功加载NVMe设备:', nvmeDevices.value.length, '个设备')
    } else {
      console.log('NVMe数据加载失败 - success:', apiData.success, 'data:', apiData.data)
      nvmeDevices.value = []
    }
  } catch (error) {
    console.error('加载NVMe发现数据失败:', error)
    nvmeDevices.value = []
  }
}

const refreshDisks = async () => {
  loading.value = true
  try {
    await Promise.all([loadDisks(), loadDiskStats()])
    ElMessage.success('磁盘信息已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  } finally {
    loading.value = false
  }
}

const refreshScan = async () => {
  scanLoading.value = true
  try {
    await ApiService.disks.refreshScan()
    await refreshDisks()
    ElMessage.success('磁盘重新扫描完成')
  } catch (error) {
    ElMessage.error('扫描失败: ' + error.message)
  } finally {
    scanLoading.value = false
  }
}

// NVMe 发现
const showNvmeDiscovery = async () => {
  nvmeLoading.value = true
  try {
    const response = await nvmeDiscoveryAPI.discover()
    console.log('NVMe发现按钮API完整响应:', response)
    console.log('response.data:', response.data)
    console.log('response.data.success:', response.data.success, typeof response.data.success)
    console.log('response.data.data:', response.data.data)
    
    // 修正axios响应结构
    const apiData = response.data
    console.log('apiData.success 判断结果:', !!apiData.success)
    
    if (apiData.success) {
      const devices = apiData.data.nvme_devices
      let message = `发现 ${devices.length} 个 NVMe 设备`
      
      if (devices.length > 0) {
        const deviceList = devices.map(device => 
          `${device.model_number.trim()} (${device.pcie_addr})`
        ).join('\n')
        
        ElMessage({
          type: 'success',
          message: `${message}:\n${deviceList}`,
          duration: 5000,
          showClose: true
        })
      } else {
        ElMessage.info('未发现 NVMe 设备')
      }
      
      // 刷新磁盘列表以显示最新的发现信息
      await refreshDisks()
    } else {
      console.error('API返回success为false:', apiData)
      throw new Error(apiData.message || 'NVMe 发现失败')
    }
  } catch (error) {
    console.error('NVMe discovery error:', error)
    ElMessage.error('NVMe 发现失败: ' + error.message)
  } finally {
    nvmeLoading.value = false
  }
}

// 详情显示
const showDiskDetails = (disk) => {
  selectedDisk.value = disk
  detailsVisible.value = true
}

// 驱动切换
const showDriverSwitchDialog = (disk) => {
  selectedDiskForOperation.value = disk
  verificationCode.value = false
  verificationForm.value.code = ''
  driverSwitchVisible.value = true
  // 等待DOM更新后显示验证码
  nextTick(() => {
    verificationCode.value = true
  })
}

// 磁盘清除
const showWipeDialog = (disk) => {
  selectedDiskForOperation.value = disk
  verificationCode.value = false
  verificationForm.value.code = ''
  wipeVisible.value = true
  // 等待DOM更新后显示验证码
  nextTick(() => {
    verificationCode.value = true
  })
}

// 处理验证码验证结果
const handleVerificationResult = (isValid) => {
  if (isValid) {
    ElMessage.success('验证码正确')
  } else {
    ElMessage.error('验证码错误，请重新输入')
  }
}

// 确认驱动切换
const confirmDriverSwitch = async () => {
  // 使用验证码组件的验证方法
  if (!verificationCodeRef.value || !verificationCodeRef.value.verify()) {
    ElMessage.error('请输入正确的验证码')
    return
  }

  driverSwitchLoading.value = true
  try {
    const disk = selectedDiskForOperation.value
    const targetDriver = disk.kernel_mode ? 'vfio-pci' : 'nvme'
    
    // 获取PCIe地址，优先使用pcie_addr，然后是nvme_discovery_info中的
    const pcieAddr = disk.pcie_addr || disk.nvme_discovery_info?.pcie_addr
    if (!pcieAddr) {
      throw new Error('无法获取设备的PCIe地址')
    }
    
    const response = await ApiService.disks.switchDriver(
      pcieAddr, // 使用PCIe地址而不是设备名
      targetDriver
    )

    ElMessage.success(response.data.message)
    driverSwitchVisible.value = false
    
    // 刷新磁盘列表
    await refreshDisks()
    
  } catch (error) {
    ElMessage.error('驱动切换失败: ' + error.message)
  } finally {
    driverSwitchLoading.value = false
  }
}

// 确认磁盘清除
const confirmWipe = async () => {
  // 使用验证码组件的验证方法
  if (!verificationCodeRef.value || !verificationCodeRef.value.verify()) {
    ElMessage.error('请输入正确的验证码')
    return
  }

  wipeLoading.value = true
  try {
    const disk = selectedDiskForOperation.value
    
    // 使用设备名而不是设备路径，避免URL中的斜杠问题
    // 从设备路径中提取设备名，如 /dev/nvme0n1 -> nvme0n1
    let deviceId = disk.display_name || disk.name
    if (disk.device_path && disk.device_path.startsWith('/dev/')) {
      deviceId = disk.device_path.replace('/dev/', '')
    }
    
    const response = await ApiService.disks.wipe(deviceId)

    ElMessage.success(response.data.message)
    wipeVisible.value = false
    
    // 刷新磁盘列表
    await refreshDisks()
    
  } catch (error) {
    ElMessage.error('磁盘清除失败: ' + error.message)
  } finally {
    wipeLoading.value = false
  }
}

// 组件挂载
onMounted(async () => {
  await refreshDisks()
  console.log('💾 磁盘管理页面已加载')
  
  // 调试计算属性
  console.log('🔍 调试信息:')
  console.log('disks.value:', disks.value)
  console.log('nvmeDevices.value:', nvmeDevices.value)
  console.log('enrichedDisks.value:', enrichedDisks.value)
  console.log('filteredDisks.value:', filteredDisks.value)
})
</script>

<style scoped>
.disk-management {
  padding: 0;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  color: white;
}

.stat-icon.total {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stat-icon.available {
  background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%);
}

.stat-icon.nvme {
  background: linear-gradient(135deg, #409eff 0%, #66b1ff 100%);
}

.stat-icon.capacity {
  background: linear-gradient(135deg, #e6a23c 0%, #ebb563 100%);
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

.table-controls {
  display: flex;
  align-items: center;
}

.device-name {
  display: flex;
  align-items: center;
}

.device-icon {
  margin-right: 8px;
}

.status-badges {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.text-success {
  color: #67c23a;
}

.text-warning {
  color: #e6a23c;
}

.text-danger {
  color: #f56c6c;
}

.text-muted {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.ml-2 {
  margin-left: 8px;
}

.pcie-addr {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  color: var(--el-color-info);
  background: var(--el-fill-color-extra-light);
  padding: 2px 6px;
  border-radius: 3px;
}

.pcie-address {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  color: var(--el-color-info);
  background: var(--el-fill-color-extra-light);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
}

.device-mode {
  display: flex;
  align-items: center;
}

.disk-details {
  max-height: 60vh;
  overflow-y: auto;
}

.mt-4 {
  margin-top: 16px;
}

.mr-2 {
  margin-right: 8px;
}

.mb-2 {
  margin-bottom: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .table-controls {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .button-group {
    justify-content: center;
  }
}

.verification-section {
  text-align: center;
}

.verification-hint {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}
</style> 