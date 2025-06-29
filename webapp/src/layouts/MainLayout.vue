<template>
  <el-container class="main-layout">
    <!-- 侧边栏 -->
    <el-aside :width="sidebarWidth" class="main-sidebar">
      <div class="sidebar-header">
        <div class="logo-container" @click="toggleSidebar">
          <div class="logo-icon">S</div>
          <transition name="fade">
            <span v-show="!isCollapsed" class="logo-text">SPDK Manager</span>
          </transition>
        </div>
      </div>
      
      <el-menu
        :default-active="currentRoute"
        :collapse="isCollapsed"
        :collapse-transition="false"
        class="sidebar-menu"
        router
        :default-openeds="defaultOpenedMenus"
      >
        <template v-for="item in visibleMenuItems" :key="item.name">
          <!-- 有子菜单的项 -->
          <el-sub-menu 
            v-if="item.children && item.children.length > 0"
            :index="item.name"
            :disabled="item.requiresAdmin && !userStore.isAdmin"
          >
            <template #title>
              <el-icon>
                <component :is="item.icon" />
              </el-icon>
              <span>{{ item.title }}</span>
            </template>
            
            <el-menu-item
              v-for="child in item.children"
              :key="child.name"
              :index="child.path"
              :disabled="child.requiresAdmin && !userStore.isAdmin"
            >
              <el-icon>
                <component :is="child.icon" />
              </el-icon>
              <template #title>{{ child.title }}</template>
            </el-menu-item>
          </el-sub-menu>
          
          <!-- 没有子菜单的项 -->
          <el-menu-item
            v-else
            :index="item.path"
            :disabled="item.requiresAdmin && !userStore.isAdmin"
          >
            <el-icon>
              <component :is="item.icon" />
            </el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>
    
    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 顶部栏 -->
      <el-header class="main-header">
        <div class="header-left">
          <el-button
            circle
            @click="toggleSidebar"
            class="collapse-btn"
          >
            <el-icon>
              <Expand v-if="isCollapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
          
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>{{ currentPageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        
        <div class="header-right">
          <!-- 系统状态指示器 -->
          <el-tooltip content="系统状态" placement="bottom">
            <el-badge 
              :type="systemStatus.connected ? 'success' : 'danger'"
              is-dot
              class="system-status"
            >
              <el-icon size="20">
                <Connection />
              </el-icon>
            </el-badge>
          </el-tooltip>
          
          <!-- 用户菜单 -->
          <el-dropdown @command="handleUserCommand" class="user-dropdown">
            <div class="user-info">
              <el-avatar :size="32">
                <el-icon>
                  <User />
                </el-icon>
              </el-avatar>
              <span class="username">{{ userStore.username }}</span>
              <el-icon class="dropdown-icon">
                <ArrowDown />
              </el-icon>
            </div>
            
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="changePassword">
                  <el-icon><Lock /></el-icon>
                  修改密码
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      
      <!-- 主内容 -->
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
    
    <!-- 修改密码对话框 -->
    <el-dialog
      v-model="changePasswordVisible"
      title="修改密码"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="changePasswordFormRef"
        :model="changePasswordForm"
        :rules="changePasswordRules"
        label-width="100px"
        @submit.prevent="handleChangePassword"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input
            v-model="changePasswordForm.currentPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="changePasswordForm.newPassword"
            type="password"
            placeholder="请输入新密码（至少6位）"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="changePasswordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="closeChangePasswordDialog">取消</el-button>
          <el-button 
            type="primary" 
            @click="handleChangePassword"
            :loading="userStore.isLoading"
          >
            确认修改
          </el-button>
        </div>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getMenuItems } from '@/router'
import { ApiService } from '@/services/api'
import { 
  User, 
  Connection,
  Expand, 
  Fold, 
  ArrowDown, 
  SwitchButton,
  DataBoard,
  Monitor,
  Cpu,
  Grid,
  Collection,
  Setting,
  Lock
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 侧边栏状态
const isCollapsed = ref(false)
const sidebarWidth = computed(() => isCollapsed.value ? '64px' : '200px')

// 系统状态
const systemStatus = ref({
  connected: false,
  loading: false
})

// 修改密码相关
const changePasswordVisible = ref(false)
const changePasswordFormRef = ref(null)
const changePasswordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// 修改密码表单验证规则
const changePasswordRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少需要6个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== changePasswordForm.value.newPassword) {
          callback(new Error('确认密码与新密码不匹配'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 当前路由
const currentRoute = computed(() => route.path)

// 默认展开的菜单
const defaultOpenedMenus = computed(() => {
  // 如果当前路由是某个子菜单项，则展开对应的父菜单
  const currentPath = route.path
  const parentMenus = []
  
  menuItems.value.forEach(item => {
    if (item.children && item.children.some(child => child.path === currentPath)) {
      parentMenus.push(item.name)
    }
  })
  
  return parentMenus
})

const currentPageTitle = computed(() => {
  // 先在第一层菜单中查找
  let menuItem = menuItems.value.find(item => item.path === route.path)
  
  // 如果没找到，则在子菜单中查找
  if (!menuItem) {
    for (const item of menuItems.value) {
      if (item.children) {
        menuItem = item.children.find(child => child.path === route.path)
        if (menuItem) break
      }
    }
  }
  
  return menuItem?.title || route.meta?.title || '仪表板'
})

// 菜单项
const menuItems = ref(getMenuItems())
const visibleMenuItems = computed(() => {
  return menuItems.value.filter(item => {
    // 如果需要管理员权限但用户不是管理员，则隐藏
    if (item.requiresAdmin && !userStore.isAdmin) {
      return false
    }
    return true
  })
})

// 切换侧边栏
const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value
  
  // 保存到本地存储
  localStorage.setItem('sidebar-collapsed', isCollapsed.value.toString())
}

// 处理用户菜单命令
const handleUserCommand = async (command) => {
  switch (command) {
    case 'changePassword':
      changePasswordVisible.value = true
      break
      
    case 'logout':
      await handleLogout()
      break
  }
}

// 处理退出登录
const handleLogout = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要退出登录吗？',
      '确认退出',
      {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      }
    )
    
    await userStore.logout()
    await router.push('/login')
    
  } catch (error) {
    // 用户取消退出
    if (error !== 'cancel') {
      console.error('退出登录失败:', error)
    }
  }
}

