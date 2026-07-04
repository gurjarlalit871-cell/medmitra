// /api/send-push.js — Vercel-style serverless function.
// Sends a real background push notification via the Web Push protocol (free —
// no Twilio/WhatsApp Business API needed). Called from index.html whenever an
// order is created / accepted / picked up / delivered, so shops, riders and
// customers get notified instantly even if the app/browser is closed.
//
// SETUP (one-time):
//   1. npm install web-push @supabase/supabase-js
//   2. Generate VAPID keys locally:  npx web-push generate-vapid-keys
//   3. Add these env vars in your hosting dashboard (Vercel/Netlify/etc):
//        VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. "mailto:you@example.com")
//        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service role, NOT anon key —
//        needed to read the push_subscriptions table server-side)
//   4. Put the same VAPID_PUBLIC_KEY value into index.html's VAPID_PUBLIC_KEY
//      constant (search for "REPLACE_WITH_VAPID_PUBLIC_KEY").
//   5. Run the SQL in push_subscriptions.sql against your Supabase project.

const webPush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:support@medmitra.example',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { role, userId, title, body, url, tag } = req.body || {};
    if (!role || !userId || !title) {
      return res.status(400).json({ error: 'role, userId, title required' });
    }

    // role can be a single role ("shop") or an array ("all riders" use role: 'rider', userId: 'all')
    let query = supabase.from('push_subscriptions').select('*').eq('role', role);
    if (userId !== 'all') query = query.eq('user_id', userId);
    const { data: subs, error } = await query;
    if (error) throw error;
    if (!subs?.length) return res.status(200).json({ sent: 0, note: 'no subscriptions found' });

    const payload = JSON.stringify({ title, body, url: url || '/', tag: tag || 'medmitra-order' });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webPush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
      )
    );

    // Clean up subscriptions that are no longer valid (expired/unsubscribed)
    const deadIds = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected' && (r.reason?.statusCode === 404 || r.reason?.statusCode === 410)) {
        deadIds.push(subs[i].id);
      }
    });
    if (deadIds.length) await supabase.from('push_subscriptions').delete().in('id', deadIds);

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return res.status(200).json({ sent, total: subs.length });
  } catch (e) {
    console.error('send-push error:', e);
    return res.status(500).json({ error: e.message || 'send-push failed' });
  }
};
