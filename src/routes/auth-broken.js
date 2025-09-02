const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const MFAService = require('../services/MFAService');
const SecurityMiddleware = require('../middleware/SecurityMiddleware');

function createAuthRoutes(database, authMiddleware) {
    const router = express.Router();
    const mfaService = new MFAService();

    // Register endpoint
    router.post('/register', 
        SecurityMiddleware.registrationRateLimit,
        SecurityMiddleware.validateRegistration,
        SecurityMiddleware.handleValidationErrors,
        async (req, res) => {
            try {
                const { firstName, lastName, email, password, requestedRole } = req.body;
                const ipAddress = req.ip || req.connection.remoteAddress;

                console.log(`Registration attempt for: ${email} from IP: ${ipAddress}`);

                // Check if user already exists
                const existingUser = await database.getUserByEmail(email);
                if (existingUser) {
                    await authMiddleware.logActivity(req, 'REGISTRATION_FAILED', 'Email already exists', false);
                    return res.status(400).json({
                        success: false,
                        message: 'An account with this email already exists'
                    });
                }

                // Hash password
                const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
                const hashedPassword = await bcrypt.hash(password, saltRounds);

                // Create user with PENDING_APPROVAL status
                const userId = await database.createUser({
                    email: email.toLowerCase(),
                    password_hash: hashedPassword,
                    first_name: firstName,
                    last_name: lastName,
                    role: requestedRole,
                    status: 'PENDING_APPROVAL'
                });

                await authMiddleware.logActivity(req, 'USER_REGISTERED', `User ID: ${userId}`, true);

                console.log(`User registered successfully: ${email} (ID: ${userId})`);

                res.status(201).json({
                    success: true,
                    message: 'Registration successful! Please wait for admin approval before you can login.',
                    userId: userId,
                    nextStep: 'AWAIT_APPROVAL'
                });

            } catch (error) {
                console.error('Registration error:', error.message);
                await authMiddleware.logActivity(req, 'REGISTRATION_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Registration failed. Please try again.'
                });
            }
        }
    );

    // Verify JWT token endpoint
    router.get('/verify-token',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                // If we reach here, the token is valid (middleware passed)
                const user = req.user;
                
                res.json({
                    success: true,
                    message: 'Token is valid',
                    user: {
                        id: user.id,
                        email: user.email,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        role: user.role,
                        status: user.status,
                        mfa_enabled: user.mfa_enabled,
                        created_at: user.created_at
                    }
                });
            } catch (error) {
                console.error('Token verification error:', error.message);
                res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }
        }
    );

    // Helper method to increment failed login attempts
    router.incrementFailedLogins = async function(userId, database) {SecurityMiddleware.validateRegistration,
        SecurityMiddleware.handleValidationErrors,
        SecurityMiddleware.honeypotCheck,
        async (req, res) => {
            try {
                const { email, password, firstName, lastName } = req.body;

                console.log(`Registration attempt for: ${email}`);

                // Check if user already exists
                const existingUser = await database.getUserByEmail(email);
                if (existingUser) {
                    await authMiddleware.logActivity(req, 'REGISTRATION_FAILED', 'Email already exists', false);
                    return res.status(400).json({
                        success: false,
                        message: 'A registration request has been processed for this email address'
                    });
                }

                // Create user with pending approval status
                const userId = await database.createUser({
                    email,
                    password,
                    firstName,
                    lastName
                });

                await authMiddleware.logActivity(req, 'USER_REGISTERED', `User ID: ${userId}`, true);

                console.log(`User registered successfully: ${email} (ID: ${userId})`);

                res.status(201).json({
                    success: true,
                    message: 'Registration successful! Please wait for admin approval before you can login.',
                    userId: userId,
                    nextStep: 'AWAIT_APPROVAL'
                });

            } catch (error) {
                console.error('Registration error:', error.message);
                await authMiddleware.logActivity(req, 'REGISTRATION_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Registration failed. Please try again.'
                });
            }
        }
    );

    // Login endpoint
    router.post('/login',
        SecurityMiddleware.loginRateLimit,
        SecurityMiddleware.validateLogin,
        SecurityMiddleware.handleValidationErrors,
        async (req, res) => {
            try {
                const { email, password } = req.body;
                const ipAddress = req.ip || req.connection.remoteAddress;
                const userAgent = req.headers['user-agent'];

                console.log(`Login attempt for: ${email} from IP: ${ipAddress}`);

                // Get user from database
                const user = await database.getUserByEmail(email);
                if (!user) {
                    await authMiddleware.logActivity(req, 'LOGIN_FAILED', 'User not found', false);
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Check if account is locked
                if (user.locked_until && new Date() < new Date(user.locked_until)) {
                    await authMiddleware.logActivity(req, 'LOGIN_BLOCKED', 'Account locked', false);
                    return res.status(423).json({
                        success: false,
                        message: 'Account is temporarily locked due to multiple failed attempts',
                        lockedUntil: user.locked_until
                    });
                }

                // Verify password
                const passwordValid = await bcrypt.compare(password, user.password_hash);
                if (!passwordValid) {
                    // Increment failed login attempts
                    await database.incrementFailedLogins(user.id);
                    await authMiddleware.logActivity(req, 'LOGIN_FAILED', 'Invalid password', false);
                    
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Check if user is approved
                if (user.status !== 'APPROVED') {
                    await authMiddleware.logActivity(req, 'LOGIN_BLOCKED', `Account status: ${user.status}`, false);
                    return res.status(403).json({
                        success: false,
                        message: 'Account is not approved yet. Please wait for administrator approval.',
                        status: user.status
                    });
                }

                // Reset failed login attempts on successful password verification
                await database.resetFailedLogins(user.id);

                // Check if MFA is enabled
                if (user.mfa_enabled) {
                    // Create temporary session for MFA verification
                    req.session.tempUserId = user.id;
                    req.session.tempUserEmail = user.email;
                    req.session.loginTime = Date.now();

                    await authMiddleware.logActivity(req, 'LOGIN_MFA_REQUIRED', 'MFA verification pending', true);

                    return res.json({
                        success: true,
                        message: 'Password verified. MFA verification required.',
                        requireMFA: true,
                        nextStep: 'MFA_VERIFICATION'
                    });
                } else {
                    // MFA not enabled - require MFA setup for new users
                    if (!user.mfa_secret) {
                        req.session.tempUserId = user.id;
                        req.session.tempUserEmail = user.email;

                        await authMiddleware.logActivity(req, 'LOGIN_MFA_SETUP_REQUIRED', 'MFA setup required', true);

                        return res.json({
                            success: true,
                            message: 'Login successful. MFA setup required for enhanced security.',
                            requireMFASetup: true,
                            nextStep: 'MFA_SETUP'
                        });
                    } else {
                        // Complete login without MFA (legacy users)
                        return await this.completeLogin(user, req, res, authMiddleware, database);
                    }
                }

            } catch (error) {
                console.error('Login error:', error.message);
                await authMiddleware.logActivity(req, 'LOGIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Login failed. Please try again.'
                });
            }
        }
    );

    // Two-factor authentication setup endpoint
    router.post('/two-factor',
        SecurityMiddleware.mfaRateLimit,
        async (req, res) => {
            try {
                const userId = req.session.tempUserId;
                if (!userId) {
                    return res.status(401).json({
                        success: false,
                        message: 'Session expired. Please login again.'
                    });
                }

                const user = await database.getUserById(userId);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                console.log(`Generating MFA secret for user: ${user.email}`);

                // Generate MFA secret
                const mfaData = mfaService.generateMFASecret(user.email);
                const qrCode = await mfaService.generateQRCode(mfaData.otpauth_url);

                // Store MFA secret temporarily (not enabled until verified)
                await database.db.run(
                    'UPDATE users SET mfa_secret = ? WHERE id = ?',
                    [mfaData.secret, userId]
                );

                await authMiddleware.logActivity(req, 'MFA_SETUP_INITIATED', 'MFA secret generated', true);

                res.json({
                    success: true,
                    message: 'MFA setup initiated',
                    qrCode: qrCode,
                    manualEntryKey: mfaData.manual_entry_key,
                    instructions: 'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.) and enter the 6-digit code to complete setup.'
                });

            } catch (error) {
                console.error('MFA setup error:', error.message);
                await authMiddleware.logActivity(req, 'MFA_SETUP_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'MFA setup failed. Please try again.'
                });
            }
        }
    );

    // Verify MFA setup
    router.post('/verify-setup',
        SecurityMiddleware.mfaRateLimit,
        SecurityMiddleware.validateMFAToken,
        SecurityMiddleware.handleValidationErrors,
        async (req, res) => {
            try {
                const { token } = req.body;
                const userId = req.session.tempUserId;

                if (!userId) {
                    return res.status(401).json({
                        success: false,
                        message: 'Session expired. Please login again.'
                    });
                }

                const user = await database.getUserById(userId);
                if (!user || !user.mfa_secret) {
                    return res.status(400).json({
                        success: false,
                        message: 'MFA setup not found. Please restart the setup process.'
                    });
                }

                // Verify the token
                const verification = mfaService.verifyTOTP(token, user.mfa_secret);
                if (!verification.success) {
                    await authMiddleware.logActivity(req, 'MFA_SETUP_FAILED', 'Invalid token', false);
                    return res.status(400).json({
                        success: false,
                        message: verification.message
                    });
                }

                // Generate backup codes
                const backupCodes = mfaService.generateBackupCodes();
                const hashedBackupCodes = mfaService.hashBackupCodes(backupCodes);

                // Enable MFA and store backup codes
                await database.db.run(`
                    UPDATE users 
                    SET mfa_enabled = 1, backup_codes = ? 
                    WHERE id = ?
                `, [JSON.stringify(hashedBackupCodes), userId]);

                await authMiddleware.logActivity(req, 'MFA_SETUP_COMPLETED', 'MFA enabled successfully', true);

                // Complete the login process
                const updatedUser = await database.getUserById(userId);
                return await this.completeLogin(updatedUser, req, res, authMiddleware, database, backupCodes);

            } catch (error) {
                console.error('MFA verification error:', error.message);
                await authMiddleware.logActivity(req, 'MFA_VERIFICATION_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'MFA verification failed. Please try again.'
                });
            }
        }
    );

    // Verify MFA for login
    router.post('/verify',
        SecurityMiddleware.mfaRateLimit,
        async (req, res) => {
            try {
                const { token, backupCode } = req.body;
                const userId = req.session.tempUserId;

                if (!userId) {
                    return res.status(401).json({
                        success: false,
                        message: 'Session expired. Please login again.'
                    });
                }

                const user = await database.getUserById(userId);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                let verificationSuccess = false;
                let usedBackupCode = false;

                // Try TOTP verification first
                if (token) {
                    const verification = mfaService.verifyTOTP(token, user.mfa_secret);
                    verificationSuccess = verification.success;
                }

                // Try backup code if TOTP failed
                if (!verificationSuccess && backupCode) {
                    const backupCodes = JSON.parse(user.backup_codes || '[]');
                    const backupVerification = mfaService.verifyBackupCode(backupCode, backupCodes);
                    
                    if (backupVerification.success) {
                        // Update backup codes in database
                        await database.db.run(
                            'UPDATE users SET backup_codes = ? WHERE id = ?',
                            [JSON.stringify(backupVerification.codes), userId]
                        );
                        verificationSuccess = true;
                        usedBackupCode = true;
                    }
                }

                if (!verificationSuccess) {
                    await authMiddleware.logActivity(req, 'MFA_VERIFICATION_FAILED', 'Invalid token/backup code', false);
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid verification code'
                    });
                }

                await authMiddleware.logActivity(req, 'MFA_VERIFICATION_SUCCESS', usedBackupCode ? 'Backup code used' : 'TOTP verified', true);

                // Complete login
                return await this.completeLogin(user, req, res, authMiddleware, database);

            } catch (error) {
                console.error('MFA verification error:', error.message);
                await authMiddleware.logActivity(req, 'MFA_VERIFICATION_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'MFA verification failed. Please try again.'
                });
            }
        }
    );

    // Logout endpoint
    router.post('/logout',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                const userId = req.user.id;

                // Deactivate session in database
                if (req.sessionID) {
                    await database.db.run(
                        'UPDATE sessions SET is_active = 0 WHERE id = ? AND user_id = ?',
                        [req.sessionID, userId]
                    );
                }

                await authMiddleware.logActivity(req, 'LOGOUT', 'User logged out', true);

                // Destroy session
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Session destruction error:', err);
                    }
                    
                    res.json({
                        success: true,
                        message: 'Logged out successfully'
                    });
                });

            } catch (error) {
                console.error('Logout error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'Logout failed'
                });
            }
        }
    );

    // Get current user info
    router.get('/user',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                const user = await database.getUserById(req.user.id);
                
                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        role: user.role,
                        status: user.status,
                        mfaEnabled: user.mfa_enabled,
                        lastLogin: user.last_login,
                        createdAt: user.created_at
                    }
                });

            } catch (error) {
                console.error('Get user error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'Failed to get user information'
                });
            }
        }
    );

    // Helper method to complete login process
    router.completeLogin = async function(user, req, res, authMiddleware, database, backupCodes = null) {
        try {
            // Update last login time
            await database.db.run(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );

            // Create session record
            const sessionId = req.sessionID || require('crypto').randomBytes(32).toString('hex');
            await database.db.run(`
                INSERT INTO sessions (id, user_id, ip_address, user_agent, created_at, last_activity)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [sessionId, user.id, req.ip, req.headers['user-agent']]);

            // Generate JWT token
            const token = authMiddleware.generateToken(user);

            // Set up user session
            req.session.userId = user.id;
            req.session.userEmail = user.email;
            req.session.userRole = user.role;
            req.session.loginTime = Date.now();

            // Clear temporary session data
            delete req.session.tempUserId;
            delete req.session.tempUserEmail;

            await authMiddleware.logActivity(req, 'LOGIN_SUCCESS', 'User logged in successfully', true);

            console.log(`Login completed for: ${user.email} (Role: ${user.role})`);

            const response = {
                success: true,
                message: 'Login successful',
                token: token,
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: user.role,
                    mfaEnabled: user.mfa_enabled
                },
                nextStep: 'DASHBOARD'
            };

            // Include backup codes if this is initial MFA setup
            if (backupCodes) {
                response.backupCodes = backupCodes;
                response.message += ' - Please save your backup codes in a secure location.';
            }

            return res.json(response);

        } catch (error) {
            console.error('Complete login error:', error.message);
            throw error;
        }
    };

    // Helper method to increment failed login attempts
    router.incrementFailedLogins = async function(userId, database) {
        try {
            const user = await database.getUserById(userId);
            const failedAttempts = (user.failed_login_attempts || 0) + 1;
            const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
            
            let updateQuery = 'UPDATE users SET failed_login_attempts = ? WHERE id = ?';
            let params = [failedAttempts, userId];

            // Lock account if max attempts reached
            if (failedAttempts >= maxAttempts) {
                const lockDuration = 30 * 60 * 1000; // 30 minutes
                const lockUntil = new Date(Date.now() + lockDuration).toISOString();
                
                updateQuery = 'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?';
                params = [failedAttempts, lockUntil, userId];
                
                console.log(`🔒 Account locked for user ID ${userId} due to ${failedAttempts} failed attempts`);
            }

            await database.db.run(updateQuery, params);
        } catch (error) {
            console.error('Failed to increment failed login attempts:', error.message);
        }
    };

    // Helper method to reset failed login attempts
    router.resetFailedLogins = async function(userId, database) {
        try {
            await database.db.run(
                'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
                [userId]
            );
        } catch (error) {
            console.error('Failed to reset failed login attempts:', error.message);
        }
    };

    return router;
}

module.exports = createAuthRoutes;
