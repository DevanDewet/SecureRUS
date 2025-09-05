const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const EncryptionService = require('../services/EncryptionService');
const SecurityMiddleware = require('../middleware/SecurityMiddleware');

function createFileRoutes(database, authMiddleware) {
    const router = express.Router();
    const encryptionService = new EncryptionService();

    // Configure multer for file uploads
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            const category = req.body.category || 'DOCUMENTS';
            const uploadPath = path.join(__dirname, '../../uploads', category.toLowerCase());
            cb(null, uploadPath);
        },
        filename: function (req, file, cb) {
            // Generate secure filename
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            cb(null, `${uniqueSuffix}-${sanitizedName}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        // Get category from URL path since req.body may not be parsed yet
        const urlPath = req.path;
        let category = '';
        
        if (urlPath.includes('/images')) {
            category = 'IMAGES';
        } else if (urlPath.includes('/documents')) {
            category = 'DOCUMENTS';
        } else if (urlPath.includes('/confidential')) {
            category = 'CONFIDENTIAL';
        } else {
            return cb(new Error('Invalid category'), false);
        }
        
        let allowedTypes = [];

        switch (category) {
            case 'IMAGES':
                allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                break;
            case 'DOCUMENTS':
                allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
                break;
            case 'CONFIDENTIAL':
                allowedTypes = ['text/plain', 'application/pdf'];
                break;
            default:
                return cb(new Error('Invalid category'), false);
        }

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed for ${category}. Allowed types: ${allowedTypes.join(', ')}`), false);
        }
    };

    const upload = multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB max
            files: 1 // Only one file at a time
        }
    });

    // Images endpoint
    router.all('/images', 
        authMiddleware.authenticateToken(),
        // Only validate for non-file uploads (JSON requests)
        (req, res, next) => {
            if (req.get('Content-Type') && req.get('Content-Type').includes('application/json')) {
                return SecurityMiddleware.validateFileUpload[0](req, res, () => {
                    SecurityMiddleware.validateFileUpload[1](req, res, () => {
                        SecurityMiddleware.handleValidationErrors(req, res, next);
                    });
                });
            }
            next();
        },
        async (req, res) => {
            return await handleFileOperation('IMAGES', req, res, database, authMiddleware, encryptionService, upload);
        }
    );

    // Documents endpoint  
    router.all('/documents',
        authMiddleware.authenticateToken(),
        // Only validate for non-file uploads (JSON requests)
        (req, res, next) => {
            if (req.get('Content-Type') && req.get('Content-Type').includes('application/json')) {
                return SecurityMiddleware.validateFileUpload[0](req, res, () => {
                    SecurityMiddleware.validateFileUpload[1](req, res, () => {
                        SecurityMiddleware.handleValidationErrors(req, res, next);
                    });
                });
            }
            next();
        },
        async (req, res) => {
            return await handleFileOperation('DOCUMENTS', req, res, database, authMiddleware, encryptionService, upload);
        }
    );

    // Confidential endpoint (requires MFA for write operations)
    router.all('/confidential',
        authMiddleware.authenticateToken(),
        async (req, res, next) => {
            // Require MFA for write/create operations on confidential files
            if (['create', 'write'].includes(req.body.action)) {
                return authMiddleware.requireMFA('CONFIDENTIAL_WRITE')(req, res, next);
            }
            next();
        },
        // Only validate for non-file uploads (JSON requests)
        (req, res, next) => {
            if (req.get('Content-Type') && req.get('Content-Type').includes('application/json')) {
                return SecurityMiddleware.validateFileUpload[0](req, res, () => {
                    SecurityMiddleware.validateFileUpload[1](req, res, () => {
                        SecurityMiddleware.handleValidationErrors(req, res, next);
                    });
                });
            }
            next();
        },
        async (req, res) => {
            return await handleFileOperation('CONFIDENTIAL', req, res, database, authMiddleware, encryptionService, upload);
        }
    );

    // Main file operation handler
    async function handleFileOperation(category, req, res, database, authMiddleware, encryptionService, upload) {
        try {
            // For file uploads, we need to handle multer first
            if (req.get('Content-Type') && req.get('Content-Type').includes('multipart/form-data')) {
                // This is a file upload, let multer parse it first
                return new Promise((resolve, reject) => {
                    upload.single('file')(req, res, async (err) => {
                        if (err) {
                            console.error('Multer error:', err.message);
                            return res.status(400).json({
                                success: false,
                                message: err.message
                            });
                        }

                        // Now req.body should be available
                        const { action } = req.body;
                        
                        if (!action) {
                            return res.status(400).json({
                                success: false,
                                message: 'Action is required in request body'
                            });
                        }

                        // Validate file upload data
                        const reqCategory = req.body.category;
                        const reqAction = req.body.action;

                        if (!reqCategory || !['IMAGES', 'DOCUMENTS', 'CONFIDENTIAL'].includes(reqCategory)) {
                            return res.status(400).json({
                                success: false,
                                message: 'Validation failed',
                                errors: [{
                                    field: 'category',
                                    message: 'Invalid file category'
                                }]
                            });
                        }

                        if (!reqAction || !['create', 'read', 'write', 'delete', 'list'].includes(reqAction)) {
                            return res.status(400).json({
                                success: false,
                                message: 'Validation failed',
                                errors: [{
                                    field: 'action',
                                    message: 'Invalid action specified'
                                }]
                            });
                        }

                        // Continue with the file operation
                        try {
                            await continueFileOperation(category, req, res, database, authMiddleware, encryptionService);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
            } else {
                // This is a JSON request (list, read, delete)
                const { action } = req.body;
                
                if (!action) {
                    return res.status(400).json({
                        success: false,
                        message: 'Action is required in request body'
                    });
                }

                await continueFileOperation(category, req, res, database, authMiddleware, encryptionService);
            }

        } catch (error) {
            console.error(`File operation error:`, error.message);
            await authMiddleware.logActivity(req, `${category}_ERROR`, error.message, false);
            
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    // Continue with the actual file operation logic
    async function continueFileOperation(category, req, res, database, authMiddleware, encryptionService) {
        const { action } = req.body;
        
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User authentication failed'
            });
        }
        
        const userId = req.user.id;
        const userRole = req.user.role;

        console.log(`File operation: ${action} on ${category} by user ${userId} (${userRole})`);

        // Check permissions
        const permissions = await database.getRolePermissions(userRole, category);
        if (!permissions) {
            await authMiddleware.logActivity(req, `${category}_${action.toUpperCase()}_DENIED`, 'No permissions', false);
            return res.status(403).json({
                success: false,
                message: 'Access denied - no permissions for this resource'
            });
        }

        const hasPermission = checkActionPermission(permissions, action);
        if (!hasPermission) {
            await authMiddleware.logActivity(req, `${category}_${action.toUpperCase()}_DENIED`, 'Insufficient permissions', false);
            return res.status(403).json({
                success: false,
                message: `Access denied - cannot ${action} ${category.toLowerCase()} files`
            });
        }

        // Route to appropriate action handler
        switch (action) {
            case 'list':
                return await listFiles(category, req, res, database, authMiddleware);
            case 'read':
                return await readFile(category, req, res, database, authMiddleware, encryptionService);
            case 'create':
                return await createFile(category, req, res, database, authMiddleware, encryptionService);
            case 'write':
                return await writeFile(category, req, res, database, authMiddleware, encryptionService);
            case 'delete':
                return await deleteFile(category, req, res, database, authMiddleware);
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid action specified'
                });
        }
    }

    // List files in category
    async function listFiles(category, req, res, database, authMiddleware) {
        try {
            const files = await new Promise((resolve, reject) => {
                database.db.all(`
                    SELECT f.id, f.filename, f.original_name, f.file_size, f.created_at, f.uploaded_by,
                           u.first_name, u.last_name
                    FROM files f
                    JOIN users u ON f.uploaded_by = u.id
                    WHERE f.category = ?
                    ORDER BY f.created_at DESC
                `, [category], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            await authMiddleware.logActivity(req, `${category}_LIST`, `Listed ${files.length} files`, true);

            res.json({
                success: true,
                files: files.map(file => ({
                    id: file.id,
                    filename: file.original_name,
                    size: file.file_size,
                    uploadedBy: `${file.first_name} ${file.last_name}`,
                    uploadedAt: file.created_at
                }))
            });

        } catch (error) {
            console.error('List files error:', error.message);
            throw error;
        }
    }

    // Read/download file
    async function readFile(category, req, res, database, authMiddleware, encryptionService) {
        try {
            const { fileId } = req.body;
            
            if (!fileId) {
                return res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
            }

            // Get file metadata
            const file = await new Promise((resolve, reject) => {
                database.db.get(`
                    SELECT * FROM files WHERE id = ? AND category = ?
                `, [fileId, category], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }

            const filePath = file.upload_path;

            // For confidential files, decrypt content
            if (category === 'CONFIDENTIAL' && file.is_encrypted) {
                try {
                    const decryptedContent = await encryptionService.decryptFile(
                        filePath, 
                        file.original_name, 
                        file.uploaded_by, 
                        file.encryption_key_hash
                    );

                    await authMiddleware.logActivity(req, `${category}_READ`, `File: ${file.original_name}`, true);

                    // For confidential files, return content instead of download
                    return res.json({
                        success: true,
                        content: decryptedContent.toString('utf8'),
                        filename: file.original_name,
                        message: 'Confidential file content retrieved'
                    });

                } catch (decryptionError) {
                    console.error('Decryption error:', decryptionError.message);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to decrypt file'
                    });
                }
            } else {
                // For non-confidential files, serve for download
                try {
                    await fs.access(filePath);
                    
                    await authMiddleware.logActivity(req, `${category}_READ`, `File: ${file.original_name}`, true);
                    
                    res.download(filePath, file.original_name);
                } catch (fileError) {
                    return res.status(404).json({
                        success: false,
                        message: 'File not found on disk'
                    });
                }
            }

        } catch (error) {
            console.error('Read file error:', error.message);
            throw error;
        }
    }

    // Create/upload new file
    async function createFile(category, req, res, database, authMiddleware, encryptionService) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            try {
                const userId = req.user.id;
                let finalPath = req.file.path;
                let isEncrypted = false;
                let encryptionKeyHash = null;

                // Encrypt confidential files
                if (category === 'CONFIDENTIAL') {
                    const encryptionResult = await encryptionService.encryptFile(
                        req.file.path,
                        req.file.originalname,
                        userId
                    );
                    finalPath = encryptionResult.encryptedPath;
                    isEncrypted = true;
                    encryptionKeyHash = encryptionResult.keyHash;
                }

                // Save file metadata to database
                const fileId = await new Promise((resolve, reject) => {
                    database.db.run(`
                        INSERT INTO files (filename, original_name, file_type, category, file_size, 
                                         upload_path, uploaded_by, is_encrypted, encryption_key_hash)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        req.file.filename,
                        req.file.originalname,
                        req.file.mimetype,
                        category,
                        req.file.size,
                        finalPath,
                        userId,
                        isEncrypted,
                        encryptionKeyHash
                    ], function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    });
                });

                await authMiddleware.logActivity(req, `${category}_CREATE`, `File: ${req.file.originalname} (ID: ${fileId})`, true);

                console.log(`File uploaded successfully: ${req.file.originalname} (ID: ${fileId})`);

                res.json({
                    success: true,
                    message: 'File uploaded successfully',
                    fileId: fileId,
                    filename: req.file.originalname,
                    encrypted: isEncrypted
                });

            } catch (error) {
                console.error('Create file error:', error.message);
                
                // Clean up uploaded file on error
                try {
                    await fs.unlink(req.file.path);
                } catch (cleanupError) {
                    console.error('File cleanup error:', cleanupError.message);
                }
                
                throw error;
            }
        } catch (error) {
            console.error('File upload error:', error.message);
            return res.status(500).json({
                success: false,
                message: 'File upload failed'
            });
        }
    }

    // Write/edit file content (for confidential text files)
    async function writeFile(category, req, res, database, authMiddleware, encryptionService) {
        try {
            const { fileId, content } = req.body;
            
            if (!fileId || !content) {
                return res.status(400).json({
                    success: false,
                    message: 'File ID and content are required'
                });
            }

            // Get file metadata
            const file = await new Promise((resolve, reject) => {
                database.db.get(`
                    SELECT * FROM files WHERE id = ? AND category = ?
                `, [fileId, category], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }

            // For confidential files, encrypt the new content
            if (category === 'CONFIDENTIAL') {
                const encryptedData = encryptionService.encryptText(
                    content, 
                    file.original_name, 
                    req.user.id
                );

                // Write encrypted content to file
                await fs.writeFile(file.upload_path, JSON.stringify(encryptedData));

                // Update encryption key hash if changed
                await database.db.run(`
                    UPDATE files SET encryption_key_hash = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `, [encryptedData.keyHash, fileId]);
            } else {
                // For non-confidential files, write content directly
                await fs.writeFile(file.upload_path, content);
            }

            await authMiddleware.logActivity(req, `${category}_WRITE`, `File: ${file.original_name}`, true);

            res.json({
                success: true,
                message: 'File updated successfully'
            });

        } catch (error) {
            console.error('Write file error:', error.message);
            throw error;
        }
    }

    // Delete file
    async function deleteFile(category, req, res, database, authMiddleware) {
        try {
            const { fileId } = req.body;
            
            if (!fileId) {
                return res.status(400).json({
                    success: false,
                    message: 'File ID is required'
                });
            }

            // Get file metadata
            const file = await new Promise((resolve, reject) => {
                database.db.get(`
                    SELECT * FROM files WHERE id = ? AND category = ?
                `, [fileId, category], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }

            // Delete file from disk
            try {
                await fs.unlink(file.upload_path);
            } catch (fsError) {
                console.warn('File not found on disk:', file.upload_path);
            }

            // Delete file record from database
            await database.db.run('DELETE FROM files WHERE id = ?', [fileId]);

            await authMiddleware.logActivity(req, `${category}_DELETE`, `File: ${file.original_name}`, true);

            res.json({
                success: true,
                message: 'File deleted successfully'
            });

        } catch (error) {
            console.error('Delete file error:', error.message);
            throw error;
        }
    }

    // Helper function to check action permissions
    function checkActionPermission(permissions, action) {
        switch (action.toLowerCase()) {
            case 'create':
                return permissions.can_create === 1;
            case 'read':
                return permissions.can_read === 1;
            case 'write':
                return permissions.can_write === 1;
            case 'delete':
                return permissions.can_delete === 1;
            case 'list':
                return permissions.can_read === 1; // List requires read permission
            default:
                return false;
        }
    }

    return router;
}

module.exports = createFileRoutes;
