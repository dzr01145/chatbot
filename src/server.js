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
- 内部ナレッジベースは重要な情報源として積極的に活用する
- 法令、事例、実務的な対策、予防措置など、幅広いトピックに対応する
- 一般論、業界のベストプラクティス、法令の基本原則などを活用して回答する

【最重要】ナレッジベースの取り扱いルール:

1. **ナレッジベースの活用方法**:
   - ユーザーの質問に対して、【参考ナレッジベース】が提供された場合、**必ずその内容を参考にして回答すること**
   - ナレッジベースに記載されている情報（対策、手順、注意点など）は積極的に回答に含める
   - ナレッジベースの内容を元に、専門家として分かりやすく説明する

2. **デフォルトの回答方法（通常の質問の場合）**:
   ユーザーが「〜について教えて」「〜の対策は」「〜の方法は」などと一般的な質問をした場合:

   ✓ **許可される・推奨される回答**:
   - ナレッジベースに記載されている対策、手順、内容を使って回答する
   - ナレッジベースの情報を元に、自然な日本語で説明する
   - 専門家として、ナレッジベースの内容を分かりやすく伝える

   ✗ **絶対に禁止される行為**:
   - ナレッジベース内の具体的な災害事例の詳細（「〇〇工事で」「〇〇作業中に、〜という災害が発生しました」などの固有名詞や事故の状況描写）を提示すること
   - URL（https://...）を提示すること
   - 「詳細:」「ナレッジベース参照」「参考:」などの表示をすること

   **重要**: ナレッジベースに「対策」「方法」「手順」などが記載されている場合は、それを積極的に活用して回答してください。ただし、災害事例の詳細描写は避けてください。

3. **事例提示が許される条件（明示的な要求があった場合のみ）**:
   ユーザーが以下のように**明示的に事例や具体例を要求**した場合のみ、ナレッジベースの具体的な災害事例の内容を提示できる:
   - 「事例を示して」「事例はありますか」「事例を教えて」
   - 「具体例を教えて」「実例を見せて」「実際の例を教えて」「災害事例を教えて」

   **事例を提示する際の必須形式:**
   - タイトル: [事例のタイトル]
   - 発生状況: [状況の説明]
   - 原因: [原因の説明]
   - 対策: [対策の説明]
   - 詳細URL: [完全なURL - 必ず記載すること]

   **重要:** URLは絶対に省略せず、必ず「詳細URL: https://...」の形式で記載すること。

4. **質問の種類の判別**:
   - 「対策を教えて」→ ナレッジベースの対策内容を使って回答（災害事例の詳細は提示しない）
   - 「方法を教えて」→ ナレッジベースの方法を使って回答（災害事例の詳細は提示しない）
   - 「どうすればいい」→ ナレッジベースの内容を参考に回答（災害事例の詳細は提示しない）
   - 「事例を教えて」→ ナレッジベースの具体的な災害事例を提示（OK）

5. **ナレッジベースがない場合**:
   ナレッジベースに具体的な情報がない場合でも、労働安全衛生に関する質問であれば、必ず専門家としての一般論で回答すること。

6. **絶対禁止事項**:
   - 「ナレッジベースに情報がない」「詳細をご案内できません」などとナレッジベースの有無に言及すること
   - 回答を拒否すること
   - ナレッジベースはあくまで内部的な補助ツールであり、ユーザーには関係ない

7. 労働安全衛生の領域外の質問（例：プログラミング、料理、旅行など）の場合のみ、丁寧にお断りし、労働安全衛生に関する質問のみ扱うことを伝える。

回答のスタイル:

- 自然で会話的な日本語で回答する。
- **基本的には簡潔に（2〜5文程度）まとめる**が、ユーザーが「詳しく」「詳細に」「もっと教えて」などと明示的に詳細な説明を求めた場合は、包括的で詳細な説明を提供すること。
- 詳細説明では、以下を含めることができる：
  - 法令の具体的な条文や要件
  - 実務的な手順やステップ
  - 一般的な具体例やケーススタディ（ただし、ナレッジベースの災害事例の詳細は事例要求時のみ）
  - 注意点やよくある誤解
  - 関連する追加情報
- 複雑な質問では箇条書き、番号付きリスト、段落分けなどを適切に使用する。
- 重要な安全事項については、予防的な安全ヒントも積極的に提示する。

