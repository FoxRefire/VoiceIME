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
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
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

// Export for potential use by other scripts
export { SettingsManager };
