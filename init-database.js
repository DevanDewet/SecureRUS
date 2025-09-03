// Database initialization script with proper async handling
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

async function initializeDatabase() {
    const dbPath = './database/secureus.db';
    
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    const db = new sqlite3.Database(dbPath);
    
    console.log('Creating database tables...');
    
    // Create tables synchronously using serialize
    await new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
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
            )`, (err) => {
                if (err) console.error('Error creating users table:', err.message);
                else console.log('Users table created');
            });

            // Files table
            db.run(`CREATE TABLE IF NOT EXISTS files (
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
            )`, (err) => {
                if (err) console.error('Error creating files table:', err.message);
                else console.log('Files table created');
            });

            // Audit logs table
            db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
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
            )`, (err) => {
                if (err) console.error('Error creating audit_logs table:', err.message);
                else console.log('Audit logs table created');
            });

            // Sessions table
            db.run(`CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`, (err) => {
                if (err) console.error('Error creating sessions table:', err.message);
                else console.log('Sessions table created');
            });

            // Role permissions table
            db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                resource TEXT NOT NULL,
                can_create BOOLEAN DEFAULT 0,
                can_read BOOLEAN DEFAULT 0,
                can_write BOOLEAN DEFAULT 0,
                can_delete BOOLEAN DEFAULT 0
            )`, (err) => {
                if (err) console.error('Error creating role_permissions table:', err.message);
                else console.log('Role permissions table created');
            });

            // Create indexes
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
                db.run(sql);
            });

            console.log('Database indexes created');

            // Insert role permissions
            setupRolePermissions(db, () => {
                // Create default admin user
                createDefaultAdmin(db, () => {
                    resolve();
                });
            });
        });
    });

    return db;
}

function setupRolePermissions(db, callback) {
    console.log('Setting up role permissions...');
    
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
        { role: 'USER', resource: 'CONFIDENTIAL', create: 0, read: 0, write: 0, delete: 0 },
        
        // Guest permissions - very limited
        { role: 'GUEST', resource: 'IMAGES', create: 0, read: 1, write: 0, delete: 0 },
        { role: 'GUEST', resource: 'DOCUMENTS', create: 0, read: 0, write: 0, delete: 0 },
        { role: 'GUEST', resource: 'CONFIDENTIAL', create: 0, read: 0, write: 0, delete: 0 }
    ];

    // Clear existing permissions first
    db.run('DELETE FROM role_permissions', (err) => {
        if (err) {
            console.error('Error clearing role permissions:', err.message);
            return callback();
        }

        const stmt = db.prepare(`
            INSERT OR IGNORE INTO role_permissions (role, resource, can_create, can_read, can_write, can_delete)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        let completed = 0;
        permissions.forEach(perm => {
            stmt.run([perm.role, perm.resource, perm.create, perm.read, perm.write, perm.delete], (err) => {
                if (err) {
                    console.error('Error inserting permission:', err.message);
                }
                completed++;
                if (completed === permissions.length) {
                    stmt.finalize();
                    console.log('Role permissions configured');
                    callback();
                }
            });
        });
    });
}

async function createDefaultAdmin(db, callback) {
    console.log('Creating default admin user...');
    
    db.get('SELECT id FROM users WHERE email = ?', ['admin@secureus.com'], async (err, row) => {
        if (err) {
            console.error('Error checking for admin user:', err.message);
            return callback();
        }
        
        if (!row) {
            try {
                const hashedPassword = await bcrypt.hash('SecureAdmin123!', 12);
                
                db.run(`
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
                        console.error('Error creating admin user:', err.message);
                    } else {
                        console.log('Default admin user created');
                    }
                    callback();
                });
            } catch (error) {
                console.error('Error hashing password:', error.message);
                callback();
            }
        } else {
            console.log('Default admin user already exists');
            callback();
        }
    });
}

async function main() {
    try {
        console.log('Initializing SecureRUS Database...\n');
        
        const db = await initializeDatabase();
        
        console.log('\nDatabase initialization completed successfully!');
        console.log('\nDefault Admin Credentials:');
        console.log('   Email: admin@secureus.com');
        console.log('   Password: SecureAdmin123!');
        console.log('   Please change the password after first login!\n');
        
        // Test the database
        db.get("SELECT count(*) as count FROM sqlite_master WHERE type='table'", (err, result) => {
            if (err) {
                console.error('Database test failed:', err.message);
            } else {
                console.log(`Database test successful - ${result.count} tables created`);
            }
            
            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed.');
                }
            });
        });
        
    } catch (error) {
        console.error('Database initialization failed:', error.message);
        process.exit(1);
    }
}

main();
