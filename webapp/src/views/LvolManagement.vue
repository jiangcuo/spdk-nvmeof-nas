<template>
  <div class="lvol-management">
    <div class="page-header">
      <h1 class="page-title">逻辑卷管理</h1>
      <div class="button-group">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="showCreateLvStoreDialog" v-if="userStore.isAdmin">
          <el-icon><Plus /></el-icon>
          创建LV Store
        </el-button>
      </div>
    </div>

    <!-- LV Store 列表 -->
    <div class="page-card">
      <div class="tab-content">
        <div class="content-header">
          <h3>逻辑卷存储列表</h3>
          <el-input
            v-model="searchText"
            placeholder="搜索LV Store..."
            clearable
            style="width: 250px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <el-table :data="filteredLvStores" v-loading="loading" stripe @row-click="navigateToLvStore">
          <el-table-column prop="name" label="名称" min-width="150" />
          <el-table-column prop="base_bdev" label="基础BDEV" min-width="150" />
          <el-table-column prop="uuid" label="UUID" min-width="250" show-overflow-tooltip />
          <el-table-column prop="block_size" label="块大小" width="100">
            <template #default="{ row }">{{ row.block_size }} B</template>
          </el-table-column>
          <el-table-column label="集群大小" width="120">
            <template #default="{ row }">{{ formatBytes(row.cluster_size) }}</template>
          </el-table-column>
          <el-table-column label="总容量" width="120">
            <template #default="{ row }">{{ formatBytes(row.total_data_clusters * row.cluster_size) }}</template>
          </el-table-column>
          <el-table-column label="已用容量" width="120">
            <template #default="{ row }">
              <div>
                {{ formatBytes((row.total_data_clusters - row.free_clusters) * row.cluster_size) }}
                <el-progress
                  :percentage="getUsagePercentage(row)"
                  :color="getUsageColor(row)"
                  :stroke-width="4"
                  :show-text="false"
                  style="margin-top: 2px;"
                />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="LVol数量" width="100">
            <template #default="{ row }">
              <el-tag type="primary" size="small">{{ getLvolCount(row.name) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="button-group">
                <el-button size="small" @click.stop="navigateToLvStore(row)" title="管理LV Store">
                  <el-icon><Setting /></el-icon>
                  管理
                </el-button>
                <el-popconfirm
                  title="确定要删除这个LV Store吗？注意：这将删除所有包含的LVol！"
                  @confirm="deleteLvStore(row.uuid)"
                  v-if="userStore.isAdmin"
                >
                  <template #reference>
                    <el-button size="small" type="danger" @click.stop>
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 创建LV Store对话框 -->
    <el-dialog
      v-model="createLvStoreVisible"
      title="创建LV Store"
      width="600px"
    >
      <el-form
        ref="createLvStoreFormRef"
        :model="createLvStoreForm"
        :rules="createLvStoreRules"
        label-width="120px"
      >
        <el-form-item label="名称" prop="name">
          <el-input v-model="createLvStoreForm.name" placeholder="输入LV Store名称" />
        </el-form-item>
        <el-form-item label="基础BDEV" prop="bdev_name">
          <el-select v-model="createLvStoreForm.bdev_name" placeholder="选择BDEV" style="width: 100%">
            <el-option
              v-for="bdev in availableBdevs"
              :key="bdev.name"
              :label="`${bdev.name} (${formatBytes(bdev.block_size * bdev.num_blocks)})`"
              :value="bdev.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="集群大小(MB)" prop="cluster_sz">
          <el-input-number v-model="createLvStoreForm.cluster_sz" :min="1" :max="1024" :step="1" />
          <div class="form-help-text">
            集群大小以MB为单位，最小1MB。建议使用4MB或更大值以获得最佳性能
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createLvStoreVisible = false">取消</el-button>
          <el-button type="primary" @click="createLvStore" :loading="createLvStoreLoading">创建</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ApiService } from '@/services/api'
import { 
  Refresh, 
  Plus,
  Search,
  Setting, 
  Delete
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()

// 数据状态
const loading = ref(false)
const lvStores = ref([])
const allLvols = ref([])
const availableBdevs = ref([])

// 界面状态
const searchText = ref('')

// 对话框状态
const createLvStoreVisible = ref(false)

// 加载状态
const createLvStoreLoading = ref(false)

// 表单数据
const createLvStoreFormRef = ref()
const createLvStoreForm = ref({
  name: '',
  bdev_name: '',
  cluster_sz: 4
})

// 表单验证规则
const createLvStoreRules = {
  name: [{ required: true, message: '请输入LV Store名称', trigger: 'blur' }],
  bdev_name: [{ required: true, message: '请选择基础BDEV', trigger: 'change' }],
  cluster_sz: [{ required: true, message: '请输入集群大小', trigger: 'blur' }]
}

// 计算属性
const filteredLvStores = computed(() => {
  if (!searchText.value) return lvStores.value
  
  const search = searchText.value.toLowerCase()
  return lvStores.value.filter(store => 
    store.name.toLowerCase().includes(search) ||
    store.base_bdev.toLowerCase().includes(search) ||
    store.uuid.toLowerCase().includes(search)
  )
})

// 格式化字节大小
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取使用率百分比
const getUsagePercentage = (store) => {
  if (!store.total_data_clusters) return 0
  const used = store.total_data_clusters - store.free_clusters
  return Math.round((used / store.total_data_clusters) * 100)
}

// 获取使用率颜色
const getUsageColor = (store) => {
  const percentage = getUsagePercentage(store)
  if (percentage >= 90) return '#f56c6c'
  if (percentage >= 70) return '#e6a23c'
  return '#67c23a'
}

// 获取LVol数量
const getLvolCount = (storeName) => {
  return allLvols.value.filter(lvol => lvol.lvs_name === storeName).length
}

// 导航到LVStore详情
const navigateToLvStore = (store) => {
  router.push({
    name: 'lvstore-details',
    params: { 
      storeId: encodeURIComponent(store.uuid),
      storeName: encodeURIComponent(store.name)
    }
  })
}

// 数据加载
const loadLvStores = async () => {
  try {
    const response = await ApiService.lvstores.getAll()
    console.log('📦 LV Store数据:', response.data)
    lvStores.value = response.data || []
  } catch (error) {
    console.error('❌ 加载LV Store失败:', error)
    ElMessage.error('加载LV Store失败：' + error.message)
  }
}

const loadLvols = async () => {
  try {
    const response = await ApiService.lvols.getAll()
    console.log('📦 LVol数据:', response.data)
    allLvols.value = response.data || []
  } catch (error) {
    console.error('❌ 加载LVol失败:', error)
    ElMessage.error('加载LVol失败：' + error.message)
  }
}

const loadAvailableBdevs = async () => {
  try {
    const response = await ApiService.bdevs.getAll()
    console.log('💽 LVOL BDEV API完整响应:', response)
    console.log('💽 LVOL response.data:', response.data)
    
    // 修正axios响应结构
    const apiData = response.data
    let bdevs = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.bdevs)) {
      bdevs = apiData.data.bdevs
      console.log('💽 LVOL成功加载BDEV数据:', bdevs.length, '个BDEV')
    } else if (Array.isArray(apiData.bdevs)) {
      // 兼容中间格式
      bdevs = apiData.bdevs
      console.log('💽 LVOL使用中间格式加载BDEV数据')
    } else if (Array.isArray(apiData)) {
      // 兼容旧格式
      bdevs = apiData
      console.log('💽 LVOL使用兼容格式加载BDEV数据')
    } else {
      console.log('💽 LVOL无法解析BDEV数据, apiData:', apiData)
    }
    
    // 过滤掉已经被LV Store使用的BDEV
    const usedBdevs = new Set(lvStores.value.map(store => store.base_bdev))
    availableBdevs.value = bdevs.filter(bdev => 
      !usedBdevs.has(bdev.name) && 
      !bdev.name.includes('lvol') && // 排除LVol自身
      !bdev.name.includes('raid') && // 可选：排除RAID设备，如果需要的话删除这行
      bdev.block_size && bdev.num_blocks // 确保有有效的大小信息
    )
    
    console.log('💽 LVOL可用BDEV数量:', availableBdevs.value.length)
    console.log('💽 LVOL可用BDEV列表:', availableBdevs.value.map(b => b.name))
  } catch (error) {
    console.error('❌ 加载BDEV失败:', error)
    ElMessage.error('加载可用BDEV失败：' + error.message)
  }
}

