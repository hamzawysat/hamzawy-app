import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '../services/api';
import { COLORS } from '../theme/colors';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export function usePushNotifications(session, onNotificationResponse) {
  const pushTokenRef = useRef(null);
  const responseHandlerRef = useRef(onNotificationResponse);
  useEffect(() => { responseHandlerRef.current = onNotificationResponse; }, [onNotificationResponse]);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let lastResponseIdentifier = '';
    const handleResponse = response => {
      if (!response || cancelled) return;
      const identifier = response.notification?.request?.identifier || '';
      if (identifier && identifier === lastResponseIdentifier) return;
      lastResponseIdentifier = identifier;
      responseHandlerRef.current?.(response);
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    };
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    let projectIdForRefresh = '';
    void Notifications.getLastNotificationResponseAsync?.().then(handleResponse).catch(() => {});
    async function registerPushToken() {
      if (!session || !['client', 'fanni'].includes(session.role) || !Device.isDevice) return;
      try {
        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== 'granted') return;
        const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
        projectIdForRefresh = projectId || '';
        if (!projectId) {
          console.warn('Expo push registration skipped: missing projectId');
          return;
        }
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'إشعارات صُنّاع',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: COLORS.teal500,
          });
        }
        const result = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled || !result?.data) return;
        const previousToken = pushTokenRef.current;
        if (previousToken && previousToken !== result.data) {
          await api('/notifications/' + session.role + '/push-token', { method: 'DELETE', token: session.token, body: { token: previousToken } }).catch(() => {});
        }
        pushTokenRef.current = result.data;
        await api('/notifications/' + session.role + '/push-token', {
          method: 'POST',
          token: session.token,
          body: { token: result.data, platform: Platform.OS }
        });
      } catch (error) {
        console.warn('Expo push registration failed:', error?.message || error);
      }
    }
    void registerPushToken();
    const tokenRefreshSubscription = Notifications.addPushTokenListener(() => {
      if (!cancelled && projectIdForRefresh) void registerPushToken();
    });
    return () => {
      cancelled = true;
      responseSubscription.remove();
      tokenRefreshSubscription.remove();
      // Do not unregister the device token from effect cleanup.
      // This effect also restarts when the session object is refreshed (for
      // example after a profile edit). Unregistering here races the next
      // registration and can silently disable push notifications for that user.
      // Explicit logout owns token removal in AppScreens.performLogout().

    };
  }, [session]);
  return pushTokenRef;
}
