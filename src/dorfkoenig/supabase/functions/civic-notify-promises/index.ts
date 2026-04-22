/**
 * @module civic-notify-promises
 * Send digest emails for promises with approaching due dates.
 * Triggered daily at 08:00 UTC by pg_cron via pg_net.
 * Notifies when due_date = today + 7 (upcoming warning) or due_date = today (due today).
 * Auth: service role (pg_cron trigger).
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { createServiceClient } from '../_shared/supabase-client.ts';
import { resend } from '../_shared/resend.ts';

const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const supabase = createServiceClient();

  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().slice(0, 10);

    // Find promises due today or in 7 days, excluding already notified or fulfilled
    const { data: duePromises, error } = await supabase
      .from('promises')
      .select('*, scouts!inner(name)')
      .in('due_date', [todayStr, in7DaysStr])
      .not('status', 'in', '("notified","fulfilled")')
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Query due promises error:', error);
      return errorResponse('Datenbankfehler', 500);
    }

    if (!duePromises || duePromises.length === 0) {
      console.log('[civic-notify-promises] No promises due today or in 7 days');
      return jsonResponse({ data: { notifications_sent: 0 } });
    }

    // Group by user_id + scout_id
    const groups = new Map<string, {
      userId: string;
      scoutName: string;
      promises: typeof duePromises;
    }>();

    for (const promise of duePromises) {
      const key = `${promise.user_id}:${promise.scout_id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          userId: promise.user_id,
          scoutName: promise.scouts?.name || 'Gemeinderat',
          promises: [],
        });
      }
      groups.get(key)!.promises.push(promise);
    }

    // Send digest email per group
    let notificationsSent = 0;

    if (ADMIN_EMAILS.length === 0) {
      console.warn('[civic-notify-promises] ADMIN_EMAILS not configured, skipping sends');
      return jsonResponse({ data: { notifications_sent: 0, promises_processed: duePromises.length } });
    }

    for (const [, group] of groups) {
      const emailHtml = resend.buildCivicPromiseDigestEmail({
        scoutName: group.scoutName,
        promises: group.promises.map((p) => ({
          promise_text: p.promise_text,
          due_date: p.due_date,
          source_url: p.source_url,
        })),
      });

      const result = await resend.sendEmail({
        to: ADMIN_EMAILS,
        subject: `Versprechen-Erinnerung: ${group.scoutName}`,
        html: emailHtml,
      });

      if (result.success) {
        notificationsSent++;

        // Mark promises as notified
        const promiseIds = group.promises.map((p) => p.id);
        await supabase
          .from('promises')
          .update({ status: 'notified' })
          .in('id', promiseIds);
      }
    }

    console.log(`[civic-notify-promises] Sent ${notificationsSent} notification(s) for ${duePromises.length} promise(s)`);

    return jsonResponse({
      data: {
        notifications_sent: notificationsSent,
        promises_processed: duePromises.length,
      },
    });
  } catch (error) {
    console.error('civic-notify-promises error:', error);
    return errorResponse(error.message, 500);
  }
});
