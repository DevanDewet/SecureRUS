const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SecurityMiddleware = require('../middleware/SecurityMiddleware');
const MFAService = require('../services/MFAService');

function createAuthRoutes(database, authMiddleware) {
    const router = express.Router();
    const mfaService = new MFAService();

    // Login endpoint
    router.post('/login',
        SecurityMiddleware.loginRateLimit,
        async (req, res) => {
            try {
                const { email, password } = req.body;
                console.log(`Login attempt for: ${email}`);

                // Get user from database
                const user = await database.getUserByEmail(email);
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Verify password
                const passwordValid = await bcrypt.compare(password, user.password_hash);
                if (!passwordValid) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid email or password'
                    });
                }

                // Check if user is approved
                if (user.status !== 'APPROVED') {
                    return res.status(403).json({
                        success: false,
                        message: 'Account is not approved yet. Please wait for administrator approval.',
                        status: user.status
                    });
                }

                // Check if MFA is enabled for this user
                if (user.mfa_enabled) {
                    // Generate temporary token for MFA with proper payload
                    const tempPayload = {
                        userId: user.id,
                        email: user.email,
                        role: user.role,
                        temp: true,
                        mfa_verified: false,
                        iat: Math.floor(Date.now() / 1000)
                    };

                    const tempToken = jwt.sign(tempPayload, process.env.JWT_SECRET, {
                        expiresIn: '10m', // Temporary token expires in 10 minutes
                        issuer: 'SecureRUS',
                        audience: 'SecureRUS-Users'
                    });

                    console.log(`Login successful for ${user.email}, MFA required`);

                    return res.json({
                        success: true,
                        message: 'MFA verification required',
                        requiresMFA: true,
                        tempToken: tempToken,
                        user: {
                            id: user.id,
                            email: user.email,
                            first_name: user.first_name,
                            last_name: user.last_name,
                            role: user.role,
                            status: user.status,
                            mfa_enabled: true
                        }
                    });
                }

                // Generate JWT token (for users without MFA)
                const token = await authMiddleware.generateJWT(user);
                
                console.log(`Login successful for: ${user.email}`);

                res.json({
                    success: true,
                    message: 'Login successful',
                    token: token,
                    user: {
                        id: user.id,
                        email: user.email,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        role: user.role,
                        status: user.status,
                        mfa_enabled: user.mfa_enabled || false
                    }
                });

            } catch (error) {
                console.error('Login error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'Login failed. Please try again.'
                });
            }
        }
    );

    // Register endpoint
    router.post('/register',
        SecurityMiddleware.registrationRateLimit,
        async (req, res) => {
            try {
                const { firstName, lastName, email, password, requestedRole } = req.body;
                console.log(`Registration attempt for: ${email}`);

                // Check if user already exists
                const existingUser = await database.getUserByEmail(email);
                if (existingUser) {
                    return res.status(400).json({
                        success: false,
                        message: 'An account with this email already exists'
                    });
                }

                // Hash password
                const hashedPassword = await bcrypt.hash(password, 12);

                // Create user
                const userId = await database.createUser({
                    email: email.toLowerCase(),
                    password: hashedPassword,
                    firstName: firstName,
                    lastName: lastName,
                    role: requestedRole || 'USER',
                    status: 'PENDING_APPROVAL',
                    isHashed: true
                });

                console.log(`User registered: ${email} (ID: ${userId})`);

                res.status(201).json({
                    success: true,
                    message: 'Registration successful! Please wait for admin approval.',
                    userId: userId
                });

            } catch (error) {
                console.error('Registration error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'Registration failed. Please try again.'
                });
            }
        }
    );

    // Verify token endpoint
    router.get('/verify-token',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
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
                        mfa_enabled: user.mfa_enabled || false
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

    // Logout endpoint
    router.post('/logout',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                res.json({
                    success: true,
                    message: 'Logout successful'
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

    // MFA Setup endpoint
    router.post('/setup-mfa',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                const userId = req.user.id;
                const userEmail = req.user.email;

                console.log(`Setting up MFA for user: ${userEmail}`);

                // Generate MFA secret
                const mfaData = mfaService.generateMFASecret(userEmail);
                
                // Generate QR code
                const qrCodeDataURL = await mfaService.generateQRCode(mfaData.otpauth_url);

                // Store secret temporarily (don't enable MFA until verified)
                await database.storeTempMFASecret(userId, mfaData.secret);

                res.json({
                    success: true,
                    message: 'MFA setup initiated',
                    qrCode: qrCodeDataURL,
                    manualEntryKey: mfaData.manual_entry_key,
                    otpauth_url: mfaData.otpauth_url
                });

            } catch (error) {
                console.error('MFA setup error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'MFA setup failed'
                });
            }
        }
    );

    // MFA Verification endpoint (for login)
    router.post('/verify-mfa',
        async (req, res) => {
            try {
                const { tempToken, mfaCode } = req.body;

                if (!tempToken || !mfaCode) {
                    return res.status(400).json({
                        success: false,
                        message: 'Temporary token and MFA code are required'
                    });
                }

                // Verify temporary token
                let decoded;
                try {
                    decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
                } catch (error) {
                    console.error('JWT verification error:', error.message);
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid or expired temporary token'
                    });
                }

                if (!decoded.temp || decoded.mfa_verified) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid temporary token'
                    });
                }

                // Get user from database
                const user = await database.getUserById(decoded.userId);
                if (!user || !user.mfa_enabled || !user.mfa_secret) {
                    return res.status(401).json({
                        success: false,
                        message: 'MFA not properly configured'
                    });
                }

                // Verify MFA code
                const verification = mfaService.verifyTOTP(mfaCode, user.mfa_secret);
                if (!verification.success) {
                    await authMiddleware.logActivity(req, 'MFA_VERIFICATION_FAILED', `Failed MFA verification for ${user.email}`, false);
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid MFA code'
                    });
                }

                // Generate full access token
                const token = await authMiddleware.generateJWT(user);

                await authMiddleware.logActivity(req, 'MFA_VERIFICATION_SUCCESS', `Successful MFA verification for ${user.email}`, true);

                console.log(`MFA verification successful for: ${user.email}`);

                res.json({
                    success: true,
                    message: 'MFA verification successful',
                    token: token,
                    user: {
                        id: user.id,
                        email: user.email,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        role: user.role,
                        status: user.status,
                        mfa_enabled: user.mfa_enabled
                    }
                });

            } catch (error) {
                console.error('MFA verification error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'MFA verification failed'
                });
            }
        }
    );

    // Confirm MFA Setup endpoint
    router.post('/confirm-mfa',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                const { mfaCode } = req.body;
                const userId = req.user.id;

                if (!mfaCode) {
                    return res.status(400).json({
                        success: false,
                        message: 'MFA code is required'
                    });
                }

                // Get temporary MFA secret
                const tempSecret = await database.getTempMFASecret(userId);
                if (!tempSecret) {
                    return res.status(400).json({
                        success: false,
                        message: 'No MFA setup in progress'
                    });
                }

                // Verify MFA code with temporary secret
                const verification = mfaService.verifyTOTP(mfaCode, tempSecret);
                if (!verification.success) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid MFA code'
                    });
                }

                // Enable MFA for user
                await database.enableMFA(userId, tempSecret);
                await database.clearTempMFASecret(userId);

                await authMiddleware.logActivity(req, 'MFA_ENABLED', `MFA enabled for user ${req.user.email}`, true);

                res.json({
                    success: true,
                    message: 'MFA setup completed successfully'
                });

            } catch (error) {
                console.error('MFA confirmation error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'MFA confirmation failed'
                });
            }
        }
    );

    // Verify MFA for sensitive operations endpoint
    router.post('/verify-mfa-operation',
        authMiddleware.authenticateToken(),
        async (req, res) => {
            try {
                const { mfaCode, operation } = req.body;
                const user = req.user;

                if (!mfaCode) {
                    return res.status(400).json({
                        success: false,
                        message: 'MFA code is required'
                    });
                }

                if (!user.mfaEnabled) {
                    return res.status(400).json({
                        success: false,
                        message: 'MFA is not enabled for this account'
                    });
                }

                // Get user's MFA secret
                const fullUser = await database.getUserById(user.id);
                if (!fullUser.mfa_secret) {
                    return res.status(400).json({
                        success: false,
                        message: 'MFA not properly configured'
                    });
                }

                // Verify MFA code
                const verification = mfaService.verifyTOTP(mfaCode, fullUser.mfa_secret);
                if (!verification.success) {
                    await authMiddleware.logActivity(req, 'MFA_OPERATION_FAILED', `Failed MFA verification for operation: ${operation}`, false);
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid MFA code'
                    });
                }

                // Update session to mark MFA as verified for operations
                req.session.mfaVerified = true;
                req.session.mfaTimestamp = Date.now();
                req.session.mfaAction = operation || 'CONFIDENTIAL_WRITE';
                req.session.mfaRiskScore = 0; // Set low risk for pre-verified operations

                console.log(`MFA operation verified - setting session: action=${req.session.mfaAction}, timestamp=${req.session.mfaTimestamp}`);

                await authMiddleware.logActivity(req, 'MFA_OPERATION_SUCCESS', `Successful MFA verification for operation: ${operation}`, true);

                res.json({
                    success: true,
                    message: 'MFA verification successful for operation',
                    operation: operation
                });

            } catch (error) {
                console.error('MFA operation verification error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'MFA operation verification failed'
                });
            }
        }
    );

    return router;
}

module.exports = createAuthRoutes;
