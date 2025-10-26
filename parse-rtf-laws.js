const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// RTFファイルのパス
const files = {
  aneihou: { path: 'aneihou_correct.rtf', name: '労働安全衛生法', lawId: '347AC0000000057' },
  sekourei: { path: 'sekourei_correct.rtf', name: '労働安全衛生法施行令', lawId: '347CO0000000318' },
  kisoku: { path: 'kisoku_correct.rtf', name: '労働安全衛生規則', lawId: '347M50002000032' }
};

// RTFからテキストを抽出（Unicode対応）
function extractTextFromRTF(rtfContent) {
  let text = rtfContent;

  // \uNNNNN形式のUnicodeエスケープをデコード
  text = text.replace(/\\u(-?\d+)/g, (match, code) => {
    const codePoint = parseInt(code);
    // 負の値の場合は65536を加算（RTF仕様）
    const actualCode = codePoint < 0 ? 65536 + codePoint : codePoint;
    try {
      return String.fromCharCode(actualCode);
    } catch (e) {
      return '';
    }
  });

  // RTF制御コードを削除
  text = text.replace(/\\[a-z]+(-?\d+)?[ ]?/gi, ' ');
  text = text.replace(/[{}]/g, ' ');
  text = text.replace(/\\par/g, '\n');

  // 複数の空白を整理
  text = text.replace(/\s+/g, ' ');

  return text;
}

// 漢数字をアラビア数字に変換
function kanjiToNumber(kanji) {
  const kanjiMap = {
    '〇': 0, '零': 0,
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000
  };

  let result = 0;
  let temp = 0;
  let unit = 1;

  for (let i = kanji.length - 1; i >= 0; i--) {
    const char = kanji[i];
    const val = kanjiMap[char];

    if (val >= 10) {
      unit = val;
      if (temp === 0) temp = 1;
      result += temp * unit;
      temp = 0;
    } else {
      temp += val * unit;
    }
  }

  result += temp;
  return result;
}

// 条文を抽出する関数
function extractArticles(text, lawName, lawId) {
  const articles = [];

  // 条文パターンマッチング（漢数字とアラビア数字の両方に対応）
  const articlePattern = /第([一二三四五六七八九十百千〇零0-9]+)条(?:の([一二三四五六七八九十0-9]+))?\s*(?:[（\(]([^）\)]+)[）\)])?/g;

  const matches = [];
  let match;

  while ((match = articlePattern.exec(text)) !== null) {
    const articleNumKanji = match[1];
    const articleSubNumKanji = match[2];

    // 漢数字をアラビア数字に変換
    let articleNum = /^[0-9]+$/.test(articleNumKanji) ?
      articleNumKanji : kanjiToNumber(articleNumKanji).toString();

    if (articleSubNumKanji) {
      const subNum = /^[0-9]+$/.test(articleSubNumKanji) ?
        articleSubNumKanji : kanjiToNumber(articleSubNumKanji).toString();
      articleNum += `の${subNum}`;
    }

    matches.push({
      index: match.index,
      articleNum: articleNum,
      articleNumDisplay: match[1] + (match[2] ? `の${match[2]}` : ''),
      title: match[3] || '',
      fullMatch: match[0]
    });
  }

  console.log(`  条文パターン検出: ${matches.length}件`);
  if (matches.length > 0) {
    console.log(`  例: ${matches[0].fullMatch}, ${matches.slice(-1)[0].fullMatch}`);
  }

  // 各条文の内容を抽出
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    const startIndex = current.index + current.fullMatch.length;
    const endIndex = next ? next.index : Math.min(current.index + 800, text.length);

    let content = text.substring(startIndex, endIndex).trim();

    // 不要な制御文字を削除
    content = content.replace(/[\r\n\t]+/g, ' ');
    content = content.replace(/\s+/g, ' ');

    // 最初の段落を取得（次の項目番号まで）
    const paragraphMatch = content.match(/^([^一二三四五六七八九十2-9]+)/);
    if (paragraphMatch) {
      content = paragraphMatch[1].trim();
    }

    // 文の終わりで切る
    const sentenceEnd = content.indexOf('。');
    if (sentenceEnd > 0 && sentenceEnd < 300) {
      content = content.substring(0, sentenceEnd + 1);
    } else if (content.length > 250) {
      content = content.substring(0, 247) + '...';
    }

    // 内容が短すぎる場合はスキップ
    if (content.length < 15) {
      continue;
    }

    // URL生成
    const urlArticleNum = current.articleNum.replace('の', '_');
    const url = `https://laws.e-gov.go.jp/law/${lawId}#Mp-At_${urlArticleNum}`;

    const keywords = ['法令', lawName];
    if (current.title) keywords.push(current.title);
    keywords.push(`第${current.articleNum}条`);
    keywords.push(`第${current.articleNumDisplay}条`);

    const article = {
      question: `【法令】${lawName} 第${current.articleNum}条${current.title ? `（${current.title}）` : ''}`,
      answer: `${content}\n詳細: ${url}`,
      keywords: keywords
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

      const rtfContent = fs.readFileSync(fileInfo.path, 'utf8');
      const text = extractTextFromRTF(rtfContent);

      console.log(`  抽出したテキスト長: ${text.length}文字`);

      // 「第」を含む部分を探す
      const daiIndex = text.indexOf('第');
      if (daiIndex >= 0) {
        console.log(`  「第」検出位置: ${daiIndex}`);
        console.log(`  サンプル: ${text.substring(daiIndex, daiIndex + 100)}...`);
      } else {
        console.log(`  「第」が見つかりませんでした`);
        console.log(`  テキストサンプル: ${text.substring(5000, 5150)}...`);
      }

      const articles = extractArticles(text, fileInfo.name, fileInfo.lawId);
      console.log(`  抽出した条文数: ${articles.length}`);

      if (articles.length > 0) {
        console.log(`  最初の条文: ${articles[0].question}`);
        console.log(`  内容サンプル: ${articles[0].answer.substring(0, 100)}...`);
      }

      allArticles.push(...articles);
    }

    if (allArticles.length === 0) {
      console.log('\n警告: 条文が抽出できませんでした');
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
      console.log(`   ${article.answer.substring(0, 150)}...`);
    });

    // 統計情報
    const lawStats = {};
    for (const [key, fileInfo] of Object.entries(files)) {
      const count = allArticles.filter(a => a.question.includes(fileInfo.name)).length;
      lawStats[fileInfo.name] = count;
    }

    console.log('\n--- 法令別統計 ---');
    Object.entries(lawStats).forEach(([name, count]) => {
      console.log(`${name}: ${count}件`);
    });

  } catch (error) {
    console.error('エラー:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
