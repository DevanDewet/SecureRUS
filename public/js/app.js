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

        // Show upload progress
        this.showUploadProgress();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', this.currentFileCategory);
        formData.append('action', 'create');

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
                // For confidential files, get content via API
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

            if (this.currentFileCategory === 'CONFIDENTIAL') {
                // For confidential files, get content via API
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
                        // For confidential files, create downloadable content
                        const blob = new Blob([data.content], { type: 'text/plain' });
                        this.triggerDownload(blob, filename);
                    } else {
                        this.showError('Failed to download file');
                    }
                } else {
                    const errorData = await response.json();
                    this.showError(errorData.message || 'Failed to download file');
                }
            } else {
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

        try {
            console.log(`Deleting file: ${filename} (ID: ${fileId})`);

            const response = await fetch(`${this.baseURL}/files/${this.currentFileCategory.toLowerCase()}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    action: 'delete',
                    category: this.currentFileCategory.toUpperCase(),
                    fileId: fileId
                })
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

        if (modal && modalFileName && modalFileContent) {
            modalFileName.textContent = filename;
            modalFileContent.textContent = content;
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
