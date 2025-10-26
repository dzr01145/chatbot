const fs = require('fs');
const path = require('path');

// Search knowledge base function (copied from server.js)
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

  // Sort by relevance (high to low)
  return results.sort((a, b) => b.relevance - a.relevance);
}

async function main() {
  const knowledgePath = path.join(__dirname, 'data', 'knowledge.json');
  const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

  const query = '事務所で起こりやすい労働災害';

  console.log(`検索クエリ: "${query}"\n`);

  const results = searchKnowledge(knowledge, query);

  console.log(`検索結果: ${results.length}件\n`);
  console.log('--- トップ10件 ---\n');

  results.slice(0, 10).forEach((item, index) => {
    console.log(`[${index + 1}] スコア: ${item.relevance}`);
    console.log(`カテゴリー: ${item.category}`);
    console.log(`質問: ${item.question}`);
    console.log(`回答: ${item.answer.substring(0, 150)}...`);

    // URLを抽出
    const urlMatch = item.answer.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      console.log(`URL: ${urlMatch[0]}`);
    } else {
      console.log('URL: なし');
    }
    console.log('');
  });

  // 災害事例のみに絞る
  const disasterCases = results.filter(item => item.category === '災害事例集');
  console.log(`\n災害事例のみ: ${disasterCases.length}件`);
  console.log('\n--- 災害事例トップ5件 ---\n');

  disasterCases.slice(0, 5).forEach((item, index) => {
    console.log(`[${index + 1}] スコア: ${item.relevance}`);
    console.log(`質問: ${item.question}`);
    console.log(`キーワード: ${item.keywords.join(', ')}`);

    // URLを抽出
    const urlMatch = item.answer.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      console.log(`URL: ${urlMatch[0]}`);
    }
    console.log('');
  });
}

main();
