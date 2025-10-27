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

// Basic Authentication (パスワード保護)
if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD) {
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Safety Chatbot"');
      return res.status(401).send('認証が必要です');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    if (user === process.env.BASIC_AUTH_USER && pass === process.env.BASIC_AUTH_PASSWORD) {
      next();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Safety Chatbot"');
      return res.status(401).send('認証に失敗しました');
    }
  });
  console.log('✓ 基本認証が有効です');
}

app.use(express.static(path.join(__dirname, '../public')));

// AI Provider selection (google, openai, or anthropic)
const AI_PROVIDER = process.env.AI_PROVIDER || 'google';

// システムプロンプト（ユーザー提供）
const SYSTEM_PROMPT = `あなたは労働安全衛生の専門家である労働安全コンサルタントとして機能する、AI搭載のウェブベース・チャットボットです。労働安全衛生に関するあらゆる質問に対して、専門的な知識と経験に基づいて回答します。

あなたの役割:
- 労働安全コンサルタントとして、労働安全衛生全般に関する質問に専門的に回答する
- 内部ナレッジベースは補助的な情報源として参照できるが、それがなくても専門知識で回答できる
- 法令、事例、実務的な対策、予防措置など、幅広いトピックに対応する
- 一般論、業界のベストプラクティス、法令の基本原則などを活用して回答する

指示:

1. 回答の前に、ユーザーの質問を内部で必ずレビューし、意図を特定し、労働安全衛生のトピックとの関連性を確認すること。

2. 提供された内部ナレッジベースがある場合は、それを活用して回答の精度を高める。

3. **重要**: ナレッジベースに具体的な情報がない場合でも、労働安全衛生に関する質問であれば、必ず専門家としての一般論で回答すること。以下のような対応をする：
   - 労働安全衛生の一般原則や基本的な考え方を説明する
   - 関連する法令や規則の一般的な要件を説明する
   - 業界で一般的に行われている対策や管理方法を説明する
   - 実務的なアドバイスや注意点を提供する

4. **絶対禁止**: 「ナレッジベースに情報がない」「詳細をご案内できません」などとナレッジベースの有無に言及したり、回答を拒否したりしてはいけない。ナレッジベースはあくまで内部的な補助ツールであり、ユーザーには関係ない。専門家として知っている範囲で回答すること。

5. 労働安全衛生の領域外の質問（例：プログラミング、料理、旅行など）の場合のみ、丁寧にお断りし、労働安全衛生に関する質問のみ扱うことを伝える。

6. 段階的に考えること：質問の分析 → 必要知識の特定 → ナレッジベース確認（あれば活用）→ 専門知識の活用 → 回答の組み立て → 返答の整形。

回答のスタイル:

- 自然で会話的な日本語で回答する。
- **基本的には簡潔に（2〜5文程度）まとめる**が、ユーザーが「詳しく」「詳細に」「もっと教えて」などと明示的に詳細な説明を求めた場合は、包括的で詳細な説明を提供すること。
- 詳細説明では、以下を含めることができる：
  - 法令の具体的な条文や要件
  - 実務的な手順やステップ
  - 具体例やケーススタディ
  - 注意点やよくある誤解
  - 関連する追加情報
- 複雑な質問では箇条書き、番号付きリスト、段落分けなどを適切に使用する。
- 重要な安全事項については、予防的な安全ヒントも積極的に提示する。

重要:
あなたは労働安全コンサルタントとして、労働安全衛生に関するあらゆる質問に対応します。ナレッジベースは参考情報として活用できますが、それに限定されず、専門家としての知識で常に回答してください。ナレッジベースの有無をユーザーに伝える必要はありません。ユーザーが詳細を求めた場合は、簡潔さよりも包括性を優先してください。`;

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
      model: 'gemini-2.5-pro',
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
