const express = require('express');
const AnomalyDetectionService = require('../services/AnomalyDetectionService');

function createAnalyticsRoutes(database, authMiddleware) {
    const router = express.Router();
    const anomalyDetection = new AnomalyDetectionService();

    // Get analytics dashboard data
    router.get('/dashboard',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN', 'MANAGER']),
        async (req, res) => {
            try {
                console.log(`Analytics dashboard requested by ${req.user.email}`);

                // Get activity logs for the last 24 hours
                const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
                
                const activityData = await getAnalyticsData(database, last24Hours);
                
                await authMiddleware.logActivity(req, 'ANALYTICS_VIEW', 'Viewed analytics dashboard', true);

                res.json({
                    success: true,
                    analytics: activityData,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Analytics dashboard error:', error.message);
                await authMiddleware.logActivity(req, 'ANALYTICS_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to load analytics data'
                });
            }
        }
    );

    // Get endpoint activity logs
    router.get('/endpoint-logs',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN', 'MANAGER']),
        async (req, res) => {
            try {
                const { timeRange = '24h', endpoint, userId } = req.query;
                
                let timeFilter = new Date();
                switch (timeRange) {
                    case '1h':
                        timeFilter = new Date(Date.now() - 60 * 60 * 1000);
                        break;
                    case '24h':
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        break;
                    case '7d':
                        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case '30d':
                        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                }

                let query = `
                    SELECT 
                        al.*,
                        u.email,
                        u.first_name,
                        u.last_name,
                        u.role
                    FROM audit_logs al
                    LEFT JOIN users u ON al.user_id = u.id
                    WHERE al.timestamp > ?
                `;
                const params = [timeFilter.toISOString()];

                // Add filters
                if (endpoint) {
                    query += ' AND al.action LIKE ?';
                    params.push(`%${endpoint}%`);
                }

                if (userId) {
                    query += ' AND al.user_id = ?';
                    params.push(userId);
                }

                query += ' ORDER BY al.timestamp DESC LIMIT 500';

                const logs = await new Promise((resolve, reject) => {
                    database.db.all(query, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                // Process logs for visualization
                const processedLogs = processLogsForVisualization(logs);

                await authMiddleware.logActivity(req, 'ANALYTICS_ENDPOINT_LOGS', `Viewed ${logs.length} endpoint logs`, true);

                res.json({
                    success: true,
                    logs: processedLogs.logs,
                    summary: processedLogs.summary,
                    timeRange: timeRange,
                    totalLogs: logs.length
                });

            } catch (error) {
                console.error('Endpoint logs error:', error.message);
                await authMiddleware.logActivity(req, 'ANALYTICS_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get endpoint logs'
                });
            }
        }
    );

    // Run anomaly detection analysis
    router.post('/anomaly-detection',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN', 'MANAGER']),
        async (req, res) => {
            try {
                const { userId, timeRange = '24h' } = req.body;

                console.log(`Running anomaly detection analysis for ${userId ? `user ${userId}` : 'all users'}`);

                let timeFilter = new Date();
                switch (timeRange) {
                    case '1h':
                        timeFilter = new Date(Date.now() - 60 * 60 * 1000);
                        break;
                    case '24h':
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        break;
                    case '7d':
                        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                }

                // Get recent activity for analysis
                let query = `
                    SELECT 
                        al.*,
                        u.email,
                        u.role
                    FROM audit_logs al
                    LEFT JOIN users u ON al.user_id = u.id
                    WHERE al.timestamp > ?
                `;
                const params = [timeFilter.toISOString()];

                if (userId) {
                    query += ' AND al.user_id = ?';
                    params.push(userId);
                }

                query += ' ORDER BY al.timestamp DESC';

                const activityLogs = await new Promise((resolve, reject) => {
                    database.db.all(query, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                // Group activities by user for analysis
                const userActivities = {};
                activityLogs.forEach(log => {
                    if (!userActivities[log.user_id]) {
                        userActivities[log.user_id] = {
                            userId: log.user_id,
                            email: log.email,
                            role: log.role,
                            activities: []
                        };
                    }
                    userActivities[log.user_id].activities.push(log);
                });

                // Run anomaly detection for each user
                const anomalyResults = [];
                for (const [userId, userData] of Object.entries(userActivities)) {
                    if (!userData.email) continue; // Skip if no user data

                    // Prepare activity data for anomaly detection
                    const activityData = {
                        action: userData.activities[0]?.action || 'UNKNOWN',
                        ipAddress: userData.activities[0]?.ip_address,
                        userAgent: userData.activities[0]?.user_agent,
                        resource: userData.activities[0]?.resource
                    };

                    const userContext = {
                        userId: userData.userId,
                        email: userData.email,
                        role: userData.role
                    };

                    // Run anomaly detection
                    const anomalies = await anomalyDetection.detectAnomalies(
                        activityData,
                        userContext,
                        database
                    );

                    if (anomalies.totalRiskScore > 0) {
                        anomalyResults.push({
                            user: {
                                id: userData.userId,
                                email: userData.email,
                                role: userData.role
                            },
                            anomalies: anomalies.anomalies,
                            riskScore: anomalies.totalRiskScore,
                            riskLevel: anomalies.riskLevel,
                            recommendedActions: anomalies.recommendedActions,
                            activityCount: userData.activities.length
                        });
                    }
                }

                // Sort by risk score (highest first)
                anomalyResults.sort((a, b) => b.riskScore - a.riskScore);

                await authMiddleware.logActivity(req, 'ANOMALY_DETECTION_RUN', `Analyzed ${Object.keys(userActivities).length} users, found ${anomalyResults.length} anomalies`, true);

                console.log(`Anomaly detection completed: ${anomalyResults.length} users with anomalies found`);

                res.json({
                    success: true,
                    anomalyResults: anomalyResults,
                    summary: {
                        totalUsersAnalyzed: Object.keys(userActivities).length,
                        totalAnomaliesFound: anomalyResults.length,
                        highRiskUsers: anomalyResults.filter(r => r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL').length,
                        timeRange: timeRange
                    },
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Anomaly detection error:', error.message);
                await authMiddleware.logActivity(req, 'ANALYTICS_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Anomaly detection failed'
                });
            }
        }
    );

    // Get security metrics
    router.get('/security-metrics',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN', 'MANAGER']),
        async (req, res) => {
            try {
                const timeRange = req.query.timeRange || '24h';
                
                let timeFilter = new Date();
                switch (timeRange) {
                    case '1h':
                        timeFilter = new Date(Date.now() - 60 * 60 * 1000);
                        break;
                    case '24h':
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        break;
                    case '7d':
                        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case '30d':
                        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                }

                // Get security-related metrics
                const metrics = await getSecurityMetrics(database, timeFilter);

                await authMiddleware.logActivity(req, 'ANALYTICS_SECURITY_METRICS', 'Viewed security metrics', true);

                res.json({
                    success: true,
                    metrics: metrics,
                    timeRange: timeRange,
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('Security metrics error:', error.message);
                await authMiddleware.logActivity(req, 'ANALYTICS_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get security metrics'
                });
            }
        }
    );

    // Get user activity report
    router.get('/user-activity/:userId',
        authMiddleware.authenticateToken(),
        authMiddleware.requireRole(['ADMIN', 'MANAGER']),
        async (req, res) => {
            try {
                const { userId } = req.params;
                const { timeRange = '7d' } = req.query;

                let timeFilter = new Date();
                switch (timeRange) {
                    case '24h':
                        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
                        break;
                    case '7d':
                        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case '30d':
                        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                }

                // Get user information
                const user = await database.getUserById(userId);
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }

                // Get user activity
                const userActivity = await new Promise((resolve, reject) => {
                    database.db.all(`
                        SELECT *
                        FROM audit_logs
                        WHERE user_id = ? AND timestamp > ?
                        ORDER BY timestamp DESC
                    `, [userId, timeFilter.toISOString()], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    });
                });

                // Process activity for visualization
                const activitySummary = processUserActivity(userActivity);

                await authMiddleware.logActivity(req, 'ANALYTICS_USER_ACTIVITY', `Viewed activity for user ${user.email}`, true);

                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        role: user.role,
                        status: user.status
                    },
                    activity: userActivity.map(log => ({
                        id: log.id,
                        action: log.action,
                        resource: log.resource,
                        success: log.success,
                        timestamp: log.timestamp,
                        ipAddress: log.ip_address,
                        riskScore: log.risk_score
                    })),
                    summary: activitySummary,
                    timeRange: timeRange
                });

            } catch (error) {
                console.error('User activity report error:', error.message);
                await authMiddleware.logActivity(req, 'ANALYTICS_ERROR', error.message, false);
                
                res.status(500).json({
                    success: false,
                    message: 'Failed to get user activity report'
                });
            }
        }
    );

    // Helper function to get analytics data
    async function getAnalyticsData(database, timeFilter) {
        // Get endpoint activity summary
        const endpointActivity = await new Promise((resolve, reject) => {
            database.db.all(`
                SELECT 
                    action,
                    COUNT(*) as count,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
                    AVG(risk_score) as avg_risk_score
                FROM audit_logs
                WHERE timestamp > ?
                GROUP BY action
                ORDER BY count DESC
            `, [timeFilter.toISOString()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Get hourly activity
        const hourlyActivity = await new Promise((resolve, reject) => {
            database.db.all(`
                SELECT 
                    strftime('%H', timestamp) as hour,
                    COUNT(*) as count,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
                FROM audit_logs
                WHERE timestamp > ?
                GROUP BY strftime('%H', timestamp)
                ORDER BY hour
            `, [timeFilter.toISOString()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Get user activity by role
        const roleActivity = await new Promise((resolve, reject) => {
            database.db.all(`
                SELECT 
                    u.role,
                    COUNT(al.id) as activity_count,
                    SUM(CASE WHEN al.success = 1 THEN 1 ELSE 0 END) as successful,
                    SUM(CASE WHEN al.success = 0 THEN 1 ELSE 0 END) as failed
                FROM audit_logs al
                JOIN users u ON al.user_id = u.id
                WHERE al.timestamp > ?
                GROUP BY u.role
                ORDER BY activity_count DESC
            `, [timeFilter.toISOString()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Get high-risk activities
        const highRiskActivities = await new Promise((resolve, reject) => {
            database.db.all(`
                SELECT 
                    al.*,
                    u.email,
                    u.role
                FROM audit_logs al
                LEFT JOIN users u ON al.user_id = u.id
                WHERE al.timestamp > ? AND al.risk_score >= 5
                ORDER BY al.risk_score DESC, al.timestamp DESC
                LIMIT 20
            `, [timeFilter.toISOString()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        return {
            endpointActivity,
            hourlyActivity,
            roleActivity,
            highRiskActivities: highRiskActivities.map(activity => ({
                id: activity.id,
                action: activity.action,
                resource: activity.resource,
                success: activity.success,
                timestamp: activity.timestamp,
                ipAddress: activity.ip_address,
                riskScore: activity.risk_score,
                user: activity.email ? {
                    email: activity.email,
                    role: activity.role
                } : null
            }))
        };
    }

    // Helper function to get security metrics
    async function getSecurityMetrics(database, timeFilter) {
        // Failed login attempts
        const failedLogins = await new Promise((resolve, reject) => {
            database.db.get(`
                SELECT COUNT(*) as count
                FROM audit_logs
                WHERE action = 'LOGIN_FAILED' AND timestamp > ?
            `, [timeFilter.toISOString()], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // MFA usage
        const mfaEvents = await new Promise((resolve, reject) => {
            database.db.all(`
                SELECT 
                    action,
                    COUNT(*) as count
                FROM audit_logs
                WHERE (action LIKE '%MFA%' OR action LIKE '%TWO_FACTOR%') 
                AND timestamp > ?
                GROUP BY action
            `, [timeFilter.toISOString()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Permission denials
        const permissionDenials = await new Promise((resolve, reject) => {
            database.db.get(`
                SELECT COUNT(*) as count
                FROM audit_logs
                WHERE (action LIKE '%DENIED%' OR action LIKE '%UNAUTHORIZED%') 
                AND timestamp > ?
            `, [timeFilter.toISOString()], (err, row) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            });
        });

        // File access patterns
        const fileAccess = await new Promise((resolve, reject) => {
            database.db.all(`
                SELECT 
                    CASE 
                        WHEN action LIKE '%IMAGES%' THEN 'IMAGES'
                        WHEN action LIKE '%DOCUMENTS%' THEN 'DOCUMENTS'
                        WHEN action LIKE '%CONFIDENTIAL%' THEN 'CONFIDENTIAL'
                        ELSE 'OTHER'
                    END as category,
                    COUNT(*) as count
                FROM audit_logs
                WHERE (action LIKE '%_READ%' OR action LIKE '%_WRITE%' OR action LIKE '%_CREATE%' OR action LIKE '%_DELETE%')
                AND timestamp > ?
                GROUP BY category
                ORDER BY count DESC
            `, [timeFilter.toISOString()], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        return {
            failedLogins,
            mfaEvents,
            permissionDenials,
            fileAccess
        };
    }

    // Helper function to process logs for visualization
    function processLogsForVisualization(logs) {
        const summary = {
            totalLogs: logs.length,
            successfulActions: 0,
            failedActions: 0,
            uniqueUsers: new Set(),
            uniqueIPs: new Set(),
            actionBreakdown: {},
            riskLevels: { low: 0, medium: 0, high: 0, critical: 0 }
        };

        const processedLogs = logs.map(log => {
            // Update summary statistics
            if (log.success) summary.successfulActions++;
            else summary.failedActions++;

            if (log.user_id) summary.uniqueUsers.add(log.user_id);
            if (log.ip_address) summary.uniqueIPs.add(log.ip_address);

            // Action breakdown
            if (!summary.actionBreakdown[log.action]) {
                summary.actionBreakdown[log.action] = 0;
            }
            summary.actionBreakdown[log.action]++;

            // Risk level categorization
            const riskScore = log.risk_score || 0;
            if (riskScore >= 8) summary.riskLevels.critical++;
            else if (riskScore >= 6) summary.riskLevels.high++;
            else if (riskScore >= 3) summary.riskLevels.medium++;
            else summary.riskLevels.low++;

            return {
                id: log.id,
                action: log.action,
                resource: log.resource,
                success: log.success,
                timestamp: log.timestamp,
                ipAddress: log.ip_address,
                riskScore: log.risk_score || 0,
                user: log.email ? {
                    email: log.email,
                    name: `${log.first_name} ${log.last_name}`,
                    role: log.role
                } : null
            };
        });

        // Convert sets to counts
        summary.uniqueUsers = summary.uniqueUsers.size;
        summary.uniqueIPs = summary.uniqueIPs.size;

        return { logs: processedLogs, summary };
    }

    // Helper function to process user activity
    function processUserActivity(activities) {
        const summary = {
            totalActivities: activities.length,
            successful: activities.filter(a => a.success).length,
            failed: activities.filter(a => a.success === 0).length,
            averageRiskScore: activities.reduce((sum, a) => sum + (a.risk_score || 0), 0) / activities.length,
            actionBreakdown: {},
            timePattern: {}
        };

        activities.forEach(activity => {
            // Action breakdown
            if (!summary.actionBreakdown[activity.action]) {
                summary.actionBreakdown[activity.action] = 0;
            }
            summary.actionBreakdown[activity.action]++;

            // Time pattern (by hour)
            const hour = new Date(activity.timestamp).getHours();
            if (!summary.timePattern[hour]) {
                summary.timePattern[hour] = 0;
            }
            summary.timePattern[hour]++;
        });

        return summary;
    }

    return router;
}

module.exports = createAnalyticsRoutes;
