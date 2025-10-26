// API Base URL
const API_BASE = window.location.origin;

// Conversation history
let conversationHistory = [];

// ナレッジ管理用の状態
let allKnowledge = null;
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

// Load knowledge base on page load
document.addEventListener('DOMContentLoaded', () => {
    loadKnowledgeBase();
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

// Format message (convert newlines to paragraphs, handle lists, URLs, and markdown)
function formatMessage(text) {
    // まずURLをハイパーリンクに変換（プレースホルダーに置き換え）
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls = [];
    let processedText = text.replace(urlPattern, (match) => {
        urls.push(match);
        return `__URL_${urls.length - 1}__`;
    });

    // マークダウンの太字を変換（**text** → <strong>text</strong>）
    processedText = processedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Split by double newlines for paragraphs
    let formatted = processedText
        .split('\n\n')
        .map(para => {
            // Check if it's a list (starts with • or - or *)
            if (para.includes('\n•') || para.includes('\n-') || para.includes('\n*')) {
                const lines = para.split('\n');
                const listItems = lines
                    .filter(line => {
                        const trimmed = line.trim();
                        return trimmed.startsWith('•') ||
                               trimmed.startsWith('-') ||
                               trimmed.startsWith('*');
                    })
                    .map(line => {
                        const content = line.replace(/^[•\-\*]\s*/, '').trim();
                        return `<li>${content}</li>`;
                    })
                    .join('');
                return `<ul class="chat-list">${listItems}</ul>`;
            } else {
                return `<p>${para.replace(/\n/g, '<br>')}</p>`;
            }
        })
        .join('');

    // URLプレースホルダーを実際のリンクに戻す
    urls.forEach((url, index) => {
        const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
        formatted = formatted.replace(`__URL_${index}__`, linkHtml);
    });

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

// Load knowledge base
async function loadKnowledgeBase() {
    try {
        const response = await fetch(`${API_BASE}/api/knowledge`);
        const knowledge = await response.json();

        allKnowledge = knowledge; // グローバル変数に保存

        displayKnowledgeStats(knowledge);
        populateCategorySelect(knowledge);
        populateCategoryFilter(knowledge); // フィルター用セレクトも埋める
        displayKnowledgeList(knowledge);

    } catch (error) {
        console.error('Error loading knowledge base:', error);
        document.getElementById('knowledgeStats').innerHTML = '<p>ナレッジベースの読み込みに失敗しました</p>';
    }
}

// Display knowledge stats
function displayKnowledgeStats(knowledge) {
    const statsDiv = document.getElementById('knowledgeStats');
    const totalCategories = knowledge.categories.length;
    const totalItems = knowledge.categories.reduce((sum, cat) => sum + cat.items.length, 0);

    statsDiv.innerHTML = `
        <p><strong>カテゴリー数:</strong> ${totalCategories}</p>
        <p><strong>ナレッジ項目数:</strong> ${totalItems}</p>
        <p><strong>最終更新:</strong> ${knowledge.metadata.last_updated || 'N/A'}</p>
    `;
}

// Populate category select (for adding new knowledge)
function populateCategorySelect(knowledge) {
    const select = document.getElementById('categorySelect');
    select.innerHTML = '<option value="">選択してください</option>';

    knowledge.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });
}

// Populate category filter
function populateCategoryFilter(knowledge) {
    const filter = document.getElementById('categoryFilter');
    filter.innerHTML = '<option value="">全てのカテゴリー</option>';

    knowledge.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        filter.appendChild(option);
    });
}

