// apis.js — song search for pair-site music player (Audius)
const axios = require('axios');
const e = s => encodeURIComponent(String(s || ''));

async function searchSong(query) {
  try {
    const h = await axios.get('https://api.audius.co', { timeout: 15000, validateStatus: () => true });
    const host = h.data?.data?.[0] || 'https://discoveryprovider.audius.co';
    const r = await axios.get(`${host}/v1/tracks/search?query=${e(query)}&app_name=deadpoolv7`, { timeout: 30000, validateStatus: () => true });
    const t = r.data?.data?.[0];
    if (!t) return null;
    return {
      title: t.title,
      artist: t.user?.name || '',
      streamUrl: `${host}/v1/tracks/${t.id}/stream?app_name=deadpoolv7`
    };
  } catch { return null; }
}

module.exports = { searchSong };
