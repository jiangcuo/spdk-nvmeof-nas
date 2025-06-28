<template>
  <div class="dashboard">
    <div class="page-header">
      <h1 class="page-title">仪表板</h1>
      <div class="button-group">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
      </div>
    </div>

    <!-- 系统状态卡片 -->
    <el-row :gutter="20" class="status-row">
      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon system">
            <el-icon size="32"><Monitor /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">系统状态</div>
            <div class="status-value">
              <el-tag :type="systemInfo.spdk_connected ? 'success' : 'danger'">
                {{ systemInfo.spdk_connected ? '正常' : '断开' }}
              </el-tag>
            </div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon disks">
            <el-icon size="32"><Monitor /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">物理磁盘</div>
            <div class="status-value">{{ diskStats.total_disks || 0 }}</div>
            <div class="status-desc">可用: {{ diskStats.available_disks || 0 }}</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon bdevs">
            <el-icon size="32"><Cpu /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">Block Devices</div>
            <div class="status-value">{{ bdevCount }}</div>
            <div class="status-desc">SPDK 管理的设备</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon raids">
            <el-icon size="32"><Grid /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">RAID 阵列</div>
            <div class="status-value">{{ raidCount }}</div>
            <div class="status-desc">活动阵列</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 逻辑卷状态卡片 -->
    <el-row :gutter="20" class="status-row">
      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon lvstore">
            <el-icon size="32"><Folder /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">LV Store</div>
            <div class="status-value">{{ lvStoreCount }}</div>
            <div class="status-desc">逻辑卷存储池</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon storage">
            <el-icon size="32"><Box /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">总容量</div>
            <div class="status-value">{{ formatBytes(diskStats.total_capacity) }}</div>
            <div class="status-desc">存储总量</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon nvme">
            <el-icon size="32"><DataLine /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">NVMe 磁盘</div>
            <div class="status-value">{{ diskStats.nvme_disks || 0 }}</div>
            <div class="status-desc">高速存储设备</div>
          </div>
        </div>
      </el-col>

      <el-col :xs="24" :sm="12" :lg="6">
        <div class="status-card">
          <div class="status-icon ssd">
            <el-icon size="32"><Odometer /></el-icon>
          </div>
          <div class="status-content">
            <div class="status-title">SSD 磁盘</div>
            <div class="status-value">{{ diskStats.ssd_disks || 0 }}</div>
            <div class="status-desc">固态存储设备</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 详细信息 -->
    <el-row :gutter="20">
      <!-- 系统信息 -->
      <el-col :xs="24" :lg="12">
        <div class="page-card">
          <div class="card-header">
            <h3>系统信息</h3>
          </div>
          <div class="system-details">
            <div class="detail-item">
              <span class="label">SPDK 版本:</span>
              <span class="value">{{ systemInfo.spdk_info?.version.version || 'N/A' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">SPDK 状态:</span>
              <el-tag :type="systemInfo.spdk_connected ? 'success' : 'danger'" size="small">
                {{ systemInfo.spdk_connected ? '已连接' : '未连接' }}
              </el-tag>
            </div>
            <div class="detail-item">
              <span class="label">Node.js 版本:</span>
              <span class="value">{{ systemInfo.server_info?.node_version || 'N/A' }}</span>
            </div>
            <div class="detail-item">
              <span class="label">运行时间:</span>
              <span class="value">{{ formatUptime(systemInfo.server_info?.uptime) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">SPDK Socket:</span>
              <span class="value">{{ systemInfo.socket_path || 'N/A' }}</span>
            </div>
          </div>
        </div>
      </el-col>

      <!-- 存储概览 -->
      <el-col :xs="24" :lg="12">
        <div class="page-card">
          <div class="card-header">
            <h3>存储概览</h3>
          </div>
          <div class="storage-overview">
            <div class="storage-item">
              <el-progress 
                :percentage="Math.round((diskStats.mounted_disks / Math.max(diskStats.total_disks, 1)) * 100)"
                :color="progressColors"
              />
              <div class="storage-label">磁盘使用率</div>
            </div>
            <div class="storage-stats">
              <div class="stat-item">
                <span class="stat-label">已挂载磁盘:</span>
                <span class="stat-value">{{ diskStats.mounted_disks || 0 }} / {{ diskStats.total_disks || 0 }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">可用容量:</span>
                <span class="stat-value">{{ formatBytes(diskStats.available_capacity) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">平均容量:</span>
                <span class="stat-value">{{ formatBytes(diskStats.total_capacity / Math.max(diskStats.total_disks, 1)) }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>



    <!-- 系统配置 -->
    <div class="page-card">
      <div class="card-header">
        <h3>系统配置</h3>
      </div>
      <div class="config-actions">
        <el-button 
          type="primary" 
          @click="saveConfiguration"
          :loading="saveConfigLoading"
        >
          <el-icon><Document /></el-icon>
          保存当前配置
        </el-button>
        <div class="config-help">
          <p>将当前SPDK运行时配置实时保存到 <code>/etc/spdk/spdk.conf</code> 文件</p>
          <p style="font-size: 12px; color: #999; margin-top: 4px;">✓ 实时保存，无需重启服务</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ApiService } from '@/services/api'
import { 
  Refresh, 
  Monitor, 
  Cpu, 
  Grid, 
  Document,
  Folder,
  Box,
  DataLine,
  Odometer
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// 数据状态
const loading = ref(false)
const saveConfigLoading = ref(false)
const systemInfo = ref({})
const diskStats = ref({})
const bdevCount = ref(0)
const raidCount = ref(0)
const lvStoreCount = ref(0)

// 进度条颜色
const progressColors = [
  { color: '#67c23a', percentage: 50 },
  { color: '#e6a23c', percentage: 80 },
  { color: '#f56c6c', percentage: 100 }
]

// 格式化运行时间
const formatUptime = (seconds) => {
  if (!seconds) return 'N/A'
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  return `${days}天 ${hours}小时 ${minutes}分钟`
}

// 格式化字节大小
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// 刷新数据
const refreshData = async () => {
  loading.value = true
  
  try {
    await Promise.all([
      loadSystemInfo(),
      loadDiskStats(),
      loadBdevCount(),
      loadRaidCount(),
      loadLvStoreCount()
    ])
    
    ElMessage.success('数据刷新成功')
  } catch (error) {
    console.error('刷新数据失败:', error)
    ElMessage.error('数据刷新失败')
  } finally {
    loading.value = false
  }
}

// 加载系统信息
const loadSystemInfo = async () => {
  try {
    const response = await ApiService.system.getStatus()
    systemInfo.value = response.data
    
    // 获取SPDK版本信息
    if (response.data.spdk_connected) {
      try {
        const versionResponse = await ApiService.get('/api/spdk/version')
        systemInfo.value.spdk_info = versionResponse.data.data || versionResponse.data
      } catch (error) {
        console.warn('获取SPDK版本失败:', error)
      }
    }
  } catch (error) {
    console.warn('获取系统信息失败:', error)
  }
}

// 加载磁盘统计
const loadDiskStats = async () => {
  try {
    const response = await ApiService.disks.getStats()
    console.log('📊 Dashboard 磁盘统计 API响应:', response)
    
    // 修正axios响应结构
    const apiData = response.data
    if (apiData.success && apiData.data) {
      diskStats.value = apiData.data
    } else {
      diskStats.value = apiData
    }
    
    console.log('📊 Dashboard 磁盘统计数据:', diskStats.value)
  } catch (error) {
    console.warn('获取磁盘统计失败:', error)
    diskStats.value = {}
  }
}

// 加载 BDEV 数量
const loadBdevCount = async () => {
  try {
    const response = await ApiService.bdevs.getAll()
    console.log('📊 Dashboard BDEV API响应:', response)
    
    // 修正axios响应结构
    const apiData = response.data
    let bdevs = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.bdevs)) {
      bdevs = apiData.data.bdevs
    } else if (Array.isArray(apiData.bdevs)) {
      bdevs = apiData.bdevs
    } else if (Array.isArray(apiData)) {
      bdevs = apiData
    }
    
    bdevCount.value = bdevs.length
    console.log('📊 Dashboard BDEV数量:', bdevCount.value)
  } catch (error) {
    console.warn('获取 BDEV 数量失败:', error)
    bdevCount.value = 0
  }
}

// 加载 RAID 数量
const loadRaidCount = async () => {
  try {
    const response = await ApiService.raids.getAll()
    console.log('📊 Dashboard RAID API响应:', response)
    
    // 修正axios响应结构
    const apiData = response.data
    let raids = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.raids)) {
      raids = apiData.data.raids
    } else if (Array.isArray(apiData.raids)) {
      raids = apiData.raids
    } else if (Array.isArray(apiData)) {
      raids = apiData
    }
    
    raidCount.value = raids.length
    console.log('📊 Dashboard RAID数量:', raidCount.value)
  } catch (error) {
    console.warn('获取 RAID 数量失败:', error)
    raidCount.value = 0
  }
}

// 加载 LV Store 数量
const loadLvStoreCount = async () => {
  try {
    const response = await ApiService.lvstores.getAll()
    console.log('📊 Dashboard LV Store API响应:', response)
    
    // 修正axios响应结构
    const apiData = response.data
    let stores = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.lv_stores)) {
      stores = apiData.data.lv_stores
    } else if (Array.isArray(apiData.lv_stores)) {
      stores = apiData.lv_stores
    } else if (Array.isArray(apiData)) {
      stores = apiData
    }
    
    lvStoreCount.value = stores.length
    console.log('📊 Dashboard LV Store数量:', lvStoreCount.value)
  } catch (error) {
    console.warn('获取 LV Store 数量失败:', error)
    lvStoreCount.value = 0
  }
}

// 保存SPDK配置
const saveConfiguration = async () => {
  saveConfigLoading.value = true
  
  try {
    const response = await ApiService.config.save()
    
    if (response.data.success) {
      ElMessage.success('配置保存成功！已实时保存到 /etc/spdk/spdk.conf，无需重启服务')
    } else {
      throw new Error(response.data.message || '保存配置失败')
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    ElMessage.error(`保存配置失败: ${error.message || error}`)
  } finally {
    saveConfigLoading.value = false
  }
}

// 组件挂载
onMounted(async () => {
  await refreshData()
  console.log('📊 仪表板已加载')
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}

.status-row {
  margin-bottom: 20px;
}

.status-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  height: 100px;
  transition: all 0.3s ease;
}

.status-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.status-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
}

.status-icon.system {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.status-icon.disks {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.status-icon.bdevs {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
}

.status-icon.raids {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  color: white;
}

.status-icon.lvstore {
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
  color: white;
}

.status-icon.storage {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  color: white;
}

.status-icon.nvme {
  background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
  color: white;
}

.status-icon.ssd {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.status-content {
  flex: 1;
}

.status-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.status-value {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.status-desc {
  font-size: 12px;
  color: #999;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.system-details {
  space-y: 12px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.detail-item:last-child {
  border-bottom: none;
}

.label {
  font-weight: 500;
  color: #666;
}

.value {
  color: #333;
}

.storage-overview {
  margin-top: 20px;
}

.storage-item {
  margin-bottom: 20px;
}

.storage-label {
  text-align: center;
  margin-top: 8px;
  font-size: 14px;
  color: #666;
}

.storage-stats {
  margin-top: 20px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-label {
  color: #666;
}

.stat-value {
  font-weight: 600;
  color: #333;
}



.config-actions {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.config-help {
  flex: 1;
}

.config-help p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.config-help code {
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  color: #e6a23c;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .status-card {
    height: auto;
    flex-direction: column;
    text-align: center;
    padding: 16px;
  }
  
  .status-icon {
    margin-right: 0;
    margin-bottom: 12px;
  }
}
</style> 