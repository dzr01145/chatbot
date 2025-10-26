const fs = require('fs');
const path = require('path');

// ファイルパス
const knowledgePath = path.join(__dirname, 'data', 'knowledge.json');
const extractedLawsPath = path.join(__dirname, 'extracted-laws.json');
const backupPath = path.join(__dirname, 'data', 'knowledge.backup.json');

async function main() {
  try {
    console.log('既存のknowledge.jsonを読み込み中...');
    const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

    // バックアップを作成
    console.log('バックアップを作成中...');
    fs.writeFileSync(backupPath, JSON.stringify(knowledge, null, 2), 'utf8');
    console.log(`✓ バックアップ作成: ${backupPath}`);

    // 抽出した法令データを読み込み
    console.log('\n抽出した法令データを読み込み中...');
    const extractedLaws = JSON.parse(fs.readFileSync(extractedLawsPath, 'utf8'));
    console.log(`✓ ${extractedLaws.length}件の法令条文を読み込みました`);

    // 法律・規則カテゴリーを探す
    const lawCategory = knowledge.categories.find(cat => cat.id === 'laws');

    if (lawCategory) {
      console.log(`\n現在の法令データ: ${lawCategory.items.length}件`);

      // 既存の法令データを新しいデータで置き換え
      const newLawItems = extractedLaws.map((law) => ({
        question: law.question,
        answer: law.answer,
        keywords: law.keywords
      }));

      lawCategory.items = newLawItems;
      console.log(`✓ 法令データを更新: ${newLawItems.length}件`);

    } else {
      console.log('\n法律・規則カテゴリーが見つかりません。新規作成します。');

      // 新しいカテゴリーを作成
      const newLawItems = extractedLaws.map((law) => ({
        question: law.question,
        answer: law.answer,
        keywords: law.keywords
      }));

      knowledge.categories.push({
        id: 'laws',
        name: '法律・規則',
        items: newLawItems
      });

      console.log(`✓ 新しい法令カテゴリーを作成: ${newLawItems.length}件`);
    }

    // 統計情報を表示
    console.log('\n=== 更新後の統計 ===');
    let totalItems = 0;
    knowledge.categories.forEach(cat => {
      const itemCount = cat.items.length;
      console.log(`${cat.name}: ${itemCount}件`);
      totalItems += itemCount;
    });
    console.log(`総アイテム数: ${totalItems}件`);

    // 保存
    console.log('\nknowledge.jsonを保存中...');
    fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2), 'utf8');
    console.log('✓ 保存完了');

    // 検証
    console.log('\n検証中...');
    const verifyKnowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
    const lawCategory2 = verifyKnowledge.categories.find(cat => cat.id === 'laws');
    console.log(`✓ 法令アイテム数: ${lawCategory2.items.length}件`);

    // サンプルを表示
    console.log('\n--- サンプル（最初の3件）---');
    lawCategory2.items.slice(0, 3).forEach((item, i) => {
      console.log(`\n${i + 1}. ${item.question}`);
      console.log(`   ${item.answer.substring(0, 100)}...`);
    });

  } catch (error) {
    console.error('エラー:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
