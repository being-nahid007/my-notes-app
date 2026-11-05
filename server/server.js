'use strict';
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.NOTES_KEY || '';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const WWW_DIR = path.join(__dirname, '..', 'www');

const MAX_NOTES = 5000;
const DAY = 24 * 60 * 60 * 1000;

// ---- storage (tiny JSON file, written atomically) ----
const store = new Map();

function loadStore() {
  try {
    const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(list)) {
      for (const raw of list) {
        const n = sanitize(raw);
        if (n) store.set(n.id, n);
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Could not read data file, starting empty:', e.message);
  }
}

function persist() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify([...store.values()]));
  fs.renameSync(tmp, DATA_FILE);
}

function sanitize(n) {
  if (!n || typeof n !== 'object') return null;
  if (typeof n.id !== 'string' || !/^[\w-]{1,64}$/.test(n.id)) return null;
  let updatedAt = Number(n.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  if (updatedAt > Date.now() + DAY) updatedAt = Date.now();
  return {
    id: n.id,
    title: typeof n.title === 'string' ? n.title.slice(0, 200) : '',
    body: typeof n.body === 'string' ? n.body.slice(0, 100000) : '',
    pinned: n.pinned === true,
    deleted: n.deleted === true,
    updatedAt,
  };
}

// ---- app ----
const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '5mb' }));

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireKey(req, res, next) {
  if (!API_KEY) return next();
  if (safeEqual(req.get('x-api-key') || '', API_KEY)) return next();
  res.status(401).json({ error: 'Invalid API key' });
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/notes', requireKey, (req, res) => {
  res.json({ notes: [...store.values()].filter((n) => !n.deleted) });
});

// Client sends all its notes; server keeps the newer version of each note
// and replies with the merged list.
app.post('/api/sync', requireKey, (req, res) => {
  const incoming = req.body && req.body.notes;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'notes must be an array' });
  if (incoming.length > MAX_NOTES) return res.status(413).json({ error: 'Too many notes' });

  let changed = false;
  for (const raw of incoming) {
    const n = sanitize(raw);
    if (!n) continue;
    const current = store.get(n.id);
    if (!current || n.updatedAt > current.updatedAt) {
      store.set(n.id, n);
      changed = true;
    }
  }
  try {
    if (changed) persist();
  } catch (e) {
    console.error('Write failed:', e.message);
    return res.status(500).json({ error: 'Server could not save data' });
  }
  res.json({ notes: [...store.values()], serverTime: Date.now() });
});

// Also serve the web app, so the same server works as a PWA host.
if (fs.existsSync(WWW_DIR)) app.use(express.static(WWW_DIR));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

loadStore();
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Notes server running on port ${PORT}${API_KEY ? ' (API key required)' : ' (no API key set)'}`);
  });
}
module.exports = app;
