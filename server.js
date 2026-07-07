#!/usr/bin/env node
/*
 * paper-cards — a tiny self-hosted shared task-card app.
 * Zero dependencies. Node 18+. All data lives in plain JSON files in ./data.
 *
 * Supports multiple workspaces: each passphrase opens its own workspace
 * (its own people, cards, archive). Data layout:
 *   data/workspaces/<id>/config.json, cards.json, archive.json, backups/
 *
 *   node server.js            → http://localhost:4321
 *   PORT=8080 node server.js  → custom port
 *   DATA_DIR=/somewhere node server.js → custom data location
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '4321', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const WS_DIR = path.join(DATA_DIR, 'workspaces');
const PUBLIC_DIR = path.join(__dirname, 'public');

fs.mkdirSync(WS_DIR, { recursive: true });

// ---------- helpers ----------
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const uid = () => crypto.randomBytes(8).toString('hex');

const DEFAULT_NAMES = { today: 'Now', next: 'Soon', someday: 'Later' };
const EMPTY_CARDS = () => ({ today: {}, next: { items: [] }, someday: { items: [] } });

function localDateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Atomic write: write to temp file then rename, so a crash can't corrupt data.
function writeJSON(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

// ---------- workspaces ----------
// ws = { id, dir, config, cards, clients:Set }
const workspaces = new Map();

function wsPaths(dir) {
  return {
    config: path.join(dir, 'config.json'),
    cards: path.join(dir, 'cards.json'),
    archive: path.join(dir, 'archive.json'),
    backups: path.join(dir, 'backups'),
  };
}

function loadWorkspace(id) {
  const dir = path.join(WS_DIR, id);
  const p = wsPaths(dir);
  const config = readJSON(p.config, null);
  if (!config) return null;
  if (!config.cardNames) config.cardNames = { ...DEFAULT_NAMES }; // migrate old configs
  fs.mkdirSync(p.backups, { recursive: true });
  const ws = { id, dir, config, cards: readJSON(p.cards, EMPTY_CARDS()), clients: new Set() };
  workspaces.set(id, ws);
  return ws;
}

// Migrate pre-workspace data (data/config.json etc.) into data/workspaces/main/
(function migrateLegacy() {
  const legacyConfig = path.join(DATA_DIR, 'config.json');
  if (!fs.existsSync(legacyConfig)) return;
  const dir = path.join(WS_DIR, 'main');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['config.json', 'cards.json', 'archive.json']) {
    const src = path.join(DATA_DIR, f);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(dir, f));
  }
  const legacyBackups = path.join(DATA_DIR, 'backups');
  if (fs.existsSync(legacyBackups)) fs.renameSync(legacyBackups, path.join(dir, 'backups'));
  console.log('migrated existing data into workspace "main"');
})();

for (const id of fs.readdirSync(WS_DIR)) {
  if (fs.statSync(path.join(WS_DIR, id)).isDirectory()) loadWorkspace(id);
}

const findByToken = (token) => [...workspaces.values()].find((w) => w.config.secretHash === token) || null;
const findBySecret = (secret) => findByToken(sha256(secret || ''));

function saveConfig(ws) {
  writeJSON(wsPaths(ws.dir).config, ws.config);
}

// One backup snapshot of cards.json per day per workspace (kept forever, tiny files).
function saveCards(ws) {
  const p = wsPaths(ws.dir);
  const b = path.join(p.backups, `cards-${localDateKey()}.json`);
  if (!fs.existsSync(b) && fs.existsSync(p.cards)) fs.copyFileSync(p.cards, b);
  writeJSON(p.cards, ws.cards);
}

function archiveItems(ws, items, from) {
  if (!items.length) return;
  const file = wsPaths(ws.dir).archive;
  const archive = readJSON(file, []);
  const now = new Date().toISOString();
  for (const it of items) archive.push({ ...it, archivedAt: now, from });
  writeJSON(file, archive);
}

// Ensure today's card exists; carry over unfinished items from the most recent card.
function ensureToday(ws) {
  const key = localDateKey();
  if (ws.cards.today[key]) return key;
  const prevKeys = Object.keys(ws.cards.today).sort();
  const prev = prevKeys.length ? ws.cards.today[prevKeys[prevKeys.length - 1]] : null;
  const carried = prev
    ? prev.items
        .filter((it) => !it.done)
        .map((it) => ({ ...it, id: uid(), carried: true, carries: (it.carries || 0) + 1 }))
    : [];
  ws.cards.today[key] = { items: carried };
  saveCards(ws);
  return key;
}

function getCard(ws, tab, dateKey) {
  if (tab === 'today') return ws.cards.today[dateKey || ensureToday(ws)];
  if (tab === 'next') return ws.cards.next;
  if (tab === 'someday') return ws.cards.someday;
  return null;
}

function publicState(ws) {
  const todayKey = ensureToday(ws);
  return { todayKey, users: ws.config.users, cardNames: ws.config.cardNames, cards: ws.cards };
}

// Every task, everywhere (cards + archive), flattened for history/export.
function allItems(ws) {
  const out = [];
  for (const [dateKey, card] of Object.entries(ws.cards.today))
    for (const it of card.items) out.push({ ...it, card: 'today', dateKey });
  for (const tab of ['next', 'someday'])
    for (const it of ws.cards[tab].items) out.push({ ...it, card: tab });
  for (const it of readJSON(wsPaths(ws.dir).archive, []))
    out.push({ ...it, card: (it.from || '').split(':')[0] || 'archive', archived: true });
  return out;
}

function csvEscape(v) {
  let s = v == null ? '' : String(v);
  // neutralize spreadsheet formula injection (=, +, -, @ prefixes)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- SSE ----------
function broadcast(ws) {
  const payload = `data: ${JSON.stringify(publicState(ws))}\n\n`;
  for (const res of ws.clients) res.write(payload);
}
setInterval(() => {
  for (const ws of workspaces.values()) for (const res of ws.clients) res.write(': ping\n\n');
}, 25000);

// ---------- http ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function send(res, code, body, type = 'application/json') {
  const data = type.startsWith('application/json') ? JSON.stringify(body) : body;
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function wsFromReq(req, url) {
  const token = req.headers['x-token'] || url.searchParams.get('token');
  return token ? findByToken(token) : null;
}

const okColor = (c, fallback) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // ---- API ----
    if (p === '/api/status') {
      return send(res, 200, { configured: workspaces.size > 0 });
    }

    // create a new workspace (always allowed — one per passphrase)
    if (p === '/api/setup' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.secret || String(body.secret).length < 4)
        return send(res, 400, { error: 'passphrase too short' });
      if (findBySecret(body.secret))
        return send(res, 409, { error: 'that passphrase already opens an existing workspace — pick a different one' });
      const users = {
        u1: { name: (body.u1name || 'Me').slice(0, 30), color: okColor(body.u1color, '#006eb8') },
      };
      // second person is optional — works solo, partner can be added later
      if (body.u2name && String(body.u2name).trim())
        users.u2 = { name: String(body.u2name).trim().slice(0, 30), color: okColor(body.u2color, '#8a3b2a') };

      const id = uid();
      const dir = path.join(WS_DIR, id);
      fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
      const config = { secretHash: sha256(body.secret), users, cardNames: { ...DEFAULT_NAMES } };
      writeJSON(wsPaths(dir).config, config);
      const ws = { id, dir, config, cards: EMPTY_CARDS(), clients: new Set() };
      workspaces.set(id, ws);
      saveCards(ws);
      return send(res, 200, { token: config.secretHash, state: publicState(ws) });
    }

    if (p === '/api/login' && req.method === 'POST') {
      if (!workspaces.size) return send(res, 409, { error: 'not configured' });
      const body = await readBody(req);
      const ws = findBySecret(body.secret);
      if (!ws) return send(res, 401, { error: 'wrong passphrase' });
      return send(res, 200, { token: ws.config.secretHash, state: publicState(ws) });
    }

    if (p === '/api/state') {
      const ws = wsFromReq(req, url);
      if (!ws) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, publicState(ws));
    }

    // chronological log of everything ever completed
    if (p === '/api/history') {
      const ws = wsFromReq(req, url);
      if (!ws) return send(res, 401, { error: 'unauthorized' });
      const done = allItems(ws)
        .filter((it) => it.done && it.doneAt)
        .sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1));
      return send(res, 200, { items: done });
    }

    // take your data with you — clean CSV of every task ever
    if (p === '/api/export.csv') {
      const ws = wsFromReq(req, url);
      if (!ws) return send(res, 401, { error: 'unauthorized' });
      const names = ws.config.cardNames || DEFAULT_NAMES;
      const rows = [['task', 'card', 'status', 'added_by', 'added_at', 'completed_by', 'completed_at', 'times_carried', 'exported_at']];
      const now = new Date().toISOString();
      for (const it of allItems(ws)) {
        rows.push([
          it.text,
          names[it.card] || it.card,
          it.done ? 'done' : it.archived ? 'removed' : 'open',
          ws.config.users[it.author] ? ws.config.users[it.author].name : it.author,
          it.createdAt || '',
          it.doneBy && ws.config.users[it.doneBy] ? ws.config.users[it.doneBy].name : (it.doneBy || ''),
          it.doneAt || '',
          it.carries || 0,
          now,
        ]);
      }
      const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cards-export-${localDateKey()}.csv"`,
      });
      return res.end('﻿' + csv); // BOM so Excel opens it cleanly
    }

    // full backup — everything needed to restore or migrate elsewhere
    if (p === '/api/export.json') {
      const ws = wsFromReq(req, url);
      if (!ws) return send(res, 401, { error: 'unauthorized' });
      const backup = {
        exportedAt: new Date().toISOString(),
        users: ws.config.users,
        cardNames: ws.config.cardNames,
        cards: ws.cards,
        archive: readJSON(wsPaths(ws.dir).archive, []),
      };
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="cards-backup-${localDateKey()}.json"`,
      });
      return res.end(JSON.stringify(backup, null, 2));
    }

    if (p === '/api/events') {
      const ws = wsFromReq(req, url);
      if (!ws) return send(res, 401, { error: 'unauthorized' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(publicState(ws))}\n\n`);
      ws.clients.add(res);
      req.on('close', () => ws.clients.delete(res));
      return;
    }

    if (p === '/api/action' && req.method === 'POST') {
      const ws = wsFromReq(req, url);
      if (!ws) return send(res, 401, { error: 'unauthorized' });
      const a = await readBody(req);
      const now = new Date().toISOString();

      if (a.type === 'add') {
        const card = getCard(ws, a.tab, a.dateKey);
        if (!card) return send(res, 400, { error: 'bad tab' });
        const text = String(a.text || '').trim().slice(0, 500);
        if (!text) return send(res, 400, { error: 'empty' });
        card.items.push({ id: uid(), text, author: a.user === 'u2' ? 'u2' : 'u1', done: false, createdAt: now });
      } else if (a.type === 'toggle') {
        const card = getCard(ws, a.tab, a.dateKey);
        const it = card && card.items.find((i) => i.id === a.id);
        if (!it) return send(res, 404, { error: 'not found' });
        it.done = !it.done;
        if (it.done) {
          it.doneBy = a.user === 'u2' ? 'u2' : 'u1';
          it.doneAt = now;
        } else {
          delete it.doneBy;
          delete it.doneAt;
        }
      } else if (a.type === 'edit') {
        const card = getCard(ws, a.tab, a.dateKey);
        const it = card && card.items.find((i) => i.id === a.id);
        if (!it) return send(res, 404, { error: 'not found' });
        const text = String(a.text || '').trim().slice(0, 500);
        if (text) it.text = text;
      } else if (a.type === 'remove') {
        const card = getCard(ws, a.tab, a.dateKey);
        if (!card) return send(res, 400, { error: 'bad tab' });
        const idx = card.items.findIndex((i) => i.id === a.id);
        if (idx === -1) return send(res, 404, { error: 'not found' });
        archiveItems(ws, [card.items[idx]], `${a.tab}${a.dateKey ? ':' + a.dateKey : ''}`);
        card.items.splice(idx, 1);
      } else if (a.type === 'move') {
        // move an item between cards (e.g. Later -> Now)
        const from = getCard(ws, a.fromTab, a.dateKey);
        const to = getCard(ws, a.toTab);
        const idx = from ? from.items.findIndex((i) => i.id === a.id) : -1;
        if (idx === -1 || !to) return send(res, 404, { error: 'not found' });
        const [it] = from.items.splice(idx, 1);
        delete it.doneBy;
        delete it.doneAt;
        to.items.push({ ...it, done: false });
      } else if (a.type === 'clearDone') {
        const card = getCard(ws, a.tab, a.dateKey);
        if (!card) return send(res, 400, { error: 'bad tab' });
        const done = card.items.filter((i) => i.done);
        archiveItems(ws, done, `${a.tab}${a.dateKey ? ':' + a.dateKey : ''}`);
        card.items = card.items.filter((i) => !i.done);
      } else if (a.type === 'setUser') {
        const slot = a.slot === 'u2' ? 'u2' : 'u1';
        if (!ws.config.users[slot]) return send(res, 404, { error: 'no such user' });
        if (a.name) ws.config.users[slot].name = String(a.name).slice(0, 30);
        if (a.color) ws.config.users[slot].color = okColor(a.color, ws.config.users[slot].color);
        saveConfig(ws);
      } else if (a.type === 'addPartner') {
        if (ws.config.users.u2) return send(res, 400, { error: 'already two of you' });
        ws.config.users.u2 = {
          name: String(a.name || 'Partner').trim().slice(0, 30) || 'Partner',
          color: okColor(a.color, '#8a3b2a'),
        };
        saveConfig(ws);
      } else if (a.type === 'setCardName') {
        if (!['today', 'next', 'someday'].includes(a.tab)) return send(res, 400, { error: 'bad tab' });
        const name = String(a.name || '').trim().slice(0, 20);
        if (name) ws.config.cardNames[a.tab] = name;
        saveConfig(ws);
      } else {
        return send(res, 400, { error: 'unknown action' });
      }

      saveCards(ws);
      broadcast(ws);
      return send(res, 200, publicState(ws));
    }

    // ---- static ----
    let file = p === '/' ? '/index.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUBLIC_DIR, file);
    if (full.startsWith(PUBLIC_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(full));
    }
    // SPA fallback
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(PUBLIC_DIR, 'index.html')));
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`paper-cards running → http://localhost:${PORT}`);
  console.log(`data lives in        ${DATA_DIR}`);
  console.log(`workspaces loaded    ${workspaces.size}`);
});
