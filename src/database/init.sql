-- ====================================
-- SPDK Web Manager 数据库初始化脚本
-- ====================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1
);

-- NVMe-oF子系统表
CREATE TABLE IF NOT EXISTS nqns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nqn VARCHAR(255) UNIQUE NOT NULL,
    subsystem_name VARCHAR(100) NOT NULL,
    serial_number VARCHAR(50),
    model_number VARCHAR(50),
    max_namespaces INTEGER DEFAULT 256,
    allow_any_host BOOLEAN DEFAULT 0,
    transport_type VARCHAR(20) DEFAULT 'tcp',
    target_address VARCHAR(45),
    target_port INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users (id)
);

-- BDEV表
CREATE TABLE IF NOT EXISTS bdevs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    path VARCHAR(500),
    size_bytes BIGINT,
    block_size INTEGER,
    uuid VARCHAR(36),
    transport_address VARCHAR(255),
    namespace_id INTEGER,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users (id)
);

-- RAID表
CREATE TABLE IF NOT EXISTS raids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) UNIQUE NOT NULL,
    raid_level VARCHAR(20) NOT NULL,
    strip_size INTEGER,
    num_base_bdevs INTEGER,
    base_bdevs TEXT, -- JSON array of bdev names
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (created_by) REFERENCES users (id)
);

-- 子系统命名空间表
CREATE TABLE IF NOT EXISTS nqn_namespaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nqn_id INTEGER NOT NULL,
    namespace_id INTEGER NOT NULL,
    bdev_name VARCHAR(100) NOT NULL,
    uuid VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (nqn_id) REFERENCES nqns (id) ON DELETE CASCADE,
    UNIQUE(nqn_id, namespace_id)
);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

-- NVMe-oF主机管理表
CREATE TABLE IF NOT EXISTS nvmeof_hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nqn VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    description TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
);

-- ====================================
-- 初始数据插入
-- ====================================

-- 插入默认管理员账户 (密码: admin123)
INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@localhost', '$2b$10$YQz8Qx0./HYECZOJJfyv9OQNhkW4lPk5ZGQ3vXm2mPY0CqZGxKEuK', 'admin');

-- 插入一些默认的NVMe-oF主机
INSERT OR IGNORE INTO nvmeof_hosts (nqn, name, description, created_by) VALUES 
('nqn.2014-08.org.nvmexpress:uuid:035e02d8-04d3-05e7-b906-ae0700080009', '测试主机1', 'SPDK测试主机', 1),
('nqn.2014-08.com.example:host1', '开发主机1', '开发环境测试主机', 1),
('nqn.2014-08.com.example:host2', '开发主机2', '开发环境测试主机', 1);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_nqns_nqn ON nqns(nqn);
CREATE INDEX IF NOT EXISTS idx_bdevs_name ON bdevs(name);
CREATE INDEX IF NOT EXISTS idx_bdevs_type ON bdevs(type);
CREATE INDEX IF NOT EXISTS idx_raids_name ON raids(name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_nvmeof_hosts_nqn ON nvmeof_hosts(nqn);

-- ====================================
-- 数据库版本和元数据
-- ====================================

-- 数据库版本信息表
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

-- 插入当前版本信息
INSERT OR IGNORE INTO schema_version (version, description) VALUES 
(1, 'Initial database schema with all core tables'); 