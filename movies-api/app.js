import 'dotenv/config';              // carrega .env se existir
import express from 'express';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

const {
  MYSQL_HOST,
  MYSQL_PORT = 3306,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE = 'movies',
  PORT = 3000
} = process.env;

let pool;

// tenta criar o database (se o usuário tiver permissão). se não tiver, segue em frente.
async function ensureDatabase() {
  try {
    const conn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: Number(MYSQL_PORT),
      user: MYSQL_USER,
      password: MYSQL_PASSWORD
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\``);
    await conn.end();
  } catch (e) {
    console.warn('[init] não consegui criar o database (sem permissão?), seguindo…', e.message);
  }
}

async function init() {
  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_PASSWORD) {
    console.error('Faltam variáveis de ambiente MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD');
    process.exit(1);
  }

  await ensureDatabase();

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    connectionLimit: 5
  });

  await pool.query(`CREATE TABLE IF NOT EXISTS movies (
    id CHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    genre VARCHAR(100),
    year INT,
    rating DECIMAL(3,1)
  )`);
  console.log('[init] banco e tabela prontos');
}

// health
app.get('/health', (_req, res) => res.json({ ok: true }));

// CREATE
app.post('/movies', async (req, res) => {
  try {
    const { title, genre, year, rating } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title é obrigatório' });
    const id = uuidv4();
    await pool.query(
      'INSERT INTO movies (id, title, genre, year, rating) VALUES (?, ?, ?, ?, ?)',
      [id, title, genre ?? null, year ?? null, rating ?? null]
    );
    res.status(201).json({ id, title, genre, year, rating });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// READ (list)
app.get('/movies', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM movies ORDER BY title');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// READ (by id)
app.get('/movies/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM movies WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPDATE
app.put('/movies/:id', async (req, res) => {
  try {
    const { title, genre, year, rating } = req.body || {};
    const fields = [], vals = [];
    if (title !== undefined) { fields.push('title = ?'); vals.push(title); }
    if (genre !== undefined) { fields.push('genre = ?'); vals.push(genre); }
    if (year  !== undefined) { fields.push('year = ?');  vals.push(year); }
    if (rating!== undefined) { fields.push('rating = ?');vals.push(rating); }
    if (!fields.length) return res.status(400).json({ error: 'no fields' });
    vals.push(req.params.id);

    const [r] = await pool.query(`UPDATE movies SET ${fields.join(', ')} WHERE id = ?`, vals);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'not found' });

    const [rows] = await pool.query('SELECT * FROM movies WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
app.delete('/movies/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM movies WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

init()
  .then(() => app.listen(Number(PORT), () => console.log(`movies-api on :${PORT}`)))
  .catch(err => { console.error('Init error:', err); process.exit(1); });
