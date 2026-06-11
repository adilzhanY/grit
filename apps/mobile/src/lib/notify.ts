/**
 * Pomodoro notifications via expo-notifications.
 *
 *  - An ongoing (sticky, silent) notification shows the live countdown while a
 *    phase runs — like TickTick's "Pomo Focus · 59:54".
 *  - A high-priority alarm notification is scheduled at the phase end so it
 *    still fires (with sound) when the app is backgrounded or closed.
 *
 * Everything is wrapped in try/catch and feature-flagged: on a platform or
 * build where notifications aren't available it simply no-ops.
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";

const ONGOING_ID = "focus-ongoing";
const ALARM_ID = "focus-alarm";
const TIMER_CHANNEL = "focus-timer";
const ALARM_CHANNEL = "focus-alarm";

// expo-notifications isn't supported in Expo Go (SDK 53+). Skip every call
// there — the in-app alarm overlay + chime still work; the tray notification
// and background alarm come alive in a dev build / APK.
const AVAILABLE = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let configured = false;

/** Wire the handler, channels and permissions. Safe to call repeatedly. */
export async function configureNotifications(): Promise<void> {
  if (configured || !AVAILABLE) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const alarm = n.request.content.data?.type === "alarm";
        return {
          // Alarm gets a heads-up banner + sound; the ongoing countdown just
          // sits in the tray, updating silently.
          shouldShowBanner: alarm,
          shouldShowList: true,
          shouldPlaySound: alarm,
          shouldSetBadge: false,
        };
      },
    });

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(TIMER_CHANNEL, {
        name: "Focus timer",
        importance: Notifications.AndroidImportance.LOW,
        sound: undefined,
        vibrationPattern: undefined,
        showBadge: false,
      });
      await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
        name: "Focus alarm",
        importance: Notifications.AndroidImportance.MAX,
        sound: "default",
        vibrationPattern: [0, 400, 250, 400],
        bypassDnd: false,
      });
    }

    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted && perms.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Notifications are a nice-to-have; never break the app over them.
  }
}

/** Present / update the silent ongoing countdown notification. */
export async function showOngoing(title: string, body: string): Promise<void> {
  if (!AVAILABLE) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ONGOING_ID,
      content: {
        title,
        body,
        sticky: true,
        autoDismiss: false,
        data: { type: "ongoing" },
        ...(Platform.OS === "android" ? { channelId: TIMER_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch {
    /* no-op */
  }
}

export async function clearOngoing(): Promise<void> {
  if (!AVAILABLE) return;
  try {
    await Notifications.dismissNotificationAsync(ONGOING_ID);
    await Notifications.cancelScheduledNotificationAsync(ONGOING_ID);
  } catch {
    /* no-op */
  }
}

/** Schedule the end-of-phase alarm (fires even if the app is closed). */
export async function scheduleAlarm(
  when: number,
  title: string,
  body: string,
): Promise<void> {
  if (!AVAILABLE) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ALARM_ID);
    const secs = Math.max(1, Math.round((when - Date.now()) / 1000));
    await Notifications.scheduleNotificationAsync({
      identifier: ALARM_ID,
      content: {
        title,
        body,
        sound: "default",
        data: { type: "alarm" },
        ...(Platform.OS === "android" ? { channelId: ALARM_CHANNEL } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secs,
      },
    });
  } catch {
    /* no-op */
  }
}

export async function cancelAlarm(): Promise<void> {
  if (!AVAILABLE) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(ALARM_ID);
    await Notifications.dismissNotificationAsync(ALARM_ID);
  } catch {
    /* no-op */
  }
}
