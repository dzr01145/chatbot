const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// AI SDKs
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// AI Provider selection (google, openai, or anthropic)
const AI_PROVIDER = process.env.AI_PROVIDER || 'google';

// システムプロンプト（ユーザー提供）
const SYSTEM_PROMPT = `あなたは顧客サポート向けに設計された、AI 搭載のウェブベース・チャットボットです。必要に応じて追加の知識モジュールを埋め込める柔軟なアーキテクチャを備えています。コア機能は、更新可能な内部ナレッジベース（ナレッジ）を活用し、労働安全衛生に関する典型的な質問に正確かつ明確に答えることです。あなたはこの領域の質問を認識して対応し、最新の埋め込み知識を用いながら、親しみやすくプロフェッショナルなトーンを保たねばなりません。

指示:

1. 回答の前に、ユーザーの質問を内部で必ずレビューし、意図を特定し、労働安全衛生のトピックとの関連性を確認すること。

2. 追加の知識モジュールが存在する場合はそれを参照し、最も網羅的かつ最新の回答を提供すること。

3. 質問が労働安全衛生の領域や現在の埋め込み知識の範囲外にある場合は、その旨を丁寧に伝え、関連する質問のみ扱うことを申し出ること。

4. 段階的に考えること：質問の分析 → 必要知識の特定 → 回答の検索・組み立て → 埋め込み知識との照合 → 返答の整形。

5. 労働安全・衛生に関する妥当な質問には、常に明確かつ簡潔に答える努力を継続すること。

書式:

- 自然で会話的な日本語で回答する。
- 回答は簡潔に（2〜5文）。複雑な質問では必要に応じて箇条書きを用いる。
- 特に一般的または重要な質問の場合は、その旨を明示し、該当する場合は予防的な安全ヒントも提示する。

重要:
あなたは労働安全・衛生のためのウェブベースの顧客サポート・チャットボットです。回答の前に必ず質問を綿密に分析し、埋め込みナレッジベースを参照してください。関連する知識をすべて検討し終えるまで粘り強く対応し、その後に回答を提示してください。`;

// Knowledge base path
const KNOWLEDGE_PATH = path.join(__dirname, '../data/knowledge.json');

// Initialize AI clients based on provider
let aiClient;
let aiConfigured = false;

if (AI_PROVIDER === 'google' && process.env.GOOGLE_API_KEY) {
  aiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  aiConfigured = true;
  console.log('✓ Google AI Studio (Gemini) を使用します');
} else if (AI_PROVIDER === 'openai' && process.env.OPENAI_API_KEY) {
  aiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  aiConfigured = true;
  console.log('✓ OpenAI (ChatGPT) を使用します');
} else if (AI_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
  aiClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  aiConfigured = true;
  console.log('✓ Anthropic (Claude) を使用します');
}

