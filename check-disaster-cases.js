const fs = require('fs');
const path = require('path');

// ファイルパス
const knowledgePath = path.join(__dirname, 'data', 'knowledge.json');

async function main() {
  try {
    console.log('knowledge.jsonを読み込み中...');
    const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

    // 災害事例カテゴリーを探す
    const disasterCategory = knowledge.categories.find(cat => cat.id === 'disaster_cases');

    if (!disasterCategory) {
      console.log('災害事例カテゴリーが見つかりません。');
      return;
    }

    console.log(`\n=== 災害事例データ分析 ===`);
    console.log(`総件数: ${disasterCategory.items.length}件\n`);

    // 最初の10件を詳細チェック
    console.log('--- 最初の10件のサンプル ---\n');
    disasterCategory.items.slice(0, 10).forEach((item, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(`質問: ${item.question}`);
      console.log(`回答: ${item.answer.substring(0, 150)}...`);
      console.log(`キーワード: ${item.keywords.join(', ')}`);

      // URLを抽出
      const urlMatch = item.answer.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        console.log(`URL: ${urlMatch[0]}`);

        // joho_no パラメータを抽出
        const johoNoMatch = urlMatch[0].match(/joho_no=(\d+)/);
        if (johoNoMatch) {
          console.log(`  → joho_no: ${johoNoMatch[1]}`);
        } else {
          console.log(`  → ⚠️ joho_noパラメータが見つかりません`);
        }
      } else {
        console.log(`⚠️ URLが見つかりません`);
      }
    });

    // URL統計
    console.log('\n\n=== URL統計 ===');
    const urlStats = {
      total: 0,
      withURL: 0,
      withoutURL: 0,
      duplicateJohoNo: {},
      invalidURL: []
    };

    disasterCategory.items.forEach((item, index) => {
      urlStats.total++;

      const urlMatch = item.answer.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        urlStats.withURL++;

        // joho_no の重複チェック
        const johoNoMatch = urlMatch[0].match(/joho_no=(\d+)/);
        if (johoNoMatch) {
          const johoNo = johoNoMatch[1];
          if (!urlStats.duplicateJohoNo[johoNo]) {
            urlStats.duplicateJohoNo[johoNo] = [];
          }
          urlStats.duplicateJohoNo[johoNo].push(index + 1);
        } else {
          urlStats.invalidURL.push({
            index: index + 1,
            url: urlMatch[0],
            question: item.question
          });
        }
      } else {
        urlStats.withoutURL++;
      }
    });

    console.log(`総事例数: ${urlStats.total}件`);
    console.log(`URL有り: ${urlStats.withURL}件`);
    console.log(`URL無し: ${urlStats.withoutURL}件`);
    console.log(`不正なURL: ${urlStats.invalidURL.length}件`);

    // joho_no の重複チェック
    const duplicates = Object.entries(urlStats.duplicateJohoNo).filter(([_, indices]) => indices.length > 1);
    if (duplicates.length > 0) {
      console.log(`\n⚠️ joho_no の重複が見つかりました: ${duplicates.length}件`);
      console.log('\n--- 重複している joho_no ---');
      duplicates.slice(0, 5).forEach(([johoNo, indices]) => {
        console.log(`joho_no=${johoNo}: ${indices.length}件の重複 (事例番号: ${indices.slice(0, 5).join(', ')}${indices.length > 5 ? '...' : ''})`);
      });
    } else {
      console.log(`\n✓ joho_no の重複はありません`);
    }

    // 不正なURLがあれば表示
    if (urlStats.invalidURL.length > 0) {
      console.log(`\n--- 不正なURL（joho_noパラメータ無し）---`);
      urlStats.invalidURL.slice(0, 5).forEach(item => {
        console.log(`[${item.index}] ${item.question}`);
        console.log(`  URL: ${item.url}`);
      });
    }

    // joho_no の範囲をチェック
    const johoNos = Object.keys(urlStats.duplicateJohoNo).map(n => parseInt(n)).sort((a, b) => a - b);
    if (johoNos.length > 0) {
      console.log(`\n--- joho_no の範囲 ---`);
      console.log(`最小値: ${johoNos[0]}`);
      console.log(`最大値: ${johoNos[johoNos.length - 1]}`);
      console.log(`ユニーク数: ${johoNos.length}件`);
    }

  } catch (error) {
    console.error('エラー:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
