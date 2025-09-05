const jwt = require('jsonwebtoken');
const AnomalyDetectionService = require('../services/AnomalyDetectionService');

class AuthMiddleware {
    constructor(database) {
        this.database = database;
        this.anomalyDetection = new AnomalyDetectionService();
    }

    // Verify JWT token and authenticate user
    authenticateToken() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers['authorization'];
                const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

                if (!token) {
                    return this.handleUnauthenticated(req, res, 'No token provided');
                }

                // Verify JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Get user from database
                const user = await this.database.getUserById(decoded.userId);
                if (!user) {
                    return this.handleUnauthenticated(req, res, 'User not found');
                }

                // Check if user is approved and active
                if (user.status !== 'APPROVED') {
                    return this.handleUnauthenticated(req, res, 'Account not approved');
                }

                // Check if account is locked
                if (user.locked_until && new Date() < new Date(user.locked_until)) {
                    return this.handleAccountLocked(req, res, user.locked_until);
                }

                // Attach user info to request
                req.user = {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: user.role,
                    mfaEnabled: user.mfa_enabled
                };

                // Log successful authentication
                await this.logActivity(req, 'AUTHENTICATION_SUCCESS', null, true);

                next();
            } catch (error) {
                console.error('Authentication error:', error.message);
                
                if (error.name === 'JsonWebTokenError') {
                    return this.handleUnauthenticated(req, res, 'Invalid token');
                } else if (error.name === 'TokenExpiredError') {
                    return this.handleUnauthenticated(req, res, 'Token expired');
                }
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'Authentication failed' 
                });
            }
        };
    }

    // Optional authentication (for public endpoints that benefit from user context)
    optionalAuth() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers['authorization'];
                const token = authHeader && authHeader.split(' ')[1];

                if (token) {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const user = await this.database.getUserById(decoded.userId);
                    
                    if (user && user.status === 'APPROVED') {
                        req.user = {
                            id: user.id,
                            email: user.email,
                            firstName: user.first_name,
                            lastName: user.last_name,
                            role: user.role,
                            mfaEnabled: user.mfa_enabled
                        };
                    }
                }
                
                next();
            } catch (error) {
                // Ignore auth errors for optional authentication
                next();
            }
        };
    }

    // Check if MFA is required for the action
    requireMFA(action = null) {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Authentication required' 
                    });
                }

                // Check if user has MFA enabled
                if (!req.user.mfaEnabled) {
                    return res.status(403).json({ 
                        success: false, 
                        message: 'MFA setup required',
                        requireMfaSetup: true
                    });
                }

                // Check if MFA verification is required for this action
                const activityData = {
                    action: action || req.route?.path || 'UNKNOWN_ACTION',
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.headers['user-agent']
                };

                const userContext = {
                    userId: req.user.id,
                    role: req.user.role
                };

                // Run anomaly detection
                const anomalyResult = await this.anomalyDetection.detectAnomalies(
                    activityData, 
                    userContext, 
                    this.database
                );

                // Log the anomaly detection result
                await this.logActivity(req, 'ANOMALY_DETECTION', JSON.stringify(anomalyResult), true, null, null, anomalyResult.totalRiskScore);

                // Check if MFA verification is in session
                const mfaVerified = req.session.mfaVerified;
                const mfaTimestamp = req.session.mfaTimestamp;
                const mfaValidityWindow = 15 * 60 * 1000; // 15 minutes

                const isMfaValid = mfaVerified && 
                    mfaTimestamp && 
                    (Date.now() - mfaTimestamp) < mfaValidityWindow;

                // Check if MFA code is provided in request body
                const mfaCode = req.body?.mfaCode;
                let mfaCodeValid = false;

                if (mfaCode && req.user.mfaSecret) {
                    // Verify the provided MFA code
                    const speakeasy = require('speakeasy');
                    mfaCodeValid = speakeasy.totp.verify({
                        secret: req.user.mfaSecret,
                        encoding: 'base32',
                        token: mfaCode,
                        window: 2
                    });

                    if (mfaCodeValid) {
                        console.log(`MFA code verification successful for user: ${req.user.email}`);
                        // Update session to mark MFA as verified
                        req.session.mfaVerified = true;
                        req.session.mfaTimestamp = Date.now();
                    } else {
                        console.log(`MFA code verification failed for user: ${req.user.email}`);
                    }
                }

                // Require MFA verification if not verified or high risk
                if ((!isMfaValid && !mfaCodeValid) || (anomalyResult.totalRiskScore >= 7 && !mfaCodeValid)) {
                    return res.status(403).json({
                        success: false,
                        message: 'MFA verification required',
                        requireMfaVerification: true,
                        riskLevel: anomalyResult.riskLevel,
                        anomalies: anomalyResult.anomalies.map(a => ({
                            type: a.type,
                            description: a.description
                        }))
                    });
                }

                // Add risk score to request for logging
                req.riskScore = anomalyResult.totalRiskScore;
                
                next();
            } catch (error) {
                console.error('MFA middleware error:', error.message);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Security validation failed' 
                });
            }
        };
    }

    // Role-based authorization
    requireRole(allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Authentication required' 
                });
            }

            if (!Array.isArray(allowedRoles)) {
                allowedRoles = [allowedRoles];
            }

            if (!allowedRoles.includes(req.user.role)) {
                this.logActivity(req, 'UNAUTHORIZED_ACCESS', `Attempted access with role: ${req.user.role}`, false);
                
                return res.status(403).json({ 
                    success: false, 
                    message: 'Insufficient privileges' 
                });
            }

            next();
        };
    }

    // Resource-based authorization
    requirePermission(resource, action) {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({ 
                        success: false, 
                        message: 'Authentication required' 
                    });
                }

                const permissions = await this.database.getRolePermissions(req.user.role, resource);
                
                if (!permissions) {
                    await this.logActivity(req, 'PERMISSION_DENIED', `No permissions found for ${req.user.role}:${resource}`, false);
                    return res.status(403).json({ 
                        success: false, 
                        message: 'Access denied - no permissions' 
                    });
                }

                const hasPermission = this.checkPermission(permissions, action);
                
                if (!hasPermission) {
                    await this.logActivity(req, 'PERMISSION_DENIED', `${action} denied on ${resource} for ${req.user.role}`, false);
                    return res.status(403).json({ 
                        success: false, 
                        message: `Access denied - cannot ${action} ${resource}` 
                    });
                }

                // Log successful authorization
                await this.logActivity(req, 'PERMISSION_GRANTED', `${action} granted on ${resource}`, true);
                
                next();
            } catch (error) {
                console.error('Permission check error:', error.message);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Authorization failed' 
                });
            }
        };
    }

    // Check specific permission
    checkPermission(permissions, action) {
        switch (action.toLowerCase()) {
            case 'create':
                return permissions.can_create === 1;
            case 'read':
                return permissions.can_read === 1;
            case 'write':
                return permissions.can_write === 1;
            case 'delete':
                return permissions.can_delete === 1;
            default:
                return false;
        }
    }

    // Handle unauthenticated requests
    handleUnauthenticated(req, res, message) {
        this.logActivity(req, 'AUTHENTICATION_FAILED', message, false);
        return res.status(401).json({ 
            success: false, 
            message: message || 'Authentication failed' 
        });
    }

    // Handle account locked
    handleAccountLocked(req, res, lockedUntil) {
        this.logActivity(req, 'ACCOUNT_LOCKED', `Account locked until ${lockedUntil}`, false);
        return res.status(423).json({ 
            success: false, 
            message: 'Account temporarily locked',
            lockedUntil: lockedUntil
        });
    }

    // Log activity for audit trail
    async logActivity(req, action, resource, success, errorMessage = null, sessionId = null, riskScore = 0) {
        try {
            const logData = {
                userId: req.user ? req.user.id : null,
                action,
                resource,
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.headers['user-agent'],
                success,
                errorMessage,
                sessionId: sessionId || req.sessionID,
                riskScore
            };

            await this.database.logActivity(logData);
        } catch (error) {
            console.error('Failed to log activity:', error.message);
        }
    }

    // Generate JWT token
    generateToken(user) {
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role
        };

        return jwt.sign(payload, process.env.JWT_SECRET, { 
            expiresIn: '24h',
            issuer: 'secureus-app',
            audience: 'secureus-users'
        });
    }

    // Middleware to prevent concurrent sessions (optional security feature)
    preventConcurrentSessions() {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return next();
                }

                // Check for other active sessions
                const concurrentSessions = await this.database.db.get(`
                    SELECT COUNT(*) as count 
                    FROM sessions 
                    WHERE user_id = ? AND is_active = 1 AND id != ?
                `, [req.user.id, req.sessionID]);

                if (concurrentSessions && concurrentSessions.count > 0) {
                    // Log concurrent session attempt
                    await this.logActivity(req, 'CONCURRENT_SESSION_DETECTED', `${concurrentSessions.count} other active sessions`, true);
                    
                    // You could choose to:
                    // 1. Allow but log (current implementation)
                    // 2. Terminate other sessions
                    // 3. Deny this session
                }

                next();
            } catch (error) {
                console.error('Concurrent session check error:', error.message);
                next(); // Continue on error
            }
        };
    }

    // Generate JWT token for user
    async generateJWT(user) {
        try {
            const payload = {
                userId: user.id,
                email: user.email,
                role: user.role,
                iat: Math.floor(Date.now() / 1000) // Issued at time
            };

            const options = {
                expiresIn: process.env.JWT_EXPIRES_IN || '24h',
                issuer: 'SecureRUS',
                audience: 'SecureRUS-Users'
            };

            const token = jwt.sign(payload, process.env.JWT_SECRET, options);
            
            console.log(`JWT token generated for user: ${user.email}`);
            return token;

        } catch (error) {
            console.error('JWT generation error:', error.message);
            throw new Error('Failed to generate authentication token');
        }
    }
}

module.exports = AuthMiddleware;
