// SecureRUS Frontend Application
class SecureRUSApp {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.token = localStorage.getItem('authToken');
        this.user = null;
        this.currentFileCategory = 'DOCUMENTS';
        this.currentFileId = null;
        this.currentFileName = null;
        this.init();
    }

    init() {
        console.log('SecureRUS Application Starting...');
        this.setupNavigation();
        this.setupEventListeners();
        
        // Ensure modal is hidden on page load
        this.closeFileModal();
        
        // Update navbar visibility based on current auth state
        this.updateNavbarVisibility();
        
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

        // File management event listeners
        this.setupFileEventListeners();

        // Admin event listeners
        this.setupAdminEventListeners();
    }

    setupFileEventListeners() {
        // File category tabs
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                this.switchFileCategory(e.target.dataset.category);
            }
        });

        // File input change
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById('selectedFileName').textContent = file.name;
                } else {
                    document.getElementById('selectedFileName').textContent = '';
                }
            });
        }

        // Upload button
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.handleFileUpload());
        }

        // Cancel upload button
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        if (cancelUploadBtn) {
            cancelUploadBtn.addEventListener('click', () => this.cancelFileUpload());
        }

        // Refresh files button
        const refreshFilesBtn = document.getElementById('refreshFilesBtn');
        if (refreshFilesBtn) {
            refreshFilesBtn.addEventListener('click', () => this.loadFiles());
        }

        // File view modal close
        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeFileModal());
        }

        // Download and delete buttons in modal
        const downloadFileBtn = document.getElementById('downloadFileBtn');
        const deleteFileBtn = document.getElementById('deleteFileBtn');
        const editFileBtn = document.getElementById('editFileBtn');
        const saveFileBtn = document.getElementById('saveFileBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        
        if (downloadFileBtn) {
            downloadFileBtn.addEventListener('click', () => {
                if (this.currentFileId && this.currentFileName) {
                    this.downloadFile(this.currentFileId, this.currentFileName);
                }
            });
        }

        if (deleteFileBtn) {
            deleteFileBtn.addEventListener('click', () => {
                if (this.currentFileId && this.currentFileName) {
                    this.deleteFile(this.currentFileId, this.currentFileName);
                }
            });
        }

        if (editFileBtn) {
            editFileBtn.addEventListener('click', () => {
                this.enterEditMode();
            });
        }

        if (saveFileBtn) {
            saveFileBtn.addEventListener('click', () => {
                this.saveFileContent();
            });
        }

        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                this.exitEditMode();
            });
        }

        // Modal background click to close
        const fileViewModal = document.getElementById('fileViewModal');
        if (fileViewModal) {
            fileViewModal.addEventListener('click', (e) => {
                if (e.target === fileViewModal) {
                    this.closeFileModal();
                }
            });
        }
    }

    setupAdminEventListeners() {
        // Admin tab switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('admin-tab-btn')) {
                this.switchAdminTab(e.target.dataset.tab);
            }
        });

        // Admin refresh buttons
        const refreshUsersBtn = document.getElementById('refreshUsersBtn');
        const refreshPendingBtn = document.getElementById('refreshPendingBtn');
        const refreshAuditBtn = document.getElementById('refreshAuditBtn');

        if (refreshUsersBtn) {
            refreshUsersBtn.addEventListener('click', () => this.loadAllUsers());
        }

        if (refreshPendingBtn) {
            refreshPendingBtn.addEventListener('click', () => this.loadPendingUsers());
        }

        if (refreshAuditBtn) {
            refreshAuditBtn.addEventListener('click', () => this.loadAuditLogs());
        }

        // Role modal events
        const closeRoleModalBtn = document.getElementById('closeRoleModalBtn');
        const cancelRoleBtn = document.getElementById('cancelRoleBtn');
        const assignRoleBtn = document.getElementById('assignRoleBtn');

        if (closeRoleModalBtn) {
            closeRoleModalBtn.addEventListener('click', () => this.closeRoleModal());
        }

        if (cancelRoleBtn) {
            cancelRoleBtn.addEventListener('click', () => this.closeRoleModal());
        }

        if (assignRoleBtn) {
            assignRoleBtn.addEventListener('click', () => this.assignRole());
        }

        // Audit filter
        const auditFilter = document.getElementById('auditFilter');
        if (auditFilter) {
            auditFilter.addEventListener('change', () => this.loadAuditLogs());
        }
    }

    showSection(sectionName) {
        console.log(`Navigating to: ${sectionName}`);
        
        // Get all sections
        const sections = document.querySelectorAll('.section');
        const targetSection = document.getElementById(`${sectionName}-section`);
        
        // If target section doesn't exist, return
        if (!targetSection) {
            console.warn(`Section ${sectionName}-section not found`);
            return;
        }
        
        // Add transitioning class to currently visible sections
        sections.forEach(section => {
            if (!section.classList.contains('hidden')) {
                section.classList.add('transitioning');
            }
        });
        
        // After transition duration, hide all sections and show target
        setTimeout(() => {
            sections.forEach(section => {
                section.classList.add('hidden');
                section.classList.remove('transitioning');
            });
            
            // Show target section
            targetSection.classList.remove('hidden');
            targetSection.classList.add('transitioning');
            
            // Force reflow then remove transitioning to fade in
            requestAnimationFrame(() => {
                targetSection.classList.remove('transitioning');
            });
            
        }, 300);

        // Update navbar active state
        this.updateNavbarActiveState(sectionName);

        // Load section-specific content
        this.loadSectionContent(sectionName);
    }

    updateNavbarVisibility() {
        const loginNav = document.getElementById('login-nav');
        const registerNav = document.getElementById('register-nav');
        
        if (this.user && this.token) {
            // User is logged in - hide both login and register
            loginNav.style.display = 'none';
            registerNav.style.display = 'none';
            console.log('User logged in - hiding login and register tabs');
        } else {
            // User is not logged in - show login, hide register by default
            loginNav.style.display = 'block';
            registerNav.style.display = 'block';
            console.log('User not logged in - showing login and register tabs');
        }
    }

    hideRegisterTab() {
        const registerNav = document.getElementById('register-nav');
        registerNav.style.display = 'none';
        console.log('Registration completed - hiding register tab');
    }

    updateNavbarActiveState(sectionName) {
        // Remove active class from all nav items
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(nav => nav.classList.remove('active'));
        
        // Add active class to the correct nav item
        const targetNavItem = document.querySelector(`[data-section="${sectionName}"]`);
        if (targetNavItem) {
            targetNavItem.classList.add('active');
            console.log(`Updated navbar active state to: ${sectionName}`);
        } else {
            // For sections that don't have direct nav items, don't show any as active
            console.log(`No navbar item found for section: ${sectionName}`);
        }
    }

    async loadSectionContent(sectionName) {
        console.log(`loadSectionContent called for: ${sectionName}`);
        console.log('User object at loadSectionContent:', this.user);
        
        if (!this.user && ['dashboard', 'files', 'profile'].includes(sectionName)) {
            console.log('User not logged in, skipping section load');
            return; // User must be logged in
        }

        if (['admin', 'analytics'].includes(sectionName)) {
            console.log('Checking admin/analytics permissions...');
            console.log('User role:', this.user?.role);
            console.log('Has permission:', this.user && ['ADMIN', 'MANAGER'].includes(this.user.role));
            
            if (!this.user || !['ADMIN', 'MANAGER'].includes(this.user.role)) {
                console.log('Insufficient permissions for admin/analytics');
                // Don't return early here - let the individual functions handle the permission check
                // This allows for better error messages and retry logic
            }
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
        const mfaCode = document.getElementById('mfaToken').value;
        
        if (mfaCode.length !== 6) {
            this.showError('Please enter a 6-digit MFA code');
            return;
        }

        console.log('Verifying MFA code...');

        try {
            const response = await fetch(`${this.baseURL}/auth/verify-mfa`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    tempToken: this.tempToken,
                    mfaCode: mfaCode 
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
        
        // Set appropriate default file category based on user role
        if (this.user?.role === 'GUEST') {
            this.currentFileCategory = 'IMAGES';
        }
        
        localStorage.setItem('authToken', this.token);
        
        // Hide MFA section and reset login form
        document.getElementById('mfa-section').classList.add('hidden');
        document.getElementById('loginForm').reset();
        document.getElementById('mfaToken').value = '';
        
        // Show success message with safe property access
        const firstName = this.getUserFirstName();
        this.showSuccess(`Welcome back, ${firstName}!`);
        
        // Update navbar visibility - hide login/register tabs
        this.updateNavbarVisibility();
        
        // Navigate to dashboard
        setTimeout(() => {
            this.showSection('dashboard');
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
                
                // Hide register tab since user has successfully registered
                this.hideRegisterTab();
                
                setTimeout(() => {
                    this.showSection('login');
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
                console.log('User data received:', this.user); // Debug log
                console.log(`Token valid - logged in as ${this.user.email}`);
                
                // Update navbar visibility for logged in user
                this.updateNavbarVisibility();
            } else {
                console.log('Token invalid or expired, logging out');
                this.logout();
            }
        } catch (error) {
            console.error('Token verification failed:', error.message);
            this.logout();
        }
    }

    // Helper function to safely get user name
    getUserDisplayName() {
        if (!this.user) return 'User';
        
        const firstName = (this.user.first_name || this.user.firstName || '').trim();
        const lastName = (this.user.last_name || this.user.lastName || '').trim();
        
        // If we have at least a first name or last name, use them
        if (firstName || lastName) {
            return `${firstName} ${lastName}`.trim();
        }
        
        // Otherwise use email or fallback
        return this.user.email || 'User';
    }

    // Helper function to get first name only
    getUserFirstName() {
        if (!this.user) return 'User';
        
        const firstName = (this.user.first_name || this.user.firstName || '').trim();
        
        // If we have a first name, use it
        if (firstName) {
            return firstName;
        }
        
        // Otherwise use email or fallback
        return this.user.email || 'User';
    }

    async loadDashboard() {
        const content = document.getElementById('dashboard-content');
        
        // Get user display names safely
        const displayName = this.getUserDisplayName();
        const firstName = this.getUserFirstName();
        
        content.innerHTML = `
            <div class="welcome-user" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 15px; margin-bottom: 2rem; text-align: center;">
                <h2 style="margin: 0 0 1rem 0; font-size: 2rem;">Welcome back, ${displayName}!</h2>
                <div style="display: flex; justify-content: center; align-items: center; gap: 2rem; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>Role: <strong>${this.user?.role || 'Unknown'}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>Security: <strong>${this.user?.mfa_enabled ? 'MFA Enabled' : 'Basic'}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>Today: <strong>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                    </div>
                </div>
            </div>
            
            <div class="dashboard-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
                <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3); transition: transform 0.3s ease;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem;">Dashboard</h3>
                    <p style="margin: 0; opacity: 0.9;">Overview & Analytics</p>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2);">
                        <small style="opacity: 0.8;">Real-time Monitoring</small>
                    </div>
                </div>
                
                <div class="stat-card" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 2rem; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(17, 153, 142, 0.3); transition: transform 0.3s ease;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔐</div>
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem;">Security</h3>
                    <p style="margin: 0; opacity: 0.9;">${this.user?.mfa_enabled ? 'Multi-Factor Enabled' : 'Basic Protection'}</p>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.2);">
                        <small style="opacity: 0.8;">${this.user?.mfa_enabled ? 'Advanced Security' : 'Consider Enabling MFA'}</small>
                    </div>
                </div>
                
                <div class="stat-card" style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); color: #333; padding: 2rem; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(255, 154, 158, 0.3); transition: transform 0.3s ease;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
                    <h3 style="margin: 0 0 0.5rem 0; font-size: 1.3rem;">File Management</h3>
                    <p style="margin: 0; opacity: 0.8;">Secure File Storage</p>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.1);">
                        <small style="opacity: 0.7;">Documents, Images & Confidential</small>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                <div style="background: white; border-radius: 15px; padding: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 1.5rem 0; color: #333; display: flex; align-items: center; gap: 0.5rem;">
                        Quick Actions
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <button class="btn" onclick="app.showSection('files')" style="padding: 1rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center;">
                            Manage Files
                        </button>
                        <button class="btn" onclick="app.showSection('profile')" style="padding: 1rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; background: #28a745;">
                            View Profile
                        </button>
                        ${this.user?.role === 'ADMIN' || this.user?.role === 'MANAGER' ? `
                        <button class="btn" onclick="app.showSection('admin')" style="padding: 1rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; background: #dc3545;">
                            Administration
                        </button>
                        <button class="btn" onclick="app.showSection('analytics')" style="padding: 1rem; display: flex; align-items: center; gap: 0.5rem; justify-content: center; background: #17a2b8;">
                            Analytics
                        </button>
                        ` : ''}
                    </div>
                </div>
                
                <div style="background: white; border-radius: 15px; padding: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 1.5rem 0; color: #333; display: flex; align-items: center; gap: 0.5rem;">
                        System Info
                    </h3>
                    <div style="space-y: 1rem;">
                        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e9ecef;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #666;">Status</span>
                                <span style="color: #28a745; font-weight: bold;">🟢 Online</span>
                            </div>
                        </div>
                        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #e9ecef;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #666;">Last Login</span>
                                <span style="color: #333; font-weight: bold;">${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: #666;">Session</span>
                                <span style="color: #28a745; font-weight: bold;">Secure</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); border-radius: 15px; padding: 2rem; text-align: center; border-left: 4px solid #ff6b6b;">
                <h3 style="color: #d63031; margin: 0 0 1rem 0; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    Security Reminder
                </h3>
                <p style="color: #2d3436; margin: 0; font-size: 1rem; line-height: 1.5;">
                    ${this.user?.mfa_enabled ? 
                        'Your account is secured with Multi-Factor Authentication. Keep your authenticator app accessible for confidential file operations.' :
                        'Consider enabling Multi-Factor Authentication in your profile for enhanced security when accessing confidential files.'
                    }
                </p>
                ${!this.user?.mfa_enabled ? `
                <button class="btn" onclick="app.showSection('profile')" style="margin-top: 1rem; background: #e17055; color: white;">
                    Enable MFA Now
                </button>
                ` : ''}
            </div>
        `;
    }

    async loadFiles() {
        // Set appropriate default category for GUEST users
        if (this.user?.role === 'GUEST' && this.currentFileCategory !== 'IMAGES') {
            this.currentFileCategory = 'IMAGES';
        }
        
        console.log(`Loading ${this.currentFileCategory} files...`);
        
        // Update UI to show current category and hide/show tabs based on role
        this.updateFileTabsUI();
        this.updateFileInputAccept();
        this.updateFileTabsVisibility();
        
        try {
            const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    action: 'list',
                    category: this.currentFileCategory.toUpperCase()
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to load files: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                this.displayFiles(data.files);
            } else {
                throw new Error(data.message);
            }

        } catch (error) {
            console.error('Error loading files:', error);
            document.getElementById('filesList').innerHTML = 
                `<p style="text-align: center; color: #dc3545;">Error loading files: ${error.message}</p>`;
        }
    }

    updateFileTabsUI() {
        // Update active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#f8f9fa';
            btn.style.color = '#495057';
        });
        
        const activeTab = document.querySelector(`[data-category="${this.currentFileCategory}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            activeTab.style.color = 'white';
        }

        // Update title
        const titleMap = {
            'DOCUMENTS': 'Documents',
            'IMAGES': 'Images', 
            'CONFIDENTIAL': 'Confidential Files'
        };
        document.getElementById('filesTitle').textContent = titleMap[this.currentFileCategory];
    }

    updateFileInputAccept() {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput) return;

        // Set appropriate file type restrictions
        const acceptMap = {
            'DOCUMENTS': '.pdf,.doc,.docx,.txt',
            'IMAGES': '.jpg,.jpeg,.png,.gif,.webp',
            'CONFIDENTIAL': '.txt,.pdf'
        };
        
        fileInput.accept = acceptMap[this.currentFileCategory];
    }

    updateFileTabsVisibility() {
        // Define which roles can access which file categories
        const rolePermissions = {
            'ADMIN': ['DOCUMENTS', 'IMAGES', 'CONFIDENTIAL'],
            'MANAGER': ['DOCUMENTS', 'IMAGES', 'CONFIDENTIAL'], 
            'USER': ['DOCUMENTS', 'IMAGES', 'CONFIDENTIAL'],
            'GUEST': ['IMAGES']
        };

        const userRole = this.user?.role || 'GUEST';
        const allowedCategories = rolePermissions[userRole] || ['IMAGES'];

        // Show/hide tabs based on role permissions
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const category = btn.dataset.category;
            if (allowedCategories.includes(category)) {
                btn.style.display = 'inline-block';
            } else {
                btn.style.display = 'none';
            }
        });

        // Hide upload form and button if user doesn't have create permission for current category
        const uploadForm = document.getElementById('file-upload-form');
        const showUploadBtn = document.querySelector('.show-upload-btn');
        
        const hasCreatePermission = this.hasPermission('create', this.currentFileCategory);
        console.log(`Upload visibility check: User=${this.user?.role}, Category=${this.currentFileCategory}, HasCreatePermission=${hasCreatePermission}`);
        
        if (!hasCreatePermission) {
            console.log('Hiding upload form - no create permission');
            if (uploadForm) {
                uploadForm.style.display = 'none';
                uploadForm.classList.add('hidden');
            }
            if (showUploadBtn) {
                showUploadBtn.style.display = 'none';
                showUploadBtn.classList.add('hidden');
            }
        } else {
            console.log('Showing upload form - has create permission');
            if (uploadForm) {
                uploadForm.style.display = 'block';
                uploadForm.classList.remove('hidden');
            }
            if (showUploadBtn) {
                showUploadBtn.style.display = 'block';
                showUploadBtn.classList.remove('hidden');
            }
        }
    }

    // Check user permissions for specific operations on file categories
    hasPermission(action, category) {
        const userRole = this.user?.role || 'GUEST';
        
        // Define detailed permissions for each role and category
        const permissions = {
            'ADMIN': {
                'DOCUMENTS': { create: true, read: true, write: false, delete: true },
                'IMAGES': { create: true, read: true, write: false, delete: true },
                'CONFIDENTIAL': { create: true, read: true, write: true, delete: true }
            },
            'MANAGER': {
                'DOCUMENTS': { create: true, read: true, write: false, delete: true },
                'IMAGES': { create: true, read: true, write: false, delete: true },
                'CONFIDENTIAL': { create: true, read: true, write: true, delete: false }
            },
            'USER': {
                'DOCUMENTS': { create: true, read: true, write: false, delete: false },
                'IMAGES': { create: true, read: true, write: false, delete: false },
                'CONFIDENTIAL': { create: false, read: true, write: false, delete: false }
            },
            'GUEST': {
                'DOCUMENTS': { create: false, read: false, write: false, delete: false },
                'IMAGES': { create: false, read: true, write: false, delete: false },
                'CONFIDENTIAL': { create: false, read: false, write: false, delete: false }
            }
        };

        const rolePerms = permissions[userRole];
        if (!rolePerms || !rolePerms[category]) {
            return false;
        }

        return rolePerms[category][action] === true;
    }

    displayFiles(files) {
        const filesList = document.getElementById('filesList');
        
        if (files && files.length > 0) {
            filesList.innerHTML = files.map(file => `
                <div class="file-card" style="background: white; border-radius: 15px; padding: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid #e9ecef;">
                    <div class="file-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div class="file-info">
                            <h4 style="color: #333; margin: 0 0 0.5rem 0; font-size: 1.1rem;">${this.escapeHtml(file.filename)}</h4>
                            <p style="color: #666; margin: 0; font-size: 0.9rem;">
                                ${this.formatFileSize(file.size)} • ${this.formatDate(file.uploadedAt)}
                            </p>
                            <p style="color: #666; margin: 0.25rem 0 0 0; font-size: 0.8rem;">
                                Uploaded by: ${this.escapeHtml(file.uploadedBy)}
                            </p>
                        </div>
                    </div>
                    <div class="file-actions" style="display: flex; gap: 0.5rem;">
                        ${this.hasPermission('read', this.currentFileCategory) ? `
                        <button onclick="app.viewFile(${file.id}, '${this.escapeHtml(file.filename)}')" 
                                class="btn" style="background: #007bff; padding: 0.5rem 1rem; font-size: 0.9rem;">
                            ${this.currentFileCategory === 'CONFIDENTIAL' ? 'View' : 'Download'}
                        </button>
                        ` : ''}
                        ${this.hasPermission('delete', this.currentFileCategory) ? `
                        <button onclick="app.deleteFile(${file.id}, '${this.escapeHtml(file.filename)}')" 
                                class="btn" style="background: #dc3545; padding: 0.5rem 1rem; font-size: 0.9rem;">
                            Delete
                        </button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            const uploadMessage = this.hasPermission('create', this.currentFileCategory)
                ? `<p style="font-size: 0.9rem;">Use the upload form above to add your first file.</p>`
                : `<p style="font-size: 0.9rem;">Contact an administrator to upload files.</p>`;
                
            filesList.innerHTML = `
                <div style="text-align: center; color: #666; margin: 3rem 0;">
                    <p>No ${this.currentFileCategory.toLowerCase()} files uploaded yet.</p>
                    ${uploadMessage}
                </div>
            `;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    switchFileCategory(category) {
        this.currentFileCategory = category;
        this.loadFiles();
        this.clearFileSelection();
        this.updateFileTabsVisibility(); // Update upload form visibility based on new category permissions
    }

    clearFileSelection() {
        const fileInput = document.getElementById('fileInput');
        const selectedFileName = document.getElementById('selectedFileName');
        
        if (fileInput) fileInput.value = '';
        if (selectedFileName) selectedFileName.textContent = '';
    }

    showUploadForm() {
        document.getElementById('file-upload-form').classList.remove('hidden');
    }

    hideUploadForm() {
        document.getElementById('file-upload-form').classList.add('hidden');
    }

    async handleFileUpload() {
        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];

        if (!file) {
            this.showError('Please select a file to upload');
            return;
        }

        // Check if user has create permission for current file category
        if (!this.hasPermission('create', this.currentFileCategory)) {
            this.showError(`You don't have permission to upload ${this.currentFileCategory.toLowerCase()} files. Contact an administrator.`);
            return;
        }

        let mfaCode = null;

        // Check if this is a confidential file operation and user has MFA enabled
        if (this.currentFileCategory === 'CONFIDENTIAL' && this.user?.mfa_enabled) {
            mfaCode = await this.promptMFAForOperation('upload this confidential file');
            if (!mfaCode) {
                return; // User cancelled or failed MFA
            }
        }

        // Show upload progress
        this.showUploadProgress();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', this.currentFileCategory);
        formData.append('action', 'create');
        
        // Add MFA code if we have one
        if (mfaCode) {
            formData.append('mfaCode', mfaCode);
        }

        try {
            console.log(`Uploading ${file.name} to ${this.currentFileCategory} category...`);

            const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`File uploaded successfully! ${data.encrypted ? '(Encrypted)' : ''}`);
                this.clearFileSelection();
                this.hideUploadProgress();
                await this.loadFiles(); // Refresh file list
            } else {
                this.showError(data.message || 'Upload failed');
                this.hideUploadProgress();
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showError('File upload failed. Please try again.');
            this.hideUploadProgress();
        }
    }

    showUploadProgress() {
        const progressDiv = document.getElementById('uploadProgress');
        const statusText = document.getElementById('uploadStatus');
        const progressBar = document.getElementById('progressBar');
        
        if (progressDiv) {
            progressDiv.classList.remove('hidden');
            statusText.textContent = 'Uploading file...';
            progressBar.style.width = '50%';
        }
    }

    hideUploadProgress() {
        const progressDiv = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('progressBar');
        
        if (progressDiv) {
            progressDiv.classList.add('hidden');
            progressBar.style.width = '0%';
        }
    }

    cancelFileUpload() {
        this.clearFileSelection();
        this.hideUploadProgress();
        this.showSuccess('Upload cancelled');
    }

    async viewFile(fileId, filename) {
        this.currentFileId = fileId;
        this.currentFileName = filename;

        try {
            console.log(`Viewing file: ${filename} (ID: ${fileId})`);

            if (this.currentFileCategory === 'CONFIDENTIAL') {
                // For confidential files, require MFA first
                if (this.user.mfa_enabled) {
                    const mfaCode = await this.promptMFAForOperation('view this confidential file');
                    if (!mfaCode) {
                        return; // User cancelled MFA prompt
                    }

                    // Make API call with MFA code
                    const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            action: 'read',
                            category: this.currentFileCategory.toUpperCase(),
                            fileId: fileId,
                            mfaCode: mfaCode
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.content) {
                            // Show content in modal for confidential files
                            this.showFileModal(filename, data.content);
                        } else {
                            this.showError('Failed to retrieve file content');
                        }
                    } else {
                        const errorData = await response.json();
                        this.showError(errorData.message || 'Failed to access file');
                    }
                } else {
                    // No MFA enabled, make direct call
                    const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            action: 'read',
                            category: this.currentFileCategory.toUpperCase(),
                            fileId: fileId
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.content) {
                            this.showFileModal(filename, data.content);
                        } else {
                            this.showError('Failed to retrieve file content');
                        }
                    } else {
                        const errorData = await response.json();
                        this.showError(errorData.message || 'Failed to access file');
                    }
                }
            } else {
                // For images and documents, directly download the file
                this.downloadFile(fileId, filename);
            }
        } catch (error) {
            console.error('View file error:', error);
            this.showError('Failed to view file');
        }
    }

    async downloadFile(fileId, filename) {
        try {
            console.log(`Downloading file: ${filename} (ID: ${fileId})`);

            // Prevent downloading confidential files
            if (this.currentFileCategory === 'CONFIDENTIAL') {
                this.showError('Download is not allowed for confidential files. Use the View feature instead.');
                return;
            }

            // For images and documents, use direct download request
            const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    action: 'read',
                    category: this.currentFileCategory.toUpperCase(),
                    fileId: fileId
                })
            });

            if (response.ok) {
                // For non-confidential files, the server sends the file directly
                const blob = await response.blob();
                this.triggerDownload(blob, filename);
            } else {
                this.showError('Failed to download file');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Download failed');
        }
    }

    triggerDownload(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        this.showSuccess(`Downloaded: ${filename}`);
    }

    async deleteFile(fileId, filename) {
        // Check if user has delete permission for current file category
        if (!this.hasPermission('delete', this.currentFileCategory)) {
            this.showError(`You don't have permission to delete ${this.currentFileCategory.toLowerCase()} files. Contact an administrator.`);
            return;
        }

        if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
            return;
        }

        let mfaCode = null;

        // Check if this is a confidential file operation and user has MFA enabled
        if (this.currentFileCategory === 'CONFIDENTIAL' && this.user?.mfa_enabled) {
            mfaCode = await this.promptMFAForOperation('delete this confidential file');
            if (!mfaCode) {
                return; // User cancelled or failed MFA
            }
        }

        try {
            console.log(`Deleting file: ${filename} (ID: ${fileId})`);

            const requestBody = {
                action: 'delete',
                category: this.currentFileCategory.toUpperCase(),
                fileId: fileId
            };

            // Add MFA code if we have one
            if (mfaCode) {
                requestBody.mfaCode = mfaCode;
            }

            const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('File deleted successfully');
                this.closeFileModal(); // Close modal if open
                await this.loadFiles(); // Refresh file list
            } else {
                this.showError(data.message || 'Failed to delete file');
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showError('Delete failed');
        }
    }

    showFileModal(filename, content) {
        const modal = document.getElementById('fileViewModal');
        const modalFileName = document.getElementById('modalFileName');
        const modalFileContent = document.getElementById('modalFileContent');
        const modalFileEditor = document.getElementById('modalFileEditor');
        const editFileBtn = document.getElementById('editFileBtn');
        const downloadFileBtn = document.getElementById('downloadFileBtn');
        const deleteFileBtn = document.getElementById('deleteFileBtn');

        if (modal && modalFileName && modalFileContent) {
            modalFileName.textContent = filename;
            modalFileContent.textContent = content;
            
            if (modalFileEditor) {
                modalFileEditor.value = content;
            }
            
            // Show/hide buttons based on user permissions for current file category
            
            // Edit button - show only if user has write permission
            if (editFileBtn) {
                if (this.hasPermission('write', this.currentFileCategory)) {
                    editFileBtn.classList.remove('hidden');
                    console.log('Showing edit button - user has write permission');
                } else {
                    editFileBtn.classList.add('hidden');
                    console.log('Hiding edit button - user lacks write permission');
                }
            }
            
            // Download button - hide for confidential files, show for others if user has read permission
            if (downloadFileBtn) {
                if (this.currentFileCategory === 'CONFIDENTIAL') {
                    downloadFileBtn.classList.add('hidden');
                    console.log('Hiding download button for confidential file');
                } else if (this.hasPermission('read', this.currentFileCategory)) {
                    downloadFileBtn.classList.remove('hidden');
                    console.log('Showing download button - user has read permission');
                } else {
                    downloadFileBtn.classList.add('hidden');
                    console.log('Hiding download button - user lacks read permission');
                }
            }
            
            // Delete button - show only if user has delete permission
            if (deleteFileBtn) {
                if (this.hasPermission('delete', this.currentFileCategory)) {
                    deleteFileBtn.classList.remove('hidden');
                    console.log('Showing delete button - user has delete permission');
                } else {
                    deleteFileBtn.classList.add('hidden');
                    console.log('Hiding delete button - user lacks delete permission');
                }
            }
            
            // Ensure we're in view mode initially
            this.exitEditMode(false);
            
            modal.classList.remove('hidden');
        }
    }

    closeFileModal() {
        const modal = document.getElementById('fileViewModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.currentFileId = null;
        this.currentFileName = null;
    }

    enterEditMode() {
        const modalFileContent = document.getElementById('modalFileContent');
        const modalFileEditor = document.getElementById('modalFileEditor');
        const editFileBtn = document.getElementById('editFileBtn');
        const saveFileBtn = document.getElementById('saveFileBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');

        // Hide content display and show editor
        modalFileContent.classList.add('hidden');
        modalFileEditor.classList.remove('hidden');

        // Hide edit button, show save and cancel
        editFileBtn.classList.add('hidden');
        saveFileBtn.classList.remove('hidden');
        cancelEditBtn.classList.remove('hidden');

        // Focus on the editor
        modalFileEditor.focus();
    }

    exitEditMode(restoreOriginal = true) {
        const modalFileContent = document.getElementById('modalFileContent');
        const modalFileEditor = document.getElementById('modalFileEditor');
        const editFileBtn = document.getElementById('editFileBtn');
        const saveFileBtn = document.getElementById('saveFileBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');

        // Show content display and hide editor
        if (modalFileContent) modalFileContent.classList.remove('hidden');
        if (modalFileEditor) modalFileEditor.classList.add('hidden');

        // Show edit button, hide save and cancel
        if (editFileBtn && this.currentFileCategory === 'CONFIDENTIAL') {
            editFileBtn.classList.remove('hidden');
            console.log('Restoring edit button visibility for confidential file');
        }
        if (saveFileBtn) saveFileBtn.classList.add('hidden');
        if (cancelEditBtn) cancelEditBtn.classList.add('hidden');

        // Restore original content if needed
        if (restoreOriginal && modalFileEditor && modalFileContent) {
            modalFileEditor.value = modalFileContent.textContent;
        }
    }

    async saveFileContent() {
        // Check if user has write permission for current file category
        if (!this.hasPermission('write', this.currentFileCategory)) {
            this.showError(`You don't have permission to edit ${this.currentFileCategory.toLowerCase()} files. Contact an administrator.`);
            return;
        }

        try {
            const modalFileEditor = document.getElementById('modalFileEditor');
            const content = modalFileEditor.value;

            if (!this.currentFileId || !content) {
                this.showError('No content to save');
                return;
            }

            // For confidential files, require MFA
            let mfaCode = null;
            if (this.user?.mfa_enabled) {
                mfaCode = await this.promptMFAForOperation('CONFIDENTIAL_WRITE');
                if (!mfaCode) {
                    return; // User cancelled MFA prompt
                }
            }

            const requestBody = {
                action: 'write',
                category: this.currentFileCategory.toUpperCase(),
                fileId: this.currentFileId,
                content: content
            };

            // Add MFA code if we have one
            if (mfaCode) {
                requestBody.mfaCode = mfaCode;
            }

            const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Update the content display
                const modalFileContent = document.getElementById('modalFileContent');
                modalFileContent.textContent = content;
                
                // Exit edit mode
                this.exitEditMode(false);
                
                this.showSuccess('File updated successfully');
            } else if (data.requireMfaVerification) {
                // Handle anomaly detection requiring additional MFA
                console.log('Anomaly detection triggered, requiring additional MFA verification');
                
                // Show anomaly information to user
                let anomalyMessage = 'Additional security verification required due to:';
                if (data.anomalies && data.anomalies.length > 0) {
                    anomalyMessage += '\n' + data.anomalies.map(a => `• ${a.description}`).join('\n');
                }
                
                // Prompt for additional MFA
                const additionalMfaCode = await this.promptMFAForOperation('CONFIDENTIAL_WRITE');
                if (additionalMfaCode) {
                    // Retry the request with additional MFA
                    requestBody.mfaCode = additionalMfaCode;
                    
                    const retryResponse = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify(requestBody)
                    });

                    const retryData = await retryResponse.json();
                    
                    if (retryResponse.ok && retryData.success) {
                        // Update the content display
                        const modalFileContent = document.getElementById('modalFileContent');
                        modalFileContent.textContent = content;
                        
                        // Exit edit mode
                        this.exitEditMode(false);
                        
                        this.showSuccess('File updated successfully');
                    } else {
                        this.showError(retryData.message || 'Failed to save file after additional verification');
                    }
                } else {
                    this.showError('Additional verification required but cancelled');
                }
            } else {
                this.showError(data.message || 'Failed to save file');
            }

        } catch (error) {
            console.error('Save file error:', error);
            this.showError('Failed to save file');
        }
    }

    async loadProfile() {
        const content = document.getElementById('profile-content');
        
        // Get user display names safely
        const displayName = this.getUserDisplayName();
        
        const mfaStatus = this.user?.mfa_enabled ? 
            '<span style="color: #28a745;">✓ Enabled</span>' : 
            '<span style="color: #dc3545;">✗ Disabled</span>';
        
        content.innerHTML = `
            <div style="max-width: 600px;">
                <div style="background: white; border-radius: 15px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 1.5rem; color: #333;">Profile Information</h3>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Full Name</label>
                        <p style="color: #666; margin: 0.5rem 0;">${displayName}</p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Email Address</label>
                        <p style="color: #666; margin: 0.5rem 0;">${this.user?.email || 'Not available'}</p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Role</label>
                        <p style="color: #666; margin: 0.5rem 0;"><strong>${this.user?.role || 'Unknown'}</strong></p>
                    </div>
                    
                    <div style="margin-bottom: 2rem;">
                        <label style="font-weight: 500; color: #333;">Account Status</label>
                        <p style="color: #666; margin: 0.5rem 0;"><strong>${this.user?.status || 'APPROVED'}</strong></p>
                    </div>
                    
                    <button class="btn" onclick="app.logout()">Logout</button>
                </div>
                
                <div style="background: white; border-radius: 15px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 1.5rem; color: #333;">Security Settings</h3>
                    
                    <div style="margin-bottom: 2rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <div>
                                <label style="font-weight: 500; color: #333;">Multi-Factor Authentication</label>
                                <p style="color: #666; margin: 0.5rem 0; font-size: 0.9rem;">
                                    Secure your account with an additional layer of protection
                                </p>
                                <p style="margin: 0.5rem 0;">Status: ${mfaStatus}</p>
                            </div>
                        </div>
                        
                        ${!this.user.mfa_enabled ? `
                            <button class="btn" onclick="app.setupMFA()" style="background: #28a745;">
                                Enable MFA
                            </button>
                        ` : `
                            <div style="display: flex; gap: 1rem;">
                                <button class="btn" onclick="app.disableMFA()" style="background: #dc3545;">
                                    Disable MFA
                                </button>
                                
                            </div>
                        `}
                    </div>
                </div>
                
                <div style="background: #e3f2fd; border-radius: 15px; padding: 2rem; border-left: 4px solid #2196f3;">
                    <h4 style="color: #1976d2; margin-bottom: 1rem;">Security Information</h4>
                    <p style="color: #1976d2; margin: 0; font-size: 0.9rem;">
                        ${this.user.mfa_enabled ? 
                            '🔒 Your account is secured with Multi-Factor Authentication. You will need your authenticator app to access confidential files.' :
                            '⚠️ Consider enabling MFA for enhanced security, especially when working with confidential files.'
                        }
                    </p>
                </div>
            </div>
        `;
    }

    async setupMFA() {
        try {
            const response = await fetch(`${this.baseURL}/auth/setup-mfa`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showMFASetupModal(data.qrCode, data.manualEntryKey);
            } else {
                this.showError(data.message || 'Failed to setup MFA');
            }
        } catch (error) {
            console.error('MFA setup error:', error);
            this.showError('MFA setup failed');
        }
    }

    showMFASetupModal(qrCode, manualKey) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 500px; width: 90%; max-height: 90%; overflow-y: auto;">
                <h3 style="text-align: center; margin-bottom: 1rem; color: #333;">Setup Multi-Factor Authentication</h3>
                
                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <p style="color: #666; margin-bottom: 1rem;">
                        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                    </p>
                    <img src="${qrCode}" alt="MFA QR Code" style="max-width: 200px; border: 1px solid #ddd; border-radius: 10px;">
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 10px;">
                    <p style="font-weight: 500; margin-bottom: 0.5rem; color: #333;">Manual Entry Key:</p>
                    <code style="background: white; padding: 0.5rem; border-radius: 5px; display: block; word-break: break-all;">${manualKey}</code>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: #333; font-weight: 500;">
                        Enter the 6-digit code from your authenticator app:
                    </label>
                    <input type="text" id="setupMfaCode" maxlength="6" 
                           style="width: 100%; padding: 1rem; border: 2px solid #e9ecef; border-radius: 10px; font-size: 1.2rem; text-align: center; letter-spacing: 0.2rem;"
                           placeholder="000000">
                </div>
                
                <div style="display: flex; gap: 1rem;">
                    <button id="mfaSetupCancelBtn" class="btn" style="flex: 1; background: #6c757d;">Cancel</button>
                    <button id="mfaSetupConfirmBtn" class="btn" style="flex: 1;">Complete Setup</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('setupMfaCode').focus();

        // Handle confirmation
        const confirmBtn = document.getElementById('mfaSetupConfirmBtn');
        const cancelBtn = document.getElementById('mfaSetupCancelBtn');
        const codeInput = document.getElementById('setupMfaCode');

        const cleanup = () => {
            document.body.removeChild(modal);
        };

        confirmBtn.onclick = async () => {
            const code = codeInput.value;
            if (code.length !== 6) {
                this.showError('Please enter a 6-digit code');
                return;
            }

            try {
                const response = await fetch(`${this.baseURL}/auth/confirm-mfa`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({ mfaCode: code })
                });

                const data = await response.json();

                if (data.success) {
                    this.user.mfa_enabled = true;
                    cleanup();
                    this.showSuccess('MFA setup completed successfully!');
                    this.loadProfile(); // Refresh profile to show new MFA status
                } else {
                    this.showError(data.message || 'Invalid MFA code');
                    codeInput.value = '';
                    codeInput.focus();
                }
            } catch (error) {
                console.error('MFA confirmation error:', error);
                this.showError('MFA setup failed');
            }
        };

        cancelBtn.onclick = cleanup;

        // Enter key to verify
        codeInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        };
    }

    async disableMFA() {
        if (!confirm('Are you sure you want to disable Multi-Factor Authentication? This will reduce your account security.')) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/auth/disable-mfa`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();

            if (data.success) {
                this.user.mfa_enabled = false;
                this.showSuccess('MFA has been disabled');
                this.loadProfile(); // Refresh profile
            } else {
                this.showError(data.message || 'Failed to disable MFA');
            }
        } catch (error) {
            console.error('MFA disable error:', error);
            this.showError('Failed to disable MFA');
        }
    }

    showBackupCodes() {
        this.showError('Backup codes feature will be implemented in a future update');
    }

    // Helper function to wait for an element to be available in the DOM
    async waitForElement(elementId, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkElement = () => {
                const element = document.getElementById(elementId);
                if (element) {
                    // Element exists, resolve immediately (don't wait for visibility)
                    resolve(element);
                    return;
                }
                
                if (Date.now() - startTime >= timeout) {
                    console.warn(`Element ${elementId} not found within ${timeout}ms, continuing anyway`);
                    resolve(null); // Resolve with null instead of rejecting
                    return;
                }
                
                // Check again after a short delay
                setTimeout(checkElement, 50);
            };
            
            checkElement();
        });
    }

    async loadAdmin() {
        console.log('loadAdmin called, user object:', this.user);
        console.log('User role:', this.user?.role);
        
        // If user object is not available or incomplete, wait and retry multiple times
        let retryCount = 0;
        const maxRetries = 5;
        
        while ((!this.user || !this.user.role) && retryCount < maxRetries) {
            console.log(`User object not ready, waiting and retrying... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 500));
            retryCount++;
        }
        
        // If still not available after retries, show error
        if (!this.user || !this.user.role) {
            console.log('User object still not available after multiple retries');
            document.getElementById('admin-content').innerHTML = `
                <div style="text-align: center; color: #dc3545; padding: 2rem;">
                    <p>User session not ready. Please try refreshing the page.</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Refresh Page
                    </button>
                </div>`;
            return;
        }
        
        console.log('Role check result:', ['ADMIN', 'MANAGER'].includes(this.user?.role));
        
        if (!['ADMIN', 'MANAGER'].includes(this.user?.role)) {
            console.log('Access denied - insufficient privileges');
            document.getElementById('admin-content').innerHTML = '<p style="text-align: center; color: #dc3545;">Access denied. Administrator privileges required.</p>';
            return;
        }

        console.log('Admin access granted, loading dashboard');
        
        // Wait a bit for the DOM to be ready after section switch
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Load dashboard by default
        this.switchAdminTab('dashboard');
        
        // Setup admin event listeners if not already done
        this.setupAdminEventListeners();
    }

    switchAdminTab(tabName) {
        console.log(`switchAdminTab called with: ${tabName}`);
        
        // Update tab buttons
        document.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#f8f9fa';
            btn.style.color = '#495057';
        });
        
        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            activeTab.style.color = 'white';
        } else {
            console.warn(`Active tab button not found for: ${tabName}`);
        }

        // Hide all admin tab content
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // Show selected tab content
        const selectedContent = document.getElementById(`admin-${tabName}`);
        console.log(`Looking for element: admin-${tabName}`, selectedContent);
        
        if (selectedContent) {
            selectedContent.classList.remove('hidden');
            console.log(`Showed admin-${tabName} content`);
        } else {
            console.error(`Admin content element not found: admin-${tabName}`);
        }

        // Load content based on tab
        switch (tabName) {
            case 'dashboard':
                // Don't await here to avoid blocking the UI
                this.loadAdminDashboard().catch(error => {
                    console.error('Error loading admin dashboard:', error);
                });
                break;
            case 'users':
                this.loadAllUsers();
                break;
            case 'pending':
                this.loadPendingUsers();
                break;
            case 'audit':
                this.loadAuditLogs();
                break;
        }
    }

    async loadAdminDashboard() {
        try {
            console.log('Starting admin dashboard load...');
            
            // Simple delay to ensure DOM is ready
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('Loading admin stats...');
            // Load system stats
            const response = await fetch(`${this.baseURL}/admin/stats`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Admin stats response:', data); // Debug log
                
                if (data.success && data.statistics) {
                    // Calculate stats from the raw data
                    const { users, files } = data.statistics;
                    
                    // Calculate user counts
                    let totalUsers = 0;
                    let pendingUsers = 0;
                    
                    if (users && Array.isArray(users)) {
                        users.forEach(userGroup => {
                            totalUsers += userGroup.count;
                            if (userGroup.status === 'PENDING_APPROVAL') {
                                pendingUsers += userGroup.count;
                            }
                        });
                    }
                    
                    // Calculate file counts
                    let totalFiles = 0;
                    let encryptedFiles = 0;
                    
                    if (files && Array.isArray(files)) {
                        files.forEach(fileGroup => {
                            totalFiles += fileGroup.count;
                            // Count encrypted files from the encrypted_count field (which includes all encrypted files regardless of category)
                            if (fileGroup.encrypted_count) {
                                encryptedFiles += fileGroup.encrypted_count;
                            }
                        });
                    }
                    
                    // Update dashboard stats with null checks and retry logic
                    const updateStats = () => {
                        const totalUsersEl = document.getElementById('totalUsers');
                        const pendingUsersEl = document.getElementById('pendingUsers');
                        const totalFilesEl = document.getElementById('totalFiles');
                        const encryptedFilesEl = document.getElementById('encryptedFiles');

                        if (totalUsersEl) totalUsersEl.textContent = totalUsers;
                        if (pendingUsersEl) pendingUsersEl.textContent = pendingUsers;
                        if (totalFilesEl) totalFilesEl.textContent = totalFiles;
                        if (encryptedFilesEl) encryptedFilesEl.textContent = encryptedFiles;
                        
                        // Return true if all elements were found and updated
                        return totalUsersEl && pendingUsersEl && totalFilesEl && encryptedFilesEl;
                    };
                    
                    // Try to update stats immediately
                    if (!updateStats()) {
                        // If some elements weren't found, try again after a short delay
                        setTimeout(() => {
                            updateStats();
                        }, 500);
                    }

                    // Load recent activity
                    await this.displayRecentActivity(data.statistics.recentActivity || []);
                } else {
                    console.error('Invalid stats response:', data);
                    this.showError('Invalid statistics data received');
                }
            } else {
                this.showError('Failed to load admin dashboard');
            }
        } catch (error) {
            console.error('Admin dashboard error:', error);
            this.showError('Failed to load admin dashboard');
        }
    }

    async displayRecentActivity(activities) {
        // Try to wait for the recentActivity container to be available
        let container;
        try {
            container = await this.waitForElement('recentActivity', 1000);
        } catch (error) {
            console.warn('recentActivity container not found, skipping recent activity display');
            return;
        }
        
        if (!container) {
            console.warn('recentActivity container not available, skipping recent activity display');
            return;
        }
        
        if (!activities || activities.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">No recent activity</p>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div style="padding: 1rem; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: #333;">${this.escapeHtml(activity.action)}</strong>
                    <p style="margin: 0; color: #666; font-size: 0.9rem;">
                        ${activity.user && activity.user.email ? `by ${this.escapeHtml(activity.user.email)}` : 'System'} 
                        ${activity.ipAddress ? `• ${this.escapeHtml(activity.ipAddress)}` : ''}
                    </p>
                </div>
                <div style="text-align: right;">
                    <span style="color: ${activity.success ? '#28a745' : '#dc3545'}; font-weight: bold;">
                        ${activity.success ? '✓' : '✗'}
                    </span>
                    <p style="margin: 0; color: #666; font-size: 0.8rem;">
                        ${this.formatDate(activity.timestamp)}
                    </p>
                </div>
            </div>
        `).join('');
    }

    async loadAllUsers() {
        try {
            const response = await fetch(`${this.baseURL}/admin/users`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayUsersTable(data.users || []);
            } else {
                this.showError('Failed to load users');
            }
        } catch (error) {
            console.error('Load users error:', error);
            this.showError('Failed to load users');
        }
    }

    displayUsersTable(users) {
        const container = document.getElementById('usersTable');
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No users found</p>';
            return;
        }

        container.innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #e9ecef;">
                            <th style="padding: 1rem; text-align: left; color: #333;">User</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Email</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Role</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Status</th>
                            <th style="padding: 1rem; text-align: center; color: #333;">Actions</th>
                            <th style="padding: 1rem; text-align: center; color: #333;">Delete</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr style="border-bottom: 1px solid #e9ecef;">
                                <td style="padding: 1rem;">
                                    <strong>${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}</strong>
                                </td>
                                <td style="padding: 1rem; color: #666;">${this.escapeHtml(user.email)}</td>
                                <td style="padding: 1rem;">
                                    <span style="padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem; font-weight: bold; 
                                                 background: ${this.getRoleColor(user.role).bg}; color: ${this.getRoleColor(user.role).text};">
                                        ${user.role}
                                    </span>
                                </td>
                                <td style="padding: 1rem;">
                                    <span style="padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem; font-weight: bold;
                                                 background: ${this.getStatusColor(user.status).bg}; color: ${this.getStatusColor(user.status).text};">
                                        ${user.status}
                                    </span>
                                </td>
                                <td style="padding: 1rem; text-align: center;">
                                    <button onclick="app.openRoleModal(${user.id}, '${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}', '${user.role}')" 
                                            class="btn" style="background: #007bff; padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-right: 0.5rem;">
                                        Change Role
                                    </button>
                                    ${user.status === 'APPROVED' ? 
                                        `<button onclick="app.revokeUser(${user.id}, '${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}')" 
                                                 class="btn" style="background: #dc3545; padding: 0.25rem 0.75rem; font-size: 0.8rem;">
                                            Revoke
                                         </button>` : ''}
                                </td>
                                <td style="padding: 1rem; text-align: center;">
                                    ${user.id !== this.user.id ? 
                                        `<button onclick="app.deleteUser(${user.id}, '${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}')" 
                                                 class="btn" style="background: #ffffff; border: none; padding: 0.5rem; border-radius: 5px; cursor: pointer; font-size: 1.2rem;"
                                                 title="Delete User">
                                            🗑️
                                         </button>` : 
                                        `<span style="color: #999; font-size: 0.8rem;">Cannot delete self</span>`}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadPendingUsers() {
        try {
            const response = await fetch(`${this.baseURL}/admin/pending-users`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayPendingUsersTable(data.users || []);
            } else {
                this.showError('Failed to load pending users');
            }
        } catch (error) {
            console.error('Load pending users error:', error);
            this.showError('Failed to load pending users');
        }
    }

    displayPendingUsersTable(users) {
        const container = document.getElementById('pendingUsersTable');
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No pending approvals</p>';
            return;
        }

        container.innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #e9ecef;">
                            <th style="padding: 1rem; text-align: left; color: #333;">User</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Email</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Requested Role</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Registered</th>
                            <th style="padding: 1rem; text-align: center; color: #333;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr style="border-bottom: 1px solid #e9ecef;">
                                <td style="padding: 1rem;">
                                    <strong>${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}</strong>
                                </td>
                                <td style="padding: 1rem; color: #666;">${this.escapeHtml(user.email)}</td>
                                <td style="padding: 1rem;">
                                    <span style="padding: 0.25rem 0.75rem; border-radius: 15px; font-size: 0.8rem; font-weight: bold; 
                                                 background: ${this.getRoleColor(user.role).bg}; color: ${this.getRoleColor(user.role).text};">
                                        ${user.role}
                                    </span>
                                </td>
                                <td style="padding: 1rem; color: #666;">
                                    ${this.formatDate(user.registeredAt)}
                                </td>
                                <td style="padding: 1rem; text-align: center;">
                                    <button onclick="app.approveUser(${user.id}, '${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}')" 
                                            class="btn" style="background: #28a745; padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-right: 0.5rem;">
                                        Approve
                                    </button>
                                    <button onclick="app.rejectUser(${user.id}, '${this.escapeHtml(user.first_name || user.firstName || '')} ${this.escapeHtml(user.last_name || user.lastName || '')}')" 
                                            class="btn" style="background: #dc3545; padding: 0.25rem 0.75rem; font-size: 0.8rem;">
                                        Reject
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async loadAuditLogs() {
        try {
            const filter = document.getElementById('auditFilter').value;
            const url = filter ? 
                `${this.baseURL}/admin/audit-logs?action=${encodeURIComponent(filter)}` : 
                `${this.baseURL}/admin/audit-logs`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayAuditLogsTable(data.logs || []);
            } else {
                this.showError('Failed to load audit logs');
            }
        } catch (error) {
            console.error('Load audit logs error:', error);
            this.showError('Failed to load audit logs');
        }
    }

    displayAuditLogsTable(logs) {
        const container = document.getElementById('auditLogsTable');
        
        if (logs.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No audit logs found</p>';
            return;
        }

        container.innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; border-bottom: 2px solid #e9ecef;">
                            <th style="padding: 1rem; text-align: left; color: #333;">Timestamp</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">User</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Action</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">Resource</th>
                            <th style="padding: 1rem; text-align: left; color: #333;">IP Address</th>
                            <th style="padding: 1rem; text-align: center; color: #333;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.map(log => `
                            <tr style="border-bottom: 1px solid #e9ecef;">
                                <td style="padding: 1rem; color: #666;">
                                    ${this.formatDate(log.timestamp)}
                                </td>
                                <td style="padding: 1rem;">
                                    ${log.user_email ? this.escapeHtml(log.user_email) : 'System'}
                                </td>
                                <td style="padding: 1rem;">
                                    <strong>${this.escapeHtml(log.action)}</strong>
                                </td>
                                <td style="padding: 1rem; color: #666;">
                                    ${log.resource ? this.escapeHtml(log.resource) : '-'}
                                </td>
                                <td style="padding: 1rem; color: #666; font-family: monospace;">
                                    ${log.ip_address || '-'}
                                </td>
                                <td style="padding: 1rem; text-align: center;">
                                    <span style="color: ${log.success ? '#28a745' : '#dc3545'}; font-weight: bold; font-size: 1.2rem;">
                                        ${log.success ? '✓' : '✗'}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    getRoleColor(role) {
        const colors = {
            'ADMIN': { bg: '#dc3545', text: 'white' },
            'MANAGER': { bg: '#fd7e14', text: 'white' },
            'USER': { bg: '#007bff', text: 'white' },
            'GUEST': { bg: '#6c757d', text: 'white' }
        };
        return colors[role] || { bg: '#6c757d', text: 'white' };
    }

    getStatusColor(status) {
        const colors = {
            'APPROVED': { bg: '#28a745', text: 'white' },
            'PENDING_APPROVAL': { bg: '#ffc107', text: 'black' },
            'REVOKED': { bg: '#dc3545', text: 'white' },
            'SUSPENDED': { bg: '#fd7e14', text: 'white' }
        };
        return colors[status] || { bg: '#6c757d', text: 'white' };
    }

    // User management actions
    async approveUser(userId, userName) {
        if (!confirm(`Approve user "${userName}"?`)) return;

        try {
            const response = await fetch(`${this.baseURL}/admin/approve-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ userId })
            });

            const data = await response.json();
            if (data.success) {
                this.showSuccess(`User "${userName}" approved successfully`);
                this.loadPendingUsers(); // Refresh the table
                this.loadAdminDashboard(); // Update stats
            } else {
                this.showError(data.message || 'Failed to approve user');
            }
        } catch (error) {
            console.error('Approve user error:', error);
            this.showError('Failed to approve user');
        }
    }

    async rejectUser(userId, userName) {
        if (!confirm(`Reject user "${userName}"? This will delete their account.`)) return;

        try {
            const response = await fetch(`${this.baseURL}/admin/revoke-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ userId })
            });

            const data = await response.json();
            if (data.success) {
                this.showSuccess(`User "${userName}" rejected and removed`);
                this.loadPendingUsers(); // Refresh the table
                this.loadAdminDashboard(); // Update stats
            } else {
                this.showError(data.message || 'Failed to reject user');
            }
        } catch (error) {
            console.error('Reject user error:', error);
            this.showError('Failed to reject user');
        }
    }

    async revokeUser(userId, userName) {
        if (!confirm(`Revoke access for user "${userName}"?`)) return;

        try {
            const response = await fetch(`${this.baseURL}/admin/revoke-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ userId })
            });

            const data = await response.json();
            if (data.success) {
                this.showSuccess(`User "${userName}" access revoked`);
                this.loadAllUsers(); // Refresh the table
                this.loadAdminDashboard(); // Update stats
            } else {
                this.showError(data.message || 'Failed to revoke user');
            }
        } catch (error) {
            console.error('Revoke user error:', error);
            this.showError('Failed to revoke user');
        }
    }

    async deleteUser(userId, userName) {
        if (!confirm(`Are you sure you want to permanently delete user "${userName}"?\n\nThis action cannot be undone and will remove all user data.`)) {
            return;
        }

        // Second confirmation for extra safety
        if (!confirm(`Final confirmation: Delete "${userName}" permanently?`)) {
            return;
        }

        try {
            const response = await fetch(`${this.baseURL}/admin/user/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();
            if (data.success) {
                this.showSuccess(data.message || `User "${userName}" deleted successfully`);
                this.loadAllUsers(); // Refresh the table
                this.loadAdminDashboard(); // Update stats
            } else {
                this.showError(data.message || 'Failed to delete user');
            }
        } catch (error) {
            console.error('Delete user error:', error);
            this.showError('Failed to delete user');
        }
    }

    // Role management
    openRoleModal(userId, userName, currentRole) {
        this.selectedUserId = userId;
        this.selectedUserName = userName;
        
        document.getElementById('roleModalUser').textContent = `Assign role for: ${userName}`;
        document.getElementById('roleSelect').value = currentRole;
        document.getElementById('roleModal').classList.remove('hidden');
    }

    closeRoleModal() {
        document.getElementById('roleModal').classList.add('hidden');
        this.selectedUserId = null;
        this.selectedUserName = null;
    }

    async assignRole() {
        const newRole = document.getElementById('roleSelect').value;
        
        if (!this.selectedUserId || !newRole) return;

        try {
            const response = await fetch(`${this.baseURL}/admin/assign-role`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ 
                    userId: this.selectedUserId, 
                    role: newRole 
                })
            });

            const data = await response.json();
            if (data.success) {
                this.showSuccess(`Role assigned successfully to ${this.selectedUserName}`);
                this.closeRoleModal();
                this.loadAllUsers(); // Refresh the table
            } else {
                this.showError(data.message || 'Failed to assign role');
            }
        } catch (error) {
            console.error('Assign role error:', error);
            this.showError('Failed to assign role');
        }
    }

    async loadAnalytics() {
        // If user object is not available or incomplete, wait and retry multiple times
        let retryCount = 0;
        const maxRetries = 5;
        
        while ((!this.user || !this.user.role) && retryCount < maxRetries) {
            console.log(`Analytics: User object not ready, waiting and retrying... (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 500));
            retryCount++;
        }
        
        if (!['ADMIN', 'MANAGER'].includes(this.user?.role)) {
            document.getElementById('analytics-content').innerHTML = '<p style="text-align: center; color: #dc3545;">Access denied. Manager or Administrator privileges required.</p>';
            return;
        }

        const content = document.getElementById('analytics-content');
        content.innerHTML = '<p style="text-align: center; color: #666;">Loading analytics dashboard...</p>';

        try {
            // Load endpoint logs and analytics data
            const [logsResponse, dashboardResponse] = await Promise.all([
                fetch(`${this.baseURL}/analytics/endpoint-logs?timeRange=24h`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                }),
                fetch(`${this.baseURL}/analytics/dashboard`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                })
            ]);

            if (!logsResponse.ok || !dashboardResponse.ok) {
                throw new Error('Failed to load analytics data');
            }

            const logsData = await logsResponse.json();
            const dashboardData = await dashboardResponse.json();

            this.renderAnalyticsDashboard(logsData, dashboardData);
            
            // Set up auto-refresh every 30 seconds
            if (this.analyticsRefreshInterval) {
                clearInterval(this.analyticsRefreshInterval);
            }
            this.analyticsRefreshInterval = setInterval(() => {
                if (document.getElementById('analytics-section').classList.contains('hidden') === false) {
                    this.loadAnalytics();
                }
            }, 30000);

        } catch (error) {
            console.error('Analytics loading error:', error);
            content.innerHTML = `
                <div style="text-align: center; color: #dc3545; margin: 2rem 0;">
                    <p>Failed to load analytics data</p>
                    <button onclick="app.loadAnalytics()" class="btn" style="margin-top: 1rem;">Retry</button>
                </div>
            `;
        }
    }

    renderAnalyticsDashboard(logsData, dashboardData) {
        const content = document.getElementById('analytics-content');
        
        content.innerHTML = `
            <div class="analytics-dashboard">
                <!-- Dashboard Header with Stats -->
                <div class="analytics-header" style="margin-bottom: 2rem;">
                    
                    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                        <div class="stat-card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1.5rem; border-radius: 10px; text-align: center;">
                            <h4 style="margin: 0; font-size: 2rem;">${logsData.totalLogs || 0}</h4>
                            <p style="margin: 0.5rem 0 0 0;">Total Logs (24h)</p>
                        </div>
                        <div class="stat-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 1.5rem; border-radius: 10px; text-align: center;">
                            <h4 style="margin: 0; font-size: 2rem;">${logsData.summary?.successful || 0}</h4>
                            <p style="margin: 0.5rem 0 0 0;">Successful Operations</p>
                        </div>
                        <div class="stat-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 1.5rem; border-radius: 10px; text-align: center;">
                            <h4 style="margin: 0; font-size: 2rem;">${logsData.summary?.uniqueUsers || 0}</h4>
                            <p style="margin: 0.5rem 0 0 0;">Active Users</p>
                        </div>
                        <div class="stat-card" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 1.5rem; border-radius: 10px; text-align: center;">
                            <h4 style="margin: 0; font-size: 2rem;">${logsData.summary?.failed || 0}</h4>
                            <p style="margin: 0.5rem 0 0 0;">Failed Attempts</p>
                        </div>
                    </div>
                </div>

                <!-- Controls -->
                <div class="analytics-controls" style="background: #f8f9fa; padding: 1rem; border-radius: 10px; margin-bottom: 2rem;">
                    <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                        <label style="font-weight: bold;">Time Range:</label>
                        <select id="analyticsTimeRange" onchange="app.updateAnalyticsTimeRange(this.value)" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 5px;">
                            <option value="1h">Last Hour</option>
                            <option value="24h" selected>Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                        </select>
                        
                        <label style="font-weight: bold; margin-left: 1rem;">Filter by Endpoint:</label>
                        <select id="analyticsEndpointFilter" onchange="app.updateAnalyticsEndpointFilter(this.value)" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 5px;">
                            <option value="">All Endpoints</option>
                            <option value="auth">Authentication</option>
                            <option value="files">File Operations</option>
                            <option value="admin">Admin Operations</option>
                            <option value="analytics">Analytics</option>
                        </select>
                        
                        <button onclick="app.loadAnalytics()" class="btn" style="background: #28a745; margin-left: auto;">
                            Refresh
                        </button>
                    </div>
                </div>

                <!-- Real-time Activity Monitor -->
                <div class="activity-monitor" style="background: white; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 2rem; overflow: hidden;">
                    <div style="background: #343a40; color: white; padding: 1rem; font-weight: bold;">
                        Real-Time Activity Log Monitor
                        <span style="float: right; font-size: 0.9rem; opacity: 0.8;">Auto-refreshes every 30s</span>
                    </div>
                    <div id="activityLogContainer" style="max-height: 400px; overflow-y: auto;">
                        ${this.renderActivityLogs(logsData.logs || [])}
                    </div>
                </div>

                <!-- Endpoint Usage Visualization -->
                <div class="endpoint-visualization" style="background: white; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 2rem;">
                    <div style="background: #495057; color: white; padding: 1rem; font-weight: bold;">
                        Endpoint Usage Analytics
                    </div>
                    <div style="padding: 1rem;">
                        ${this.renderEndpointUsageChart(logsData.logs || [])}
                    </div>
                </div>

                <!-- Security Events & Anomalies -->
                <div class="security-events" style="background: white; border: 1px solid #ddd; border-radius: 10px;">
                    <div style="background: #dc3545; color: white; padding: 1rem; font-weight: bold;">
                        Security Events & Anomalies
                    </div>
                    <div style="padding: 1rem;">
                        ${this.renderSecurityEvents(logsData.logs || [])}
                    </div>
                </div>
            </div>
        `;
    }

    renderActivityLogs(logs) {
        if (!logs || logs.length === 0) {
            return '<div style="padding: 2rem; text-align: center; color: #666;">No activity logs found</div>';
        }

        return logs.slice(0, 50).map(log => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const statusColor = log.success ? '#28a745' : '#dc3545';
            const statusIcon = log.success ? '✅' : '❌';
            const riskLevel = this.getRiskLevel(log.riskScore || 0);
            
            return `
                <div class="log-entry" style="border-bottom: 1px solid #eee; padding: 0.75rem; display: flex; align-items: center; hover: background-color: #f8f9fa;">
                    <span style="color: ${statusColor}; margin-right: 0.5rem; font-size: 1.1rem;">${statusIcon}</span>
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: #333;">
                            ${this.escapeHtml(log.action)}
                            ${log.resource ? ` - ${this.escapeHtml(log.resource)}` : ''}
                        </div>
                        <div style="font-size: 0.9rem; color: #666; margin-top: 0.25rem;">
                            ${log.user ? `${log.user.name} (${log.user.email})` : 'System'} • 
                            ${timestamp} • 
                            IP: ${log.ipAddress || 'Unknown'} • 
                            Risk: <span style="color: ${riskLevel.color}; font-weight: bold;">${riskLevel.label}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderEndpointUsageChart(logs) {
        const endpointCounts = {};
        logs.forEach(log => {
            const endpoint = this.extractEndpoint(log.action);
            endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
        });

        const sortedEndpoints = Object.entries(endpointCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        if (sortedEndpoints.length === 0) {
            return '<div style="padding: 2rem; text-align: center; color: #666;">No endpoint data available</div>';
        }

        const maxCount = Math.max(...sortedEndpoints.map(([,count]) => count));

        return `
            <div class="endpoint-chart">
                ${sortedEndpoints.map(([endpoint, count]) => {
                    const percentage = (count / maxCount) * 100;
                    return `
                        <div style="margin-bottom: 1rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                                <span style="font-weight: bold;">${this.escapeHtml(endpoint)}</span>
                                <span style="color: #666;">${count} requests</span>
                            </div>
                            <div style="background: #e9ecef; border-radius: 10px; height: 20px; overflow: hidden;">
                                <div style="background: linear-gradient(90deg, #007bff, #0056b3); height: 100%; width: ${percentage}%; border-radius: 10px; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderSecurityEvents(logs) {
        const securityEvents = logs.filter(log => 
            !log.success || 
            (log.riskScore && log.riskScore > 3) || 
            log.action.includes('FAILED') || 
            log.action.includes('ANOMALY')
        );

        if (securityEvents.length === 0) {
            return '<div style="padding: 2rem; text-align: center; color: #28a745;">✅ No security events detected in the selected time range</div>';
        }

        return `
            <div class="security-events-list">
                ${securityEvents.slice(0, 20).map(event => {
                    const riskLevel = this.getRiskLevel(event.riskScore || 0);
                    const timestamp = new Date(event.timestamp).toLocaleString();
                    
                    return `
                        <div class="security-event" style="border-left: 4px solid ${riskLevel.color}; background: ${riskLevel.bgColor}; padding: 1rem; margin-bottom: 1rem; border-radius: 0 10px 10px 0;">
                            <div style="font-weight: bold; color: ${riskLevel.color}; margin-bottom: 0.5rem;">
                                ${riskLevel.icon} ${riskLevel.label} Security Event
                            </div>
                            <div style="color: #333; margin-bottom: 0.5rem;">
                                <strong>Action:</strong> ${this.escapeHtml(event.action)}
                                ${event.resource ? ` • <strong>Resource:</strong> ${this.escapeHtml(event.resource)}` : ''}
                            </div>
                            <div style="font-size: 0.9rem; color: #666;">
                                <strong>User:</strong> ${event.user ? `${event.user.name} (${event.user.email})` : 'System'} • 
                                <strong>Time:</strong> ${timestamp} • 
                                <strong>IP:</strong> ${event.ipAddress || 'Unknown'}
                                ${event.riskScore ? ` • <strong>Risk Score:</strong> ${event.riskScore}` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    extractEndpoint(action) {
        if (action.includes('auth') || action.includes('AUTH') || action.includes('LOGIN') || action.includes('MFA')) return 'Authentication';
        if (action.includes('file') || action.includes('FILE')) return 'File Operations';
        if (action.includes('admin') || action.includes('ADMIN')) return 'Admin Operations';
        if (action.includes('analytics') || action.includes('ANALYTICS')) return 'Analytics';
        if (action.includes('profile') || action.includes('PROFILE')) return 'Profile';
        return action.split('_')[0] || 'Other';
    }

    getRiskLevel(riskScore) {
        if (riskScore >= 8) return { label: 'CRITICAL', color: '#dc3545', bgColor: '#f8d7da', icon: '🚨' };
        if (riskScore >= 6) return { label: 'HIGH', color: '#fd7e14', bgColor: '#ffeaa7', icon: '⚠️' };
        if (riskScore >= 4) return { label: 'MEDIUM', color: '#ffc107', bgColor: '#fff3cd', icon: '⚡' };
        if (riskScore >= 2) return { label: 'LOW', color: '#17a2b8', bgColor: '#d1ecf1', icon: 'ℹ️' };
        return { label: 'MINIMAL', color: '#28a745', bgColor: '#d4edda', icon: '✅' };
    }

    async updateAnalyticsTimeRange(timeRange) {
        const content = document.getElementById('analytics-content');
        const originalContent = content.innerHTML;
        
        try {
            content.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">Updating time range...</p>';
            
            const logsResponse = await fetch(`${this.baseURL}/analytics/endpoint-logs?timeRange=${timeRange}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!logsResponse.ok) throw new Error('Failed to load updated data');
            
            const logsData = await logsResponse.json();
            const dashboardResponse = await fetch(`${this.baseURL}/analytics/dashboard`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const dashboardData = await dashboardResponse.json();
            
            this.renderAnalyticsDashboard(logsData, dashboardData);
        } catch (error) {
            console.error('Time range update error:', error);
            content.innerHTML = originalContent;
            this.showError('Failed to update time range');
        }
    }

    async updateAnalyticsEndpointFilter(endpoint) {
        const timeRange = document.getElementById('analyticsTimeRange').value;
        const content = document.getElementById('analytics-content');
        const originalContent = content.innerHTML;
        
        try {
            content.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">Applying filter...</p>';
            
            const params = new URLSearchParams({ timeRange });
            if (endpoint) params.append('endpoint', endpoint);
            
            const logsResponse = await fetch(`${this.baseURL}/analytics/endpoint-logs?${params}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!logsResponse.ok) throw new Error('Failed to load filtered data');
            
            const logsData = await logsResponse.json();
            const dashboardResponse = await fetch(`${this.baseURL}/analytics/dashboard`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const dashboardData = await dashboardResponse.json();
            
            this.renderAnalyticsDashboard(logsData, dashboardData);
        } catch (error) {
            console.error('Filter update error:', error);
            content.innerHTML = originalContent;
            this.showError('Failed to apply filter');
        }
    }

    async logout() {
        console.log(' Logging out...');
        
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
        
        // Reset all sections to their logged-out state
        this.resetSectionsToLoggedOutState();
        
        // Update navbar visibility - show login/register tabs again
        this.updateNavbarVisibility();
        
        // Clear any refresh intervals
        if (this.analyticsRefreshInterval) {
            clearInterval(this.analyticsRefreshInterval);
            this.analyticsRefreshInterval = null;
        }
        
        // Redirect to home (this will now properly update navbar via showSection)
        this.showSection('home');
        
        this.showSuccess('Logged out successfully');
    }

    resetSectionsToLoggedOutState() {
        console.log('Resetting sections to logged-out state...');
        
        // Reset Profile section
        const profileContent = document.getElementById('profile-content');
        if (profileContent) {
            profileContent.innerHTML = '<p style="text-align: center; color: #666; margin: 3rem 0;">Please log in to view your profile</p>';
        }
        
        // Reset Analytics section
        const analyticsContent = document.getElementById('analytics-content');
        if (analyticsContent) {
            analyticsContent.innerHTML = '<p style="text-align: center; color: #666; margin: 3rem 0;">Manager or Administrator access required</p>';
        }
        
        // Reset Admin section - but preserve the structure
        const adminContent = document.getElementById('admin-content');
        if (adminContent) {
            // Instead of replacing the entire content, just reset the dashboard stats
            const totalUsersEl = document.getElementById('totalUsers');
            const pendingUsersEl = document.getElementById('pendingUsers');
            const totalFilesEl = document.getElementById('totalFiles');
            const encryptedFilesEl = document.getElementById('encryptedFiles');
            const recentActivityEl = document.getElementById('recentActivity');
            
            if (totalUsersEl) totalUsersEl.textContent = '-';
            if (pendingUsersEl) pendingUsersEl.textContent = '-';
            if (totalFilesEl) totalFilesEl.textContent = '-';
            if (encryptedFilesEl) encryptedFilesEl.textContent = '-';
            if (recentActivityEl) recentActivityEl.innerHTML = '<p style="text-align: center; color: #666;">Please log in to view recent activity</p>';
            
            // Hide all admin tab content
            document.querySelectorAll('.admin-tab-content').forEach(content => {
                content.classList.add('hidden');
            });
        }
        
        // Reset file sections if they exist
        const documentsFilesList = document.getElementById('documentsFilesList');
        if (documentsFilesList) {
            documentsFilesList.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">Please log in to view files</p>';
        }
        
        const imagesFilesList = document.getElementById('imagesFilesList');
        if (imagesFilesList) {
            imagesFilesList.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">Please log in to view files</p>';
        }
        
        const confidentialFilesList = document.getElementById('confidentialFilesList');
        if (confidentialFilesList) {
            confidentialFilesList.innerHTML = '<p style="text-align: center; color: #666; margin: 2rem 0;">Please log in to view files</p>';
        }
        
        // Reset dashboard section
        const dashboardContent = document.getElementById('dashboard-content');
        if (dashboardContent) {
            dashboardContent.innerHTML = '<p style="text-align: center; color: #666; margin: 3rem 0;">Please log in to access your dashboard</p>';
        }
        
        console.log('All sections reset to logged-out state');
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

    // MFA Helper Methods
    showMFASection() {
        document.getElementById('mfa-section').classList.remove('hidden');
        document.getElementById('mfaToken').focus();
    }

    hideMFASection() {
        document.getElementById('mfa-section').classList.add('hidden');
        document.getElementById('mfaToken').value = '';
    }

    async promptMFAForOperation(operationName) {
        return new Promise((resolve) => {
            // Create MFA modal
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;

            modal.innerHTML = `
                <div style="background: white; padding: 2rem; border-radius: 15px; max-width: 400px; width: 90%;">
                    <h3 style="text-align: center; margin-bottom: 1rem; color: #333;">Multi-Factor Authentication Required</h3>
                    <p style="text-align: center; color: #666; margin-bottom: 1.5rem;">
                        Please enter your 6-digit authenticator code to ${operationName.toLowerCase()}
                    </p>
                    
                    <input type="text" id="operationMfaCode" maxlength="6" 
                           style="width: 100%; padding: 1rem; border: 2px solid #e9ecef; border-radius: 10px; font-size: 1.2rem; text-align: center; letter-spacing: 0.2rem; margin-bottom: 1.5rem;"
                           placeholder="000000">
                    
                    <div style="display: flex; gap: 1rem;">
                        <button id="mfaCancelBtn" class="btn" style="flex: 1; background: #6c757d;">Cancel</button>
                        <button id="mfaVerifyBtn" class="btn" style="flex: 1;">Verify & Continue</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            document.getElementById('operationMfaCode').focus();

            // Handle verification
            const verifyBtn = document.getElementById('mfaVerifyBtn');
            const cancelBtn = document.getElementById('mfaCancelBtn');
            const codeInput = document.getElementById('operationMfaCode');

            const cleanup = () => {
                document.body.removeChild(modal);
            };

            verifyBtn.onclick = async () => {
                const code = codeInput.value;
                if (code.length !== 6) {
                    this.showError('Please enter a 6-digit code');
                    return;
                }

                try {
                    const response = await fetch(`${this.baseURL}/auth/verify-mfa-operation`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            mfaCode: code,
                            operation: operationName
                        })
                    });

                    const data = await response.json();

                    if (data.success) {
                        cleanup();
                        resolve(data.tempToken || code); // Return temp token if available, otherwise the code
                    } else {
                        this.showError(data.message || 'Invalid MFA code');
                        codeInput.value = '';
                        codeInput.focus();
                    }
                } catch (error) {
                    console.error('MFA verification error:', error);
                    this.showError('MFA verification failed');
                }
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null); // Return null instead of false for cancellation
            };

            // Enter key to verify
            codeInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    verifyBtn.click();
                }
            };
        });
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
