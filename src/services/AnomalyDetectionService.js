class AnomalyDetectionService {
    constructor() {
        this.riskThresholds = {
            LOW: 3,
            MEDIUM: 6,
            HIGH: 8,
            CRITICAL: 10
        };

        this.maxFailedLogins = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
        this.loginWindowMs = parseInt(process.env.LOGIN_WINDOW_MS) || 900000; // 15 minutes
        
        this.suspiciousPatterns = {
            // Time-based anomalies
            AFTER_HOURS: { weight: 2, description: 'Access outside business hours' },
            WEEKEND_ACCESS: { weight: 1, description: 'Weekend access detected' },
            
            // Geographic anomalies
            NEW_LOCATION: { weight: 3, description: 'Access from new geographic location' },
            IMPOSSIBLE_TRAVEL: { weight: 5, description: 'Impossible travel time between locations' },
            
            // Behavioral anomalies
            RAPID_REQUESTS: { weight: 4, description: 'Rapid successive requests detected' },
            PRIVILEGE_ESCALATION: { weight: 5, description: 'Attempted privilege escalation' },
            BULK_DOWNLOAD: { weight: 3, description: 'Bulk file download detected' },
            
            // Authentication anomalies
            MULTIPLE_FAILED_LOGINS: { weight: 4, description: 'Multiple failed login attempts' },
            NEW_DEVICE: { weight: 2, description: 'Login from new device' },
            CONCURRENT_SESSIONS: { weight: 3, description: 'Multiple concurrent sessions' },
            
            // Data access anomalies
            CONFIDENTIAL_ACCESS_VIOLATION: { weight: 5, description: 'Unauthorized confidential file access' },
            UNUSUAL_FILE_ACTIVITY: { weight: 3, description: 'Unusual file access pattern' },
            OFF_HOURS_CONFIDENTIAL: { weight: 4, description: 'Confidential access outside hours' }
        };
    }

    // Main anomaly detection function
    async detectAnomalies(activityData, userContext, database) {
        const anomalies = [];
        let totalRiskScore = 0;

        console.log(`🔍 Starting anomaly detection for user: ${userContext.userId}`);

        try {
            // 1. Check time-based anomalies
            const timeAnomalies = this.checkTimeAnomalies(activityData);
            anomalies.push(...timeAnomalies);

            // 2. Check authentication anomalies
            const authAnomalies = await this.checkAuthenticationAnomalies(activityData, userContext, database);
            anomalies.push(...authAnomalies);

            // 3. Check access pattern anomalies
            const accessAnomalies = await this.checkAccessPatterns(activityData, userContext, database);
            anomalies.push(...accessAnomalies);

            // 4. Check privilege escalation attempts
            const privAnomalies = this.checkPrivilegeEscalation(activityData, userContext);
            anomalies.push(...privAnomalies);

            // 5. Check file access anomalies
            const fileAnomalies = await this.checkFileAccessAnomalies(activityData, userContext, database);
            anomalies.push(...fileAnomalies);

            // Calculate total risk score
            totalRiskScore = anomalies.reduce((sum, anomaly) => sum + anomaly.weight, 0);

            const result = {
                anomalies,
                totalRiskScore,
                riskLevel: this.getRiskLevel(totalRiskScore),
                timestamp: new Date().toISOString(),
                userId: userContext.userId,
                recommendedActions: this.getRecommendedActions(totalRiskScore, anomalies)
            };

            // Log high-risk anomalies
            if (totalRiskScore >= this.riskThresholds.HIGH) {
                console.log(`HIGH RISK ANOMALY DETECTED - User: ${userContext.userId}, Score: ${totalRiskScore}`);
                console.log(`Anomalies: ${anomalies.map(a => a.type).join(', ')}`);
            }

            return result;

        } catch (error) {
            console.error('Anomaly detection failed:', error.message);
            return {
                anomalies: [],
                totalRiskScore: 0,
                riskLevel: 'UNKNOWN',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Check time-based anomalies
    checkTimeAnomalies(activityData) {
        const anomalies = [];
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay(); // 0 = Sunday, 6 = Saturday

        // After hours access (before 8 AM or after 6 PM)
        if (hour < 8 || hour > 18) {
            anomalies.push({
                type: 'AFTER_HOURS',
                weight: this.suspiciousPatterns.AFTER_HOURS.weight,
                description: this.suspiciousPatterns.AFTER_HOURS.description,
                details: `Access at ${hour}:${now.getMinutes().toString().padStart(2, '0')}`,
                timestamp: now.toISOString()
            });
        }

        // Weekend access
        if (day === 0 || day === 6) {
            anomalies.push({
                type: 'WEEKEND_ACCESS',
                weight: this.suspiciousPatterns.WEEKEND_ACCESS.weight,
                description: this.suspiciousPatterns.WEEKEND_ACCESS.description,
                details: `Access on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}`,
                timestamp: now.toISOString()
            });
        }

        return anomalies;
    }

    // Check authentication-related anomalies
    async checkAuthenticationAnomalies(activityData, userContext, database) {
        const anomalies = [];
        const userId = userContext.userId;

        try {
            // Check for multiple failed login attempts
            const recentFailedLogins = await this.getRecentFailedLogins(userId, database);
            if (recentFailedLogins >= this.maxFailedLogins) {
                anomalies.push({
                    type: 'MULTIPLE_FAILED_LOGINS',
                    weight: this.suspiciousPatterns.MULTIPLE_FAILED_LOGINS.weight,
                    description: this.suspiciousPatterns.MULTIPLE_FAILED_LOGINS.description,
                    details: `${recentFailedLogins} failed attempts in ${this.loginWindowMs / 60000} minutes`,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for concurrent sessions
            const concurrentSessions = await this.getConcurrentSessions(userId, database);
            if (concurrentSessions > 2) {
                anomalies.push({
                    type: 'CONCURRENT_SESSIONS',
                    weight: this.suspiciousPatterns.CONCURRENT_SESSIONS.weight,
                    description: this.suspiciousPatterns.CONCURRENT_SESSIONS.description,
                    details: `${concurrentSessions} active sessions detected`,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for new device login
            if (activityData.userAgent && await this.isNewDevice(userId, activityData.userAgent, database)) {
                anomalies.push({
                    type: 'NEW_DEVICE',
                    weight: this.suspiciousPatterns.NEW_DEVICE.weight,
                    description: this.suspiciousPatterns.NEW_DEVICE.description,
                    details: `New device: ${activityData.userAgent.substring(0, 50)}...`,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('Authentication anomaly check failed:', error.message);
        }

        return anomalies;
    }

    // Check access pattern anomalies
    async checkAccessPatterns(activityData, userContext, database) {
        const anomalies = [];
        const userId = userContext.userId;

        try {
            // Check for rapid successive requests
            const recentRequests = await this.getRecentRequests(userId, database, 60000); // Last minute
            if (recentRequests > 30) { // More than 30 requests per minute
                anomalies.push({
                    type: 'RAPID_REQUESTS',
                    weight: this.suspiciousPatterns.RAPID_REQUESTS.weight,
                    description: this.suspiciousPatterns.RAPID_REQUESTS.description,
                    details: `${recentRequests} requests in the last minute`,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for unusual geographic access
            if (activityData.ipAddress) {
                const locationAnomaly = await this.checkGeographicAnomaly(userId, activityData.ipAddress, database);
                if (locationAnomaly) {
                    anomalies.push(locationAnomaly);
                }
            }

        } catch (error) {
            console.error('Access pattern anomaly check failed:', error.message);
        }

        return anomalies;
    }

    // Check privilege escalation attempts
    checkPrivilegeEscalation(activityData, userContext) {
        const anomalies = [];
        
        if (activityData.action && userContext.role) {
            const unauthorizedActions = this.getUnauthorizedActions(activityData.action, userContext.role);
            
            if (unauthorizedActions.length > 0) {
                anomalies.push({
                    type: 'PRIVILEGE_ESCALATION',
                    weight: this.suspiciousPatterns.PRIVILEGE_ESCALATION.weight,
                    description: this.suspiciousPatterns.PRIVILEGE_ESCALATION.description,
                    details: `Attempted: ${unauthorizedActions.join(', ')} as ${userContext.role}`,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return anomalies;
    }

    // Check file access anomalies
    async checkFileAccessAnomalies(activityData, userContext, database) {
        const anomalies = [];
        
        try {
            // Check for confidential file access violations
            if (activityData.resource === 'CONFIDENTIAL' && activityData.action === 'READ') {
                if (!await this.hasConfidentialAccess(userContext.role)) {
                    anomalies.push({
                        type: 'CONFIDENTIAL_ACCESS_VIOLATION',
                        weight: this.suspiciousPatterns.CONFIDENTIAL_ACCESS_VIOLATION.weight,
                        description: this.suspiciousPatterns.CONFIDENTIAL_ACCESS_VIOLATION.description,
                        details: `Role ${userContext.role} attempted confidential access`,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Check for bulk download attempts
            const recentDownloads = await this.getRecentDownloads(userContext.userId, database, 300000); // 5 minutes
            if (recentDownloads > 10) {
                anomalies.push({
                    type: 'BULK_DOWNLOAD',
                    weight: this.suspiciousPatterns.BULK_DOWNLOAD.weight,
                    description: this.suspiciousPatterns.BULK_DOWNLOAD.description,
                    details: `${recentDownloads} downloads in 5 minutes`,
                    timestamp: new Date().toISOString()
                });
            }

            // Check for off-hours confidential access
            const hour = new Date().getHours();
            if (activityData.resource === 'CONFIDENTIAL' && (hour < 8 || hour > 18)) {
                anomalies.push({
                    type: 'OFF_HOURS_CONFIDENTIAL',
                    weight: this.suspiciousPatterns.OFF_HOURS_CONFIDENTIAL.weight,
                    description: this.suspiciousPatterns.OFF_HOURS_CONFIDENTIAL.description,
                    details: `Confidential access at ${hour}:${new Date().getMinutes().toString().padStart(2, '0')}`,
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('File access anomaly check failed:', error.message);
        }

        return anomalies;
    }

    // Helper method to get recent failed logins
    async getRecentFailedLogins(userId, database) {
        return new Promise((resolve, reject) => {
            const timeWindow = new Date(Date.now() - this.loginWindowMs);
            
            database.db.get(`
                SELECT COUNT(*) as count 
                FROM audit_logs 
                WHERE user_id = ? 
                AND action = 'LOGIN_ATTEMPT' 
                AND success = 0 
                AND timestamp > ?
            `, [userId, timeWindow.toISOString()], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.count : 0);
                }
            });
        });
    }

    // Helper method to get concurrent sessions
    async getConcurrentSessions(userId, database) {
        return new Promise((resolve, reject) => {
            database.db.get(`
                SELECT COUNT(*) as count 
                FROM sessions 
                WHERE user_id = ? AND is_active = 1
            `, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.count : 0);
                }
            });
        });
    }

    // Helper method to check if device is new
    async isNewDevice(userId, userAgent, database) {
        return new Promise((resolve, reject) => {
            database.db.get(`
                SELECT id 
                FROM audit_logs 
                WHERE user_id = ? AND user_agent = ? 
                LIMIT 1
            `, [userId, userAgent], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!row); // New device if no previous record
                }
            });
        });
    }

    // Helper method to get recent requests count
    async getRecentRequests(userId, database, timeWindowMs) {
        return new Promise((resolve, reject) => {
            const timeWindow = new Date(Date.now() - timeWindowMs);
            
            database.db.get(`
                SELECT COUNT(*) as count 
                FROM audit_logs 
                WHERE user_id = ? AND timestamp > ?
            `, [userId, timeWindow.toISOString()], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.count : 0);
                }
            });
        });
    }

    // Helper method to get recent downloads
    async getRecentDownloads(userId, database, timeWindowMs) {
        return new Promise((resolve, reject) => {
            const timeWindow = new Date(Date.now() - timeWindowMs);
            
            database.db.get(`
                SELECT COUNT(*) as count 
                FROM audit_logs 
                WHERE user_id = ? 
                AND action LIKE '%_READ%' 
                AND success = 1 
                AND timestamp > ?
            `, [userId, timeWindow.toISOString()], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row ? row.count : 0);
                }
            });
        });
    }

    // Check geographic anomalies (simplified - in production, use IP geolocation service)
    async checkGeographicAnomaly(userId, ipAddress, database) {
        // For demo purposes, we'll just check if it's a new IP
        return new Promise((resolve, reject) => {
            database.db.get(`
                SELECT ip_address 
                FROM audit_logs 
                WHERE user_id = ? AND ip_address = ? 
                LIMIT 1
            `, [userId, ipAddress], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve({
                        type: 'NEW_LOCATION',
                        weight: this.suspiciousPatterns.NEW_LOCATION.weight,
                        description: this.suspiciousPatterns.NEW_LOCATION.description,
                        details: `New IP address: ${ipAddress}`,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // Get unauthorized actions for role
    getUnauthorizedActions(action, role) {
        const unauthorizedActions = [];
        
        // Define role-based action restrictions
        const restrictions = {
            'GUEST': ['CREATE', 'WRITE', 'DELETE', 'USER_MANAGEMENT'],
            'USER': ['DELETE', 'USER_MANAGEMENT', 'CONFIDENTIAL_WRITE', 'CONFIDENTIAL_CREATE'],
            'MANAGER': ['USER_MANAGEMENT'],
            'ADMIN': [] // Admins can do everything
        };

        const restrictedForRole = restrictions[role] || [];
        
        if (restrictedForRole.some(restricted => action.includes(restricted))) {
            unauthorizedActions.push(action);
        }

        return unauthorizedActions;
    }

    // Check if role has confidential access
    async hasConfidentialAccess(role) {
        const rolesWithConfidentialAccess = ['ADMIN', 'MANAGER', 'USER'];
        return rolesWithConfidentialAccess.includes(role);
    }

    // Determine risk level based on score
    getRiskLevel(score) {
        if (score >= this.riskThresholds.CRITICAL) return 'CRITICAL';
        if (score >= this.riskThresholds.HIGH) return 'HIGH';
        if (score >= this.riskThresholds.MEDIUM) return 'MEDIUM';
        if (score >= this.riskThresholds.LOW) return 'LOW';
        return 'NORMAL';
    }

    // Get recommended actions based on risk level
    getRecommendedActions(riskScore, anomalies) {
        const actions = [];

        if (riskScore >= this.riskThresholds.CRITICAL) {
            actions.push('IMMEDIATE_ACCOUNT_SUSPENSION');
            actions.push('SECURITY_TEAM_ALERT');
            actions.push('FORCE_PASSWORD_RESET');
            actions.push('REVOKE_ALL_SESSIONS');
        } else if (riskScore >= this.riskThresholds.HIGH) {
            actions.push('REQUIRE_MFA_VERIFICATION');
            actions.push('LIMIT_ACCESS_PRIVILEGES');
            actions.push('ENHANCED_MONITORING');
        } else if (riskScore >= this.riskThresholds.MEDIUM) {
            actions.push('REQUIRE_MFA_FOR_SENSITIVE_ACTIONS');
            actions.push('INCREASE_MONITORING');
        } else if (riskScore >= this.riskThresholds.LOW) {
            actions.push('LOG_FOR_REVIEW');
        }

        // Add specific actions based on anomaly types
        const anomalyTypes = anomalies.map(a => a.type);
        
        if (anomalyTypes.includes('MULTIPLE_FAILED_LOGINS')) {
            actions.push('TEMPORARY_ACCOUNT_LOCK');
        }
        
        if (anomalyTypes.includes('PRIVILEGE_ESCALATION')) {
            actions.push('SECURITY_AUDIT');
        }

        return [...new Set(actions)]; // Remove duplicates
    }
}

module.exports = AnomalyDetectionService;
