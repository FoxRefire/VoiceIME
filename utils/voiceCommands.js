// Voice command matching and execution
export class VoiceCommandMatcher {
    constructor() {
        this.commands = [];
    }

    async loadCommands() {
        try {
            const result = await chrome.storage.local.get('voiceCommands');
            this.commands = result.voiceCommands || [];
        } catch (error) {
            console.error('Failed to load voice commands:', error);
            this.commands = [];
        }
    }

    // Normalize text by removing spaces and converting to lowercase
    normalizeText(text) {
        return text.replace(/\s+/g, '').toLowerCase();
    }

    // Check if a pattern matches the text (ignoring spaces)
    matchesPattern(pattern, text) {
        console.log('Matching pattern:', pattern, 'against text:', text);
        
        // Normalize both pattern and text by removing spaces for matching
        const normalizedPattern = this.normalizeText(pattern);
        const normalizedText = this.normalizeText(text);
        
        // Check if pattern contains {remaining} placeholder
        if (pattern.includes('{remaining}')) {
            // Extract the prefix before {remaining}
            const prefix = pattern.split('{remaining}')[0].trim();
            const normalizedPrefix = this.normalizeText(prefix);
            
            console.log('Pattern has {remaining}, prefix:', prefix, 'normalized:', normalizedPrefix);
            console.log('Text normalized:', normalizedText);
            
            // Check if text starts with the prefix (ignoring spaces and case)
            if (normalizedText.startsWith(normalizedPrefix)) {
                console.log('Prefix matches! Extracting remaining text...');
                
                // Use word-by-word matching - most reliable method
                const prefixWords = prefix.split(/\s+/).filter(w => w.length > 0);
                const textWords = text.split(/\s+/).filter(w => w.length > 0);
                
                console.log('Prefix words:', prefixWords);
                console.log('Text words:', textWords);
                
                // Match prefix words sequentially (case-insensitive)
                let wordIndex = 0;
                let lastMatchedIndex = -1;
                
                for (let i = 0; i < textWords.length && wordIndex < prefixWords.length; i++) {
                    if (textWords[i].toLowerCase() === prefixWords[wordIndex].toLowerCase()) {
                        wordIndex++;
                        lastMatchedIndex = i;
                    }
                }
                
                // If all prefix words matched, extract remaining
                if (wordIndex === prefixWords.length && lastMatchedIndex >= 0) {
                    const remainingWords = textWords.slice(lastMatchedIndex + 1);
                    if (remainingWords.length > 0) {
                        const remainingText = remainingWords.join(' ');
                        console.log('Extracted remaining (word-based):', remainingText);
                        return { matched: true, params: { remaining: remainingText } };
                    } else {
                        // No remaining text, but pattern matched
                        console.log('Pattern matched but no remaining text');
                        return { matched: true, params: { remaining: '' } };
                    }
                } else {
                    console.log('Prefix words did not match completely. Matched:', wordIndex, 'of', prefixWords.length);
                }
            } else {
                console.log('Prefix does not match');
            }
        }
        
        // Check for exact match (ignoring spaces)
        if (normalizedText === normalizedPattern) {
            return { matched: true, params: {} };
        }
        
        // Check if text starts with pattern (for commands without parameters)
        // But if the command action contains {remaining}, try to extract it
        if (normalizedText.startsWith(normalizedPattern)) {
            // Check if any command using this pattern has {remaining} in action
            // We'll handle this in findMatch instead
            return { matched: true, params: {} };
        }
        
        // Check if pattern contains other parameter placeholders
        const paramRegex = /\{(\w+)\}/g;
        const paramNames = [];
        let match;
        while ((match = paramRegex.exec(pattern)) !== null) {
            paramNames.push(match[1]);
        }
        
        // If pattern has parameters, try to extract them
        if (paramNames.length > 0) {
            // Create regex from pattern (allow spaces between words)
            let regexPattern = pattern.replace(/\s+/g, '\\s*');
            regexPattern = regexPattern.replace(/\{(\w+)\}/g, '(.+?)');
            regexPattern = '^' + regexPattern + '$';
            
            const regex = new RegExp(regexPattern, 'i');
            const match = text.match(regex);
            
            if (match) {
                const extractedParams = {};
                paramNames.forEach((name, index) => {
                    extractedParams[name] = match[index + 1] ? match[index + 1].trim() : '';
                });
                return { matched: true, params: extractedParams };
            }
        }
        
        return { matched: false, params: {} };
    }

