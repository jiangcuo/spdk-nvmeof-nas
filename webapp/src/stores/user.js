import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import Cookies from 'js-cookie'
import { api } from '@/services/api'
import { ElMessage } from 'element-plus'

export const useUserStore = defineStore('user', () => {
  // 状态
  const token = ref(Cookies.get('auth_token') || '')
  const userInfo = ref(null)
  const isLoading = ref(false)
  
  // 计算属性
  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => userInfo.value?.role === 'admin')
  const username = computed(() => userInfo.value?.username || '')
  
  // 设置认证信息
  const setAuth = (authToken, user) => {
    token.value = authToken
    userInfo.value = user
    
    // 保存到 Cookie (2小时过期)
    Cookies.set('auth_token', authToken, { expires: 1/12 }) // 2小时 = 1/12天
    
    // 设置API默认header
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`
  }
  
  // 清除认证信息
  const clearAuth = () => {
    token.value = ''
    userInfo.value = null
    
    // 清除 Cookie
    Cookies.remove('auth_token')
    
    // 清除API header
    delete api.defaults.headers.common['Authorization']
  }
  
  // 登录
  const login = async (credentials) => {
    try {
      isLoading.value = true
      
      const response = await api.post('/auth/login', credentials)
      const { token: authToken, user } = response.data
      
      setAuth(authToken, user)
      
      ElMessage.success(`欢迎回来，${user.username}！`)
      
      return { success: true }
    } catch (error) {
      console.error('登录失败:', error)
      
      const message = error.response?.data?.message || '登录失败，请检查用户名和密码'
      ElMessage.error(message)
      
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }
  
  // 注销
  const logout = async () => {
    try {
      // 调用后端注销接口
      if (token.value) {
        await api.post('/auth/logout')
      }
    } catch (error) {
      console.warn('注销请求失败:', error)
    } finally {
      clearAuth()
      ElMessage.success('已成功登出')
    }
  }
  
  // 获取用户信息
  const fetchUserInfo = async () => {
    try {
      const response = await api.get('/auth/profile')
      userInfo.value = response.data
      return response.data
    } catch (error) {
      console.error('获取用户信息失败:', error)
      
      // 如果token无效，清除认证信息
      if (error.response?.status === 401) {
        clearAuth()
      }
      
      throw error
    }
  }
  
  // 更新用户信息
  const updateProfile = async (profileData) => {
    try {
      isLoading.value = true
      
      const response = await api.put('/auth/profile', profileData)
      userInfo.value = response.data.user
      
      ElMessage.success('个人信息更新成功')
      
      return { success: true }
    } catch (error) {
      console.error('更新个人信息失败:', error)
      
      const message = error.response?.data?.message || '更新失败'
      ElMessage.error(message)
      
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }
  
  // 修改密码
  const changePassword = async (passwordData) => {
    try {
      isLoading.value = true
      
      const response = await api.put('/auth/change-password', passwordData)
      
      ElMessage.success('密码修改成功')
      
      return { success: true }
    } catch (error) {
      console.error('修改密码失败:', error)
      
      const message = error.response?.data?.message || '修改密码失败'
      ElMessage.error(message)
      
      return { success: false, message }
    } finally {
      isLoading.value = false
    }
  }
  
  // 初始化认证状态
  const initializeAuth = async () => {
    if (token.value) {
      // 设置API header
      api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
      
      try {
        // 验证token是否有效并获取用户信息
        await fetchUserInfo()
        console.log('🔐 用户会话已恢复')
      } catch (error) {
        console.warn('🔐 用户会话无效，已清除')
        clearAuth()
      }
    }
  }
  
  // 检查权限
  const hasPermission = (permission) => {
    if (!userInfo.value) return false
    
    // 管理员拥有所有权限
    if (userInfo.value.role === 'admin') return true
    
    // 根据角色检查权限
    switch (permission) {
      case 'read':
        return ['admin', 'user'].includes(userInfo.value.role)
      case 'write':
        return userInfo.value.role === 'admin'
      case 'delete':
        return userInfo.value.role === 'admin'
      default:
        return false
    }
  }
  
  return {
    // 状态
    token: readonly(token),
    userInfo: readonly(userInfo),
    isLoading: readonly(isLoading),
    
    // 计算属性
    isAuthenticated,
    isAdmin,
    username,
    
    // 方法
    login,
    logout,
    fetchUserInfo,
    updateProfile,
    changePassword,
    initializeAuth,
    hasPermission,
    setAuth,
    clearAuth
  }
}) 