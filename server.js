require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

// Import custom modules
const Database = require('./src/models/Database');
const AuthMiddleware = require('./src/middleware/AuthMiddleware');
const SecurityMiddleware = require('./src/middleware/SecurityMiddleware');

// Import routes
const authRoutes = require('./src/routes/auth');
const fileRoutes = require('./src/routes/files');
const adminRoutes = require('./src/routes/admin');
const analyticsRoutes = require('./src/routes/analytics');

class SecureRUSServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.database = new Database();
        this.authMiddleware = new AuthMiddleware(this.database);
        
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    initializeMiddleware() {
        console.log('Initializing security middleware...');

        // Trust proxy (for accurate IP addresses behind load balancers)
        this.app.set('trust proxy', 1);

        // Security headers
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                    fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                    connectSrc: ["'self'"]
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.NODE_ENV === 'production' 
                ? ['https://your-production-domain.com'] 
                : ['http://localhost:3000', 'http://127.0.0.1:3000'],
            credentials: true,
            optionsSuccessStatus: 200
        }));

        // Body parsing with size limits
        this.app.use(express.json({ 
            limit: '10mb',
            verify: (req, res, buf) => {
                // Store raw body for webhook verification if needed
                req.rawBody = buf;
            }
        }));
        
        this.app.use(express.urlencoded({ 
            extended: true, 
            limit: '10mb' 
        }));

        // Session configuration
        this.app.use(session({
            secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
            name: 'secureus.sid', // Don't use default session name
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production', // HTTPS only in production
                httpOnly: true, // Prevent XSS access to cookies
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                sameSite: 'strict' // CSRF protection
            },
            genid: () => {
                return crypto.randomBytes(32).toString('hex'); // Use cryptographically secure session IDs
            }
        }));

        // Custom security middleware
        this.app.use(SecurityMiddleware.securityHeaders);
        this.app.use(SecurityMiddleware.sanitizeInput);
        this.app.use(SecurityMiddleware.requestLogger);
        this.app.use(SecurityMiddleware.secureSession);

        // Static files serving with security
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: '1d',
            etag: false,
            lastModified: false
        }));

        // API rate limiting
        this.app.use('/api/', SecurityMiddleware.apiRateLimit);

        console.log('Security middleware initialized');
    }

    initializeRoutes() {
        console.log('Initializing routes...');

        // Health check endpoint (no authentication required)
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                message: 'SecureRUS RBAC System is running',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // CSRF token endpoint
        this.app.get('/api/csrf-token', (req, res) => {
            const token = crypto.randomBytes(32).toString('hex');
            req.session.csrfToken = token;
            res.json({ csrfToken: token });
        });

        // Authentication routes
        this.app.use('/auth', authRoutes(this.database, this.authMiddleware));

        // File management routes
        this.app.use('/files', fileRoutes(this.database, this.authMiddleware));

        // Admin routes
        this.app.use('/admin', adminRoutes(this.database, this.authMiddleware));

        // Analytics routes
        this.app.use('/analytics', analyticsRoutes(this.database, this.authMiddleware));

        // Serve main application
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Serve SPA routes
        this.app.get('*', (req, res, next) => {
            // If it's an API route, continue to 404 handler
            if (req.path.startsWith('/auth') || 
                req.path.startsWith('/files') || 
                req.path.startsWith('/admin') || 
                req.path.startsWith('/analytics') ||
                req.path.startsWith('/health')) {
                next();
            } else {
                // For all other routes, serve the main HTML file (SPA routing)
                res.sendFile(path.join(__dirname, 'public', 'index.html'));
            }
        });

        // 404 handler for API routes
        this.app.use((req, res) => {
            if (req.path.startsWith('/auth') || 
                req.path.startsWith('/files') || 
                req.path.startsWith('/admin') || 
                req.path.startsWith('/analytics')) {
                res.status(404).json({
                    success: false,
                    message: 'API endpoint not found',
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Route not found',
                    timestamp: new Date().toISOString()
                });
            }
        });

        console.log('Routes initialized');
    }

    initializeErrorHandling() {
        console.log('Initializing error handling...');

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('Unhandled error:', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                timestamp: new Date().toISOString()
            });

            // Don't leak error details in production
            const isDevelopment = process.env.NODE_ENV !== 'production';
            
            res.status(error.status || 500).json({
                success: false,
                message: isDevelopment ? error.message : 'Internal server error',
                ...(isDevelopment && { 
                    stack: error.stack,
                    details: error.details 
                }),
                timestamp: new Date().toISOString()
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.gracefulShutdown('uncaughtException');
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.gracefulShutdown('unhandledRejection');
        });

        // Handle SIGTERM
        process.on('SIGTERM', () => {
            console.log('SIGTERM received');
            this.gracefulShutdown('SIGTERM');
        });

        // Handle SIGINT (Ctrl+C)
        process.on('SIGINT', () => {
            console.log('SIGINT received');
            this.gracefulShutdown('SIGINT');
        });

        console.log('Error handling initialized');
    }

    gracefulShutdown(signal) {
        console.log(`Graceful shutdown initiated by ${signal}`);
        
        // Close database connection
        if (this.database) {
            this.database.close();
        }

        // Close server
        if (this.server) {
            this.server.close(() => {
                console.log('Server closed successfully');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }

        // Force exit after 10 seconds
        setTimeout(() => {
            console.log('Forcing exit after timeout');
            process.exit(1);
        }, 10000);
    }

    start() {
        this.server = this.app.listen(this.port, () => {
            console.log('\n SecureRUS RBAC System Started Successfully!');
            console.log('=' .repeat(50));
            console.log(`Server running on: http://localhost:${this.port}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Database: ${process.env.DB_PATH || './database/secureus.db'}`);
            console.log('=' .repeat(50));
            console.log('\n Available Endpoints:');
            console.log('  Home: http://localhost:' + this.port + '/');
            console.log('  Login: http://localhost:' + this.port + '/login');
            console.log('  Register: http://localhost:' + this.port + '/register');
            console.log('  Dashboard: http://localhost:' + this.port + '/dashboard');
            console.log('  Admin: http://localhost:' + this.port + '/admin');
            console.log('  Analytics: http://localhost:' + this.port + '/analytics');
            console.log('  Health: http://localhost:' + this.port + '/health');
            console.log('\nDefault Admin Credentials:');
            console.log('  Email: admin@secureus.com');
            console.log('  Password: SecureAdmin123!');
            console.log('  Please change the default password after first login!');
            console.log('\n' + '=' .repeat(50));
        });

        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`Port ${this.port} is already in use`);
                process.exit(1);
            } else {
                console.error('Server error:', error);
                process.exit(1);
            }
        });
    }
}

// Start the server
if (require.main === module) {
    const server = new SecureRUSServer();
    server.start();
}

module.exports = SecureRUSServer;
