// Settings page functionality
class SettingsManager {
    constructor() {
        this.searchEngines = {
            duckduckgo: {
                name: 'DuckDuckGo',
                url: 'https://duckduckgo.com/?t=ffab&q=',
                icon: '🔍'
            },
            google: {
                name: 'Google',
                url: 'https://www.google.com/search?q=',
                icon: '🔍'
            },
            bing: {
                name: 'Bing',
                url: 'https://www.bing.com/search?q=',
                icon: '🔍'
            },
            yahoo: {
                name: 'Yahoo',
                url: 'https://search.yahoo.com/search?p=',
                icon: '🔍'
            }
        };
        
        this.languages = {};
        this.selectedLanguage = '';
        this.isDropdownOpen = false;
        this.voiceCommands = [];
        this.editingCommandIndex = null;
        
        // Don't call init() here, wait for DOM
    }
    
    async init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        await this.loadLanguages();
        await this.loadSettings();
        this.setupEventListeners();
    }
    
    async loadLanguages() {
        try {
            const response = await fetch('/languages.json');
            this.languages = await response.json();
            
            this.populateLanguageOptions();
        } catch (error) {
            console.error('Failed to load languages:', error);
        }
    }
    
    populateLanguageOptions() {
        const languageOptions = document.getElementById('languageOptions');
        
        // Clear existing options except the first one
        languageOptions.innerHTML = '<div class="dropdown-option" data-value=""><span class="option-text">Auto (browser language)</span></div>';
        
        // Add language options
        for (const [code, name] of Object.entries(this.languages)) {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.value = code;
            option.innerHTML = `<span class="option-text">${name}</span>`;
            languageOptions.appendChild(option);
        }
    }
    
    async loadSettings() {
        try {
            // Load language setting
            const languageResult = await chrome.storage.local.get('language');
            this.selectedLanguage = languageResult.language || '';
            this.updateLanguageDisplay();
            
            // Load auto-search setting
            const autoSearchResult = await chrome.storage.local.get('autoSearch');
            const autoSearchCheckbox = document.getElementById('autoSearch');
            autoSearchCheckbox.checked = autoSearchResult.autoSearch !== false; // Default to true
            
            // Load search engine setting
            const searchEngineResult = await chrome.storage.local.get('searchEngine');
            const selectedEngine = searchEngineResult.searchEngine || 'duckduckgo';
            
            // Update radio buttons
            const radioButtons = document.querySelectorAll('input[name="searchEngine"]');
            radioButtons.forEach(radio => {
                radio.checked = radio.value === selectedEngine;
            });
            
            // Update visual selection
            this.updateSearchEngineSelection(selectedEngine);
            
            // Load RMS threshold setting
            const rmsThresholdResult = await chrome.storage.local.get('rmsThreshold');
            const rmsThresholdInput = document.getElementById('rmsThreshold');
            rmsThresholdInput.value = rmsThresholdResult.rmsThreshold || 5;
            
            // Load play start sound setting
            const playStartSoundResult = await chrome.storage.local.get('playStartSound');
            const playStartSoundCheckbox = document.getElementById('playStartSound');
            playStartSoundCheckbox.checked = playStartSoundResult.playStartSound !== false; // Default to true
            
            // Load voice commands
            await this.loadVoiceCommands();
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async loadVoiceCommands() {
        try {
            const result = await chrome.storage.local.get('voiceCommands');
            this.voiceCommands = result.voiceCommands || [];
            this.renderVoiceCommands();
        } catch (error) {
            console.error('Failed to load voice commands:', error);
            this.voiceCommands = [];
        }
    }
    
    renderVoiceCommands() {
        const list = document.getElementById('voiceCommandsList');
        if (!list) return;
        
        if (this.voiceCommands.length === 0) {
            list.innerHTML = '<p style="color: #666; font-style: italic; text-align: center; padding: 20px;">No voice commands configured. Click "Add Voice Command" to create one.</p>';
            return;
        }
        
        list.innerHTML = this.voiceCommands.map((cmd, index) => {
            const patternsText = cmd.patterns.map(p => `<code>${p}</code>`).join(', ');
            const actionPreview = cmd.type === 'url' 
                ? `<span style="color: #667eea;">${cmd.action}</span>`
                : `<span style="color: #f39c12;">JavaScript code</span>`;
            
            return `
                <div class="voice-command-item ${cmd.enabled === false ? 'disabled' : ''}" data-index="${index}">
                    <div class="voice-command-header">
                        <div class="voice-command-name">${cmd.name || 'Unnamed Command'}</div>
                        <div class="voice-command-actions">
                            <button class="voice-command-btn" data-action="edit" data-index="${index}">Edit</button>
                            <button class="voice-command-btn danger" data-action="delete" data-index="${index}">Delete</button>
                        </div>
                    </div>
                    <div class="voice-command-patterns">
                        <strong>Patterns:</strong> ${patternsText}
                    </div>
                    <div class="voice-command-patterns">
                        <strong>Action:</strong> ${actionPreview}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners to buttons using event delegation
        list.addEventListener('click', (e) => {
            const button = e.target.closest('.voice-command-btn');
            if (!button) return;
            
            const action = button.dataset.action;
            const index = parseInt(button.dataset.index);
            
            if (action === 'edit') {
                this.editVoiceCommand(index);
            } else if (action === 'delete') {
                this.deleteVoiceCommand(index);
            }
        });
    }
    
    updateLanguageDisplay() {
        const selectedLanguageText = document.getElementById('selectedLanguage');
        if (this.selectedLanguage === '') {
            selectedLanguageText.textContent = 'Auto (browser language)';
        } else {
            selectedLanguageText.textContent = this.languages[this.selectedLanguage] || 'Unknown Language';
        }
        
        // Update selected state in dropdown
        const options = document.querySelectorAll('.dropdown-option');
        options.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.value === this.selectedLanguage) {
                option.classList.add('selected');
            }
        });
    }
    
    setupEventListeners() {
        // Language dropdown
        this.setupLanguageDropdown();
        
        // Auto-search toggle
        document.getElementById('autoSearch').addEventListener('change', (e) => {
            this.saveAutoSearch(e.target.checked);
        });
        
        // RMS threshold input
        document.getElementById('rmsThreshold').addEventListener('change', (e) => {
            this.saveRmsThreshold(parseFloat(e.target.value));
        });
        
        // Play start sound toggle
        document.getElementById('playStartSound').addEventListener('change', (e) => {
            this.savePlayStartSound(e.target.checked);
        });
        
        // Search engine selection
        const searchEngineItems = document.querySelectorAll('.search-engine-item');
        searchEngineItems.forEach(item => {
            item.addEventListener('click', () => {
                const engine = item.dataset.engine;
                this.selectSearchEngine(engine);
            });
        });
        
        // Radio button changes
        const radioButtons = document.querySelectorAll('input[name="searchEngine"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectSearchEngine(e.target.value);
                }
            });
        });
        
        // Back button
        document.getElementById('backButton').addEventListener('click', () => {
            window.close();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.searchable-dropdown')) {
                this.closeDropdown();
            }
        });
        
        // Voice command management
        this.setupVoiceCommandListeners();
    }
    
    setupVoiceCommandListeners() {
        // Add voice command button
        const addBtn = document.getElementById('addVoiceCommand');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.openVoiceCommandModal();
            });
        }
        
        // Voice command modal
        const modal = document.getElementById('voiceCommandModal');
        const closeBtn = document.getElementById('voiceCommandModalClose');
        const cancelBtn = document.getElementById('voiceCommandCancel');
        const saveBtn = document.getElementById('voiceCommandSave');
        const typeSelect = document.getElementById('voiceCommandType');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeVoiceCommandModal());
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeVoiceCommandModal());
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveVoiceCommand());
        }
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                const urlContainer = document.getElementById('voiceCommandUrlContainer');
                const jsContainer = document.getElementById('voiceCommandJsContainer');
                if (e.target.value === 'url') {
                    urlContainer.style.display = 'block';
                    jsContainer.style.display = 'none';
                } else {
                    urlContainer.style.display = 'none';
                    jsContainer.style.display = 'block';
                }
            });
        }
        
        // Close modal when clicking outside
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeVoiceCommandModal();
                }
            });
        }
    }
    
    openVoiceCommandModal(commandIndex = null) {
        const modal = document.getElementById('voiceCommandModal');
        const title = document.getElementById('voiceCommandModalTitle');
        const nameInput = document.getElementById('voiceCommandName');
        const patternsInput = document.getElementById('voiceCommandPatterns');
        const typeSelect = document.getElementById('voiceCommandType');
        const urlInput = document.getElementById('voiceCommandUrl');
        const jsInput = document.getElementById('voiceCommandJs');
        const enabledInput = document.getElementById('voiceCommandEnabled');
        
        if (commandIndex !== null && this.voiceCommands[commandIndex]) {
            // Edit mode
            const cmd = this.voiceCommands[commandIndex];
            title.textContent = 'Edit Voice Command';
            nameInput.value = cmd.name || '';
            patternsInput.value = cmd.patterns.join('\n');
            typeSelect.value = cmd.type || 'url';
            urlInput.value = cmd.type === 'url' ? (cmd.action || '') : '';
            jsInput.value = cmd.type === 'javascript' ? (cmd.action || '') : '';
            enabledInput.checked = cmd.enabled !== false;
            this.editingCommandIndex = commandIndex;
            
            // Trigger type change to show/hide containers
            typeSelect.dispatchEvent(new Event('change'));
        } else {
            // Add mode
            title.textContent = 'Add Voice Command';
            nameInput.value = '';
            patternsInput.value = '';
            typeSelect.value = 'url';
            urlInput.value = '';
            jsInput.value = '';
            enabledInput.checked = true;
            this.editingCommandIndex = null;
            
            // Trigger type change to show/hide containers
            typeSelect.dispatchEvent(new Event('change'));
        }
        
        modal.classList.add('active');
    }
    
    closeVoiceCommandModal() {
        const modal = document.getElementById('voiceCommandModal');
        modal.classList.remove('active');
        this.editingCommandIndex = null;
    }
    
    async saveVoiceCommand() {
        const nameInput = document.getElementById('voiceCommandName');
        const patternsInput = document.getElementById('voiceCommandPatterns');
        const typeSelect = document.getElementById('voiceCommandType');
        const urlInput = document.getElementById('voiceCommandUrl');
        const jsInput = document.getElementById('voiceCommandJs');
        const enabledInput = document.getElementById('voiceCommandEnabled');
        
        const name = nameInput.value.trim();
        const patterns = patternsInput.value.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        const type = typeSelect.value;
        const action = type === 'url' ? urlInput.value.trim() : jsInput.value.trim();
        const enabled = enabledInput.checked;
        
        // Validation
        if (!name) {
            alert('Please enter a command name');
            return;
        }
        if (patterns.length === 0) {
            alert('Please enter at least one voice pattern');
            return;
        }
        if (!action) {
            alert(`Please enter a ${type === 'url' ? 'URL' : 'JavaScript code'}`);
            return;
        }
        
        const command = {
            name,
            patterns,
            type,
            action,
            enabled
        };
        
        if (this.editingCommandIndex !== null) {
            // Update existing command
            this.voiceCommands[this.editingCommandIndex] = command;
        } else {
            // Add new command
            this.voiceCommands.push(command);
        }
        
        // Save to storage
        try {
            await chrome.storage.local.set({ voiceCommands: this.voiceCommands });
            this.showSaveIndicator();
            this.renderVoiceCommands();
            this.closeVoiceCommandModal();
        } catch (error) {
            console.error('Failed to save voice command:', error);
            alert('Failed to save voice command');
        }
    }
    
    editVoiceCommand(index) {
        this.openVoiceCommandModal(index);
    }
    
    async deleteVoiceCommand(index) {
        if (!confirm('Are you sure you want to delete this voice command?')) {
            return;
        }
        
        this.voiceCommands.splice(index, 1);
        
        try {
            await chrome.storage.local.set({ voiceCommands: this.voiceCommands });
            this.showSaveIndicator();
            this.renderVoiceCommands();
        } catch (error) {
            console.error('Failed to delete voice command:', error);
            alert('Failed to delete voice command');
        }
    }
    
    setupLanguageDropdown() {
        const trigger = document.getElementById('languageTrigger');
        const dropdown = document.getElementById('languageDropdown');
        const searchInput = document.getElementById('languageSearch');
        
        // Check if elements exist
        if (!trigger || !dropdown || !searchInput) {
            console.error('Language dropdown elements not found');
            return;
        }
        
        // Toggle dropdown
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
        
        // Search functionality
        searchInput.addEventListener('input', (e) => {
            this.filterLanguages(e.target.value);
        });
        
        // Option selection
        dropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.dropdown-option');
            if (option) {
                this.selectLanguage(option.dataset.value);
                this.closeDropdown();
            }
        });
        
        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            this.handleKeyboardNavigation(e);
        });
    }
    
    toggleDropdown() {
        const trigger = document.getElementById('languageTrigger');
        const dropdown = document.getElementById('languageDropdown');
        const searchInput = document.getElementById('languageSearch');
        
        // Check if elements exist
        if (!trigger || !dropdown || !searchInput) {
            console.error('Language dropdown elements not found in toggleDropdown');
            return;
        }
        
        this.isDropdownOpen = !this.isDropdownOpen;
        
        if (this.isDropdownOpen) {
            trigger.classList.add('active');
            dropdown.classList.add('active');
            
            // Force display with inline styles as backup
            dropdown.style.display = 'block';
            dropdown.style.visibility = 'visible';
            dropdown.style.opacity = '1';
            dropdown.style.transform = 'translateY(0)';
            
            searchInput.focus();
        } else {
            this.closeDropdown();
        }
    }
    
    closeDropdown() {
        const trigger = document.getElementById('languageTrigger');
        const dropdown = document.getElementById('languageDropdown');
        const searchInput = document.getElementById('languageSearch');
        
        // Check if elements exist
        if (!trigger || !dropdown || !searchInput) {
            console.error('Language dropdown elements not found in closeDropdown');
            return;
        }
        
        this.isDropdownOpen = false;
        trigger.classList.remove('active');
        dropdown.classList.remove('active');
        
        // Force hide with inline styles
        dropdown.style.display = 'none';
        dropdown.style.visibility = 'hidden';
        dropdown.style.opacity = '0';
        dropdown.style.transform = 'translateY(-10px)';
        
        searchInput.value = '';
        this.filterLanguages(''); // Reset filter
    }
    
    filterLanguages(searchTerm) {
        const options = document.querySelectorAll('.dropdown-option');
        const searchLower = searchTerm.toLowerCase();
        let hasResults = false;
        
        options.forEach(option => {
            const text = option.querySelector('.option-text').textContent.toLowerCase();
            const matches = text.includes(searchLower);
            
            option.style.display = matches ? 'block' : 'none';
            if (matches) hasResults = true;
        });
        
        // Show "no results" message if needed
        let noResults = document.querySelector('.no-results');
        if (!hasResults && searchTerm.length > 0) {
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = 'No languages found';
                document.getElementById('languageOptions').appendChild(noResults);
            }
            noResults.style.display = 'block';
        } else if (noResults) {
            noResults.style.display = 'none';
        }
    }
    
    selectLanguage(languageCode) {
        this.selectedLanguage = languageCode;
        this.updateLanguageDisplay();
        this.saveLanguage(languageCode);
    }
    
    handleKeyboardNavigation(e) {
        const options = Array.from(document.querySelectorAll('.dropdown-option:not([style*="display: none"])'));
        const currentIndex = options.findIndex(option => option.classList.contains('highlighted'));
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
                this.highlightOption(options, nextIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
                this.highlightOption(options, prevIndex);
                break;
            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0) {
                    this.selectLanguage(options[currentIndex].dataset.value);
                    this.closeDropdown();
                }
                break;
            case 'Escape':
                this.closeDropdown();
                break;
        }
    }
    
    highlightOption(options, index) {
        options.forEach(option => option.classList.remove('highlighted'));
        if (options[index]) {
            options[index].classList.add('highlighted');
            options[index].scrollIntoView({ block: 'nearest' });
        }
    }
    
    async saveLanguage(language) {
        try {
            await chrome.storage.local.set({ language: language });
            this.showSaveIndicator();
        } catch (error) {
            console.error('Failed to save language:', error);
        }
    }
    
    async saveAutoSearch(enabled) {
        try {
            await chrome.storage.local.set({ autoSearch: enabled });
            this.showSaveIndicator();
        } catch (error) {
            console.error('Failed to save auto-search setting:', error);
        }
    }
    
    async saveRmsThreshold(threshold) {
        try {
            await chrome.storage.local.set({ rmsThreshold: threshold });
            this.showSaveIndicator();
        } catch (error) {
            console.error('Failed to save RMS threshold:', error);
        }
    }
    
    async savePlayStartSound(enabled) {
        try {
            await chrome.storage.local.set({ playStartSound: enabled });
            this.showSaveIndicator();
        } catch (error) {
            console.error('Failed to save play start sound setting:', error);
        }
    }
    
    async selectSearchEngine(engine) {
        try {
            // Update radio button
            const radioButton = document.querySelector(`input[value="${engine}"]`);
            if (radioButton) {
                radioButton.checked = true;
            }
            
            // Update visual selection
            this.updateSearchEngineSelection(engine);
            
            // Save to storage
            await chrome.storage.local.set({ searchEngine: engine });
            this.showSaveIndicator();
            
        } catch (error) {
            console.error('Failed to save search engine:', error);
        }
    }
    
    updateSearchEngineSelection(selectedEngine) {
        const searchEngineItems = document.querySelectorAll('.search-engine-item');
        searchEngineItems.forEach(item => {
            if (item.dataset.engine === selectedEngine) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    showSaveIndicator() {
        // Create or update save indicator
        let indicator = document.querySelector('.status-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'status-indicator saved';
            document.querySelector('.settings-header h1').appendChild(indicator);
        }
        
        indicator.className = 'status-indicator saved';
        
        // Hide after 2 seconds
        setTimeout(() => {
            if (indicator) {
                indicator.style.opacity = '0';
                setTimeout(() => {
                    if (indicator && indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 300);
            }
        }, 2000);
    }
}

// Initialize settings manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const settingsManager = new SettingsManager();
    settingsManager.init();
});

// Initialize settings manager when DOM is ready
let settingsManager;
document.addEventListener('DOMContentLoaded', () => {
    settingsManager = new SettingsManager();
    settingsManager.init();
    // Make it globally accessible for inline onclick handlers
    window.settingsManager = settingsManager;
});

// Export for potential use by other scripts
export { SettingsManager };
