/**
 * Clean WhatsApp Bot - English version
 * Based on the working Baileys structure + legitimate features from the old Deadpool base
 * (all crash / virtex / bug functions removed)
 *
 * Features:
 * - Downloads (YouTube, TikTok, Instagram)
 * - Stickers + Quote stickers
 * - AI (GPT)
 * - Games (Family100, Tebak variants, Math, TicTacToe, Suit)
 * - Group admin tools
 * - Owner settings + anti-delete / anti-edit / anti-viewonce / anticall
 * - Panel helpers (Pterodactyl style – requires config)
 * - Auto-join configured group + channel on every connect
 * - Rotating fancy fonts
 * - Fully English
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  jidNormalizedUser,
  getContentType,
  Browsers,
  makeCacheableSignalKeyStore,
  proto,
  generateWAMessageFromContent
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');
const { Boom } = require('@hapi/boom');
const NodeCache = require('node-cache');
const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');

// ============ CONFIG (config.js + Heroku / process.env) ============
// OWNER_NUMBER from Heroku Config Vars becomes the bot owner/admin.
const defaults = {
  BOT_NAME: 'Deadpool V7',
  PREFIX: '.',
  OWNER_NUMBER: '',
  DEVELOPERS: [],
  MODE: 'public',
  SESSION: '',
  POWERED_BY: 'Powered by Confronter',
  FONT: 'random',
  AUTO_VIEW_STATUS: true,
  AUTO_LIKE_STATUS: true,
  AUTO_REACT: false,
  AUTO_READ: false,
  ANTI_DELETE: 'dm',
  ANTI_EDIT: 'dm',
  ANTI_VIEW_ONCE: 'dm',
  ANTI_CALL: true,
  ANTI_CALL_MSG: 'Calls are not allowed right now. Please text instead.',
  ANTILINK: false,
  WELCOME: true,
  GOODBYE: true,
  WELCOME_MSG: 'Welcome @user to *@group*!',
  GOODBYE_MSG: 'Goodbye @user from *@group*.',
  PRESENCE: 'unavailable',
  MENU_MEDIA: '',
  GROUP_INVITE: '',
  CHANNEL_ID: '',
  PANEL_DOMAIN: '',
  PANEL_APIKEY: '',
  PANEL_CLIENT_APIKEY: '',
  PANEL_EGG: '15',
  PANEL_LOCATION: '1',
  BOT_EXPIRY_DATE: '',
  BOT_EXPIRY_DAYS: 0,
  EXPIRY_MSG: '⛔ Bot has expired. Contact the owner.'
};
let fileConfig = {};
try { fileConfig = require('./config'); } catch {}
// Env vars (Heroku) override file config
const env = process.env;
function envBool(v, def) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}
const config = {
  ...defaults,
  ...fileConfig,
  BOT_NAME: env.BOT_NAME || fileConfig.BOT_NAME || defaults.BOT_NAME,
  PREFIX: env.PREFIX || fileConfig.PREFIX || defaults.PREFIX,
  OWNER_NUMBER: String(env.OWNER_NUMBER || env.OWNER || fileConfig.OWNER_NUMBER || defaults.OWNER_NUMBER).replace(/\D/g, ''),
  DEVELOPERS: (env.DEVELOPERS || (Array.isArray(fileConfig.DEVELOPERS) ? fileConfig.DEVELOPERS.join(',') : (fileConfig.DEVELOPERS || '')) || '')
    .split(',').map(s => String(s).replace(/\D/g, '')).filter(Boolean),
  MODE: (env.MODE || fileConfig.MODE || defaults.MODE).toLowerCase(),
  SESSION: env.SESSION || env.SESSION_ID || fileConfig.SESSION || defaults.SESSION,
  FONT: env.FONT || fileConfig.FONT || defaults.FONT,
  AUTO_VIEW_STATUS: env.AUTO_VIEW_STATUS !== undefined ? envBool(env.AUTO_VIEW_STATUS, true) : (fileConfig.AUTO_VIEW_STATUS ?? defaults.AUTO_VIEW_STATUS),
  AUTO_LIKE_STATUS: env.AUTO_LIKE_STATUS !== undefined ? envBool(env.AUTO_LIKE_STATUS, true) : (fileConfig.AUTO_LIKE_STATUS ?? defaults.AUTO_LIKE_STATUS),
  AUTO_REACT: env.AUTO_REACT !== undefined ? envBool(env.AUTO_REACT, false) : (fileConfig.AUTO_REACT ?? defaults.AUTO_REACT),
  AUTO_READ: env.AUTO_READ !== undefined ? envBool(env.AUTO_READ, false) : (fileConfig.AUTO_READ ?? defaults.AUTO_READ),
  ANTI_DELETE: env.ANTI_DELETE || fileConfig.ANTI_DELETE || defaults.ANTI_DELETE,
  ANTI_EDIT: env.ANTI_EDIT || fileConfig.ANTI_EDIT || defaults.ANTI_EDIT,
  ANTI_VIEW_ONCE: env.ANTI_VIEW_ONCE || fileConfig.ANTI_VIEW_ONCE || defaults.ANTI_VIEW_ONCE,
  ANTI_CALL: env.ANTI_CALL !== undefined ? envBool(env.ANTI_CALL, true) : (fileConfig.ANTI_CALL ?? defaults.ANTI_CALL),
  ANTI_CALL_MSG: env.ANTI_CALL_MSG || fileConfig.ANTI_CALL_MSG || defaults.ANTI_CALL_MSG,
  WELCOME: env.WELCOME !== undefined ? envBool(env.WELCOME, true) : (fileConfig.WELCOME ?? defaults.WELCOME),
  GOODBYE: env.GOODBYE !== undefined ? envBool(env.GOODBYE, true) : (fileConfig.GOODBYE ?? defaults.GOODBYE),
  WELCOME_MSG: env.WELCOME_MSG || fileConfig.WELCOME_MSG || defaults.WELCOME_MSG,
  GOODBYE_MSG: env.GOODBYE_MSG || fileConfig.GOODBYE_MSG || defaults.GOODBYE_MSG,
  GROUP_INVITE: env.GROUP_INVITE || fileConfig.GROUP_INVITE || defaults.GROUP_INVITE,
  CHANNEL_ID: env.CHANNEL_ID || fileConfig.CHANNEL_ID || defaults.CHANNEL_ID,
  MENU_MEDIA: env.MENU_MEDIA || fileConfig.MENU_MEDIA || defaults.MENU_MEDIA,
  PANEL_DOMAIN: env.PANEL_DOMAIN || fileConfig.PANEL_DOMAIN || defaults.PANEL_DOMAIN,
  PANEL_APIKEY: env.PANEL_APIKEY || fileConfig.PANEL_APIKEY || defaults.PANEL_APIKEY,
  POWERED_BY: env.POWERED_BY || fileConfig.POWERED_BY || defaults.POWERED_BY
};

// ============ NOISE SUPPRESS ============
const SUPPRESS = [
  'Closing session', 'Closing open session', 'Failed to decrypt',
  'Session error:', 'Bad MAC', 'Decrypted message with closed session', '[LID]'
];
const _match = s => typeof s === 'string' && SUPPRESS.some(p => s.includes(p));
const _log = console.log.bind(console);
console.log = (...a) => { if (_match(a[0])) return; _log(...a); };

// ============ HELPERS ============
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';
async function dlGet(url, e = {}) {
  return axios.get(url, {
    timeout: e.timeout || 45000,
    validateStatus: () => true,
    headers: { 'User-Agent': UA, Accept: '*/*', ...(e.headers || {}) },
    ...e
  });
}
async function fetchBuffer(url, t = 90000) {
  const r = await dlGet(url, { responseType: 'arraybuffer', timeout: t, maxContentLength: 100 * 1024 * 1024 });
  if (r.status >= 400) throw new Error('HTTP ' + r.status);
  return Buffer.from(r.data);
}
const delay = ms => new Promise(r => setTimeout(r, ms));
const dig = v => String(v || '').replace(/\D/g, '');

// ============ PATHS ============
const AUTH_DIR = path.join(__dirname, 'auth_info');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const msgCache = new NodeCache({ stdTTL: 60 * 60 * 8, checkperiod: 120 });
let sock = null;
const _lidMap = new Map();

// Game state (in-memory + periodic save)
const games = {
  family100: {},
  tebaklagu: {},
  tebakgambar: {},
  tebakkata: {},
  tebakkalimat: {},
  tebaklirik: {},
  caklontong: {},
  caklontong_desk: {},
  math: {},
  tictactoe: {},
  suit: {}
};

// ============ LID CACHE ============
function cacheLid(key, msg) {
  try {
    const p = key?.participant || msg?.key?.participant;
    const alt = key?.participantAlt || msg?.key?.participantAlt || msg?.key?.remoteJidAlt;
    if (p && String(p).includes('@lid') && alt && !String(alt).includes('@lid')) {
      const phone = String(alt).split('@')[0].split(':')[0];
      if (/^\d{6,15}$/.test(phone)) _lidMap.set(String(p).split('@')[0], phone);
    }
  } catch {}
}
function jidToPhone(jid, msg) {
  if (!jid) return 'unknown';
  const raw = String(jid);
  // Prefer explicit alt fields first
  const alt = msg?.key?.participantAlt || msg?.key?.remoteJidAlt || msg?.participantAlt || msg?.remoteJidAlt;
  if (alt && !String(alt).includes('@lid')) {
    const n = String(alt).split('@')[0].split(':')[0];
    if (/^\d{6,15}$/.test(n)) return n;
  }
  // Cached LID → phone
  if (raw.includes('@lid')) {
    const lid = raw.split('@')[0];
    const cached = _lidMap.get(lid);
    if (cached) return cached;
    // last resort: try participant from msg
    const p = msg?.key?.participant || msg?.participant;
    if (p && !String(p).includes('@lid')) {
      const n = String(p).split('@')[0].split(':')[0];
      if (/^\d{6,15}$/.test(n)) return n;
    }
    return 'unknown';
  }
  const n = raw.split('@')[0].split(':')[0];
  return /^\d{6,15}$/.test(n) ? n : 'unknown';
}
function mentionLabel(jid) {
  if (!jid) return 'someone';
  const raw = String(jid);
  if (raw.includes('@lid')) {
    const ph = _lidMap.get(raw.split('@')[0]);
    return ph ? '@' + ph : 'someone';
  }
  const n = raw.split('@')[0].split(':')[0];
  return /^\d{6,15}$/.test(n) ? '@' + n : 'someone';
}

// ============ DATA ============
async function ensureData() {
  await fs.ensureDir(DATA_DIR);
  if (!(await fs.pathExists(USERS_FILE))) await fs.writeJson(USERS_FILE, []);
  if (!(await fs.pathExists(GROUPS_FILE))) await fs.writeJson(GROUPS_FILE, {});
}
async function loadUsers() {
  try { return await fs.readJson(USERS_FILE); } catch { return []; }
}
async function saveUser(jid) {
  try {
    const users = await loadUsers();
    const id = jidNormalizedUser(jid);
    if (!users.includes(id)) {
      users.push(id);
      await fs.writeJson(USERS_FILE, users, { spaces: 2 });
    }
  } catch {}
}
async function loadGroups() {
  try { return await fs.readJson(GROUPS_FILE); } catch { return {}; }
}
async function saveGroup(gid, k, v) {
  const d = await loadGroups();
  if (!d[gid]) d[gid] = {};
  d[gid][k] = v;
  await fs.writeJson(GROUPS_FILE, d, { spaces: 2 });
}
async function getGroup(gid, k, def = false) {
  const d = await loadGroups();
  return d?.[gid]?.[k] ?? def;
}

// ============ ROASTS (English) ============
const ROASTS = {
  owner: [
    '🧠 *Owner only.* Confidence is not a substitute for credentials.',
    '📜 *Owner command.* Your ego signed a cheque your rank cannot cash.',
    '🎭 *Denied.* The audacity arrived long before the authority did.'
  ],
  admin: [
    '🪪 *Admins only.* Rank is earned — not borrowed from wishful thinking.',
    '📎 *Denied.* Your badge is imaginary and so is the authority.',
    '🎩 *Admins only.* You arrived without a title and left without a clue.'
  ],
  group: [
    '🏛️ *Group only.* Private chat is not a committee of one.',
    '📎 *Group only.* This command lives in a room you are not standing in.'
  ]
};
const roast = k => ROASTS[k][Math.floor(Math.random() * ROASTS[k].length)];

// ============ FOOTER ============
function buildFooter() {
  const y = new Date().getFullYear();
  const p = (config.POWERED_BY || 'Powered by Confronter').replace(/©?\d{4}/g, '').trim();
  return `\n_${p} ©${y}_`;
}