重要:
あなたは労働安全コンサルタントとして、労働安全衛生に関するあらゆる質問に対応します。【参考ナレッジベース】が提供された場合は、その内容を必ず参考にして回答してください。ただし、災害事例の具体的な詳細描写やURLは、ユーザーが明示的に事例を求めた場合のみ提示してください。`;

// Knowledge base path
const KNOWLEDGE_PATH = path.join(__dirname, '../data/knowledge.json');
const JIREI_JSON_PATH = path.join(__dirname, '../data/jirei.json');
const LAWS_JSON_PATH = path.join(__dirname, '../data/laws.json');

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

// Jirei cases cache
let jireiCasesCache = null;

// Load jirei cases from JSON
async function loadJireiCases() {
  if (jireiCasesCache) {
    return jireiCasesCache;
  }

  try {
    const data = await fs.readFile(JIREI_JSON_PATH, 'utf8');
    const jireiData = JSON.parse(data);
    jireiCasesCache = jireiData.cases;
    console.log(`✓ ${jireiCasesCache.length}件の事例データを読み込みました (Version: ${jireiData.version})`);
    return jireiCasesCache;
  } catch (error) {
    console.error('Error loading jirei cases:', error);
    return [];
  }
}

// Laws cache
let lawsCache = null;

// Load laws from JSON
async function loadLaws() {
  if (lawsCache) {
    return lawsCache;
  }

  try {
    const data = await fs.readFile(LAWS_JSON_PATH, 'utf8');
    const lawsData = JSON.parse(data);
    lawsCache = lawsData.laws;
    console.log(`✓ ${lawsCache.length}件の法令データを読み込みました (Version: ${lawsData.version})`);
    return lawsCache;
  } catch (error) {
    console.error('Error loading laws:', error);
    return [];
  }
}

// Extract keywords from query
function extractKeywords(query) {
  // Common keywords to extract for better search
  const keywords = [];

  // Safety-related keywords
  const safetyTerms = ['熱中症', '転倒', '転落', '墜落', '挟まれ', '感電', '火災', '爆発', '中毒',
    '酸欠', '騒音', '振動', '腰痛', '切創', '骨折', '火傷', '凍傷', '熱傷'];
  const locationTerms = ['事務所', 'オフィス', '工場', '倉庫', '建設現場', '工事現場', '階段', '通路'];
  const equipmentTerms = ['機械', '設備', 'フォークリフト', 'クレーン', 'はしご', '足場', '脚立',
    'コンベア', 'プレス', '電動工具'];

  const allTerms = [...safetyTerms, ...locationTerms, ...equipmentTerms];

  // Extract matched terms
  allTerms.forEach(term => {
    if (query.includes(term)) {
      keywords.push(term);
    }
  });

  // Special case: If asking about office disasters, add common office-related keywords
  if (query.includes('事務所') || query.includes('オフィス')) {
    // Office environments commonly have these types of accidents
    const officeRelatedKeywords = ['転倒', '転落', '階段', '腰痛'];
    officeRelatedKeywords.forEach(kw => {
      if (!keywords.includes(kw)) {
        keywords.push(kw);
      }
    });
  }

  // If no specific terms found, add general query words (split by common particles)
  if (keywords.length === 0) {
    const generalWords = query
      .replace(/[、。！？\s]/g, ' ')
      .split(' ')
      .filter(word => word.length >= 2);
    keywords.push(...generalWords);
  }

  console.log(`[Search] Extracted keywords: ${keywords.join(', ')}`);
  return keywords;
}

// Search jirei cases
function searchJireiCases(cases, query) {
  const keywords = extractKeywords(query);
  const results = [];

  cases.forEach(jcase => {
    let relevance = 0;

    keywords.forEach(keyword => {
      // Check title match
      if (jcase.title && jcase.title.includes(keyword)) {
        relevance += 5;
      }

      // Check type match (disaster type)
      if (jcase.type && jcase.type.includes(keyword)) {
        relevance += 4;
      }

      // Check measure match
      if (jcase.measure && jcase.measure.includes(keyword)) {
        relevance += 3;
      }

      // Check cause match
      if (jcase.cause && jcase.cause.includes(keyword)) {
        relevance += 2;
      }

      // Check situation match
      if (jcase.situation && jcase.situation.includes(keyword)) {
        relevance += 1;
      }

      // Check equipment match
      if (jcase.equipment && jcase.equipment.includes(keyword)) {
        relevance += 2;
      }
    });

    if (relevance > 0) {
      results.push({ ...jcase, relevance });
    }
  });

  // Sort by relevance
  return results.sort((a, b) => b.relevance - a.relevance);
}

// Search laws
function searchLaws(laws, query) {
  const results = [];
  const queryLower = query.toLowerCase();

  // Common law-related keywords
  const lawKeywords = ['条', '項', '法', '規則', '令', '施行', '義務', '禁止', '罰則', '届出', '報告'];

  laws.forEach(law => {
    let relevance = 0;

    // Check title match
    if (law.title && law.title.toLowerCase().includes(queryLower)) {
      relevance += 5;
    }

    // Check content match
    if (law.content && law.content.toLowerCase().includes(queryLower)) {
      relevance += 3;
    }

    // Check chapter match
    if (law.chapter && law.chapter.toLowerCase().includes(queryLower)) {
      relevance += 2;
    }

    // Check article number match
    if (law.articleNumber && law.articleNumber.toLowerCase().includes(queryLower)) {
      relevance += 4;
    }

    // Check tags match
    if (law.tags && law.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
      relevance += 2;
    }

    if (relevance > 0) {
      results.push({ ...law, relevance });
    }
  });

  // Sort by relevance
  return results.sort((a, b) => b.relevance - a.relevance);
}

// Format laws for AI context
function formatLawsContext(laws, userMessage = '') {
  if (laws.length === 0) {
    return '';
  }

  let context = '\n\n【参考法令データベース】\n';
  context += `※マッチした法令: ${laws.length}件\n`;
  context += '※以下の法令条文を参考に、正確な法的根拠を示して回答してください。\n\n';

  laws.slice(0, 5).forEach((law, index) => {
    context += `${index + 1}. 【${law.law}】${law.articleNumber}\n`;
    context += `   章: ${law.chapter}\n`;
    const content = law.content.length > 400 ? law.content.substring(0, 400) + '...' : law.content;
    context += `   内容: ${content}\n\n`;
  });

  return context;
}

// Format jirei cases for AI context
function formatJireiContext(jireiCases, userMessage = '') {
  if (jireiCases.length === 0) {
    return '';
  }

  // Check if user is asking for examples/cases
  const isAskingForExamples = /事例|実例|具体例|ケース|example|case/i.test(userMessage);

  let context = '\n\n【参考事例データベース】\n';

  if (isAskingForExamples) {
    // User explicitly asked for examples - show full details including URL
    context += '※ユーザーが事例を求めているため、具体的な災害事例の詳細を提示してください。\n';
    context += '※事例を提示する際は、必ず以下の形式で回答してください:\n';
    context += '  タイトル: [事例タイトル]\n';
    context += '  発生状況: [状況の説明]\n';
    context += '  原因: [原因の説明]\n';
    context += '  対策: [対策の説明]\n';
    context += '  詳細URL: [URLをそのまま記載]\n';
    context += '※URLは必ず「詳細URL: 」の後に完全なURLを記載すること。省略厳禁。\n\n';
    jireiCases.slice(0, 3).forEach((jcase, index) => {
      context += `${index + 1}. タイトル: ${jcase.title}\n`;
      context += `   発生状況: ${jcase.situation.substring(0, 200)}...\n`;
      context += `   原因: ${jcase.cause.substring(0, 150)}...\n`;
      context += `   対策: ${jcase.measure.substring(0, 150)}...\n`;
      context += `   詳細URL: ${jcase.url}\n\n`;
    });
  } else {
    // General question - only provide measures/countermeasures, NOT disaster details
    context += '※一般的な質問のため、これらの対策を参考に一般的なアドバイスをしてください。災害事例の詳細描写やURLは提示しないでください。\n';
    context += `※マッチした事例数: ${jireiCases.length}件\n`;
    jireiCases.slice(0, 8).forEach((jcase, index) => {
      // Show full measure text without truncation for better AI understanding
      const measure = jcase.measure.length > 300 ? jcase.measure.substring(0, 300) + '...' : jcase.measure;
      context += `\n${index + 1}. ${measure}\n`;
    });
  }

  return context;
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

// Generate system prompt with response length instruction
function getSystemPrompt(responseLength = 'short') {
  let lengthInstruction = '';

  if (responseLength === 'short') {
    lengthInstruction = '\n\n【回答の長さ】\n回答は簡潔に、300文字程度以内にまとめてください。要点を絞り、最も重要な情報のみを提供してください。';
  } else if (responseLength === 'long') {
    lengthInstruction = '\n\n【回答の長さ】\n文字数制限はありません。必要に応じて詳細な説明を提供してください。';
  }

  return SYSTEM_PROMPT + lengthInstruction;
}

// Call AI API based on provider
async function callAI(message, conversationHistory, knowledgeContext, selectedModel = 'gemini-2.5-flash', responseLength = 'short') {
  const userMessage = message + knowledgeContext;
  const systemPrompt = getSystemPrompt(responseLength);

  if (AI_PROVIDER === 'google') {
    // Google Gemini API
    // Set max tokens based on response length
    const maxOutputTokens = responseLength === 'long' ? 8192 : 2048;

    const model = aiClient.getGenerativeModel({
      model: selectedModel,
      systemInstruction: systemPrompt,
      generationConfig: {
        maxOutputTokens: maxOutputTokens,
        temperature: 0.7,
        topP: 0.95,
        topK: 40
      }
    });

    // Convert conversation history to Gemini format
    const history = conversationHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    try {
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(userMessage);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('[Gemini API Error]', error);
      console.error('[Gemini API Error Details]', {
        model: selectedModel,
        responseLength: responseLength,
        maxOutputTokens: maxOutputTokens,
        errorMessage: error.message,
        errorStack: error.stack
      });
      throw new Error(`Gemini API エラー: ${error.message}`);
    }

  } else if (AI_PROVIDER === 'openai') {
    // OpenAI ChatGPT API
    const messages = [
      { role: 'system', content: systemPrompt },
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
      system: systemPrompt,
      messages: messages
    });

    return response.content[0].text;
  }

  throw new Error('無効なAIプロバイダーが設定されています');
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], model = 'gemini-2.5-flash', responseLength = 'short' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'メッセージが必要です' });
    }

    // Validate model for Google provider
    if (AI_PROVIDER === 'google') {
      const validModels = ['gemini-2.5-flash', 'gemini-2.5-pro'];
      if (!validModels.includes(model)) {
        return res.status(400).json({ error: '無効なモデルが指定されました' });
      }
    }

    // Validate response length
    const validLengths = ['short', 'long'];
    if (!validLengths.includes(responseLength)) {
      return res.status(400).json({ error: '無効な回答長さが指定されました' });
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
    console.log(`[Chat] Knowledge matched: ${relevantKnowledge.length} items`);

    // Load and search jirei cases
    const jireiCases = await loadJireiCases();
    const relevantJirei = searchJireiCases(jireiCases, message);
    const jireiContext = formatJireiContext(relevantJirei, message);
    console.log(`[Chat] Jirei cases matched: ${relevantJirei.length} cases`);
    if (relevantJirei.length > 0) {
      console.log(`[Chat] Top 3 jirei titles: ${relevantJirei.slice(0, 3).map(j => j.title).join(' | ')}`);
    }

    // Load and search laws
    const laws = await loadLaws();
    const relevantLaws = searchLaws(laws, message);
    const lawsContext = formatLawsContext(relevantLaws, message);
    console.log(`[Chat] Laws matched: ${relevantLaws.length} articles`);
    if (relevantLaws.length > 0) {
      console.log(`[Chat] Top 3 laws: ${relevantLaws.slice(0, 3).map(l => `${l.law} ${l.articleNumber}`).join(' | ')}`);
    }

    // Combine contexts
    const combinedContext = knowledgeContext + jireiContext + lawsContext;

    // Log context size for debugging
    const contextSize = combinedContext.length;
    console.log(`[Chat] Using model: ${model}, Response length: ${responseLength}`);
    console.log(`[Chat] Context size: ${contextSize} characters`);

    if (contextSize > 30000) {
      console.warn(`[Chat] Warning: Large context size (${contextSize} chars). This may cause issues with Gemini API.`);
    }

    const reply = await callAI(message, conversationHistory, combinedContext, model, responseLength);

    res.json({
      reply,
      knowledgeUsed: relevantKnowledge.length > 0,
      knowledgeCount: relevantKnowledge.length,
      jireiUsed: relevantJirei.length > 0,
      jireiCount: relevantJirei.length,
      lawsUsed: relevantLaws.length > 0,
      lawsCount: relevantLaws.length,
      provider: AI_PROVIDER,
      model: model,
      responseLength: responseLength
    });

  } catch (error) {
    console.error('[Chat Error]', error);
    console.error('[Chat Error Stack]', error.stack);

    // Provide user-friendly error messages
    let userMessage = 'チャット処理中にエラーが発生しました';

    if (error.message.includes('Gemini API')) {
      userMessage = 'AI応答の生成中にエラーが発生しました。';
      if (model === 'gemini-2.5-pro' && responseLength === 'long') {
        userMessage += ' Gemini 2.5 Flashモデルまたは「簡潔」モードをお試しください。';
      }
    } else if (error.message.includes('timeout')) {
      userMessage = 'リクエストがタイムアウトしました。もう一度お試しください。';
    } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
      userMessage = 'APIの利用制限に達しました。しばらく待ってから再度お試しください。';
    }

    res.status(500).json({
      error: userMessage,
      details: error.message,
      suggestion: model === 'gemini-2.5-pro' && responseLength === 'long'
        ? 'Gemini 2.5 Flashモデルまたは「簡潔」モードの使用をお勧めします。'
        : null
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
