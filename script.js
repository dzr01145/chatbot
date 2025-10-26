// チャット機能の実装
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

// メッセージを追加する関数
function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);

    // 最新メッセージまでスクロール
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ボットの応答を生成する関数（デモ用）
function getBotResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();

    // キーワードに基づいた簡単な応答
    if (lowerMessage.includes('安全') || lowerMessage.includes('事故')) {
        return '労働安全に関するご質問ですね。具体的にどのような状況についてお聞きになりたいですか？例えば、作業環境、保護具、安全手順などについてお答えできます。';
    } else if (lowerMessage.includes('衛生') || lowerMessage.includes('健康')) {
        return '労働衛生についてのご質問ですね。職場の衛生管理、健康診断、作業環境測定など、具体的な内容をお聞かせください。';
    } else if (lowerMessage.includes('法律') || lowerMessage.includes('法令') || lowerMessage.includes('規則')) {
        return '労働安全衛生法に関するご質問ですね。具体的にどの条項や規則についてお知りになりたいですか？';
    } else if (lowerMessage.includes('保護具') || lowerMessage.includes('ヘルメット') || lowerMessage.includes('手袋')) {
        return '保護具についてのご質問ですね。適切な保護具の選定と使用方法は、作業の安全性を確保する上で非常に重要です。どのような作業環境でお使いになりますか？';
    } else if (lowerMessage.includes('教育') || lowerMessage.includes('研修')) {
        return '安全衛生教育についてのご質問ですね。新規採用時教育、特別教育、職長教育など、様々な教育プログラムがあります。どのような教育についてお知りになりたいですか？';
    } else if (lowerMessage.includes('ありがとう') || lowerMessage.includes('感謝')) {
        return 'どういたしまして。他にご質問があればお気軽にお聞かせください。';
    } else {
        return 'ご質問ありがとうございます。労働安全衛生に関して、より具体的な内容をお聞かせいただけますか？例えば、安全対策、衛生管理、法令、保護具、教育などについてお答えできます。';
    }
}

// メッセージを送信する関数
function sendMessage() {
    const message = userInput.value.trim();

    if (message === '') return;

    // ユーザーメッセージを追加
    addMessage(message, true);

    // 入力フィールドをクリア
    userInput.value = '';

    // ボットの応答を少し遅延させて追加（より自然に見せるため）
    setTimeout(() => {
        const response = getBotResponse(message);
        addMessage(response, false);
    }, 500);
}

// イベントリスナー
sendButton.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 初期フォーカス
userInput.focus();