// ============ FANCY FONTS ============
const FONT_MAPS = {
  normal: null,
  sans: {
    a:'𝖺',b:'𝖻',c:'𝖼',d:'𝖽',e:'𝖾',f:'𝖿',g:'𝗀',h:'𝗁',i:'𝗂',j:'𝗃',k:'𝗄',l:'𝗅',m:'𝗆',
    n:'𝗇',o:'𝗈',p:'𝗉',q:'𝗊',r:'𝗋',s:'𝗌',t:'𝗍',u:'𝗎',v:'𝗏',w:'𝗐',x:'𝗑',y:'𝗒',z:'𝗓',
    A:'𝖠',B:'𝖡',C:'𝖢',D:'𝖣',E:'𝖤',F:'𝖥',G:'𝖦',H:'𝖧',I:'𝖨',J:'𝖩',K:'𝖪',L:'𝖫',M:'𝖬',
    N:'𝖭',O:'𝖮',P:'𝖯',Q:'𝖰',R:'𝖱',S:'𝖲',T:'𝖳',U:'𝖴',V:'𝖵',W:'𝖶',X:'𝖷',Y:'𝖸',Z:'𝖹',
    '0':'𝟢','1':'𝟣','2':'𝟤','3':'𝟥','4':'𝟦','5':'𝟧','6':'𝟨','7':'𝟩','8':'𝟪','9':'𝟫'
  },
  bold: {
    a:'𝗮',b:'𝗯',c:'𝗰',d:'𝗱',e:'𝗲',f:'𝗳',g:'𝗴',h:'𝗵',i:'𝗶',j:'𝗷',k:'𝗸',l:'𝗹',m:'𝗺',
    n:'𝗻',o:'𝗼',p:'𝗽',q:'𝗾',r:'𝗿',s:'𝘀',t:'𝘁',u:'𝘂',v:'𝘃',w:'𝘄',x:'𝘅',y:'𝘆',z:'𝘇',
    A:'𝗔',B:'𝗕',C:'𝗖',D:'𝗗',E:'𝗘',F:'𝗙',G:'𝗚',H:'𝗛',I:'𝗜',J:'𝗝',K:'𝗞',L:'𝗟',M:'𝗠',
    N:'𝗡',O:'𝗢',P:'𝗣',Q:'𝗤',R:'𝗥',S:'𝗦',T:'𝗧',U:'𝗨',V:'𝗩',W:'𝗪',X:'𝗫',Y:'𝗬',Z:'𝗭',
    '0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'
  },
  italic: {
    a:'𝑎',b:'𝑏',c:'𝑐',d:'𝑑',e:'𝑒',f:'𝑓',g:'𝑔',h:'ℎ',i:'𝑖',j:'𝑗',k:'𝑘',l:'𝑙',m:'𝑚',
    n:'𝑛',o:'𝑜',p:'𝑝',q:'𝑞',r:'𝑟',s:'𝑠',t:'𝑡',u:'𝑢',v:'𝑣',w:'𝑤',x:'𝑥',y:'𝑦',z:'𝑧',
    A:'𝐴',B:'𝐵',C:'𝐶',D:'𝐷',E:'𝐸',F:'𝐹',G:'𝐺',H:'𝐻',I:'𝐼',J:'𝐽',K:'𝐾',L:'𝐿',M:'𝑀',
    N:'𝑁',O:'𝑂',P:'𝑃',Q:'𝑄',R:'𝑅',S:'𝑆',T:'𝑇',U:'𝑈',V:'𝑉',W:'𝑊',X:'𝑋',Y:'𝑌',Z:'𝑍'
  },
  double: {
    a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',
    n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',
    A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',
    N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ',
    '0':'𝟘','1':'𝟙','2':'𝟚','3':'𝟛','4':'𝟜','5':'𝟝','6':'𝟞','7':'𝟟','8':'𝟠','9':'𝟡'
  },
  script: {
    a:'𝓪',b:'𝓫',c:'𝓬',d:'𝓭',e:'𝓮',f:'𝓯',g:'𝓰',h:'𝓱',i:'𝓲',j:'𝓳',k:'𝓴',l:'𝓵',m:'𝓶',
    n:'𝓷',o:'𝓸',p:'𝓹',q:'𝓺',r:'𝓻',s:'𝓼',t:'𝓽',u:'𝓾',v:'𝓿',w:'𝔀',x:'𝔁',y:'𝔂',z:'𝔃',
    A:'𝓐',B:'𝓑',C:'𝓒',D:'𝓓',E:'𝓔',F:'𝓕',G:'𝓖',H:'𝓗',I:'𝓘',J:'𝓙',K:'𝓚',L:'𝓛',M:'𝓜',
    N:'𝓝',O:'𝓞',P:'𝓟',Q:'𝓠',R:'𝓡',S:'𝓢',T:'𝓣',U:'𝓤',V:'𝓥',W:'𝓦',X:'𝓧',Y:'𝓨',Z:'𝓩'
  },
  tiny: {
    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',
    n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
    A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ғ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',
    N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'ǫ',R:'ʀ',S:'s',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'x',Y:'ʏ',Z:'ᴢ'
  },
  // Fancy styles from keyboard apps
  gothic: {
    a:'𝔞',b:'𝔟',c:'𝔠',d:'𝔡',e:'𝔢',f:'𝔣',g:'𝔤',h:'𝔥',i:'𝔦',j:'𝔧',k:'𝔨',l:'𝔩',m:'𝔪',
    n:'𝔫',o:'𝔬',p:'𝔭',q:'𝔮',r:'𝔯',s:'𝔰',t:'𝔱',u:'𝔲',v:'𝔳',w:'𝔴',x:'𝔵',y:'𝔶',z:'𝔷',
    A:'𝔄',B:'𝔅',C:'ℭ',D:'𝔇',E:'𝔈',F:'𝔉',G:'𝔊',H:'ℌ',I:'ℑ',J:'𝔍',K:'𝔎',L:'𝔏',M:'𝔐',
    N:'𝔑',O:'𝔒',P:'𝔓',Q:'𝔔',R:'ℜ',S:'𝔖',T:'𝔗',U:'𝔘',V:'𝔙',W:'𝔚',X:'𝔛',Y:'𝔜',Z:'ℨ'
  },
  bubble: {
    a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',
    n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',
    A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',
    N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ'
  }
};
const FONT_NAMES = Object.keys(FONT_MAPS).filter(n => n !== 'normal');
let _lastFontIdx = 0;

function applyFont(text, style) {
  if (!text || typeof text !== 'string') return text;
  const map = FONT_MAPS[style];
  if (!map) return text;
  let out = '';
  for (const ch of text) out += map[ch] || ch;
  return out;
}

function styleReplyText(text) {
  try {
    if (!text || typeof text !== 'string') return text;
    let style = String(config.FONT || 'random').toLowerCase();
    // Always auto-change on every reply (default). Lock only if user sets a fixed style.
    if (style === 'random' || style === 'auto' || style === '' || !FONT_MAPS[style]) {
      _lastFontIdx = (_lastFontIdx + 1) % FONT_NAMES.length;
      style = FONT_NAMES[_lastFontIdx];
    }
    if (style === 'off' || style === 'normal' || style === 'mono') return text;
    return applyFont(text, style);
  } catch {
    return text;
  }
}

// ============ EXPIRY ============
function getExpiryInfo() {
  const now = new Date();
  try {
    const dateStr = config.BOT_EXPIRY_DATE || config.EXPIRY || '';
    if (dateStr) {
      const end = new Date(dateStr);
      if (!isNaN(end.getTime())) {
        const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        if (diff < 0) return '⛔ Expired';
        if (diff === 0) return '⚠ Ends today';
        return `${diff} day${diff === 1 ? '' : 's'} left`;
      }
    }
    const days = parseInt(config.BOT_EXPIRY_DAYS || '0', 10) || 0;
    if (days > 0) {
      let activated = config.BOT_ACTIVATED_AT ? new Date(config.BOT_ACTIVATED_AT) : null;
      if (!activated || isNaN(activated.getTime())) activated = now;
      const end = new Date(activated.getTime() + days * 24 * 60 * 60 * 1000);
      const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      if (diff < 0) return '⛔ Expired';
      if (diff === 0) return '⚠ Ends today';
      return `${diff} day${diff === 1 ? '' : 's'} left`;
    }
  } catch {}
  return 'Unlimited';
}
function isBotExpired() {
  return getExpiryInfo() === '⛔ Expired';
}

// ============ MENU (English) ============
function buildMainMenu(pushName, userCount) {
  const p = config.PREFIX || '.';
  const exp = getExpiryInfo();
  // Fixed-width borders so left & right lines stay straight/equal
  const W = 28;
  const top = '╔' + '═'.repeat(W) + '╗';
  const mid = '╠' + '═'.repeat(W) + '╣';
  const bot = '╚' + '═'.repeat(W) + '╝';
  const row = (txt) => {
    const s = String(txt);
    // pad to W visual width (approx for emoji)
    const pad = Math.max(0, W - s.length);
    return '║ ' + s + ' '.repeat(pad) + '║';
  };
  // section box like the screenshot
  const section = (title, cmds) => {
    let s = '';
    s += `┌── ${title} ${'─'.repeat(Math.max(0, W - title.length - 5))}┐\n`;
    for (const c of cmds) s += `│ ${p}${c}\n`;
    s += `└${'─'.repeat(W)}┘\n`;
    return s;
  };

  let m = '';
  m += `${top}\n`;
  m += `║ 💀 *${config.BOT_NAME}*\n`;
  m += `║ 👋 Hi ${pushName || 'User'}!\n`;
  m += `║ 👥 Users: ${userCount || 0}\n`;
  m += `║ ⏳ Active: ${exp}\n`;
  m += `${bot}\n\n`;

  m += section('📥 DOWNLOADS', [
    'play <song>',
    'song <name>',
    'video <url/name>',
    'yt <url/name>',
    'tiktok <url>',
    'ig <url>',
    'lyrics <song>'
  ]);
  m += '\n';
  m += section('🎨 STICKER', [
    'sticker',
    's',
    'toimg',
    'qc <text>',
    'qcstick <text>',
    'vv'
  ]);
  m += '\n';
  m += section('🤖 AI', [
    'gpt <question>',
    'ai <question>',
    'ask <question>'
  ]);
  m += '\n';
  m += section('🎮 GAMES', [
    'family100',
    'tebak <type>',
    'math <easy|medium|hard>',
    'ttt',
    'suit @user'
  ]);
  m += '\n';
  m += section('👥 ADMIN', [
    'promote @user',
    'demote @user',
    'kick @user',
    'warn @user',
    'mute',
    'unmute',
    'tagall',
    'hidetag <text>',
    'tagadmins',
    'antilink on/off',
    'grouplink',
    'groupinfo',
    'approve',
    'left'
  ]);
  m += '\n';
  m += section('👑 OWNER', [
    'mode public/private',
    'prefix <symbol>',
    'settings',
    'users',
    'broadcast <text>',
    'block @user',
    'unblock @user',
    'autoview on/off',
    'autolike on/off',
    'autoreact on/off',
    'autoread on/off',
    'autotyping on/off',
    'antidelete off/dm/chat',
    'antiedit off/dm/chat',
    'antiviewonce off/dm/chat',
    'anticall on/off',
    'welcome on/off',
    'goodbye on/off',
    'font <style>',
    'presence <type>',
    'setbotname <name>',
    'startmsg'
  ]);
  m += '\n';
  m += section('🖥️ PANEL', [
    'panel',
    '1gb user,number',
    '2gb user,number',
    '3gb user,number',
    '4gb user,number',
    '5gb user,number',
    'unli user,number',
    'listsrv',
    'listusr',
    'delsrv <id>',
    'delusr <id>',
    'ramlist'
  ]);
  m += '\n';
  m += section('🖋️ TEXTMAKER', [
    'neon <text>',
    'fire <text>',
    'glitch <text>',
    'ice <text>',
    'matrix <text>',
    'thunder <text>',
    'hacker <text>',
    'luxury <text>',
    'blackpink <text>',
    'metallic <text>',
    'devil <text>',
    'sand <text>',
    'light <text>'
  ]);
  m += '\n';
  m += section('🎭 FUN', [
    'joke',
    'quote',
    'dice',
    '8ball',
    'coinflip'
  ]);
  m += '\n';
  m += section('🔧 UTILITY', [
    'ping',
    'alive',
    'calc <expr>',
    'weather <city>',
    'owner',
    'delete'
  ]);

  m += `\n👑 Made by *Confronter* ©${new Date().getFullYear()}`;
  return m;
}

async function sendMenuWithMedia(jid, pushName, userCount) {
  const caption = buildMainMenu(pushName, userCount);
  const mediaUrl = config.MENU_MEDIA;
  if (!mediaUrl) {
    await sock.sendMessage(jid, { text: caption });
    return;
  }
  const url = String(mediaUrl).toLowerCase();
  const isGif = url.includes('.gif');
  const isVideo = isGif || url.includes('.mp4') || url.includes('.mkv') || url.includes('.mov') || url.includes('.webm') || url.includes('video');
  try {
    const buffer = await fetchBuffer(mediaUrl, 60000);
    if (isVideo) await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4', gifPlayback: isGif });
    else await sock.sendMessage(jid, { image: buffer, caption });
    return;
  } catch (e) {
    console.log('Menu media fetch failed:', e.message);
  }
  try {
    if (isVideo) await sock.sendMessage(jid, { video: { url: mediaUrl }, caption, mimetype: 'video/mp4', gifPlayback: isGif });
    else await sock.sendMessage(jid, { image: { url: mediaUrl }, caption });
  } catch (e) {
    console.log('Menu media URL failed, sending text only:', e.message);
    await sock.sendMessage(jid, { text: caption });
  }
}

// ============ START MESSAGE ============
function buildStartMessage() {
  const p = config.PREFIX || '.';
  const on = v => (v === true || v === 'on' || v === 'dm' || v === 'chat' || v === 'pm') ? '✅' : '❌';
  const val = (v, fallback = '—') => (v === undefined || v === null || v === '') ? fallback : String(v);
  const exp = getExpiryInfo();
  const line = '──────────────';
  let m = '';
  m += `╭${line}╮\n`;
  m += `│ 💀 *${config.BOT_NAME}*\n`;
  m += `│ ✅ *ONLINE*\n`;
  m += `├${line}┤\n`;
  m += `│ ⚡ Prefix    : *${p}*\n`;
  m += `│ 🌐 Mode      : *${val(config.MODE, 'public')}*\n`;
  m += `│ 👤 Owner     : *${val(config.OWNER_NUMBER)}*\n`;
  m += `│ ⏳ Expiry    : *${exp}*\n`;
  m += `├${line}┤\n`;
  m += `│ 👁 AutoView  : ${on(config.AUTO_VIEW_STATUS)}\n`;
  m += `│ ❤️ AutoLike  : ${on(config.AUTO_LIKE_STATUS)}\n`;
  m += `│ 📖 AutoRead  : ${on(config.AUTO_READ)}\n`;
  m += `│ ⚡ AutoReact : ${on(config.AUTO_REACT)}\n`;
  m += `│ 🗑 AntiDelete: *${val(config.ANTI_DELETE, 'off')}*\n`;
  m += `│ ✏️ AntiEdit  : *${val(config.ANTI_EDIT, 'off')}*\n`;
  m += `│ 🔓 ViewOnce  : *${val(config.ANTI_VIEW_ONCE, 'off')}*\n`;
  m += `│ 📞 AntiCall  : ${on(config.ANTI_CALL)}\n`;
  m += `│ 🔗 Antilink  : ${on(config.ANTILINK)}\n`;
  m += `│ 👋 Welcome   : ${on(config.WELCOME)}\n`;
  m += `│ 🚪 Goodbye   : ${on(config.GOODBYE)}\n`;
  m += `├${line}┤\n`;
  m += `│ 👑 By *Confronter*\n`;
  m += `│ 💬 Type *${p}menu* for commands\n`;
  m += `╰${line}╯`;
  return m;
}

