// API Base URL
const API_BASE = window.location.origin;

// チャット機能の実装
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

// Conversation history
let conversationHistory = [];

// メッセージを追加する関数
function addMessage(text, isUser = false, knowledgeUsed = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Format message text (convert newlines to <br>)
    const formattedText = text.replace(/\n/g, '<br>');
    contentDiv.innerHTML = formattedText;

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // 最新メッセージまでスクロール
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show loading indicator
function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-indicator';
    loadingDiv.className = 'message bot-message';
    loadingDiv.innerHTML = `
        <div class="message-content">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove loading indicator
function removeLoading() {
    const loadingDiv = document.getElementById('loading-indicator');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Call backend API
async function callAPI(message) {
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
        return data;

    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// メッセージを送信する関数
async function sendMessage() {
    const message = userInput.value.trim();

    if (message === '') return;

    // ユーザーメッセージを追加
    addMessage(message, true);

    // 入力フィールドをクリア
    userInput.value = '';

    // ボタンを無効化
    sendButton.disabled = true;

    // ローディング表示
    showLoading();

    try {
        // API呼び出し
        const data = await callAPI(message);

        // ローディングを削除
        removeLoading();

        // ボットの応答を追加
        addMessage(data.reply, false, data.knowledgeUsed);

        // 会話履歴を更新
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.reply }
        );

        // 直近10メッセージのみ保持
        if (conversationHistory.length > 10) {
            conversationHistory = conversationHistory.slice(-10);
        }

    } catch (error) {
        // ローディングを削除
        removeLoading();

        // エラーメッセージを表示
        addMessage(`エラー: ${error.message}`, false);
    } finally {
        // ボタンを有効化
        sendButton.disabled = false;
        userInput.focus();
    }
}

// Check API health on load
async function checkApiHealth() {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        const data = await response.json();

        if (!data.apiConfigured) {
            addMessage('⚠️ APIキーが設定されていません。サーバーの.envファイルにAPIキーを設定してください。', false);
        }
    } catch (error) {
        console.error('Health check failed:', error);
        addMessage('⚠️ サーバーとの接続に問題があります。サーバーが起動しているか確認してください。', false);
    }
}

// イベントリスナー
sendButton.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    checkApiHealth();
    userInput.focus();
});
