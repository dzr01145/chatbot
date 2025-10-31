// Convert structured law markdown files to JSON
const fs = require('fs').promises;
const path = require('path');

const LAWS_DIR = path.join(__dirname, '../data/structured-laws');
const JSON_PATH = path.join(__dirname, '../data/laws.json');

async function convertLawsToJson() {
  console.log('Reading law markdown files...');

  const laws = [];
  const categories = ['aneihou', 'kisoku', 'sekourei'];
  const categoryNames = {
    'aneihou': '労働安全衛生法',
    'kisoku': '労働安全衛生規則',
    'sekourei': '労働安全衛生法施行令'
  };

  for (const category of categories) {
    const categoryDir = path.join(LAWS_DIR, category);
    console.log(`Processing ${categoryNames[category]}...`);

    try {
      const files = await fs.readdir(categoryDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const filePath = path.join(categoryDir, file);
        const content = await fs.readFile(filePath, 'utf8');

        // Check for BOM and remove it
        const cleanContent = content.replace(/^\uFEFF/, '');

        const parsed = parseLawMarkdown(cleanContent, categoryNames[category]);
        if (parsed) {
          laws.push(parsed);
        }
      }

      console.log(`  ✓ Processed ${mdFiles.length} articles`);
    } catch (error) {
      console.error(`  Error processing ${category}:`, error.message);
    }
  }

  console.log(`\n✓ Total articles parsed: ${laws.length}`);

  // Create optimized structure
  const optimized = {
    version: '1.0',
    generated: new Date().toISOString(),
    totalArticles: laws.length,
    laws: laws
  };

  console.log('Writing to laws.json...');
  await fs.writeFile(JSON_PATH, JSON.stringify(optimized, null, 2), 'utf8');

  const stats = await fs.stat(JSON_PATH);
  console.log(`\n✓ Created laws.json (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`✓ Total articles: ${laws.length}`);
}

function parseLawMarkdown(content, category) {
  try {
    // Normalize line endings (Windows CRLF to LF)
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Parse YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      return null;
    }

    // Extract article title
    const titleMatch = content.match(/^# (.+)$/m);
    if (!titleMatch) {
      return null;
    }
    const title = titleMatch[1].trim();

    // Extract metadata
    const lawMatch = content.match(/\*\*法令:\*\* (.+)$/m);
    const articleMatch = content.match(/\*\*条文番号:\*\* (.+)$/m);
    const chapterMatch = content.match(/\*\*章:\*\* (.+)$/m);

    // Extract article content (everything after "## 条文")
    const contentMatch = content.match(/## 条文\s*\n([\s\S]+?)$/);
    const articleContent = contentMatch ? contentMatch[1].trim() : '';

    if (!articleContent) {
      return null;
    }

    // Extract tags
    const tags = [];
    const tagMatches = yamlMatch[1].matchAll(/  - (.+)$/gm);
    for (const match of tagMatches) {
      tags.push(match[1].trim());
    }

    return {
      category: category,
      law: lawMatch ? lawMatch[1].trim() : category,
      articleNumber: articleMatch ? articleMatch[1].trim() : '',
      chapter: chapterMatch ? chapterMatch[1].trim() : '',
      title: title,
      content: articleContent,
      tags: tags
    };
  } catch (error) {
    console.error('Parse error:', error.message);
    return null;
  }
}

convertLawsToJson().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