const refreshData = async () => {
  loading.value = true
  try {
    await Promise.all([
      loadLvStores(),
      loadLvols(),
      loadAvailableBdevs()
    ])
  } finally {
    loading.value = false
  }
}

// LV Store 操作
const showCreateLvStoreDialog = async () => {
  await loadAvailableBdevs()
  if (availableBdevs.value.length === 0) {
    ElMessage.warning('没有可用的BDEV来创建LV Store')
    return
  }
  
  createLvStoreForm.value = {
    name: '',
    bdev_name: '',
    cluster_sz: 4
  }
  createLvStoreVisible.value = true
}

const createLvStore = async () => {
  if (!createLvStoreFormRef.value) return
  
  const valid = await createLvStoreFormRef.value.validate().catch(() => false)
  if (!valid) return

  createLvStoreLoading.value = true
  try {
    // 转换字段名以匹配后端API期望的格式
    const requestData = {
      lvs_name: createLvStoreForm.value.name,
      bdev_name: createLvStoreForm.value.bdev_name,
      cluster_sz: createLvStoreForm.value.cluster_sz * 1024 * 1024 // 转换MB为字节
    }
    
    await ApiService.lvstores.create(requestData)
    ElMessage.success('LV Store创建成功')
    createLvStoreVisible.value = false
    await refreshData()
  } catch (error) {
    console.error('❌ 创建LV Store失败:', error)
    ElMessage.error('创建LV Store失败：' + (error.response?.data?.message || error.message))
  } finally {
    createLvStoreLoading.value = false
  }
}

const deleteLvStore = async (storeName) => {
  // 检查是否有LVol
  const lvolCount = getLvolCount(storeName)
  if (lvolCount > 0) {
    ElMessage.warning(`无法删除LV Store "${storeName}"，因为它包含 ${lvolCount} 个LVol。请先删除所有LVol。`)
    return
  }

  try {
    // 需要使用UUID而不是名称来删除
    const store = lvStores.value.find(s => s.name === storeName)
    if (store) {
      await ApiService.lvstores.delete(store.uuid)
    } else {
      throw new Error('找不到指定的LV Store')
    }
    ElMessage.success('LV Store删除成功')
    await refreshData()
  } catch (error) {
    console.error('❌ 删除LV Store失败:', error)
    ElMessage.error('删除LV Store失败：' + (error.response?.data?.message || error.message))
  }
}

// 生命周期
onMounted(() => {
  refreshData()
})
</script>

<style scoped>
.lvol-management {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  color: #303133;
}

.button-group {
  display: flex;
  gap: 10px;
}

.page-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
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

.content-header h3 {
  margin: 0;
  color: #303133;
}

.form-help-text {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.button-group {
  display: flex;
  gap: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style> 