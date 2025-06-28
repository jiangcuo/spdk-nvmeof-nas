import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'
import router from './router'

// 创建应用实例
const app = createApp(App)

// 注册 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 创建Pinia实例
const pinia = createPinia()

// 使用插件
app.use(pinia)
app.use(router)
app.use(ElementPlus, {
  locale: zhCn,
})

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('全局错误:', err)
  console.error('错误信息:', info)
}

// 初始化用户状态并挂载应用
const initializeApp = async () => {
  try {
    // 等待用户状态初始化
    const { useUserStore } = await import('./stores/user')
    const userStore = useUserStore()
    await userStore.initializeAuth()
    
    console.log('🔐 用户状态初始化完成')
  } catch (error) {
    console.warn('🔐 用户状态初始化失败:', error)
  } finally {
    // 挂载应用
    app.mount('#app')
    console.log('🚀 SPDK NAS Manager Frontend 启动成功')
  }
}

// 启动应用
initializeApp() 