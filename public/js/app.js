// SecureRUS Frontend Application
class SecureRUSApp {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.token = localStorage.getItem('authToken');
        this.user = null;
        this.init();
    }

    init() {
        console.log('ecureRUS Application Starting...');
        this.setupNavigation();
        this.setupEventListeners();
        
        // Check if user is logged in
        if (this.token) {
            this.verifyToken();
        }
    }

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.getAttribute('data-section');
                this.showSection(section);
                
                // Update active nav item
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Register form
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // MFA token input - auto-submit when 6 digits entered
        const mfaInput = document.getElementById('mfaToken');
        if (mfaInput) {
            mfaInput.addEventListener('input', (e) => {
                const token = e.target.value.replace(/\D/g, ''); // Remove non-digits
                e.target.value = token;
                
                if (token.length === 6) {
                    setTimeout(() => this.verifyMFA(), 500); // Small delay for UX
                }
            });
        }
    }

    showSection(sectionName) {
        console.log(`Navigating to: ${sectionName}`);
        
        // Hide all sections
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => section.classList.add('hidden'));
        
        // Show selected section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }

        // Load section-specific content
        this.loadSectionContent(sectionName);
    }

    async loadSectionContent(sectionName) {
        if (!this.user && ['dashboard', 'files', 'profile'].includes(sectionName)) {
            return; // User must be logged in
        }

        if (['admin', 'analytics'].includes(sectionName) && 
            (!this.user || !['ADMIN', 'MANAGER'].includes(this.user.role))) {
            return; // Insufficient permissions
        }

        switch (sectionName) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'files':
                await this.loadFiles();
                break;
            case 'admin':
                await this.loadAdmin();
                break;
            case 'analytics':
                await this.loadAnalytics();
                break;
            case 'profile':
                await this.loadProfile();
                break;
        }
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        console.log('Attempting login...');
        
        try {
            const response = await fetch(`${this.baseURL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.success) {
                if (data.requiresMFA) {
                    console.log('MFA required');
                    document.getElementById('mfa-section').classList.remove('hidden');
                    this.tempToken = data.tempToken;
                } else {
                    this.handleLoginSuccess(data);
                }
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Login failed. Please check your connection.');
        }
    }

    async verifyMFA() {
        const mfaToken = document.getElementById('mfaToken').value;
        
        if (mfaToken.length !== 6) {
            this.showError('Please enter a 6-digit MFA code');
            return;
        }

        console.log('Verifying MFA token...');

        try {
            const response = await fetch(`${this.baseURL}/auth/verify-mfa`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    tempToken: this.tempToken,
                    mfaToken: mfaToken 
                })
            });

            const data = await response.json();

            if (data.success) {
                this.handleLoginSuccess(data);
            } else {
                this.showError(data.message);
                // Clear the input for retry
                document.getElementById('mfaToken').value = '';
            }
        } catch (error) {
            console.error('MFA verification error:', error);
            this.showError('MFA verification failed. Please try again.');
        }
    }

    handleLoginSuccess(data) {
        console.log('Login successful');
        
        this.token = data.token;
        this.user = data.user;
        
        localStorage.setItem('authToken', this.token);
        
        // Hide MFA section and reset login form
        document.getElementById('mfa-section').classList.add('hidden');
        document.getElementById('loginForm').reset();
        document.getElementById('mfaToken').value = '';
        
        // Show success message with safe property access
        const firstName = this.user?.first_name || this.user?.firstName || 'User';
        this.showSuccess(`Welcome back, ${firstName}!`);
        
        // Navigate to dashboard
        setTimeout(() => {
            this.showSection('dashboard');
            document.querySelector('[data-section="dashboard"]').classList.add('active');
            document.querySelector('[data-section="login"]').classList.remove('active');
        }, 1500);
    }

    async handleRegister() {
        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const requestedRole = document.getElementById('requestedRole').value;

        console.log('Attempting registration...');

        try {
            const response = await fetch(`${this.baseURL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    password,
                    requestedRole
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('Registration successful! Please wait for admin approval.');
                document.getElementById('registerForm').reset();
                
                setTimeout(() => {
                    this.showSection('login');
                    document.querySelector('[data-section="login"]').classList.add('active');
                    document.querySelector('[data-section="register"]').classList.remove('active');
                }, 2000);
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('Registration failed. Please check your connection.');
        }
    }

    async verifyToken() {
        try {
            const response = await fetch(`${this.baseURL}/auth/verify-token`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                console.log(`Token valid - logged in as ${this.user.email}`);
            } else {
                console.log('Token invalid or expired, logging out');
                this.logout();
            }
        } catch (error) {
            console.error('Token verification failed:', error.message);
            this.logout();
        }
    }

    async loadDashboard() {
        const content = document.getElementById('dashboard-content');
        
        content.innerHTML = `
            <div class="welcome-user">
                <h3>Welcome, ${this.user.first_name} ${this.user.last_name}! 👋</h3>
                <p>Role: <strong>${this.user.role}</strong> | Status: <strong>${this.user.status}</strong></p>
            </div>
            
            <div class="dashboard-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0;">
                <div class="stat-card" style="background: #e3f2fd; padding: 1.5rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 2rem; color: #1976d2; margin-bottom: 0.5rem;"></div>
                    <h4 style="color: #1565c0;">Dashboard</h4>
                    <p style="color: #1976d2;">Overview & Stats</p>
                </div>
                
                <div class="stat-card" style="background: #e8f5e8; padding: 1.5rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 2rem; color: #388e3c; margin-bottom: 0.5rem;"></div>
                    <h4 style="color: #2e7d32;">Security</h4>
                    <p style="color: #388e3c;">MFA Enabled</p>
                </div>
                
                <div class="stat-card" style="background: #fff3e0; padding: 1.5rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 2rem; color: #f57c00; margin-bottom: 0.5rem;"></div>
                    <h4 style="color: #ef6c00;">Files</h4>
                    <p style="color: #f57c00;">Access Controlled</p>
                </div>
            </div>
            
            <div style="margin-top: 2rem;">
                <h4>Quick Actions</h4>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem;">
                    <button class="btn" onclick="app.showSection('files')">Manage Files</button>
                    <button class="btn" onclick="app.showSection('profile')">View Profile</button>
                    <button class="btn" onclick="app.logout()">Logout</button>
                </div>
            </div>
        `;
    }

    async loadFiles() {
        const content = document.getElementById('files-content');
        
        content.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3>Your Files</h3>
                    <button class="btn" onclick="app.showUploadForm()">📤 Upload File</button>
                </div>
                
                <div id="file-upload-form" class="hidden" style="background: #f8f9fa; padding: 2rem; border-radius: 10px; margin-bottom: 2rem;">
                    <h4>Upload New File</h4>
                    <form id="uploadForm">
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem;">File Category</label>
                            <select id="fileCategory" required style="width: 100%; padding: 0.8rem; border: 2px solid #e9ecef; border-radius: 5px;">
                                <option value="">Select category...</option>
                                <option value="IMAGES">Images</option>
                                <option value="DOCUMENTS">Documents</option>
                                <option value="CONFIDENTIAL">Confidential</option>
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem;">Select File</label>
                            <input type="file" id="fileInput" required style="width: 100%; padding: 0.8rem; border: 2px solid #e9ecef; border-radius: 5px;">
                        </div>
                        
                        <button type="submit" class="btn">Upload File</button>
                        <button type="button" class="btn" onclick="app.hideUploadForm()" style="background: #6c757d; margin-left: 1rem;">Cancel</button>
                    </form>
                </div>
                
                <div id="files-list">
                    <p style="text-align: center; color: #666; margin: 2rem 0;">Loading your files...</p>
                </div>
            </div>
        `;

        // Load user's files
        await this.loadUserFiles();
        
        // Setup upload form
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) {
            uploadForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFileUpload();
            });
        }
    }

    async loadUserFiles() {
        try {
            const response = await fetch(`${this.baseURL}/files/list`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();
            const filesList = document.getElementById('files-list');

            if (data.success && data.files.length > 0) {
                filesList.innerHTML = data.files.map(file => `
                    <div style="background: white; border: 2px solid #e9ecef; border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: between; align-items: center;">
                            <div style="flex: 1;">
                                <h5 style="margin-bottom: 0.5rem;">${file.filename}</h5>
                                <p style="color: #666; margin: 0; font-size: 0.9rem;">
                                    Category: <strong>${file.category}</strong> | 
                                    Size: ${file.size} bytes |
                                    Uploaded: ${new Date(file.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem;" 
                                        onclick="app.downloadFile('${file.id}', '${file.filename}')">
                                    Download
                                </button>
                                <button class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: #dc3545;" 
                                        onclick="app.deleteFile('${file.id}', '${file.filename}')">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                filesList.innerHTML = '<p style="text-align: center; color: #666;">No files uploaded yet.</p>';
            }
        } catch (error) {
            console.error('Error loading files:', error);
            document.getElementById('files-list').innerHTML = '<p style="text-align: center; color: #dc3545;">Error loading files.</p>';
        }
    }

    showUploadForm() {
        document.getElementById('file-upload-form').classList.remove('hidden');
    }

    hideUploadForm() {
        document.getElementById('file-upload-form').classList.add('hidden');
    }

    async handleFileUpload() {
        const fileInput = document.getElementById('fileInput');
        const category = document.getElementById('fileCategory').value;
        const file = fileInput.files[0];

        if (!file || !category) {
            this.showError('Please select a file and category');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);

        try {
            const response = await fetch(`${this.baseURL}/files/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('File uploaded successfully!');
                this.hideUploadForm();
                document.getElementById('uploadForm').reset();
                await this.loadUserFiles(); // Refresh file list
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showError('File upload failed');
        }
    }

    async downloadFile(fileId, filename) {
        try {
            const response = await fetch(`${this.baseURL}/files/${fileId}/download`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                this.showError('Failed to download file');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed');
        }
    }

    async deleteFile(fileId, filename) {
        if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/files/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('File deleted successfully');
                await this.loadUserFiles(); // Refresh file list
            } else {
                this.showError(data.message);
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showError('Failed to delete file');
        }
    }

    async loadProfile() {
        const content = document.getElementById('profile-content');
        
        content.innerHTML = `
            <div style="max-width: 500px;">
                <div style="background: white; border-radius: 15px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 1.5rem; color: #333;">Profile Information</h3>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Full Name</label>
                        <p style="color: #666; margin: 0.5rem 0;">${this.user.first_name} ${this.user.last_name}</p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Email Address</label>
                        <p style="color: #666; margin: 0.5rem 0;">${this.user.email}</p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Role</label>
                        <p style="color: #666; margin: 0.5rem 0;"><strong>${this.user.role}</strong></p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Account Status</label>
                        <p style="color: #666; margin: 0.5rem 0;"><strong>${this.user.status}</strong></p>
                    </div>
                    
                    <div style="margin-bottom: 2rem;">
                        <label style="font-weight: 500; color: #333;">Member Since</label>
                        <p style="color: #666; margin: 0.5rem 0;">${new Date(this.user.created_at).toLocaleDateString()}</p>
                    </div>
                    
                    <button class="btn" onclick="app.logout()">Logout</button>
                </div>
                
                <div style="background: #e3f2fd; border-radius: 15px; padding: 2rem; border-left: 4px solid #2196f3;">
                    <h4 style="color: #1976d2; margin-bottom: 1rem;">Security Status</h4>
                    <p style="color: #1565c0; margin-bottom: 1rem;">
                        Multi-Factor Authentication: <strong>Enabled</strong><br>
                        Password Security: <strong>Strong</strong><br>
                        Account Verification: <strong>Verified</strong>
                    </p>
                </div>
            </div>
        `;
    }

    async loadAdmin() {
        if (!['ADMIN', 'MANAGER'].includes(this.user?.role)) {
            document.getElementById('admin-content').innerHTML = '<p style="text-align: center; color: #dc3545;">Access denied. Administrator privileges required.</p>';
            return;
        }

        const content = document.getElementById('admin-content');
        content.innerHTML = '<p style="text-align: center; color: #666;">Loading administration panel...</p>';

        // This would load the admin interface - placeholder for now
        content.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h3>System Administration</h3>
                <p>Administrative functions will be implemented here.</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 2rem 0;">
                    <div style="background: #e3f2fd; padding: 1.5rem; border-radius: 10px; text-align: center;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;"></div>
                        <h4>User Management</h4>
                        <p>Manage user accounts</p>
                    </div>
                    
                    <div style="background: #e8f5e8; padding: 1.5rem; border-radius: 10px; text-align: center;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;"></div>
                        <h4>Audit Logs</h4>
                        <p>Review system activity</p>
                    </div>
                    
                    <div style="background: #fff3e0; padding: 1.5rem; border-radius: 10px; text-align: center;">
                        <div style="font-size: 2rem; margin-bottom: 1rem;"></div>
                        <h4>System Settings</h4>
                        <p>Configure system parameters</p>
                    </div>
                </div>
            </div>
        `;
    }

    async loadAnalytics() {
        if (!['ADMIN', 'MANAGER'].includes(this.user?.role)) {
            document.getElementById('analytics-content').innerHTML = '<p style="text-align: center; color: #dc3545;">Access denied. Manager or Administrator privileges required.</p>';
            return;
        }

        const content = document.getElementById('analytics-content');
        content.innerHTML = '<p style="text-align: center; color: #666;">Loading analytics dashboard...</p>';

        // This would load the analytics interface - placeholder for now
        content.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h3>Security Analytics</h3>
                <p>Real-time monitoring and analytics dashboard.</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin: 2rem 0;">
                    <div style="background: #e3f2fd; padding: 1.5rem; border-radius: 10px;">
                        <h4 style="color: #1976d2;">Anomaly Detection</h4>
                        <p style="color: #1565c0;">Real-time threat monitoring</p>
                    </div>
                    
                    <div style="background: #e8f5e8; padding: 1.5rem; border-radius: 10px;">
                        <h4 style="color: #388e3c;">Activity Metrics</h4>
                        <p style="color: #2e7d32;">User activity analysis</p>
                    </div>
                    
                    <div style="background: #fff3e0; padding: 1.5rem; border-radius: 10px;">
                        <h4 style="color: #f57c00;">Security Events</h4>
                        <p style="color: #ef6c00;">Security incident tracking</p>
                    </div>
                </div>
            </div>
        `;
    }

    async logout() {
        console.log('👋 Logging out...');
        
        try {
            await fetch(`${this.baseURL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
        } catch (error) {
            // Ignore logout errors - we'll clear local data anyway
            console.log('Logout endpoint unavailable (expected during development)');
        }

        // Clear local data
        localStorage.removeItem('authToken');
        this.token = null;
        this.user = null;
        
        // Redirect to home
        this.showSection('home');
        document.querySelector('[data-section="home"]').classList.add('active');
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-section') !== 'home') {
                item.classList.remove('active');
            }
        });
        
        this.showSuccess('Logged out successfully');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type) {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'error' ? '#dc3545' : '#28a745'};
                color: white;
                padding: 1rem 2rem;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                z-index: 1000;
                animation: slideIn 0.3s ease;
            ">
                ${message}
            </div>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification) {
                notification.remove();
            }
        }, 5000);
    }
}

// Global functions for HTML onclick handlers
window.showSection = (section) => {
    if (window.app) {
        window.app.showSection(section);
    }
};

window.verifyMFA = () => {
    if (window.app) {
        window.app.verifyMFA();
    }
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SecureRUSApp();
    console.log('SecureRUS Application Initialized');
});

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);
