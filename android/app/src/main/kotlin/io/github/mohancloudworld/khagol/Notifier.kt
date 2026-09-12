// Daily reminders for festivals / saved tithis — fully offline. The web app computes the next
// ~12 months of dates (its own validated engine) and hands them over as JSON; we persist the
// plan and fire ONE daily alarm at the chosen hour, posting a notification per event that falls
// on that device-local date. Alarms are re-chained on every fire and re-armed after reboot.
// The plan refreshes every time the app is opened, so it never drifts more than the gap since
// the last launch.
package io.github.mohancloudworld.khagol

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.icu.util.Calendar
import org.json.JSONArray

object Notifier {
    private const val PREFS = "khagol"
    private const val CHANNEL = "khagol.events"
    private const val REQ_ALARM = 100

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveConfig(ctx: Context, planJson: String, hour: Int, enabled: Boolean) {
        prefs(ctx).edit()
            .putString("plan", planJson)
            .putInt("hour", hour.coerceIn(0, 23))
            .putBoolean("enabled", enabled)
            .apply()
        if (enabled) scheduleNext(ctx) else cancel(ctx)
    }

    private fun alarmIntent(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
        ctx, REQ_ALARM, Intent(ctx, NotifyReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun scheduleNext(ctx: Context) {
        if (!prefs(ctx).getBoolean("enabled", false)) return
        val hour = prefs(ctx).getInt("hour", 7)
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        // Inexact + allow-while-idle: a reminder may drift some minutes under Doze, which is
        // fine for a daily almanac and needs no exact-alarm special permission.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, alarmIntent(ctx))
    }

    fun cancel(ctx: Context) {
        (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(alarmIntent(ctx))
    }

    /** Post one notification per plan entry dated today (device-local). */
    fun notifyToday(ctx: Context) {
        val p = prefs(ctx)
        if (!p.getBoolean("enabled", false)) return
        val cal = Calendar.getInstance()
        val today = "%04d-%02d-%02d".format(
            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH),
        )
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Festivals & saved dates", NotificationManager.IMPORTANCE_DEFAULT),
        )
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        try {
            val plan = JSONArray(p.getString("plan", "[]"))
            var id = 200
            for (i in 0 until plan.length()) {
                val e = plan.getJSONObject(i)
                if (e.optString("date") != today) continue
                val n = android.app.Notification.Builder(ctx, CHANNEL)
                    .setSmallIcon(android.R.drawable.ic_menu_my_calendar)
                    .setContentTitle(e.optString("title"))
                    .setContentText(e.optString("detail", "Today · Khagol Panchang"))
                    .setContentIntent(open)
                    .setAutoCancel(true)
                    .build()
                nm.notify(id++, n)
            }
        } catch (_: Exception) { /* malformed plan — skip today */ }
    }
}

/** Daily alarm: notify today's events, then chain tomorrow's alarm. */
class NotifyReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Notifier.notifyToday(ctx)
        Notifier.scheduleNext(ctx)
    }
}

/** Re-arm the daily alarm after a reboot (alarms don't survive one). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Notifier.scheduleNext(ctx)
            Wake.scheduleNext(ctx)
        }
    }
}

// --- Wake alarms: exact, daily-CHANGING times (sunrise / brahma muhurta) ----------------------
// The web app pushes ~45 days of ring instants ("YYYY-MM-DDTHH:MM" wall clock + title). One
// exact alarm (setAlarmClock: doze-proof, ⏰ status icon) is chained to the next entry; firing
// posts an alarm-sound notification with a Snooze action, then chains the following entry.
object Wake {
    private const val CHANNEL = "khagol.wake"
    private const val REQ_WAKE = 110
    private const val REQ_SNOOZE = 111
    const val SNOOZE_MIN = 10

    private fun pending(ctx: Context, req: Int, intent: Intent): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, req, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun saveConfig(ctx: Context, planJson: String, enabled: Boolean) {
        Notifier.prefs(ctx).edit()
            .putString("wakePlan", planJson)
            .putBoolean("wakeEnabled", enabled)
            .apply()
        if (enabled) scheduleNext(ctx) else cancel(ctx)
    }

    /** Parse "YYYY-MM-DDTHH:MM" as a device-local instant (ms), or null. */
    private fun parseLocal(s: String): Long? = try {
        val cal = Calendar.getInstance()
        cal.set(
            s.substring(0, 4).toInt(), s.substring(5, 7).toInt() - 1, s.substring(8, 10).toInt(),
            s.substring(11, 13).toInt(), s.substring(14, 16).toInt(), 0,
        )
        cal.set(Calendar.MILLISECOND, 0)
        cal.timeInMillis
    } catch (_: Exception) { null }

    /** Arm the next upcoming entry (if any) with an exact user-visible alarm. */
    fun scheduleNext(ctx: Context) {
        val p = Notifier.prefs(ctx)
        if (!p.getBoolean("wakeEnabled", false)) return
        val now = System.currentTimeMillis()
        var bestAt = Long.MAX_VALUE
        var bestTitle: String? = null
        try {
            val plan = JSONArray(p.getString("wakePlan", "[]"))
            for (i in 0 until plan.length()) {
                val e = plan.getJSONObject(i)
                val t = parseLocal(e.optString("at")) ?: continue
                if (t > now + 30_000 && t < bestAt) { bestAt = t; bestTitle = e.optString("title") }
            }
        } catch (_: Exception) { return }
        val title = bestTitle ?: return
        val fire = Intent(ctx, WakeReceiver::class.java).putExtra("title", title)
        val show = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setAlarmClock(AlarmManager.AlarmClockInfo(bestAt, show), pending(ctx, REQ_WAKE, fire))
    }

    fun cancel(ctx: Context) {
        (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager)
            .cancel(pending(ctx, REQ_WAKE, Intent(ctx, WakeReceiver::class.java)))
    }

    /** Alarm-style notification (alarm sound + vibration) with a Snooze action. */
    fun ring(ctx: Context, title: String) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val ch = NotificationChannel(CHANNEL, "Wake alarms", NotificationManager.IMPORTANCE_HIGH)
        ch.setSound(
            android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM),
            android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_ALARM).build(),
        )
        ch.enableVibration(true)
        nm.createNotificationChannel(ch)
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val snooze = pending(
            ctx, REQ_SNOOZE,
            Intent(ctx, SnoozeReceiver::class.java).putExtra("title", title),
        )
        val n = android.app.Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText("Khagol wake alarm")
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(android.app.Notification.CATEGORY_ALARM)
            .addAction(
                android.app.Notification.Action.Builder(
                    null, "Snooze $SNOOZE_MIN min", snooze,
                ).build(),
            )
            .build()
        nm.notify(300, n)
    }
}

/** Exact wake alarm fired: ring, then chain the next entry from the plan. */
class WakeReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Wake.ring(ctx, intent.getStringExtra("title") ?: "Khagol")
        Wake.scheduleNext(ctx)
    }
}

/** Snooze: re-ring the same title in SNOOZE_MIN minutes (exact, one-shot). */
class SnoozeReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "Khagol"
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(300)
        val fire = Intent(ctx, WakeReceiver::class.java).putExtra("title", title)
        val pi = PendingIntent.getBroadcast(
            ctx, 112, fire, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val show = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.setAlarmClock(
            AlarmManager.AlarmClockInfo(
                System.currentTimeMillis() + Wake.SNOOZE_MIN * 60_000L, show,
            ), pi,
        )
    }
}