// 处理修改密码
const handleChangePassword = async () => {
  try {
    // 表单验证
    if (!changePasswordFormRef.value) return
    
    const valid = await changePasswordFormRef.value.validate()
    if (!valid) return
    
    // 调用修改密码API
    const result = await userStore.changePassword(changePasswordForm.value)
    
    if (result.success) {
      // 修改成功，关闭对话框并清空表单
      closeChangePasswordDialog()
      
      // 可选：显示重新登录提示
      await ElMessageBox.alert(
        '密码修改成功，为了安全起见，请重新登录',
        '密码修改成功',
        {
          type: 'success',
          confirmButtonText: '确定'
        }
      )
      
      // 自动退出登录
      await userStore.logout()
      await router.push('/login')
    }
    
  } catch (error) {
    console.error('修改密码失败:', error)
  }
}

// 关闭修改密码对话框
const closeChangePasswordDialog = () => {
  changePasswordVisible.value = false
  
  // 重置表单
  changePasswordForm.value = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  }
  
  // 清除表单验证状态
  if (changePasswordFormRef.value) {
    changePasswordFormRef.value.resetFields()
  }
}

// 检查系统状态
const checkSystemStatus = async () => {
  try {
    systemStatus.value.loading = true
    const response = await ApiService.system.getStatus()
    systemStatus.value.connected = response.status === 200
  } catch (error) {
    systemStatus.value.connected = false
    console.error('检查系统状态失败:', error)
  } finally {
    systemStatus.value.loading = false
  }
}

// 恢复侧边栏状态
onMounted(() => {
  const savedState = localStorage.getItem('sidebar-collapsed')
  if (savedState !== null) {
    isCollapsed.value = savedState === 'true'
  }
  
  // 检查系统状态
  checkSystemStatus()
  
  // 定期检查系统状态
  setInterval(checkSystemStatus, 30000) // 每30秒检查一次
})

// 监听路由变化
watch(route, () => {
  console.log(`🔗 当前路由: ${route.path}`)
})
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

/* 侧边栏样式 */
.main-sidebar {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  transition: width 0.3s ease;
  overflow: hidden;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 16px;
}

.logo-container {
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 8px;
  border-radius: 8px;
}

.logo-container:hover {
  background: var(--el-fill-color-light);
}

.logo-icon {
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.logo-text {
  margin-left: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.sidebar-menu {
  border: none;
  height: calc(100vh - 60px);
  overflow-y: auto;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 200px;
}

/* 顶部栏样式 */
.main-header {
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-btn {
  border: none;
  background: transparent;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.system-status {
  cursor: pointer;
}

.user-dropdown {
  cursor: pointer;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.user-info:hover {
  background: var(--el-fill-color-light);
}

.username {
  font-size: 14px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.dropdown-icon {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: transform 0.3s ease;
}

/* 主内容样式 */
.main-container {
  flex: 1;
  overflow: hidden;
}

.main-content {
  background: #f5f7fa;
  overflow-y: auto;
  position: relative;
}

/* 页面切换动画 */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.page-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .main-header {
    padding: 0 12px;
  }
  
  .header-left .el-breadcrumb {
    display: none;
  }
  
  .username {
    display: none;
  }
  
  .main-sidebar {
    position: fixed;
    z-index: 1000;
    height: 100vh;
  }
  
  .main-container {
    margin-left: 64px;
  }
}

/* 深色模式适配 */
.dark .main-content {
  background: var(--el-bg-color-page);
}

.dark .sidebar-header {
  border-bottom-color: var(--el-border-color);
}

.dark .main-header {
  border-bottom-color: var(--el-border-color);
}

/* 修改密码对话框样式 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.el-dialog .el-form-item {
  margin-bottom: 20px;
}

.el-dialog .el-input {
  width: 100%;
}
</style> 