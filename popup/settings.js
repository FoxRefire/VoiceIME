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
        
        this.init();
    }
    
    async init() {
        await this.loadLanguages();
        await this.loadSettings();
        this.setupEventListeners();
    }
    
    async loadLanguages() {
        try {
            const response = await fetch('/languages.json');
            const languages = await response.json();
            
            const languageSelect = document.getElementById('language');
            
            // Clear existing options except the first one
            languageSelect.innerHTML = '<option value="">Auto (browser language)</option>';
            
            // Add language options
            for (const [code, name] of Object.entries(languages)) {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = name;
                languageSelect.appendChild(option);
            }
        } catch (error) {
            console.error('Failed to load languages:', error);
        }
    }
    
    async loadSettings() {
        try {
            // Load language setting
            const languageResult = await chrome.storage.local.get('language');
            const languageSelect = document.getElementById('language');
            if (languageResult.language) {
                languageSelect.value = languageResult.language;
            }
            
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
            
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    setupEventListeners() {
        // Language change
        document.getElementById('language').addEventListener('change', (e) => {
            this.saveLanguage(e.target.value);
        });
        
        // Auto-search toggle
        document.getElementById('autoSearch').addEventListener('change', (e) => {
            this.saveAutoSearch(e.target.checked);
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

// Initialize settings manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
});

// Export for potential use by other scripts
export { SettingsManager };
