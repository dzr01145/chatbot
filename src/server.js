const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');

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

// システムプロンプト
const SYSTEM_PROMPT = `あなたは労働安全衛生の専門知識を持つAIアシスタントです。内部のナレッジベースには、法令条文、健康管理、保護具、リスクアセスメント、安全衛生教育、そして2,622件の実際の労働災害事例が含まれています。

【最重要：回答の長さ】
- 通常の質問には、300文字程度（100-400文字）で簡潔に回答してください
- ユーザーが「詳しく」「もっと詳細に」「複数の事例を」などと明示的に求めた場合のみ、長い回答をしてください
- 簡潔さを最優先してください。冗長な説明は避けてください

【重要な指示】

1. ナレッジベースの活用
   - ユーザーの質問に関連する災害事例や知識が内部にある場合は、必ずそれを優先的に参照してください
   - 特に災害事例に関する質問の場合は、1〜2件の具体的な事例を紹介してください
   - 一般論だけでなく、具体的な事例を含めて回答することが非常に重要です

2. 法令の引用について
   - 法的義務や規制に関する質問では、関連する法令条文がナレッジベースにある場合は必ず引用してください
   - 法令を引用する際は、条文番号と要約を簡潔に示してください
   - 例：「労働安全衛生法第59条により、雇入れ時や作業内容変更時に安全衛生教育が義務付けられています」
   - 法令の詳細URLも提示してください
   - 重要：ナレッジベースに記載されているURLをそのまま使用してください。独自にURLを生成しないでください

3. 災害事例の紹介方法
   - 事例を紹介する際は、簡潔に以下を含めてください：
     * 状況の要点（1文）
     * 原因の要点（1文）
     * 対策の要点（1文）
     * 詳細情報へのURL
   - URLは必ず記載してください。「詳細: URL」という形式で提示してください
   - 重要：各災害事例には固有のURLがあります。ナレッジベースに記載されているURLをそのまま使用してください

4. 回答スタイル（非常に重要）
   - 普通の文章で回答してください。マークダウン記法は一切使用しないでください
   - 箇条書き（*、-、•）は使わず、普通の段落で説明してください
   - **太字**などの装飾も使わないでください
   - 自然な日本語の文章のみを使用してください
   - 専門用語を使う場合は、わかりやすく説明を加えてください

5. 事例の数
   - 通常は1〜2件の事例で十分です
   - ユーザーが「複数」「何件か」「いくつか」と明示した場合のみ2〜3件紹介してください
   - それ以外は1件の事例で簡潔に

6. URLの取り扱い（非常に重要）
   - ナレッジベースにURLが含まれている場合は、必ずそのURLを回答に含めてください
   - 「詳細: URL」という形で簡潔に提示してください
   - 絶対に独自のURLを作成・生成しないでください
   - ナレッジベースに記載されているURLを一字一句そのままコピーして使用してください
   - 複数の事例を紹介する場合、それぞれ異なるURLになります。各事例のURLを正確に使い分けてください

【重要：URLの使用について】
- ナレッジベースから提供された実際のURLを必ず使用してください
- 例に示されているURLをそのまま使わないでください
- 各災害事例、各法令条文には固有のURLがあります。それぞれのナレッジから得られた正しいURLを使ってください

【良い回答の構成（300文字程度）】

災害事例を紹介する場合:
- 状況の要点（1〜2文）
- 原因の要点（1文）
- 対策の要点（1文）
- 「詳細: [ナレッジベースから得られた実際のURL]」

法令を引用する場合:
- 法令名と条文番号を明示
- 内容の要約（2〜3文）
- 実務上の注意点（1〜2文）
- 「詳細: [ナレッジベースから得られた実際のURL]」

注意：必ずナレッジベースに含まれている各項目固有のURLを使用してください。同じURLを繰り返し使用しないでください。`;


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

// e-Gov Law API Integration
const LAW_IDS = {
  '労働安全衛生法': '347AC0000000057',
  '労働安全衛生法施行令': '347CO0000000318',
  '労働安全衛生規則': '347M50002000032'
};

