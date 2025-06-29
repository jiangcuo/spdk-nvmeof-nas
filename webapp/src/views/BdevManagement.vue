<template>
  <div class="bdev-management">
    <div class="page-header">
      <h1 class="page-title">BDEV管理</h1>
      <div class="button-group">
        <el-button @click="refreshBdevs" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="showCreateDialog" v-if="userStore.isAdmin">
          <el-icon><Plus /></el-icon>
          创建BDEV
        </el-button>
      </div>
    </div>

    <!-- BDEV列表 -->
    <div class="page-card">
      <div class="card-header">
        <h3>BDEV列表</h3>
        <div class="table-controls">
          <el-select
            v-model="selectedType"
            placeholder="筛选类型"
            clearable
            style="width: 150px; margin-right: 10px"
          >
            <el-option label="全部类型" value="" />
            <el-option label="Malloc" value="Malloc" />
            <el-option label="AIO" value="AIO" />
            <el-option label="NVMe" value="NVMe" />
            <el-option label="LVol" value="Logical Volume" />
            <el-option label="Null" value="Null" />
          </el-select>
          
          <el-input
            v-model="searchText"
            placeholder="搜索BDEV..."
            clearable
            style="width: 250px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>

      <el-table
        :data="filteredBdevs"
        v-loading="loading"
        stripe
        class="bdev-table"
      >
        <el-table-column prop="name" label="名称" min-width="150">
          <template #default="{ row }">
            <div class="bdev-name">
              <el-icon class="bdev-icon" :color="getBdevTypeColor(row.product_name)">
                <Box />
              </el-icon>
              <span>{{ getBdevDisplayName(row) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="product_name" label="类型" min-width="120">
          <template #default="{ row }">
            <el-tag :type="getBdevTypeTag(row.product_name)" size="small">
              {{ row.product_name }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="block_size" label="块大小" width="100">
          <template #default="{ row }">
            {{ row.block_size }} B
          </template>
        </el-table-column>

        <el-table-column label="后端设备" min-width="200">
          <template #default="{ row }">
            <span>{{ getBackendDevice(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="总容量" width="120">
          <template #default="{ row }">
            {{ formatBytes(row.block_size * row.num_blocks) }}
          </template>
        </el-table-column>

        <el-table-column prop="uuid" label="UUID" min-width="250" show-overflow-tooltip />

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="button-group">
              <el-button size="small" @click="showBdevDetails(row)">
                <el-icon><View /></el-icon>
              </el-button>
              <el-popconfirm
                title="确定要删除这个BDEV吗？"
                @confirm="deleteBdev(row.name)"
                v-if="userStore.isAdmin"
              >
                <template #reference>
                  <el-button size="small" type="danger">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 创建BDEV对话框 -->
    <el-dialog
      v-model="createVisible"
      title="创建BDEV"
      width="600px"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="120px"
      >
        <el-form-item label="BDEV类型" prop="type">
          <el-select v-model="createForm.type" placeholder="请选择类型" style="width: 100%" @change="onBdevTypeChange">
            <el-option label="AIO" value="aio" />
            <el-option label="NVMe" value="nvme" />
            <el-option label="Malloc" value="malloc" />
            <el-option label="Null" value="null" />
          </el-select>
        </el-form-item>

        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="输入BDEV名称" />
        </el-form-item>

        <!-- AIO特定字段 -->
        <template v-if="createForm.type === 'aio'">
          <el-form-item label="文件来源" prop="aio_source_mode">
            <el-radio-group v-model="createForm.aio_source_mode" @change="onAioSourceModeChange">
              <el-radio value="disk">从磁盘选择</el-radio>
              <el-radio value="manual">手动输入路径</el-radio>
            </el-radio-group>
          </el-form-item>

          <!-- 从磁盘选择 -->
          <template v-if="createForm.aio_source_mode === 'disk'">
            <el-form-item label="选择磁盘" prop="selected_disk">
              <div class="disk-selector-input">
                <el-input 
                  v-model="createForm.filename" 
                  placeholder="点击选择磁盘或分区"
                  readonly
                  style="width: 100%"
                >
                  <template #append>
                    <el-button @click="showDiskSelectionDialog" :loading="diskLoading">
                      <el-icon><Search /></el-icon>
                      选择磁盘
                    </el-button>
                  </template>
                </el-input>
              </div>
            </el-form-item>
            
            <!-- 选中设备信息 -->
            <div v-if="selectedDiskInfo" class="selected-disk-info">
              <el-card size="small">
                <template #header>
                  <span>选中设备信息</span>
                </template>
                <el-descriptions :column="2" size="small">
                  <el-descriptions-item label="设备路径">{{ selectedDiskInfo.device_path }}</el-descriptions-item>
                  <el-descriptions-item label="容量">{{ selectedDiskInfo.size }}</el-descriptions-item>
                  <el-descriptions-item label="物理扇区大小">{{ selectedDiskInfo.physical_sector_size }} 字节</el-descriptions-item>
                  <el-descriptions-item label="逻辑扇区大小">{{ selectedDiskInfo.logical_sector_size }} 字节</el-descriptions-item>
                </el-descriptions>
              </el-card>
            </div>
          </template>

          <!-- 手动输入路径 -->
          <el-form-item v-if="createForm.aio_source_mode === 'manual'" label="文件路径" prop="filename">
            <el-input v-model="createForm.filename" placeholder="/dev/sda 或 /path/to/file" />
          </el-form-item>

          <el-form-item label="块大小" prop="block_size">
            <el-input-number 
              v-model="createForm.block_size" 
              :min="512" 
              :step="512"
              :placeholder="suggestedBlockSize ? `建议: ${suggestedBlockSize}` : ''"
            />
            <div v-if="suggestedBlockSize" class="form-help">
              <el-text size="small" type="info">
                建议块大小: {{ suggestedBlockSize }} 字节（基于设备扇区大小）
              </el-text>
            </div>
          </el-form-item>
        </template>

        <!-- NVMe特定字段 -->
        <template v-if="createForm.type === 'nvme'">
          <el-form-item label="设备选择" prop="device_selection_mode">
            <el-radio-group v-model="createForm.device_selection_mode" @change="onDeviceSelectionModeChange">
              <el-radio value="discovered">从发现的设备中选择</el-radio>
              <el-radio value="manual">手动输入PCIe地址</el-radio>
            </el-radio-group>
          </el-form-item>
          
          <!-- 发现的设备选择器 -->
          <el-form-item v-if="createForm.device_selection_mode === 'discovered'" label="选择设备" prop="selected_device">
            <div class="device-selector">
              <el-button 
                type="primary" 
                :loading="nvmeLoading" 
                @click="discoverNvmeDevices"
                style="margin-bottom: 12px"
              >
                <el-icon><Search /></el-icon>
                扫描 NVMe 设备
              </el-button>
              
              <el-select 
                v-model="createForm.selected_device" 
                placeholder="选择 NVMe 设备"
                style="width: 100%"
                :disabled="discoveredDevices.length === 0"
                @change="onDeviceSelect"
              >
                <el-option
                  v-for="device in discoveredDevices"
                  :key="device.pcie_addr"
                  :label="`${device.model_number.trim()} (${device.pcie_addr}) - ${device.total_capacity_gb.toFixed(2)}GB`"
                  :value="device.pcie_addr"
                >
                  <div class="device-option">
                    <div class="device-info">
                      <span class="device-model">{{ device.model_number.trim() }}</span>
                      <span class="device-pcie">{{ device.pcie_addr }}</span>
                    </div>
                    <div class="device-details">
                      <span class="device-capacity">{{ device.total_capacity_gb.toFixed(2) }}GB</span>
                      <span class="device-vendor">{{ device.vendor_id }}</span>
                    </div>
                  </div>
                </el-option>
              </el-select>
              
              <!-- 选中设备的详细信息 -->
              <div v-if="selectedDeviceInfo" class="selected-device-info">
                <el-card size="small" style="margin-top: 12px">
                  <template #header>
                    <span>选中设备信息</span>
                  </template>
                  <el-descriptions :column="2" size="small">
                    <el-descriptions-item label="型号">{{ selectedDeviceInfo.model_number.trim() }}</el-descriptions-item>
                    <el-descriptions-item label="序列号">{{ selectedDeviceInfo.serial_number.trim() }}</el-descriptions-item>
                    <el-descriptions-item label="容量">{{ selectedDeviceInfo.total_capacity_gb.toFixed(2) }} GB</el-descriptions-item>
                    <el-descriptions-item label="固件版本">{{ selectedDeviceInfo.firmware_version.trim() }}</el-descriptions-item>
                  </el-descriptions>
                </el-card>
              </div>
            </div>
          </el-form-item>
          
          <!-- 手动输入PCIe地址 -->
          <el-form-item v-if="createForm.device_selection_mode === 'manual'" label="PCIe地址" prop="traddr">
            <el-input 
              v-model="createForm.traddr" 
              placeholder="0000:01:00.0"
              style="width: 100%"
            >
              <template #append>
                <el-button @click="validatePcieAddress">验证</el-button>
              </template>
            </el-input>
            <div class="form-help">
              <el-text size="small" type="info">
                请输入有效的PCIe地址，格式：XXXX:XX:XX.X (例如: 0000:01:00.0)
              </el-text>
            </div>
          </el-form-item>
        </template>

        <!-- Malloc特定字段 -->
        <template v-if="createForm.type === 'malloc'">
          <el-form-item label="大小(MB)" prop="size">
            <el-input-number v-model="createForm.size" :min="1" />
          </el-form-item>
          <el-form-item label="块大小" prop="block_size">
            <el-input-number v-model="createForm.block_size" :min="512" :step="512" />
          </el-form-item>
        </template>

        <!-- Null特定字段 -->
        <template v-if="createForm.type === 'null'">
          <el-form-item label="大小(MB)" prop="size">
            <el-input-number v-model="createForm.size" :min="1" />
          </el-form-item>
          <el-form-item label="块大小" prop="block_size">
            <el-input-number v-model="createForm.block_size" :min="512" :step="512" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createVisible = false">取消</el-button>
          <el-button type="primary" @click="createBdev" :loading="createLoading">
            创建
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- BDEV详情对话框 -->
    <el-dialog
      v-model="detailsVisible"
      :title="`BDEV详情 - ${selectedBdev?.name}`"
      width="700px"
    >
      <div v-if="selectedBdev" class="bdev-details">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">{{ selectedBdev.name }}</el-descriptions-item>
          <el-descriptions-item label="UUID">{{ selectedBdev.uuid }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ selectedBdev.product_name }}</el-descriptions-item>
          <el-descriptions-item label="块大小">{{ selectedBdev.block_size }} bytes</el-descriptions-item>
          <el-descriptions-item label="块数量">{{ formatNumber(selectedBdev.num_blocks) }}</el-descriptions-item>
          <el-descriptions-item label="总容量">{{ formatBytes(selectedBdev.block_size * selectedBdev.num_blocks) }}</el-descriptions-item>
          <el-descriptions-item label="已分配" span="2">
            <el-tag :type="selectedBdev.claimed ? 'warning' : 'success'">
              {{ selectedBdev.claimed ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 额外信息 -->
        <div v-if="selectedBdev.driver_specific" class="mt-4">
          <h4>驱动详情</h4>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item
              v-for="(value, key) in selectedBdev.driver_specific"
              :key="key"
              :label="key"
            >
              {{ value }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-dialog>

    <!-- 磁盘选择弹窗 -->
    <el-dialog
      v-model="diskSelectionVisible"
      title="选择磁盘或分区"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="disk-selection-content">
        <div class="disk-selection-header">
          <el-button 
            type="primary" 
            :loading="diskLoading" 
            @click="loadDisks"
            size="small"
          >
            <el-icon><Refresh /></el-icon>
            刷新磁盘列表
          </el-button>
          <el-text size="small" type="info">选择可用的磁盘或分区作为AIO BDEV的存储设备</el-text>
        </div>

        <div v-if="availableDisks.length > 0" class="disk-list">
          <div 
            v-for="disk in availableDisks" 
            :key="disk.name" 
            class="disk-group"
          >
            <!-- 磁盘主条目 -->
            <div 
              class="disk-row"
              :class="{ 'selected': createForm.selected_disk === disk.device_path }"
              @click="selectDiskInDialog(disk, null)"
            >
              <el-icon class="device-icon disk">
                <Box />
              </el-icon>
              <div class="device-info">
                <div class="device-name-section">
                  <span class="device-name">{{ disk.display_name || disk.name }}</span>
                  <el-tag 
                    v-if="disk.type === 'nvme'" 
                    :type="disk.kernel_mode ? 'success' : 'warning'" 
                    size="small" 
                    class="device-mode-tag"
                  >
                    {{ disk.kernel_mode ? '内核态' : '用户态' }}
                  </el-tag>
                  <el-tooltip 
                    v-if="disk.original_name && disk.original_name !== (disk.display_name || disk.name)"
                    :content="`原始设备名: ${disk.original_name}`"
                    placement="top"
                  >
                    <el-tag type="info" size="small" class="original-name-tag">
                      {{ disk.original_name }}
                    </el-tag>
                  </el-tooltip>
                </div>
                <span class="device-size">{{ disk.size }}</span>
                <span class="device-model">{{ disk.model }}</span>
                <span class="device-sector">{{ disk.physical_sector_size }}字节扇区</span>
                <span v-if="disk.pcie_addr" class="device-pcie">{{ disk.pcie_addr }}</span>
              </div>
              <div class="device-path">{{ disk.device_path }}</div>
            </div>
            
            <!-- 分区列表 -->
            <div 
              v-for="partition in disk.partitions" 
              :key="partition.name"
              class="partition-row"
              :class="{ 'selected': createForm.selected_disk === partition.device_path }"
              @click="selectDiskInDialog(disk, partition)"
            >
              <el-icon class="device-icon partition">
                <Box />
              </el-icon>
              <div class="device-info">
                <div class="device-name-section">
                  <span class="device-name">├─ {{ partition.name }}</span>
                </div>
                <span class="device-size">{{ partition.size }}</span>
                <span v-if="partition.fstype" class="device-fs">{{ partition.fstype }}</span>
                <span v-if="partition.mountpoint" class="device-mount">{{ partition.mountpoint }}</span>
              </div>
              <div class="device-path">{{ partition.device_path }}</div>
            </div>
          </div>
        </div>
        
        <el-empty v-else description="暂无可用磁盘" />
      </div>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="diskSelectionVisible = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="confirmDiskSelection"
            :disabled="!createForm.selected_disk"
          >
            确认选择
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { ApiService } from '@/services/api'
import { nvmeDiscoveryAPI } from '@/api/nvme-discovery'
import { 
  Refresh, 
  Plus,
  Search,
  Box,
  View, 
  Delete
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const userStore = useUserStore()

// 数据状态
const loading = ref(false)
const createLoading = ref(false)
const nvmeLoading = ref(false)
const diskLoading = ref(false)
const bdevs = ref([])
const selectedBdev = ref(null)
const discoveredDevices = ref([])
const selectedDeviceInfo = ref(null)
const disks = ref([])
const selectedDiskInfo = ref(null)

// 对话框状态
const createVisible = ref(false)
const detailsVisible = ref(false)
const diskSelectionVisible = ref(false)

// 表单数据
const createFormRef = ref()
const createForm = ref({
  type: '',
  name: '',
  filename: '',
  traddr: '',
  size: 100,
  block_size: 4096,
  device_selection_mode: 'discovered',
  selected_device: '',
  aio_source_mode: 'disk',
  selected_disk: ''
})

// 表单验证规则
const createRules = computed(() => {
  const rules = {
    type: [{ required: true, message: '请选择BDEV类型', trigger: 'change' }],
    name: [{ required: true, message: '请输入BDEV名称', trigger: 'blur' }],
    size: [{ required: true, message: '请输入大小', trigger: 'blur' }],
  }
  
  // 根据BDEV类型添加特定验证规则
  if (createForm.value.type === 'aio') {
    if (createForm.value.aio_source_mode === 'disk') {
      rules.selected_disk = [{ required: true, message: '请选择磁盘', trigger: 'change' }]
    } else {
      rules.filename = [{ required: true, message: '请输入文件路径', trigger: 'blur' }]
    }
  } else if (createForm.value.type === 'nvme') {
    if (createForm.value.device_selection_mode === 'discovered') {
      rules.selected_device = [{ required: true, message: '请选择设备', trigger: 'change' }]
    } else {
      rules.traddr = [{ required: true, message: '请输入PCI地址', trigger: 'blur' }]
    }
  }
  
  return rules
})

// 筛选状态
const searchText = ref('')
const selectedType = ref('')

// 计算属性
const filteredBdevs = computed(() => {
  console.log('🔄 正在计算filteredBdevs...')
  console.log('bdevs.value:', bdevs.value)
  console.log('selectedType.value:', selectedType.value)
  console.log('searchText.value:', searchText.value)
  
  let filtered = bdevs.value
  
  // 按类型筛选
  if (selectedType.value) {
    filtered = filtered.filter(bdev => bdev.product_name === selectedType.value)
  }
  
  // 按搜索文本筛选
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    filtered = filtered.filter(bdev => 
      bdev.name.toLowerCase().includes(search) ||
      bdev.product_name?.toLowerCase().includes(search) ||
      bdev.uuid?.toLowerCase().includes(search)
    )
  }
  
  console.log('📊 filteredBdevs结果:', filtered)
  console.log('📊 BDEV数量:', filtered.length)
  
  return filtered
})

// 可用磁盘（过滤掉已挂载、只读、已被SPDK使用的磁盘）
const availableDisks = computed(() => {
  return disks.value.filter(disk => {
    // 过滤条件：
    // 1. 不是只读的
    // 2. 没有被挂载
    // 3. 没有被SPDK使用
    return !disk.readonly && !disk.is_mounted && !disk.is_spdk_bdev
  })
})

// 建议的块大小（基于选中的磁盘/分区）
const suggestedBlockSize = computed(() => {
  if (!selectedDiskInfo.value) return null
  
  // 使用物理扇区大小作为建议块大小
  const sectorSize = selectedDiskInfo.value.physical_sector_size
  if (sectorSize && typeof sectorSize === 'string') {
    // 提取数字部分，假设格式为 "4096 bytes" 或 "4096"
    const match = sectorSize.match(/(\d+)/)
    if (match) {
      return parseInt(match[1])
    }
  }
  
  // 如果是数字类型，直接返回
  if (typeof sectorSize === 'number') {
    return sectorSize
  }
  
  // 默认返回4096
  return 4096
})

// 工具函数
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const formatNumber = (num) => {
  return new Intl.NumberFormat().format(num)
}

const getBdevTypeColor = (type) => {
  const colors = {
    'AIO': '#409EFF',
    'NVMe': '#67C23A',
    'Malloc': '#E6A23C',
    'Null': '#909399'
  }
  return colors[type] || '#909399'
}

const getBdevTypeTag = (type) => {
  const tags = {
    'AIO': '',
    'NVMe': 'success',
    'Malloc': 'warning',
    'Null': 'info',
    'Logical Volume': 'primary'
  }
  return tags[type] || 'info'
}

const getBdevDisplayName = (bdev) => {
  // 对于Logical Volume类型，优先显示aliases
  if (bdev.product_name === 'Logical Volume') {
    // 检查是否有aliases数组，并取第一个
    if (bdev.aliases && Array.isArray(bdev.aliases) && bdev.aliases.length > 0) {
      return bdev.aliases[0]
    }
    // 兼容单个alias字段
    if (bdev.alias) {
      return bdev.alias
    }
  }
  
  // 对于其他类型，直接使用name
  return bdev.name
}

const getBackendDevice = (bdev) => {
  if (!bdev.driver_specific) {
    return '-'
  }
  
  console.log('处理BDEV后端设备:', bdev.name, bdev.driver_specific)
  
  // Extract backend device information from driver_specific
  const driverSpecific = bdev.driver_specific
  
  // Handle AIO driver
  if (driverSpecific.aio && driverSpecific.aio.filename) {
    return driverSpecific.aio.filename
  }
  
  // Handle NVMe driver - 处理数组格式
  if (driverSpecific.nvme) {
    // 如果是数组，取第一个元素
    if (Array.isArray(driverSpecific.nvme) && driverSpecific.nvme.length > 0) {
      const nvmeInfo = driverSpecific.nvme[0]
      if (nvmeInfo.pci_address) {
        return nvmeInfo.pci_address
      }
      if (nvmeInfo.trid && nvmeInfo.trid.traddr) {
        return nvmeInfo.trid.traddr
      }
    }
    // 如果是对象
    if (driverSpecific.nvme.traddr) {
      return driverSpecific.nvme.traddr
    }
  }
  
  // Handle Malloc driver
  if (driverSpecific.malloc) {
    return 'Memory (Malloc)'
  }
  
  // Handle Null driver
  if (driverSpecific.null) {
    return 'Null Device'
  }
  
  // Handle other driver types
  const firstDriver = Object.keys(driverSpecific)[0]
  if (firstDriver) {
    const driverData = driverSpecific[firstDriver]
    if (driverData && typeof driverData === 'object') {
      // Try to find filename, path, or address fields
      if (driverData.filename) return driverData.filename
      if (driverData.path) return driverData.path
      if (driverData.traddr) return driverData.traddr
      if (driverData.address) return driverData.address
    }
    return `${firstDriver.toUpperCase()} Device`
  }
  
  return '-'
}

// 数据加载
const loadBdevs = async () => {
  try {
    const response = await ApiService.bdevs.getAll()
    console.log('BDEV API完整响应:', response)
    console.log('BDEV response.data:', response.data)
    console.log('BDEV response.data.success:', response.data.success, typeof response.data.success)
    
    // 修正axios响应结构：response.data包含后端返回的实际数据
    const apiData = response.data
    if (apiData.success && apiData.data && Array.isArray(apiData.data.bdevs)) {
      bdevs.value = apiData.data.bdevs
      console.log('成功加载BDEV数据:', bdevs.value.length, '个BDEV')
    } else if (Array.isArray(apiData.bdevs)) {
      // 兼容中间格式
      bdevs.value = apiData.bdevs
      console.log('使用中间格式加载BDEV数据')
    } else {
      // 兼容旧格式
      bdevs.value = Array.isArray(apiData) ? apiData : []
      console.log('使用兼容格式加载BDEV数据, apiData类型:', typeof apiData, 'isArray:', Array.isArray(apiData))
    }
  } catch (error) {
    console.error('加载BDEV列表失败:', error)
    bdevs.value = []
  }
}

// 加载磁盘列表
const loadDisks = async () => {
  try {
    diskLoading.value = true
    const response = await ApiService.disks.getAll()
    console.log('磁盘API响应:', response)
    
    const apiData = response.data
    if (apiData.success && apiData.data && Array.isArray(apiData.data.disks)) {
      disks.value = apiData.data.disks
      console.log('成功加载磁盘数据:', disks.value.length, '个磁盘')
    } else {
      disks.value = []
    }
  } catch (error) {
    console.error('加载磁盘列表失败:', error)
    ElMessage.error('加载磁盘列表失败')
    disks.value = []
  } finally {
    diskLoading.value = false
  }
}

// 选择磁盘或分区
const selectDisk = (disk, partition) => {
  if (partition) {
    // 选择分区
    createForm.value.selected_disk = partition.device_path
    createForm.value.filename = partition.device_path
    selectedDiskInfo.value = {
      device_path: partition.device_path,
      size: partition.size,
      physical_sector_size: disk.physical_sector_size,
      logical_sector_size: disk.logical_sector_size,
      name: partition.name,
      type: 'partition'
    }
  } else {
    // 选择整个磁盘
    createForm.value.selected_disk = disk.device_path
    createForm.value.filename = disk.device_path
    selectedDiskInfo.value = {
      device_path: disk.device_path,
      size: disk.size,
      physical_sector_size: disk.physical_sector_size,
      logical_sector_size: disk.logical_sector_size,
      name: disk.name,
      type: 'disk'
    }
  }
  
  // 自动设置建议的块大小
  const suggested = suggestedBlockSize.value
  if (suggested && suggested !== createForm.value.block_size) {
    createForm.value.block_size = suggested
  }
  
  console.log('选择了设备:', selectedDiskInfo.value)
}

// 显示磁盘选择弹窗
const showDiskSelectionDialog = async () => {
  // 如果磁盘列表为空，先加载
  if (disks.value.length === 0) {
    await loadDisks()
  }
  diskSelectionVisible.value = true
}

// 在弹窗中选择磁盘或分区（临时选择，不立即应用）
const selectDiskInDialog = (disk, partition) => {
  if (partition) {
    // 选择分区
    createForm.value.selected_disk = partition.device_path
  } else {
    // 选择整个磁盘
    createForm.value.selected_disk = disk.device_path
  }
}

// 确认磁盘选择
const confirmDiskSelection = () => {
  // 找到选中的磁盘/分区并应用到表单
  const selectedPath = createForm.value.selected_disk
  
  for (const disk of availableDisks.value) {
    // 检查是否选择了整个磁盘
    if (disk.device_path === selectedPath) {
      selectDisk(disk, null)
      break
    }
    
    // 检查是否选择了分区
    if (disk.partitions) {
      const partition = disk.partitions.find(p => p.device_path === selectedPath)
      if (partition) {
        selectDisk(disk, partition)
        break
      }
    }
  }
  
  diskSelectionVisible.value = false
}

// AIO源模式切换
const onAioSourceModeChange = (mode) => {
  // 清除之前的选择
  createForm.value.selected_disk = ''
  createForm.value.filename = ''
  selectedDiskInfo.value = null
  
  if (mode === 'disk') {
    // 如果切换到磁盘选择模式，自动加载磁盘列表
    if (disks.value.length === 0) {
      loadDisks()
    }
  }
}

// BDEV类型切换处理
const onBdevTypeChange = (type) => {
  // 清除所有特定类型的字段
  createForm.value.filename = ''
  createForm.value.selected_disk = ''
  createForm.value.traddr = ''
  createForm.value.selected_device = ''
  
  // 重置相关的信息
  selectedDiskInfo.value = null
  selectedDeviceInfo.value = null
  
  // 设置默认值
  if (type === 'aio') {
    createForm.value.aio_source_mode = 'disk'
    createForm.value.block_size = 4096
    // 如果需要，自动加载磁盘列表
    if (disks.value.length === 0) {
      loadDisks()
    }
  } else if (type === 'nvme') {
    createForm.value.device_selection_mode = 'discovered'
  } else if (type === 'malloc' || type === 'null') {
    createForm.value.size = 100
    createForm.value.block_size = 4096
  }
}

const refreshBdevs = async () => {
  loading.value = true
  try {
    await loadBdevs()
    ElMessage.success('BDEV列表已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  } finally {
    loading.value = false
  }
}

// BDEV操作
const showCreateDialog = () => {
  resetCreateForm()
  createVisible.value = true
  
  // 如果磁盘列表为空，自动加载
  if (disks.value.length === 0) {
    loadDisks()
  }
}

const resetCreateForm = () => {
  createForm.value = {
    type: '',
    name: '',
    filename: '',
    traddr: '',
    size: 100,
    block_size: 4096,
    device_selection_mode: 'discovered',
    selected_device: '',
    aio_source_mode: 'disk',
    selected_disk: ''
  }
  selectedDeviceInfo.value = null
  selectedDiskInfo.value = null
  discoveredDevices.value = []
  diskSelectionVisible.value = false
}

// NVMe设备发现相关方法
const discoverNvmeDevices = async () => {
  nvmeLoading.value = true
  try {
    const response = await nvmeDiscoveryAPI.discover()
    console.log('BDEV NVMe发现API响应:', response)
    console.log('BDEV response.data:', response.data)
    console.log('BDEV response.data.success:', response.data.success, typeof response.data.success)
    
    // 修正axios响应结构
    const apiData = response.data
    if (apiData.success) {
      discoveredDevices.value = apiData.data.nvme_devices || []
      ElMessage.success(`发现 ${discoveredDevices.value.length} 个 NVMe 设备`)
      console.log('BDEV成功加载NVMe设备:', discoveredDevices.value)
    } else {
      throw new Error(apiData.message || 'NVMe 发现失败')
    }
  } catch (error) {
    console.error('NVMe discovery error:', error)
    ElMessage.error('NVMe 发现失败: ' + error.message)
    discoveredDevices.value = []
  } finally {
    nvmeLoading.value = false
  }
}

const onDeviceSelectionModeChange = (mode) => {
  // 切换模式时清空相关字段
  if (mode === 'discovered') {
    createForm.value.traddr = ''
    createForm.value.selected_device = ''
    selectedDeviceInfo.value = null
  } else {
    createForm.value.selected_device = ''
    selectedDeviceInfo.value = null
  }
}

const onDeviceSelect = (pcieAddr) => {
  const device = discoveredDevices.value.find(d => d.pcie_addr === pcieAddr)
  if (device) {
    selectedDeviceInfo.value = device
    createForm.value.traddr = pcieAddr
    
    // 自动填写设备名称
    if (!createForm.value.name) {
      const deviceName = device.model_number.trim().replace(/\s+/g, '_').toLowerCase()
      createForm.value.name = `${deviceName}_${pcieAddr.replace(/[:.]/g, '_')}`
    }
  }
}

const validatePcieAddress = () => {
  const pcieRegex = /^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-9a-fA-F]$/
  if (createForm.value.traddr && pcieRegex.test(createForm.value.traddr)) {
    ElMessage.success('PCIe地址格式正确')
  } else {
    ElMessage.error('PCIe地址格式不正确，请使用格式：XXXX:XX:XX.X')
  }
}

const createBdev = async () => {
  try {
    await createFormRef.value.validate()
    createLoading.value = true
    
    // 根据BDEV类型调用相应的API方法
    const formData = createForm.value
    let response
    
    switch (formData.type) {
      case 'aio':
        // 确保filename字段已设置
        let filename = formData.filename
        if (formData.aio_source_mode === 'disk' && formData.selected_disk) {
          filename = formData.selected_disk
        }
        
        if (!filename) {
          throw new Error('请选择磁盘或输入文件路径')
        }
        
        response = await ApiService.bdevs.createAio({
          name: formData.name,
          filename: filename,
          block_size: formData.block_size
        })
        break
        
      case 'malloc':
        response = await ApiService.bdevs.createMalloc({
          name: formData.name,
          num_blocks: Math.floor((formData.size * 1024 * 1024) / formData.block_size),
          block_size: formData.block_size
        })
        break
        
      case 'nvme':
        response = await ApiService.bdevs.attachNvme({
          name: formData.name,
          trtype: 'pcie',
          traddr: formData.traddr
        })
        break
        
      default:
        throw new Error('不支持的BDEV类型')
    }
    
    ElMessage.success('BDEV创建成功')
    createVisible.value = false
    resetCreateForm()
    await refreshBdevs()
  } catch (error) {
    console.error('创建BDEV失败:', error)
    ElMessage.error('创建失败: ' + (error.response?.data?.message || error.message))
  } finally {
    createLoading.value = false
  }
}

const deleteBdev = async (name) => {
  try {
    await ApiService.bdevs.delete(name)
    ElMessage.success('BDEV删除成功')
    await refreshBdevs()
  } catch (error) {
    ElMessage.error('删除失败: ' + error.message)
  }
}

const showBdevDetails = (bdev) => {
  selectedBdev.value = bdev
  detailsVisible.value = true
}

// 组件挂载
onMounted(async () => {
  await refreshBdevs()
  
  // 预加载磁盘列表，用于AIO类型的磁盘选择
  try {
    await loadDisks()
  } catch (error) {
    console.warn('预加载磁盘列表失败:', error)
  }
  
  console.log('💾 BDEV管理页面已加载')
  
  // 调试计算属性
  console.log('🔍 BDEV调试信息:')
  console.log('bdevs.value:', bdevs.value)
  console.log('filteredBdevs.value:', filteredBdevs.value)
  console.log('availableDisks.value:', availableDisks.value)
})
</script>

<style scoped>
.bdev-management {
  padding: 0;
}

.table-controls {
  display: flex;
  align-items: center;
}

.bdev-name {
  display: flex;
  align-items: center;
}

.bdev-icon {
  margin-right: 8px;
}

.bdev-details {
  max-height: 60vh;
  overflow-y: auto;
}

.mt-4 {
  margin-top: 16px;
}

.device-selector {
  width: 100%;
}

.device-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.device-info {
  display: flex;
  flex-direction: column;
}

.device-model {
  font-weight: 500;
  color: #333;
}

.device-pcie {
  font-size: 12px;
  color: #666;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.device-details {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.device-capacity {
  font-weight: 500;
  color: #409eff;
}

.device-vendor {
  font-size: 12px;
  color: #999;
}

.selected-device-info {
  margin-top: 12px;
}

.form-help {
  margin-top: 8px;
}

/* 磁盘选择器样式 */
.disk-selector-input {
  width: 100%;
}

/* 磁盘选择弹窗样式 */
.disk-selection-content {
  max-height: 500px;
  overflow-y: auto;
}

.disk-selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.disk-list {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.disk-group:not(:last-child) {
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.disk-row, .partition-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
  min-height: 48px;
  gap: 12px;
  width: 100%;
}

.disk-row:hover, .partition-row:hover {
  background: var(--el-fill-color-light);
}

.disk-row.selected, .partition-row.selected {
  background: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}

.partition-row {
  background: var(--el-fill-color-extra-light);
  padding-left: 44px;
}

.device-icon {
  margin-right: 0;
  font-size: 16px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
}

.device-icon.disk {
  color: var(--el-color-primary);
}

.device-icon.partition {
  color: var(--el-color-warning);
}

.device-info {
  flex: 1;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.device-info > * {
  display: inline-block !important;
  vertical-align: middle !important;
}

.device-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  min-width: 100px;
  flex-shrink: 0;
}

.device-name-section {
  display: flex !important;
  align-items: center !important;
  gap: 8px;
  min-width: 140px;
  flex-shrink: 0;
}

.device-mode-tag {
  font-weight: 500;
  font-size: 10px;
  height: 18px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 9px;
}

.device-size {
  color: var(--el-color-primary);
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  min-width: 50px;
  flex-shrink: 0;
}

.device-model {
  color: var(--el-text-color-regular);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 100px;
}

.device-sector {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.device-pcie {
  color: var(--el-color-info);
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  background: var(--el-fill-color-extra-light);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 4px;
}

.device-fs {
  color: var(--el-color-success);
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 40px;
}

.device-mount {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 80px;
}

.device-path {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-extra-light);
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 100px;
}

.selected-disk-info {
  margin-top: 12px;
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
  
  .disk-selection-header {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
  
  .device-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  
  .device-model {
    max-width: none;
  }
  
  .device-mount {
    max-width: none;
  }
  
  .disk-row, .partition-row {
    min-height: auto;
    padding: 12px 16px;
  }
  
  .partition-row {
    padding-left: 24px;
  }
}

.original-name-tag {
  font-weight: 400;
  font-size: 9px;
  height: 16px;
  line-height: 14px;
  padding: 0 4px;
  border-radius: 8px;
  margin-left: 4px;
}
</style> 