const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

class SecurityMiddleware {
    // Rate limiting for login attempts
    static loginRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Limit each IP to 5 requests per windowMs
        message: {
            success: false,
            message: 'Too many login attempts, please try again later',
            retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            // Rate limit by IP and email combination for more precise limiting
            return `${req.ip}-${req.body.email || 'unknown'}`;
        }
    });

    // Rate limiting for registration
    static registrationRateLimit = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // Limit each IP to 3 registration attempts per hour
        message: {
            success: false,
            message: 'Too many registration attempts, please try again later',
            retryAfter: '1 hour'
        }
    });

    // Rate limiting for MFA attempts
    static mfaRateLimit = rateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: 10, // Allow 10 MFA attempts per 5 minutes
        message: {
            success: false,
            message: 'Too many MFA attempts, please wait before trying again',
            retryAfter: '5 minutes'
        }
    });

    // General API rate limiting
    static apiRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        message: {
            success: false,
            message: 'Too many requests, please try again later'
        }
    });

    // File upload rate limiting
    static fileUploadRateLimit = rateLimit({
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 20, // 20 file uploads per 10 minutes
        message: {
            success: false,
            message: 'Too many file uploads, please wait before uploading again'
        }
    });

    // Input validation for user registration
    static validateRegistration = [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please provide a valid email address')
            .isLength({ min: 5, max: 100 })
            .withMessage('Email must be between 5 and 100 characters'),
        
        body('password')
            .isLength({ min: 8, max: 128 })
            .withMessage('Password must be between 8 and 128 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must contain at least one lowercase letter, uppercase letter, number, and special character'),
        
        body('firstName')
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('First name must be between 2 and 50 characters')
            .matches(/^[a-zA-Z\s'-]+$/)
            .withMessage('First name can only contain letters, spaces, apostrophes, and hyphens'),
        
        body('lastName')
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('Last name must be between 2 and 50 characters')
            .matches(/^[a-zA-Z\s'-]+$/)
            .withMessage('Last name can only contain letters, spaces, apostrophes, and hyphens'),
        
        body('confirmPassword')
            .custom((value, { req }) => {
                if (value !== req.body.password) {
                    throw new Error('Password confirmation does not match password');
                }
                return true;
            })
    ];

    // Input validation for login
    static validateLogin = [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Please provide a valid email address'),
        
        body('password')
            .isLength({ min: 1 })
            .withMessage('Password is required')
    ];

    // Input validation for MFA token
    static validateMFAToken = [
        body('token')
            .isLength({ min: 6, max: 6 })
            .withMessage('MFA token must be 6 digits')
            .isNumeric()
            .withMessage('MFA token must contain only numbers')
    ];

    // Input validation for backup code
    static validateBackupCode = [
        body('backupCode')
            .isLength({ min: 8, max: 10 })
            .withMessage('Invalid backup code format')
            .matches(/^\d{4}-\d{4}$/)
            .withMessage('Backup code must be in format: 1234-5678')
    ];

    // Validation for file uploads
    static validateFileUpload = [
        body('category')
            .isIn(['IMAGES', 'DOCUMENTS', 'CONFIDENTIAL'])
            .withMessage('Invalid file category'),
        
        body('action')
            .isIn(['create', 'read', 'write', 'delete', 'list'])
            .withMessage('Invalid action specified')
    ];

    // CSRF protection middleware
    static csrfProtection(req, res, next) {
        // Skip CSRF for GET requests and API endpoints
        if (req.method === 'GET' || req.path.startsWith('/api/')) {
            return next();
        }

        const token = req.body._csrf || req.headers['x-csrf-token'];
        const sessionToken = req.session.csrfToken;

        if (!token || !sessionToken || token !== sessionToken) {
            return res.status(403).json({
                success: false,
                message: 'Invalid CSRF token'
            });
        }

        next();
    }

    // Security headers middleware
    static securityHeaders(req, res, next) {
        // Prevent XSS attacks
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        // Prevent MIME type sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Prevent clickjacking
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Enforce HTTPS
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        
        // Content Security Policy
        res.setHeader('Content-Security-Policy', 
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
            "img-src 'self' data: https:; " +
            "font-src 'self' https://cdnjs.cloudflare.com; " +
            "connect-src 'self'");
        
        // Referrer Policy
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        // Feature Policy
        res.setHeader('Permissions-Policy', 
            'geolocation=(), microphone=(), camera=()');

        next();
    }

    // Request sanitization middleware
    static sanitizeInput(req, res, next) {
        // Remove potentially dangerous characters from string inputs
        const sanitize = (obj) => {
            for (let key in obj) {
                if (typeof obj[key] === 'string') {
                    // Remove HTML tags and script content
                    obj[key] = obj[key]
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<[^>]+>/g, '')
                        .trim();
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitize(obj[key]);
                }
            }
        };

        if (req.body) sanitize(req.body);
        if (req.query) sanitize(req.query);
        if (req.params) sanitize(req.params);

        next();
    }

    // Validation result handler
    static handleValidationErrors(req, res, next) {
        const errors = validationResult(req);
        
        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(error => ({
                field: error.path,
                message: error.msg,
                value: error.value
            }));

            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }

        next();
    }

    // File type validation for uploads
    static validateFileType(allowedTypes) {
        return (req, res, next) => {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const fileType = req.file.mimetype;
            
            if (!allowedTypes.includes(fileType)) {
                return res.status(400).json({
                    success: false,
                    message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
                });
            }

            next();
        };
    }

    // File size validation
    static validateFileSize(maxSize) {
        return (req, res, next) => {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            if (req.file.size > maxSize) {
                const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(2);
                return res.status(400).json({
                    success: false,
                    message: `File too large. Maximum size: ${maxSizeMB}MB`
                });
            }

            next();
        };
    }

    // Session security middleware
    static secureSession(req, res, next) {
        // Regenerate session ID on login to prevent session fixation
        if (req.path === '/login' && req.method === 'POST') {
            req.session.regenerate((err) => {
                if (err) {
                    console.error('Session regeneration error:', err);
                }
                next();
            });
        } else {
            next();
        }
    }

    // Honeypot field check (to catch bots)
    static honeypotCheck(req, res, next) {
        // Check for honeypot field (should be empty if human)
        if (req.body.honeypot && req.body.honeypot.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        delete req.body.honeypot; // Remove honeypot field
        next();
    }

    // IP whitelist middleware (for admin endpoints)
    static ipWhitelist(allowedIPs = []) {
        return (req, res, next) => {
            const clientIP = req.ip || req.connection.remoteAddress;
            
            if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied from this IP address'
                });
            }

            next();
        };
    }

    // Request logging middleware
    static requestLogger(req, res, next) {
        const timestamp = new Date().toISOString();
        const method = req.method;
        const url = req.url;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        console.log(`${timestamp} - ${method} ${url} - IP: ${ip} - UA: ${userAgent}`);

        next();
    }
}

module.exports = SecurityMiddleware;
