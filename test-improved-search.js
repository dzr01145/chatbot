const fs = require('fs');
const path = require('path');

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

// Search knowledge base function (updated)
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

  return results.sort((a, b) => b.relevance - a.relevance);
}

async function main() {
  const knowledgePath = path.join(__dirname, 'data', 'knowledge.json');
  const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

  const testQueries = ['階段転落事例', '階段', 'フォークリフト'];

  testQueries.forEach(query => {
    console.log(`\n========================================`);
    console.log(`検索クエリ: "${query}"`);
    console.log(`========================================`);

    const queryWords = splitJapaneseQuery(query);
    console.log(`分割された単語: [${queryWords.join(', ')}]\n`);

    const results = searchKnowledge(knowledge, query);
    console.log(`検索結果: ${results.length}件\n`);

    const disasterCases = results.filter(item => item.category === '災害事例集');
    console.log(`災害事例のみ: ${disasterCases.length}件\n`);

    if (disasterCases.length > 0) {
      console.log('--- 災害事例トップ5件 ---\n');
      disasterCases.slice(0, 5).forEach((item, index) => {
        console.log(`[${index + 1}] スコア: ${item.relevance}`);
        console.log(`質問: ${item.question}`);
        const urlMatch = item.answer.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          console.log(`URL: ${urlMatch[0]}`);
        }
        console.log('');
      });
    }
  });
}

main();
