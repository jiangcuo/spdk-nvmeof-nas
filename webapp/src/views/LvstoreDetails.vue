<template>
  <div class="lvstore-details">
    <!-- 面包屑导航 -->
    <el-breadcrumb class="breadcrumb" separator="/">
      <el-breadcrumb-item :to="{ name: 'LvolManagement' }">逻辑卷管理</el-breadcrumb-item>
      <el-breadcrumb-item>{{ decodedStoreName }}</el-breadcrumb-item>
    </el-breadcrumb>

    <!-- LVStore信息卡片 -->
    <el-card class="lvstore-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <h3>LV Store详情</h3>
          <div class="actions">
            <el-button type="danger" @click="deleteLvStore" v-if="userStore.isAdmin">
              <el-icon><Delete /></el-icon>
              删除LV Store
            </el-button>
          </div>
        </div>
      </template>
      
      <el-descriptions :column="2" border v-if="lvstoreData.name">
        <el-descriptions-item label="名称">{{ lvstoreData.name }}</el-descriptions-item>
        <el-descriptions-item label="UUID">{{ lvstoreData.uuid }}</el-descriptions-item>
        <el-descriptions-item label="基础BDEV">{{ lvstoreData.base_bdev }}</el-descriptions-item>
        <el-descriptions-item label="块大小">{{ lvstoreData.block_size }} B</el-descriptions-item>
        <el-descriptions-item label="集群大小">{{ formatBytes(lvstoreData.cluster_size) }}</el-descriptions-item>
        <el-descriptions-item label="总容量">{{ formatBytes(lvstoreData.total_data_clusters * lvstoreData.cluster_size) }}</el-descriptions-item>
        <el-descriptions-item label="已用容量">
          <div class="usage-info">
            {{ formatBytes((lvstoreData.total_data_clusters - lvstoreData.free_clusters) * lvstoreData.cluster_size) }}
            <el-progress
              :percentage="getUsagePercentage()"
              :color="getUsageColor()"
              :stroke-width="6"
              style="margin-top: 4px; max-width: 200px;"
            />
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="可用容量">{{ formatBytes(lvstoreData.free_clusters * lvstoreData.cluster_size) }}</el-descriptions-item>
      </el-descriptions>
      
      <div v-else class="loading-placeholder">
        <el-skeleton :rows="4" animated />
      </div>
    </el-card>

    <!-- LVol管理标签页 -->
    <el-card class="management-card" shadow="hover">
      <el-tabs v-model="activeTab" type="border-card">
        
        <!-- LVol管理 -->
        <el-tab-pane label="逻辑卷(LVol)" name="lvols">
          <div class="tab-content">
            <div class="content-header">
              <h4>LVol列表</h4>
              <el-button type="primary" @click="showCreateLvolDialog" v-if="userStore.isAdmin">
                <el-icon><Plus /></el-icon>
                创建LVol
              </el-button>
            </div>

            <el-table :data="lvols" v-loading="loading" stripe>
              <el-table-column label="名称" min-width="150">
                <template #default="{ row }">
                  {{ row.name }}
                </template>
              </el-table-column>
              <el-table-column prop="uuid" label="UUID" min-width="250" show-overflow-tooltip />
              <el-table-column label="大小" width="120">
                <template #default="{ row }">{{ getLvolSize(row) }}</template>
              </el-table-column>
              <el-table-column label="精简配置" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.is_thin_provisioned ? 'success' : 'info'" size="small">
                    {{ row.is_thin_provisioned ? '是' : '否' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200" fixed="right">
                <template #default="{ row }">
                  <div class="button-group">
                    <el-button size="small" @click="showLvolDetails(row)">
                      <el-icon><View /></el-icon>
                      详情
                    </el-button>
                    <el-button size="small" type="warning" @click="showResizeLvolDialog(row)" v-if="userStore.isAdmin">
                      <el-icon><Edit /></el-icon>
                      调整大小
                    </el-button>
                    <el-popconfirm
                      title="确定要删除这个LVol吗？"
                      @confirm="deleteLvol(row.uuid)"
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
        </el-tab-pane>

        <!-- 存储统计 -->
        <el-tab-pane label="存储统计" name="statistics">
          <div class="tab-content">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-card>
                  <template #header>
                    <div class="card-header">
                      <h4>容量统计</h4>
                    </div>
                  </template>
                  <div class="statistics-content">
                    <div class="stat-item">
                      <span class="stat-label">总容量:</span>
                      <span class="stat-value">{{ formatBytes(lvstoreData.total_data_clusters * lvstoreData.cluster_size) }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">已用容量:</span>
                      <span class="stat-value">{{ formatBytes((lvstoreData.total_data_clusters - lvstoreData.free_clusters) * lvstoreData.cluster_size) }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">可用容量:</span>
                      <span class="stat-value">{{ formatBytes(lvstoreData.free_clusters * lvstoreData.cluster_size) }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">使用率:</span>
                      <span class="stat-value">{{ getUsagePercentage() }}%</span>
                    </div>
                  </div>
                </el-card>
              </el-col>
              
              <el-col :span="12">
                <el-card>
                  <template #header>
                    <div class="card-header">
                      <h4>LVol统计</h4>
                    </div>
                  </template>
                  <div class="statistics-content">
                    <div class="stat-item">
                      <span class="stat-label">LVol总数:</span>
                      <span class="stat-value">{{ lvols.length }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">精简配置:</span>
                      <span class="stat-value">{{ lvols.filter(l => l.is_thin_provisioned).length }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">厚配置:</span>
                      <span class="stat-value">{{ lvols.filter(l => !l.is_thin_provisioned).length }}</span>
                    </div>
                    <div class="stat-item">
                      <span class="stat-label">平均大小:</span>
                      <span class="stat-value">{{ getAverageSize() }}</span>
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

      </el-tabs>
    </el-card>

    <!-- 创建LVol对话框 -->
    <el-dialog v-model="createLvolVisible" title="创建LVol" width="600px">
      <el-form ref="createLvolFormRef" :model="createLvolForm" :rules="createLvolRules" label-width="120px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="createLvolForm.name" placeholder="输入LVol名称" />
        </el-form-item>
        <el-form-item label="大小(MB)" prop="size">
          <el-input-number v-model="createLvolForm.size" :min="1" :max="getMaxSizeMB()" style="width: 100%" />
          <div class="form-help-text">
            最大可用大小: {{ formatBytes(lvstoreData.free_clusters * lvstoreData.cluster_size) }}
          </div>
        </el-form-item>
        <el-form-item label="精简配置" prop="thin_provision">
          <el-switch v-model="createLvolForm.thin_provision" />
          <div class="form-help-text">
            精简配置可以节省存储空间，但可能影响性能
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createLvolVisible = false">取消</el-button>
          <el-button type="primary" @click="createLvol" :loading="createLvolLoading">创建</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 调整LVol大小对话框 -->
    <el-dialog v-model="resizeLvolVisible" title="调整LVol大小" width="600px">
      <el-form ref="resizeLvolFormRef" :model="resizeLvolForm" :rules="resizeLvolRules" label-width="120px">
        <el-form-item label="LVol名称">
          <el-input :value="selectedLvol?.alias || selectedLvol?.name" disabled />
        </el-form-item>
        <el-form-item label="当前大小">
          <el-input :value="selectedLvol ? getLvolSize(selectedLvol) : ''" disabled />
        </el-form-item>
        <el-form-item label="新大小(MB)" prop="size">
          <el-input-number v-model="resizeLvolForm.size" :min="getCurrentSizeMB()" :max="getMaxResizeMB()" style="width: 100%" />
          <div class="form-help-text">
            当前大小: {{ getCurrentSizeMB() }}MB, 
            最大可调整至: {{ getMaxResizeMB() }}MB
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="resizeLvolVisible = false">取消</el-button>
          <el-button type="primary" @click="resizeLvol" :loading="resizeLvolLoading">调整</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- LVol详情对话框 -->
    <el-dialog v-model="lvolDetailsVisible" :title="`LVol详情 - ${selectedLvol?.alias || selectedLvol?.name || ''}`" width="700px">
      <div v-if="selectedLvol" class="lvol-details">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">{{ selectedLvol.alias || selectedLvol.name }}</el-descriptions-item>
          <el-descriptions-item label="UUID">{{ selectedLvol.uuid }}</el-descriptions-item>
                      <el-descriptions-item label="所属LV Store">{{ selectedLvol.lvs?.name || selectedLvol.lvs_name }}</el-descriptions-item>
                      <el-descriptions-item label="大小">{{ getLvolSize(selectedLvol) }}</el-descriptions-item>
            <el-descriptions-item label="精简配置">
              <el-tag :type="selectedLvol.is_thin_provisioned ? 'success' : 'info'" size="small">
                {{ selectedLvol.is_thin_provisioned ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
          <el-descriptions-item label="已分配">
            <el-tag :type="selectedLvol.claimed ? 'warning' : 'success'" size="small">
              {{ selectedLvol.claimed ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ApiService } from '@/services/api'
import { 
  Delete,
  Plus,
  View,
  Edit
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 路由参数
const storeId = computed(() => decodeURIComponent(route.params.storeId))
const storeName = computed(() => decodeURIComponent(route.params.storeName))
const decodedStoreName = computed(() => decodeURIComponent(route.params.storeName))

// 数据状态
const loading = ref(false)
const lvstoreData = ref({})
const lvols = ref([])

// 界面状态
const activeTab = ref('lvols')

// 对话框状态
const createLvolVisible = ref(false)
const resizeLvolVisible = ref(false)
const lvolDetailsVisible = ref(false)

// 加载状态
const createLvolLoading = ref(false)
const resizeLvolLoading = ref(false)

// 表单数据
const createLvolFormRef = ref()
const createLvolForm = ref({
  name: '',
  size: 100,
  thin_provision: true
})

const resizeLvolFormRef = ref()
const resizeLvolForm = ref({
  size: 100
})

const selectedLvol = ref(null)

// 表单验证规则
const createLvolRules = {
  name: [{ required: true, message: '请输入LVol名称', trigger: 'blur' }],
  size: [{ required: true, message: '请输入大小', trigger: 'blur' }]
}

const resizeLvolRules = {
  size: [{ required: true, message: '请输入新大小', trigger: 'blur' }]
}

// 格式化字节大小
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取使用率百分比
const getUsagePercentage = () => {
  if (!lvstoreData.value.total_data_clusters) return 0
  const used = lvstoreData.value.total_data_clusters - lvstoreData.value.free_clusters
  return Math.round((used / lvstoreData.value.total_data_clusters) * 100)
}

// 获取使用率颜色
const getUsageColor = () => {
  const percentage = getUsagePercentage()
  if (percentage >= 90) return '#f56c6c'
  if (percentage >= 70) return '#e6a23c'
  return '#67c23a'
}

// 获取最大可创建LVol大小(MB)
const getMaxSizeMB = () => {
  if (!lvstoreData.value.free_clusters || !lvstoreData.value.cluster_size) return 0
  return Math.floor((lvstoreData.value.free_clusters * lvstoreData.value.cluster_size) / (1024 * 1024))
}

// 获取LVol大小显示
const getLvolSize = (lvol) => {
  // 优先使用从BDEV获取的准确大小
  if (lvol.size_bytes) {
    return formatBytes(lvol.size_bytes)
  }
  // 兼容旧数据格式
  if (lvol.num_allocated_clusters && lvstoreData.value.cluster_size) {
    const sizeInBytes = lvol.num_allocated_clusters * lvstoreData.value.cluster_size
    return formatBytes(sizeInBytes)
  }
  return 'N/A'
}

// 计算LVol平均大小
const getAverageSize = () => {
  if (lvols.value.length === 0) return 'N/A'
  
  const totalSizes = lvols.value.map(lvol => {
    // 优先使用从BDEV获取的准确大小
    if (lvol.size_bytes) {
      return lvol.size_bytes
    }
    // 兼容旧数据格式
    if (lvol.num_allocated_clusters && lvstoreData.value.cluster_size) {
      return lvol.num_allocated_clusters * lvstoreData.value.cluster_size
    }
    return 0
  })
  
  const validSizes = totalSizes.filter(size => size > 0)
  if (validSizes.length === 0) return 'N/A'
  
  const average = validSizes.reduce((a, b) => a + b, 0) / validSizes.length
  return formatBytes(average)
}

// 获取当前LVol大小(MB)
const getCurrentSizeMB = () => {
  if (!selectedLvol.value) return 0
  
  // 优先使用从BDEV获取的准确大小
  if (selectedLvol.value.size_bytes) {
    return Math.ceil(selectedLvol.value.size_bytes / (1024 * 1024))
  }
  
  // 兼容旧数据格式
  if (selectedLvol.value.num_allocated_clusters && lvstoreData.value.cluster_size) {
    const sizeInBytes = selectedLvol.value.num_allocated_clusters * lvstoreData.value.cluster_size
    return Math.ceil(sizeInBytes / (1024 * 1024))
  }
  
  return 0
}

// 获取调整大小的最大值(MB)
const getMaxResizeMB = () => {
  if (!selectedLvol.value || !lvstoreData.value.free_clusters) return getCurrentSizeMB()
  const currentMB = getCurrentSizeMB()
  const freeMB = Math.floor((lvstoreData.value.free_clusters * lvstoreData.value.cluster_size) / (1024 * 1024))
  return currentMB + freeMB
}

// 数据加载
const loadLvStoreDetails = async () => {
  try {
    const response = await ApiService.lvstores.getAll()
    console.log('📦 LV Store数据:', response.data)
    
    const store = response.data?.find(s => s.uuid === storeId.value || s.name === storeName.value)
    if (store) {
      lvstoreData.value = store
    } else {
      throw new Error('LV Store不存在')
    }
  } catch (error) {
    console.error('❌ 加载LV Store详情失败:', error)
    ElMessage.error('加载LV Store详情失败：' + error.message)
    router.push({ name: 'LvolManagement' })
  }
}

const loadLvols = async () => {
  try {
    const response = await ApiService.bdevs.getAll()
    console.log('📦 BDEV数据:', response.data)
    
    // 从BDEV数据中筛选出属于当前LV Store的LVol
    const apiData = response.data
    let bdevs = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.bdevs)) {
      bdevs = apiData.data.bdevs
    } else if (Array.isArray(apiData.bdevs)) {
      bdevs = apiData.bdevs
    } else if (Array.isArray(apiData)) {
      bdevs = apiData
    }
    
    // 筛选出LVol类型的BDEV，并且属于当前LV Store
    lvols.value = bdevs.filter(bdev => {
      // 检查是否是LVol
      if (bdev.product_name !== 'Logical Volume') return false
      if (!bdev.driver_specific || !bdev.driver_specific.lvol) return false
      
      // 检查是否属于当前LV Store
      const lvolInfo = bdev.driver_specific.lvol
      return lvolInfo.lvol_store_uuid === storeId.value
    }).map(bdev => {
      // 转换数据格式以兼容现有组件
      const alias = bdev.aliases && bdev.aliases[0] ? bdev.aliases[0] : ''
      const name = alias.includes('/') ? alias.split('/')[1] : alias
      
      return {
        uuid: bdev.uuid,
        name: name, // LVol名称（去掉LV Store前缀）
        alias: alias, // 完整路径
        block_size: bdev.block_size,
        num_blocks: bdev.num_blocks,
        size_bytes: bdev.block_size * bdev.num_blocks, // 计算字节大小
        is_thin_provisioned: bdev.driver_specific.lvol.thin_provision,
        is_snapshot: bdev.driver_specific.lvol.snapshot,
        is_clone: bdev.driver_specific.lvol.clone,
        is_esnap_clone: bdev.driver_specific.lvol.esnap_clone,
        num_allocated_clusters: bdev.driver_specific.lvol.num_allocated_clusters,
        claimed: bdev.claimed,
        lvs: {
          name: storeName.value,
          uuid: storeId.value
        }
      }
    })
    
    console.log('📦 处理后的LVol数据:', lvols.value)
  } catch (error) {
    console.error('❌ 加载LVol失败:', error)
    ElMessage.error('加载LVol失败：' + error.message)
  }
}

const refreshData = async () => {
  loading.value = true
  try {
    await Promise.all([
      loadLvStoreDetails(),
      loadLvols()
    ])
  } finally {
    loading.value = false
  }
}

// LVol操作
const showCreateLvolDialog = () => {
  if (getMaxSizeMB() <= 0) {
    ElMessage.warning('LV Store空间不足，无法创建新的LVol')
    return
  }
  
  createLvolForm.value = {
    name: '',
    size: Math.min(100, getMaxSizeMB()),
    thin_provision: true
  }
  createLvolVisible.value = true
}

const createLvol = async () => {
  if (!createLvolFormRef.value) return
  
  const valid = await createLvolFormRef.value.validate().catch(() => false)
  if (!valid) return

  createLvolLoading.value = true
  try {
    // 根据SPDK RPC规范设置正确的参数
    const params = {
      uuid: lvstoreData.value.uuid,                 // LV Store UUID
      lvol_name: createLvolForm.value.name,         // LVol名称
      size_in_mib: createLvolForm.value.size,       // 大小(MiB单位，不需要转换)
      thin_provision: createLvolForm.value.thin_provision
    }
    
    await ApiService.lvols.create(params)
    ElMessage.success('LVol创建成功')
    createLvolVisible.value = false
    await refreshData()
  } catch (error) {
    console.error('❌ 创建LVol失败:', error)
    ElMessage.error('创建LVol失败：' + (error.response?.data?.message || error.message))
  } finally {
    createLvolLoading.value = false
  }
}

const showResizeLvolDialog = (lvol) => {
  selectedLvol.value = lvol
  resizeLvolForm.value = {
    size: getCurrentSizeMB()
  }
  resizeLvolVisible.value = true
}

const resizeLvol = async () => {
  if (!resizeLvolFormRef.value || !selectedLvol.value) return
  
  const valid = await resizeLvolFormRef.value.validate().catch(() => false)
  if (!valid) return

  resizeLvolLoading.value = true
  try {
    // SPDK resize也使用size_in_mib参数
    await ApiService.lvols.resize(
      selectedLvol.value.alias || selectedLvol.value.name,
      resizeLvolForm.value.size // 直接使用MiB值，不转换
    )
    
    ElMessage.success('LVol大小调整成功')
    resizeLvolVisible.value = false
    await refreshData()
  } catch (error) {
    console.error('❌ 调整LVol大小失败:', error)
    ElMessage.error('调整LVol大小失败：' + (error.response?.data?.message || error.message))
  } finally {
    resizeLvolLoading.value = false
  }
}

const showLvolDetails = (lvol) => {
  selectedLvol.value = lvol
  lvolDetailsVisible.value = true
}

const deleteLvol = async (lvolName) => {

  try {
    await ApiService.lvols.delete(lvolName)
    ElMessage.success('LVol删除成功')
    await refreshData()
  } catch (error) {
    console.error('❌ 删除LVol失败:', error)
    ElMessage.error('删除LVol失败：' + (error.response?.data?.message || error.message))
  }
}

// LV Store操作
const deleteLvStore = async () => {
  if (lvols.value.length > 0) {
    ElMessage.warning(`无法删除LV Store "${storeName.value}"，因为它包含 ${lvols.value.length} 个LVol。请先删除所有LVol。`)
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除LV Store "${storeName.value}"吗？此操作不可撤销。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    await ApiService.lvstores.delete(lvstoreData.value.uuid)
    ElMessage.success('LV Store删除成功')
    router.push({ name: 'LvolManagement' })
  } catch (error) {
    if (error !== 'cancel') {
      console.error('❌ 删除LV Store失败:', error)
      ElMessage.error('删除LV Store失败：' + error.message)
    }
  }
}

// 生命周期
onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.lvstore-details {
  padding: 20px;
}

.breadcrumb {
  margin-bottom: 20px;
}

.lvstore-card, .management-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
  color: #303133;
}

.loading-placeholder {
  padding: 20px;
}

.tab-content {
  margin-top: 20px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.content-header h4 {
  margin: 0;
  color: #303133;
}

.button-group {
  display: flex;
  gap: 8px;
}

.usage-info {
  min-width: 200px;
}

.statistics-content {
  padding: 10px 0;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.stat-label {
  font-weight: 500;
  color: #606266;
}

.stat-value {
  font-weight: 600;
  color: #303133;
}

.form-help-text {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.lvol-details {
  max-height: 60vh;
  overflow-y: auto;
}
</style> 