// Fetch law article from e-Gov API
async function fetchLawArticle(lawId, articleNumber) {
  try {
    const url = `https://laws.e-gov.go.jp/api/1/lawdata/${lawId}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/xml'
      }
    });

    // Parse XML response
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);

    // Extract law name and articles
    const lawName = result?.DataRoot?.ApplData?.[0]?.LawFullText?.[0]?.Law?.[0]?.LawBody?.[0]?.LawTitle?.[0] || '不明';

    // Return basic law info (for now, we'll add full article extraction later if needed)
    return {
      lawId,
      lawName,
      articleNumber,
      available: true
    };

  } catch (error) {
    console.error(`Error fetching law article ${lawId}/${articleNumber}:`, error.message);
    return {
      lawId,
      articleNumber,
      available: false,
      error: error.message
    };
  }
}

// Get law information by name
function getLawIdByName(lawName) {
  // Normalize law name
  const normalized = lawName.replace(/\s+/g, '');

  for (const [name, id] of Object.entries(LAW_IDS)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return { name, id };
    }
  }

  return null;
}

// Search knowledge base
function searchKnowledge(knowledge, query) {
  const results = [];
  const queryLower = query.toLowerCase();

  // クエリを単語に分割（スペースやカンマで区切る）
  const queryWords = queryLower.split(/[\s,、]+/).filter(word => word.length > 1);

  knowledge.categories.forEach(category => {
    category.items.forEach(item => {
      let relevance = 0;

      // 質問文とのマッチング
      const questionLower = item.question.toLowerCase();
      if (questionLower.includes(queryLower)) {
        relevance += 5; // 完全一致は高スコア
      } else {
        // 単語ごとのマッチング
        queryWords.forEach(word => {
          if (questionLower.includes(word)) {
            relevance += 2;
          }
        });
      }

      // キーワードとのマッチング
      item.keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        if (queryLower.includes(keywordLower) || keywordLower.includes(queryLower)) {
          relevance += 4;
        } else {
          queryWords.forEach(word => {
            if (keywordLower.includes(word) || word.includes(keywordLower)) {
              relevance += 2;
            }
          });
        }
      });

      // 回答文とのマッチング（重要度は低め）
      const answerLower = item.answer.toLowerCase();
      queryWords.forEach(word => {
        if (answerLower.includes(word)) {
          relevance += 1;
        }
      });

      // 災害事例カテゴリーの場合は、スコアを少し上げる
      if (category.name === '災害事例集' && relevance > 0) {
        relevance += 1;
      }

      if (relevance > 0) {
        results.push({
          category: category.name,
          ...item,
          relevance: relevance
        });
      }
    });
  });

  // Sort by relevance (high to low)
  return results.sort((a, b) => b.relevance - a.relevance);
}

// Format knowledge for AI context
function formatKnowledgeContext(knowledgeItems) {
  if (knowledgeItems.length === 0) {
    return '';
  }

  // 災害事例を優先し、より多くの事例を含める
  const disasterCases = knowledgeItems.filter(item => item.category === '災害事例集');
  const otherItems = knowledgeItems.filter(item => item.category !== '災害事例集');

  // 災害事例は最大8件、その他は最大5件
  const selectedDisasterCases = disasterCases.slice(0, 8);
  const selectedOtherItems = otherItems.slice(0, 5);

  let context = '\n\n【参考ナレッジベース】\n';

  // 災害事例を先に追加
  if (selectedDisasterCases.length > 0) {
    context += '\n＜災害事例＞\n';
    selectedDisasterCases.forEach((item, index) => {
      context += `\n${index + 1}. ${item.question}\n${item.answer}\n`;
    });
  }

  // その他の知識を追加
  if (selectedOtherItems.length > 0) {
    context += '\n＜その他の関連知識＞\n';
    selectedOtherItems.forEach((item, index) => {
      context += `\n${index + 1}. Q: ${item.question}\n   A: ${item.answer}\n`;
    });
  }

  return context;
}

// Call AI API based on provider
async function callAI(message, conversationHistory, knowledgeContext) {
  const userMessage = message + knowledgeContext;

  if (AI_PROVIDER === 'google') {
    // Google Gemini API
    const model = aiClient.getGenerativeModel({
      model: 'gemini-2.5-flash',
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

// Get law article endpoint
app.get('/api/law/:lawName/:articleNumber?', async (req, res) => {
  try {
    const { lawName, articleNumber } = req.params;

    const lawInfo = getLawIdByName(lawName);

    if (!lawInfo) {
      return res.status(404).json({
        error: '指定された法令が見つかりません',
        availableLaws: Object.keys(LAW_IDS)
      });
    }

    const article = await fetchLawArticle(lawInfo.id, articleNumber || '1');

    res.json(article);

  } catch (error) {
    console.error('Error fetching law:', error);
    res.status(500).json({ error: '法令の取得に失敗しました' });
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
