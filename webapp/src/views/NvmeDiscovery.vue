<template>
  <div class="nvme-discovery">
    <div class="content-header">
      <h1>NVMe 设备发现</h1>
      <p>扫描和管理系统中的 NVMe 设备</p>
    </div>

    <div class="discovery-actions">
      <el-button 
        type="primary" 
        @click="discoverDevices"
        :loading="loading"
      >
        <el-icon><Refresh /></el-icon>
        扫描设备
      </el-button>
      
      <el-button 
        @click="exportData"
        :disabled="!devices.length"
      >
        <el-icon><Document /></el-icon>
        导出数据
      </el-button>
    </div>

    <!-- Summary Cards -->
    <div class="summary-cards" v-if="summary">
      <el-card class="summary-card">
        <div class="summary-item">
          <div class="summary-value">{{ summary.total_devices }}</div>
          <div class="summary-label">发现设备</div>
        </div>
      </el-card>
      
      <el-card class="summary-card">
        <div class="summary-item">
          <div class="summary-value">{{ formatCapacity(summary.total_capacity_gb) }}</div>
          <div class="summary-label">总容量</div>
        </div>
      </el-card>
      
      <el-card class="summary-card">
        <div class="summary-item">
          <div class="summary-value">{{ activeDevicesCount }}</div>
          <div class="summary-label">活动设备</div>
        </div>
      </el-card>
    </div>

    <!-- Device List -->
    <el-card class="device-list-card">
      <template #header>
        <div class="card-header">
          <span>NVMe 设备列表</span>
          <div class="header-actions">
            <el-input
              v-model="searchText"
              placeholder="搜索设备..."
              size="small"
              style="width: 200px;"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
        </div>
      </template>

      <el-table
        :data="filteredDevices"
        v-loading="loading"
        element-loading-text="正在扫描设备..."
        style="width: 100%"
        :default-sort="{prop: 'pcie_addr', order: 'ascending'}"
      >
        <el-table-column prop="pcie_addr" label="PCIe 地址" width="120" sortable>
          <template #default="{ row }">
            <span class="pcie-addr">{{ row.pcie_addr }}</span>
          </template>
        </el-table-column>
        
        <el-table-column label="设备信息" min-width="200">
          <template #default="{ row }">
            <div class="device-info">
              <div class="device-model">{{ row.model_number.trim() }}</div>
              <div class="device-serial">SN: {{ row.serial_number.trim() }}</div>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="厂商信息" width="150">
          <template #default="{ row }">
            <div class="vendor-info">
              <div>ID: {{ row.vendor_id }}</div>
              <div>Sub ID: {{ row.subsystem_vendor_id }}</div>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="容量" width="120">
          <template #default="{ row }">
            <div class="capacity-info">
              <div>{{ row.total_capacity_gb }} GB</div>
              <div class="text-muted">{{ formatBytes(row.total_capacity_bytes) }}</div>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="命名空间" width="100">
          <template #default="{ row }">
            <div class="namespace-info">
              <div>{{ row.namespace_count }}/{{ row.max_namespaces }}</div>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="固件版本" width="120">
          <template #default="{ row }">
            <span class="firmware-version">{{ row.firmware_version.trim() }}</span>
          </template>
        </el-table-column>
        
        <el-table-column label="传输类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.transport_type }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { nvmeDiscoveryAPI } from '@/api/nvme-discovery'
import { ElMessage } from 'element-plus'
import { 
  Refresh, 
  Document,
  Search
} from '@element-plus/icons-vue'

// 数据状态
const loading = ref(false)
const devices = ref([])
const summary = ref(null)
const searchText = ref('')

// 计算属性
const filteredDevices = computed(() => {
  if (!searchText.value) return devices.value
  
  const search = searchText.value.toLowerCase()
  return devices.value.filter(device =>
    device.model_number.toLowerCase().includes(search) ||
    device.serial_number.toLowerCase().includes(search) ||
    device.pcie_addr.toLowerCase().includes(search)
  )
})

const activeDevicesCount = computed(() => {
  return devices.value.filter(device => device.namespace_count > 0).length
})

// 工具函数
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const formatCapacity = (capacityGb) => {
  if (!capacityGb) return '0 GB'
  return `${capacityGb.toFixed(2)} GB`
}

// 方法
const discoverDevices = async () => {
  loading.value = true
  try {
    const response = await nvmeDiscoveryAPI.discover()
    console.log('NVMe发现API响应:', response)
    
    // 修正axios响应结构
    const apiData = response.data
    if (apiData.success) {
      devices.value = apiData.data.nvme_devices || []
      summary.value = apiData.data
      
      ElMessage.success(`发现 ${devices.value.length} 个 NVMe 设备`)
      console.log('NVMe设备数据:', devices.value)
    } else {
      throw new Error(apiData.message || 'NVMe 发现失败')
    }
  } catch (error) {
    console.error('NVMe discovery error:', error)
    ElMessage.error('NVMe 发现失败: ' + error.message)
    devices.value = []
    summary.value = null
  } finally {
    loading.value = false
  }
}

const exportData = () => {
  try {
    const dataStr = JSON.stringify(devices.value, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataBlob)
    link.download = `nvme-devices-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    ElMessage.success('数据导出成功')
  } catch (error) {
    console.error('Export error:', error)
    ElMessage.error('导出失败')
  }
}

// 组件挂载
onMounted(async () => {
  await discoverDevices()
  console.log('🚀 NVMe 发现页面已加载')
})
</script>

<style scoped>
.nvme-discovery {
  padding: 0;
}

.content-header {
  margin-bottom: 20px;
}

.content-header h1 {
  margin: 0;
  font-size: 24px;
  color: #333;
}

.content-header p {
  margin: 5px 0 0 0;
  color: #666;
  font-size: 14px;
}

.discovery-actions {
  margin-bottom: 20px;
  display: flex;
  gap: 12px;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.summary-card {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.summary-item {
  text-align: center;
  padding: 20px;
}

.summary-value {
  font-size: 24px;
  font-weight: 600;
  color: #409eff;
  margin-bottom: 8px;
}

.summary-label {
  font-size: 14px;
  color: #666;
}

.device-list-card {
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: #333;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pcie-addr {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  color: #409eff;
  background: #f0f9ff;
  padding: 2px 6px;
  border-radius: 4px;
}

.device-info {
  line-height: 1.5;
}

.device-model {
  font-weight: 500;
  color: #333;
}

.device-serial {
  font-size: 12px;
  color: #666;
  font-family: monospace;
}

.vendor-info {
  font-size: 12px;
  line-height: 1.4;
}

.capacity-info {
  line-height: 1.4;
}

.text-muted {
  color: #999;
  font-size: 12px;
}

.namespace-info {
  text-align: center;
  font-weight: 500;
  color: #409eff;
}

.firmware-version {
  font-family: monospace;
  font-size: 12px;
  color: #666;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .summary-cards {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
  }
  
  .discovery-actions {
    flex-direction: column;
  }
  
  .card-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
}
</style> 