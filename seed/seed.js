const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function seed() {
  try {
    const superEmail = process.env.SUPER_ADMIN_EMAIL;
    if (!superEmail) {
      console.error('Set SUPER_ADMIN_EMAIL in .env');
      process.exit(1);
    }
    const existing = await db.query('SELECT * FROM users WHERE email=$1', [superEmail]);
    if (existing.rowCount === 0) {
      const id = uuidv4();
      const pass = await bcrypt.hash('SuperStrongPassword123!', 10);
      await db.query('INSERT INTO users(id,email,password,role) VALUES($1,$2,$3,$4)', [id, superEmail, pass, 'super']);
      console.log('Seeded super admin:', superEmail);
    } else {
      console.log('Super admin already exists');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
