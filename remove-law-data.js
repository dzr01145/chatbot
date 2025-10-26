const fs = require('fs');
const path = require('path');

// ファイルパス
const knowledgePath = path.join(__dirname, 'data', 'knowledge.json');
const backupPath = path.join(__dirname, 'data', 'knowledge.backup.json');

async function main() {
  try {
    console.log('既存のknowledge.jsonを読み込み中...');
    const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));

    // バックアップを作成
    console.log('バックアップを作成中...');
    fs.writeFileSync(backupPath, JSON.stringify(knowledge, null, 2), 'utf8');
    console.log(`✓ バックアップ作成: ${backupPath}`);

    // 法律・規則カテゴリーを削除
    const lawCategoryIndex = knowledge.categories.findIndex(cat => cat.id === 'laws');

    if (lawCategoryIndex !== -1) {
      const lawCount = knowledge.categories[lawCategoryIndex].items.length;
      console.log(`\n法令データを削除中: ${lawCount}件`);

      // 法令カテゴリーを配列から削除
      knowledge.categories.splice(lawCategoryIndex, 1);

      console.log(`✓ 法令カテゴリーを削除しました`);
    } else {
      console.log('\n法律・規則カテゴリーが見つかりません。');
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

    console.log('\n=== 法令データ削除完了 ===');
    console.log('法令カテゴリーは完全に削除されました。');
    console.log('災害事例およびその他のデータは保持されています。');

  } catch (error) {
    console.error('エラー:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
