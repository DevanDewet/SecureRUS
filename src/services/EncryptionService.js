const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.tagLength = 16; // 128 bits
        this.saltLength = 64; // 512 bits
        
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
        const data = `${filename}-${userId}-${Date.now()}`;
        const salt = crypto.randomBytes(this.saltLength);
        
        // Derive key using PBKDF2
        const fileKey = crypto.pbkdf2Sync(data, salt, 100000, this.keyLength, 'sha512');
        
        return {
            key: fileKey,
            salt: salt,
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
            const { key, salt, keyHash } = this.generateFileKey(filename, userId);
            
            // Create cipher
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipher(this.algorithm, key);
            cipher.setAAD(Buffer.from(filename, 'utf8'));
            
            // Encrypt content
            let encrypted = cipher.update(fileContent);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            // Get authentication tag
            const tag = cipher.getAuthTag();
            
            // Create encrypted file structure
            const encryptedData = {
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                salt: salt.toString('hex'),
                data: encrypted.toString('hex'),
                algorithm: this.algorithm,
                timestamp: Date.now()
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
            
            // Reconstruct file key
            const { key } = this.reconstructFileKey(filename, userId, encryptedData.salt, keyHash);
            
            // Create decipher
            const decipher = crypto.createDecipher(this.algorithm, key);
            decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
            decipher.setAAD(Buffer.from(filename, 'utf8'));
            
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
    reconstructFileKey(filename, userId, saltHex, expectedKeyHash) {
        const salt = Buffer.from(saltHex, 'hex');
        
        // Try different timestamp variations (brute force approach for demo)
        // In production, you'd store the exact timestamp or use a different approach
        const baseData = `${filename}-${userId}`;
        
        // For now, we'll use PBKDF2 with the salt to recreate the key
        // This is a simplified approach - in production, you'd need better key management
        const key = crypto.pbkdf2Sync(baseData, salt, 100000, this.keyLength, 'sha512');
        const keyHash = crypto.createHash('sha256').update(key).digest('hex');
        
        if (keyHash !== expectedKeyHash) {
            throw new Error('Key verification failed - unauthorized access attempt');
        }
        
        return { key, salt };
    }

    // Encrypt text content (for confidential text files)
    encryptText(text, filename, userId) {
        try {
            const { key, salt, keyHash } = this.generateFileKey(filename, userId);
            
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipher(this.algorithm, key);
            cipher.setAAD(Buffer.from(filename, 'utf8'));
            
            let encrypted = cipher.update(text, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            const tag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                salt: salt.toString('hex'),
                data: encrypted.toString('hex'),
                keyHash,
                algorithm: this.algorithm,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('Text encryption failed:', error.message);
            throw new Error(`Text encryption failed: ${error.message}`);
        }
    }

    // Decrypt text content
    decryptText(encryptedData, filename, userId) {
        try {
            const { key } = this.reconstructFileKey(filename, userId, encryptedData.salt, encryptedData.keyHash);
            
            const decipher = crypto.createDecipher(this.algorithm, key);
            decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
            decipher.setAAD(Buffer.from(filename, 'utf8'));
            
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
