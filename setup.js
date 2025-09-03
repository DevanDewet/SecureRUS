// Setup script to initialize the database and verify installation
const Database = require('./src/models/Database');

async function setupDatabase() {
    console.log('Setting up SecureRUS Database...');
    
    try {
        const database = new Database();
        
        // Wait for database initialization
        await new Promise((resolve, reject) => {
            let tableCount = 0;
            const expectedTables = 5; // users, files, audit_logs, sessions, role_permissions
            
            database.db.serialize(() => {
                // Check if tables exist
                database.db.get("SELECT count(*) as count FROM sqlite_master WHERE type='table'", (err, result) => {
                    if (err) {
                        console.error('Database check failed:', err.message);
                        reject(err);
                        return;
                    }
                    
                    console.log(`Found ${result.count} tables in database`);
                    
                    // Test basic operations
                    database.db.get("SELECT * FROM users WHERE email = ?", ['admin@secureus.com'], (err, user) => {
                        if (err) {
                            console.error('Failed to query users table:', err.message);
                            reject(err);
                            return;
                        }
                        
                        if (user) {
                            console.log('Default admin user found');
                        } else {
                            console.log('Default admin user not found');
                        }
                        
                        resolve();
                    });
                });
            });
        });
        
        console.log('Database setup completed successfully!');
        
        // Close database connection
        database.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
            process.exit(0);
        });
        
    } catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    }
}

// Check required dependencies
function checkDependencies() {
    console.log('Checking dependencies...');
    
    const requiredPackages = [
        'sqlite3',
        'bcrypt',
        'express',
        'jsonwebtoken',
        'speakeasy',
        'qrcode',
        'helmet',
        'express-rate-limit',
        'multer'
    ];
    
    const missingPackages = [];
    
    for (const pkg of requiredPackages) {
        try {
            require(pkg);
            console.log(`${pkg}: installed`);
        } catch (error) {
            console.log(`${pkg}: missing`);
            missingPackages.push(pkg);
        }
    }
    
    if (missingPackages.length > 0) {
        console.log(`\nMissing packages: ${missingPackages.join(', ')}`);
        console.log('Run: npm install');
        return false;
    }
    
    console.log('All dependencies are installed');
    return true;
}

// Main setup function
async function main() {
    console.log('SecureRUS Setup Script Starting...\n');
    
    // Check dependencies first
    if (!checkDependencies()) {
        process.exit(1);
    }
    
    console.log('');
    
    // Setup database
    await setupDatabase();
}

main().catch(console.error);
