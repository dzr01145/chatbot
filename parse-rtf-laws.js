const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// RTFファイルのパス
const files = {
  aneihou: { path: 'aneihou.rtf', name: '労働安全衛生法', lawId: '347AC0000000057' },
  sekourei: { path: 'sekourei.rtf', name: '労働安全衛生法施行令', lawId: '347CO0000000318' },
  kisoku: { path: 'kisoku.rtf', name: '労働安全衛生規則', lawId: '347M50002000032' }
};

// RTFからテキストを抽出（Shift-JIS対応）
function extractTextFromRTF(buffer) {
  let text = '';
  let i = 0;

  while (i < buffer.length) {
    // \'XX 形式のエスケープシーケンスを検出
    if (buffer[i] === 0x5C && buffer[i + 1] === 0x27) { // \'
      const hex = buffer.toString('ascii', i + 2, i + 4);
      const byte = parseInt(hex, 16);

      // 次のバイトも確認（Shift-JISは2バイト文字）
      if (i + 6 < buffer.length &&
        buffer[i + 4] === 0x5C &&
        buffer[i + 5] === 0x27) {
        const hex2 = buffer.toString('ascii', i + 6, i + 8);
        const byte2 = parseInt(hex2, 16);

        // 2バイト文字として変換
        const sjisBytes = Buffer.from([byte, byte2]);
        try {
          text += iconv.decode(sjisBytes, 'shift_jis');
          i += 8;
          continue;
        } catch (e) {
          // 変換失敗時は次へ
        }
      }

      i += 4;
    }
    // 通常のASCII文字
    else if (buffer[i] >= 0x20 && buffer[i] < 0x7F && buffer[i] !== 0x5C && buffer[i] !== 0x7B && buffer[i] !== 0x7D) {
      text += String.fromCharCode(buffer[i]);
      i++;
    }
    // その他の制御文字はスキップ
    else {
      i++;
    }
  }

  return text;
}

// 条文を抽出する関数
function extractArticles(text, lawName, lawId) {
  const articles = [];

  // 条文パターンマッチング
  const articlePattern = /第([0-9]+)条(?:の([0-9]+))?\s*(?:[（\(]([^）\)]+)[）\)])?/g;

  const matches = [];
  let match;

  while ((match = articlePattern.exec(text)) !== null) {
    matches.push({
      index: match.index,
      articleNum: match[1] + (match[2] ? `の${match[2]}` : ''),
      title: match[3] || '',
      fullMatch: match[0]
    });
  }

  // 各条文の内容を抽出
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const startIndex = current.index + current.fullMatch.length;
    const endIndex = next ? next.index : Math.min(current.index + 500, text.length);

    let content = text.substring(startIndex, endIndex).trim();

    // 不要な制御文字を削除
    content = content.replace(/[\r\n\t]+/g, ' ');
    content = content.replace(/\s+/g, ' ');

    // 最初の文または段落を取得
    const firstSentence = content.split(/[。\n]/)[0];
    if (firstSentence && firstSentence.length > 10) {
      content = firstSentence + '。';
    }

    // 内容が短すぎる場合はスキップ
    if (content.length < 15) {
      continue;
    }

    // URL生成
    const urlArticleNum = current.articleNum.replace('の', '_');
    const url = `https://laws.e-gov.go.jp/law/${lawId}#Mp-At_${urlArticleNum}`;

    const article = {
      question: `【法令】${lawName} 第${current.articleNum}条${current.title ? `（${current.title}）` : ''}`,
      answer: `${content}\n詳細: ${url}`,
      keywords: ['法令', lawName, current.title || '条文', `第${current.articleNum}条`].filter(Boolean)
    };

    articles.push(article);
  }

  return articles;
}

// メイン処理
async function main() {
  try {
    const allArticles = [];

    // 各ファイルを処理
    for (const [key, fileInfo] of Object.entries(files)) {
      console.log(`\n${fileInfo.name}を処理中...`);

      const buffer = fs.readFileSync(fileInfo.path);
      console.log(`  ファイルサイズ: ${buffer.length} bytes`);

      const text = extractTextFromRTF(buffer);
      console.log(`  抽出したテキスト長: ${text.length}文字`);

      // テキストサンプルを表示
      console.log(`  テキストサンプル: ${text.substring(0, 100)}...`);

      const articles = extractArticles(text, fileInfo.name, fileInfo.lawId);
      console.log(`  抽出した条文数: ${articles.length}`);

      if (articles.length > 0) {
        console.log(`  最初の条文: ${articles[0].question}`);
      }

      allArticles.push(...articles);
    }

    if (allArticles.length === 0) {
      console.log('\n警告: 条文が抽出できませんでした');
      console.log('手動で確認が必要です');
      return;
    }

    console.log(`\n=== 結果 ===`);
    console.log(`合計 ${allArticles.length} 件の条文を抽出しました`);

    // 出力ファイルに保存
    const outputPath = path.join(__dirname, 'extracted-laws.json');
    fs.writeFileSync(outputPath, JSON.stringify(allArticles, null, 2), 'utf8');

    console.log(`✓ extracted-laws.json に保存しました`);

    // サンプルを表示
    console.log('\n--- サンプル（最初の5件）---');
    allArticles.slice(0, 5).forEach((article, i) => {
      console.log(`\n${i + 1}. ${article.question}`);
      console.log(`   ${article.answer.substring(0, 120)}...`);
    });

  } catch (error) {
    console.error('エラー:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
