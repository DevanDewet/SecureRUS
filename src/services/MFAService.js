const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');

class MFAService {
    constructor() {
        this.serviceName = process.env.MFA_SERVICE_NAME || 'SecureRUS';
        this.issuer = process.env.MFA_ISSUER || 'SecureRUS-Security';
    }

    // Generate MFA secret for user
    generateMFASecret(userEmail) {
        try {
            console.log(`Generating MFA secret for: ${userEmail}`);
            
            const secret = speakeasy.generateSecret({
                name: `${userEmail} (${this.serviceName})`,
                issuer: this.issuer,
                length: 32
            });

            console.log(`MFA secret generated successfully`);

            return {
                secret: secret.base32,
                otpauth_url: secret.otpauth_url,
                manual_entry_key: secret.base32
            };
        } catch (error) {
            console.error('MFA secret generation failed:', error.message);
            throw new Error(`MFA secret generation failed: ${error.message}`);
        }
    }

    // Generate QR code for MFA setup
    async generateQRCode(otpauth_url) {
        try {
            console.log('Generating QR code for MFA setup');
            
            const qrCodeDataURL = await qrcode.toDataURL(otpauth_url, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            console.log('QR code generated successfully');
            return qrCodeDataURL;
        } catch (error) {
            console.error('QR code generation failed:', error.message);
            throw new Error(`QR code generation failed: ${error.message}`);
        }
    }

    // Verify TOTP token
    verifyTOTP(token, secret, window = 2) {
        try {
            // Remove any spaces and ensure it's a string
            const cleanToken = token.toString().replace(/\s/g, '');
            
            if (!/^\d{6}$/.test(cleanToken)) {
                console.log('Invalid token format');
                return { success: false, message: 'Invalid token format' };
            }

            const verified = speakeasy.totp.verify({
                secret: secret,
                encoding: 'base32',
                token: cleanToken,
                window: window, // Allow for time drift
                step: 30 // 30 second time step
            });

            if (verified) {
                console.log('TOTP verification successful');
                return { success: true, message: 'Token verified successfully' };
            } else {
                console.log('TOTP verification failed');
                return { success: false, message: 'Invalid token' };
            }
        } catch (error) {
            console.error('TOTP verification error:', error.message);
            return { success: false, message: 'Token verification failed' };
        }
    }

    // Generate backup codes
    generateBackupCodes(count = 10) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate 8-digit backup codes with dashes for readability
            const code1 = crypto.randomInt(1000, 9999);
            const code2 = crypto.randomInt(1000, 9999);
            codes.push(`${code1}-${code2}`);
        }
        return codes;
    }

    // Hash backup codes for secure storage
    hashBackupCodes(codes) {
        return codes.map(code => ({
            hash: crypto.createHash('sha256').update(code).digest('hex'),
            used: false,
            created_at: new Date().toISOString()
        }));
    }

    // Verify backup code
    verifyBackupCode(inputCode, hashedCodes) {
        try {
            // Clean the input code (remove spaces, convert to lowercase)
            const cleanInput = inputCode.toString().replace(/\s/g, '').toLowerCase();
            const hashedInput = crypto.createHash('sha256').update(cleanInput).digest('hex');

            // Find matching unused backup code
            const codeIndex = hashedCodes.findIndex(item => 
                item.hash === hashedInput && !item.used
            );

            if (codeIndex !== -1) {
                // Mark code as used
                hashedCodes[codeIndex].used = true;
                hashedCodes[codeIndex].used_at = new Date().toISOString();
                
                console.log('Backup code verification successful');
                return { success: true, codes: hashedCodes, message: 'Backup code verified' };
            } else {
                console.log('Backup code verification failed');
                return { success: false, message: 'Invalid or already used backup code' };
            }
        } catch (error) {
            console.error('Backup code verification error:', error.message);
            return { success: false, message: 'Backup code verification failed' };
        }
    }

    // Generate recovery codes for account recovery
    generateRecoveryCodes(count = 5) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate longer recovery codes (12 characters)
            const code = crypto.randomBytes(6).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }

    // Send MFA challenge (in production, this would integrate with SMS/Email service)
    async sendMFAChallenge(method, destination, challenge) {
        try {
            console.log(`Sending MFA challenge via ${method} to ${destination}`);
            
            // For demo purposes, we'll just log the challenge
            // In production, integrate with SMS/Email services
            if (method === 'sms') {
                console.log(`SMS Challenge: ${challenge}`);
                // Integrate with SMS service (Twilio, AWS SNS, etc.)
            } else if (method === 'email') {
                console.log(`Email Challenge: ${challenge}`);
                // Integrate with email service (SendGrid, AWS SES, etc.)
            }

            return { success: true, message: 'Challenge sent successfully' };
        } catch (error) {
            console.error('MFA challenge sending failed:', error.message);
            return { success: false, message: 'Failed to send challenge' };
        }
    }

    // Validate MFA setup during registration
    validateMFASetup(secret, userToken) {
        const verification = this.verifyTOTP(userToken, secret);
        
        if (verification.success) {
            console.log('MFA setup validation successful');
            return { 
                success: true, 
                message: 'MFA setup completed successfully',
                timestamp: new Date().toISOString()
            };
        } else {
            console.log('MFA setup validation failed');
            return { 
                success: false, 
                message: 'MFA setup validation failed. Please check your authenticator app.',
                timestamp: new Date().toISOString()
            };
        }
    }

    // Get current TOTP value (for testing purposes)
    getCurrentTOTP(secret) {
        try {
            const token = speakeasy.totp({
                secret: secret,
                encoding: 'base32',
                step: 30
            });
            
            return token;
        } catch (error) {
            console.error('Failed to generate current TOTP:', error.message);
            return null;
        }
    }

    // Check if MFA is required based on security policies
    isMFARequired(action, userRole, riskScore = 0) {
        const mfaRequiredActions = [
            'CONFIDENTIAL_WRITE',
            'CONFIDENTIAL_CREATE',
            'USER_MANAGEMENT',
            'ROLE_ASSIGNMENT',
            'SENSITIVE_DATA_ACCESS'
        ];

        const mfaRequiredRoles = ['ADMIN', 'MANAGER'];
        
        // High risk score always requires MFA
        if (riskScore >= 7) {
            return { required: true, reason: 'High risk activity detected' };
        }

        // Specific actions require MFA
        if (mfaRequiredActions.includes(action)) {
            return { required: true, reason: 'Action requires additional verification' };
        }

        // Certain roles require MFA for sensitive operations
        if (mfaRequiredRoles.includes(userRole) && action.includes('CONFIDENTIAL')) {
            return { required: true, reason: 'Role-based security policy' };
        }

        return { required: false, reason: 'Standard authentication sufficient' };
    }
}

module.exports = MFAService;
