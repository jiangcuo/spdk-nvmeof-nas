<template>
  <div class="host-management">
    <div class="page-header">
      <h1 class="page-title">主机管理</h1>
      <div class="button-group">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="showCreateHostDialog" v-if="userStore.isAdmin">
          <el-icon><Plus /></el-icon>
          添加主机
        </el-button>
      </div>
    </div>

    <!-- 主机列表 -->
    <div class="page-card">
      <div class="tab-content">
        <div class="content-header">
          <h3>已注册主机</h3>
          <el-input
            v-model="hostSearch"
            placeholder="搜索主机..."
            clearable
            style="width: 250px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        
        <el-table :data="filteredHosts" v-loading="loading" stripe>
          <el-table-column prop="name" label="主机名称" width="150" />
          <el-table-column prop="nqn" label="NQN" min-width="300" show-overflow-tooltip />
          <el-table-column prop="description" label="备注" width="200" show-overflow-tooltip />
          <el-table-column prop="is_active" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'danger'" size="small">
                {{ row.is_active ? '活动' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="160">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="editHost(row)" v-if="userStore.isAdmin">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-popconfirm
                title="确定要删除这个主机吗？"
                @confirm="deleteHost(row.id)"
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
    </div>

    <!-- 创建主机对话框 -->
    <el-dialog v-model="createHostVisible" title="添加主机" width="600px">
      <el-form ref="createHostFormRef" :model="createHostForm" :rules="createHostRules" label-width="120px">
        <el-form-item label="主机名称" prop="name">
          <el-input v-model="createHostForm.name" placeholder="输入主机名称" />
        </el-form-item>
        <el-form-item label="主机NQN" prop="nqn">
          <el-input v-model="createHostForm.nqn" placeholder="nqn.2014-08.com.example:host1" />
        </el-form-item>
        <el-form-item label="备注" prop="description">
          <el-input type="textarea" v-model="createHostForm.description" placeholder="可选的备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createHostVisible = false">取消</el-button>
          <el-button type="primary" @click="createHost" :loading="createHostLoading">添加</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 编辑主机对话框 -->
    <el-dialog v-model="editHostVisible" title="编辑主机" width="600px">
      <el-form ref="editHostFormRef" :model="editHostForm" :rules="editHostRules" label-width="120px">
        <el-form-item label="主机名称" prop="name">
          <el-input v-model="editHostForm.name" placeholder="输入主机名称" />
        </el-form-item>
        <el-form-item label="主机NQN" prop="nqn">
          <el-input v-model="editHostForm.nqn" disabled />
        </el-form-item>
        <el-form-item label="备注" prop="description">
          <el-input type="textarea" v-model="editHostForm.description" placeholder="可选的备注信息" />
        </el-form-item>
        <el-form-item label="状态" prop="is_active">
          <el-switch v-model="editHostForm.is_active" active-text="活动" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="editHostVisible = false">取消</el-button>
          <el-button type="primary" @click="updateHost" :loading="updateHostLoading">保存</el-button>
        </div>
      </template>
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
  Edit, 
  Delete
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const userStore = useUserStore()

// 数据状态
const loading = ref(false)
const managedHosts = ref([])

// 界面状态
const hostSearch = ref('')

// 对话框状态
const createHostVisible = ref(false)
const editHostVisible = ref(false)

// 加载状态
const createHostLoading = ref(false)
const updateHostLoading = ref(false)

// 表单数据
const createHostFormRef = ref()
const createHostForm = ref({
  name: '',
  nqn: '',
  description: ''
})

const editHostFormRef = ref()
const editHostForm = ref({
  id: null,
  name: '',
  nqn: '',
  description: '',
  is_active: true
})

// 表单验证规则
const createHostRules = {
  name: [{ required: true, message: '请输入主机名称', trigger: 'blur' }],
  nqn: [{ required: true, message: '请输入主机NQN', trigger: 'blur' }]
}

const editHostRules = {
  name: [{ required: true, message: '请输入主机名称', trigger: 'blur' }]
}

// 计算属性
const filteredHosts = computed(() => {
  if (!hostSearch.value) return managedHosts.value
  
  const search = hostSearch.value.toLowerCase()
  return managedHosts.value.filter(host => 
    host.name.toLowerCase().includes(search) ||
    host.nqn.toLowerCase().includes(search) ||
    (host.description && host.description.toLowerCase().includes(search))
  )
})

// 工具函数
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

// 数据加载
const loadManagedHosts = async () => {
  try {
    const response = await ApiService.hosts.getAll()
    managedHosts.value = Array.isArray(response.data.hosts) ? response.data.hosts : []
  } catch (error) {
    console.error('加载主机失败:', error)
    managedHosts.value = []
    ElMessage.error('加载主机失败: ' + (error.response?.data?.message || error.message))
  }
}

const refreshData = async () => {
  loading.value = true
  try {
    await loadManagedHosts()
    ElMessage.success('数据已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  } finally {
    loading.value = false
  }
}

// 对话框操作
const showCreateHostDialog = () => {
  createHostForm.value = {
    name: '',
    nqn: '',
    description: ''
  }
  createHostVisible.value = true
}

// CRUD操作
const createHost = async () => {
  try {
    await createHostFormRef.value.validate()
    createHostLoading.value = true
    
    await ApiService.hosts.create(createHostForm.value)
    ElMessage.success('主机添加成功')
    createHostVisible.value = false
    await loadManagedHosts()
  } catch (error) {
    ElMessage.error('添加失败: ' + (error.response?.data?.message || error.message))
  } finally {
    createHostLoading.value = false
  }
}

const editHost = (host) => {
  editHostForm.value = {
    id: host.id,
    name: host.name,
    nqn: host.nqn,
    description: host.description || '',
    is_active: host.is_active
  }
  editHostVisible.value = true
}

const updateHost = async () => {
  try {
    await editHostFormRef.value.validate()
    updateHostLoading.value = true
    
    const { id, ...updateData } = editHostForm.value
    await ApiService.hosts.update(id, updateData)
    ElMessage.success('主机更新成功')
    editHostVisible.value = false
    await loadManagedHosts()
  } catch (error) {
    ElMessage.error('更新失败: ' + (error.response?.data?.message || error.message))
  } finally {
    updateHostLoading.value = false
  }
}

const deleteHost = async (hostId) => {
  try {
    await ApiService.hosts.delete(hostId)
    ElMessage.success('主机删除成功')
    await loadManagedHosts()
  } catch (error) {
    ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
  }
}

// 组件挂载
onMounted(async () => {
  loading.value = true
  try {
    await loadManagedHosts()
    console.log('👥 主机管理页面已加载')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.host-management {
  padding: 0;
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

/* 响应式设计 */
@media (max-width: 768px) {
  .content-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .button-group {
    justify-content: center;
  }
}
</style> 