// Filter knowledge based on category and keyword
function filterKnowledge() {
    if (!allKnowledge) return;

    const categoryFilter = document.getElementById('categoryFilter').value;
    const keywordFilter = document.getElementById('keywordFilter').value.toLowerCase();

    // フィルタリング
    let filteredCategories = allKnowledge.categories;

    // カテゴリーでフィルター
    if (categoryFilter) {
        filteredCategories = filteredCategories.filter(cat => cat.id === categoryFilter);
    }

    // キーワードでフィルター
    let filteredItems = [];
    filteredCategories.forEach(category => {
        category.items.forEach(item => {
            if (keywordFilter) {
                const matchQuestion = item.question.toLowerCase().includes(keywordFilter);
                const matchAnswer = item.answer.toLowerCase().includes(keywordFilter);
                const matchKeywords = item.keywords.some(kw => kw.toLowerCase().includes(keywordFilter));

                if (matchQuestion || matchAnswer || matchKeywords) {
                    filteredItems.push({ ...item, category: category.name });
                }
            } else {
                filteredItems.push({ ...item, category: category.name });
            }
        });
    });

    // ページをリセット
    currentPage = 1;

    // 表示
    displayFilteredKnowledge(filteredItems);
}

// Display filtered knowledge with pagination
function displayFilteredKnowledge(items) {
    const listDiv = document.getElementById('knowledgeList');
    listDiv.innerHTML = '';

    if (items.length === 0) {
        listDiv.innerHTML = '<p>該当するナレッジがありません</p>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }

    // ページネーション計算
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = items.slice(startIndex, endIndex);

    // アイテムを表示
    pageItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'knowledge-item';

        const keywords = item.keywords.map(kw =>
            `<span class="keyword-tag">${kw}</span>`
        ).join('');

        itemDiv.innerHTML = `
            <div class="knowledge-item-category">${item.category}</div>
            <div class="knowledge-item-question">${item.question}</div>
            <div class="knowledge-item-answer">${item.answer.substring(0, 100)}${item.answer.length > 100 ? '...' : ''}</div>
            <div class="knowledge-item-keywords">${keywords}</div>
        `;

        listDiv.appendChild(itemDiv);
    });

    // ページネーション表示
    displayPagination(totalPages, items);
}

// Display pagination controls
function displayPagination(totalPages, items) {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = '';

    if (totalPages <= 1) return;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, items.length);

    // ページ情報
    const info = document.createElement('div');
    info.className = 'pagination-info';
    info.textContent = `${startIndex}-${endIndex} / ${items.length}件`;
    paginationDiv.appendChild(info);

    // ボタンコンテナ
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'pagination-buttons';

    // 前へボタン
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← 前へ';
    prevBtn.className = 'pagination-btn';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            filterKnowledge();
        }
    };
    buttonsDiv.appendChild(prevBtn);

    // ページ番号
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `${currentPage} / ${totalPages}`;
    buttonsDiv.appendChild(pageInfo);

    // 次へボタン
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '次へ →';
    nextBtn.className = 'pagination-btn';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            filterKnowledge();
        }
    };
    buttonsDiv.appendChild(nextBtn);

    paginationDiv.appendChild(buttonsDiv);
}

// Display knowledge list (initial load)
function displayKnowledgeList(knowledge) {
    if (!knowledge.categories || knowledge.categories.length === 0) {
        document.getElementById('knowledgeList').innerHTML = '<p>ナレッジがありません</p>';
        return;
    }

    // 全アイテムを取得
    let allItems = [];
    knowledge.categories.forEach(category => {
        category.items.forEach(item => {
            allItems.push({ ...item, category: category.name });
        });
    });

    displayFilteredKnowledge(allItems);
}

// Add knowledge
async function addKnowledge(event) {
    event.preventDefault();

    const categoryId = document.getElementById('categorySelect').value;
    const question = document.getElementById('questionInput').value.trim();
    const answer = document.getElementById('answerInput').value.trim();
    const keywordsStr = document.getElementById('keywordsInput').value.trim();

    if (!categoryId || !question || !answer || !keywordsStr) {
        alert('すべての項目を入力してください');
        return;
    }

    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k);

    try {
        const response = await fetch(`${API_BASE}/api/knowledge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                categoryId,
                question,
                answer,
                keywords
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'ナレッジの追加に失敗しました');
        }

        const data = await response.json();

        // Clear form
        document.getElementById('addKnowledgeForm').reset();

        // Reload knowledge base
        await loadKnowledgeBase();

        alert('ナレッジが追加されました！');

    } catch (error) {
        console.error('Error adding knowledge:', error);
        alert(`エラー: ${error.message}`);
    }
}
