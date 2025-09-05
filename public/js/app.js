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
        console.log('ecureRUS Application Starting...');
        this.setupNavigation();
        this.setupEventListeners();
        
        // Ensure modal is hidden on page load
        this.closeFileModal();
        
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
        console.log(`Loading ${this.currentFileCategory} files...`);
        
        // Update UI to show current category
        this.updateFileTabsUI();
        this.updateFileInputAccept();
        
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
                        <div class="file-icon" style="font-size: 2rem;">
                            ${this.getFileIcon(this.currentFileCategory)}
                        </div>
                    </div>
                    <div class="file-actions" style="display: flex; gap: 0.5rem;">
                        <button onclick="app.viewFile(${file.id}, '${this.escapeHtml(file.filename)}')" 
                                class="btn" style="background: #007bff; padding: 0.5rem 1rem; font-size: 0.9rem;">
                            ${this.currentFileCategory === 'CONFIDENTIAL' ? 'View' : 'Download'}
                        </button>
                        <button onclick="app.deleteFile(${file.id}, '${this.escapeHtml(file.filename)}')" 
                                class="btn" style="background: #dc3545; padding: 0.5rem 1rem; font-size: 0.9rem;">
                            Delete
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            filesList.innerHTML = `
                <div style="text-align: center; color: #666; margin: 3rem 0;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">${this.getFileIcon(this.currentFileCategory)}</div>
                    <p>No ${this.currentFileCategory.toLowerCase()} files uploaded yet.</p>
                    <p style="font-size: 0.9rem;">Use the upload form above to add your first file.</p>
                </div>
            `;
        }
    }

    getFileIcon(category) {
        const icons = {
            'DOCUMENTS': '📄',
            'IMAGES': '🖼️',
            'CONFIDENTIAL': '🔒'
        };
        return icons[category] || '📁';
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

        if (modal && modalFileName && modalFileContent) {
            modalFileName.textContent = filename;
            modalFileContent.textContent = content;
            
            if (modalFileEditor) {
                modalFileEditor.value = content;
            }
            
            // Show/hide buttons based on file category
            if (this.currentFileCategory === 'CONFIDENTIAL') {
                // For confidential files: show edit button, hide download button
                if (editFileBtn) {
                    editFileBtn.classList.remove('hidden');
                    console.log('Showing edit button for confidential file');
                }
                if (downloadFileBtn) {
                    downloadFileBtn.classList.add('hidden');
                    console.log('Hiding download button for confidential file');
                }
            } else {
                // For non-confidential files: hide edit button, show download button
                if (editFileBtn) {
                    editFileBtn.classList.add('hidden');
                    console.log('Hiding edit button for non-confidential file');
                }
                if (downloadFileBtn) {
                    downloadFileBtn.classList.remove('hidden');
                    console.log('Showing download button for non-confidential file');
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
                mfaCode = await this.promptMFAForOperation('update this confidential file');
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
                const additionalMfaCode = await this.promptMFAForOperation(`save this file (${anomalyMessage})`);
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
        
        const mfaStatus = this.user.mfa_enabled ? 
            '<span style="color: #28a745;">✓ Enabled</span>' : 
            '<span style="color: #dc3545;">✗ Disabled</span>';
        
        content.innerHTML = `
            <div style="max-width: 600px;">
                <div style="background: white; border-radius: 15px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
                    <h3 style="margin-bottom: 1.5rem; color: #333;">Profile Information</h3>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Full Name</label>
                        <p style="color: #666; margin: 0.5rem 0;">${this.user.firstName} ${this.user.lastName}</p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Email Address</label>
                        <p style="color: #666; margin: 0.5rem 0;">${this.user.email}</p>
                    </div>
                    
                    <div style="margin-bottom: 1rem;">
                        <label style="font-weight: 500; color: #333;">Role</label>
                        <p style="color: #666; margin: 0.5rem 0;"><strong>${this.user.role}</strong></p>
                    </div>
                    
                    <div style="margin-bottom: 2rem;">
                        <label style="font-weight: 500; color: #333;">Account Status</label>
                        <p style="color: #666; margin: 0.5rem 0;"><strong>${this.user.status || 'APPROVED'}</strong></p>
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

    async loadAdmin() {
        if (!['ADMIN', 'MANAGER'].includes(this.user?.role)) {
            document.getElementById('admin-content').innerHTML = '<p style="text-align: center; color: #dc3545;">Access denied. Administrator privileges required.</p>';
            return;
        }

        // Load dashboard by default
        this.switchAdminTab('dashboard');
        
        // Setup admin event listeners if not already done
        this.setupAdminEventListeners();
    }

    switchAdminTab(tabName) {
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
        }

        // Hide all admin tab content
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // Show selected tab content
        const selectedContent = document.getElementById(`admin-${tabName}`);
        if (selectedContent) {
            selectedContent.classList.remove('hidden');
        }

        // Load content based on tab
        switch (tabName) {
            case 'dashboard':
                this.loadAdminDashboard();
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
                            if (fileGroup.category === 'confidential') {
                                encryptedFiles += fileGroup.count;
                            }
                        });
                    }
                    
                    // Update dashboard stats
                    document.getElementById('totalUsers').textContent = totalUsers;
                    document.getElementById('pendingUsers').textContent = pendingUsers;
                    document.getElementById('totalFiles').textContent = totalFiles;
                    document.getElementById('encryptedFiles').textContent = encryptedFiles;

                    // Load recent activity
                    this.displayRecentActivity(data.statistics.recentActivity || []);
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

    displayRecentActivity(activities) {
        const container = document.getElementById('recentActivity');
        
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
                            <th style="padding: 1rem; text-align: left; color: #333;">Last Login</th>
                            <th style="padding: 1rem; text-align: center; color: #333;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => `
                            <tr style="border-bottom: 1px solid #e9ecef;">
                                <td style="padding: 1rem;">
                                    <strong>${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}</strong>
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
                                <td style="padding: 1rem; color: #666;">
                                    ${user.lastLogin ? this.formatDate(user.lastLogin) : 'Never'}
                                </td>
                                <td style="padding: 1rem; text-align: center;">
                                    <button onclick="app.openRoleModal(${user.id}, '${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}', '${user.role}')" 
                                            class="btn" style="background: #007bff; padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-right: 0.5rem;">
                                        Change Role
                                    </button>
                                    ${user.status === 'APPROVED' ? 
                                        `<button onclick="app.revokeUser(${user.id}, '${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}')" 
                                                 class="btn" style="background: #dc3545; padding: 0.25rem 0.75rem; font-size: 0.8rem;">
                                            Revoke
                                         </button>` : ''}
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
                                    <strong>${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}</strong>
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
                                    <button onclick="app.approveUser(${user.id}, '${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}')" 
                                            class="btn" style="background: #28a745; padding: 0.25rem 0.75rem; font-size: 0.8rem; margin-right: 0.5rem;">
                                        Approve
                                    </button>
                                    <button onclick="app.rejectUser(${user.id}, '${this.escapeHtml(user.firstName)} ${this.escapeHtml(user.lastName)}')" 
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
                    <h3 style="margin-bottom: 1rem;">Real-Time Security Analytics</h3>
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
                            🔄 Refresh
                        </button>
                    </div>
                </div>

                <!-- Real-time Activity Monitor -->
                <div class="activity-monitor" style="background: white; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 2rem; overflow: hidden;">
                    <div style="background: #343a40; color: white; padding: 1rem; font-weight: bold;">
                        📊 Real-Time Activity Log Monitor
                        <span style="float: right; font-size: 0.9rem; opacity: 0.8;">Auto-refreshes every 30s</span>
                    </div>
                    <div id="activityLogContainer" style="max-height: 400px; overflow-y: auto;">
                        ${this.renderActivityLogs(logsData.logs || [])}
                    </div>
                </div>

                <!-- Endpoint Usage Visualization -->
                <div class="endpoint-visualization" style="background: white; border: 1px solid #ddd; border-radius: 10px; margin-bottom: 2rem;">
                    <div style="background: #495057; color: white; padding: 1rem; font-weight: bold;">
                        📈 Endpoint Usage Analytics
                    </div>
                    <div style="padding: 1rem;">
                        ${this.renderEndpointUsageChart(logsData.logs || [])}
                    </div>
                </div>

                <!-- Security Events & Anomalies -->
                <div class="security-events" style="background: white; border: 1px solid #ddd; border-radius: 10px;">
                    <div style="background: #dc3545; color: white; padding: 1rem; font-weight: bold;">
                        🔒 Security Events & Anomalies
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
