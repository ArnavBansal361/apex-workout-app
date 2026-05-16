import type { WeekSummary } from './weekSummary'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function showRestTimerCompleteNotification(): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    new Notification('Rest complete', {
      body: 'Time for your next set.',
      tag: 'apex-rest-done',
    })
  } catch {
    /* ignore */
  }
}

export function showWeeklySummaryNotification(summary: WeekSummary): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const groups = summary.muscleGroups.length ? summary.muscleGroups.join(', ') : 'None'
  const body = `${summary.totalSets} sets · ${summary.totalVolumeLbs.toLocaleString()} lb volume · ${groups} · ${summary.prCount} PRs`
  try {
    new Notification('Your week in review', {
      body,
      tag: `apex-weekly-${summary.weekLabel}`,
    })
  } catch {
    /* ignore */
  }
}