// Load knowledge base
async function loadKnowledge() {
  try {
    const data = await fs.readFile(KNOWLEDGE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading knowledge base:', error);
    return { categories: [], metadata: {} };
  }
}

// Save knowledge base
async function saveKnowledge(knowledge) {
  try {
    await fs.writeFile(KNOWLEDGE_PATH, JSON.stringify(knowledge, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving knowledge base:', error);
    return false;
  }
}

// Search knowledge base
function searchKnowledge(knowledge, query) {
  const results = [];
  const queryLower = query.toLowerCase();

  knowledge.categories.forEach(category => {
    category.items.forEach(item => {
      // Check if query matches question, answer, or keywords
      const questionMatch = item.question.toLowerCase().includes(queryLower);
      const answerMatch = item.answer.toLowerCase().includes(queryLower);
      const keywordMatch = item.keywords.some(keyword =>
        queryLower.includes(keyword.toLowerCase()) ||
        keyword.toLowerCase().includes(queryLower)
      );

      if (questionMatch || answerMatch || keywordMatch) {
        results.push({
          category: category.name,
          ...item,
          relevance: (questionMatch ? 3 : 0) + (keywordMatch ? 2 : 0) + (answerMatch ? 1 : 0)
        });
      }
    });
  });

  // Sort by relevance
  return results.sort((a, b) => b.relevance - a.relevance);
}

// Format knowledge for AI context
function formatKnowledgeContext(knowledgeItems) {
  if (knowledgeItems.length === 0) {
    return '';
  }

  let context = '\n\n【参考ナレッジベース】\n';
  knowledgeItems.slice(0, 5).forEach((item, index) => {
    context += `\n${index + 1}. Q: ${item.question}\n   A: ${item.answer}\n`;
  });

  return context;
}

// Call AI API based on provider
async function callAI(message, conversationHistory, knowledgeContext) {
  const userMessage = message + knowledgeContext;

  if (AI_PROVIDER === 'google') {
    // Google Gemini API
    const model = aiClient.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT
    });

    // Convert conversation history to Gemini format
    const history = conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(userMessage);
    const response = await result.response;
    return response.text();

  } else if (AI_PROVIDER === 'openai') {
    // OpenAI ChatGPT API
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await aiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 1024,
      temperature: 0.7
    });

    return response.choices[0].message.content;

  } else if (AI_PROVIDER === 'anthropic') {
    // Anthropic Claude API
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await aiClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    return response.content[0].text;
  }

  throw new Error('無効なAIプロバイダーが設定されています');
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'メッセージが必要です' });
    }

    if (!aiConfigured) {
      const providerNames = {
        google: 'GOOGLE_API_KEY',
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY'
      };
      return res.status(500).json({
        error: `APIキーが設定されていません。.envファイルに${providerNames[AI_PROVIDER]}を設定してください。`,
        provider: AI_PROVIDER
      });
    }

    // Load and search knowledge base
    const knowledge = await loadKnowledge();
    const relevantKnowledge = searchKnowledge(knowledge, message);
    const knowledgeContext = formatKnowledgeContext(relevantKnowledge);

    // Call AI API
    const reply = await callAI(message, conversationHistory, knowledgeContext);

    res.json({
      reply,
      knowledgeUsed: relevantKnowledge.length > 0,
      knowledgeCount: relevantKnowledge.length,
      provider: AI_PROVIDER
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'チャット処理中にエラーが発生しました',
      details: error.message
    });
  }
});

// Get all knowledge
app.get('/api/knowledge', async (req, res) => {
  try {
    const knowledge = await loadKnowledge();
    res.json(knowledge);
  } catch (error) {
    console.error('Error fetching knowledge:', error);
    res.status(500).json({ error: 'ナレッジベースの取得に失敗しました' });
  }
});

// Add knowledge item
app.post('/api/knowledge', async (req, res) => {
  try {
    const { categoryId, question, answer, keywords } = req.body;

    if (!categoryId || !question || !answer || !keywords) {
      return res.status(400).json({
        error: 'categoryId、question、answer、keywords は必須です'
      });
    }

    const knowledge = await loadKnowledge();
    const category = knowledge.categories.find(cat => cat.id === categoryId);

    if (!category) {
      return res.status(404).json({ error: 'カテゴリーが見つかりません' });
    }

    category.items.push({
      question,
      answer,
      keywords: Array.isArray(keywords) ? keywords : [keywords]
    });

    knowledge.metadata.last_updated = new Date().toISOString().split('T')[0];

    const saved = await saveKnowledge(knowledge);

    if (saved) {
      res.json({ message: 'ナレッジが追加されました', knowledge });
    } else {
      res.status(500).json({ error: 'ナレッジの保存に失敗しました' });
    }

  } catch (error) {
    console.error('Error adding knowledge:', error);
    res.status(500).json({ error: 'ナレッジの追加に失敗しました' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: AI_PROVIDER,
    apiConfigured: aiConfigured,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n労働安全衛生チャットボットサーバーが起動しました`);
  console.log(`サーバー: http://localhost:${PORT}`);
  console.log(`AIプロバイダー: ${AI_PROVIDER}`);
  console.log(`API設定: ${aiConfigured ? '✓ 完了' : '✗ 未設定 (.envファイルにAPIキーを設定してください)'}\n`);
});
