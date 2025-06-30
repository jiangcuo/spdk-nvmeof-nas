# SPDK NAS Manager

SPDK NAS Manager 是一个综合的存储管理平台，由 RESTful API 后端和现代化 Web 前端组成，用于管理 SPDK (Storage Performance Development Kit) 组件，包括 NVMe-oF 子系统、RAID 阵列、块设备和存储卷管理。

适配最新的spdk25.04 版本

## 🏗️ 架构

本程序将spdk_tgt rpc 通过socket转成了restful，默认使用`/var/tmp/spdk_tgt.sock`，并且有一个前端进行管理。

你需要配置好spdk_tgt的运行环境。可以配合pxvirt-spdk进行使用。也可以直接编译好spdk，然后执行。

```
spdk_tgt -m 0x2 -s 2048 -r /var/tmp/spdk_tgt.sock &
```

随后你就可以访问web http://ip:3000。默认账号为admin 密码为admin123

![](/img/index.png)


## 安装

### 安装nodejs npm
安装node20，推荐使用nvm安装
```
nvm install 20
nvm use 20
```

### 编译前端

```
cd webapp
npm install
npm run build
```

### 运行主程序
```
npm install 
npm run start
```



## 用法

### 创建bdev

要使用spdk，你需要创建bdev设备，目前网页上可以通过aio和用户态nvme创建bdev。

### 创建raid

如果想保证数据安全，可以创建bdev后，将多个bdev加入raid。raid也可以做为bdev。

### 创建lvstore

lvstore 就像vg一样，可以把一个或者多个bdev转成卷组，然后在下面创建lv。

### Mvmeof

需要创建一个NQN 之后，创建监听器和命名空间。命名空间选择bdev，就是nvmeof的对象

## 未完成项

目前程序只完成了SPDK 配置的保存。没有实现spdk 配置的加载。如果spdk程序重启了，那么你就要把配置给导入

```
spdk_rpc  -s /var/tmp/spdk_tgt.sock < /etc/spdk/spdk_tgt.conf
```

