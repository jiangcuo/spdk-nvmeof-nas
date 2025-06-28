# SPDK NAS Manager - Frontend

基于 Vue.js 3 + Element Plus 的现代化 SPDK 存储管理 Web 界面。

## ✨ 功能特性

### 🔐 用户认证
- JWT token 认证机制
- 自动登录状态保持（2小时有效期）
- 角色权限控制（管理员/普通用户）
- 安全的会话管理

### 📊 系统仪表板
- 实时系统状态监控
- 存储设备统计概览
- SPDK 连接状态检查
- 快速操作导航

### 💾 磁盘管理
- 物理磁盘发现和监控
- NVMe 设备支持
- SMART 健康状态检查
- 磁盘容量和分区信息
- 挂载状态检测

### 🔧 BDEV 管理
- Block Device 创建、删除、列表
- 支持多种 BDEV 类型：
  - NVMe 设备附加
  - Memory malloc 设备
  - AIO 文件设备
- 设备详细信息查看

### 🗄️ RAID 管理
- RAID 阵列创建和管理
- 基础 BDEV 动态添加/移除
- RAID 级别配置
- 阵列状态监控

### 📁 逻辑卷管理（LVol）
- **分层架构显示：**
  - LV Store（卷组）管理
    - 创建、删除、重命名 LV Store
    - LV Store 容量扩展
  - LVol（逻辑卷）管理
    - 创建、删除、重命名逻辑卷
    - 动态调整大小
    - 快照和克隆功能
    - 精简配置转厚配置

### 🌐 NVMe-oF 管理
- **多层级管理架构：**
  - 客户端管理
  - 启动器（Subsystem）管理
    - 目标（Namespace）管理
    - 客户端分配
    - 监听器配置（IP地址、端口、协议）
  - 传输协议管理（TCP & RDMA）

## 🚀 快速开始

### 环境要求

- Node.js 16.x 或更高版本
- npm 或 yarn 包管理器
- 现代浏览器（支持 ES6+）

### 安装依赖

```bash
cd webapp
npm install
```

### 开发模式运行

```bash
npm run dev
```

应用将在 http://localhost:8080 启动，并自动代理后端 API 请求到 http://localhost:3000

### 生产构建

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 预览生产版本

```bash
npm run serve
```

## 📂 项目结构

```
webapp/
├── public/                 # 静态资源
├── src/
│   ├── components/         # 可复用组件
│   ├── layouts/           # 布局组件
│   │   └── MainLayout.vue # 主应用布局
│   ├── router/            # 路由配置
│   │   └── index.js       # 主路由文件
│   ├── services/          # API 服务
│   │   └── api.js         # HTTP 客户端
│   ├── stores/            # 状态管理
│   │   └── user.js        # 用户状态
│   ├── views/             # 页面组件
│   │   ├── Login.vue      # 登录页面
│   │   ├── Dashboard.vue  # 仪表板
│   │   ├── DiskManagement.vue      # 磁盘管理
│   │   ├── BdevManagement.vue      # BDEV 管理
│   │   ├── RaidManagement.vue      # RAID 管理
│   │   ├── LvolManagement.vue      # 逻辑卷管理
│   │   └── NvmeofManagement.vue    # NVMe-oF 管理
│   ├── App.vue            # 根组件
│   └── main.js            # 应用入口
├── index.html             # HTML 模板
├── package.json           # 项目配置
├── vite.config.js         # Vite 配置
└── README.md              # 项目文档
```

## 🔧 配置说明

### API 代理配置

在 `vite.config.js` 中配置了 API 代理：

```javascript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      secure: false
    }
  }
}
```

### 环境变量

可以创建 `.env` 文件来配置环境变量：

```env
# API 基础地址（生产环境）
VITE_API_BASE_URL=https://your-api-domain.com

# 应用标题
VITE_APP_TITLE=SPDK NAS Manager
```

## 🎨 UI 组件库

项目使用 [Element Plus](https://element-plus.org/) 作为 UI 组件库：

- 🎭 支持中文本地化
- 🌙 内置深色模式支持
- 📱 响应式设计
- ♿ 无障碍访问支持
- 🎨 可自定义主题

## 🔐 认证机制

### JWT Token 管理

- 登录成功后，JWT token 存储在 Cookie 中
- Token 有效期：2小时
- 自动在 HTTP 请求头中添加 Authorization
- Token 过期自动跳转登录页

### 权限控制

- 路由级权限守卫
- 组件级权限控制
- API 级权限验证

## 📱 响应式设计

支持多种屏幕尺寸：

- 🖥️ 桌面端（1200px+）
- 💻 笔记本（992px - 1199px）
- 📱 平板（768px - 991px）
- 📱 手机（<768px）

## 🛠️ 开发指南

### 添加新页面

1. 在 `src/views/` 创建 Vue 组件
2. 在 `src/router/index.js` 添加路由配置
3. 在 `src/services/api.js` 添加相关 API 方法

### 状态管理

使用 Pinia 进行状态管理：

```javascript
// 创建新的 store
import { defineStore } from 'pinia'

export const useMyStore = defineStore('myStore', () => {
  const state = ref('initial')
  
  const setState = (newState) => {
    state.value = newState
  }
  
  return { state, setState }
})
```

### API 调用

使用统一的 API 服务：

```javascript
import { ApiService } from '@/services/api'

// 调用 API
const response = await ApiService.disks.getAll()
```

## 🚀 部署说明

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/webapp/dist;
    index index.html;
    
    # API 代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Docker 部署

```dockerfile
FROM nginx:alpine

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

## 🎯 核心特性

### 🔄 实时数据更新
- 自动刷新系统状态
- WebSocket 支持（规划中）
- 数据缓存机制

### 🎨 现代化界面
- Material Design 风格
- 平滑过渡动画
- 直观的操作反馈

### 🔧 高度可配置
- 主题自定义
- 布局调整
- 功能模块开关

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交变更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 故障排除

### 常见问题

1. **API 请求失败**
   - 检查后端服务是否启动
   - 确认代理配置是否正确

2. **登录失败**
   - 检查用户名密码是否正确
   - 确认后端认证服务正常

3. **页面白屏**
   - 检查浏览器控制台错误信息
   - 确认依赖安装完整

### 开发模式调试

```bash
# 启用详细日志
npm run dev -- --debug

# 分析构建产物
npm run build -- --analyze
```

## 📞 技术支持

如遇到问题，请：

1. 查看浏览器控制台错误信息
2. 检查网络请求状态
3. 查阅本文档的故障排除部分
4. 提交 Issue 并附上详细信息

---

**🚀 SPDK NAS Manager Frontend - 让存储管理变得简单高效！** 