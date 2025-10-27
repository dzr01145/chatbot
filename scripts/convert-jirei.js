// Convert jirei.csv to optimized JSON format
const fs = require('fs').promises;
const path = require('path');

const CSV_PATH = path.join(__dirname, '../data/jirei.csv');
const JSON_PATH = path.join(__dirname, '../data/jirei.json');

async function convertCsvToJson() {
  console.log('Reading jirei.csv...');
  const data = await fs.readFile(CSV_PATH, 'utf8');

  // Remove BOM if present
  const content = data.replace(/^\ufeff/, '');

  console.log('Parsing CSV with proper handling of multiline fields...');

  const cases = parseCSV(content);

  console.log(`\nSuccessfully parsed ${cases.length} cases`);

  // Create optimized structure with keyword index
  const optimized = {
    version: '1.0',
    generated: new Date().toISOString(),
    totalCases: cases.length,
    cases: cases
  };

  console.log('\nWriting to jirei.json...');
  await fs.writeFile(JSON_PATH, JSON.stringify(optimized, null, 2), 'utf8');

  const stats = await fs.stat(JSON_PATH);
  console.log(`\n✓ Created jirei.json (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`✓ Total cases: ${cases.length}`);
}

function parseCSV(content) {
  const rows = [];
  const length = content.length;
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Skip header line
  while (i < length && content[i] !== '\n') {
    i++;
  }
  i++; // Skip the newline after header

  let recordCount = 0;

  while (i < length) {
    const char = content[i];

    if (char === '"') {
      // Check if it's an escaped quote
      if (inQuotes && i + 1 < length && content[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      i++;
    } else if (char === '\n' && !inQuotes) {
      row.push(field);
      field = '';

      // Process complete row
      if (row.length >= 6 && row[0].trim()) {
        rows.push({
          id: row[0].trim(),
          url: row[1].trim(),
          title: row[2].trim(),
          situation: row[3].trim(),
          cause: row[4].trim(),
          measure: row[5].trim(),
          industry: (row[6] || '').trim(),
          equipment: (row[7] || '').trim(),
          type: (row[8] || '').trim(),
          categorization: (row[9] || '').trim()
        });

        recordCount++;
        if (recordCount % 1000 === 0) {
          console.log(`Parsed ${recordCount} records...`);
        }
      }

      row = [];
      i++;
    } else if (char === '\r') {
      // Skip carriage return
      i++;
    } else {
      field += char;
      i++;
    }
  }

  // Handle last row if exists
  if (field || row.length > 0) {
    row.push(field);
    if (row.length >= 6 && row[0].trim()) {
      rows.push({
        id: row[0].trim(),
        url: row[1].trim(),
        title: row[2].trim(),
        situation: row[3].trim(),
        cause: row[4].trim(),
        measure: row[5].trim(),
        industry: (row[6] || '').trim(),
        equipment: (row[7] || '').trim(),
        type: (row[8] || '').trim(),
        categorization: (row[9] || '').trim()
      });
    }
  }

  return rows;
}

convertCsvToJson().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
