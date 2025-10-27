const fs = require('fs');
const path = require('path');

// Load knowledge base
const KNOWLEDGE_PATH = path.join(__dirname, 'data/knowledge.json');
const knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));

// 日本語クエリを単語に分割する関数
function splitJapaneseQuery(query) {
  const queryLower = query.toLowerCase();

  // まずスペースやカンマで分割
  let words = queryLower.split(/[\s,、]+/).filter(word => word.length > 1);

  // 各単語が長すぎる場合（4文字以上）、2-3文字のN-gramに分割して追加
  const expandedWords = [];
  words.forEach(word => {
    expandedWords.push(word); // 元の単語を追加

    if (word.length >= 4) {
      // 2文字のN-gramを追加
      for (let i = 0; i <= word.length - 2; i++) {
        const bigram = word.substring(i, i + 2);
        if (!expandedWords.includes(bigram)) {
          expandedWords.push(bigram);
        }
      }

      // 3文字のN-gramを追加（長い単語の場合）
      if (word.length >= 5) {
        for (let i = 0; i <= word.length - 3; i++) {
          const trigram = word.substring(i, i + 3);
          if (!expandedWords.includes(trigram)) {
            expandedWords.push(trigram);
          }
        }
      }
    }
  });

  return expandedWords;
}

// Search knowledge base
function searchKnowledge(knowledge, query) {
  const results = [];
  const queryLower = query.toLowerCase();

  // クエリを単語に分割（日本語対応の分割）
  const queryWords = splitJapaneseQuery(query);

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

      // カテゴリー別のボーナススコア
      if (category.name === '災害事例集' && relevance > 0) {
        // 災害事例の場合、スコアを少し上げる
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

// Test queries
const testQueries = [
  '事務所で起こりやすい労働災害の例を教えてください',
  '転倒災害事例',
  '階段転落'
];

console.log('=== 検索テスト ===\n');

testQueries.forEach(query => {
  console.log(`クエリ: "${query}"`);
  const results = searchKnowledge(knowledge, query);
  console.log(`検索結果数: ${results.length}`);

  if (results.length > 0) {
    console.log('\nTop 5 結果:');
    results.slice(0, 5).forEach((result, index) => {
      console.log(`\n${index + 1}. [スコア: ${result.relevance}] [カテゴリ: ${result.category}]`);
      console.log(`   質問: ${result.question.substring(0, 80)}...`);
      console.log(`   キーワード: ${result.keywords.join(', ')}`);
    });
  } else {
    console.log('  ❌ 結果が見つかりませんでした');
  }

  console.log('\n' + '='.repeat(80) + '\n');
});