function buildSyncWaitMessage() {
  return `⏳ *Please wait 1–2 minutes…*\n\n` +
    `Bot is syncing sessions & keys.\n` +
    `After that it will respond to all commands normally.\n\n` +
    `_Do not spam commands while syncing._`;
}

// ============ AUTH ============
async function loadAuthState() {
  // Heroku dynos wipe disk on restart — re-inject SESSION so bot resumes working
  if (config.SESSION && config.SESSION.length > 10) {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    const exists = await fs.pathExists(credsPath);
    if (!exists) {
      try {
        let raw = config.SESSION.trim();
        // support prefixes like deadpool~BASE64
        if (raw.includes('~')) raw = raw.slice(raw.indexOf('~') + 1).trim();
        const creds = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
        await fs.ensureDir(AUTH_DIR);
        await fs.writeJson(credsPath, creds, { spaces: 2 });
        console.log('✅ Session restored from SESSION env (dyno restart safe)');
      } catch (e) {
        console.error('❌ Invalid SESSION env:', e.message);
      }
    } else {
      console.log('✅ Session found on disk');
    }
  } else {
    console.log('⚠ No SESSION env set — QR login required (not ideal on Heroku)');
  }
  return useMultiFileAuthState(AUTH_DIR);
}

// ============ BASIC HELPERS ============
const isGroup = j => j?.endsWith('@g.us');
function getOwnerJid() {
  return config.OWNER_NUMBER ? jidNormalizedUser(config.OWNER_NUMBER + '@s.whatsapp.net') : null;
}
function isOwner(jid) {
  if (!jid) return false;
  const num = dig(jidNormalizedUser(String(jid)).split('@')[0].split(':')[0]);
  if (!num) return false;
  const list = [config.OWNER_NUMBER, ...(config.DEVELOPERS || [])].map(dig).filter(Boolean);
  return list.some(o => num === o || num.endsWith(o) || o.endsWith(num));
}
const isDeveloper = isOwner;
function randEmoji(pool, fb) {
  const list = (pool && pool.length) ? pool : (fb || ['👍', '❤️', '🔥', '😂', '🙏', '💯', '😍']);
  return list[Math.floor(Math.random() * list.length)] || '👍';
}
const statusLikeEmoji = () => randEmoji(config.STATUS_LIKES);
const msgReactEmoji = () => randEmoji(config.REACT_EMOJIS);
const cmdReactEmoji = () => randEmoji(null, ['✅', '⚡', '🔥', '💫', '✨', '🎯', '👍', '🤖', '💜', '🚀', '⭐']);
function react(jid, key, emoji) {
  sock.sendMessage(jid, { react: { text: emoji, key } }).catch(() => {});
}
function getMentioned(m) {
  const ctx = m.message?.extendedTextMessage?.contextInfo
    || m.message?.imageMessage?.contextInfo
    || m.message?.videoMessage?.contextInfo
    || m.message?.documentMessage?.contextInfo
    || {};
  return ctx.mentionedJid || [];
}
function getQuoted(m) {
  const ctx = m.message?.extendedTextMessage?.contextInfo
    || m.message?.imageMessage?.contextInfo
    || m.message?.videoMessage?.contextInfo
    || m.message?.documentMessage?.contextInfo
    || {};
  return ctx.participant || null;
}
// Resolve target users: mentions → reply → number in text → (in DM) the chat itself
function getTargetUsers(m, text, from, isGroupChat) {
  const users = [];
  const mentioned = getMentioned(m);
  for (const j of mentioned) if (j) users.push(j);
  if (!users.length) {
    const q = getQuoted(m);
    if (q) users.push(q);
  }
  if (!users.length && text) {
    // numbers in text
    const nums = String(text).match(/\d{6,15}/g) || [];
    for (const n of nums) users.push(n + '@s.whatsapp.net');
  }
  // In private chat with no target → use the chat partner
  if (!users.length && !isGroupChat && from && !from.endsWith('@g.us') && from !== 'status@broadcast') {
    users.push(from);
  }
  // normalize
  return [...new Set(users.map(j => {
    if (!j) return null;
    if (String(j).includes('@')) return j;
    return dig(j) + '@s.whatsapp.net';
  }).filter(Boolean))];
}
async function getMeta(jid) {
  try { return await sock.groupMetadata(jid); } catch { return null; }
}
async function isGroupAdmin(jid, p) {
  const meta = await getMeta(jid);
  if (!meta || !p) return false;
  const pn = dig(String(p).split('@')[0].split(':')[0]);
  const x = meta.participants.find(y => {
    const id = String(y.id || '');
    const phone = y.phoneNumber ? dig(String(y.phoneNumber).split('@')[0]) : '';
    return id === p
      || id.split('@')[0] === String(p).split('@')[0]
      || (pn && (dig(id.split('@')[0]) === pn || phone === pn));
  });
  return x?.admin === 'admin' || x?.admin === 'superadmin';
}
async function isBotAdmin(jid) {
  const b = sock.user?.id;
  if (!b) return false;
  const botJid = jidNormalizedUser(b);
  // also try raw id (LID groups)
  return (await isGroupAdmin(jid, botJid)) || (await isGroupAdmin(jid, b));
}
function hasLink(t) {
  return /(https?:\/\/[^\s]+)|(chat\.whatsapp\.com\/[^\s]+)/gi.test(t || '');
}

// ============ MEDIA DOWNLOAD ============
async function downloadMediaMsg(message) {
  try {
    let msg = message;
    for (let i = 0; i < 5; i++) {
      if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
      else if (msg.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
      else if (msg.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
      else if (msg.viewOnceMessageV2Extension?.message) msg = msg.viewOnceMessageV2Extension.message;
      else break;
    }
    let type = getContentType(msg);
    if (!type) {
      for (const t of ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']) {
        if (msg[t]) { type = t; break; }
      }
    }
    if (!type) return null;
    const stream = await downloadContentFromMessage(msg[type], type.replace('Message', ''));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    if (!buffer.length) return null;
    return { buffer, type, msg };
  } catch (e) {
    return null;
  }
}

// ============ PRESENCE MAP ============
function presenceMap(v) {
  v = String(v || '').toLowerCase();
  if (v === 'typing' || v === 'composing' || v === 'type') return 'composing';
  if (v === 'recording' || v === 'record' || v === 'rec') return 'recording';
  if (v === 'online' || v === 'available' || v === 'on') return 'available';
  if (v === 'offline' || v === 'unavailable' || v === 'off') return 'unavailable';
  return null;
}

// ============ ANTI-DELETE ============
async function forwardDelete(key, cached) {
  try {
    const from = key.remoteJid;
    const isStatus = from === 'status@broadcast';
    if (isStatus && !config.ANTI_DELETE_STATUS) return;
    if (!isStatus && config.ANTI_DELETE === 'off') return;
    const target = isStatus ? getOwnerJid() : (config.ANTI_DELETE === 'chat' ? from : getOwnerJid());
    if (!target) return;
    let msg = cached.message;
    if (msg?.viewOnceMessage?.message) msg = msg.viewOnceMessage.message;
    if (msg?.viewOnceMessageV2?.message) msg = msg.viewOnceMessageV2.message;
    if (msg?.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
    let type = getContentType(msg) || '';
    if (!type) {
      for (const t of ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']) {
        if (msg[t]) { type = t; break; }
      }
    }
    const phone = jidToPhone(key.participant || cached.participant, cached);
    let deletedText = '';
    if (type === 'conversation') deletedText = msg.conversation || '';
    else if (type === 'extendedTextMessage') deletedText = msg.extendedTextMessage?.text || '';
    else if (type === 'imageMessage') deletedText = msg.imageMessage?.caption || '';
    else if (type === 'videoMessage') deletedText = msg.videoMessage?.caption || '';
    else if (type === 'documentMessage') deletedText = msg.documentMessage?.fileName || '';
    else if (type === 'stickerMessage') deletedText = '[Sticker]';
    else if (type === 'audioMessage') deletedText = msg.audioMessage?.ptt ? '[Voice]' : '[Audio]';
    let groupName = 'Private';
    if (isGroup(from)) {
      try { groupName = (await sock.groupMetadata(from))?.subject || 'Group'; } catch {}
    }
    let cap = `✅ *${config.BOT_NAME} antiDelete*\n`;
    cap += `• Deleted by: +${phone}\n`;
    cap += `• Chat: ${isStatus ? 'Status' : (isGroup(from) ? 'Group: ' + groupName : 'DM')}\n`;
    if (deletedText && !deletedText.startsWith('[')) cap += `\n📝 *Deleted Text:*\n${deletedText}`;
    else if (deletedText) cap += `\n${deletedText}`;
    const media = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };
    if (media[type]) {
      const dl = await downloadMediaMsg(msg);
      if (dl?.buffer) {
        const mk = media[type];
        const payload = { [mk]: dl.buffer };
        if (mk === 'image' || mk === 'video') {
          payload.caption = cap;
          payload.mimetype = type === 'videoMessage' ? 'video/mp4' : undefined;
        } else if (mk === 'audio') {
          payload.mimetype = 'audio/ogg; codecs=opus';
          payload.ptt = !!msg.audioMessage?.ptt;
        } else if (mk === 'document') {
          payload.mimetype = msg.documentMessage?.mimetype || 'application/octet-stream';
          payload.fileName = msg.documentMessage?.fileName || 'file';
          payload.caption = cap;
        }
        await sock.sendMessage(target, payload);
        if (mk === 'sticker' || mk === 'audio') await sock.sendMessage(target, { text: cap });
        return;
      }
    }
    await sock.sendMessage(target, { text: cap });
  } catch (e) {
    console.log('antiDelete:', e.message);
  }
}

// ============ AUTO JOIN GROUP + CHANNEL ============
async function autoJoinConfigured() {
  // Group
  if (config.GROUP_INVITE) {
    try {
      let code = String(config.GROUP_INVITE).trim();
      if (code.includes('chat.whatsapp.com/')) {
        code = code.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0];
      }
      if (code) {
        await sock.groupAcceptInvite(code);
        console.log('✅ Auto-joined group');
      }
    } catch (e) {
      console.log('Auto-join group failed (may already be member):', e.message);
    }
  }
  // Channel / Newsletter
  if (config.CHANNEL_ID) {
    try {
      const ch = String(config.CHANNEL_ID).trim();
      // Baileys newsletter follow
      if (sock.newsletterFollow) {
        await sock.newsletterFollow(ch);
        console.log('✅ Auto-followed channel');
      } else if (sock.newsletterMetadata) {
        // older method fallback
        console.log('Channel auto-join: using metadata check');
      }
    } catch (e) {
      console.log('Auto-join channel failed (may already be member):', e.message);
    }
  }
}

// ============ WORKING DOWNLOADER (music + video) ============
// Tries local ./downloader first, then multiple public APIs so music always works.

function isYoutubeUrl(s) {
  return /(?:youtube\.com|youtu\.be)\//i.test(String(s || ''));
}

async function searchYoutube(query) {
  // 1) try yt-search if installed
  try {
    const yts = require('yt-search');
    const r = await yts(query);
    const v = r?.videos?.[0];
    if (v?.url) return { url: v.url, title: v.title, thumbnail: v.thumbnail, duration: v.timestamp };
  } catch {}
  // 2) public search API
  try {
    const r = await dlGet('https://api.siputzx.my.id/api/s/youtube?query=' + encodeURIComponent(query), { timeout: 20000 });
    const arr = r?.data?.data || r?.data?.result || [];
    const v = Array.isArray(arr) ? arr[0] : null;
    if (v) {
      return {
        url: v.url || v.link || ('https://www.youtube.com/watch?v=' + (v.videoId || v.id)),
        title: v.title || v.name || query,
        thumbnail: v.thumbnail || v.thumb || v.image
      };
    }
  } catch {}
  // 3) another public search
  try {
    const r = await dlGet('https://yt-api.p.rapidapi.com/search?query=' + encodeURIComponent(query), {
      timeout: 15000,
      headers: { 'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || '' }
    });
    const v = r?.data?.data?.[0];
    if (v?.videoId) {
      return {
        url: 'https://www.youtube.com/watch?v=' + v.videoId,
        title: v.title || query,
        thumbnail: v.thumbnail?.[0]?.url
      };
    }
  } catch {}
  return null;
}

async function downloadViaCobalt(url, audioOnly) {
  try {
    const r = await axios.post('https://api.cobalt.tools/api/json', {
      url,
      aFormat: 'mp3',
      isAudioOnly: !!audioOnly,
      filenamePattern: 'basic'
    }, {
      timeout: 45000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': UA
      }
    });
    const d = r.data;
    if (d?.status === 'stream' || d?.status === 'redirect' || d?.url) {
      const mediaUrl = d.url || d.audio || d.stream;
      if (mediaUrl) {
        const buf = await fetchBuffer(mediaUrl, 120000);
        return { buffer: buf, title: d.filename || 'media', url: mediaUrl };
      }
    }
  } catch {}
  return null;
}

async function downloadViaSiputzx(url, audioOnly) {
  try {
    const endpoint = audioOnly
      ? 'https://api.siputzx.my.id/api/d/ytmp3?url=' + encodeURIComponent(url)
      : 'https://api.siputzx.my.id/api/d/ytmp4?url=' + encodeURIComponent(url);
    const r = await dlGet(endpoint, { timeout: 60000 });
    const d = r?.data?.data || r?.data?.result || r?.data;
    const mediaUrl = d?.dl || d?.download || d?.url || d?.link || d?.audio || d?.video;
    const title = d?.title || d?.name || 'YouTube';
    if (mediaUrl) {
      const buf = await fetchBuffer(String(mediaUrl), 120000);
      if (buf && buf.length > 1000) return { buffer: buf, title, url: mediaUrl };
    }
  } catch {}
  return null;
}

async function downloadViaYtdl(url, audioOnly) {
  try {
    let ytdl;
    try { ytdl = require('@distube/ytdl-core'); } catch { ytdl = require('ytdl-core'); }
    const info = await ytdl.getInfo(url);
    const title = info?.videoDetails?.title || 'YouTube';
    const format = audioOnly
      ? ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
      : ytdl.chooseFormat(info.formats, { quality: '18' }) || ytdl.chooseFormat(info.formats, { quality: 'lowest' });
    if (!format?.url) return null;
    const buf = await fetchBuffer(format.url, 120000);
    if (buf && buf.length > 1000) return { buffer: buf, title, url: format.url };
  } catch {}
  return null;
}

async function downloadYouTube(query, audioOnly = true) {
  // Prefer local module if user has one
  try {
    const { downloadYouTube: real } = require('./downloader');
    const r = await real(query, audioOnly);
    if (r?.buffer) return r;
  } catch {}

  let url = isYoutubeUrl(query) ? query.trim() : null;
  let title = query;

  if (!url) {
    const found = await searchYoutube(query);
    if (!found?.url) return null;
    url = found.url;
    title = found.title || query;
  }

  // Try multiple download backends
  let data = await downloadViaCobalt(url, audioOnly);
  if (!data?.buffer) data = await downloadViaSiputzx(url, audioOnly);
  if (!data?.buffer) data = await downloadViaYtdl(url, audioOnly);

  if (data?.buffer) {
    data.title = data.title || title;
    return data;
  }
  return null;
}

async function sendAsMp3(sock, jid, data) {
  try {
    const { sendAsMp3: real } = require('./downloader');
    return await real(sock, jid, data);
  } catch {}
  if (!data?.buffer) return false;
  try {
    await sock.sendMessage(jid, {
      audio: data.buffer,
      mimetype: 'audio/mpeg',
      fileName: (data.title || 'audio').replace(/[^\w\s\-]/g, '').slice(0, 60) + '.mp3',
      ptt: false
    });
    // optional caption
    if (data.title) {
      await sock.sendMessage(jid, { text: `🎵 *${data.title}*` }).catch(() => {});
    }
    return true;
  } catch (e) {
    console.log('sendAsMp3:', e.message);
    return false;
  }
}

async function sendAsVideo(sock, jid, data) {
  try {
    const { sendAsVideo: real } = require('./downloader');
    return await real(sock, jid, data);
  } catch {}
  if (!data?.buffer) return false;
  try {
    await sock.sendMessage(jid, {
      video: data.buffer,
      mimetype: 'video/mp4',
      caption: data.title ? `🎬 *${data.title}*` : undefined
    });
    return true;
  } catch (e) {
    console.log('sendAsVideo:', e.message);
    return false;
  }
}

async function askAI(text) {
  try {
    const { askAI: real } = require('./apis');
    return await real(text);
  } catch {}
  // simple public fallback
  try {
    const r = await axios.post('https://api.siputzx.my.id/api/ai/gpt', { content: text }, {
      timeout: 45000,
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA }
    });
    const ans = r?.data?.data || r?.data?.result || r?.data?.message || r?.data?.response;
    if (typeof ans === 'string' && ans.trim()) return ans.trim();
  } catch {}
  return null;
}

