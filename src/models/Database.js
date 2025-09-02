const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.dbPath = process.env.DB_PATH || './database/secureus.db';
        this.ensureDirectoryExists();
        this.db = new sqlite3.Database(this.dbPath);
        this.init();
    }

    ensureDirectoryExists() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    init() {
        this.createTables();
        this.createDefaultAdmin();
    }

    createTables() {
        const tables = [
            // Users table with comprehensive security fields
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'GUEST',
                status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
                mfa_secret TEXT,
                mfa_enabled BOOLEAN DEFAULT 0,
                backup_codes TEXT,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until DATETIME,
                last_login DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                approved_by INTEGER,
                approved_at DATETIME,
                FOREIGN KEY (approved_by) REFERENCES users (id)
            )`,

            // File metadata table
            `CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                category TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                upload_path TEXT NOT NULL,
                uploaded_by INTEGER NOT NULL,
                is_encrypted BOOLEAN DEFAULT 0,
                encryption_key_hash TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (uploaded_by) REFERENCES users (id)
            )`,

            // Audit logs for security monitoring
            `CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT NOT NULL,
                resource TEXT,
                ip_address TEXT,
                user_agent TEXT,
                success BOOLEAN NOT NULL,
                error_message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT,
                risk_score INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Sessions table for enhanced session management
            `CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`,

            // Role permissions matrix
            `CREATE TABLE IF NOT EXISTS role_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                resource TEXT NOT NULL,
                can_create BOOLEAN DEFAULT 0,
                can_read BOOLEAN DEFAULT 0,
                can_write BOOLEAN DEFAULT 0,
                can_delete BOOLEAN DEFAULT 0
            )`
        ];

        tables.forEach(sql => {
            this.db.run(sql, (err) => {
                if (err) {
                    console.error('Error creating table:', err.message);
                } else {
                    console.log('Database table created successfully');
                }
            });
        });

        // Create indexes for performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)',
            'CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)',
            'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)',
            'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)',
            'CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files (uploaded_by)',
            'CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions (role)'
        ];

        indexes.forEach(sql => {
            this.db.run(sql);
        });

        // Insert default role permissions
        this.setupRolePermissions();
    }

    setupRolePermissions() {
        const permissions = [
            // Admin permissions - full access to everything
            { role: 'ADMIN', resource: 'IMAGES', create: 1, read: 1, write: 1, delete: 1 },
            { role: 'ADMIN', resource: 'DOCUMENTS', create: 1, read: 1, write: 1, delete: 1 },
            { role: 'ADMIN', resource: 'CONFIDENTIAL', create: 1, read: 1, write: 1, delete: 1 },
            
            // Manager permissions
            { role: 'MANAGER', resource: 'IMAGES', create: 1, read: 1, write: 1, delete: 1 },
            { role: 'MANAGER', resource: 'DOCUMENTS', create: 1, read: 1, write: 1, delete: 1 },
            { role: 'MANAGER', resource: 'CONFIDENTIAL', create: 1, read: 1, write: 1, delete: 0 },
            
            // User permissions
            { role: 'USER', resource: 'IMAGES', create: 0, read: 1, write: 1, delete: 0 },
            { role: 'USER', resource: 'DOCUMENTS', create: 0, read: 1, write: 1, delete: 0 },
            { role: 'USER', resource: 'CONFIDENTIAL', create: 0, read: 1, write: 0, delete: 0 },
            
            // Guest permissions
            { role: 'GUEST', resource: 'IMAGES', create: 0, read: 1, write: 0, delete: 0 },
            { role: 'GUEST', resource: 'DOCUMENTS', create: 0, read: 0, write: 0, delete: 0 },
            { role: 'GUEST', resource: 'CONFIDENTIAL', create: 0, read: 0, write: 0, delete: 0 }
        ];

        const insertPermission = this.db.prepare(`
            INSERT OR IGNORE INTO role_permissions 
            (role, resource, can_create, can_read, can_write, can_delete) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        permissions.forEach(perm => {
            insertPermission.run([
                perm.role, perm.resource, perm.create, 
                perm.read, perm.write, perm.delete
            ]);
        });

        insertPermission.finalize();
    }

    async createDefaultAdmin() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT id FROM users WHERE email = ?', ['admin@secureus.com'], async (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!row) {
                    try {
                        const hashedPassword = await bcrypt.hash('SecureAdmin123!', 12);
                        
                        this.db.run(`
                            INSERT INTO users (email, password_hash, first_name, last_name, role, status, mfa_enabled)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `, [
                            'admin@secureus.com',
                            hashedPassword,
                            'System',
                            'Administrator',
                            'ADMIN',
                            'APPROVED',
                            0
                        ], function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                console.log(' Default admin user created successfully');
                                console.log(' Email: admin@secureus.com');
                                console.log(' Password: SecureAdmin123!');
                                console.log(' Please change the default password after first login!');
                                resolve(this.lastID);
                            }
                        });
                    } catch (hashError) {
                        reject(hashError);
                    }
                } else {
                    resolve(row.id);
                }
            });
        });
    }

    // User management methods
    async createUser(userData) {
        return new Promise((resolve, reject) => {
            const { email, password, firstName, lastName } = userData;
            
            bcrypt.hash(password, 12, (err, hashedPassword) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.db.run(`
                    INSERT INTO users (email, password_hash, first_name, last_name)
                    VALUES (?, ?, ?, ?)
                `, [email, hashedPassword, firstName, lastName], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
            });
        });
    }

    async getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getUserById(id) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Audit logging
    async logActivity(logData) {
        return new Promise((resolve, reject) => {
            const { userId, action, resource, ipAddress, userAgent, success, errorMessage, sessionId, riskScore } = logData;
            
            this.db.run(`
                INSERT INTO audit_logs 
                (user_id, action, resource, ip_address, user_agent, success, error_message, session_id, risk_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [userId, action, resource, ipAddress, userAgent, success, errorMessage, sessionId, riskScore || 0], 
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // Get role permissions
    async getRolePermissions(role, resource) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT * FROM role_permissions 
                WHERE role = ? AND resource = ?
            `, [role, resource], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Reset failed login attempts for a user
    resetFailedLogins(userId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET failed_login_attempts = 0, locked_until = NULL 
                WHERE id = ?
            `, [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Increment failed login attempts for a user
    incrementFailedLogins(userId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET failed_login_attempts = failed_login_attempts + 1,
                    locked_until = CASE 
                        WHEN failed_login_attempts + 1 >= 5 
                        THEN datetime('now', '+15 minutes')
                        ELSE locked_until
                    END
                WHERE id = ?
            `, [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Check if user account is locked
    isAccountLocked(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT locked_until, failed_login_attempts
                FROM users 
                WHERE id = ? AND locked_until IS NOT NULL AND locked_until > datetime('now')
            `, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row); // Returns true if locked, false otherwise
                }
            });
        });
    }

    // Update user's last login timestamp
    updateLastLogin(userId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE users 
                SET last_login = datetime('now')
                WHERE id = ?
            `, [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Close database connection
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

module.exports = Database;
