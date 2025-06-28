const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = process.env.DATABASE_PATH || '/etc/spdk/spdk_nas.db';
    }

    async initialize() {
        // 确保数据目录存在
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const createUserTable = `
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
            )
        `;

        const createNqnTable = `
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
            )
        `;

        const createBdevTable = `
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
            )
        `;

        const createRaidTable = `
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
            )
        `;

        const createNqnNamespaceTable = `
            CREATE TABLE IF NOT EXISTS nqn_namespaces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nqn_id INTEGER NOT NULL,
                namespace_id INTEGER NOT NULL,
                bdev_name VARCHAR(100) NOT NULL,
                uuid VARCHAR(36),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (nqn_id) REFERENCES nqns (id) ON DELETE CASCADE,
                UNIQUE(nqn_id, namespace_id)
            )
        `;

        const createAuditLogTable = `
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50) NOT NULL,
                resource_id VARCHAR(100),
                details TEXT,
                ip_address VARCHAR(45),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `;

        const createNvmeofHostsTable = `
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
            )
        `;

        const createLvstoreTable = `
            CREATE TABLE IF NOT EXISTS lv_stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid VARCHAR(36) UNIQUE NOT NULL,
                name VARCHAR(100) UNIQUE NOT NULL,
                base_bdev VARCHAR(100) NOT NULL,
                cluster_size BIGINT NOT NULL,
                total_data_clusters INTEGER NOT NULL,
                free_clusters INTEGER NOT NULL,
                block_size INTEGER NOT NULL,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (created_by) REFERENCES users (id)
            )
        `;

        const createLvolTable = `
            CREATE TABLE IF NOT EXISTS lvols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid VARCHAR(36) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                alias VARCHAR(255),
                lvstore_uuid VARCHAR(36) NOT NULL,
                size_bytes BIGINT NOT NULL,
                is_thin_provisioned BOOLEAN DEFAULT 1,
                is_snapshot BOOLEAN DEFAULT 0,
                is_clone BOOLEAN DEFAULT 0,
                num_allocated_clusters INTEGER DEFAULT 0,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (created_by) REFERENCES users (id),
                FOREIGN KEY (lvstore_uuid) REFERENCES lv_stores (uuid)
            )
        `;

        const createConfigHistoryTable = `
            CREATE TABLE IF NOT EXISTS config_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_data TEXT NOT NULL,
                saved_by INTEGER,
                file_path VARCHAR(500),
                bdev_count INTEGER DEFAULT 0,
                subsystem_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (saved_by) REFERENCES users (id)
            )
        `;

        const tables = [
            createUserTable,
            createNqnTable,
            createBdevTable,
            createRaidTable,
            createNqnNamespaceTable,
            createAuditLogTable,
            createNvmeofHostsTable,
            createLvstoreTable,
            createLvolTable,
            createConfigHistoryTable
        ];

        for (const table of tables) {
            await this.run(table);
        }

        // 运行数据库迁移
        await this.runMigrations();

        // 创建默认管理员用户
        await this.createDefaultAdmin();
    }

    async runMigrations() {
        // 检查并添加缺少的列和表
        try {
            // 检查 bdevs 表是否有 path 列
            const tableInfo = await this.all("PRAGMA table_info(bdevs)");
            const hasPathColumn = tableInfo.some(column => column.name === 'path');
            
            if (!hasPathColumn) {
                console.log('Adding path column to bdevs table...');
                await this.run('ALTER TABLE bdevs ADD COLUMN path VARCHAR(500)');
                console.log('Path column added successfully');
            }

            // 检查是否存在 nvmeof_hosts 表
            const tables = await this.all("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables.map(table => table.name);

            if (!tableNames.includes('nvmeof_hosts')) {
                console.log('Creating nvmeof_hosts table...');
                const createNvmeofHostsTable = `
                    CREATE TABLE nvmeof_hosts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nqn VARCHAR(255) UNIQUE NOT NULL,
                        name VARCHAR(100),
                        description TEXT,
                        is_active BOOLEAN DEFAULT 1,
                        created_by INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (created_by) REFERENCES users (id)
                    )
                `;
                await this.run(createNvmeofHostsTable);
                console.log('nvmeof_hosts table created successfully');
            }

            if (!tableNames.includes('lv_stores')) {
                console.log('Creating lv_stores table...');
                const createLvstoreTable = `
                    CREATE TABLE lv_stores (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        uuid VARCHAR(36) UNIQUE NOT NULL,
                        name VARCHAR(100) UNIQUE NOT NULL,
                        base_bdev VARCHAR(100) NOT NULL,
                        cluster_size BIGINT NOT NULL,
                        total_data_clusters INTEGER NOT NULL,
                        free_clusters INTEGER NOT NULL,
                        block_size INTEGER NOT NULL,
                        created_by INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active BOOLEAN DEFAULT 1,
                        FOREIGN KEY (created_by) REFERENCES users (id)
                    )
                `;
                await this.run(createLvstoreTable);
                console.log('lv_stores table created successfully');
            }

            if (!tableNames.includes('lvols')) {
                console.log('Creating lvols table...');
                const createLvolTable = `
                    CREATE TABLE lvols (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        uuid VARCHAR(36) UNIQUE NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        alias VARCHAR(255),
                        lvstore_uuid VARCHAR(36) NOT NULL,
                        size_bytes BIGINT NOT NULL,
                        is_thin_provisioned BOOLEAN DEFAULT 1,
                        is_snapshot BOOLEAN DEFAULT 0,
                        is_clone BOOLEAN DEFAULT 0,
                        num_allocated_clusters INTEGER DEFAULT 0,
                        created_by INTEGER,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active BOOLEAN DEFAULT 1,
                        FOREIGN KEY (created_by) REFERENCES users (id),
                        FOREIGN KEY (lvstore_uuid) REFERENCES lv_stores (uuid)
                    )
                `;
                await this.run(createLvolTable);
                console.log('lvols table created successfully');
            }

            if (!tableNames.includes('config_history')) {
                console.log('Creating config_history table...');
                const createConfigHistoryTable = `
                    CREATE TABLE config_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        config_data TEXT NOT NULL,
                        saved_by INTEGER,
                        file_path VARCHAR(500),
                        bdev_count INTEGER DEFAULT 0,
                        subsystem_count INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (saved_by) REFERENCES users (id)
                    )
                `;
                await this.run(createConfigHistoryTable);
                console.log('config_history table created successfully');
            }

        } catch (error) {
            console.error('Migration error:', error);
            // 继续执行，不要因为迁移失败而停止应用
        }
    }

    async createDefaultAdmin() {
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        const insertAdmin = `
            INSERT OR IGNORE INTO users (username, email, password_hash, role)
            VALUES ('admin', 'admin@localhost', ?, 'admin')
        `;
        
        await this.run(insertAdmin, [hashedPassword]);
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new Database(); 