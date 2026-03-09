const fs = require('fs');
const path = require('path');
const db = require('../db');

async function run() {
  try {
    const migrationFiles = fs
      .readdirSync(__dirname)
      .filter((name) => name.endsWith('.sql'))
      .sort();

    const files = [
      ...migrationFiles.filter((name) => name === 'init.sql'),
      ...migrationFiles.filter((name) => name !== 'init.sql')
    ];

    for (const file of files) {
      const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      await db.pool.query(sql);
      console.log(`Applied migration: ${file}`);
    }

    console.log('Migrations applied');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

run();
