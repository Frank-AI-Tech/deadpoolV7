const axios = require('axios');

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

function ready() { return Boolean(url && key); }
async function query(table, method = 'GET', body, params = '', prefer = 'return=representation') {
  if (!ready()) throw new Error('Supabase is not configured');
  const response = await axios({
    url: `${url}/rest/v1/${table}${params}`,
    method,
    data: body,
    timeout: 20000,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: prefer }
  });
  return response.data;
}
async function upsertUser(user) {
  if (!user?.jid || !ready()) return;
  return query('bot_users', 'POST', user, '?on_conflict=jid', 'resolution=merge-duplicates,return=minimal');
}
async function listUsers() { return query('bot_users', 'GET', undefined, '?select=id,jid,phone,display_name,push_name,first_seen_at,last_seen_at,last_chat_type,is_active&order=last_seen_at.desc'); }
async function createBroadcast(payload) { return query('bot_broadcasts', 'POST', payload); }
async function pendingBroadcasts() { return query('bot_broadcasts', 'GET', undefined, '?select=*&status=eq.queued&order=created_at.asc&limit=10'); }
async function updateBroadcast(id, payload) { return query('bot_broadcasts', 'PATCH', payload, `?id=eq.${encodeURIComponent(id)}`); }
module.exports = { ready, upsertUser, listUsers, createBroadcast, pendingBroadcasts, updateBroadcast };
