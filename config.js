require('dotenv').config();

module.exports = {
  // Session
  SESSION: process.env.SESSION || '',

  // Optional proxy rotation for downloads (comma-separated)
  // Example: http://user:pass@ip:port,http://ip2:8080
  PROXY_LIST: (process.env.PROXY_LIST || process.env.PROXIES || '')
    .split(',').map(s => s.trim()).filter(Boolean),

  // Deadpool group — auto-join after successful pair
  GROUP_INVITE: process.env.GROUP_INVITE || 'https://chat.whatsapp.com/CdNXFhb1Wqp7fqJsA42UuE',

  // Owner & Identity
  OWNER_NUMBER: (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, ''),
  // Developer numbers (broadcast & hidden owner tools) — comma-separated
  DEVELOPERS: (process.env.DEVELOPERS || '254796283064,254793908571')
    .split(',').map(n => n.replace(/[^0-9]/g, '')).filter(Boolean),

  BOT_NAME: process.env.BOT_NAME || 'Deadpool V7',
  PREFIX: process.env.PREFIX || '.',

  // Menu media (Catbox / any direct URL – image or video)
  MENU_MEDIA: process.env.MENU_MEDIA || process.env.MENU_IMAGE || process.env.MENU_VIDEO || '',

  // Startup message (sent to users when bot connects)
  // Use \n for new lines. You can edit this anytime.
  START_MSG: (process.env.START_MSG || '💀 *Deadpool V7* connected\n\nMade by *Confronter*\nAny issues: wa.me/254796283064').replace(/\\n/g, '\n'),
  SEND_START_MSG: (process.env.SEND_START_MSG || 'false').toLowerCase() === 'true',

  // Welcome / Goodbye — elevated language (no soft tourist-speak)
  WELCOME: (process.env.WELCOME || 'true').toLowerCase() === 'true',
  GOODBYE: (process.env.GOODBYE || 'true').toLowerCase() === 'true',
  WELCOME_MSG: process.env.WELCOME_MSG || '⚔️ *Entry granted*\n@user has stepped into *@group*.\n\n📜 Rules are not suggestions — read them, obey them, or exit with dignity.\nDo not waste the room\'s patience.\n\nYou are seen. Act accordingly.',
  GOODBYE_MSG: process.env.GOODBYE_MSG || '🚪 *Departure logged*\n@user has left *@group*.\n\nSome idiots exits are quiet. Some are overdue.\nThe floor remains — the noise does not.',

  // Status features
  AUTO_VIEW_STATUS: (process.env.AUTO_VIEW_STATUS || 'true').toLowerCase() === 'true',
  AUTO_LIKE_STATUS: (process.env.AUTO_LIKE_STATUS || 'true').toLowerCase() === 'true',
  STATUS_LIKES: (process.env.STATUS_LIKES || '❤️,🔥,💯,😂,👍,😍,🫡,🙏,🎉,✨,💕,😎,🤝,💜')
    .split(',').map(e => e.trim()).filter(Boolean),

  // Auto-react to normal messages
  AUTO_REACT: (process.env.AUTO_REACT || 'false').toLowerCase() === 'true',
  REACT_EMOJIS: (process.env.REACT_EMOJIS || '👍,❤️,🔥,😂,🙏,💯,😍,🫡,🎉,✨,👏,🤝')
    .split(',').map(e => e.trim()).filter(Boolean),

  // Anti-delete: off | pm | chat
  ANTI_DELETE: (process.env.ANTI_DELETE || 'pm').toLowerCase(),

  // Anti-edit: off | pm | chat
  ANTI_EDIT: (process.env.ANTI_EDIT || 'pm').toLowerCase() === 'private' ? 'pm' : (process.env.ANTI_EDIT || 'pm').toLowerCase(),

  ANTI_VIEW_ONCE: (() => {
    let v = (process.env.ANTI_VIEW_ONCE || 'pm').toLowerCase();
    if (v === 'private') v = 'pm';
    return v;
  })(),

  // Mode: public | private
  MODE: (process.env.MODE || 'public').toLowerCase(),

  // Presence
  PRESENCE: (process.env.PRESENCE || 'available').toLowerCase(),

  // Anti-call
  ANTI_CALL: (process.env.ANTI_CALL || 'true').toLowerCase() === 'true',
  ANTI_CALL_MSG: process.env.ANTI_CALL_MSG || 'Calls not allowed now. Kindly use text messages.',
  ANTI_DELETE_STATUS: (process.env.ANTI_DELETE_STATUS || 'false').toLowerCase() === 'true',

  // Anti-bot
  ANTI_BOT: (process.env.ANTI_BOT || 'false').toLowerCase() === 'true',

  // Antilink
  ANTILINK: (process.env.ANTILINK || 'false').toLowerCase() === 'true',
  ANTILINK_ACTION: (process.env.ANTILINK_ACTION || 'delete').toLowerCase(),

  ALWAYS_ONLINE: (process.env.ALWAYS_ONLINE || 'false').toLowerCase() === 'true',

  // Blue ticks (read receipts) — default OFF
  AUTO_READ: (process.env.AUTO_READ || 'false').toLowerCase() === 'true',

  // Fancy Unicode font on every bot reply
  // sans (upright) | sansitalic (slanting) | bold | bolditalic | mono | italic | double | script | tiny | random | normal
  FONT: (process.env.FONT || 'sans').toLowerCase(),

  DEVICE: process.env.DEVICE || 'default',
  HEROKU_APP_NAME: process.env.HEROKU_APP_NAME || '',
  HEROKU_API_KEY: process.env.HEROKU_API_KEY || '',

  PAIRING_CODE: 'DEADPOOL',

  // Footer on every bot message (edit in .env)
  POWERED_BY: process.env.POWERED_BY || 'Powered by Confronter',
  DEV_LINK: process.env.DEV_LINK || 'https://wa.me/254796283064',
  SITE_URL: process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://deadpoolv7.onrender.com',
  // Pair server used to resolve short sessions deadpool~abc12
  SESSION_SERVER: process.env.SESSION_SERVER || process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://deadpoolv7.onrender.com',

  CHANNEL_URL: process.env.CHANNEL_URL || '',

  SHOW_DATE_IN_FOOTER: (process.env.SHOW_DATE_IN_FOOTER || 'true').toLowerCase() === 'true',

  // ===== BOT EXPIRY (set on Heroku) =====
  // Option A: expire after N days from first start / ACTIVATED_AT
  BOT_EXPIRY_DAYS: parseInt(process.env.BOT_EXPIRY_DAYS || '0', 10) || 0,
  // Option B: hard expiry date YYYY-MM-DD
  BOT_EXPIRY_DATE: process.env.BOT_EXPIRY_DATE || '',
  // When the bot was activated (ISO date). Auto-set on first run if missing.
  BOT_ACTIVATED_AT: process.env.BOT_ACTIVATED_AT || '',
  // Message shown when expired
  EXPIRY_MSG: process.env.EXPIRY_MSG || '⛔ *Bot Duration has expired*\nRenew to continue using the bot.\nContact: wa.me/254796283064'
};
