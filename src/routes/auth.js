const express = require('express');
const bcrypt = require('bcrypt');
const SecurityMiddleware = require('../middleware/SecurityMiddleware');

function createAuthRoutes(database, authMiddleware) {
    const router = express.Router();

    // Login endpoint
    router.post('/login',
        SecurityMiddleware.loginRateLimit,
        async (req, res) => {
            try {
                const { email, password } = req.body;
                console.log(`🔐 Login attempt for: ${email}`);

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

                // Generate JWT token
                const token = await authMiddleware.generateJWT(user);
                
                console.log(`✅ Login successful for: ${user.email}`);

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
                console.error('❌ Login error:', error.message);
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
                console.log(`📝 Registration attempt for: ${email}`);

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
                    password_hash: hashedPassword,
                    first_name: firstName,
                    last_name: lastName,
                    role: requestedRole || 'USER',
                    status: 'PENDING_APPROVAL'
                });

                console.log(`✅ User registered: ${email} (ID: ${userId})`);

                res.status(201).json({
                    success: true,
                    message: 'Registration successful! Please wait for admin approval.',
                    userId: userId
                });

            } catch (error) {
                console.error('❌ Registration error:', error.message);
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
                console.error('❌ Token verification error:', error.message);
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
                console.error('❌ Logout error:', error.message);
                res.status(500).json({
                    success: false,
                    message: 'Logout failed'
                });
            }
        }
    );

    return router;
}

module.exports = createAuthRoutes;
