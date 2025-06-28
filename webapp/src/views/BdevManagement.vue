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
          <el-select v-model="createForm.type" placeholder="请选择类型" style="width: 100%">
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
          <el-form-item label="文件路径" prop="filename">
            <el-input v-model="createForm.filename" placeholder="/path/to/file" />
          </el-form-item>
          <el-form-item label="块大小" prop="block_size">
            <el-input-number v-model="createForm.block_size" :min="512" :step="512" />
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
const bdevs = ref([])
const selectedBdev = ref(null)
const discoveredDevices = ref([])
const selectedDeviceInfo = ref(null)

// 对话框状态
const createVisible = ref(false)
const detailsVisible = ref(false)

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
  selected_device: ''
})

// 表单验证规则
const createRules = {
  type: [{ required: true, message: '请选择BDEV类型', trigger: 'change' }],
  name: [{ required: true, message: '请输入BDEV名称', trigger: 'blur' }],
  filename: [{ required: true, message: '请输入文件路径', trigger: 'blur' }],
  traddr: [{ required: true, message: '请输入PCI地址', trigger: 'blur' }],
  size: [{ required: true, message: '请输入大小', trigger: 'blur' }],
  selected_device: [{ required: true, message: '请选择设备', trigger: 'change' }]
}

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
  createForm.value = {
    type: '',
    name: '',
    filename: '',
    traddr: '',
    size: 100,
    block_size: 4096,
    device_selection_mode: 'discovered',
    selected_device: ''
  }
  createVisible.value = true
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
        response = await ApiService.bdevs.createAio({
          name: formData.name,
          filename: formData.filename,
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
  console.log('💾 BDEV管理页面已加载')
  
  // 调试计算属性
  console.log('🔍 BDEV调试信息:')
  console.log('bdevs.value:', bdevs.value)
  console.log('filteredBdevs.value:', filteredBdevs.value)
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
</style> 