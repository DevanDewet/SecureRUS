const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.iterations = 100000; // PBKDF2 iterations
        
        // Master key from environment (should be 32 characters)
        this.masterKey = this.deriveMasterKey();
    }

    deriveMasterKey() {
        const envKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production!!';
        
        // Ensure the key is exactly 32 bytes
        if (envKey.length !== 32) {
            // Use PBKDF2 to derive a proper 32-byte key
            return crypto.pbkdf2Sync(envKey, 'secureus-salt', 10000, 32, 'sha512');
        }
        
        return Buffer.from(envKey, 'utf8');
    }

    // Generate a file-specific encryption key
    generateFileKey(filename, userId) {
        const timestamp = Date.now();
        const data = `${filename}-${userId}-${timestamp}`;
        const salt = crypto.randomBytes(32);
        
        // Derive key using PBKDF2
        const fileKey = crypto.pbkdf2Sync(data, salt, this.iterations, this.keyLength, 'sha512');
        
        return {
            key: fileKey,
            salt: salt,
            timestamp: timestamp,
            keyHash: crypto.createHash('sha256').update(fileKey).digest('hex')
        };
    }

    // Encrypt file content
    async encryptFile(filePath, filename, userId) {
        try {
            console.log(`Encrypting file: ${filename} for user: ${userId}`);
            
            // Read original file
            const fileContent = await fs.readFile(filePath);
            
            // Generate file-specific key
            const { key, salt, timestamp, keyHash } = this.generateFileKey(filename, userId);
            
            // Create cipher
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            // Encrypt content
            let encrypted = cipher.update(fileContent);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            // Create encrypted file structure
            const encryptedData = {
                iv: iv.toString('hex'),
                salt: salt.toString('hex'),
                data: encrypted.toString('hex'),
                algorithm: this.algorithm,
                timestamp: timestamp
            };
            
            // Write encrypted file
            const encryptedPath = filePath + '.enc';
            await fs.writeFile(encryptedPath, JSON.stringify(encryptedData));
            
            // Remove original file for security
            await fs.unlink(filePath);
            
            console.log(`File encrypted successfully: ${encryptedPath}`);
            
            return {
                encryptedPath,
                keyHash,
                success: true
            };
            
        } catch (error) {
            console.error(`Encryption failed for ${filename}:`, error.message);
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    // Decrypt file content
    async decryptFile(encryptedPath, filename, userId, keyHash) {
        try {
            console.log(`Decrypting file: ${filename} for user: ${userId}`);
            
            // Read encrypted file
            const encryptedDataStr = await fs.readFile(encryptedPath, 'utf8');
            const encryptedData = JSON.parse(encryptedDataStr);
            
            // Ensure we have the timestamp from the encrypted data
            if (!encryptedData.timestamp) {
                throw new Error('Missing timestamp in encrypted data');
            }
            
            // Reconstruct file key using the stored timestamp
            const { key } = this.reconstructFileKey(filename, userId, encryptedData.salt, keyHash, encryptedData.timestamp);
            
            // Create decipher
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            
            // Decrypt content
            let decrypted = decipher.update(Buffer.from(encryptedData.data, 'hex'));
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            console.log(`File decrypted successfully: ${filename}`);
            
            return decrypted;
            
        } catch (error) {
            console.error(`Decryption failed for ${filename}:`, error.message);
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    // Reconstruct file key for decryption
    reconstructFileKey(filename, userId, saltHex, expectedKeyHash, timestamp) {
        const salt = Buffer.from(saltHex, 'hex');
        
        // Use the same key generation logic as generateFileKey with the stored timestamp
        const keySource = `${filename}-${userId}-${timestamp}`;
        const key = crypto.pbkdf2Sync(keySource, salt, this.iterations, this.keyLength, 'sha512');
        const keyHash = crypto.createHash('sha256').update(key).digest('hex');
        
        if (keyHash !== expectedKeyHash) {
            console.error(`Key verification failed. Expected: ${expectedKeyHash}, Got: ${keyHash}`);
            throw new Error('Key verification failed - unauthorized access attempt');
        }
        
        return { key, salt };
    }

    // Encrypt text content (for confidential text files)
    encryptText(text, filename, userId) {
        try {
            const { key, salt, timestamp, keyHash } = this.generateFileKey(filename, userId);
            
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            let encrypted = cipher.update(text, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            return {
                iv: iv.toString('hex'),
                salt: salt.toString('hex'),
                data: encrypted.toString('hex'),
                keyHash,
                algorithm: this.algorithm,
                timestamp: timestamp
            };
            
        } catch (error) {
            console.error('Text encryption failed:', error.message);
            throw new Error(`Text encryption failed: ${error.message}`);
        }
    }

    // Decrypt text content
    decryptText(encryptedData, filename, userId) {
        try {
            // Ensure we have the timestamp from the encrypted data
            if (!encryptedData.timestamp) {
                throw new Error('Missing timestamp in encrypted data');
            }
            
            const { key } = this.reconstructFileKey(filename, userId, encryptedData.salt, encryptedData.keyHash, encryptedData.timestamp);
            
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            
            let decrypted = decipher.update(Buffer.from(encryptedData.data, 'hex'), null, 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
            
        } catch (error) {
            console.error('Text decryption failed:', error.message);
            throw new Error(`Text decryption failed: ${error.message}`);
        }
    }

    // Generate secure backup codes for MFA
    generateBackupCodes(count = 10) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate 8-digit backup codes
            const code = crypto.randomInt(10000000, 99999999).toString();
            codes.push(code);
        }
        return codes;
    }

    // Hash backup codes for secure storage
    hashBackupCodes(codes) {
        return codes.map(code => ({
            code: crypto.createHash('sha256').update(code).digest('hex'),
            used: false
        }));
    }

    // Verify backup code
    verifyBackupCode(inputCode, hashedCodes) {
        const hashedInput = crypto.createHash('sha256').update(inputCode).digest('hex');
        
        const codeIndex = hashedCodes.findIndex(item => 
            item.code === hashedInput && !item.used
        );
        
        if (codeIndex !== -1) {
            hashedCodes[codeIndex].used = true;
            return true;
        }
        
        return false;
    }

    // Generate cryptographically secure session ID
    generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Generate CSRF token
    generateCSRFToken() {
        return crypto.randomBytes(32).toString('hex');
    }
}

module.exports = EncryptionService;
