// API Base URL
const API_BASE = window.location.origin;

// Conversation history
let conversationHistory = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupInputHandlers();
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

// Check API health
async function checkApiHealth() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();

        if (!data.apiConfigured) {
            showSystemMessage('⚠️ APIキーが設定されていません。チャット機能を使用するには、サーバーの.envファイルにANTHROPIC_API_KEYを設定してください。');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        showSystemMessage('⚠️ サーバーとの接続に問題があります。');
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
        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                conversationHistory
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'チャット処理中にエラーが発生しました');
        }

        const data = await response.json();

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
        knowledgeBadge = '<span class="knowledge-badge">ナレッジベース参照</span>';
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

// Format message (convert markdown-like syntax to HTML with auto-linked URLs)
function formatMessage(text) {
    // First, convert URLs to clickable links
    text = autoLinkUrls(text);

    // Split by double newlines for paragraphs
    let formatted = text
        .split('\n\n')
        .map(para => {
            // Check if it's a numbered list (starts with 1., 2., etc.)
            if (/^\d+\.\s/.test(para.trim())) {
                const lines = para.split('\n');
                const listItems = lines
                    .filter(line => /^\d+\.\s/.test(line.trim()))
                    .map(line => {
                        const content = line.replace(/^\d+\.\s*/, '').trim();
                        return `<li>${formatInlineMarkdown(content)}</li>`;
                    })
                    .join('');
                return `<ol>${listItems}</ol>`;
            }
            // Check if it's a bullet list (starts with • or - or *)
            else if (para.includes('\n•') || para.includes('\n-') || para.includes('\n*')) {
                const lines = para.split('\n');
                const listItems = lines
                    .filter(line => {
                        const trimmed = line.trim();
                        return trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
                    })
                    .map(line => {
                        const content = line.replace(/^[•\-\*]\s*/, '').trim();
                        return `<li>${formatInlineMarkdown(content)}</li>`;
                    })
                    .join('');
                return `<ul>${listItems}</ul>`;
            }
            // Check if it's a heading (starts with ## or ###)
            else if (para.trim().startsWith('##')) {
                const level = para.match(/^#+/)[0].length;
                const content = para.replace(/^#+\s*/, '').trim();
                return `<h${level}>${formatInlineMarkdown(content)}</h${level}>`;
            }
            // Regular paragraph
            else {
                return `<p>${formatInlineMarkdown(para.replace(/\n/g, '<br>'))}</p>`;
            }
        })
        .join('');

    return formatted;
}

// Format inline markdown (bold, links, etc.)
function formatInlineMarkdown(text) {
    // Bold: **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_ (but not part of URLs)
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/\b_(.+?)_\b/g, '<em>$1</em>');

    return text;
}

// Auto-link URLs in text
function autoLinkUrls(text) {
    // First, handle Markdown-style links: [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    text = text.replace(markdownLinkRegex, (match, linkText, url) => {
        const trimmedUrl = url.trim();
        const trimmedText = linkText.trim();

        // If linkText is the same as URL, just show clickable URL
        if (trimmedText === trimmedUrl) {
            return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${trimmedUrl}</a>`;
        }

        // Otherwise, show linkText followed by clickable URL
        return `${trimmedText}<br><a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer" class="url-link">${trimmedUrl}</a>`;
    });

    // Then, handle plain URLs (http, https) that aren't already in <a> tags
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    text = text.replace(urlRegex, (url) => {
        // Clean up trailing punctuation that might not be part of the URL
        let cleanUrl = url;
        let trailing = '';

        // Check for trailing punctuation
        const trailingPunctRegex = /([.,;:!?)]*)$/;
        const match = cleanUrl.match(trailingPunctRegex);
        if (match && match[1]) {
            trailing = match[1];
            cleanUrl = cleanUrl.slice(0, -trailing.length);
        }

        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
    });

    return text;
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