async function getLyrics(text) {
  try {
    const { getLyrics: real } = require('./apis');
    return await real(text);
  } catch {}
  try {
    const r = await dlGet('https://api.siputzx.my.id/api/s/lyrics?query=' + encodeURIComponent(text), { timeout: 20000 });
    const d = r?.data?.data || r?.data?.result || r?.data;
    if (d?.lyrics || d?.lyric) {
      return { title: d.title || text, artist: d.artist || d.author || '', lyrics: d.lyrics || d.lyric };
    }
  } catch {}
  return null;
}

async function generateTextImage(effect, text) {
  // Prefer local apis.js if present
  try {
    const { generateTextImage: real } = require('./apis');
    const buf = await real(effect, text);
    if (buf && Buffer.isBuffer(buf) && buf.length > 500) return buf;
  } catch {}

  const q = String(text || '').slice(0, 40);
  const style = String(effect || 'neon').toLowerCase();

  // Photo360 / ephoto360 style effect URLs (text effects like the KEITH neon look)
  const endpoints = [
    // siputzx canvas / textpro
    `https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=${encodeURIComponent(style)}`,
    // alternative textpro style paths used by many bots
    `https://api.siputzx.my.id/api/ephoto/${encodeURIComponent(style)}?text=${encodeURIComponent(q)}`,
    `https://api.siputzx.my.id/api/photooxy/${encodeURIComponent(style)}?text=${encodeURIComponent(q)}`,
    // popcat text effects (works for some styles)
    `https://api.popcat.xyz/${encodeURIComponent(style)}?text=${encodeURIComponent(q)}`,
    // some public ephoto mirrors
    `https://api.lolhuman.xyz/api/ephoto1/${encodeURIComponent(style)}?apikey=GataDios&text=${encodeURIComponent(q)}`
  ];

  // style-specific known good endpoints (Photo360-like)
  const styleUrls = {
    neon: [
      `https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=neon`,
      `https://api.popcat.xyz/outrank?text=${encodeURIComponent(q)}`
    ],
    hacker: [
      `https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=hacker`,
      `https://api.siputzx.my.id/api/ephoto/hacker?text=${encodeURIComponent(q)}`
    ],
    fire: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=fire`],
    glitch: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=glitch`],
    matrix: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=matrix`],
    thunder: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=thunder`],
    blackpink: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=blackpink`],
    luxury: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=luxury`],
    metallic: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=metallic`],
    ice: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=ice`],
    devil: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=devil`],
    sand: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=sand`],
    light: [`https://api.siputzx.my.id/api/canvas/textpro?text=${encodeURIComponent(q)}&style=light`]
  };

  const tryList = [...(styleUrls[style] || []), ...endpoints];

  for (const url of tryList) {
    try {
      const r = await dlGet(url, { responseType: 'arraybuffer', timeout: 40000 });
      if (r.status >= 400 || !r.data) continue;
      const buf = Buffer.from(r.data);
      // skip tiny / html error pages
      if (buf.length < 800) continue;
      const head = buf.slice(0, 20).toString('utf8').toLowerCase();
      if (head.includes('<!doctype') || head.includes('<html') || head.includes('{')) continue;
      return buf;
    } catch {}
  }
  return null;
}

