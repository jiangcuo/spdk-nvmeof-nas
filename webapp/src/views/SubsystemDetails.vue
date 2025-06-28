<template>
  <div class="subsystem-details">
    <!-- 面包屑导航 -->
    <el-breadcrumb class="breadcrumb" separator="/">
      <el-breadcrumb-item :to="{ name: 'subsystems' }">子系统管理</el-breadcrumb-item>
      <el-breadcrumb-item>{{ decodedNqn }}</el-breadcrumb-item>
    </el-breadcrumb>

    <!-- 子系统信息卡片 -->
    <el-card class="subsystem-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <h3>子系统详情</h3>
          <div class="actions">
            <el-button type="danger" @click="deleteSubsystem" v-if="userStore.isAdmin">
              <el-icon><Delete /></el-icon>
              删除子系统
            </el-button>
          </div>
        </div>
      </template>
      
      <el-descriptions :column="2" border v-if="subsystemData.nqn">
        <el-descriptions-item label="NQN">{{ subsystemData.nqn }}</el-descriptions-item>
        <el-descriptions-item label="类型">
          <el-tag :type="subsystemData.subtype === 'NVMe' ? 'success' : 'info'">
            {{ subsystemData.subtype }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="允许任意主机">
          <div class="allow-any-host-control">
            <el-switch 
              v-model="allowAnyHost" 
              @change="handleAllowAnyHostChange"
              :disabled="!userStore.isAdmin || loading"
              active-text="是" 
              inactive-text="否"
            />
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="最大命名空间">{{ subsystemData.max_namespaces || 'N/A' }}</el-descriptions-item>
        <el-descriptions-item label="序列号">{{ subsystemData.serial_number || 'N/A' }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ subsystemData.model_number || 'N/A' }}</el-descriptions-item>
      </el-descriptions>
      
      <div v-else class="loading-placeholder">
        <el-skeleton :rows="4" animated />
      </div>
    </el-card>

    <!-- 管理标签页 -->
    <el-card class="management-card" shadow="hover">
      <el-tabs v-model="activeTab" type="border-card">
        
        <!-- 监听器管理 -->
        <el-tab-pane label="监听器" name="listeners">
          <div class="tab-content">
            <div class="content-header">
              <h4>监听器列表</h4>
              <el-button type="primary" @click="showCreateListenerDialog" v-if="userStore.isAdmin">
                <el-icon><Plus /></el-icon>
                添加监听器
              </el-button>
            </div>

            <el-table :data="listeners" v-loading="loading" stripe>
              <el-table-column prop="trtype" label="传输类型" width="120">
                <template #default="{ row }">
                  <el-tag type="success" size="small">{{ row.trtype }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="adrfam" label="地址族" width="100">
                <template #default="{ row }">
                  <el-tag type="info" size="small">{{ row.adrfam }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="traddr" label="监听地址" min-width="150" />
              <el-table-column prop="trsvcid" label="端口" width="100" />
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-popconfirm
                    title="确定要删除这个监听器吗？"
                    @confirm="deleteListener(row)"
                    v-if="userStore.isAdmin"
                  >
                    <template #reference>
                      <el-button size="small" type="danger">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 主机管理 -->
        <el-tab-pane label="主机" name="hosts">
          <div class="tab-content">
            <div class="content-header">
              <h4>已授权主机</h4>
              <el-button type="primary" @click="showAddHostDialog" v-if="userStore.isAdmin">
                <el-icon><Plus /></el-icon>
                添加主机
              </el-button>
            </div>

            <el-table :data="hosts" v-loading="loading" stripe>
              <el-table-column prop="nqn" label="主机NQN" min-width="300" show-overflow-tooltip />
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-popconfirm
                    title="确定要移除这个主机吗？"
                    @confirm="removeHost(row.nqn)"
                    v-if="userStore.isAdmin"
                  >
                    <template #reference>
                      <el-button size="small" type="warning">
                        <el-icon><Connection /></el-icon>
                      </el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 命名空间管理 -->
        <el-tab-pane label="命名空间" name="namespaces">
          <div class="tab-content">
            <div class="content-header">
              <h4>命名空间列表</h4>
              <el-button type="primary" @click="showAddNamespaceDialog" v-if="userStore.isAdmin">
                <el-icon><Plus /></el-icon>
                添加命名空间
              </el-button>
            </div>

            <el-table :data="namespaces" v-loading="loading" stripe>
              <el-table-column prop="nsid" label="命名空间ID" width="120" />
              <el-table-column prop="bdev_name" label="BDEV名称" min-width="150" />
              <el-table-column prop="name" label="名称" min-width="150" />
              <el-table-column prop="uuid" label="UUID" min-width="250" show-overflow-tooltip />
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-popconfirm
                    title="确定要删除这个命名空间吗？"
                    @confirm="removeNamespace(row.nsid)"
                    v-if="userStore.isAdmin"
                  >
                    <template #reference>
                      <el-button size="small" type="danger">
                        <el-icon><Delete /></el-icon>
                      </el-button>
                    </template>
                  </el-popconfirm>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 在线客户端监控 -->
        <el-tab-pane label="在线客户端" name="clients">
          <div class="tab-content">
            <div class="content-header">
              <h4>在线控制器和队列对</h4>
              <el-button type="primary" @click="refreshClients">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>

            <el-row :gutter="16">
              <!-- 控制器信息 -->
              <el-col :span="12">
                <h5>活跃控制器 ({{ controllers.length }})</h5>
                <el-table :data="controllers" v-loading="clientsLoading" size="small" stripe>
                  <el-table-column prop="cntlid" label="控制器ID" width="100" />
                  <el-table-column prop="hostnqn" label="主机NQN" min-width="200" show-overflow-tooltip />
                  <el-table-column prop="hostid" label="主机ID" width="120" show-overflow-tooltip />
                </el-table>
              </el-col>

              <!-- 队列对信息 -->
              <el-col :span="12">
                <h5>活跃队列对 ({{ qpairs.length }})</h5>
                <el-table :data="qpairs" v-loading="clientsLoading" size="small" stripe>
                  <el-table-column prop="cntlid" label="控制器ID" width="100" />
                  <el-table-column prop="qid" label="队列ID" width="80" />
                  <el-table-column prop="state" label="状态" width="100">
                    <template #default="{ row }">
                      <el-tag :type="row.state === 'active' ? 'success' : 'warning'" size="small">
                        {{ row.state }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="transport" label="传输" width="100" />
                </el-table>
              </el-col>
            </el-row>

            <el-empty v-if="controllers.length === 0 && qpairs.length === 0 && !clientsLoading" 
              description="暂无在线客户端" />
          </div>
        </el-tab-pane>

      </el-tabs>
    </el-card>

    <!-- 添加监听器对话框 -->
    <el-dialog v-model="showListenerDialog" title="添加监听器" width="500px">
      <el-form :model="listenerForm" :rules="listenerRules" ref="listenerFormRef" label-width="100px">
        <el-form-item label="传输类型" prop="trtype">
          <el-select v-model="listenerForm.trtype" placeholder="选择传输类型">
            <el-option label="TCP" value="TCP" />
            <el-option label="RDMA" value="RDMA" />
          </el-select>
        </el-form-item>
        <el-form-item label="地址族" prop="adrfam">
          <el-select v-model="listenerForm.adrfam" placeholder="选择地址族">
            <el-option label="IPv4" value="ipv4" />
            <el-option label="IPv6" value="ipv6" />
          </el-select>
        </el-form-item>
        <el-form-item label="监听地址" prop="traddr">
          <el-input v-model="listenerForm.traddr" placeholder="例如: 10.13.16.50" />
        </el-form-item>
        <el-form-item label="端口" prop="trsvcid">
          <el-input v-model="listenerForm.trsvcid" placeholder="例如: 4420" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showListenerDialog = false">取消</el-button>
        <el-button type="primary" @click="createListener">添加</el-button>
      </template>
    </el-dialog>

    <!-- 添加主机对话框 -->
    <el-dialog v-model="showHostDialog" title="添加主机" width="600px">
      <el-form :model="hostForm" :rules="hostRules" ref="hostFormRef" label-width="120px">
        <!-- 添加模式选择 -->
        <el-form-item label="添加方式">
          <el-radio-group v-model="hostAddMode" @change="onHostAddModeChange">
            <el-radio value="select">从数据库选择</el-radio>
            <el-radio value="manual">手动输入</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 从数据库选择主机 -->
        <template v-if="hostAddMode === 'select'">
          <el-form-item label="选择主机" prop="selectedHostId">
            <el-select 
              v-model="hostForm.selectedHostId" 
              placeholder="选择主机" 
              filterable
              style="width: 100%"
              @change="onHostSelect"
            >
              <el-option 
                v-for="host in availableHosts" 
                :key="host.id" 
                :label="`${host.name} (${host.nqn})`" 
                :value="host.id"
                :disabled="!host.is_active"
              >
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span>{{ host.name }}</span>
                  <el-tag :type="host.is_active ? 'success' : 'danger'" size="small">
                    {{ host.is_active ? '活动' : '禁用' }}
                  </el-tag>
                </div>
                <div style="font-size: 12px; color: #999; margin-top: 2px;">
                  {{ host.nqn }}
                </div>
              </el-option>
            </el-select>
          </el-form-item>
          
          <!-- 显示选中主机的详细信息 -->
          <el-form-item v-if="selectedHostInfo" label="主机信息">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item label="名称">{{ selectedHostInfo.name }}</el-descriptions-item>
              <el-descriptions-item label="NQN">{{ selectedHostInfo.nqn }}</el-descriptions-item>
              <el-descriptions-item label="备注" v-if="selectedHostInfo.description">
                {{ selectedHostInfo.description }}
              </el-descriptions-item>
            </el-descriptions>
          </el-form-item>
        </template>

        <!-- 手动输入主机NQN -->
        <template v-if="hostAddMode === 'manual'">
          <el-form-item label="主机NQN" prop="nqn">
            <el-input 
              v-model="hostForm.nqn" 
              placeholder="例如: nqn.2014-08.org.nvmexpress:uuid:..." 
              clearable
            />
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              格式参考: nqn.yyyy-mm.reverse-domain:string
            </div>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="showHostDialog = false">取消</el-button>
        <el-button type="primary" @click="addHost" :disabled="!isHostFormValid">添加</el-button>
      </template>
    </el-dialog>

    <!-- 添加命名空间对话框 -->
    <el-dialog v-model="showNamespaceDialog" title="添加命名空间" width="800px">
      <el-form :model="namespaceForm" :rules="namespaceRules" ref="namespaceFormRef" label-width="120px">
        <el-form-item label="选择BDEV" prop="bdev_name">
          <div class="bdev-selection">
            <el-button type="primary" @click="showBdevSelector" icon="Plus">
              选择BDEV
            </el-button>
            <span v-if="namespaceForm.bdev_name" class="selected-bdev">
              已选择: {{ selectedBdevInfo ? getBdevDisplayName(selectedBdevInfo) : namespaceForm.bdev_name }}
            </span>
          </div>
        </el-form-item>
        
        <!-- 显示选中BDEV的详细信息 -->
        <el-form-item v-if="selectedBdevInfo" label="BDEV信息">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="名称">{{ getBdevDisplayName(selectedBdevInfo) }}</el-descriptions-item>
            <el-descriptions-item label="UUID">{{ selectedBdevInfo.uuid || 'N/A' }}</el-descriptions-item>
            <el-descriptions-item label="大小">{{ formatSize(selectedBdevInfo.num_blocks * selectedBdevInfo.block_size) }}</el-descriptions-item>
            <el-descriptions-item label="类型">{{ selectedBdevInfo.product_name || selectedBdevInfo.driver_specific?.type || 'Unknown' }}</el-descriptions-item>
            <el-descriptions-item label="块大小">{{ selectedBdevInfo.block_size }} bytes</el-descriptions-item>
            <el-descriptions-item label="块数量">{{ selectedBdevInfo.num_blocks }}</el-descriptions-item>
          </el-descriptions>
        </el-form-item>

        <el-form-item label="命名空间ID">
          <el-input-number 
            v-model="namespaceForm.nsid" 
            :min="1" 
            placeholder="留空自动分配" 
            clearable
          />
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            留空将自动分配下一个可用ID
          </div>
        </el-form-item>
        
        <el-form-item label="UUID">
          <el-input 
            v-model="namespaceForm.uuid" 
            placeholder="留空自动生成" 
            clearable
          />
          <div style="font-size: 12px; color: #666; margin-top: 4px;">
            留空将自动生成UUID
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNamespaceDialog = false">取消</el-button>
        <el-button type="primary" @click="addNamespace" :disabled="!namespaceForm.bdev_name">
          添加
        </el-button>
      </template>
    </el-dialog>

    <!-- BDEV选择器对话框 -->
    <el-dialog v-model="showBdevSelectorDialog" title="选择BDEV" width="900px">
      <div class="bdev-selector">
        <!-- 搜索和筛选 -->
        <div class="selector-header">
          <el-row :gutter="16" align="middle">
            <el-col :span="8">
              <el-input
                v-model="bdevSearch"
                placeholder="搜索BDEV名称..."
                clearable
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-select v-model="bdevTypeFilter" placeholder="按类型筛选" clearable>
                <el-option label="所有类型" value="" />
                <el-option 
                  v-for="type in availableBdevTypes" 
                  :key="type" 
                  :label="type" 
                  :value="type" 
                />
              </el-select>
            </el-col>
            <el-col :span="4">
              <el-tag type="info">
                可用: {{ filteredBdevs.length }}
              </el-tag>
            </el-col>
          </el-row>
        </div>

        <!-- BDEV列表 -->
        <el-table 
          :data="filteredBdevs" 
          v-loading="bdevLoading"
          height="400"
          @row-click="selectBdev"
          highlight-current-row
          stripe
        >
          <el-table-column type="selection" width="55" />
          <el-table-column label="名称" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              {{ getBdevDisplayName(row) }}
            </template>
          </el-table-column>
          <el-table-column label="大小" width="120">
            <template #default="{ row }">
              {{ formatSize(row.num_blocks * row.block_size) }}
            </template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-tag size="small" type="primary">
                {{ row.product_name || row.driver_specific?.type || 'Unknown' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="uuid" label="UUID" min-width="200" show-overflow-tooltip />
          <el-table-column label="块大小" width="100">
            <template #default="{ row }">
              {{ row.block_size }}B
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button 
                size="small" 
                type="primary" 
                @click.stop="selectBdev(row)"
              >
                选择
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      
      <template #footer>
        <el-button @click="showBdevSelectorDialog = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bdev-selection {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-bdev {
  color: #409eff;
  font-weight: 500;
}

.bdev-selector {
  padding: 0;
}

.selector-header {
  margin-bottom: 16px;
  padding: 16px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.subsystem-details {
  padding: 20px;
}

.breadcrumb {
  margin-bottom: 20px;
}

.subsystem-card {
  margin-bottom: 20px;
}

.management-card {
  border-radius: 8px;
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

.tab-content {
  padding: 0;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.content-header h4,
.content-header h5 {
  margin: 0;
  color: #606266;
}

.allow-any-host-control {
  display: flex;
  align-items: center;
}

.loading-placeholder {
  min-height: 120px;
}

.actions {
  display: flex;
  gap: 8px;
}
</style>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ApiService } from '@/services/api'
import { 
  Delete,
  Plus,
  Connection,
  Refresh,
  Search
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 获取路由参数
const subsystemNqn = ref(route.params.nqn)
const decodedNqn = computed(() => {
  try {
    // 使用Base64解码，然后进行URL解码
    const decodedBase64 = atob(subsystemNqn.value)
    return decodeURIComponent(decodedBase64)
  } catch (error) {
    console.warn('Base64解码失败，尝试直接URL解码:', error)
    try {
      // 兼容旧的编码方式
      return decodeURIComponent(subsystemNqn.value.replace(/%27/g, "'"))
    } catch (decodeError) {
      console.error('URL解码也失败:', decodeError)
      return subsystemNqn.value
    }
  }
})

// 数据状态
const loading = ref(false)
const clientsLoading = ref(false)
const subsystemData = ref({})
const listeners = ref([])
const hosts = ref([])
const namespaces = ref([])
const controllers = ref([])
const qpairs = ref([])
const availableBdevs = ref([])
const availableHosts = ref([])

// 界面状态
const activeTab = ref('listeners')
const allowAnyHost = ref(false)

// 主机添加相关状态
const hostAddMode = ref('select')
const selectedHostInfo = ref(null)

// 对话框状态
const showListenerDialog = ref(false)
const showHostDialog = ref(false)
const showNamespaceDialog = ref(false)
const showBdevSelectorDialog = ref(false)

// BDEV选择相关状态
const selectedBdevInfo = ref(null)
const bdevSearch = ref('')
const bdevTypeFilter = ref('')
const bdevLoading = ref(false)

// 表单数据
const listenerForm = ref({
  trtype: 'TCP',
  adrfam: 'ipv4',
  traddr: '',
  trsvcid: ''
})

const hostForm = ref({
  nqn: '',
  selectedHostId: null
})

const namespaceForm = ref({
  bdev_name: '',
  nsid: null,
  uuid: ''
})

// 表单验证规则
const listenerRules = {
  trtype: [{ required: true, message: '请选择传输类型', trigger: 'change' }],
  adrfam: [{ required: true, message: '请选择地址族', trigger: 'change' }],
  traddr: [{ required: true, message: '请输入监听地址', trigger: 'blur' }],
  trsvcid: [{ required: true, message: '请输入端口', trigger: 'blur' }]
}

const hostRules = {
  nqn: [{ required: true, message: '请输入主机NQN', trigger: 'blur' }],
  selectedHostId: [{ required: true, message: '请选择主机', trigger: 'change' }]
}

const namespaceRules = {
  bdev_name: [{ required: true, message: '请选择BDEV', trigger: 'change' }]
}

// 计算属性
const isHostFormValid = computed(() => {
  if (hostAddMode.value === 'select') {
    return !!hostForm.value.selectedHostId
  } else {
    return !!hostForm.value.nqn && hostForm.value.nqn.trim().length > 0
  }
})

const filteredBdevs = computed(() => {
  let filtered = availableBdevs.value.filter(bdev => {
    // Filter out BDEVs already used in namespaces
    const isUsed = namespaces.value.some(ns => ns.bdev_name === bdev.name)
    return !isUsed
  })

  // Apply search filter
  if (bdevSearch.value) {
    const search = bdevSearch.value.toLowerCase()
    filtered = filtered.filter(bdev => 
      bdev.name.toLowerCase().includes(search) ||
      (bdev.uuid && bdev.uuid.toLowerCase().includes(search))
    )
  }

  // Apply type filter
  if (bdevTypeFilter.value) {
    filtered = filtered.filter(bdev => {
      const type = bdev.product_name || bdev.driver_specific?.type || 'Unknown'
      return type === bdevTypeFilter.value
    })
  }

  return filtered
})

const availableBdevTypes = computed(() => {
  const types = new Set()
  availableBdevs.value.forEach(bdev => {
    const type = bdev.product_name || bdev.driver_specific?.type || 'Unknown'
    types.add(type)
  })
  return Array.from(types).sort()
})

// 对话框方法
const showCreateListenerDialog = () => {
  showListenerDialog.value = true
}

const showAddHostDialog = async () => {
  await loadAvailableHosts()
  hostAddMode.value = 'select'
  selectedHostInfo.value = null
  hostForm.value = { nqn: '', selectedHostId: null }
  showHostDialog.value = true
}

const showAddNamespaceDialog = async () => {
  await loadAvailableBdevs()
  selectedBdevInfo.value = null
  namespaceForm.value = { bdev_name: '', nsid: null, uuid: '' }
  showNamespaceDialog.value = true
}

// 工具函数
const formatSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 获取BDEV显示名称，优先显示别名
const getBdevDisplayName = (bdev) => {
  // For Logical Volume type BDEVs, prefer alias over name (UUID)
  if (bdev.product_name === 'Logical Volume' && bdev.aliases && bdev.aliases.length > 0) {
    return bdev.aliases[0]
  }
  // For other types, use the regular name
  return bdev.name
}

// BDEV选择相关方法
const showBdevSelector = async () => {
  bdevLoading.value = true
  await loadAvailableBdevs()
  bdevLoading.value = false
  bdevSearch.value = ''
  bdevTypeFilter.value = ''
  showBdevSelectorDialog.value = true
}

const selectBdev = (bdev) => {
  selectedBdevInfo.value = bdev
  namespaceForm.value.bdev_name = bdev.name
  showBdevSelectorDialog.value = false
}

const handleAllowAnyHostChange = async () => {
  try {
    await ApiService.nvmeof.setAllowAnyHost(decodedNqn.value, allowAnyHost.value)
    ElMessage.success('允许任意主机设置成功')
    await loadSubsystemData()
  } catch (error) {
    // 恢复原来的值
    allowAnyHost.value = !allowAnyHost.value
    ElMessage.error('设置失败: ' + (error.response?.data?.message || error.message))
  }
}

// 数据加载
const loadSubsystemData = async () => {
  try {
    const response = await ApiService.nvmeof.getSubsystem(decodedNqn.value)
    console.log('🔧 子系统详情原始数据:', response.data)
    
    // 根据SPDK实际返回格式处理数据
    if (response.data.subsystem) {
      // SPDK返回的标准格式: {subsystem: {...}, namespaces: [...]}
      subsystemData.value = response.data.subsystem
      
      // 从子系统数据中提取各部分信息
      listeners.value = subsystemData.value.listen_addresses || []
      hosts.value = subsystemData.value.hosts || []
      namespaces.value = subsystemData.value.namespaces || []
    } else if (response.data.nqn) {
      // 如果直接返回子系统对象
      subsystemData.value = response.data
      listeners.value = subsystemData.value.listen_addresses || []
      hosts.value = subsystemData.value.hosts || []
      namespaces.value = subsystemData.value.namespaces || []
    } else {
      console.warn('未知的子系统数据格式:', response.data)
      ElMessage.warning('子系统数据格式异常')
    }
    
    // 更新allowAnyHost状态
    allowAnyHost.value = subsystemData.value.allow_any_host || false
    
    console.log('🔧 处理后的子系统数据:', {
      subsystem: subsystemData.value,
      listeners: listeners.value,
      hosts: hosts.value,
      namespaces: namespaces.value
    })
  } catch (error) {
    console.error('加载子系统数据失败:', error)
    ElMessage.error('加载子系统数据失败: ' + (error.response?.data?.message || error.message))
  }
}

// 删除操作
const deleteListener = async (listener) => {
  try {
    await ApiService.nvmeof.deleteSubsystemListener(
      decodedNqn.value, 
      listener.trtype, 
      listener.traddr, 
      listener.trsvcid
    )
    ElMessage.success('监听器删除成功')
    await loadSubsystemData()
  } catch (error) {
    ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
  }
}

const removeHost = async (hostNqn) => {
  try {
    await ApiService.nvmeof.removeSubsystemHost(decodedNqn.value, hostNqn)
    ElMessage.success('主机移除成功')
    await loadSubsystemData()
  } catch (error) {
    ElMessage.error('移除失败: ' + (error.response?.data?.message || error.message))
  }
}

const removeNamespace = async (nsid) => {
  try {
    await ApiService.nvmeof.removeSubsystemNamespace(decodedNqn.value, nsid)
    ElMessage.success('命名空间删除成功')
    await loadSubsystemData()
  } catch (error) {
    ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
  }
}

const deleteSubsystem = async () => {
  try {
    await ElMessageBox.confirm(
      '此操作将永久删除该子系统，是否继续？',
      '警告',
      { type: 'warning' }
    )
    
    await ApiService.nvmeof.deleteSubsystem(decodedNqn.value)
    ElMessage.success('子系统删除成功')
    router.push({ name: 'subsystems' })
  } catch (error) {
    if (error === 'cancel') return
    ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
  }
}

const refreshClients = async () => {
  try {
    await loadControllers()
    await loadQpairs()
  } catch (error) {
    ElMessage.error('刷新在线客户端失败: ' + (error.response?.data?.message || error.message))
  }
}

const loadControllers = async () => {
  try {
    const response = await ApiService.nvmeof.getSubsystemControllers(decodedNqn.value)
    console.log('🔧 获取控制器列表:', response.data)
    controllers.value = response.data.controllers || []
  } catch (error) {
    console.warn('加载控制器列表失败:', error)
    controllers.value = []
  }
}

const loadQpairs = async () => {
  try {
    const response = await ApiService.nvmeof.getSubsystemQpairs(decodedNqn.value)
    console.log('🔧 获取队列对列表:', response.data)
    qpairs.value = response.data.qpairs || []
  } catch (error) {
    console.warn('加载队列对列表失败:', error)
    qpairs.value = []
  }
}

const loadAvailableBdevs = async () => {
  try {
    const response = await ApiService.bdevs.getAll()
    console.log('🔧 SubsystemDetails BDEV API完整响应:', response)
    console.log('🔧 SubsystemDetails response.data:', response.data)
    
    // 修正axios响应结构
    const apiData = response.data
    let bdevs = []
    
    if (apiData.success && apiData.data && Array.isArray(apiData.data.bdevs)) {
      bdevs = apiData.data.bdevs
      console.log('🔧 SubsystemDetails成功加载BDEV数据:', bdevs.length, '个BDEV')
    } else if (Array.isArray(apiData.bdevs)) {
      bdevs = apiData.bdevs
      console.log('🔧 SubsystemDetails使用中间格式加载BDEV数据')
    } else if (Array.isArray(apiData)) {
      bdevs = apiData
      console.log('🔧 SubsystemDetails使用兼容格式加载BDEV数据')
    } else {
      console.log('🔧 SubsystemDetails无法解析BDEV数据, apiData:', apiData)
    }
    
    availableBdevs.value = bdevs
    console.log('🔧 SubsystemDetails可用BDEV数量:', availableBdevs.value.length)
  } catch (error) {
    console.error('加载可用BDEV列表失败:', error)
    ElMessage.error('加载可用BDEV列表失败: ' + (error.response?.data?.message || error.message))
  }
}

const loadAvailableHosts = async () => {
  try {
    const response = await ApiService.hosts.getAll()
    console.log('🔧 获取可用主机列表:', response.data)
    // Filter out hosts that are already added to this subsystem
    const allHosts = response.data.hosts || []
    const currentHostNqns = hosts.value.map(host => host.nqn)
    availableHosts.value = allHosts.filter(host => 
      !currentHostNqns.includes(host.nqn)
    )
  } catch (error) {
    console.error('加载可用主机列表失败:', error)
    ElMessage.error('加载可用主机列表失败: ' + (error.response?.data?.message || error.message))
  }
}

// 主机选择相关方法
const onHostAddModeChange = () => {
  // Reset form when switching modes
  hostForm.value.nqn = ''
  hostForm.value.selectedHostId = null
  selectedHostInfo.value = null
}

const onHostSelect = (hostId) => {
  const selectedHost = availableHosts.value.find(host => host.id === hostId)
  if (selectedHost) {
    selectedHostInfo.value = selectedHost
    hostForm.value.nqn = selectedHost.nqn // Set the NQN for API call
  }
}

// 创建操作
const createListener = async () => {
  try {
    const response = await ApiService.nvmeof.createSubsystemListener(decodedNqn.value, {
      trtype: listenerForm.value.trtype,
      adrfam: listenerForm.value.adrfam,
      traddr: listenerForm.value.traddr,
      trsvcid: listenerForm.value.trsvcid
    })
    ElMessage.success('监听器添加成功')
    showListenerDialog.value = false
    listenerForm.value = { trtype: 'TCP', adrfam: 'ipv4', traddr: '', trsvcid: '' }
    await loadSubsystemData()
  } catch (error) {
    ElMessage.error('添加失败: ' + (error.response?.data?.message || error.message))
  }
}

const addHost = async () => {
  try {
    await ApiService.nvmeof.addSubsystemHost(decodedNqn.value, {
      host_nqn: hostForm.value.nqn
    })
    ElMessage.success('主机添加成功')
    showHostDialog.value = false
    hostForm.value = { nqn: '', selectedHostId: null }
    hostAddMode.value = 'select'
    selectedHostInfo.value = null
    await loadSubsystemData()
  } catch (error) {
    ElMessage.error('添加失败: ' + (error.response?.data?.message || error.message))
  }
}

const addNamespace = async () => {
  try {
    const payload = {
      bdev_name: namespaceForm.value.bdev_name
    }
    if (namespaceForm.value.nsid) {
      payload.nsid = namespaceForm.value.nsid
    }
    if (namespaceForm.value.uuid) {
      payload.uuid = namespaceForm.value.uuid
    }
    
    await ApiService.nvmeof.addSubsystemNamespace(decodedNqn.value, payload)
    ElMessage.success('命名空间添加成功')
    showNamespaceDialog.value = false
    namespaceForm.value = { bdev_name: '', nsid: null, uuid: '' }
    await loadSubsystemData()
  } catch (error) {
    ElMessage.error('添加失败: ' + (error.response?.data?.message || error.message))
  }
}

// 组件挂载
onMounted(async () => {
  loading.value = true
  try {
    await loadSubsystemData()
    // 加载在线客户端数据
    clientsLoading.value = true
    await loadControllers()
    await loadQpairs()
    clientsLoading.value = false
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.subsystem-details {
  padding: 16px;
}

.breadcrumb {
  margin-bottom: 16px;
}

.subsystem-card, .management-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
}

.tab-content {
  padding: 16px 0;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.content-header h4 {
  margin: 0;
}

.loading-placeholder {
  padding: 20px;
}

.allow-any-host-control {
  display: flex;
  align-items: center;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .content-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
}
</style> 