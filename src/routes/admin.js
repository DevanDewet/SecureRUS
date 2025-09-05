const express = require('express');

function createAdminRoutes(database, authMiddleware) {
    const router = express.Router();

    // Middleware to require admin or manager role
    const requireAdminOrManager = authMiddleware.requireRole(['ADMIN', 'MANAGER']);

    // Get pending user approvals
    router.get('/pending-users',
        authMiddleware.authenticateToken(),
        requireAdminOrManager,
        async (req, res) => {
            try {
                const pendingUsers = await new Promise((resolve, reject) => {
                    database.db.all(`
                        SELECT id, email, first_name, last_name, created_at, role
                        FROM users 
                        WHERE status = 'PENDING_APPROVAL'
                        ORDER BY created_at ASC
                    `, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                await authMiddleware.logActivity(req, 'ADMIN_VIEW_PENDING', `Found ${pendingUsers.length} pending users`, true);

                res.json({
                    success: true,
                    users: pendingUsers.map(user => ({
                        id: user.id,
                        email: user.email,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        role: user.role,
                        registeredAt: user.created_at
                    }))
                });

            } catch (error) {
                console.error('Get pending users error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get pending users'
                });
            }
        }
    );

    // Get all users (admin only)
    router.get('/users',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN']),
        async (req, res) => {
            try {
                const users = await new Promise((resolve, reject) => {
                    database.db.all(`
                        SELECT id, email, first_name, last_name, role, status, 
                               created_at, last_login, mfa_enabled,
                               approved_by, approved_at
                        FROM users 
                        ORDER BY created_at DESC
                    `, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                await authMiddleware.logActivity(req, 'ADMIN_VIEW_ALL_USERS', `Viewed ${users.length} users`, true);

                res.json({
                    success: true,
                    users: users.map(user => ({
                        id: user.id,
                        email: user.email,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        role: user.role,
                        status: user.status,
                        mfaEnabled: user.mfa_enabled,
                        registeredAt: user.created_at,
                        lastLogin: user.last_login,
                        approvedBy: user.approved_by,
                        approvedAt: user.approved_at
                    }))
                });

            } catch (error) {
                console.error('Get all users error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get users'
                });
            }
        }
    );

    // Approve user
    router.post('/approve-user',
        authMiddleware.authenticateToken(),
        requireAdminOrManager,
        async (req, res) => {
            try {
                const { userId } = req.body;
                const approvedBy = req.user.id;

                if (!userId) {
                    return res.status(400).json({
                        success: false,
                        message: 'User ID is required'
                    });
                }

                // Check if user exists and is pending
                const user = await database.getUserById(userId);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                if (user.status !== 'PENDING_APPROVAL') {
                    return res.status(400).json({
                        success: false,
                        message: 'User is not pending approval'
                    });
                }

                // Approve the user
                await database.db.run(`
                    UPDATE users 
                    SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [approvedBy, userId]);

                await authMiddleware.logActivity(req, 'USER_APPROVED', `User ${user.email} approved`, true);

                console.log(`User approved: ${user.email} by ${req.user.email}`);

                res.json({
                    success: true,
                    message: 'User approved successfully'
                });

            } catch (error) {
                console.error('Approve user error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to approve user'
                });
            }
        }
    );

    // Reject/revoke user
    router.post('/revoke-user',
        authMiddleware.authenticateToken(),
        requireAdminOrManager,
        async (req, res) => {
            try {
                const { userId, reason } = req.body;

                if (!userId) {
                    return res.status(400).json({
                        success: false,
                        message: 'User ID is required'
                    });
                }

                // Check if user exists
                const user = await database.getUserById(userId);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                // Don't allow revoking admin users (prevent lockout)
                if (user.role === 'ADMIN' && req.user.role !== 'ADMIN') {
                    return res.status(403).json({
                        success: false,
                        message: 'Cannot revoke admin users'
                    });
                }

                // Revoke the user
                await database.db.run(`
                    UPDATE users 
                    SET status = 'REVOKED'
                    WHERE id = ?
                `, [userId]);

                // Deactivate all sessions for the user
                await database.db.run(`
                    UPDATE sessions 
                    SET is_active = 0
                    WHERE user_id = ?
                `, [userId]);

                await authMiddleware.logActivity(req, 'USER_REVOKED', `User ${user.email} revoked. Reason: ${reason || 'No reason provided'}`, true);

                console.log(`User revoked: ${user.email} by ${req.user.email}. Reason: ${reason || 'No reason provided'}`);

                res.json({
                    success: true,
                    message: 'User access revoked successfully'
                });

            } catch (error) {
                console.error('Revoke user error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to revoke user access'
                });
            }
        }
    );

    // Assign role to user (admin only)
    router.post('/assign-role',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN']),
        async (req, res) => {
            try {
                const { userId, role } = req.body;

                if (!userId || !role) {
                    return res.status(400).json({
                        success: false,
                        message: 'User ID and role are required'
                    });
                }

                const validRoles = ['ADMIN', 'MANAGER', 'USER', 'GUEST'];
                if (!validRoles.includes(role)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid role specified'
                    });
                }

                // Check if user exists
                const user = await database.getUserById(userId);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                // Update user role and status if needed
                // If user is currently REVOKED, approve them when role is changed
                if (user.status === 'REVOKED') {
                    await database.db.run(`
                        UPDATE users 
                        SET role = ?, status = 'APPROVED'
                        WHERE id = ?
                    `, [role, userId]);
                    
                    await authMiddleware.logActivity(req, 'STATUS_CHANGED', `User ${user.email} status changed from REVOKED to APPROVED due to role assignment`, true);
                } else {
                    // Just update the role if status is not REVOKED
                    await database.db.run(`
                        UPDATE users 
                        SET role = ?
                        WHERE id = ?
                    `, [role, userId]);
                }

                await authMiddleware.logActivity(req, 'ROLE_ASSIGNED', `User ${user.email} assigned role: ${role}`, true);

                const statusMessage = user.status === 'REVOKED' 
                    ? `Role assigned and user approved: ${user.email} -> ${role} by ${req.user.email}`
                    : `Role assigned: ${user.email} -> ${role} by ${req.user.email}`;
                
                console.log(statusMessage);

                res.json({
                    success: true,
                    message: user.status === 'REVOKED' 
                        ? 'Role assigned and user approved successfully' 
                        : 'Role assigned successfully'
                });

            } catch (error) {
                console.error('Assign role error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to assign role'
                });
            }
        }
    );

    // Get system statistics (admin only)
    router.get('/stats',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN']),
        async (req, res) => {
            try {
                // Get user statistics
                const userStats = await new Promise((resolve, reject) => {
                    database.db.all(`
                        SELECT 
                            status,
                            role,
                            COUNT(*) as count
                        FROM users 
                        GROUP BY status, role
                        ORDER BY status, role
                    `, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                // Get file statistics
                const fileStats = await new Promise((resolve, reject) => {
                    database.db.all(`
                        SELECT 
                            category,
                            COUNT(*) as count,
                            SUM(file_size) as total_size,
                            SUM(CASE WHEN is_encrypted = 1 THEN 1 ELSE 0 END) as encrypted_count
                        FROM files 
                        GROUP BY category
                        ORDER BY category
                    `, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                // Get recent activity
                const recentActivity = await new Promise((resolve, reject) => {
                    database.db.all(`
                        SELECT 
                            al.action,
                            al.success,
                            al.timestamp,
                            al.ip_address,
                            u.email,
                            u.first_name,
                            u.last_name
                        FROM audit_logs al
                        LEFT JOIN users u ON al.user_id = u.id
                        ORDER BY al.timestamp DESC
                        LIMIT 50
                    `, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                await authMiddleware.logActivity(req, 'ADMIN_VIEW_STATS', 'Viewed system statistics', true);

                res.json({
                    success: true,
                    statistics: {
                        users: userStats,
                        files: fileStats,
                        recentActivity: recentActivity.map(activity => ({
                            action: activity.action,
                            success: activity.success,
                            timestamp: activity.timestamp,
                            ipAddress: activity.ip_address,
                            user: activity.email ? {
                                email: activity.email,
                                name: `${activity.first_name} ${activity.last_name}`
                            } : null
                        }))
                    }
                });

            } catch (error) {
                console.error('Get stats error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get system statistics'
                });
            }
        }
    );

    // Get audit logs (admin only)
    router.get('/audit-logs',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN']),
        async (req, res) => {
            try {
                const { page = 1, limit = 50, userId, action, success } = req.query;
                const offset = (parseInt(page) - 1) * parseInt(limit);

                let query = `
                    SELECT 
                        al.*,
                        u.email,
                        u.first_name,
                        u.last_name
                    FROM audit_logs al
                    LEFT JOIN users u ON al.user_id = u.id
                    WHERE 1=1
                `;
                const params = [];

                // Add filters
                if (userId) {
                    query += ' AND al.user_id = ?';
                    params.push(userId);
                }

                if (action) {
                    query += ' AND al.action LIKE ?';
                    params.push(`%${action}%`);
                }

                if (success !== undefined) {
                    query += ' AND al.success = ?';
                    params.push(success === 'true' ? 1 : 0);
                }

                query += ` ORDER BY al.timestamp DESC LIMIT ? OFFSET ?`;
                params.push(parseInt(limit), offset);

                const logs = await new Promise((resolve, reject) => {
                    database.db.all(query, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                // Get total count for pagination
                let countQuery = 'SELECT COUNT(*) as total FROM audit_logs WHERE 1=1';
                const countParams = [];
                let paramIndex = 0;

                if (userId) {
                    countQuery += ' AND user_id = ?';
                    countParams.push(params[paramIndex++]);
                }
                if (action) {
                    countQuery += ' AND action LIKE ?';
                    countParams.push(params[paramIndex++]);
                }
                if (success !== undefined) {
                    countQuery += ' AND success = ?';
                    countParams.push(params[paramIndex++]);
                }

                const totalResult = await new Promise((resolve, reject) => {
                    database.db.get(countQuery, countParams, (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                await authMiddleware.logActivity(req, 'ADMIN_VIEW_AUDIT_LOGS', `Viewed ${logs.length} audit log entries`, true);

                res.json({
                    success: true,
                    logs: logs.map(log => ({
                        id: log.id,
                        action: log.action,
                        resource: log.resource,
                        success: log.success,
                        timestamp: log.timestamp,
                        ipAddress: log.ip_address,
                        userAgent: log.user_agent,
                        errorMessage: log.error_message,
                        riskScore: log.risk_score,
                        user: log.email ? {
                            id: log.user_id,
                            email: log.email,
                            name: `${log.first_name} ${log.last_name}`
                        } : null
                    })),
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalResult.total / parseInt(limit)),
                        totalItems: totalResult.total,
                        itemsPerPage: parseInt(limit)
                    }
                });

            } catch (error) {
                console.error('Get audit logs error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get audit logs'
                });
            }
        }
    );

    // Delete user endpoint (admin only)
    router.delete('/user/:userId',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN']),
        async (req, res) => {
            try {
                const { userId } = req.params;
                const currentUserId = req.user.id;

                // Prevent admin from deleting themselves
                if (parseInt(userId) === currentUserId) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot delete your own account'
                    });
                }

                // Get user details before deletion for logging
                const userToDelete = await new Promise((resolve, reject) => {
                    database.db.get(`
                        SELECT id, email, first_name, last_name, role 
                        FROM users WHERE id = ?
                    `, [userId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (!userToDelete) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                // Delete user from database
                await new Promise((resolve, reject) => {
                    database.db.run(`DELETE FROM users WHERE id = ?`, [userId], function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    });
                });

                await authMiddleware.logActivity(req, 'ADMIN_DELETE_USER', 
                    `Deleted user: ${userToDelete.email} (${userToDelete.first_name} ${userToDelete.last_name})`, true);

                res.json({
                    success: true,
                    message: `User ${userToDelete.first_name} ${userToDelete.last_name} has been deleted successfully`
                });

            } catch (error) {
                console.error('Delete user error:', error.message);
                await authMiddleware.logActivity(req, 'ADMIN_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to delete user'
                });
            }
        }
    );

    return router;
}

module.exports = createAdminRoutes;
