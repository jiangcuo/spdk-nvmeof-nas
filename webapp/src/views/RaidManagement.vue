 <template>
  <div class="raid-management">
    <div class="page-header">
      <h1 class="page-title">RAID管理</h1>
      <div class="button-group">
        <el-button @click="refreshRaids" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="showCreateDialog" v-if="userStore.isAdmin">
          <el-icon><Plus /></el-icon>
          创建RAID
        </el-button>
      </div>
    </div>

    <!-- RAID列表 -->
    <div class="page-card">
      <div class="card-header">
        <h3>RAID列表</h3>
        <div class="table-controls">
          <el-input
            v-model="searchText"
            placeholder="搜索RAID..."
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
        :data="filteredRaids"
        v-loading="loading"
        stripe
        class="raid-table"
      >
        <el-table-column prop="name" label="名称" min-width="150">
          <template #default="{ row }">
            <div class="raid-name">
              <el-icon class="raid-icon" :color="getRaidLevelColor(row.raid_level)">
                <Grid />
              </el-icon>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="raid_level" label="RAID级别" width="100">
          <template #default="{ row }">
            <el-tag :type="getRaidLevelTag(row.raid_level)" size="small">
              {{ getRaidLevelDisplay(row.raid_level) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="state" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getRaidStateTag(row.state)" size="small">
              {{ getRaidStateText(row.state) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="成员数量" width="100">
          <template #default="{ row }">
            {{ row.num_base_bdevs || 0 }}
          </template>
        </el-table-column>

        <el-table-column label="条带大小" width="100">
          <template #default="{ row }">
            {{ formatBytes((row.strip_size_kb || 0) * 1024) }}
          </template>
        </el-table-column>

        <el-table-column label="总容量" width="120">
          <template #default="{ row }">
            {{ formatBytes(getRaidSize(row)) }}
          </template>
        </el-table-column>

        <el-table-column label="成员设备" min-width="200">
          <template #default="{ row }">
            <div class="base-bdevs">
              <el-tag 
                v-for="bdev in row.base_bdevs_list" 
                :key="bdev.name"
                size="small" 
                class="mr-1"
                :type="bdev.is_configured ? 'success' : 'warning'"
              >
                {{ bdev.name }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="button-group">
              <el-button size="small" @click="showRaidDetails(row)">
                <el-icon><View /></el-icon>
              </el-button>
              <el-popconfirm
                title="确定要删除这个RAID吗？"
                @confirm="deleteRaid(row.name)"
                v-if="userStore.isAdmin"
              >
                <template #reference>
                  <el-button size="small" type="danger" :disabled="row.state !== 'online'">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 创建RAID对话框 -->
    <el-dialog
      v-model="createVisible"
      title="创建RAID"
      width="700px"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="120px"
      >
        <el-form-item label="RAID名称" prop="name">
          <el-input v-model="createForm.name" placeholder="输入RAID名称" />
        </el-form-item>

        <el-form-item label="RAID级别" prop="raid_level">
          <el-select v-model="createForm.raid_level" placeholder="请选择RAID级别" style="width: 100%">
            <el-option label="RAID 0 (条带化)" value="raid0" />
            <el-option label="RAID 1 (镜像)" value="raid1" />
            <el-option label="RAID 5 (带奇偶校验)" value="raid5f" />
          </el-select>
        </el-form-item>

        <el-form-item label="条带大小(KB)" prop="strip_size">
          <el-input-number 
            v-model="createForm.strip_size" 
            :min="4" 
            :max="1024" 
            :step="4" 
            :disabled="createForm.raid_level === 'raid1'"
            :placeholder="createForm.raid_level === 'raid1' ? 'RAID1不支持条带设置' : '输入条带大小'"
          />
          <div class="form-help-text" v-if="createForm.raid_level === 'raid1'">
            RAID1使用镜像模式，不需要设置条带大小
          </div>
        </el-form-item>

        <el-form-item label="成员BDEV" prop="base_bdevs" required>
          <div class="bdev-selection">
            <div class="selected-bdevs">
              <el-tag
                v-for="bdev in createForm.base_bdevs"
                :key="bdev"
                closable
                @close="removeBdev(bdev)"
                class="mr-2 mb-2"
              >
                {{ bdev }}
              </el-tag>
            </div>
            <el-select
              v-model="selectedBdev"
              placeholder="选择BDEV"
              style="width: 100%"
              @change="addBdev"
            >
              <el-option
                v-for="bdev in availableBdevs"
                :key="bdev.name"
                :label="`${bdev.name} (${formatBytes(bdev.block_size * bdev.num_blocks)})`"
                :value="bdev.name"
                :disabled="createForm.base_bdevs.includes(bdev.name)"
              />
            </el-select>
          </div>
          <div class="form-help-text">
            <span v-if="createForm.raid_level">
              {{ getRaidRequirement(createForm.raid_level) }}
            </span>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createVisible = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="createRaid" 
            :loading="createLoading"
            :disabled="!canCreateRaid"
          >
            创建
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- RAID详情对话框 -->
    <el-dialog
      v-model="detailsVisible"
      :title="`RAID详情 - ${selectedRaid?.name}`"
      width="800px"
    >
      <div v-if="selectedRaid" class="raid-details">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">{{ selectedRaid.name }}</el-descriptions-item>
          <el-descriptions-item label="UUID">{{ selectedRaid.uuid }}</el-descriptions-item>
          <el-descriptions-item label="RAID级别">{{ getRaidLevelDisplay(selectedRaid.raid_level) }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getRaidStateTag(selectedRaid.state)">
              {{ getRaidStateText(selectedRaid.state) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="条带大小">{{ formatBytes((selectedRaid.strip_size_kb || 0) * 1024) }}</el-descriptions-item>
          <el-descriptions-item label="成员数量">{{ selectedRaid.num_base_bdevs || 0 }}</el-descriptions-item>
          <el-descriptions-item label="总容量">{{ formatBytes(getRaidSize(selectedRaid)) }}</el-descriptions-item>
          <el-descriptions-item label="超级块">{{ selectedRaid.superblock ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="发现的成员">{{ selectedRaid.num_base_bdevs_discovered || 0 }}</el-descriptions-item>
          <el-descriptions-item label="在线成员">{{ selectedRaid.num_base_bdevs_operational || 0 }}</el-descriptions-item>
        </el-descriptions>

        <!-- 成员BDEV列表 -->
        <div class="mt-4">
          <h4>成员BDEV</h4>
          <el-table :data="selectedRaid.base_bdevs_list || []" size="small">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="uuid" label="UUID" />
            <el-table-column label="大小" width="120">
              <template #default="{ row }">
                {{ formatBytes(row.data_size || 0) }}
              </template>
            </el-table-column>
            <el-table-column label="配置状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.is_configured ? 'success' : 'warning'" size="small">
                  {{ row.is_configured ? '已配置' : '未配置' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="数据偏移" width="100">
              <template #default="{ row }">
                {{ formatBytes(row.data_offset || 0) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { ApiService } from '@/services/api'
import { 
  Refresh, 
  Plus,
  Search,
  Grid,
  View, 
  Delete
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const userStore = useUserStore()

// 数据状态
const loading = ref(false)
const createLoading = ref(false)
const raids = ref([])
const availableBdevs = ref([])
const selectedRaid = ref(null)
const selectedBdev = ref('')

// 对话框状态
const createVisible = ref(false)
const detailsVisible = ref(false)

// 表单数据
const createFormRef = ref()
const createForm = ref({
  name: '',
  raid_level: '',
  strip_size: 64,
  base_bdevs: []
})

// 表单验证规则
const createRules = {
  name: [{ required: true, message: '请输入RAID名称', trigger: 'blur' }],
  raid_level: [{ required: true, message: '请选择RAID级别', trigger: 'change' }],
  strip_size: [{ required: true, message: '请输入条带大小', trigger: 'blur' }]
}

// 筛选状态
const searchText = ref('')

// 计算属性
const filteredRaids = computed(() => {
  if (!searchText.value) return raids.value
  
  const search = searchText.value.toLowerCase()
  return raids.value.filter(raid => 
    raid.name.toLowerCase().includes(search) ||
    raid.uuid?.toLowerCase().includes(search)
  )
})

const canCreateRaid = computed(() => {
  const { raid_level, base_bdevs } = createForm.value
  if (!raid_level || !base_bdevs.length) return false
  
  switch (raid_level) {
    case 'raid0': return base_bdevs.length >= 1
    case 'raid1': return base_bdevs.length >= 2
    case 'raid5f': return base_bdevs.length >= 3
    default: return false
  }
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

const getRaidLevelColor = (level) => {
  const colors = {
    '0': '#E6A23C',
    '1': '#67C23A',
    '5': '#409EFF'
  }
  return colors[level] || '#909399'
}

const getRaidLevelTag = (level) => {
  const tags = {
    'raid0': 'warning',
    'raid1': 'success', 
    'raid5f': ''
  }
  return tags[level] || 'info'
}

const getRaidStateTag = (state) => {
  const tags = {
    'online': 'success',
    'degraded': 'warning',
    'failed': 'danger',
    'rebuilding': 'info'
  }
  return tags[state] || 'info'
}

const getRaidStateText = (state) => {
  const texts = {
    'online': '在线',
    'degraded': '降级',
    'failed': '失败',
    'rebuilding': '重建中'
  }
  return texts[state] || state
}

const getRaidRequirement = (level) => {
  const requirements = {
    'raid0': '需要至少1个BDEV（支持条带化，提升性能）',
    'raid1': '需要至少2个BDEV（镜像模式，不需要条带设置）', 
    'raid5f': '需要至少3个BDEV（带奇偶校验，需要设置条带大小）'
  }
  return requirements[level] || ''
}

const getRaidLevelDisplay = (level) => {
  const displays = {
    'raid0': 'RAID 0 (条带化)',
    'raid1': 'RAID 1 (镜像)',
    'raid5f': 'RAID 5 (带奇偶校验)'
  }
  return displays[level] || level
}

const getRaidSize = (raid) => {
  // 直接使用BDEV级别的block_size和num_blocks计算容量
  if (raid.block_size && raid.num_blocks) {
    return raid.block_size * raid.num_blocks
  }
  return 0
}

// 数据加载
const loadRaids = async () => {
  try {
    const response = await ApiService.raids.getAll()
    // 使用spdk_raids数据作为主要数据源，这些数据已经包含了正确的block_size和num_blocks
    if (response.data.spdk_raids && Array.isArray(response.data.spdk_raids)) {
      raids.value = response.data.spdk_raids
    } else {
      raids.value = []
    }
  } catch (error) {
    console.error('加载RAID列表失败:', error)
    raids.value = []
    ElMessage.error('加载RAID列表失败: ' + error.message)
  }
}

const loadAvailableBdevs = async () => {
  try {
    const response = await ApiService.bdevs.getAll()
    console.log('RAID可用BDEV API响应:', response)
    console.log('RAID response.data:', response.data)
    
    // 修正axios响应结构
    const apiData = response.data
    let bdevs = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.bdevs)) {
      bdevs = apiData.data.bdevs
      console.log('RAID成功加载BDEV数据:', bdevs.length, '个BDEV')
    } else if (Array.isArray(apiData.bdevs)) {
      // 兼容中间格式
      bdevs = apiData.bdevs
      console.log('RAID使用中间格式加载BDEV数据')
    } else {
      // 兼容旧格式
      bdevs = Array.isArray(apiData) ? apiData : []
      console.log('RAID使用兼容格式加载BDEV数据')
    }
    
    // 只显示未被使用的BDEV
    availableBdevs.value = bdevs.filter(bdev => !bdev.claimed)
    console.log('RAID可用BDEV数量:', availableBdevs.value.length)
  } catch (error) {
    console.error('加载可用BDEV失败:', error)
    availableBdevs.value = []
  }
}

const refreshRaids = async () => {
  loading.value = true
  try {
    await loadRaids()
    ElMessage.success('RAID列表已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  } finally {
    loading.value = false
  }
}

// RAID操作
const showCreateDialog = async () => {
  createForm.value = {
    name: '',
    raid_level: '',
    strip_size: 64,
    base_bdevs: []
  }
  await loadAvailableBdevs()
  createVisible.value = true
}

const addBdev = (bdevName) => {
  if (bdevName && !createForm.value.base_bdevs.includes(bdevName)) {
    createForm.value.base_bdevs.push(bdevName)
  }
  selectedBdev.value = ''
}

const removeBdev = (bdevName) => {
  const index = createForm.value.base_bdevs.indexOf(bdevName)
  if (index > -1) {
    createForm.value.base_bdevs.splice(index, 1)
  }
}

const createRaid = async () => {
  try {
    await createFormRef.value.validate()
    createLoading.value = true
    
    // 为RAID1准备特殊的数据
    const raidData = {
      name: createForm.value.name,
      raid_level: createForm.value.raid_level,
      base_bdevs: createForm.value.base_bdevs
    }
    
    // 只有非RAID1的情况下才添加strip_size
    if (createForm.value.raid_level !== 'raid1' && createForm.value.strip_size) {
      raidData.strip_size = createForm.value.strip_size
    }
    
    await ApiService.raids.create(raidData)
    ElMessage.success('RAID创建成功')
    createVisible.value = false
    await refreshRaids()
  } catch (error) {
    console.error('创建RAID失败:', error)
    ElMessage.error('创建失败: ' + error.message)
  } finally {
    createLoading.value = false
  }
}

const deleteRaid = async (name) => {
  try {
    // 使用name路由删除RAID
    await ApiService.request('delete', `/raids/name/${encodeURIComponent(name)}`)
    ElMessage.success('RAID删除成功')
    await refreshRaids()
  } catch (error) {
    ElMessage.error('删除失败: ' + error.message)
  }
}

const showRaidDetails = (raid) => {
  selectedRaid.value = raid
  detailsVisible.value = true
}

// 组件挂载
onMounted(async () => {
  await refreshRaids()
  console.log('🛡️ RAID管理页面已加载')
})
</script>

<style scoped>
.raid-management {
  padding: 0;
}

.table-controls {
  display: flex;
  align-items: center;
}

.raid-name {
  display: flex;
  align-items: center;
}

.raid-icon {
  margin-right: 8px;
}

.bdev-selection {
  width: 100%;
}

.selected-bdevs {
  margin-bottom: 12px;
  min-height: 32px;
}

.mr-2 {
  margin-right: 8px;
}

.mb-2 {
  margin-bottom: 8px;
}

.form-help-text {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}

.raid-details {
  max-height: 70vh;
  overflow-y: auto;
}

.mt-4 {
  margin-top: 16px;
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