<template>
  <div class="subsystem-management">
    <div class="page-header">
      <h1 class="page-title">子系统管理</h1>
      <div class="button-group">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="showCreateSubsystemDialog" v-if="userStore.isAdmin">
          <el-icon><Plus /></el-icon>
          创建子系统
        </el-button>
      </div>
    </div>

    <!-- 子系统概览 -->
    <div class="page-card">
      <div class="tab-content">
        <div class="content-header">
          <h3>NVMe子系统列表</h3>
          <el-input
            v-model="subsystemSearch"
            placeholder="搜索子系统..."
            clearable
            style="width: 250px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <el-table :data="filteredSubsystems" v-loading="loading" stripe @row-click="navigateToSubsystem">
          <el-table-column prop="nqn" label="NQN" min-width="300" show-overflow-tooltip />
          <el-table-column prop="subtype" label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="row.subtype === 'NVMe' ? 'success' : 'info'" size="small">
                {{ row.subtype }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="监听器数量" width="100">
            <template #default="{ row }">
              <el-tag type="primary" size="small">{{ row.listen_addresses?.length || 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="主机数量" width="100">
            <template #default="{ row }">
              <el-tag type="warning" size="small">{{ row.hosts?.length || 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="命名空间数量" width="120">
            <template #default="{ row }">
              <el-tag type="success" size="small">{{ row.namespaces?.length || 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="允许任意主机" width="120">
            <template #default="{ row }">
              <el-tag :type="row.allow_any_host ? 'success' : 'warning'" size="small">
                {{ row.allow_any_host ? '是' : '否' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="button-group">
                <el-button size="small" @click.stop="navigateToSubsystem(row)" title="管理子系统">
                  <el-icon><Setting /></el-icon>
                  管理
                </el-button>
                <el-popconfirm
                  title="确定要删除这个子系统吗？"
                  @confirm="deleteSubsystem(row.nqn)"
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

    <!-- 创建子系统对话框 -->
    <el-dialog v-model="createSubsystemVisible" title="创建NVMe子系统" width="600px">
      <el-form ref="createSubsystemFormRef" :model="createSubsystemForm" :rules="createSubsystemRules" label-width="120px">
        <el-form-item label="NQN" prop="nqn">
          <div style="display: flex; gap: 8px;">
            <el-input 
              v-model="createSubsystemForm.nqn" 
              placeholder="例如: nqn.2016-06.io.spdk:cnode1"
              style="flex: 1;"
            />
            <el-dropdown @command="generateNQN" trigger="click">
              <el-button type="primary" plain>
                生成NQN
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="simple">简单NQN (测试用)</el-dropdown-item>
                  <el-dropdown-item command="uuid">UUID格式NQN</el-dropdown-item>
                  <el-dropdown-item command="discovery" v-if="createSubsystemForm.subtype === 'discovery'">Discovery NQN</el-dropdown-item>
                  <el-dropdown-item command="custom" disabled>自定义NQN (暂不支持)</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div style="margin-top: 4px; font-size: 12px; color: #909399;">
            格式: nqn.yyyy-mm.reverse-domain:identifier 或 nqn.2014-08.org.nvmexpress:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
          </div>
        </el-form-item>
        <el-form-item label="类型" prop="subtype">
          <el-select v-model="createSubsystemForm.subtype" style="width: 100%">
            <el-option label="NVMe" value="nvme" />
            <el-option label="Discovery" value="discovery" />
          </el-select>
        </el-form-item>
        <el-form-item label="最大命名空间" prop="max_namespaces">
          <el-input-number v-model="createSubsystemForm.max_namespaces" :min="1" :max="256" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="createSubsystemVisible = false">取消</el-button>
          <el-button type="primary" @click="createSubsystem" :loading="createSubsystemLoading">创建</el-button>
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
  Delete,
  ArrowDown
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { generateSimpleNQN, generateUuidNQN, generateDiscoveryNQN } from '@/utils/nqnGenerator'

const router = useRouter()
const userStore = useUserStore()

// 数据状态
const loading = ref(false)
const subsystems = ref([])

// 界面状态
const subsystemSearch = ref('')

// 对话框状态
const createSubsystemVisible = ref(false)

// 加载状态
const createSubsystemLoading = ref(false)

// 表单数据
const createSubsystemFormRef = ref()
const createSubsystemForm = ref({
  nqn: '',
  subtype: 'nvme',
  max_namespaces: 32
})

// 表单验证规则
const createSubsystemRules = {
  nqn: [{ required: true, message: '请输入NQN', trigger: 'blur' }],
  subtype: [{ required: true, message: '请选择类型', trigger: 'change' }]
}

// 计算属性
const filteredSubsystems = computed(() => {
  if (!subsystemSearch.value) return subsystems.value
  
  const search = subsystemSearch.value.toLowerCase()
  return subsystems.value.filter(subsystem => 
    subsystem.nqn.toLowerCase().includes(search)
  )
})

// 数据加载
const loadSubsystems = async () => {
  try {
    const response = await ApiService.nvmeof.getSubsystems()
    console.log('🔧 SPDK子系统原始数据:', response.data)
    
    // 根据SPDK实际返回格式处理数据
    // 可能是单个subsystem对象或者subsystems数组
    if (response.data.subsystem) {
      // 单个子系统的情况
      subsystems.value = [response.data.subsystem]
    } else if (response.data.subsystems && Array.isArray(response.data.subsystems)) {
      // 多个子系统的情况
      subsystems.value = response.data.subsystems
    } else if (Array.isArray(response.data)) {
      // 直接是数组的情况
      subsystems.value = response.data
    } else {
      // 其他情况，尝试从response.data中提取
      console.warn('未知的数据格式:', response.data)
      subsystems.value = []
    }
    
    console.log('🔧 处理后的子系统数据:', subsystems.value)
  } catch (error) {
    console.error('加载子系统失败:', error)
    subsystems.value = []
    ElMessage.error('加载子系统失败: ' + (error.response?.data?.message || error.message))
  }
}

const refreshData = async () => {
  loading.value = true
  try {
    await loadSubsystems()
    ElMessage.success('数据已刷新')
  } catch (error) {
    ElMessage.error('刷新失败')
  } finally {
    loading.value = false
  }
}

// 对话框操作
const showCreateSubsystemDialog = () => {
  createSubsystemForm.value = {
    nqn: '',
    subtype: 'nvme',
    max_namespaces: 32
  }
  createSubsystemVisible.value = true
}

// NQN生成功能
const generateNQN = (command) => {
  try {
    let generatedNQN = ''
    
    switch (command) {
      case 'simple':
        generatedNQN = generateSimpleNQN('cnode')
        ElMessage.success('已生成简单格式NQN')
        break
      case 'uuid':
        generatedNQN = generateUuidNQN()
        ElMessage.success('已生成UUID格式NQN')
        break
      case 'discovery':
        generatedNQN = generateDiscoveryNQN()
        ElMessage.success('已生成Discovery NQN')
        break
      case 'custom':
        // 暂时不支持自定义，未来可以打开一个对话框让用户输入参数
        ElMessage.info('自定义NQN功能开发中...')
        return
      default:
        ElMessage.warning('未知的生成类型')
        return
    }
    
    createSubsystemForm.value.nqn = generatedNQN
    console.log('生成的NQN:', generatedNQN)
  } catch (error) {
    console.error('生成NQN失败:', error)
    ElMessage.error('生成NQN失败: ' + error.message)
  }
}

// CRUD操作
const createSubsystem = async () => {
  try {
    await createSubsystemFormRef.value.validate()
    createSubsystemLoading.value = true
    
    await ApiService.nvmeof.createSubsystem(createSubsystemForm.value)
    ElMessage.success('子系统创建成功')
    createSubsystemVisible.value = false
    await loadSubsystems()
  } catch (error) {
    ElMessage.error('创建失败: ' + (error.response?.data?.message || error.message))
  } finally {
    createSubsystemLoading.value = false
  }
}

const deleteSubsystem = async (nqn) => {
  try {
    await ApiService.nvmeof.deleteSubsystem(nqn)
    ElMessage.success('子系统删除成功')
    await loadSubsystems()
  } catch (error) {
    ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
  }
}

// 导航操作
const navigateToSubsystem = (subsystem) => {
  // 使用Base64编码来避免URL中的特殊字符问题
  try {
    const base64Nqn = btoa(encodeURIComponent(subsystem.nqn))
    router.push({ 
      name: 'subsystem-details', 
      params: { nqn: base64Nqn }
    })
  } catch (error) {
    console.error('编码NQN失败:', error)
    ElMessage.error('无法导航到子系统详情页面')
  }
}

// 组件挂载
onMounted(async () => {
  loading.value = true
  try {
    await loadSubsystems()
    console.log('🔧 子系统管理页面已加载')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.subsystem-management {
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