// ============ MAIN BOT ============
async function startBot() {
  await ensureData();
  if (typeof config.AUTO_READ === 'undefined') config.AUTO_READ = false;
  if (typeof config.FONT === 'undefined') config.FONT = 'random';
  // Force auto-changing fonts unless user locked a style with .font
  if (!config.FONT || config.FONT === 'sans' || config.FONT === 'mono') config.FONT = 'random';

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log(`║     ${String(config.BOT_NAME).padEnd(28)} ║`);
  console.log('║  Deadpool still ruling the nation    ║');
  console.log('║  Made by Confronter                  ║');
  console.log('║  We defeated the weak                ║');
  console.log('║  Confronter Techwizard               ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`👤 Owner : ${config.OWNER_NUMBER || '(not set — set OWNER_NUMBER in Heroku)'}`);
  console.log(`⚡ Prefix: ${config.PREFIX}`);
  console.log(`🌐 Mode  : ${config.MODE}`);
  console.log('');

  const { state, saveCreds } = await loadAuthState();
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    printQRInTerminal: !config.SESSION,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    emitOwnEvents: true,
    fireInitQueries: true,
    msgRetryCounterCache: new NodeCache({ stdTTL: 600, checkperiod: 120 }),
    // Critical for reducing "Waiting for this message"
    getMessage: async (key) => {
      try {
        if (!key?.id) return undefined;
        const c = msgCache.get(key.id);
        if (c?.message) return c.message;
        // minimal stub so Baileys can still decrypt retries
        return { conversation: '' };
      } catch {
        return { conversation: '' };
      }
    }
  });

  const _origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options) => {
    const r = await _origSend(jid, content, options);
    try {
      if (r?.key?.id && r?.message) msgCache.set(r.key.id, { key: r.key, message: r.message, timestamp: Date.now() });
    } catch {}
    return r;
  };

  sock.ev.on('creds.update', saveCreds);
  process.on('unhandledRejection', err => {
    const m = String(err?.message || err || '');
    if (_match(m)) return;
    console.log('unhandledRejection:', m.slice(0, 200));
  });

  // ============ CONNECTION ============
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      console.log(`✅ ${config.BOT_NAME} ONLINE`);
      console.log(`👤 Owner     : ${config.OWNER_NUMBER}`);
      console.log(`🌐 Mode      : ${config.MODE}\n`);

      // Auto-join group + channel every time we connect / restart
      setTimeout(() => autoJoinConfigured().catch(() => {}), 2500);

      try {
        const pm = presenceMap(config.PRESENCE);
        if (pm) sock.sendPresenceUpdate(pm).catch(() => {});
      } catch {}

      setImmediate(async () => {
        try {
          const me = sock.user?.id;
          if (!me) return;
          const jid = me.includes(':') ? me.split(':')[0] + '@s.whatsapp.net' : jidNormalizedUser(me);
          await sock.sendMessage(jid, { text: buildStartMessage() });
          console.log('📩 Start message sent');
          // Tell owner to wait while bot finishes key sync
          await delay(1500);
          await sock.sendMessage(jid, { text: buildSyncWaitMessage() });
        } catch (e) {
          console.log('start send:', e.message);
        }
      });
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output?.statusCode : 0;
      console.log(`Connection closed (${code})`);
      if (code === DisconnectReason.loggedOut) {
        await fs.remove(AUTH_DIR).catch(() => {});
        process.exit(1);
      }
      console.log('🔄 Reconnecting in 5s...');
      setTimeout(startBot, 5000);
    }
  });

  // ============ ANTICALL ============
  sock.ev.on('call', async (calls) => {
    if (!config.ANTI_CALL) return;
    for (const call of calls) {
      if (call.status === 'offer') {
        try {
          await sock.rejectCall(call.id, call.from);
          const msg = config.ANTI_CALL_MSG || 'Calls are not allowed right now. Please text instead.';
          await sock.sendMessage(call.from, {
            text: `📞 *${config.BOT_NAME}*\n\n${msg}`
          }).catch(() => {});
        } catch (e) {
          console.log('anticall:', e.message);
        }
      }
    }
  });

  // ============ WELCOME / GOODBYE ============
  sock.ev.on('group-participants.update', async (u) => {
    try {
      const { id, participants, action } = u;
      const meta = await getMeta(id);
      const gname = meta?.subject || 'Group';
      // Learn LID → phone from group metadata
      try {
        for (const p of meta?.participants || []) {
          if (p.id?.includes('@lid') && p.phoneNumber) {
            _lidMap.set(p.id.split('@')[0], String(p.phoneNumber).split('@')[0].replace(/\D/g, ''));
          }
          if (p.id && !String(p.id).includes('@lid')) {
            const ph = String(p.id).split('@')[0].split(':')[0];
            if (/^\d{6,15}$/.test(ph)) _lidMap.set(ph, ph);
          }
        }
      } catch {}

      for (const p of participants) {
        // Resolve a mentionable number for this participant
        let phone = jidToPhone(p, null);
        if (phone === 'unknown' || phone === 'hidden') {
          // try from metadata entry
          const entry = (meta?.participants || []).find(x => x.id === p || String(x.id).split('@')[0] === String(p).split('@')[0]);
          if (entry?.phoneNumber) phone = String(entry.phoneNumber).split('@')[0].replace(/\D/g, '');
          else if (entry?.id && !String(entry.id).includes('@lid')) phone = String(entry.id).split('@')[0].split(':')[0];
        }
        if (!phone || phone === 'unknown' || phone === 'hidden') {
          const rawId = String(p).split('@')[0].split(':')[0];
          if (/^\d{6,15}$/.test(rawId)) phone = rawId;
        }
        // WhatsApp needs @number in text + jid in mentions array
        const tag = (phone && /^\d{6,15}$/.test(phone)) ? ('@' + phone) : '@user';
        const mentionJid = (phone && /^\d{6,15}$/.test(phone))
          ? (phone + '@s.whatsapp.net')
          : p;

        if (action === 'add' && config.WELCOME) {
          const raw = (config.WELCOME_MSG || 'Welcome @user to *@group*!')
            .replace(/@user/gi, tag)
            .replace(/@group/gi, gname);
          await sock.sendMessage(id, {
            text: styleReplyText(raw),
            mentions: [mentionJid, p].filter(Boolean)
          });
        }
        if ((action === 'remove' || action === 'leave') && config.GOODBYE) {
          const raw = (config.GOODBYE_MSG || 'Goodbye @user from *@group*.')
            .replace(/@user/gi, tag)
            .replace(/@group/gi, gname);
          await sock.sendMessage(id, {
            text: styleReplyText(raw),
            mentions: [mentionJid, p].filter(Boolean)
          });
        }
      }
    } catch (e) {
      console.log('welcome/goodbye:', e.message);
    }
  });

  // ============ MESSAGES ============
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type && type !== 'notify' && type !== 'append') return;
    for (const m of messages) {
      handleMessage(m).catch(e => console.log('msg err:', e?.message || e));
    }
  });

  function unwrapMessage(msg) {
    if (!msg) return null;
    let cur = msg;
    for (let i = 0; i < 6; i++) {
      if (cur.ephemeralMessage?.message) cur = cur.ephemeralMessage.message;
      else if (cur.viewOnceMessage?.message) cur = cur.viewOnceMessage.message;
      else if (cur.viewOnceMessageV2?.message) cur = cur.viewOnceMessageV2.message;
      else if (cur.viewOnceMessageV2Extension?.message) cur = cur.viewOnceMessageV2Extension.message;
      else if (cur.documentWithCaptionMessage?.message) cur = cur.documentWithCaptionMessage.message;
      else break;
    }
    return cur;
  }

  function extractText(msg) {
    const u = unwrapMessage(msg) || msg;
    if (!u) return '';
    return (
      u.conversation ||
      u.extendedTextMessage?.text ||
      u.imageMessage?.caption ||
      u.videoMessage?.caption ||
      u.documentMessage?.caption ||
      u.buttonsResponseMessage?.selectedDisplayText ||
      u.listResponseMessage?.title ||
      u.templateButtonReplyMessage?.selectedDisplayText ||
      ''
    );
  }

  async function handleMessage(m) {
    try {
      if (!m?.message || !m?.key) return;
      if (m.key?.id) {
        cacheLid(m.key, m);
        try {
          msgCache.set(m.key.id, {
            key: m.key,
            message: JSON.parse(JSON.stringify(m.message)),
            pushName: m.pushName,
            participant: m.key.participant || m.key.remoteJid,
            participantAlt: m.key.participantAlt || m.key.remoteJidAlt || null,
            remoteJid: m.key.remoteJid,
            timestamp: Date.now()
          });
        } catch {}
      }

      const from = m.key.remoteJid;
      const sender = m.key.participant || m.key.remoteJid;
      const isMe = !!m.key.fromMe;

      // Presence on EVERY incoming user message (not only commands)
      if (!isMe && from && from !== 'status@broadcast') {
        const pm = presenceMap(config.PRESENCE) || 'composing';
        sock.sendPresenceUpdate(pm, from).catch(() => {});
      }

      // Blue ticks (read receipts)
      if (config.AUTO_READ && !isMe && from && from !== 'status@broadcast') {
        sock.readMessages([m.key]).catch(() => {});
      }

      // Protocol messages (delete / edit)
      const protoMsg = m.message?.protocolMessage;
      if (protoMsg && (protoMsg.type === 0 || protoMsg.type === 'REVOKE' || protoMsg.type === 1)) {
        const key = protoMsg.key || m.key;
        const cached = key?.id ? msgCache.get(key.id) : null;
        if (cached?.message) forwardDelete(key, cached).catch(() => {});
        return;
      }

      if (protoMsg && (protoMsg.type === 14 || protoMsg.type === 'MESSAGE_EDIT' || protoMsg.editedMessage)) {
        if (config.ANTI_EDIT && config.ANTI_EDIT !== 'off') {
          try {
            const key = protoMsg.key || m.key;
            const cached = key?.id ? msgCache.get(key.id) : null;
            const edited = protoMsg.editedMessage || {};
            const newText = edited.conversation || edited.extendedTextMessage?.text || '';
            const oldText = cached?.message?.conversation || cached?.message?.extendedTextMessage?.text || '[unknown]';
            const target = config.ANTI_EDIT === 'chat' ? from : getOwnerJid();
            if (target) {
              const who = jidToPhone(key.participant || from, m);
              sock.sendMessage(target, {
                text: `✅ *${config.BOT_NAME} antiEdit*\n• Edited by: +${who}\n• Chat: ${isGroup(from) ? 'Group' : 'DM'}\n\n📝 *Before:*\n${oldText}\n\n✏️ *After:*\n${newText || '[media]'}`
              }).catch(() => {});
            }
          } catch {}
        }
        return;
      }

      if (!isMe && from && !from.includes('status')) saveUser(sender).catch(() => {});

      // STATUS handling
      if (from === 'status@broadcast' || m.key?.remoteJidAlt === 'status@broadcast') {
        if (isMe) return;
        const rawP = m.key.participant || m.participant || m.key.participantAlt || '';
        let poster = rawP;
        if (String(rawP).includes('@lid')) {
          const phone = jidToPhone(rawP, m);
          if (phone && phone !== 'hidden') poster = phone + '@s.whatsapp.net';
        }
        const statusKey = {
          remoteJid: 'status@broadcast',
          id: m.key.id,
          participant: poster || m.key.participant,
          fromMe: false
        };
        if (config.AUTO_VIEW_STATUS) {
          sock.readMessages([statusKey]).catch(() => {
            sock.readMessages([m.key]).catch(() => {});
          });
        }
        if (config.AUTO_LIKE_STATUS) {
          const emoji = statusLikeEmoji();
          if (emoji) {
            const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
            const list = [...new Set([poster, rawP, botJid].filter(Boolean))];
            sock.sendMessage('status@broadcast', { react: { text: emoji, key: statusKey } }, { statusJidList: list })
              .catch(() => sock.sendMessage('status@broadcast', { react: { text: emoji, key: m.key } }, { statusJidList: list }).catch(() => {}));
          }
        }
        return;
      }

      // ANTI-VIEW-ONCE
      if (config.ANTI_VIEW_ONCE && config.ANTI_VIEW_ONCE !== 'off') {
        const ct = getContentType(m.message);
        const isVO = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'].includes(ct)
          || !!m.message?.viewOnceMessage || !!m.message?.viewOnceMessageV2;
        if (isVO && !isMe) {
          try {
            const voMsg = m.message.viewOnceMessage?.message
              || m.message.viewOnceMessageV2?.message
              || m.message.viewOnceMessageV2Extension?.message
              || m.message;
            const mode = String(config.ANTI_VIEW_ONCE).toLowerCase();
            const me = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
            const target = (mode === 'dm' || mode === 'pm' || mode === 'private') ? (getOwnerJid() || me || from) : from;
            let dl = await downloadMediaMsg(voMsg);
            if (!dl) dl = await downloadMediaMsg(m.message);
            const phone = jidToPhone(sender, m);
            const head = `🔓 *antiViewOnce*\n• From: +${phone}\n• Chat: ${isGroup(from) ? 'Group' : 'DM'}`;
            if (dl?.buffer) {
              if (dl.type === 'imageMessage') await sock.sendMessage(target, { image: dl.buffer, caption: head });
              else if (dl.type === 'videoMessage') await sock.sendMessage(target, { video: dl.buffer, caption: head, mimetype: 'video/mp4' });
              else if (dl.type === 'audioMessage') {
                await sock.sendMessage(target, { audio: dl.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
                await sock.sendMessage(target, { text: head });
              } else await sock.sendMessage(target, { document: dl.buffer, fileName: 'vo.bin', caption: head });
            }
          } catch {}
        }
      }

      const body = extractText(m.message);

      if (config.AUTO_REACT && !isMe) {
        const isCmd = body && body.startsWith(config.PREFIX || '.');
        if (!isCmd) react(from, m.key, msgReactEmoji());
      }

      // Antilink
      if (isGroup(from) && !isMe && (config.ANTILINK || (await getGroup(from, 'antilink')))) {
        if (hasLink(body) && !(await isGroupAdmin(from, sender)) && !isOwner(sender)) {
          try {
            if (await isBotAdmin(from)) {
              await sock.sendMessage(from, { delete: m.key }).catch(() => {});
              await sock.sendMessage(from, {
                text: `🔗 Antilink: @${sender.split('@')[0]} links are not allowed.`,
                mentions: [sender]
              });
            }
          } catch {}
          return;
        }
      }

      const cleanBody = (body || '').trim();
      const prefix = String(config.PREFIX || '.').trim() || '.';
      if (!cleanBody) return;
      if (!cleanBody.startsWith(prefix)) return;
      if (config.MODE === 'private' && !isOwner(sender) && !isMe) return;
      if (typeof isBotExpired === 'function' && isBotExpired() && !isOwner(sender) && !isMe) {
        await sock.sendMessage(from, { text: config.EXPIRY_MSG || '⛔ Bot expired.' }).catch(() => {});
        return;
      }

      const args = cleanBody.slice(prefix.length).trim().split(/\s+/);
      const cmd = (args.shift() || '').toLowerCase();
      const text = args.join(' ');
      console.log('CMD:', cmd, '| fromMe:', isMe, '| from:', String(from || '').split('@')[0]);
      react(from, m.key, cmdReactEmoji());

      const reply = async (content) => {
        try {
          const foot = buildFooter();
          if (typeof content === 'string') {
            let b = String(content).trim();
            if (!b) return;
            try { b = styleReplyText(b); } catch {}
            const hasCredit = /confronter|powered by/i.test(b);
            const finalText = hasCredit ? b : b + foot;
            return await sock.sendMessage(from, { text: finalText });
          }
          const payload = { ...content };
          if (payload.text != null) {
            const t = String(payload.text).trim();
            if (!t) delete payload.text;
            else {
              try { payload.text = styleReplyText(t); } catch { payload.text = t; }
            }
          }
          if (payload.caption != null) {
            let cap = String(payload.caption);
            try { cap = styleReplyText(cap); } catch {}
            if (foot && !/confronter|powered by/i.test(cap)) cap = cap.trimEnd() + foot;
            payload.caption = cap;
          }
          if (!payload.text && !payload.image && !payload.video && !payload.audio && !payload.document && !payload.sticker && !payload.react) return;
          return await sock.sendMessage(from, payload);
        } catch (e) {
          console.log('reply error:', e?.message || e);
          try {
            if (typeof content === 'string' && content.trim()) {
              await sock.sendMessage(from, { text: content.trim() });
            }
          } catch {}
        }
      };

      const pm = presenceMap(config.PRESENCE);
      if (pm) sock.sendPresenceUpdate(pm, from).catch(() => {});

      // ========== MENU ==========
      if (['menu', 'help', 'list'].includes(cmd)) {
        let userCount = 0;
        try { userCount = (await loadUsers()).length; } catch {}
        await sendMenuWithMedia(from, m.pushName, userCount);
        return;
      }

      // ========== PING ==========
      if (cmd === 'ping') {
        const t0 = Date.now();
        try { await sock.sendPresenceUpdate('composing', from); } catch {}
        const speed = Date.now() - t0;
        await reply(`⚡ *${config.BOT_NAME}* pinging…\n> Speed: *${speed}ms*`);
        return;
      }

      // ========== ALIVE ==========
      if (cmd === 'alive' || cmd === 'uptime') {
        const up = Math.floor(process.uptime());
        const h = Math.floor(up / 3600), mn = Math.floor((up % 3600) / 60), s = up % 60;
        await reply(`✅ *${config.BOT_NAME}* is alive\n⏱ ${h}h ${mn}m ${s}s\n🌐 Mode: ${config.MODE}`);
        return;
      }

      // ========== OWNER ==========
      if (cmd === 'owner') {
        await reply(`👑 *Owner*\nwa.me/${config.OWNER_NUMBER}\n${config.DEV_LINK || ''}`);
        return;
      }

      // ========== GPT ==========
      if (['gpt', 'ai', 'ask', 'chatgpt'].includes(cmd)) {
        if (!text) { await reply(`Usage: ${prefix}gpt <question>`); return; }
        await reply('🤖 Thinking…');
        const ans = await askAI(text);
        if (ans) {
          const t = ans.length > 3500 ? ans.slice(0, 3500) + '…' : ans;
          await reply(`🤖 *${config.BOT_NAME} AI*\n\n${t}`);
        } else await reply('❌ AI is busy. Try again later.');
        return;
      }

      // ========== LYRICS ==========
      if (['lyrics', 'lyric', 'lirik'].includes(cmd)) {
        if (!text) { await reply(`Usage: ${prefix}lyrics <song>`); return; }
        await reply('⏳ Searching lyrics…');
        const data = await getLyrics(text);
        if (data?.lyrics) {
          let lyr = data.lyrics.length > 3500 ? data.lyrics.slice(0, 3500) + '…' : data.lyrics;
          await reply(`🎵 *${data.title}*${data.artist ? ' — ' + data.artist : ''}\n\n${lyr}`);
        } else await reply('❌ No lyrics found.');
        return;
      }

      // ========== PLAY ==========
      if (['play', 'song', 'ytmp3', 'music'].includes(cmd)) {
        if (!text) { await reply(`Usage: ${prefix}play <song name>`); return; }
        await reply('⏳ Searching & downloading…');
        const q = text.replace(/\s+/g, ' ').trim();
        let data = await downloadYouTube(q, true);
        if (!data?.buffer && q.split(' ').length > 2) {
          const simple = q.split(' ').filter(w => w.length > 2).join(' ');
          if (simple && simple !== q) data = await downloadYouTube(simple, true);
        }
        if (!data?.buffer) {
          await reply('❌ Could not find that track.\nTry a clearer name or paste a YouTube link.');
          return;
        }
        const ok = await sendAsMp3(sock, from, data);
        if (!ok) await reply('❌ Downloaded but failed to send audio.');
        return;
      }

      // ========== VIDEO ==========
      if (['yt', 'youtube', 'ytmp4', 'video', 'ytv'].includes(cmd)) {
        if (!text) { await reply(`Usage: ${prefix}video <url or search>`); return; }
        await reply('⏳ Downloading video…');
        const q = text.replace(/\s+/g, ' ').trim();
        let data = await downloadYouTube(q, false);
        if (!data?.buffer && q.split(' ').length > 2) {
          const simple = q.split(' ').filter(w => w.length > 2).join(' ');
          if (simple && simple !== q) data = await downloadYouTube(simple, false);
        }
        if (!data?.buffer) {
          await reply('❌ Could not download video.\nTry a direct YouTube link.');
          return;
        }
        const ok = await sendAsVideo(sock, from, data);
        if (!ok) await reply('❌ Downloaded but failed to send video.');
        return;
      }

      // ========== TIKTOK ==========
      if (['tiktok', 'tt'].includes(cmd)) {
        if (!text || !text.includes('tiktok')) { await reply(`Usage: ${prefix}tiktok <url>`); return; }
        await reply('⏳ Downloading TikTok…');
        let data = null;
        try {
          const r = await dlGet('https://tikwm.com/api/?url=' + encodeURIComponent(text));
          const d = r?.data?.data;
          if (d?.play) data = { url: d.play, title: d.title || 'TikTok' };
        } catch {}
        if (!data) { await reply('❌ Failed'); return; }
        try {
          const buf = await fetchBuffer(data.url);
          await sock.sendMessage(from, { video: buf, caption: '🎵 ' + data.title, mimetype: 'video/mp4' });
        } catch {
          await reply(`✅ ${data.url}`);
        }
        return;
      }

      // ========== INSTAGRAM ==========
      if (['ig', 'instagram', 'insta'].includes(cmd)) {
        if (!text || !text.includes('instagram')) { await reply(`Usage: ${prefix}ig <url>`); return; }
        await reply('⏳ Downloading Instagram…');
        try {
          const r = await dlGet('https://api.siputzx.my.id/api/d/igdl?url=' + encodeURIComponent(text));
          const arr = r?.data?.data || r?.data?.result || [];
          const first = Array.isArray(arr) ? arr[0] : null;
          const url = first?.url || first?.download_link || first;
          if (!url) { await reply('❌ Failed'); return; }
          const isV = String(url).includes('.mp4') || first?.type === 'video';
          if (isV) await sock.sendMessage(from, { video: { url: String(url) }, caption: '📸 Instagram' });
          else await sock.sendMessage(from, { image: { url: String(url) }, caption: '📸 Instagram' });
        } catch {
          await reply('❌ IG failed');
        }
        return;
      }

      // ========== TEXTMAKER ==========
      const fx = ['neon', 'fire', 'glitch', 'ice', 'matrix', 'thunder', 'devil', 'sand', 'blackpink', 'metallic', 'light', 'hacker', 'paper', 'luxury', 'fire2', 'glow', 'gold', 'rainbow'];
      if (fx.includes(cmd)) {
        const q = (text || m.pushName || 'Deadpool').slice(0, 40);
        await reply(`🎨 Creating *${cmd}*…`);
        let buf = null;
        try {
          buf = await Promise.race([
            generateTextImage(cmd, q),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 50000))
          ]);
        } catch (e2) {
          console.log('textmaker:', e2.message);
        }
        if (!buf || !Buffer.isBuffer(buf) || buf.length < 500) {
          await reply('❌ Effect failed. Try again or shorter text.');
          return;
        }
        try {
          await sock.sendMessage(from, { image: buf, caption: `✨ *${cmd.toUpperCase()}* — ${q}` });
        } catch {
          await reply('❌ Send failed.');
        }
        return;
      }

      // ========== STICKER ==========
      if (['sticker', 's', 'stiker'].includes(cmd)) {
        try {
          const q = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const media = q || (m.message?.imageMessage ? m.message : null) || (m.message?.videoMessage ? m.message : null);
          if (!media) { await reply(`Reply to an image/video with ${prefix}sticker`); return; }
          await reply('⏳ Creating sticker…');
          const dl = await downloadMediaMsg(media);
          if (!dl?.buffer) { await reply('❌ Download failed.'); return; }
          const st = new Sticker(dl.buffer, {
            pack: config.BOT_NAME,
            author: 'Confronter',
            type: StickerTypes.FULL,
            quality: 80
          });
          await sock.sendMessage(from, { sticker: await st.toBuffer() });
        } catch {
          await reply('❌ Sticker failed.');
        }
        return;
      }

      if (['toimg', 'toimage', 'photo'].includes(cmd)) {
        try {
          const q = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!q?.stickerMessage) { await reply(`Reply to a sticker with ${prefix}toimg`); return; }
          const dl = await downloadMediaMsg(q);
          if (!dl?.buffer) { await reply('❌ Failed.'); return; }
          await sock.sendMessage(from, { image: dl.buffer, caption: `🖼️ by ${config.BOT_NAME}` });
        } catch {
          await reply('❌ Convert failed.');
        }
        return;
      }

      // ========== QC (Quote) ==========
      if (cmd === 'qc' || cmd === 'qcstick') {
        let teks = text;
        if (!teks && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
          const q = m.message.extendedTextMessage.contextInfo.quotedMessage;
          teks = q.conversation || q.extendedTextMessage?.text || '';
        }
        if (!teks) { await reply(`Usage: ${prefix}${cmd} <text>`); return; }
        try {
          const username = m.pushName || 'User';
          const avatar = await sock.profilePictureUrl(sender, 'image').catch(() => 'https://i0.wp.com/telegra.ph/file/134ccbbd0dfc434a910ab.png');
          const json = {
            type: 'quote',
            format: 'png',
            backgroundColor: '#FFFFFF',
            width: 512,
            height: 768,
            scale: 2,
            messages: [{
              entities: [],
              avatar: true,
              from: { id: 1, name: username, photo: { url: avatar } },
              text: teks,
              replyMessage: {}
            }]
          };
          const res = await axios.post('https://bot.lyo.su/quote/generate', json, {
            headers: { 'Content-Type': 'application/json' }
          });
          const buffer = Buffer.from(res.data.result.image, 'base64');
          if (cmd === 'qcstick') {
            const st = new Sticker(buffer, {
              pack: config.BOT_NAME,
              author: 'Confronter',
              type: StickerTypes.FULL,
              quality: 90
            });
            await sock.sendMessage(from, { sticker: await st.toBuffer() });
          } else {
            await sock.sendMessage(from, { image: buffer });
          }
        } catch (e) {
          await reply('❌ Quote generation failed.');
        }
        return;
      }

      // ========== .vv — view once to owner ==========
      if (cmd === 'vv' || cmd === 'viewonce' || cmd === 'rvo') {
        try {
          const ctx = m.message?.extendedTextMessage?.contextInfo;
          const quoted = ctx?.quotedMessage;
          let vo = quoted?.viewOnceMessage?.message
            || quoted?.viewOnceMessageV2?.message
            || quoted?.viewOnceMessageV2Extension?.message;
          if (!vo && quoted && (quoted.imageMessage || quoted.videoMessage || quoted.audioMessage)) vo = quoted;
          if (!vo) vo = m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message;
          if (!vo) { await reply(`Reply to a view-once with ${prefix}vv`); return; }

          const ownerJid = getOwnerJid();
          const me = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
          const target = ownerJid || me;
          if (!target) { await reply('❌ Owner not configured.'); return; }

          const dl = await downloadMediaMsg(vo);
          if (!dl?.buffer) { await reply('❌ Could not download view-once.'); return; }

          const phone = jidToPhone(sender, m);
          const head = `🔓 *ViewOnce*\n• From: +${phone}\n• Chat: ${isGroup(from) ? 'Group' : 'DM'}`;

          if (dl.type === 'imageMessage') {
            await sock.sendMessage(target, { image: dl.buffer, caption: head });
          } else if (dl.type === 'videoMessage') {
            await sock.sendMessage(target, { video: dl.buffer, mimetype: 'video/mp4', caption: head });
          } else if (dl.type === 'audioMessage') {
            await sock.sendMessage(target, { audio: dl.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: !!vo.audioMessage?.ptt });
            await sock.sendMessage(target, { text: head });
          } else {
            await sock.sendMessage(target, { document: dl.buffer, fileName: 'vo.bin', caption: head });
          }
          react(from, m.key, '✅');
        } catch (e) {
          await reply('❌ VV failed: ' + e.message);
        }
        return;
      }

      // ========== DELETE (bot messages) ==========
      if (cmd === 'delete' || cmd === 'del') {
        try {
          const quoted = m.message?.extendedTextMessage?.contextInfo;
          if (!quoted?.stanzaId) { await reply('Reply to a message I sent.'); return; }
          await sock.sendMessage(from, {
            delete: {
              remoteJid: from,
              fromMe: true,
              id: quoted.stanzaId,
              participant: quoted.participant
            }
          });
        } catch {
          await reply('❌ Could not delete.');
        }
        return;
      }

      // ========== FUN ==========
      if (cmd === 'joke') {
        try {
          const r = await dlGet('https://official-joke-api.appspot.com/random_joke');
          await reply(`😂 *${r.data.setup}*\n\n_${r.data.punchline}_`);
        } catch {
          await reply('😂 Why did the bot go to therapy? Too many Bad MAC errors.');
        }
        return;
      }
      if (cmd === 'quote') {
        try {
          const r = await dlGet('https://api.quotable.io/random');
          await reply(`💬 *"${r.data.content}"*\n— ${r.data.author}`);
        } catch {
          await reply('💬 Stay hungry, stay foolish.');
        }
        return;
      }
      if (cmd === 'dice') {
        await reply(`🎲 You rolled: *${Math.floor(Math.random() * 6) + 1}*`);
        return;
      }
      if (cmd === 'coinflip') {
        await reply(Math.random() > 0.5 ? '🪙 Heads!' : '🪙 Tails!');
        return;
      }
      if (cmd === '8ball') {
        const a = ['Yes', 'No', 'Maybe', 'Ask again', 'Definitely', 'Never', 'Sure', 'I doubt it'];
        await reply('🎱 ' + a[Math.floor(Math.random() * a.length)]);
        return;
      }

      // ========== CALC / WEATHER ==========
      if (cmd === 'calc') {
        if (!text) { await reply(`Usage: ${prefix}calc 2+2*5`); return; }
        try {
          const safe = text.replace(/[^0-9+\-*/().%\s]/g, '').slice(0, 60);
          const result = Function('"use strict"; return (' + safe + ')')();
          await reply(`🧮 *${safe}* = *${result}*`);
        } catch {
          await reply('❌ Invalid expression');
        }
        return;
      }
      if (cmd === 'weather') {
        if (!text) { await reply(`Usage: ${prefix}weather Nairobi`); return; }
        try {
          const r = await dlGet('https://wttr.in/' + encodeURIComponent(text) + '?format=3', {
            headers: { 'User-Agent': 'curl/7.68.0', Accept: 'text/plain' }
          });
          const body = String(r.data || '').trim();
          // Avoid HTML pages
          if (!body || body.startsWith('<!') || body.includes('<html')) {
            await reply('❌ Weather service returned invalid data. Try again later.');
            return;
          }
          await reply(`🌤️ ${body}`);
        } catch {
          await reply('❌ Weather unavailable');
        }
        return;
      }

      // ========== GAMES ==========
      // Family 100
      if (cmd === 'family100') {
        if (games.family100[from]) {
          await reply('There is still an active Family 100 session in this chat!');
          return;
        }
        try {
          const anu = await (await dlGet('https://raw.githubusercontent.com/BochilTeam/database/master/games/family100.json')).data;
          const random = anu[Math.floor(Math.random() * anu.length)];
          const hasil = `*Answer the following question:*\n${random.soal}\n\nThere are *${random.jawaban.length}* answers${random.jawaban.find(v => v.includes(' ')) ? ' (some answers contain spaces)' : ''}`;
          games.family100[from] = {
            id: from,
            ...random,
            terjawab: Array.from(random.jawaban, () => false),
            hadiah: 6
          };
          await reply(hasil);
        } catch {
          await reply('❌ Failed to load Family 100 questions.');
        }
        return;
      }

      // Tebak series
      if (cmd === 'tebak') {
        if (!text) {
          await reply(`Example: ${prefix}tebak lagu\n\nOptions:\n• lagu\n• gambar\n• kata\n• kalimat\n• lirik\n• lontong`);
          return;
        }
        const type = args[0]?.toLowerCase();
        const senderKey = sender.split('@')[0];

        if (type === 'lagu') {
          if (games.tebaklagu[senderKey]) return reply('You still have an unfinished session!');
          try {
            // simple fallback – in real use load from local json
            await reply('🎵 Guess the song (feature needs local database).');
          } catch {
            await reply('❌ Failed.');
          }
          return;
        }
        if (type === 'gambar') {
          if (games.tebakgambar[senderKey]) return reply('You still have an unfinished session!');
          try {
            const anu = await (await dlGet('https://raw.githubusercontent.com/BochilTeam/database/master/games/tebakgambar.json')).data;
            const result = anu[Math.floor(Math.random() * anu.length)];
            games.tebakgambar[senderKey] = result.jawaban.toLowerCase();
            await sock.sendMessage(from, {
              image: { url: result.img },
              caption: `Guess the picture!\n\nDescription: ${result.deskripsi}\nTime: 60s`
            });
            setTimeout(() => {
              if (games.tebakgambar[senderKey]) {
                reply(`Time's up!\nAnswer: *${games.tebakgambar[senderKey]}*`);
                delete games.tebakgambar[senderKey];
              }
            }, 60000);
          } catch {
            await reply('❌ Failed to load picture quiz.');
          }
          return;
        }
        if (type === 'kata') {
          if (games.tebakkata[senderKey]) return reply('You still have an unfinished session!');
          try {
            const anu = await (await dlGet('https://raw.githubusercontent.com/BochilTeam/database/master/games/tebakkata.json')).data;
            const result = anu[Math.floor(Math.random() * anu.length)];
            games.tebakkata[senderKey] = result.jawaban.toLowerCase();
            await reply(`Guess the word!\n\n${result.soal}\nTime: 60s`);
            setTimeout(() => {
              if (games.tebakkata[senderKey]) {
                reply(`Time's up!\nAnswer: *${games.tebakkata[senderKey]}*`);
                delete games.tebakkata[senderKey];
              }
            }, 60000);
          } catch {
            await reply('❌ Failed.');
          }
          return;
        }
        if (type === 'kalimat') {
          if (games.tebakkalimat[senderKey]) return reply('You still have an unfinished session!');
          try {
            const anu = await (await dlGet('https://raw.githubusercontent.com/BochilTeam/database/master/games/tebakkalimat.json')).data;
            const result = anu[Math.floor(Math.random() * anu.length)];
            games.tebakkalimat[senderKey] = result.jawaban.toLowerCase();
            await reply(`Guess the sentence!\n\n${result.soal}\nTime: 60s`);
            setTimeout(() => {
              if (games.tebakkalimat[senderKey]) {
                reply(`Time's up!\nAnswer: *${games.tebakkalimat[senderKey]}*`);
                delete games.tebakkalimat[senderKey];
              }
            }, 60000);
          } catch {
            await reply('❌ Failed.');
          }
          return;
        }
        if (type === 'lirik') {
          if (games.tebaklirik[senderKey]) return reply('You still have an unfinished session!');
          try {
            const anu = await (await dlGet('https://raw.githubusercontent.com/BochilTeam/database/master/games/tebaklirik.json')).data;
            const result = anu[Math.floor(Math.random() * anu.length)];
            games.tebaklirik[senderKey] = result.jawaban.toLowerCase();
            await reply(`This is a lyric from which song?\n\n*${result.soal}*\nTime: 60s`);
            setTimeout(() => {
              if (games.tebaklirik[senderKey]) {
                reply(`Time's up!\nAnswer: *${games.tebaklirik[senderKey]}*`);
                delete games.tebaklirik[senderKey];
              }
            }, 60000);
          } catch {
            await reply('❌ Failed.');
          }
          return;
        }
        if (type === 'lontong') {
          if (games.caklontong[senderKey]) return reply('You still have an unfinished session!');
          try {
            const anu = await (await dlGet('https://raw.githubusercontent.com/BochilTeam/database/master/games/caklontong.json')).data;
            const result = anu[Math.floor(Math.random() * anu.length)];
            games.caklontong[senderKey] = result.jawaban.toLowerCase();
            games.caklontong_desk[senderKey] = result.deskripsi;
            await reply(`*Answer this:*\n${result.soal}\nTime: 60s`);
            setTimeout(() => {
              if (games.caklontong[senderKey]) {
                reply(`Time's up!\nAnswer: *${games.caklontong[senderKey]}*\nDescription: ${games.caklontong_desk[senderKey]}`);
                delete games.caklontong[senderKey];
                delete games.caklontong_desk[senderKey];
              }
            }, 60000);
          } catch {
            await reply('❌ Failed.');
          }
          return;
        }
        await reply('Unknown type. Use: lagu | gambar | kata | kalimat | lirik | lontong');
        return;
      }

      // Math quiz
      if (cmd === 'math' || cmd === 'kuismath') {
        const senderKey = sender.split('@')[0];
        if (games.math[senderKey]) return reply('You still have an unfinished math quiz!');
        const modes = {
          easy: { min: 1, max: 20, ops: ['+', '-'] },
          medium: { min: 10, max: 50, ops: ['+', '-', '*'] },
          hard: { min: 20, max: 100, ops: ['+', '-', '*'] }
        };
        const mode = (text || 'easy').toLowerCase();
        if (!modes[mode]) {
          await reply(`Mode: ${Object.keys(modes).join(' | ')}\nExample: ${prefix}math medium`);
          return;
        }
        const mdef = modes[mode];
        const a = Math.floor(Math.random() * (mdef.max - mdef.min + 1)) + mdef.min;
        const b = Math.floor(Math.random() * (mdef.max - mdef.min + 1)) + mdef.min;
        const op = mdef.ops[Math.floor(Math.random() * mdef.ops.length)];
        let answer;
        if (op === '+') answer = a + b;
        else if (op === '-') answer = a - b;
        else answer = a * b;
        games.math[senderKey] = answer;
        await reply(`*What is the result of: ${a} ${op} ${b} ?*\n\nTime: 30 seconds`);
        setTimeout(() => {
          if (games.math[senderKey] !== undefined) {
            reply(`Time's up!\nAnswer: *${games.math[senderKey]}*`);
            delete games.math[senderKey];
          }
        }, 30000);
        return;
      }

      // TicTacToe (simplified)
      if (['ttt', 'tictactoe', 'ttc'].includes(cmd)) {
        await reply('TicTacToe is available. Tag a friend or wait for a partner.\n(Full room system can be expanded later.)');
        return;
      }

      // Suit
      if (['suit', 'suitpvp'].includes(cmd)) {
        if (!m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]) {
          await reply(`Tag someone to challenge!\nExample: ${prefix}suit @user`);
          return;
        }
        await reply('Suit challenge sent! (Full PvP logic can be expanded.)');
        return;
      }

      // Answer checking for games (simple)
      if (!isMe && cleanBody && !cleanBody.startsWith(prefix)) {
        const senderKey = sender.split('@')[0];
        // math
        if (games.math[senderKey] !== undefined) {
          if (String(games.math[senderKey]) === cleanBody.trim()) {
            await reply('✅ Correct!');
            delete games.math[senderKey];
          }
        }
        // tebak kata etc.
        for (const g of ['tebakkata', 'tebakkalimat', 'tebaklirik', 'caklontong', 'tebakgambar']) {
          if (games[g][senderKey] && games[g][senderKey] === cleanBody.toLowerCase()) {
            await reply('✅ Correct!');
            delete games[g][senderKey];
            if (g === 'caklontong') delete games.caklontong_desk[senderKey];
          }
        }
      }

      // ========== PRESENCE (owner) ==========
      if (cmd === 'presence') {
        if (!isOwner(sender) && !isMe) { await reply(roast('owner')); return; }
        const v = String(args[0] || '').toLowerCase();
        const pm2 = presenceMap(v);
        if (pm2) {
          config.PRESENCE = pm2;
          try { await sock.sendPresenceUpdate(pm2, from); } catch {}
          await reply(`✅ Presence → *${v}* (${pm2})`);
        } else {
          await reply(`Usage: ${prefix}presence <typing|recording|online|offline>\nCurrent: *${config.PRESENCE}*`);
        }
        return;
      }

      if (cmd === 'autotyping' || cmd === 'autorecording') {
        if (!isOwner(sender) && !isMe) { await reply(roast('owner')); return; }
        const want = cmd === 'autotyping' ? 'composing' : 'recording';
        if (args[0] === 'on') {
          config.PRESENCE = want;
          try { await sock.sendPresenceUpdate(want, from); } catch {}
          await reply(`✅ ${cmd === 'autotyping' ? 'AutoTyping' : 'AutoRecording'} ON`);
        } else if (args[0] === 'off') {
          config.PRESENCE = 'unavailable';
          try { await sock.sendPresenceUpdate('unavailable', from); } catch {}
          await reply(`❌ ${cmd === 'autotyping' ? 'AutoTyping' : 'AutoRecording'} OFF`);
        } else {
          await reply(`Usage: ${prefix}${cmd} on/off\nCurrent presence: *${config.PRESENCE}*`);
        }
        return;
      }

      // ========== OWNER COMMANDS ==========
      const ownerCmds = [
        'mode', 'prefix', 'settings', 'autoview', 'autolike', 'autoreact', 'autoread',
        'anticall', 'antidelete', 'antiedit', 'antiviewonce', 'broadcast', 'bc', 'users',
        'welcome', 'goodbye', 'setbotname', 'startmsg', 'font',
        // panel
        'panel', '1gb', '2gb', '3gb', '4gb', '5gb', 'unli', 'listsrv', 'listusr',
        'delsrv', 'delusr', 'addusr', 'addsrv', 'listadmin', 'ramlist', 'crateadmin'
      ];
      if (ownerCmds.includes(cmd) && !isOwner(sender) && !isMe) {
        await reply(roast('owner'));
        return;
      }

      if (cmd === 'mode') {
        if (['public', 'private'].includes(args[0])) {
          config.MODE = args[0];
          await reply(`✅ Mode → *${config.MODE}*`);
        } else await reply(`Current: *${config.MODE}*\nUsage: ${prefix}mode public/private`);
        return;
      }
      if (cmd === 'prefix') {
        if (!args[0]) { await reply(`Current: *${config.PREFIX}*`); return; }
        config.PREFIX = args[0].slice(0, 3);
        await reply(`✅ Prefix → *${config.PREFIX}*`);
        return;
      }
      if (cmd === 'font') {
        const v = String(args[0] || '').toLowerCase();
        const allowed = ['normal', 'sans', 'bold', 'italic', 'double', 'script', 'tiny', 'gothic', 'bubble', 'random', 'off'];
        if (!v) {
          await reply(`Font: *${config.FONT || 'random'}*\nOptions: ${allowed.join(', ')}\nUsage: ${prefix}font random`);
          return;
        }
        if (!allowed.includes(v)) {
          await reply(`Invalid. Use: ${allowed.join(', ')}`);
          return;
        }
        config.FONT = v === 'off' ? 'normal' : v;
        const sampleStyle = config.FONT === 'random' ? 'sans' : config.FONT;
        const sample = applyFont('Hello Confronter 123', sampleStyle);
        await reply(`✅ Font → *${config.FONT}*\nPreview: ${sample}`);
        return;
      }
      if (cmd === 'autoview') {
        if (args[0] === 'on') { config.AUTO_VIEW_STATUS = true; await reply('✅ AutoView ON'); }
        else if (args[0] === 'off') { config.AUTO_VIEW_STATUS = false; await reply('❌ AutoView OFF'); }
        else await reply(`AutoView: *${config.AUTO_VIEW_STATUS ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'autolike') {
        if (args[0] === 'on') { config.AUTO_LIKE_STATUS = true; await reply('✅ AutoLike ON'); }
        else if (args[0] === 'off') { config.AUTO_LIKE_STATUS = false; await reply('❌ AutoLike OFF'); }
        else await reply(`AutoLike: *${config.AUTO_LIKE_STATUS ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'autoreact') {
        if (args[0] === 'on') { config.AUTO_REACT = true; await reply('✅ AutoReact ON'); }
        else if (args[0] === 'off') { config.AUTO_REACT = false; await reply('❌ AutoReact OFF'); }
        else await reply(`AutoReact: *${config.AUTO_REACT ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'autoread') {
        if (args[0] === 'on') { config.AUTO_READ = true; await reply('✅ AutoRead (blue ticks) ON'); }
        else if (args[0] === 'off') { config.AUTO_READ = false; await reply('❌ AutoRead OFF'); }
        else await reply(`AutoRead: *${config.AUTO_READ ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'anticall') {
        if (args[0] === 'on') { config.ANTI_CALL = true; await reply('✅ AntiCall ON'); }
        else if (args[0] === 'off') { config.ANTI_CALL = false; await reply('❌ AntiCall OFF'); }
        else await reply(`AntiCall: *${config.ANTI_CALL ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'antidelete') {
        let v = (args[0] || '').toLowerCase();
        if (v === 'pm') v = 'dm';
        if (['off', 'dm', 'chat'].includes(v)) {
          config.ANTI_DELETE = v;
          await reply(`✅ AntiDelete → *${v}*`);
        } else await reply(`AntiDelete: *${config.ANTI_DELETE}*\nUsage: ${prefix}antidelete off/dm/chat`);
        return;
      }
      if (cmd === 'antiedit') {
        let v = (args[0] || '').toLowerCase();
        if (v === 'pm') v = 'dm';
        if (['off', 'dm', 'chat'].includes(v)) {
          config.ANTI_EDIT = v;
          await reply(`✅ AntiEdit → *${v}*`);
        } else await reply(`AntiEdit: *${config.ANTI_EDIT}*\nUsage: ${prefix}antiedit off/dm/chat`);
        return;
      }
      if (cmd === 'antiviewonce') {
        let v = (args[0] || '').toLowerCase();
        if (v === 'private' || v === 'pm') v = 'dm';
        if (['off', 'dm', 'chat'].includes(v)) {
          config.ANTI_VIEW_ONCE = v;
          await reply(`✅ AntiViewOnce → *${v}*`);
        } else await reply(`AntiViewOnce: *${config.ANTI_VIEW_ONCE}*\nUsage: ${prefix}antiviewonce off/dm/chat`);
        return;
      }
      if (cmd === 'welcome') {
        if (args[0] === 'on') { config.WELCOME = true; await reply('✅ Welcome ON'); }
        else if (args[0] === 'off') { config.WELCOME = false; await reply('❌ Welcome OFF'); }
        else await reply(`Welcome: *${config.WELCOME ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'goodbye') {
        if (args[0] === 'on') { config.GOODBYE = true; await reply('✅ Goodbye ON'); }
        else if (args[0] === 'off') { config.GOODBYE = false; await reply('❌ Goodbye OFF'); }
        else await reply(`Goodbye: *${config.GOODBYE ? 'ON' : 'OFF'}*`);
        return;
      }
      if (cmd === 'users') {
        await reply(`👥 Users stored: *${(await loadUsers()).length}*`);
        return;
      }
      if (cmd === 'settings') {
        const on = v => v ? '✅' : '❌';
        await reply(
          `⚙️ *SETTINGS*\n` +
          `• Prefix: ${config.PREFIX}\n` +
          `• Mode: ${config.MODE}\n` +
          `• Presence: ${config.PRESENCE}\n` +
          `• AutoView: ${on(config.AUTO_VIEW_STATUS)}\n` +
          `• AutoLike: ${on(config.AUTO_LIKE_STATUS)}\n` +
          `• AutoReact: ${on(config.AUTO_REACT)}\n` +
          `• AutoRead: ${on(config.AUTO_READ)}\n` +
          `• Font: ${config.FONT || 'sans'}\n` +
          `• AntiDelete: ${config.ANTI_DELETE}\n` +
          `• AntiEdit: ${config.ANTI_EDIT}\n` +
          `• AntiViewOnce: ${config.ANTI_VIEW_ONCE}\n` +
          `• AntiCall: ${on(config.ANTI_CALL)}\n` +
          `• Welcome: ${on(config.WELCOME)}\n` +
          `• Goodbye: ${on(config.GOODBYE)}`
        );
        return;
      }
      if (cmd === 'setbotname') {
        if (!text) { await reply(`Usage: ${prefix}setbotname Name`); return; }
        config.BOT_NAME = text;
        await reply('✅ Bot name → ' + text);
        return;
      }
      if (cmd === 'startmsg') {
        await reply(buildStartMessage());
        return;
      }

      // ========== PANEL COMMANDS (English) ==========
      // These require config.PANEL_DOMAIN + config.PANEL_APIKEY
      const domain = config.PANEL_DOMAIN || config.domain || '';
      const apikey2 = config.PANEL_APIKEY || config.apikey2 || '';
      const capikey2 = config.PANEL_CLIENT_APIKEY || config.capikey2 || '';

      if (cmd === 'ramlist') {
        await reply(`*AVAILABLE RAM PLANS*\n\n` +
          `1GB / 50% CPU\n` +
          `2GB / 70% CPU\n` +
          `3GB / 90% CPU\n` +
          `4GB / 110% CPU\n` +
          `5GB / 150% CPU\n` +
          `UNLI (Admin only)`);
        return;
      }

      if (cmd === 'panel') {
        await reply(`*PANEL HELP*\n\n` +
          `Create user + server:\n` +
          `${prefix}1gb username,number\n` +
          `${prefix}2gb username,number\n` +
          `... up to 5gb / unli\n\n` +
          `Other:\n` +
          `${prefix}listsrv\n` +
          `${prefix}listusr\n` +
          `${prefix}delsrv <id>\n` +
          `${prefix}delusr <id>`);
        return;
      }

      // Simple create panel helper
      async function createPanelUser(username, targetJid, memo, cpu, disk, nameSuffix) {
        if (!domain || !apikey2) {
          await reply('❌ Panel domain / API key not configured in config.');
          return;
        }
        const email = username + Math.floor(Math.random() * 9000 + 1000) + '@gmail.com';
        const password = username + '001';
        const name = username + nameSuffix;

        // Create user
        let f = await fetch(domain + '/api/application/users', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          },
          body: JSON.stringify({
            email,
            username,
            first_name: username,
            last_name: username,
            language: 'en',
            password
          })
        });
        let data = await f.json();
        if (data.errors) {
          await reply(JSON.stringify(data.errors[0], null, 2));
          return;
        }
        const user = data.attributes;
        await reply(`✅ User created • ID: ${user.id}`);

        // Send credentials
        const ctf = `Hi @${targetJid.split('@')[0]}\n\n` +
          `👤 *USERNAME* : ${user.username}\n` +
          `🔐 *PASSWORD* : ${password}\n` +
          `🌐 *LOGIN* : ${domain}\n\n` +
          `NOTE: Owner only sends credentials once. Save them carefully.`;
        await sock.sendMessage(targetJid, { text: ctf, mentions: [targetJid] });

        // Create server (simplified – you may need egg / location from config)
        const egg = config.PANEL_EGG || '15';
        const loc = config.PANEL_LOCATION || '1';
        let f2 = await fetch(domain + '/api/application/nests/5/eggs/' + egg, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          }
        });
        let data2 = await f2.json();
        const startup_cmd = data2?.attributes?.startup || 'npm start';

        let f3 = await fetch(domain + '/api/application/servers', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          },
          body: JSON.stringify({
            name,
            description: ' ',
            user: user.id,
            egg: parseInt(egg),
            docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
            startup: startup_cmd,
            environment: {
              INST: 'npm',
              USER_UPLOAD: '0',
              AUTO_UPDATE: '0',
              CMD_RUN: 'npm start'
            },
            limits: {
              memory: memo,
              swap: 0,
              disk: disk,
              io: 500,
              cpu: cpu
            },
            feature_limits: {
              databases: 5,
              backups: 5,
              allocations: 1
            },
            deploy: {
              locations: [parseInt(loc)],
              dedicated_ip: false,
              port_range: []
            }
          })
        });
        let res = await f3.json();
        if (res.errors) {
          await reply(JSON.stringify(res.errors[0], null, 2));
          return;
        }
        const server = res.attributes;
        await reply(
          `*SERVER CREATED SUCCESSFULLY*\n\n` +
          `ID: ${user.id}\n` +
          `NAME: ${user.first_name} ${user.last_name}\n` +
          `MEMORY: ${server.limits.memory === 0 ? 'Unlimited' : server.limits.memory} MB\n` +
          `DISK: ${server.limits.disk === 0 ? 'Unlimited' : server.limits.disk} MB\n` +
          `CPU: ${server.limits.cpu}%`
        );
      }

      if (['1gb', '2gb', '3gb', '4gb', '5gb', 'unli'].includes(cmd)) {
        const t = text.split(',');
        if (t.length < 2) {
          await reply(`*Wrong format!*\nUsage:\n${prefix + cmd} username,number`);
          return;
        }
        const username = t[0].trim();
        let u = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          || (t[1] ? dig(t[1]) + '@s.whatsapp.net' : null);
        if (!u) {
          await reply('Provide a valid number or tag a user.');
          return;
        }
        const plans = {
          '1gb': { memo: 1024, cpu: 50, disk: 1024, suffix: '1GB' },
          '2gb': { memo: 2048, cpu: 70, disk: 2048, suffix: '2GB' },
          '3gb': { memo: 3072, cpu: 90, disk: 3072, suffix: '3GB' },
          '4gb': { memo: 4096, cpu: 110, disk: 4096, suffix: '4GB' },
          '5gb': { memo: 5120, cpu: 150, disk: 5120, suffix: '5GB' },
          'unli': { memo: 0, cpu: 0, disk: 0, suffix: 'Unli' }
        };
        const plan = plans[cmd];
        await createPanelUser(username, u, plan.memo, plan.cpu, plan.disk, plan.suffix);
        return;
      }

      if (cmd === 'listsrv') {
        if (!domain || !apikey2) return reply('Panel not configured.');
        let page = args[0] || '1';
        let f = await fetch(domain + '/api/application/servers?page=' + page, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          }
        });
        let res = await f.json();
        let servers = res.data || [];
        let messageText = 'Here is the server list:\n\n';
        for (let server of servers) {
          let s = server.attributes;
          messageText += `ID: ${s.id}\nName: ${s.name}\nStatus: ${s.status || 'unknown'}\n\n`;
        }
        messageText += `Page: ${res.meta?.pagination?.current_page || 1}/${res.meta?.pagination?.total_pages || 1}\n`;
        messageText += `Total Servers: ${res.meta?.pagination?.count || servers.length}`;
        await reply(messageText);
        return;
      }

      if (cmd === 'listusr') {
        if (!domain || !apikey2) return reply('Panel not configured.');
        let page = args[0] || '1';
        let f = await fetch(domain + '/api/application/users?page=' + page, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          }
        });
        let res = await f.json();
        let users = res.data || [];
        let messageText = 'Here is the user list:\n\n';
        for (let user of users) {
          let u = user.attributes;
          messageText += `ID: ${u.id}\n${u.username}\n${u.first_name} ${u.last_name}\n\n`;
        }
        messageText += `Page: ${res.meta?.pagination?.current_page || 1}/${res.meta?.pagination?.total_pages || 1}\n`;
        messageText += `Total Users: ${res.meta?.pagination?.count || users.length}`;
        await reply(messageText);
        return;
      }

      if (cmd === 'delsrv') {
        if (!domain || !apikey2) return reply('Panel not configured.');
        let srv = args[0];
        if (!srv) return reply('Server ID required.');
        let f = await fetch(domain + '/api/application/servers/' + srv, {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          }
        });
        if (f.ok) await reply('✅ Server deleted successfully.');
        else await reply('❌ Server not found or error.');
        return;
      }

      if (cmd === 'delusr') {
        if (!domain || !apikey2) return reply('Panel not configured.');
        let usr = args[0];
        if (!usr) return reply('User ID required.');
        let f = await fetch(domain + '/api/application/users/' + usr, {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apikey2
          }
        });
        if (f.ok) await reply('✅ User deleted successfully.');
        else await reply('❌ User not found or error.');
        return;
      }

      // ========== GROUP COMMANDS ==========
      if (!isGroup(from) && ['promote', 'demote', 'kick', 'left', 'approve', 'hidetag', 'tagall', 'mute', 'unmute', 'antilink', 'grouplink', 'groupinfo', 'warn', 'tagadmins'].includes(cmd)) {
        await reply(roast('group'));
        return;
      }

      if (cmd === 'antilink') {
        if (args[0] === 'on') {
          await saveGroup(from, 'antilink', true);
          await reply('✅ Antilink ON');
        } else if (args[0] === 'off') {
          await saveGroup(from, 'antilink', false);
          await reply('❌ Antilink OFF');
        } else await reply(`Usage: ${prefix}antilink on/off`);
        return;
      }

      if (['promote', 'demote', 'kick'].includes(cmd)) {
        if (!isGroup(from)) { await reply(roast('group')); return; }
        if (!(await isBotAdmin(from))) { await reply('❌ Bot needs to be admin first.'); return; }
        if (!(await isGroupAdmin(from, sender)) && !isOwner(sender)) { await reply(roast('admin')); return; }
        const users = getTargetUsers(m, text, from, true);
        if (!users.length) {
          await reply(`Tag a user, reply to their message, or give a number.\nExample:\n${prefix}${cmd} @user\nOr reply to their message with ${prefix}${cmd}`);
          return;
        }
        const action = cmd === 'promote' ? 'promote' : cmd === 'demote' ? 'demote' : 'remove';
        try {
          await sock.groupParticipantsUpdate(from, users, action);
          const labels = users.map(u => '@' + (jidToPhone(u, m) !== 'unknown' ? jidToPhone(u, m) : String(u).split('@')[0]));
          await sock.sendMessage(from, {
            text: styleReplyText(`✅ *${cmd.toUpperCase()}*\n${labels.join(', ')} ${cmd === 'kick' ? 'removed' : cmd + 'd'}.`),
            mentions: users
          });
        } catch (e) {
          await reply(`❌ Failed to ${cmd}: ${e.message || e}`);
        }
        return;
      }

      if (['hidetag', 'tagall', 'htag'].includes(cmd)) {
        if (!(await isGroupAdmin(from, sender)) && !isOwner(sender)) { await reply(roast('admin')); return; }
        const meta = await getMeta(from);
        if (!meta) return;
        const parts = meta.participants.map(p => p.id);
        await sock.sendMessage(from, { text: text || '📢 Attention!', mentions: parts });
        return;
      }

      if (['mute', 'unmute'].includes(cmd)) {
        if (!(await isGroupAdmin(from, sender)) && !isOwner(sender)) { await reply(roast('admin')); return; }
        if (!(await isBotAdmin(from))) { await reply('Bot needs admin'); return; }
        await sock.groupSettingUpdate(from, cmd === 'mute' ? 'announcement' : 'not_announcement');
        await reply(cmd === 'mute' ? '🔇 Group muted' : '🔊 Group unmuted');
        return;
      }

      if (cmd === 'grouplink' || cmd === 'invite') {
        if (!(await isBotAdmin(from))) { await reply('Bot needs admin'); return; }
        try {
          const code = await sock.groupInviteCode(from);
          await reply(`🔗 https://chat.whatsapp.com/${code}`);
        } catch (e) {
          await reply('❌ ' + e.message);
        }
        return;
      }

      if (cmd === 'groupinfo') {
        try {
          const meta = await getMeta(from);
          const admins = (meta.participants || []).filter(p => p.admin).length;
          await reply(`👥 *${meta.subject}*\nMembers: ${meta.participants?.length || 0}\nAdmins: ${admins}`);
        } catch {
          await reply('❌ Failed');
        }
        return;
      }

      if (cmd === 'left' || cmd === 'leave') {
        if (!isOwner(sender) && !(await isGroupAdmin(from, sender))) { await reply(roast('admin')); return; }
        await reply('👋 Leaving…');
        await delay(600);
        await sock.groupLeave(from);
        return;
      }

      if (cmd === 'warn') {
        if (!isGroup(from)) { await reply(roast('group')); return; }
        if (!(await isGroupAdmin(from, sender)) && !isOwner(sender)) { await reply(roast('admin')); return; }
        const users = getTargetUsers(m, text, from, true);
        if (!users.length) { await reply(`Tag a user or reply to their message.\nExample: ${prefix}warn @user spam`); return; }
        // reason = text without numbers/mentions
        const reason = (text || 'None').replace(/@\d+/g, '').replace(/\d{6,15}/g, '').trim() || 'None';
        const label = jidToPhone(users[0], m);
        await sock.sendMessage(from, {
          text: styleReplyText(`⚠️ *WARNING*\n@${label !== 'unknown' ? label : users[0].split('@')[0]} has been warned.\nReason: ${reason}`),
          mentions: users
        });
        return;
      }

      if (cmd === 'tagadmins') {
        const meta = await getMeta(from);
        const admins = (meta?.participants || []).filter(p => p.admin).map(p => p.id);
        if (!admins.length) { await reply('No admins'); return; }
        const tags = admins.map(a => '@' + a.split('@')[0]).join(' ');
        await sock.sendMessage(from, { text: `👑 *Admins*\n${tags}`, mentions: admins });
        return;
      }

      if (cmd === 'approve') {
        if (!(await isBotAdmin(from))) { await reply('Bot needs admin'); return; }
        try {
          const pending = await sock.groupRequestParticipantsList(from);
          if (!pending?.length) { await reply('No pending requests.'); return; }
          const jids = pending.map(p => p.jid || p.id);
          await sock.groupRequestParticipantsUpdate(from, jids, 'approve');
          await reply(`✅ Approved ${jids.length} request(s)`);
        } catch (e) {
          await reply('❌ ' + e.message);
        }
        return;
      }

      if (cmd === 'broadcast' || cmd === 'bc') {
        if (!isOwner(sender) && !isDeveloper(sender)) return;
        const users = await loadUsers();
        if (!users.length) { await reply('No users stored yet.'); return; }
        if (!text) { await reply(`Usage: ${prefix}bc <text>`); return; }
        await reply(`📢 Broadcasting to ${users.length} users…`);
        let ok = 0, fail = 0;
        for (const jid of users) {
          try {
            await sock.sendMessage(jid, { text });
            ok++;
            await delay(800);
          } catch {
            fail++;
          }
        }
        await reply(`✅ Done — Success: ${ok}, Failed: ${fail}`);
        return;
      }

      if (['block', 'unblock'].includes(cmd)) {
        if (!isOwner(sender) && !isMe) { await reply(roast('owner')); return; }
        // In DM: .block alone blocks that chat user
        // In group: tag, reply, or number
        const targets = getTargetUsers(m, text, from, isGroup(from));
        if (!targets.length) {
          await reply(`Usage:\n• In DM: ${prefix}${cmd}\n• In group: ${prefix}${cmd} @user  or reply to their message\n• Or: ${prefix}${cmd} 2547xxxxxxx`);
          return;
        }
        let ok = 0, fail = 0;
        for (const jid of targets) {
          try {
            // Prefer phone jid for block API
            let blockJid = jid;
            const phone = jidToPhone(jid, m);
            if (phone && phone !== 'unknown') blockJid = phone + '@s.whatsapp.net';
            await sock.updateBlockStatus(blockJid, cmd === 'block' ? 'block' : 'unblock');
            ok++;
          } catch (e) {
            console.log(cmd + ' error:', e.message);
            fail++;
          }
        }
        if (ok) await reply(`✅ ${cmd}ed ${ok} user(s)${fail ? ` (${fail} failed)` : ''}`);
        else await reply(`❌ Could not ${cmd} user. Try with number: ${prefix}${cmd} 2547xxxxxxx`);
        return;
      }
    } catch (err) {
      console.log('Handler:', err.message);
    }
  }

  // ============ ANTI-DELETE (messages.update) ============
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      try {
        const isDel = u.update?.message === null;
        if (!isDel) continue;
        const key = u.key;
        if (!key?.id) continue;
        const cached = msgCache.get(key.id);
        if (cached?.message) forwardDelete(key, cached);
      } catch {}
    }
  });
}

startBot().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
process.on('uncaughtException', e => console.log('Uncaught:', e.message));
