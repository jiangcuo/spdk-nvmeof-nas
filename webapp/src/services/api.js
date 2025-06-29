import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import Cookies from 'js-cookie'

// 创建axios实例
export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    console.log(`🌐 API请求: ${config.method?.toUpperCase()} ${config.url}`)
    
    return config
  },
  (error) => {
    console.error('请求拦截器错误:', error)
    return Promise.reject(error)
  }
)

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API响应: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`)
    return response
  },
  async (error) => {
    const { response, config } = error
    
    console.error(`❌ API错误: ${config?.method?.toUpperCase()} ${config?.url}`, error)
    
    if (response) {
      const { status, data } = response
      
      switch (status) {
        case 401:
          handleUnauthorized()
          break
        case 403:
          ElMessage.error('权限不足，无法执行此操作')
          break
        case 404:
          ElMessage.error(data?.message || '请求的资源不存在')
          break
        case 422:
          handleValidationError(data)
          break
        case 429:
          ElMessage.error('请求过于频繁，请稍后再试')
          break
        case 500:
          ElMessage.error(data?.message || '服务器内部错误')
          break
        default:
          ElMessage.error(data?.message || `请求失败 (${status})`)
      }
    } else if (error.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请稍后重试')
    } else if (error.message === 'Network Error') {
      ElMessage.error('网络连接异常，请检查网络设置')
    } else {
      ElMessage.error(error.message || '未知错误')
    }
    
    return Promise.reject(error)
  }
)

// 处理未授权错误
const handleUnauthorized = () => {
  Cookies.remove('auth_token')
  delete api.defaults.headers.common['Authorization']
  
  ElMessageBox.alert('您的登录已过期，请重新登录', '会话过期', {
    type: 'warning',
    showClose: false,
    callback: () => {
      window.location.href = '/#/login'
    }
  })
}

// 处理参数验证错误
const handleValidationError = (data) => {
  if (data?.errors && Array.isArray(data.errors)) {
    const firstError = data.errors[0]
    ElMessage.error(firstError?.message || '参数验证失败')
  } else {
    ElMessage.error(data?.message || '参数验证失败')
  }
}

// API服务类
export class ApiService {
  // 通用请求方法
  static request = (method, url, data = null) => {
    const config = { method: method.toLowerCase(), url }
    if (data) {
      if (method.toLowerCase() === 'get') {
        config.params = data
      } else {
        config.data = data
      }
    }
    return api(config)
  }

  static auth = {
    login: (credentials) => api.post('/auth/login', credentials),
    logout: () => api.post('/auth/logout'),
    getProfile: () => api.get('/auth/profile'),
    updateProfile: (data) => api.put('/auth/profile', data),
    changePassword: (data) => api.put('/auth/change-password', data)
  }
  
  static disks = {
    getAll: () => api.get('/disks'),
    getStats: () => api.get('/disks/stats'),
    getAvailable: () => api.get('/disks/available'),
    getInfo: (deviceName) => api.get(`/disks/${deviceName}`),
    getHealth: (deviceName) => api.get(`/disks/${deviceName}/health`),
    getSmart: (deviceName) => api.get(`/disks/${deviceName}/smart`),
    refreshScan: () => api.post('/disks/scan/refresh')
  }
  
  static bdevs = {
    getAll: () => api.get('/bdevs'),
    create: (data) => api.post('/bdevs', data),
    delete: (name) => api.delete(`/bdevs/${name}`),
    attachNvme: (data) => api.post('/bdevs/nvme/attach', data),
    createMalloc: (data) => api.post('/bdevs/malloc', data),
    createAio: (data) => api.post('/bdevs/aio', data)
  }
  
  static raids = {
    getAll: () => api.get('/raids'),
    create: (data) => api.post('/raids', data),
    delete: (id) => api.delete(`/raids/${id}`),
    addBaseBdev: (data) => api.post('/raid/base-bdev', data),
    removeBaseBdev: (data) => api.delete('/raid/base-bdev', { data })
  }
  
  static lvstores = {
    getAll: () => api.get('/lvstore'),
    create: (data) => api.post('/lvstore', data),
    delete: (uuid) => api.delete(`/lvstore/${uuid}`),
    rename: (data) => api.put('/lvstore/rename', data),
    grow: (uuid) => api.put(`/lvstore/${uuid}/grow`)
  }
  
  static lvols = {
    getAll: () => api.get('/lvol'),
    create: (data) => api.post('/lvol', data),
    delete: (name) => api.delete(`/lvol/${encodeURIComponent(name)}`),
    rename: (data) => api.put('/lvol/rename', data),
    resize: (name, size) => api.put(`/lvol/${encodeURIComponent(name)}/resize`, { size }),
    createSnapshot: (data) => api.post('/lvol/snapshot', data),
    createClone: (data) => api.post('/lvol/clone', data),
    inflate: (name) => api.put(`/lvol/${encodeURIComponent(name)}/inflate`),
    setReadOnly: (name, readonly) => api.put(`/lvol/${encodeURIComponent(name)}/read-only`, { readonly })
  }

  // 简化的API访问，与组件中使用的方法名保持一致
  static bdev = {
    getBdevs: () => ApiService.bdevs.getAll()
  }

  static lvol = {
    getLvStores: () => ApiService.lvstores.getAll(),
    getLvols: () => ApiService.lvols.getAll(),
    createLvStore: (bdevName, storeName, clusterSize) => ApiService.lvstores.create({
      lvs_name: storeName,
      bdev_name: bdevName,
      cluster_sz: clusterSize * 1024 * 1024 // Convert MB to bytes
    }),
    deleteLvStore: (storeName) => {
      // 这个方法需要先获取UUID，然后删除
      return ApiService.lvstores.getAll().then(response => {
        const store = response.data?.find(s => s.name === storeName)
        if (store) {
          return ApiService.lvstores.delete(store.uuid)
        } else {
          throw new Error('找不到指定的LV Store')
        }
      })
    },
    createLvol: (storeUuid, name, sizeInMib, thinProvision) => ApiService.lvols.create({
      uuid: storeUuid,
      lvol_name: name,
      size_in_mib: sizeInMib,  // 使用正确的参数名，直接传递MiB值
      thin_provision: thinProvision
    }),
    deleteLvol: (name) => ApiService.lvols.delete(name),
    resizeLvol: (name, sizeInMib) => ApiService.lvols.resize(name, sizeInMib)  // 直接传递MiB值
  }
  
  static hosts = {
    getAll: () => api.get('/hosts'),
    getById: (id) => api.get(`/hosts/${id}`),
    create: (data) => api.post('/hosts', data),
    update: (id, data) => api.put(`/hosts/${id}`, data),
    delete: (id) => api.delete(`/hosts/${id}`)
  }
  
  static nvmeof = {
    // 子系统管理
    getSubsystems: () => api.get('/nqns'),
    createSubsystem: (data) => api.post('/nqns', data),
    deleteSubsystem: (nqn) => api.delete(`/nqns/${encodeURIComponent(nqn)}`),
    getSubsystem: (nqn) => api.get(`/nqns/${encodeURIComponent(nqn)}`),
    
    // 主机管理 (SPDK操作)
    getSubsystemHosts: (nqn) => api.get(`/nqns/${encodeURIComponent(nqn)}/hosts`),
    addSubsystemHost: (nqn, data) => api.post(`/nqns/${encodeURIComponent(nqn)}/hosts`, data),
    removeSubsystemHost: (nqn, hostNqn) => api.delete(`/nqns/${encodeURIComponent(nqn)}/hosts/${encodeURIComponent(hostNqn)}`),
    
    // 监听器管理
    getSubsystemListeners: (nqn) => api.get(`/nqns/${encodeURIComponent(nqn)}/listeners`),
    createSubsystemListener: (nqn, data) => api.post(`/nqns/${encodeURIComponent(nqn)}/listeners`, data),
    deleteSubsystemListener: (nqn, trtype, traddr, trsvcid) => api.delete(`/nqns/${encodeURIComponent(nqn)}/listeners/${trtype}:${traddr}:${trsvcid}`),
    
    // 命名空间管理
    addSubsystemNamespace: (nqn, data) => api.post(`/nqns/${encodeURIComponent(nqn)}/namespaces`, data),
    removeSubsystemNamespace: (nqn, nsid) => api.delete(`/nqns/${encodeURIComponent(nqn)}/namespaces/${nsid}`),
    
    // 在线客户端监控
    getSubsystemControllers: (nqn) => api.get(`/nqns/${encodeURIComponent(nqn)}/controllers`),
    getSubsystemQpairs: (nqn) => api.get(`/nqns/${encodeURIComponent(nqn)}/qpairs`),
    
    // 允许所有主机设置
    setAllowAnyHost: (nqn, allow) => api.put(`/nqns/${encodeURIComponent(nqn)}/allow-any-host`, { allow_any_host: allow })
  }
  
  static system = {
    getStatus: () => api.get('/system/status'),
    getHealth: () => api.get('/system/health'),
    getNetworkInterfaces: () => api.get('/system/network-interfaces')
  }

  static config = {
    save: () => api.post('/config/save')
  }
}

export default api 