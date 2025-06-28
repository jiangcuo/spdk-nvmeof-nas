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
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>
                  个人资料
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
  Setting
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
    case 'profile':
      // TODO: 打开个人资料对话框
      ElMessage.info('个人资料功能正在开发中')
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
</style> 