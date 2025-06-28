import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import NvmeDiscovery from '@/views/NvmeDiscovery.vue'

// 导入布局组件
const MainLayout = () => import('@/layouts/MainLayout.vue')

// 导入页面组件
const Login = () => import('@/views/Login.vue')
const Dashboard = () => import('@/views/Dashboard.vue')
const DiskManagement = () => import('@/views/DiskManagement.vue')
const BdevManagement = () => import('@/views/BdevManagement.vue')
const RaidManagement = () => import('@/views/RaidManagement.vue')
const LvolManagement = () => import('@/views/LvolManagement.vue')
const LvstoreDetails = () => import('@/views/LvstoreDetails.vue')
const SubsystemManagement = () => import('@/views/SubsystemManagement.vue')
const HostManagement = () => import('@/views/HostManagement.vue')
const SubsystemDetails = () => import('@/views/SubsystemDetails.vue')

// 路由配置
const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: {
      title: '登录',
      requiresAuth: false,
      hideInMenu: true
    }
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard',
    meta: {
      requiresAuth: true
    },
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: Dashboard,
        meta: {
          title: '仪表板',
          icon: 'DataBoard',
          requiresAuth: true
        }
      },
      {
        path: '/disks',
        name: 'DiskManagement',
        component: DiskManagement,
        meta: {
          title: '磁盘管理',
          icon: 'Monitor',
          requiresAuth: true
        }
      },
      {
        path: '/bdevs',
        name: 'BdevManagement',
        component: BdevManagement,
        meta: {
          title: 'BDEV 管理',
          icon: 'Cpu',
          requiresAuth: true
        }
      },
      {
        path: '/raids',
        name: 'RaidManagement',
        component: RaidManagement,
        meta: {
          title: 'RAID 管理',
          icon: 'Grid',
          requiresAuth: true
        }
      },
      {
        path: '/lvols',
        name: 'LvolManagement',
        component: LvolManagement,
        meta: {
          title: '逻辑卷管理',
          icon: 'Collection',
          requiresAuth: true
        }
      },
      {
        path: '/nvmeof',
        name: 'nvmeof',
        meta: {
          title: 'NVMe-oF',
          icon: 'Connection',
          requiresAuth: true
        },
        children: [
          {
            path: '/nvmeof/subsystems',
            name: 'subsystems',
            component: SubsystemManagement,
            meta: {
              title: '子系统管理',
              icon: 'Setting',
              requiresAuth: true
            }
          },
          {
            path: '/nvmeof/hosts',
            name: 'hosts',
            component: HostManagement,
            meta: {
              title: '主机管理',
              icon: 'User',
              requiresAuth: true
            }
          }
        ]
      },
      {
        path: '/lvols/:storeId/:storeName',
        name: 'lvstore-details',
        component: LvstoreDetails,
        meta: {
          title: 'LV Store详情',
          requiresAuth: true,
          hideInMenu: true
        }
      },
      {
        path: '/nvmeof/subsystems/:nqn',
        name: 'subsystem-details',
        component: SubsystemDetails,
        meta: {
          title: '子系统详情',
          requiresAuth: true,
          hideInMenu: true
        }
      }
    ]
  },
  {
    path: '/nvme-discovery',
    name: 'NvmeDiscovery',
    component: NvmeDiscovery,
    meta: {
      title: 'NVMe 设备发现',
      requiresAuth: true
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 全局前置守卫
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  
  // 设置页面标题
  const title = to.meta?.title || 'SPDK NAS Manager'
  document.title = `${title} - SPDK NAS Manager`
  
  // 检查是否需要认证
  if (to.meta?.requiresAuth) {
    if (!userStore.isAuthenticated) {
      ElMessage.warning('请先登录')
      next({
        path: '/login',
        query: { redirect: to.fullPath }
      })
      return
    }
    
    // 检查权限
    if (to.meta?.requiresAdmin && !userStore.isAdmin) {
      ElMessage.error('权限不足，需要管理员权限')
      next('/dashboard')
      return
    }
  }
  
  // 如果已登录用户访问登录页，重定向到仪表板
  if (to.path === '/login' && userStore.isAuthenticated) {
    next('/dashboard')
    return
  }
  
  next()
})

// 全局后置钩子
router.afterEach((to, from) => {
  // 记录页面访问
  console.log(`📍 路由切换: ${from.path} -> ${to.path}`)
})

// 获取菜单项（排除隐藏的路由）
export const getMenuItems = () => {
  const mainRoute = routes.find(route => route.path === '/')
  if (!mainRoute || !mainRoute.children) return []
  
  return mainRoute.children
    .filter(route => !route.meta?.hideInMenu)
    .map(route => ({
      name: route.name,
      path: route.path,
      title: route.meta?.title || route.name,
      icon: route.meta?.icon || 'Document',
      requiresAdmin: route.meta?.requiresAdmin || false,
      children: route.children ? route.children.map(child => ({
        name: child.name,
        path: child.path,
        title: child.meta?.title || child.name,
        icon: child.meta?.icon || 'Document',
        requiresAdmin: child.meta?.requiresAdmin || false
      })) : undefined
    }))
}

export default router 