    // Find matching command for text
    findMatch(text) {
        console.log('findMatch called with text:', text);
        for (const command of this.commands) {
            if (!command.enabled) continue;
            
            console.log('Checking command:', command.name);
            // Check if command action needs {remaining} parameter
            const needsRemaining = command.action && command.action.includes('{remaining}');
            console.log('Command needs remaining:', needsRemaining);
            
            for (const pattern of command.patterns) {
                console.log('Checking pattern:', pattern);
                const result = this.matchesPattern(pattern, text);
                console.log('Match result:', result);
                
                if (result.matched) {
                    console.log('Pattern matched! Params before extraction:', result.params);
                    
                    // If pattern doesn't have {remaining} but action needs it, extract remaining
                    if (needsRemaining && !result.params.remaining) {
                        console.log('Extracting remaining text for pattern without {remaining}...');
                        // Pattern matched but we need to extract remaining text
                        const normalizedPattern = this.normalizeText(pattern);
                        const normalizedText = this.normalizeText(text);
                        
                        console.log('Normalized pattern:', normalizedPattern);
                        console.log('Normalized text:', normalizedText);
                        
                        if (normalizedText.startsWith(normalizedPattern)) {
                            console.log('Normalized text starts with pattern, extracting remaining...');
                            
                            // Calculate how many characters the normalized pattern takes
                            // Then find the corresponding position in the original text
                            const patternLength = normalizedPattern.length;
                            let charCount = 0;
                            let textIndex = 0;
                            
                            // Count characters in original text (ignoring spaces) until we match pattern length
                            for (let i = 0; i < text.length && charCount < patternLength; i++) {
                                if (!text[i].match(/\s/)) {
                                    charCount++;
                                }
                                textIndex = i + 1;
                            }
                            
                            // Extract remaining text after the matched prefix
                            const remainingText = text.substring(textIndex).trim();
                            console.log('Extracted remaining (char-based):', remainingText);
                            
                            if (remainingText) {
                                result.params.remaining = remainingText;
                            } else {
                                // Fallback: try word-based matching
                                const patternWords = pattern.split(/\s+/).filter(w => w.length > 0);
                                const textWords = text.split(/\s+/).filter(w => w.length > 0);
                                
                                console.log('Pattern words:', patternWords);
                                console.log('Text words:', textWords);
                                
                                let wordIndex = 0;
                                let lastMatchedIndex = -1;
                                
                                for (let i = 0; i < textWords.length && wordIndex < patternWords.length; i++) {
                                    const patternWord = patternWords[wordIndex].toLowerCase();
                                    const textWord = textWords[i].toLowerCase();
                                    console.log(`Comparing: "${textWord}" === "${patternWord}"`);
                                    
                                    // Check if text word matches pattern word (exact or contains)
                                    // Handle cases like "チャット" matching "チャットGPT" or vice versa
                                    if (textWord === patternWord || 
                                        textWord.includes(patternWord) || 
                                        patternWord.includes(textWord)) {
                                        wordIndex++;
                                        lastMatchedIndex = i;
                                        console.log(`Matched! wordIndex: ${wordIndex}, lastMatchedIndex: ${lastMatchedIndex}`);
                                    }
                                }
                                
                                console.log(`Final: wordIndex=${wordIndex}, patternWords.length=${patternWords.length}, lastMatchedIndex=${lastMatchedIndex}`);
                                
                                if (wordIndex === patternWords.length && lastMatchedIndex >= 0) {
                                    const remainingWords = textWords.slice(lastMatchedIndex + 1);
                                    console.log('Remaining words:', remainingWords);
                                    if (remainingWords.length > 0) {
                                        const remainingText = remainingWords.join(' ');
                                        console.log('Extracted remaining (word-based):', remainingText);
                                        result.params.remaining = remainingText;
                                    }
                                }
                            }
                        } else {
                            console.log('Normalized text does not start with pattern');
                        }
                    }
                    
                    console.log('Final params:', result.params);
                    return {
                        command: command,
                        pattern: pattern,
                        params: result.params
                    };
                }
            }
        }
        console.log('No match found');
        return null;
    }

    // Execute a matched command
    async executeCommand(match) {
        const { command, params } = match;
        
        console.log('Executing command:', command);
        console.log('Params:', params);
        
        try {
            if (command.type === 'url') {
                // Execute URL command
                let url = command.action;
                console.log('Original URL:', url);
                
                // Replace parameters in URL
                Object.keys(params).forEach(key => {
                    const value = encodeURIComponent(params[key]);
                    console.log(`Replacing {${key}} with:`, value);
                    url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
                });
                
                // Replace {remaining} with the remaining text (if not already replaced)
                if (params.remaining && url.includes('{remaining}')) {
                    const encoded = encodeURIComponent(params.remaining);
                    console.log('Replacing {remaining} with:', encoded);
                    url = url.replace(/\{remaining\}/g, encoded);
                }
                
                console.log('Final URL:', url);
                
                // Open URL in new tab
                const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                await chrome.tabs.create({
                    url: url,
                    index: currentTab ? currentTab.index + 1 : undefined
                });
                
                return { success: true, message: `Opened: ${url}` };
            } else if (command.type === 'javascript') {
                // Execute JavaScript command
                let code = command.action;
                
                // Replace parameters in code
                Object.keys(params).forEach(key => {
                    const value = JSON.stringify(params[key]);
                    code = code.replace(`{${key}}`, value);
                });
                
                // Replace {remaining} with the remaining text
                if (params.remaining) {
                    code = code.replace('{remaining}', JSON.stringify(params.remaining));
                }
                
                // Execute in background script context
                const result = await chrome.runtime.sendMessage({
                    action: 'executeScript',
                    code: code
                });
                
                return { success: true, message: result?.message || 'Command executed' };
            }
        } catch (error) {
            console.error('Error executing voice command:', error);
            return { success: false, error: error.message };
        }
    }
}

