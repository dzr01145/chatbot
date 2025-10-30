// API Base URL
const API_BASE = window.location.origin;

// Conversation history
let conversationHistory = [];
let currentProvider = null;
let selectedModel = 'gemini-2.5-pro';
let availableGeminiModels = ['gemini-2.5-pro', 'gemini-2.5-flash'];

document.addEventListener('DOMContentLoaded', () => {
    setupInputHandlers();
    setupModelSelector();
    checkApiHealth();
});

// Setup input handlers
function setupInputHandlers() {
    const input = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');

    // Auto-resize textarea
    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Send on Enter (Shift+Enter for new line)
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function setupModelSelector() {
    const select = document.getElementById('modelSelect');
    if (!select) {
        return;
    }

    select.addEventListener('change', (event) => {
        selectedModel = event.target.value;
    });
}

function updateModelSelector(healthData) {
    const container = document.getElementById('modelSelectContainer');
    const select = document.getElementById('modelSelect');

    if (!container || !select) {
        return;
    }

    if (healthData.provider !== 'google') {
        container.style.display = 'none';
        selectedModel = '';
        return;
    }

    container.style.display = '';

    const models = Array.isArray(healthData.allowedModels) && healthData.allowedModels.length > 0
        ? healthData.allowedModels
        : availableGeminiModels;

    availableGeminiModels = models.slice();
    select.innerHTML = '';

    models.forEach(modelName => {
        const option = document.createElement('option');
        option.value = modelName;
        option.textContent = formatModelLabel(modelName);
        select.appendChild(option);
    });

    const defaultModel = healthData.defaultModel || selectedModel || models[0];
    selectedModel = defaultModel;
    select.value = defaultModel;
}

function formatModelLabel(modelName) {
    switch (modelName) {
        case 'gemini-2.5-pro':
            return 'Gemini 2.5 Pro';
        case 'gemini-2.5-flash':
            return 'Gemini 2.5 Flash';
        default:
            return modelName;
    }
}

function syncModelSelection(modelName) {
    if (!modelName || currentProvider !== 'google') {
        return;
    }

    selectedModel = modelName;
    if (!availableGeminiModels.includes(modelName)) {
        availableGeminiModels.push(modelName);
        availableGeminiModels = Array.from(new Set(availableGeminiModels));
    }

    const select = document.getElementById('modelSelect');
    if (!select) {
        return;
    }

    const hasOption = Array.from(select.options).some(opt => opt.value === modelName);
    if (!hasOption) {
        const option = document.createElement('option');
        option.value = modelName;
        option.textContent = formatModelLabel(modelName);
        select.appendChild(option);
    }

    select.value = modelName;
}

// Check API health
async function checkApiHealth() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();

        currentProvider = data.provider || null;
        updateModelSelector(data);

        if (!data.apiConfigured) {
            const providerKeyMap = {
                google: 'GOOGLE_API_KEY',
                openai: 'OPENAI_API_KEY',
                anthropic: 'ANTHROPIC_API_KEY'
            };
            const keyName = providerKeyMap[currentProvider] || 'API_KEY';
            showSystemMessage(`APIキーが設定されていません。.envファイルに${keyName}を設定してください。`);
        }
    } catch (error) {
        console.error('Health check failed:', error);
        showSystemMessage('サーバーとの接続で問題が発生しました。');
    }
}

// Show system message
function showSystemMessage(message) {
    const chatContainer = document.getElementById('chatContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    messageDiv.innerHTML = `
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Ask example question
function askExample(question) {
    document.getElementById('userInput').value = question;
    sendMessage();
}

// Send message
async function sendMessage() {
    const input = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const message = input.value.trim();

    if (!message) return;

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Display user message
    displayMessage(message, 'user');

    // Disable input
    sendBtn.disabled = true;

    // Show loading indicator
    const loadingId = showLoading();

    try {
        const payload = {
            message,
            conversationHistory
        };

        if (currentProvider === 'google' && selectedModel) {
            payload.model = selectedModel;
        }

        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'チャット処理中にエラーが発生しました');
        }

        const data = await response.json();

        if (currentProvider === 'google' && data.model) {
            syncModelSelection(data.model);
        }

        // Remove loading indicator
        removeLoading(loadingId);

        // Display bot response
        displayMessage(data.reply, 'bot', data.knowledgeUsed);

        // Update conversation history
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.reply }
        );

        // Keep only last 10 messages to avoid context overflow
        if (conversationHistory.length > 10) {
            conversationHistory = conversationHistory.slice(-10);
        }

    } catch (error) {
        console.error('Error:', error);
        removeLoading(loadingId);
        displayMessage(`エラー: ${error.message}`, 'bot');
    } finally {
        sendBtn.disabled = false;
        input.focus();
    }
}

// Display message in chat
function displayMessage(text, sender, knowledgeUsed = false) {
    const chatContainer = document.getElementById('chatContainer');

    // Remove welcome message if exists
    const welcomeMessage = chatContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const formattedText = formatMessage(text);

    let knowledgeBadge = '';
    if (knowledgeUsed) {
        knowledgeBadge = '<span class="knowledge-badge">ナレッジ参照</span>';
    }

    messageDiv.innerHTML = `
        <div class="message-content">
            ${formattedText}
            ${knowledgeBadge}
        </div>
    `;

    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Format message (convert newlines to paragraphs, handle lists)
function formatMessage(text) {
    // Split by double newlines for paragraphs
    let formatted = text
        .split('\n\n')
        .map(para => {
            // Check if it's a list (starts with • or -)
            if (para.includes('\n•') || para.includes('\n-')) {
                const lines = para.split('\n');
                const listItems = lines
                    .filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'))
                    .map(line => {
                        const content = line.replace(/^[•\-]\s*/, '').trim();
                        return `<li>${content}</li>`;
                    })
                    .join('');
                return `<ul>${listItems}</ul>`;
            } else {
                return `<p>${para.replace(/\n/g, '<br>')}</p>`;
            }
        })
        .join('');

    return formatted;
}

// Show loading indicator
function showLoading() {
    const chatContainer = document.getElementById('chatContainer');
    const loadingDiv = document.createElement('div');
    const loadingId = 'loading-' + Date.now();
    loadingDiv.id = loadingId;
    loadingDiv.className = 'message bot';
    loadingDiv.innerHTML = `
        <div class="message-content">
            <div class="loading-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatContainer.appendChild(loadingDiv);
    scrollToBottom();
    return loadingId;
}

// Remove loading indicator
function removeLoading(loadingId) {
    const loadingDiv = document.getElementById(loadingId);
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Scroll to bottom
function scrollToBottom() {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

