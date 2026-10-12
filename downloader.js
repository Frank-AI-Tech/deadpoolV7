// downloader.js — YouTube search + mp3/mp4 (multi-source fallbacks)
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';
const e = s => encodeURIComponent(String(s || ''));

async function get(url, opts = {}) {
  return axios.get(url, {
    timeout: opts.timeout || 60000,
    validateStatus: () => true,
    responseType: opts.responseType || 'json',
    headers: { 'User-Agent': UA, Accept: '*/*', ...(opts.headers || {}) },
    ...(opts.extra || {})
  });
}
async function fetchBuffer(url, t = 120000) {
  const r = await get(url, { responseType: 'arraybuffer', timeout: t, headers: { Referer: 'https://www.youtube.com/', Origin: 'https://www.youtube.com/' }, extra: { maxContentLength: 150 * 1024 * 1024 } });
  if (r.status >= 400) throw new Error('HTTP ' + r.status);
  return Buffer.from(r.data);
}

function sniffUrl(obj, keys = ['dl', 'download', 'url', 'link', 'result', 'data', 'audio', 'video', 'mp3', 'mp4', 'medialink']) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj.startsWith('http') ? obj : null;
  if (Array.isArray(obj)) { for (const i of obj) { const u = sniffUrl(i, keys); if (u) return u; } return null; }
  if (typeof obj === 'object') {
    for (const k of keys) if (typeof obj[k] === 'string' && obj[k].startsWith('http')) return obj[k];
    for (const v of Object.values(obj)) { const u = sniffUrl(v, keys); if (u) return u; }
  }
  return null;
}

const isYtUrl = q => /(?:youtube\.com\/(?:watch|shorts|embed)|youtu\.be\/)/i.test(q);

// ============ SEARCH ============
async function ytSearch(query) {
  // Use the installed youtube-sr package first; yt-search is not guaranteed to be installed.
  try {
    const YouTube = require('youtube-sr').default || require('youtube-sr');
    const results = await YouTube.search(String(query), { type: 'video', limit: 1 });
    const v = results?.[0];
    if (v?.url) return { url: v.url, title: v.title || query };
  } catch {}
  // 1) siputzx
  try {
    const r = await get(`https://api.siputzx.my.id/api/yt/search?q=${e(query)}`);
    const items = r.data?.result || r.data?.data;
    if (Array.isArray(items) && items.length) {
      const v = items.find(x => (x.url || x.link || '').includes('youtube') || (x.id || x.videoId)) || items[0];
      const url = v.url || v.link || (v.id || v.videoId ? `https://www.youtube.com/watch?v=${v.id || v.videoId}` : null);
      if (url) return { url, title: v.title || query };
    }
  } catch {}
  // 2) yanzbotz
  try {
    const r = await get(`https://api.yanzbotz.my.id/api/search/ytsearch?q=${e(query)}`);
    const items = r.data?.result || r.data?.data;
    const list = Array.isArray(items) ? items : items?.result || items?.data;
    if (Array.isArray(list) && list.length) {
      const v = list[0];
      const url = v.url || v.link || (v.id || v.videoId ? `https://www.youtube.com/watch?v=${v.id || v.videoId}` : null);
      if (url) return { url, title: v.title || query };
    }
  } catch {}
  return null;
}

// ============ DOWNLOAD (resolve direct media URL) ============
async function ytResolve(videoUrl, audio) {
  // ytdl-core can resolve current YouTube formats without relying on unstable public APIs.
  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(videoUrl, { requestOptions: { headers: { 'User-Agent': UA } } });
    const format = audio
      ? ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
      : (ytdl.chooseFormat(info.formats, { quality: '18' }) || ytdl.chooseFormat(info.formats, { quality: 'highestvideo' }));
    if (format?.url) return format.url;
  } catch {}
  const eps = audio
    ? [
        `https://api.siputzx.my.id/api/d/ytmp3?url=${e(videoUrl)}`,
        `https://api.siputzx.my.id/api/d/ytmp3v2?url=${e(videoUrl)}`,
        `https://api.yanzbotz.my.id/api/download/ytmp3?url=${e(videoUrl)}`
      ]
    : [
        `https://api.siputzx.my.id/api/d/ytmp4?url=${e(videoUrl)}`,
        `https://api.yanzbotz.my.id/api/download/ytmp4?url=${e(videoUrl)}`
      ];
  for (const ep of eps) {
    try {
      const r = await get(ep, { timeout: 60000 });
      const u = sniffUrl(r.data);
      if (u) return u;
    } catch {}
  }
  return null;
}

// ============ MAIN ENTRY ============
async function downloadYouTube(query, isAudio) {
  try {
    query = String(query || '').trim();
    if (!query) return null;
    let videoUrl = null, title = query;
    if (isYtUrl(query)) {
      videoUrl = query;
    } else {
      const s = await ytSearch(query);
      if (!s?.url) return null;
      videoUrl = s.url;
      title = s.title;
    }
    const mediaUrl = await ytResolve(videoUrl, isAudio);
    if (!mediaUrl) return null;
    const buffer = await fetchBuffer(mediaUrl);
    if (!buffer || buffer.length < 10000) return null;
    return { buffer, title, url: videoUrl, mediaUrl };
  } catch { return null; }
}

// ============ SENDERS (size-aware) ============
async function sendAsMp3(sock, from, data) {
  try {
    const { buffer, title } = data;
    const name = String(title || 'audio').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'audio';
    if (buffer.length > 15 * 1024 * 1024) {
      await sock.sendMessage(from, { document: buffer, mimetype: 'audio/mpeg', fileName: name + '.mp3' });
    } else {
      await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mpeg', ptt: false });
      await sock.sendMessage(from, { text: `🎵 *${name}*` }).catch(() => {});
    }
    return true;
  } catch (e) { console.log('sendAsMp3:', e.message); return false; }
}

async function sendAsVideo(sock, from, data) {
  try {
    const { buffer, title } = data;
    const name = String(title || 'video').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'video';
    if (buffer.length > 15 * 1024 * 1024) {
      await sock.sendMessage(from, { document: buffer, mimetype: 'video/mp4', fileName: name + '.mp4' });
    } else {
      await sock.sendMessage(from, { video: buffer, mimetype: 'video/mp4', caption: `🎬 *${name}*` });
    }
    return true;
  } catch (e) { console.log('sendAsVideo:', e.message); return false; }
}

module.exports = { downloadYouTube, sendAsMp3, sendAsVideo };
