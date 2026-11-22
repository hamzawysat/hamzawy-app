import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import {
  View, Text, Image, FlatList, TouchableOpacity, ActivityIndicator, ScrollView,
  TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, BackHandler, Linking, Modal
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api, uploadRegistrationIdentity } from '../services/api';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/styles';
import { getOrderChatTimeline, toList, dateLabel, getServiceEmoji } from '../utils/app-helpers';
import { isReservedAreaLabel } from '../utils/area-helpers';
import AreaPicker from '../components/AreaPicker';
import { Button, Field } from '../components/FormControls';
import VoiceRecorder from '../components/VoiceRecorder';
import VoicePlayback from '../components/VoicePlayback';
import { LoginScreen, ChangePasswordScreen, PasswordRecoveryScreen } from './auth/AuthScreens';
import { AccountScreen, ProfileEditScreen } from './account/AccountScreens';
import { SupportScreen } from './support/SupportScreen';
import { ClientDashboard } from './client/ClientDashboard';
import { TechnicianDashboard } from './technician/TechnicianDashboard';
import { useAppState } from '../hooks/useAppState';
import { useScreenNavigation } from '../hooks/useScreenNavigation';
import { usePushNotifications } from '../hooks/usePushNotifications';

function normalizePhoneDigits(value) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(value || '').replace(/[٠-٩۰-۹]/g, digit => {
    const index = arabic.indexOf(digit);
    return String(index >= 0 ? index : persian.indexOf(digit));
  }).replace(/\D/g, '');
}

function AppScreens({ onScreenChange, onAuthRestoringChange }) {
  const { screen, setScreenState, screenHistoryRef, screenRef, setScreen } = useScreenNavigation();
  const appState = useAppState();
  const [identityCardUploads, setIdentityCardUploads] = useState({
    front: { fileId: '', previewUri: '', uploading: false, status: '' },
    back: { fileId: '', previewUri: '', uploading: false, status: '' },
    profile: { fileId: '', previewUri: '', uploading: false, status: '' }
  });
  const [identityPreviewUri, setIdentityPreviewUri] = useState('');
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  async function pickTechnicianIdentityImage(side, source) {
    if (!['front', 'back', 'profile'].includes(side) || identityCardUploads[side]?.uploading || loginLoading) return;
    if (side === 'profile' && source !== 'camera') {
      Alert.alert('الصورة الشخصية', 'لازم تلتقط صورتك الشخصية بالكاميرا مباشرة.');
      return;
    }
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('إذن مطلوب', source === 'camera'
          ? 'اسمح باستخدام الكاميرا لتصوير البطاقة.'
          : 'اسمح بالوصول إلى الصور لاختيار صورة البطاقة.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const asset = result.assets[0];
      const extension = String(asset.fileName || asset.uri).split('?')[0].split('.').pop().toLowerCase();
      const inferredMime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[extension] || '';
      const originalMime = asset.mimeType || inferredMime;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(originalMime)) {
        Alert.alert('نوع صورة غير مدعوم', 'الصيغ المقبولة هي JPG وPNG وWebP فقط.');
        return;
      }
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      const originalSize = Number(asset.fileSize || fileInfo.size || 0);
      if (originalSize > 15 * 1024 * 1024) {
        Alert.alert('حجم الصورة كبير', 'الحد الأقصى 15 ميجابايت لكل صورة. اختار صورة أصغر.');
        return;
      }

      setIdentityCardUploads(current => ({
        ...current,
        [side]: { fileId: '', previewUri: asset.uri, uploading: true, status: 'جاري تجهيز الصورة...' }
      }));

      let uploadUri = asset.uri;
      let uploadMime = originalMime;
      const width = Number(asset.width || 0);
      const height = Number(asset.height || 0);
      const largestDimension = Math.max(width, height);
      if (largestDimension > 1920 || originalSize > 1200 * 1024) {
        const scale = largestDimension > 0 ? Math.min(1, 1920 / largestDimension) : 1;
        const resize = width >= height
          ? { width: Math.max(1, Math.round(width * scale)) }
          : { height: Math.max(1, Math.round(height * scale)) };
        const optimized = await ImageManipulator.manipulateAsync(
          asset.uri,
          scale < 1 ? [{ resize }] : [],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
        );
        uploadUri = optimized.uri;
        uploadMime = 'image/jpeg';
        setIdentityCardUploads(current => ({
          ...current,
          [side]: { ...current[side], previewUri: optimized.uri, status: 'تم تجهيز الصورة، جاري رفعها...' }
        }));
      } else {
        setIdentityCardUploads(current => ({
          ...current,
          [side]: { ...current[side], status: 'جاري رفع الصورة...' }
        }));
      }

      const uploaded = await uploadRegistrationIdentity(side, uploadUri, uploadMime);
      setIdentityCardUploads(current => ({
        ...current,
        [side]: { fileId: uploaded.fileId, previewUri: uploadUri, uploading: false, status: 'تم رفع الصورة بنجاح ✓' }
      }));
      Alert.alert('تم رفع الصورة', side === 'front' ? 'تم رفع صورة الوجه الأمامي بنجاح.' : side === 'back' ? 'تم رفع صورة الوجه الخلفي بنجاح.' : 'تم رفع صورتك الشخصية بنجاح.');
    } catch (error) {
      const message = error?.message || 'تعذر رفع الصورة. تحقق من الاتصال وحاول مرة أخرى.';
      setIdentityCardUploads(current => ({
        ...current,
        [side]: { ...current[side], fileId: '', uploading: false, status: message }
      }));
      Alert.alert('تعذر رفع صورة البطاقة', message);
    }
  }

  function clearTechnicianIdentityImage(side) {
    setIdentityCardUploads(current => ({
      ...current,
      [side]: { fileId: '', previewUri: '', uploading: false, status: 'تم إزالة الصورة. اختار صورة بديلة.' }
    }));
  }
  const { categories, setCategories, areas, setAreas, areaTechnicianCounts, setAreaTechnicianCounts, selected, setSelected, servicesLoading, setServicesLoading, servicesError, setServicesError, reloadKey, setReloadKey, session, setSession, authRestoring, setAuthRestoring, username, setUsername, password, setPassword, loginLoading, setLoginLoading, authMode, setAuthMode, form, setForm, clientData, setClientData, techData, setTechData, walletTransferNumbers, setWalletTransferNumbers, assignedDetails, setAssignedDetails, technicianSearch, setTechnicianSearch, technicianServiceFilter, setTechnicianServiceFilter, guidelinesChecked, setGuidelinesChecked, guidelinesReachedEnd, setGuidelinesReachedEnd, guidelinesViewportHeight, setGuidelinesViewportHeight, topup, setTopup, clientTab, setClientTab, clientServiceSearch, setClientServiceSearch, servicePickerOpen, setServicePickerOpen, subservicePickerOpen, setSubservicePickerOpen, ratingPrompt, setRatingPrompt, dismissedRatings, setDismissedRatings, ratingDismissalsLoaded, setRatingDismissalsLoaded, ratingDismissalsLoadedFor, setRatingDismissalsLoadedFor, clientTrackSN, setClientTrackSN, clientTrackedOrder, setClientTrackedOrder, clientTrackError, setClientTrackError, clientTrackLoading, setClientTrackLoading, clientComplaint, setClientComplaint, clientComplaintTrack, setClientComplaintTrack, expandedClientOrders, setExpandedClientOrders, expandedTechnicianOrders, setExpandedTechnicianOrders, notificationsOpen, setNotificationsOpen, offerDraft, setOfferDraft, notifications, setNotifications, orderChats, setOrderChats, chatDrafts, setChatDrafts, priceDrafts, setPriceDrafts, ratingDrafts, setRatingDrafts, ratingSubmitting, setRatingSubmitting, supportCases, setSupportCases, supportCase, setSupportCase, supportDraft, setSupportDraft, supportSubject, setSupportSubject, supportLoading, setSupportLoading, supportError, setSupportError, accountPasswordForm, setAccountPasswordForm, profileEditForm, setProfileEditForm, profileEditOpenCategory, setProfileEditOpenCategory, recoveryForm, setRecoveryForm, registrationNameRef, registrationPhoneRef, registrationPasswordRef, registrationConfirmPasswordRef, clientAreaInputRef, clientAddressInputRef, clientDescriptionInputRef, clientBudgetInputRef, clientServiceDetailYRef, clientFormYRef, clientScrollRef, chatScrollRef, clientChatScrollRefs, clientChatAtBottomRef, ratingSubmittingRef, orderChatsRef, acceptedChatAutoOpenedRef, dismissedRatingsRef, ratingHandledRef, ratingStatusSnapshotRef, services, updateForm } = appState;
  const handlePushNotificationResponse = response => {
    const data = response?.notification?.request?.content?.data || {};
    const type = String(data.type || '');
    if (session?.role === 'fanni') {
      if (['topup_approved', 'topup_rejected', 'wallet_credit', 'fanni_wallet_credit', 'fanni_wallet_settlement', 'technician_settlement', 'wallet_debit', 'commission_deducted'].includes(type)) {
        setTechData(current => ({ ...current, tab: 'wallet' }));
      } else if (type === 'new_opportunity') {
        setTechData(current => ({ ...current, tab: 'available' }));
      } else if (type === 'store_order_update') {
        setTechData(current => ({ ...current, tab: 'store' }));
      } else if (['offer_accepted', 'order_cancelled', 'order_completed', 'order_message', 'price_change_requested', 'client_service_refunded'].includes(type)) {
        setTechData(current => ({ ...current, tab: 'currentJobs' }));
      }
      setScreen('technician');
    } else if (session?.role === 'client') {
      if (type.startsWith('client_wallet_') || type === 'client_service_refunded') setClientTab('wallet');
      else if (type === 'subscription_activated' || type === 'subscription_renewed') setClientTab('subscriptions');
      else if (type === 'store_order_update') setClientTab('store');
      else if (['order_created', 'new_offer', 'offer_accepted', 'order_cancelled', 'order_completed', 'order_rated'].includes(type)) setClientTab('current');
      setScreen('client');
    }
  };
  const pushTokenRef = usePushNotifications(session, handlePushNotificationResponse);
  const headerInitial = screen === 'client'
    ? String(session?.user?.name || 'ع').trim().charAt(0)
    : screen === 'technician'
      ? String(techData.profile?.name || session?.user?.name || 'ف').trim().charAt(0)
      : '';
  useEffect(() => {
    onScreenChange?.(screen, headerInitial);
  }, [screen, headerInitial, onScreenChange]);

  useEffect(() => {
    onAuthRestoringChange?.(authRestoring);
  }, [authRestoring, onAuthRestoringChange]);


  useEffect(() => {
    if (screen !== 'technician' || techData.tab !== 'wallet' || session?.role !== 'fanni') return;
    let active = true;
    (async () => {
      try {
        const result = await api('/wallet-settings', { timeoutMs: 15000 });
        if (active) setWalletTransferNumbers({
          walletPhone1: String(result?.walletPhone1 || '').trim(),
          walletPhone2: String(result?.walletPhone2 || '').trim(),
        });
      } catch (error) {
        if (active) setWalletTransferNumbers({ walletPhone1: '', walletPhone2: '' });
      }
    })();
    return () => { active = false; };
  }, [screen, techData.tab, session?.role, reloadKey]);
  const ratingAccountId = String(session?.user?.phone || session?.user?._id || session?.user?.id || 'account').trim().replace(/\s+/g, '');
  const ratingStorageKey = `sonaa.rating.dismissed.v3:${session?.role || 'guest'}:${ratingAccountId}`;
  const previousRatingStorageKey = `sonaa.rating.dismissed.v3:${session?.role || 'guest'}`;
  const legacyRatingStorageKey = `sonaa.rating.dismissed.v1:${session?.role || 'guest'}:${session?.user?._id || session?.user?.id || session?.user?.phone || 'account'}`;
  const oldestRatingStorageKey = `sonaa.rating.dismissed.v2:${session?.role || 'guest'}:${ratingAccountId}`;

  useEffect(() => {
    let active = true;
    setRatingDismissalsLoaded(false);
    setRatingDismissalsLoadedFor('');
    if (!session || !['client', 'fanni'].includes(session.role)) {
      dismissedRatingsRef.current = {};
      setDismissedRatings({});
      setRatingDismissalsLoadedFor(ratingStorageKey);
      setRatingDismissalsLoaded(true);
      return () => { active = false; };
    }
    (async () => {
      try {
        const [currentRaw, previousRaw, oldestRaw, legacyRaw] = await Promise.all([
          SecureStore.getItemAsync(ratingStorageKey),
          previousRatingStorageKey === ratingStorageKey ? Promise.resolve(null) : SecureStore.getItemAsync(previousRatingStorageKey),
          oldestRatingStorageKey === ratingStorageKey || oldestRatingStorageKey === previousRatingStorageKey ? Promise.resolve(null) : SecureStore.getItemAsync(oldestRatingStorageKey),
          legacyRatingStorageKey === ratingStorageKey || legacyRatingStorageKey === previousRatingStorageKey || legacyRatingStorageKey === oldestRatingStorageKey ? Promise.resolve(null) : SecureStore.getItemAsync(legacyRatingStorageKey),
        ]);
        if (!active) return;
        const parseDismissals = raw => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
          } catch (_) { return {}; }
        };
        const current = parseDismissals(currentRaw);
        const previous = parseDismissals(previousRaw);
        const oldest = parseDismissals(oldestRaw);
        const legacy = parseDismissals(legacyRaw);
        const saved = { ...legacy, ...oldest, ...previous, ...current };
        dismissedRatingsRef.current = saved;
        setDismissedRatings(saved);
        if (Object.keys(saved).length) {
          const serialized = JSON.stringify(saved);
          await Promise.all([
            SecureStore.setItemAsync(ratingStorageKey, serialized),
            SecureStore.setItemAsync(oldestRatingStorageKey, serialized),
            SecureStore.setItemAsync(legacyRatingStorageKey, serialized),
          ]);
        }
      } catch (error) {
        console.warn('تعذر استعادة حالات تخطي التقييم:', error?.message || error);
      } finally {
        if (active) {
          setRatingDismissalsLoadedFor(ratingStorageKey);
          setRatingDismissalsLoaded(true);
        }
      }
    })();
    return () => { active = false; };
  }, [ratingStorageKey, legacyRatingStorageKey, session?.role, session?.user?._id, session?.user?.id, session?.user?.phone]);

  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      let saved = null;
      try {
        const raw = await SecureStore.getItemAsync('sonaa.auth.session.v1');
        if (!raw) return;
        saved = JSON.parse(raw);
        if (!saved?.token || !['client', 'fanni'].includes(saved.role)) {
          await SecureStore.deleteItemAsync('sonaa.auth.session.v1');
          return;
        }
        let restoreTimer;
        try {
          const endpoint = saved.role === 'client' ? '/client/me' : '/fanni/me';
          const result = await Promise.race([
            api(endpoint, { token: saved.token }),
            new Promise((_, reject) => {
              restoreTimer = setTimeout(
                () => reject(new Error('انتهت مهلة الاتصال أثناء استعادة الحساب.')),
                15000
              );
            }),
          ]);
          const user = result.client || result.user || saved.user;
          if (!user) throw new Error('استجابة التحقق من الجلسة غير مكتملة.');
          saved = { token: saved.token, user, role: saved.role, mustChangePassword: saved.mustChangePassword === true };
          await SecureStore.setItemAsync('sonaa.auth.session.v1', JSON.stringify(saved));
        } catch (error) {
          if (error?.status === 401 || error?.status === 403) {
            await SecureStore.deleteItemAsync('sonaa.auth.session.v1');
            return;
          }
          if (!saved.user) throw error;
        } finally {
          if (restoreTimer) clearTimeout(restoreTimer);
        }
        if (!mounted) return;
        setSession(saved);
        setPasswordChangeRequired(saved.mustChangePassword === true);
        if (saved.role === 'client') setClientTab('home');
        if (saved.role === 'fanni') setTechData(current => ({ ...current, tab: 'home' }));
        const target = saved.mustChangePassword ? 'changePassword' : (saved.role === 'client' ? 'client' : 'technician');
        screenRef.current = target;
        setScreenState(target);
      } catch (error) {
        console.warn('تعذر استعادة جلسة صُنّاع:', error?.message || error);
      } finally {
        if (mounted) setAuthRestoring(false);
      }
    }
    void restoreSession();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const onHardwareBack = () => {
      if (passwordChangeRequired) return true;
      if (offerDraft) {
        setOfferDraft(null);
        return true;
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        return true;
      }
      // داخل لوحة العميل، الرجوع يعيد إلى الرئيسية قبل مغادرة اللوحة.
      if (screen === 'client' && clientTab !== 'home') {
        setClientTab('home');
        return true;
      }
      let previous = screenHistoryRef.current.pop();
      while (previous && ['home', 'login', 'clientRegister', 'technicianRegister'].includes(previous) && session) {
        previous = screenHistoryRef.current.pop();
      }
      if (previous) {
        screenRef.current = previous;
        setScreenState(previous);
        return true;
      }
      const rootScreen = session
        ? (session.role === 'client' ? 'client' : 'technician')
        : 'home';
      if (screen !== rootScreen) {
        screenHistoryRef.current = [];
        screenRef.current = rootScreen;
        setScreenState(rootScreen);
        if (rootScreen === 'client') setClientTab('home');
        return true;
      }
      Alert.alert('الخروج من التطبيق؟', 'هل تريد الخروج من تطبيق حمزاوي سات؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'خروج', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => subscription.remove();
  }, [screen, offerDraft, notificationsOpen, session, clientTab, setClientTab, passwordChangeRequired]);

  useEffect(() => {
    if (!['client', 'technician', 'clientRegister', 'technicianRegister', 'profileEdit'].includes(screen)) return;
    let mounted = true;
    async function loadPublicData() {
      setServicesLoading(true); setServicesError('');
      try {
        const [serviceResponse, areaResponse] = await Promise.allSettled([api('/services'), api('/areas')]);
        if (serviceResponse.status !== 'fulfilled') throw serviceResponse.reason;
        const serviceResult = serviceResponse.value;
        if (!Array.isArray(serviceResult.categories) || serviceResult.categories.length === 0) throw new Error('قائمة الخدمات من الخادم غير متاحة حاليًا');
        if (!mounted) return;
        setAreas(areaResponse.status === 'fulfilled' && Array.isArray(areaResponse.value?.areas) ? areaResponse.value.areas.filter(area => !isReservedAreaLabel(area)) : []);
        setAreaTechnicianCounts(areaResponse.status === 'fulfilled' && areaResponse.value?.technicianCountByArea && typeof areaResponse.value.technicianCountByArea === 'object' ? areaResponse.value.technicianCountByArea : {});
        setCategories(serviceResult.categories);
        setSelected(current => current && serviceResult.categories.some(item => item.label === current.label)
          ? serviceResult.categories.find(item => item.label === current.label) : null);
      } catch (err) {
        if (mounted) { setServicesError(err.message || 'تعذر تحميل الخدمات'); setCategories([]); }
      } finally { if (mounted) setServicesLoading(false); }
    }
    loadPublicData();
    return () => { mounted = false; };
  }, [reloadKey, screen]);

  useEffect(() => {
    if (screen !== 'support' || !session || !['client', 'fanni'].includes(session.role)) return;
    let active = true;
    const refreshSupport = async () => {
      if (!active || screenRef.current !== 'support') return;
      await loadSupportCases();
      if (supportCase?._id) {
        try {
          const result = await api('/support/' + session.role + '/' + encodeURIComponent(supportCase._id), { token: session.token });
          if (active && result.supportCase) setSupportCase(result.supportCase);
        } catch (_) {}
      }
    };
    refreshSupport();
    const timer = setInterval(refreshSupport, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [screen, session?.token, supportCase?._id]);

  useEffect(() => {
    if (!session || screen !== 'technician' || session.role !== 'fanni') return;
    let mounted = true;
    async function loadTechnician() {
      setTechData(current => ({ ...current, loading: true, error: '' }));
      const results = await Promise.allSettled([
        api('/fanni/me', { token: session.token }),
        api('/orders/available', { token: session.token }),
        api('/orders/my-offers', { token: session.token }),
        api('/fanni/wallet/history', { token: session.token }),
      ]);
      if (!mounted) return;
      const failed = results.find(item => item.status === 'rejected');
      setTechData(current => ({
        ...current,
        profile: results[0].status === 'fulfilled' ? (results[0].value.user || results[0].value) : session.user,
        orders: results[1].status === 'fulfilled' ? uniqueByOrderSN(toList(results[1].value, ['orders'])) : [],
        offers: results[2].status === 'fulfilled' ? uniqueByOrderSN(toList(results[2].value, ['offers'])) : [],
        ordersPagination: results[1].status === 'fulfilled' ? (results[1].value.pagination || null) : current.ordersPagination,
        wallet: results[3].status === 'fulfilled' ? toList(results[3].value, ['history', 'transactions', 'requests']) : [],
        loading: false,
        error: failed ? failed.reason?.message || 'تعذر تحميل بعض بيانات الفني' : '',
      }));
    }
    loadTechnician();
    return () => { mounted = false; };
  }, [session, screen, reloadKey]);

  useEffect(() => {
    if (!session || !['client', 'fanni'].includes(session.role)) return;
    if (!['client', 'technician'].includes(screen)) return;
    let mounted = true;
    let inFlight = false;
    const role = screen === 'client' ? 'client' : 'fanni';
    async function loadRoleNotifications(showLoading = false) {
      if (inFlight) return;
      inFlight = true;
      if (showLoading) setNotifications(current => ({ ...current, loading: true, error: '' }));
      try {
        const result = await api(`/notifications/${role}`, { token: session.token });
        if (mounted) setNotifications({ items: toList(result, ['notifications']), unread: Number(result.unreadCount || 0), loading: false, error: '' });
      } catch (err) {
        if (mounted && showLoading) setNotifications(current => ({ ...current, loading: false, error: err.message || 'تعذر تحميل الإشعارات' }));
      } finally {
        inFlight = false;
      }
    }
    loadRoleNotifications(true);
    const timer = setInterval(() => loadRoleNotifications(false), 5000);
    return () => { mounted = false; clearInterval(timer); };
  }, [session, screen, reloadKey]);

  useEffect(() => {
    if (!session || screen !== 'client' || session.role !== 'client') return;
    let mounted = true;
    async function loadClientOrders() {
      setClientData(current => ({ ...current, loading: true, error: '' }));
      try {
        const result = await api('/client/orders', { token: session.token });
        if (mounted) setClientData(current => ({ ...current, orders: uniqueByOrderSN(toList(result, ['orders'])), loading: false }));
      } catch (err) {
        if (mounted) setClientData(current => ({ ...current, loading: false, error: err.message || 'تعذر تحميل الطلبات' }));
      }
    }
    loadClientOrders();
    return () => { mounted = false; };
  }, [session, screen, reloadKey]);

  async function markNotificationRead(item) {
    const id = item?._id || item?.id;
    const type = String(item?.type || '');
    const role = session?.role === 'client' ? 'client' : 'fanni';
    if (id && !item.read && !item.readAt) {
      try {
        await api(`/notifications/${role}/${encodeURIComponent(id)}/read`, { method: 'PATCH', token: session.token });
        setNotifications(current => ({ ...current, items: current.items.map(n => (n._id || n.id) === id ? { ...n, read: true, readAt: new Date().toISOString() } : n), unread: Math.max(0, current.unread - 1) }));
      } catch (err) { Alert.alert('الإشعارات', err.message || 'تعذر تحديث الإشعار.'); }
    }
    setNotificationsOpen(false);

    // Match the browser notification behavior: prefer a safe same-origin tab link,
    // then fall back to the notification type when no usable link is supplied.
    let requestedTab = '';
    try {
      const target = new URL(String(item?.link || ''), 'https://hamzawy.local');
      if (target.origin === 'https://hamzawy.local') requestedTab = String(target.searchParams.get('tab') || '');
    } catch (_) {}

    if (session?.role === 'fanni') {
      const technicianTabs = {
        wallet: 'wallet',
        available: 'available',
        store: 'store',
        myOrders: 'currentJobs',
        currentJobs: 'currentJobs',
        offers: 'offers',
        completed: 'completed',
      };
      let tab = technicianTabs[requestedTab] || '';
      if (!tab) {
        if (['topup_approved', 'topup_rejected', 'wallet_credit', 'fanni_wallet_credit', 'fanni_wallet_settlement', 'technician_settlement', 'wallet_debit', 'commission_deducted'].includes(type)) tab = 'wallet';
        else if (type === 'new_opportunity') tab = 'available';
        else if (type === 'store_order_update') tab = 'store';
        else if (['offer_accepted', 'order_cancelled', 'order_completed', 'order_message', 'price_change_requested', 'client_service_refunded'].includes(type)) tab = 'currentJobs';
      }
      if (tab) setTechData(current => ({ ...current, tab }));
      setScreen('technician');
    } else if (session?.role === 'client') {
      const clientTabs = {
        home: 'home',
        wallet: 'wallet',
        store: 'store',
        subscriptions: 'subscriptions',
        complaint: 'complaint',
        orders: 'current',
        current: 'current',
        previous: 'previous',
        track: 'track',
      };
      let tab = clientTabs[requestedTab] || '';
      if (!tab) {
        if (type.startsWith('client_wallet_') || type === 'client_service_refunded') tab = 'wallet';
        else if (type === 'subscription_activated' || type === 'subscription_renewed') tab = 'subscriptions';
        else if (type === 'store_order_update') tab = 'store';
        else if (['order_created', 'new_offer', 'offer_accepted', 'order_cancelled', 'order_completed', 'order_rated'].includes(type)) tab = 'current';
      }
      if (tab) setClientTab(tab);
      setScreen('client');
    }
  }

  async function markAllNotificationsRead() {
    const role = session?.role === 'client' ? 'client' : 'fanni';
    try {
      await api(`/notifications/${role}/read-all`, { method: 'PATCH', token: session.token });
      setNotifications(current => ({ ...current, items: current.items.map(n => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() })), unread: 0 }));
    } catch (err) { Alert.alert('الإشعارات', err.message || 'تعذر تحديث الإشعارات.'); }
  }

  async function handleLogin() {
    const raw = username.trim();
    if (!raw || !password) { Alert.alert('بيانات ناقصة', 'اكتب رقم الهاتف أو الإيميل وكلمة السر.'); return; }
    const identifier = raw;
    setLoginLoading(true);
    try {
      let result, role, user;
      if (authMode === 'client') {
        result = await api('/client/login', { method: 'POST', body: { phone: identifier, password } });
        if (!result.token || !result.client) throw new Error('استجابة تسجيل دخول العميل غير مكتملة.');
        role = 'client'; user = result.client;
      } else {
        result = await api('/fanni/login', { method: 'POST', body: { phone: identifier, password } });
        if (!result.token || !result.user) throw new Error('استجابة تسجيل دخول الفني غير مكتملة.');
        role = 'fanni'; user = result.user;
      }
      const mustChangePassword = result.mustChangePassword === true;
      const nextSession = { token: result.token, user, role, mustChangePassword };
      if (role === 'client' || role === 'fanni') {
        await SecureStore.setItemAsync('sonaa.auth.session.v1', JSON.stringify(nextSession));
      }
      setSession(nextSession);
      setPasswordChangeRequired(mustChangePassword);
      if (role === 'client') setClientTab('home');
      if (role === 'fanni') setTechData(current => ({ ...current, tab: 'home' }));
      const loginPhone = identifier;
      try { await SecureStore.setItemAsync(`sonaa.auth.lastPhone.v1.${role}`, loginPhone); } catch (_) {}
      const loginPassword = password;
      setPassword('');
      setScreen(mustChangePassword ? 'changePassword' : (role === 'client' ? 'client' : 'technician'));
      if (mustChangePassword) return;
      const savedPasswordKey = `sonaa.auth.password.v1.${role}.${normalizePhoneDigits(loginPhone)}`;
      let previouslySavedPassword = '';
      try { previouslySavedPassword = await SecureStore.getItemAsync(savedPasswordKey); } catch (_) {}
      if (previouslySavedPassword) {
        // سبق للمستخدم الموافقة على الحفظ لهذا الحساب؛ لا نكرر السؤال.
        // لو كلمة المرور اتغيرت خارج التطبيق، نحدّث النسخة المحفوظة بعد نجاح الدخول.
        if (previouslySavedPassword !== loginPassword) {
          try { await SecureStore.setItemAsync(savedPasswordKey, loginPassword); } catch (_) {}
        }
      } else {
        Alert.alert('حفظ بيانات الدخول', 'تحب نحفظ كلمة المرور لهذا الرقم بأمان على الجهاز علشان تستخدمها المرة الجاية؟', [
          { text: 'لا، شكرًا', style: 'cancel' },
          { text: 'حفظ كلمة المرور', onPress: async () => {
            try {
              await SecureStore.setItemAsync(savedPasswordKey, loginPassword);
            } catch (_) { Alert.alert('تعذر الحفظ', 'ما قدرناش نحفظ كلمة المرور بأمان على الجهاز.'); }
          } }
        ]);
      }
    } catch (err) {
      Alert.alert('تعذر تسجيل الدخول', err.message || 'راجع البيانات وحاول مرة أخرى.');
    } finally { setLoginLoading(false); }
  }

  async function registerClient() {
    if (form.password !== form.confirmPassword) { Alert.alert('كلمة السر', 'كلمتا السر غير متطابقتين.'); return; }
    setLoginLoading(true);
    try {
      const result = await api('/client/register', { method: 'POST', body: { name: form.name.trim(), phone: form.phone.trim(), password: form.password, confirmPassword: form.confirmPassword, referralCode: String(form.referralCode || '').trim() } });
      if (!result.token || !result.client) throw new Error('تم التسجيل لكن استجابة الخادم غير مكتملة.');
      const nextSession = { token: result.token, user: result.client, role: 'client' };
      await SecureStore.setItemAsync('sonaa.auth.session.v1', JSON.stringify(nextSession));
      setSession(nextSession);
      setClientTab('home');
      setScreen('client');
    } catch (err) { Alert.alert('تعذر إنشاء الحساب', err.message || 'راجع البيانات وحاول مرة أخرى.'); }
    finally { setLoginLoading(false); }
  }

  async function registerTechnician() {
    if (form.password !== form.confirmPassword) { Alert.alert('كلمة السر', 'كلمتا السر غير متطابقتين.'); return; }
    if (!form.specialties.length) { Alert.alert('بيانات ناقصة', 'اختار خدمة واحدة على الأقل.'); return; }
    const selectedAreas = [...new Set((Array.isArray(form.areas) ? form.areas : []).map(area => String(area).trim()).filter(area => areas.includes(area) && !isReservedAreaLabel(area)))];
    if (!selectedAreas.length || selectedAreas.some(area => area.length < 2 || area.length > 60) || selectedAreas.length > 30) {
      Alert.alert('مناطق العمل', 'اختار منطقة عمل واحدة على الأقل من القائمة المعتمدة، وبحد أقصى 30 منطقة.');
      return;
    }
    if (!guidelinesReachedEnd) {
      Alert.alert('ميثاق صُنّاع', 'لازم تقرأ الميثاق حتى آخره قبل الموافقة.');
      return;
    }
    if (!guidelinesChecked) {
      Alert.alert('الموافقة مطلوبة', 'علّم على مربع قرأت وأوافق على ميثاق صُنّاع لإكمال التسجيل.');
      return;
    }
    const nationalId = normalizePhoneDigits(form.nationalId || '');
    if (!/^\\d{14}$/.test(nationalId)) {
      Alert.alert('الرقم القومي', 'اكتب الرقم القومي المصري كاملًا، 14 رقمًا.');
      return;
    }
    if (!identityCardUploads.front.fileId || !identityCardUploads.back.fileId ||
        !identityCardUploads.profile.fileId ||
        identityCardUploads.front.uploading || identityCardUploads.back.uploading || identityCardUploads.profile.uploading) {
      Alert.alert('بيانات الهوية مطلوبة', 'ارفع صورتي البطاقة والتقط صورة شخصية بالكاميرا، وانتظر اكتمال رفع الصور الثلاث.');
      return;
    }
    setLoginLoading(true);
    try {
      const result = await api('/fanni/register', { method: 'POST', body: {
        name: form.name.trim(),
        phone: form.phone.trim(),
        password: form.password,
        specialties: form.specialties,
        areas: selectedAreas,
        guidelinesAccepted: true,
        identityCardFrontFileId: identityCardUploads.front.fileId,
        identityCardBackFileId: identityCardUploads.back.fileId,
        profilePhotoFileId: identityCardUploads.profile.fileId,
        nationalId,
        referralCode: String(form.referralCode || '').trim()
      } });
      Alert.alert('تم إرسال التسجيل', result.message || 'حسابك قيد مراجعة الإدارة.');
      setIdentityCardUploads({
        front: { fileId: '', previewUri: '', uploading: false, status: '' },
        back: { fileId: '', previewUri: '', uploading: false, status: '' },
        profile: { fileId: '', previewUri: '', uploading: false, status: '' }
      });
      setIdentityPreviewUri('');
      setUsername(form.phone); setPassword(''); setScreen('login'); setAuthMode('fanni');
    } catch (err) { Alert.alert('تعذر تسجيل الفني', err.message || 'راجع البيانات وحاول مرة أخرى.'); }
    finally { setLoginLoading(false); }
  }

  async function createOrder() {
    if (!String(form.service || '').trim()) {
      Alert.alert('الخدمة التفصيلية مطلوبة', 'اختار الخدمة التفصيلية لإكمال الطلب.');
      return;
    }
    if (!areas.includes(form.area) || isReservedAreaLabel(form.area)) {
      Alert.alert('المنطقة مطلوبة', 'اختار منطقة العمل من القائمة لإكمال الطلب.');
      return;
    }
    const detailedAddress = String(form.address || '').trim();
    if (detailedAddress.length < 10) {
      Alert.alert('العنوان التفصيلي غير مكتمل', 'اكتب العنوان بالتفصيل في 10 أحرف على الأقل، مع ذكر الشارع ورقم العقار أو أقرب علامة مميزة.');
      return;
    }
    setLoginLoading(true);
    try {
      const description = form.description.trim();
      if (description.length < 10 && !form.voiceRecordingData) {
        Alert.alert('تفاصيل الخدمة مطلوبة', 'اكتب وصفًا من 10 أحرف على الأقل أو سجّل وصف الطلب صوتيًا.');
        setLoginLoading(false);
        return;
      }
      const orderBody = { clientName: String(session.user?.name || form.name || '').trim(), phone: String(session.user?.phone || form.phone || '').trim(), service: form.service, area: form.area.trim(), address: form.address.trim(), description, ...(form.voiceRecordingData ? { voiceRecordingData: form.voiceRecordingData } : {}), budget: form.budget.trim() };
      const result = await api('/orders', { method: 'POST', token: session.token, body: orderBody });
      setClientData(current => ({ ...current, sn: result.sn || result.order?.sn || '', clientToken: result.clientToken || '' }));
      setClientTab('current');
      setForm(current => ({ ...current, area: '', address: '', description: '', voiceRecordingData: '', budget: '' }));
      setReloadKey(value => value + 1);
      Alert.alert('تم استلام الطلب', `كود المتابعة: ${result.sn || result.order?.sn || '—'}\nسيتم مراجعته من الإدارة.`);
    } catch (err) { Alert.alert('تعذر إنشاء الطلب', err.message || 'راجع البيانات وحاول مرة أخرى.'); }
    finally { setLoginLoading(false); }
  }

  async function trackClientOrder() {
    const sn = String(clientTrackSN || '').trim().toUpperCase();
    if (!/^SN[A-Z0-9]{4,18}$/.test(sn)) { setClientTrackError('اكتب كود طلب صحيح يبدأ بـ SN.'); return; }
    setClientTrackLoading(true); setClientTrackError(''); setClientTrackedOrder(null);
    try { const result = await api(`/orders/${encodeURIComponent(sn)}`, { token: session?.token }); setClientTrackedOrder(result.order || result.data || result); setClientTrackSN(sn); }
    catch (err) { setClientTrackError(err.message || 'تعذر العثور على الطلب أو التحقق من ملكيته.'); } finally { setClientTrackLoading(false); }
  }
  async function submitClientComplaint() {
    const sn = String(clientComplaint.sn || '').trim().toUpperCase(), name = String(clientComplaint.name || '').trim(), text = String(clientComplaint.text || '').trim();
    if (!/^SN[A-Z0-9]{4,18}$/.test(sn) || name.length < 2 || name.length > 50 || text.length < 10 || text.length > 1000) { setClientComplaint(c => ({ ...c, error: 'راجع كود الطلب والاسم، واكتب تفاصيل الشكوى من 10 إلى 1000 حرف.' })); return; }
    setClientComplaint(c => ({ ...c, loading: true, error: '' }));
    try { const result = await api('/complaints', { method: 'POST', body: { sn, clientName: name, text } }); Alert.alert('تم إرسال الشكوى', result.message || 'وصلت شكواك للإدارة.'); setClientComplaint({ sn: '', name: '', text: '', loading: false, error: '' }); }
    catch (err) { setClientComplaint(c => ({ ...c, loading: false, error: err.message || 'تعذر إرسال الشكوى.' })); }
  }
  async function trackClientComplaints() {
    const sn = String(clientComplaintTrack.sn || '').trim().toUpperCase(), name = String(clientComplaintTrack.name || '').trim();
    if (!sn || name.length < 2) { setClientComplaintTrack(c => ({ ...c, error: 'اكتب كود الطلب والاسم المسجل.' })); return; }
    setClientComplaintTrack(c => ({ ...c, loading: true, error: '', result: null }));
    try { const result = await api('/complaints/track?sn=' + encodeURIComponent(sn) + '&clientName=' + encodeURIComponent(name)); setClientComplaintTrack(c => ({ ...c, loading: false, result })); }
    catch (err) { setClientComplaintTrack(c => ({ ...c, loading: false, error: err.message || 'تعذر متابعة الشكوى.' })); }
  }

  function sendOffer(order) {
    if (!order || typeof order !== 'object' || !getOrderSN(order)) {
      Alert.alert('تعذر تقديم العرض', 'بيانات الطلب غير مكتملة. حدّث الفرص وحاول مرة أخرى.');
      return;
    }
    setOfferDraft({ order, price: '', message: 'أستطيع تنفيذ الخدمة المطلوبة.' });
  }

  async function submitOffer() {
    const orderSN = getOrderSN(offerDraft?.order);
    if (!orderSN || !session?.token) {
      Alert.alert('تعذر إرسال العرض', 'بيانات الطلب أو جلسة الدخول غير متاحة. أغلق النافذة وحدّث الفرص ثم حاول مرة أخرى.');
      setOfferDraft(null);
      return;
    }
    const amount = Number(offerDraft?.price);
    const message = String(offerDraft?.message || '').trim();
    const hasActiveAcceptedJob = techData.offers.some(item => item.accepted === true && item.orderStatus === 'تم اختيار فني');
    if (hasActiveAcceptedJob) {
      Alert.alert('لديك مهمة جارية', 'لا يمكنك تقديم عرض جديد قبل إنهاء المهمة الحالية.');
      return;
    }
    if (!Number.isInteger(amount) || amount < 10 || amount > 1000000 || message.length < 5 || message.length > 500) {
      Alert.alert('بيانات العرض غير صحيحة', 'اكتب سعرًا صحيحًا من 10 إلى مليون جنيه ورسالة من 5 إلى 500 حرف.');
      return;
    }
    try {
      await api(`/orders/${encodeURIComponent(orderSN)}/offer`, {
        method: 'POST', token: session.token, body: { price: amount, message }
      });
      setOfferDraft(null);
      Alert.alert('تم إرسال العرض', 'تم إرسال عرضك بنجاح.');
      setReloadKey(value => value + 1);
    } catch (err) {
      Alert.alert('تعذر إرسال العرض', err.message || 'حاول مرة أخرى.');
    }
  }

  async function cancelClientOrder(order) {
    const sn = getOrderSN(order);
    if (!sn) { Alert.alert('تعذر إلغاء الطلب', 'كود الطلب غير موجود.'); return; }
    Alert.alert('إلغاء الطلب', `هل تريد إلغاء الطلب ${sn}؟ لن يمكن التراجع عن الإلغاء.`, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'تأكيد الإلغاء', style: 'destructive', onPress: async () => {
        try {
          const result = await api(`/orders/${encodeURIComponent(sn)}/cancel`, {
            method: 'POST', token: orderToken('client'), body: {}
          });
          Alert.alert('تم إلغاء الطلب', result.message || 'تم إلغاء الطلب بنجاح.');
          setReloadKey(value => value + 1);
        } catch (err) {
          Alert.alert('تعذر إلغاء الطلب', err.message || 'قد يكون الفني تم اختياره بالفعل.');
        }
      } },
    ]);
  }

  async function acceptClientOffer(order, offer) {
    const sn = order?.sn || order?.orderSn;
    const offerId = offer?._id || offer?.id;
    if (!sn || !offerId) { Alert.alert('تعذر قبول العرض', 'بيانات الطلب أو العرض غير مكتملة.'); return; }
    Alert.alert('تأكيد العرض', `قبول عرض ${offer.fanniName || offer.technicianName || 'الفني'} بسعر ${offer.price ?? '—'} جنيه؟`, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'قبول العرض', onPress: async () => {
        try {
          const result = await api(`/orders/${encodeURIComponent(sn)}/accept`, { method: 'POST', token: session.token, body: { offerId } });
          acceptedChatAutoOpenedRef.current[`client:${sn}`] = true;
          await refreshOrderChat({ ...order, status: 'تم اختيار فني', orderStatus: 'تم اختيار فني' }, 'client');
          Alert.alert('تم قبول العرض', 'تم تأكيد اختيار الفني بنجاح.');
          setReloadKey(v => v + 1);
        }
        catch (err) { Alert.alert('تعذر قبول العرض', err.message || 'حاول مرة أخرى.'); }
      } },
    ]);
  }

  async function completeTechnicianOrder(item) {
    const sn = item?.orderSn || item?.sn || item?.order?.sn;
    if (!sn) { Alert.alert('تعذر إنهاء الخدمة', 'لم يتم العثور على كود الطلب.'); return; }
    Alert.alert('تأكيد إنهاء الخدمة', `هل انتهيت من تنفيذ الطلب ${sn}؟`, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'إنهاء الخدمة', onPress: async () => {
        try {
          await api(`/orders/${encodeURIComponent(sn)}/complete`, { method: 'POST', token: session.token, body: {} });
          setTechData(current => ({ ...current, tab: 'completed' }));
          setExpandedTechnicianOrders(current => ({ ...current, [sn]: true }));
          setReloadKey(v => v + 1);
        }
        catch (err) { Alert.alert('تعذر إنهاء الخدمة', err.message || 'حاول مرة أخرى.'); }
      } },
    ]);
  }

  function getOrderSN(order) { return String(order?.orderSn || order?.sn || order?.order?.orderSn || order?.order?.sn || order?.serialNumber || '').trim().toUpperCase(); }
  function uniqueByOrderSN(items) {
    const result = [];
    const indexBySN = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const sn = getOrderSN(item);
      if (!sn) {
        result.push(item);
        continue;
      }
      if (!indexBySN.has(sn)) {
        indexBySN.set(sn, result.length);
        result.push(item);
        continue;
      }
      const index = indexBySN.get(sn);
      const previous = result[index];
      const nonEmptyFields = Object.fromEntries(
        Object.entries(item || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
      result[index] = { ...previous, ...nonEmptyFields };
    }
    return result;
  }

  useEffect(() => {
    if (!session || screen !== 'technician' || session.role !== 'fanni') return;
    const acceptedJobs = techData.offers.filter(item => {
      const status = String(item.orderStatus || item.status || '').trim();
      return status === 'تم اختيار فني' || item.accepted === true;
    });
    for (const item of acceptedJobs) {
      const sn = getOrderSN(item);
      if (!sn || assignedDetails[sn]?.loading || assignedDetails[sn]?.order || assignedDetails[sn]?.error) continue;
      setAssignedDetails(current => ({ ...current, [sn]: { loading: true, error: '' } }));
      api(`/orders/${encodeURIComponent(sn)}/assigned-details`, { token: session.token })
        .then(result => { setAssignedDetails(current => ({ ...current, [sn]: { loading: false, order: result.order || result.data || null, error: '' } })); })
        .catch(error => { setAssignedDetails(current => ({ ...current, [sn]: { loading: false, order: null, error: error.message || 'تعذر تحميل تفاصيل العميل' } })); });
    }
  }, [session, screen, techData.offers, assignedDetails]);

  useEffect(() => {
    if (!session || screen !== 'client' || session.role !== 'client') return;
    let active = true, busy = false;
    const refreshClientOrders = async () => { if (busy) return; busy = true; try { const result = await api('/client/orders', { token: session.token }); if (active) setClientData(current => ({ ...current, orders: uniqueByOrderSN(toList(result, ['orders'])), loading: false, error: '' })); } catch {} finally { busy = false; } };
    const timer = setInterval(refreshClientOrders, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [session, screen]);

  useEffect(() => {
    if (!session || screen !== 'technician' || session.role !== 'fanni') return;
    let active = true, busy = false;
    const refreshTechnicianData = async () => { if (busy) return; busy = true; try { const results = await Promise.allSettled([api('/orders/available', { token: session.token }), api('/orders/my-offers', { token: session.token }), api('/fanni/wallet/history', { token: session.token })]); if (active) setTechData(current => ({ ...current, orders: results[0].status === 'fulfilled' ? uniqueByOrderSN(toList(results[0].value, ['orders'])) : current.orders, offers: results[1].status === 'fulfilled' ? uniqueByOrderSN(toList(results[1].value, ['offers'])) : current.offers, ordersPagination: results[0].status === 'fulfilled' ? (results[0].value.pagination || current.ordersPagination) : current.ordersPagination, wallet: results[2].status === 'fulfilled' ? toList(results[2].value, ['history', 'transactions', 'requests']) : current.wallet })); } catch {} finally { busy = false; } };
    const timer = setInterval(refreshTechnicianData, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [session, screen]);

  useEffect(() => {
    const isCompletedStatus = value => ['تم الانتهاء', 'منتهي', 'مكتمل', 'مكتملة', 'completed', 'complete', 'finished'].includes(String(value || '').trim().toLowerCase());
    const snapshots = ratingStatusSnapshotRef.current;
    const nextSnapshots = { client: {}, fanni: {} };
    let candidate = null;
    for (const role of ['client', 'fanni']) {
      const items = role === 'client' ? clientData.orders : techData.offers;
      for (const order of items) {
        const sn = getOrderSN(order);
        if (!sn) continue;
        const status = String(role === 'client' ? (order.status || order.orderStatus || '') : (order.orderStatus || order.status || '')).trim();
        const previousStatus = snapshots[role]?.[sn];
        const alreadyRated = role === 'client'
          ? Boolean(order.myRating || order.clientRating || order.ratingByClient || (order.ratings || []).some(r => r.reviewerRole === 'client'))
          : Boolean(order.myRating || order.fanniRating || order.ratingByFanni || (order.ratings || []).some(r => r.reviewerRole === 'fanni'));
        const activeRole = (role === 'client' && screen === 'client' && session?.role === 'client') || (role === 'fanni' && screen === 'technician' && session?.role === 'fanni');
        if (!candidate && activeRole && previousStatus && !isCompletedStatus(previousStatus) && isCompletedStatus(status) && !alreadyRated && !ratingHandledRef.current.has(`${ratingStorageKey}:${sn}`)) {
          candidate = { role, order };
        }
        nextSnapshots[role][sn] = status;
      }
    }
    ratingStatusSnapshotRef.current = nextSnapshots;
    if (candidate) setRatingPrompt(current => current || candidate);
  }, [session?.role, screen, clientData.orders, techData.offers, ratingStorageKey]);

  useEffect(() => {
    if (!session || !['client', 'fanni'].includes(session.role)) return;
    if (!['client', 'technician'].includes(screen)) return;
    const role = screen === 'client' ? 'client' : 'fanni';
    const orders = role === 'client' ? clientData.orders : techData.offers;
    for (const order of orders) {
      const sn = getOrderSN(order);
      const status = String(role === 'client' ? (order.status || order.orderStatus || '') : (order.orderStatus || order.status || '')).trim();
      if (!sn || !['تم اختيار فني', 'تم الانتهاء'].includes(status)) continue;
      const key = `${role}:${sn}`;
      if (acceptedChatAutoOpenedRef.current[key]) continue;
      acceptedChatAutoOpenedRef.current[key] = true;
      if (!orderChatsRef.current[sn]?.open) refreshOrderChat(order, role);
    }
  }, [session?.role, screen, clientData.orders, techData.offers]);

  function orderToken(role) { return role === 'client' ? (session?.token || clientData.clientToken || '') : (session?.token || ''); }

  function refreshVisibleData() {
    setReloadKey(value => value + 1);
  }

  async function refreshOrderChat(order, role) {
    const sn = getOrderSN(order);
    if (!sn) return;
    setOrderChats(current => ({ ...current, [sn]: { ...(current[sn] || {}), targetOfferId: order?._id || order?.offerId || order?.id || current[sn]?.targetOfferId || '', open: true, loading: current[sn]?.open && Array.isArray(current[sn]?.messages) ? false : true, error: '' } }));
    try {
      const acceptedClientOrder = role === 'client' && ['تم اختيار فني','تم الانتهاء'].includes(order?.status || order?.orderStatus);
      const offerId = (acceptedClientOrder ? (order?.acceptedOfferId || order?.acceptedOffer?._id || order?.offerId) : '') || order?._id || order?.offerId || order?.id || orderChats[sn]?.targetOfferId || '';
      const query = offerId && role === 'client' && !acceptedClientOrder ? '?offerId=' + encodeURIComponent(offerId) : '';
      const result = await api(`/orders/${encodeURIComponent(sn)}/chat${query}`, { token: orderToken(role) });
      setOrderChats(current => ({ ...current, [sn]: { ...(current[sn] || {}), targetOfferId: offerId || current[sn]?.targetOfferId || '', open: true, loading: false, error: '', messages: toList(result, ['messages']), priceChangeRequests: toList(result, ['priceChangeRequests']) } }));
    } catch (err) {
      setOrderChats(current => ({ ...current, [sn]: { ...(current[sn] || {}), open: true, loading: false, error: err.message || 'تعذر تحميل المحادثة' } }));
      Alert.alert('تعذر فتح المحادثة', err.message || 'حاول مرة أخرى.');
    }
  }

  async function toggleOrderChat(order, role) {
    const sn = getOrderSN(order);
    if (!sn) { Alert.alert('تعذر فتح المحادثة', 'كود الطلب غير موجود.'); return; }
    const requestedOfferId = order?._id || order?.offerId || order?.id || '';
    const currentOfferId = orderChats[sn]?.targetOfferId || '';
    if (orderChats[sn]?.open && (!requestedOfferId || String(requestedOfferId) === String(currentOfferId))) {
      setOrderChats(current => ({ ...current, [sn]: { ...(current[sn] || {}), open: false } }));
      return;
    }
    await refreshOrderChat(order, role);
  }

  async function sendOrderChat(order, quickReply = '') {
    const sn = getOrderSN(order), message = String(quickReply || chatDrafts[getOrderSN(order)] || '').trim();
    const offerId = orderChats[getOrderSN(order)]?.targetOfferId || order?._id || order?.offerId || order?.id;
    if (!sn || !message) { Alert.alert('رسالة فارغة', 'اكتب الرسالة أولًا.'); return; }
    if (session?.role === 'fanni' && order?.accepted !== true && !['نعم', 'لا', 'حسب الاتفاق'].includes(message)) {
      Alert.alert('الرد قبل قبول العرض', 'قبل اختيارك من العميل، الردود المتاحة هي: نعم، لا، حسب الاتفاق.');
      return;
    }
    try {
      await api(`/orders/${encodeURIComponent(sn)}/chat`, { method: 'POST', token: orderToken(session?.role || 'client'), body: { text: message, ...(offerId && ((session?.role === 'fanni' && order?.accepted !== true) || (session?.role === 'client' && !['تم اختيار فني', 'تم الانتهاء'].includes(order?.status))) ? { offerId } : {}) } });
      setChatDrafts(current => ({ ...current, [sn]: '' }));
      await refreshOrderChat(order, session.role);
    } catch (err) { Alert.alert('تعذر إرسال الرسالة', err.message || 'راجع قواعد المحادثة وحاول مرة أخرى.'); }
  }

  async function requestOrderPriceChange(order) {
    const sn = getOrderSN(order), draft = priceDrafts[getOrderSN(order)] || {};
    const newPrice = Number(draft.price), reason = String(draft.reason || '').trim();
    const currentPrice = Number(order?.acceptedOfferPrice ?? order?.client?.acceptedOfferPrice ?? order?.priceNum ?? order?.price);
    if (!sn || !Number.isFinite(newPrice) || newPrice <= 0 || reason.length < 5) {
      Alert.alert('بيانات تعديل السعر', 'اكتب السعر الجديد وسببًا واضحًا لا يقل عن 5 أحرف.'); return;
    }
    if (Number.isFinite(currentPrice) && newPrice <= currentPrice) {
      Alert.alert('السعر الجديد غير صحيح', `لازم السعر الجديد يكون أعلى من السعر الحالي (${currentPrice} جنيه).`); return;
    }
    try {
      const result = await api(`/orders/${encodeURIComponent(sn)}/price-change`, { method: 'POST', token: session.token, body: { newPrice, reason } });
      Alert.alert('تم إرسال الطلب', 'تم إرسال طلب زيادة السعر، وظهر في المحادثة بحالة انتظار رد العميل. لا ترسل طلبًا آخر قبل رد العميل.');
      setPriceDrafts(current => ({ ...current, [sn]: { price: '', reason: '' } }));
      await refreshOrderChat(order, 'fanni');
      setReloadKey(v => v + 1);
    } catch (err) { Alert.alert('تعذر تعديل السعر', err.message || 'حاول مرة أخرى.'); }
  }

  async function decideOrderPrice(order, request, approved) {
    const sn = getOrderSN(order), id = request?._id || request?.id;
    if (!sn || !id) { Alert.alert('تعذر تنفيذ القرار', 'بيانات طلب تعديل السعر غير مكتملة.'); return; }
    Alert.alert(approved ? 'الموافقة على تعديل السعر' : 'رفض تعديل السعر',
      approved ? `هل توافق على تغيير السعر إلى ${request.newPrice} جنيه؟` : 'هل تريد رفض طلب تعديل السعر؟',
      [{ text: 'رجوع', style: 'cancel' }, { text: approved ? 'موافقة' : 'رفض', onPress: async () => {
        try {
          const result = await api(`/orders/${encodeURIComponent(sn)}/price-change/${encodeURIComponent(id)}/decision`, { method: 'POST', token: orderToken('client'), body: { approved } });
          Alert.alert('تم تسجيل القرار', result.message || (approved ? 'تمت الموافقة.' : 'تم رفض الطلب.'));
          await refreshOrderChat(order, 'client');
          setReloadKey(v => v + 1);
        } catch (err) { Alert.alert('تعذر تسجيل القرار', err.message || 'حاول مرة أخرى.'); }
      }}]);
  }

  useEffect(() => {
    if (!session || !['client', 'technician'].includes(screen)) return;
    const role = screen === 'client' ? 'client' : 'fanni';
    const sourceOrders = role === 'client' ? clientData.orders : techData.offers;
    let mounted = true;
    let inFlight = false;
    const pollOpenChats = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const openChats = sourceOrders
          .map(order => {
            const sn = getOrderSN(order);
            const chat = sn ? orderChatsRef.current[sn] : null;
            if (!sn || !chat?.open) return null;
            const accepted = ['تم اختيار فني', 'تم الانتهاء'].includes(order?.status || order?.orderStatus);
            const offerId = (role === 'client' && accepted
              ? (order?.acceptedOfferId || order?.acceptedOffer?._id || order?.offerId)
              : '') || chat.targetOfferId || order?._id || order?.offerId || order?.id || '';
            return { sn, offerId, accepted };
          })
          .filter(Boolean);
        const uniqueChats = [...new Map(openChats.map(chat => [chat.sn, chat])).values()];
        await Promise.all(uniqueChats.map(async ({ sn, offerId, accepted }) => {
          try {
            const query = role === 'client' && !accepted && offerId
              ? '?offerId=' + encodeURIComponent(offerId)
              : '';
            const result = await api(`/orders/${encodeURIComponent(sn)}/chat${query}`, { token: session.token });
            if (!mounted) return;
            setOrderChats(current => current[sn]?.open &&
              (!offerId || String(current[sn]?.targetOfferId || '') === String(offerId))
              ? { ...current, [sn]: { ...current[sn], loading: false, error: '', messages: toList(result, ['messages']), priceChangeRequests: toList(result, ['priceChangeRequests']) } }
              : current);
          } catch {}
        }));
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(pollOpenChats, 3000);
    return () => { mounted = false; clearInterval(timer); };
  }, [screen, session, clientData.orders, techData.offers]);

  function setOrderRatingStars(order, stars) {
    const sn = getOrderSN(order);
    setRatingDrafts(current => ({
      ...current,
      [sn]: {
        ...current[sn],
        stars: String(stars),
        blockFuture: stars === 1 ? current[sn]?.blockFuture : false,
      },
    }));
  }

  function renderRatingStars(order, selectedStars, compact = false) {
    return <View style={[styles.ratingStarsRow, compact && styles.ratingStarsRowCompact]}>
      {[1, 2, 3, 4, 5].map(value => <TouchableOpacity key={value} accessibilityRole="button" accessibilityLabel={`تقييم ${value} من 5`} onPress={() => setOrderRatingStars(order, value)} style={[styles.ratingStarButton, compact && styles.ratingStarButtonCompact]}>
        <Text style={[styles.ratingStar, compact && styles.ratingStarCompact, selectedStars >= value && styles.ratingStarActive]}>★</Text>
      </TouchableOpacity>)}
    </View>;
  }

  async function submitOrderRating(order) {
    const sn = getOrderSN(order);
    if (!order || typeof order !== 'object' || !sn) {
      Alert.alert('تعذر إرسال التقييم', 'بيانات المهمة غير مكتملة. حدّث الطلبات وحاول مرة أخرى.');
      setRatingPrompt(null);
      return;
    }
    const draft = ratingDrafts[sn] || {};
    if (ratingSubmittingRef.current.has(sn)) return;
    const stars = Number(draft.stars || 5), comment = '', blockFuture = false;
    if (!Number.isInteger(stars) || stars < 1 || stars > 5 || (blockFuture && stars !== 1)) {
      Alert.alert('راجع التقييم', 'اختار من نجمة إلى 5 نجوم. منع التعامل متاح مع تقييم نجمة واحدة فقط.'); return;
    }

    ratingSubmittingRef.current.add(sn);
    setRatingSubmitting(current => ({ ...current, [sn]: true }));
    const controller = new AbortController();
    const activePrompt = ratingPrompt && getOrderSN(ratingPrompt.order) === sn ? ratingPrompt : null;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await api(`/orders/${encodeURIComponent(sn)}/rating`, {
        method: 'POST',
        token: orderToken(session?.role || 'client'),
        body: { stars, comment, blockFuture },
        signal: controller.signal,
      });
      ratingHandledRef.current.add(`${ratingStorageKey}:${sn}`);
      dismissedRatingsRef.current = { ...dismissedRatingsRef.current, [sn]: true };
      setRatingDrafts(current => ({ ...current, [sn]: { ...current[sn], stars: String(stars), comment: '', blockFuture: false, submitted: true } }));
      setRatingPrompt(current => current && getOrderSN(current.order) === sn ? null : current);
      await saveRatingDismissal(sn);
      setReloadKey(v => v + 1);
      Alert.alert('تم حفظ التقييم', result.message || 'تم حفظ تقييمك بنجاح.');
    } catch (err) {
      if (err?.status === 409) {
        ratingHandledRef.current.add(`${ratingStorageKey}:${sn}`);
        dismissedRatingsRef.current = { ...dismissedRatingsRef.current, [sn]: true };
        setRatingPrompt(current => current && getOrderSN(current.order) === sn ? null : current);
        await saveRatingDismissal(sn);
        setReloadKey(v => v + 1);
        Alert.alert('التقييم محفوظ بالفعل', 'سبق تسجيل تقييمك لهذه المهمة، ولن يظهر مربع التقييم مرة أخرى.');
        return;
      }
      if (activePrompt) setRatingPrompt(activePrompt);
      Alert.alert('تعذر حفظ التقييم', err.message || 'تعذر حفظ التقييم. حاول مرة أخرى.');
    } finally {
      clearTimeout(timeout);
      ratingSubmittingRef.current.delete(sn);
      setRatingSubmitting(current => ({ ...current, [sn]: false }));
    }
  }

  async function saveRatingDismissal(sn) {
    if (!sn) return;
    const next = { ...dismissedRatingsRef.current, [sn]: true };
    dismissedRatingsRef.current = next;
    setDismissedRatings(current => ({ ...current, ...next, [sn]: true }));
    try {
      const raw = await SecureStore.getItemAsync(ratingStorageKey);
      let persisted = {};
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) persisted = parsed;
      } catch (_) {}
      const merged = { ...persisted, ...dismissedRatingsRef.current, [sn]: true };
      dismissedRatingsRef.current = merged;
      setDismissedRatings(current => ({ ...current, ...merged, [sn]: true }));
      const serialized = JSON.stringify(merged);
      await Promise.all([
        SecureStore.setItemAsync(ratingStorageKey, serialized),
        SecureStore.setItemAsync(oldestRatingStorageKey, serialized),
        SecureStore.setItemAsync(legacyRatingStorageKey, serialized),
      ]);
    } catch (error) {
      console.warn('تعذر حفظ حالة تخطي التقييم:', error?.message || error);
    }
  }

  function renderRatingModal(role) {
    if (!ratingPrompt || ratingPrompt.role !== role) return null;
    const order = ratingPrompt.order;
    const sn = getOrderSN(order);
    if (!order || typeof order !== 'object' || !sn) return null;
    const draft = ratingDrafts[sn] || { stars: '5', comment: '', blockFuture: false };
    const stars = Number(draft.stars || 5);
    const submitting = Boolean(ratingSubmitting[sn]);
    return <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.modalBackdrop}>
        <View style={styles.ratingModal}>
          <Text style={styles.title}>{role === 'client' ? 'قيّم الفني' : 'قيّم العميل'}</Text>
          <Text style={styles.detail}>انتهت الخدمة {sn}. اختار عدد النجوم واضغط «تقييم».</Text>
          <View style={styles.ratingSubmitRow}>
            <TouchableOpacity accessibilityRole="button" onPress={() => submitOrderRating(order)} disabled={submitting} style={[styles.ratingSubmitButton, submitting && styles.disabledButton]}>
              <Text style={styles.ratingSubmitButtonText}>{submitting ? '...' : 'تقييم'}</Text>
            </TouchableOpacity>
            {renderRatingStars(order, stars, true)}
          </View>
        </View>
      </View>
    </Modal>;
  }

  async function acceptTechnicianGuidelines() {
    try {
      const result = await api('/fanni/guidelines/accept', {
        method: 'POST',
        token: session?.token,
        body: { accepted: true, version: '2026-10-20-v1' }
      });
      Alert.alert('تم تسجيل الموافقة', result.message || 'تم تسجيل موافقتك على ميثاق صُنّاع.');
      setReloadKey(value => value + 1);
    } catch (err) {
      Alert.alert('تعذر تسجيل الموافقة', err.message || 'حاول مرة أخرى.');
    }
  }

  async function submitTopup() {
    const amount = Number(topup.amount);
    const phone = normalizePhoneDigits(topup.fromPhone);
    const reference = String(topup.reference || '').trim().slice(0, 50);
    const technicianStatus = String(techData.profile?.status || session?.user?.status || '').trim();
    if (technicianStatus !== 'معتمد') { Alert.alert('الحساب غير معتمد', 'شحن المحفظة متاح بعد اعتماد حسابك من الإدارة.'); return; }
    if (!Number.isInteger(amount) || amount < 10 || amount > 10000 || !/^01[0125][0-9]{8}$/.test(phone) || !topup.method || String(topup.reference || '').trim().length > 50) { Alert.alert('بيانات غير صحيحة', 'اكتب مبلغًا من 10 إلى 10000 جنيه ورقم محوّل صحيحًا واختار نوع المحفظة.'); return; }
    const fingerprint = JSON.stringify({ phone, amount, reference, method: topup.method });
    const accountKey = String(session?.user?.phone || session?.user?._id || session?.user?.id || 'account').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'account';
    const pendingKeyStorage = 'sonaa.fanni.topup.pending.v1.' + accountKey;
    let idempotencyKey = '';
    try {
      const rawPending = await SecureStore.getItemAsync(pendingKeyStorage);
      const pending = rawPending ? JSON.parse(rawPending) : null;
      if (pending?.fingerprint === fingerprint && typeof pending.key === 'string' && pending.key) {
        idempotencyKey = pending.key;
      }
    } catch (_) {}
    if (!idempotencyKey) {
      idempotencyKey = 'fanni-topup-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      try {
        await SecureStore.setItemAsync(pendingKeyStorage, JSON.stringify({ fingerprint, key: idempotencyKey }));
      } catch (error) {
        Alert.alert('تعذر تجهيز طلب الشحن', 'تعذر حفظ مفتاح حماية الطلب. حاول مرة أخرى.');
        return;
      }
    }
    try {
      const result = await api('/fanni/wallet/topup', { method: 'POST', token: session.token, body: { amount, fromPhone: phone, phone, reference, referenceCode: reference, method: topup.method, idempotencyKey, note: ('تحويل من ' + phone + ' بقيمة ' + amount + ' - كود: ' + (reference || 'بدون')).slice(0, 200) } });
      try { await SecureStore.deleteItemAsync(pendingKeyStorage); } catch (_) {}
      Alert.alert('تم إرسال طلب الشحن', result.message || 'طلبك قيد مراجعة الإدارة.');
      setTopup({ amount: '', fromPhone: '', reference: '', method: 'vodafone_cash' });
      setReloadKey(value => value + 1);
    } catch (err) { Alert.alert('تعذر إرسال الشحن', err.message || 'حاول مرة أخرى.'); }
  }

  async function loadSupportCases() {
    if (!session || !['client', 'fanni'].includes(session.role)) return;
    setSupportLoading(true); setSupportError('');
    try {
      const result = await api('/support/' + session.role, { token: session.token });
      setSupportCases(toList(result, ['supportCases', 'items']));
    } catch (err) { setSupportError(err.message || 'تعذر تحميل محادثات الدعم'); }
    finally { setSupportLoading(false); }
  }

  async function startSupportCase() {
    const text = supportDraft.trim();
    if (!text) { Alert.alert('رسالة فارغة', 'اكتب المشكلة أو الاستفسار الأول.'); return; }
    setSupportLoading(true); setSupportError('');
    try {
      const result = await api('/support/' + session.role, { method: 'POST', token: session.token, body: { subject: supportSubject.trim() || 'استفسار عام', text } });
      const item = result.supportCase;
      setSupportDraft('');
      setSupportCase(item);
      setSupportCases(current => [item, ...current.filter(x => String(x._id) !== String(item._id))]);
      Alert.alert('تم فتح محادثة الدعم', 'رسالتك محفوظة داخل صُنّاع. لو احتاجت تدخلًا بشريًا، اضغط «طلب تدخل الدعم».');
    } catch (err) { setSupportError(err.message || 'تعذر إرسال الرسالة'); }
    finally { setSupportLoading(false); }
  }

  async function openSupportCase(item) {
    setSupportCase(item);
    setSupportLoading(true); setSupportError('');
    try {
      const result = await api('/support/' + session.role + '/' + encodeURIComponent(item._id), { token: session.token });
      setSupportCase(result.supportCase || item);
    } catch (err) { setSupportError(err.message || 'تعذر فتح المحادثة'); }
    finally { setSupportLoading(false); }
  }

  async function sendSupportMessage(needsHuman = false) {
    const text = supportDraft.trim() || (needsHuman ? 'أحتاج تدخل موظف الدعم.' : '');
    if (!supportCase?._id) return startSupportCase();
    if (!text) { Alert.alert('رسالة فارغة', 'اكتب رسالتك أولًا.'); return; }
    setSupportLoading(true); setSupportError('');
    try {
      const result = await api('/support/' + session.role + '/' + encodeURIComponent(supportCase._id) + '/messages', {
        method: 'POST', token: session.token, body: { text, needsHuman }
      });
      const item = result.supportCase;
      setSupportCase(item);
      setSupportCases(current => [item, ...current.filter(x => String(x._id) !== String(item._id))]);
      setSupportDraft('');
      if (needsHuman) Alert.alert('تم طلب تدخل الدعم', 'تم وضع المحادثة في قائمة الحالات التي تحتاج تدخل الإدارة.');
    } catch (err) { setSupportError(err.message || 'تعذر إرسال الرسالة'); }
    finally { setSupportLoading(false); }
  }

  function beginProfileEdit() {
    const user = session?.role === 'fanni' ? (techData.profile || session.user || {}) : (session?.user || {});
    setProfileEditForm({ name: String(user.name || ''), phone: String(user.phone || ''), areas: Array.isArray(user.areas) ? user.areas.filter(area => !isReservedAreaLabel(area) && (!areas.length || areas.includes(area))) : [], specialties: Array.isArray(user.specialties) ? [...user.specialties] : [], loading: false, error: '', message: user.pendingProfileChange?.requestedAt ? 'لديك طلب تعديل بيانات قيد مراجعة الإدارة.' : '' });
    setProfileEditOpenCategory(''); setScreen('profileEdit');
  }
  function toggleProfileEditSpecialty(specialty) {
    setProfileEditForm(current => {
      if (current.specialties.includes(specialty)) return { ...current, specialties: current.specialties.filter(item => item !== specialty), error: '' };
      if (current.specialties.length >= 20) return { ...current, error: 'يمكنك اختيار 20 تخصصًا كحد أقصى.' };
      return { ...current, specialties: [...current.specialties, specialty], error: '' };
    });
  }
  async function saveProfileEdits() {
    if (!session || profileEditForm.loading) return;
    const phone = String(profileEditForm.phone || '').replace(/[^0-9]/g, '');
    if (!/^01[0125][0-9]{8}$/.test(phone)) { setProfileEditForm(current => ({ ...current, error: 'رقم الهاتف لازم يكون 11 رقمًا ويبدأ بـ 01.' })); return; }
    if (session.role === 'client') {
      const name = String(profileEditForm.name || '').trim();
      if (name.length < 2 || name.length > 50) { setProfileEditForm(current => ({ ...current, error: 'اكتب الاسم بشكل صحيح (من حرفين إلى 50 حرفًا).' })); return; }
      setProfileEditForm(current => ({ ...current, loading: true, error: '', message: '' }));
      try { const result = await api('/client/me', { method: 'PATCH', token: session.token, body: { name, phone } }); const nextSession = { ...session, user: { ...session.user, ...(result.client || { name, phone }) } }; await SecureStore.setItemAsync('sonaa.auth.session.v1', JSON.stringify(nextSession)); setSession(nextSession); setProfileEditForm(current => ({ ...current, loading: false, error: '', message: result.message || 'تم تحديث بيانات حسابك بنجاح.' })); }
      catch (error) { setProfileEditForm(current => ({ ...current, loading: false, error: error.message || 'تعذر حفظ البيانات.' })); }
      return;
    }
    if (session.role !== 'fanni') return;
    if (session.user?.pendingProfileChange?.requestedAt || techData.profile?.pendingProfileChange?.requestedAt) { setProfileEditForm(current => ({ ...current, error: 'لديك طلب تعديل بيانات قيد مراجعة الإدارة. انتظر القرار قبل إرسال طلب جديد.' })); return; }
    const specialties = [...new Set(profileEditForm.specialties.map(value => String(value).trim()).filter(Boolean))];
    const selectedAreas = [...new Set((Array.isArray(profileEditForm.areas) ? profileEditForm.areas : []).map(value => String(value).trim()).filter(value => areas.includes(value) && !isReservedAreaLabel(value)))];
    if (!selectedAreas.length || selectedAreas.length > 30 || selectedAreas.some(area => area.length > 60)) { setProfileEditForm(current => ({ ...current, error: 'اختار منطقة عمل واحدة على الأقل من القائمة المعتمدة، وبحد أقصى 30 منطقة.' })); return; }
    setProfileEditForm(current => ({ ...current, loading: true, error: '', message: '' }));
    try { const result = await api('/fanni/me', { method: 'PATCH', token: session.token, body: { phone, specialties, areas: selectedAreas } }); const updatedUser = result.user || { ...session.user, pendingProfileChange: result.pendingProfileChange }; const nextSession = { ...session, user: { ...session.user, ...updatedUser, pendingProfileChange: result.pendingProfileChange || updatedUser.pendingProfileChange } }; await SecureStore.setItemAsync('sonaa.auth.session.v1', JSON.stringify(nextSession)); setSession(nextSession); setTechData(current => ({ ...current, profile: { ...(current.profile || session.user), ...updatedUser, pendingProfileChange: result.pendingProfileChange || updatedUser.pendingProfileChange } })); setProfileEditForm(current => ({ ...current, loading: false, error: '', message: result.message || 'تم إرسال طلب تعديل بياناتك للإدارة للمراجعة.' })); }
    catch (error) { setProfileEditForm(current => ({ ...current, loading: false, error: error.message || 'تعذر إرسال طلب تعديل البيانات.' })); }
  }
  function promptSavedPasswordUpdate(role, phone, newPassword, successMessage) {
    const normalizedPhone = normalizePhoneDigits(phone);
    if (!['client', 'fanni'].includes(role) || !normalizedPhone || !newPassword) return;
    const savedPasswordKey = `sonaa.auth.password.v1.${role}.${normalizedPhone}`;
    Alert.alert('تحديث كلمة المرور المحفوظة', `${successMessage}\n\nتحب نحدّث كلمة المرور المحفوظة في الذاكرة علشان تستخدمها في تسجيل الدخول القادم؟`, [
      {
        text: 'لا، شكرًا',
        style: 'cancel',
        onPress: async () => {
          try { await SecureStore.deleteItemAsync(savedPasswordKey); } catch (_) {}
        }
      },
      {
        text: 'نعم، حدّثها',
        onPress: async () => {
          try { await SecureStore.setItemAsync(savedPasswordKey, newPassword); }
          catch (_) { Alert.alert('تعذر التحديث', 'ما قدرناش نحدّث كلمة المرور المحفوظة على الجهاز.'); }
        }
      }
    ]);
  }

  async function changeAccountPassword() {
    if (!session) return;
    const currentPassword = accountPasswordForm.currentPassword;
    const newPassword = accountPasswordForm.newPassword;
    const confirmPassword = accountPasswordForm.confirmPassword;
    if ((!passwordChangeRequired && !currentPassword) || newPassword.length < 8 || newPassword !== confirmPassword) {
      setAccountPasswordForm(v => ({ ...v, error: 'كلمة المرور الجديدة 8 أحرف على الأقل ويجب أن يتطابق التأكيد.' }));
      return;
    }
    setAccountPasswordForm(v => ({ ...v, loading: true, error: '' }));
    try {
      const role = session.role === 'client' ? 'client' : 'fanni';
      const result = await api('/password-recovery/change/' + role, { method: 'POST', token: session.token, body: { ...(passwordChangeRequired ? {} : { currentPassword }), newPassword, confirmPassword } });
      setAccountPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '', loading: false, error: '' });
      if (passwordChangeRequired) {
        const nextSession = { ...session, mustChangePassword: false };
        await SecureStore.setItemAsync('sonaa.auth.session.v1', JSON.stringify(nextSession));
        setSession(nextSession);
        setPasswordChangeRequired(false);
        setScreen(session.role === 'client' ? 'client' : 'technician');
      }
      promptSavedPasswordUpdate(role, session.user?.phone, newPassword, result.message || 'تم تغيير كلمة المرور بنجاح.');
    } catch (err) {
      setAccountPasswordForm(v => ({ ...v, loading: false, error: err.message || 'تعذر تغيير كلمة المرور.' }));
    }
  }

  async function startPasswordRecovery() {
    const phone = recoveryForm.phone.replace(/[^0-9]/g, '');
    if (!/^01[0125][0-9]{8}$/.test(phone)) { setRecoveryForm(v => ({ ...v, error: 'اكتب رقم الهاتف المسجل بالحساب بشكل صحيح.' })); return; }
    setRecoveryForm(v => ({ ...v, loading: true, error: '', info: '' }));
    try {
      const result = await api('/password-recovery/request', { method: 'POST', body: { role: recoveryForm.role, phone } });
      setRecoveryForm(v => ({ ...v, phone, token: result.recoveryToken, id: result.requestId, info: result.message, loading: false }));
    } catch (err) { setRecoveryForm(v => ({ ...v, loading: false, error: err.message || 'تعذر فتح طلب الدعم.' })); }
  }

  async function refreshPasswordRecovery() {
    if (!recoveryForm.id || !recoveryForm.token) return;
    try {
      const result = await api('/password-recovery/request/' + encodeURIComponent(recoveryForm.id), { headers: { 'X-Recovery-Token': recoveryForm.token } });
      setRecoveryForm(v => ({ ...v, messages: result.recovery?.messages || v.messages, info: result.recovery?.status ? 'حالة الطلب: ' + result.recovery.status : v.info }));
    } catch (_) {}
  }

  async function sendRecoveryMessage() {
    const text = recoveryForm.text.trim();
    if (!text) return;
    setRecoveryForm(v => ({ ...v, loading: true, error: '' }));
    try {
      const result = await api('/password-recovery/request/' + encodeURIComponent(recoveryForm.id) + '/messages', { method: 'POST', headers: { 'X-Recovery-Token': recoveryForm.token }, body: { text } });
      setRecoveryForm(v => ({ ...v, text: '', messages: result.recovery?.messages || v.messages, loading: false }));
      await refreshPasswordRecovery();
    } catch (err) { setRecoveryForm(v => ({ ...v, loading: false, error: err.message || 'تعذر إرسال الرسالة.' })); }
  }

  async function verifyRecoveryCode() {
    setRecoveryForm(v => ({ ...v, loading: true, error: '' }));
    try {
      const result = await api('/password-recovery/request/' + encodeURIComponent(recoveryForm.id) + '/verify-code', { method: 'POST', headers: { 'X-Recovery-Token': recoveryForm.token }, body: { code: recoveryForm.code } });
      setRecoveryForm(v => ({ ...v, loading: false, info: result.message || 'تم التحقق من الرمز.' }));
    } catch (err) { setRecoveryForm(v => ({ ...v, loading: false, error: err.message || 'رمز التحقق غير صحيح.' })); }
  }

  async function resetRecoveredPassword() {
    if (recoveryForm.newPassword.length < 8 || recoveryForm.newPassword !== recoveryForm.confirmPassword) { setRecoveryForm(v => ({ ...v, error: 'كلمة المرور الجديدة 8 أحرف على الأقل ويجب أن يتطابق التأكيد.' })); return; }
    setRecoveryForm(v => ({ ...v, loading: true, error: '' }));
    try {
      const result = await api('/password-recovery/request/' + encodeURIComponent(recoveryForm.id) + '/reset-password', { method: 'POST', headers: { 'X-Recovery-Token': recoveryForm.token }, body: { newPassword: recoveryForm.newPassword, confirmPassword: recoveryForm.confirmPassword } });
      promptSavedPasswordUpdate(recoveryForm.role, recoveryForm.phone, recoveryForm.newPassword, result.message || 'تم تغيير كلمة المرور بنجاح.');
      setRecoveryForm({ role: 'client', phone: '', token: '', id: '', messages: [], text: '', code: '', newPassword: '', confirmPassword: '', loading: false, error: '', info: '' });
      setScreen('login');
    } catch (err) { setRecoveryForm(v => ({ ...v, loading: false, error: err.message || 'تعذر تغيير كلمة المرور.' })); }
  }

  useEffect(() => {
    if (screen !== 'passwordRecovery' || !recoveryForm.id || !recoveryForm.token) return;
    const timer = setInterval(refreshPasswordRecovery, 3000);
    return () => clearInterval(timer);
  }, [screen, recoveryForm.id, recoveryForm.token]);

  async function copyOrderCode(code) {
    try { await Clipboard.setStringAsync(String(code || '')); Alert.alert('تم النسخ', 'تم نسخ كود الطلب.'); }
    catch { Alert.alert('تعذر النسخ', 'اضغط مطولًا على الكود لنسخه يدويًا.'); }
  }

  function openWhatsAppSupport() {
    setSupportCase(null);
    setSupportDraft('');
    setSupportError('');
    setScreen('support');
  }

  async function performLogout() {
    const activeSession = session;
    if (activeSession && ['client', 'fanni'].includes(activeSession.role)) {
      try {
        await api('/' + activeSession.role + '/logout', {
          method: 'POST', token: activeSession.token, timeoutMs: 5000
        });
      } catch (_) {}
    }
    const pushToken = pushTokenRef.current;
    if (activeSession && pushToken && ['client', 'fanni'].includes(activeSession.role)) {
      try {
        await api('/notifications/' + activeSession.role + '/push-token', {
          method: 'DELETE', token: activeSession.token, body: { token: pushToken }
        });
      } catch (_) {}
    }
    pushTokenRef.current = null;
    try { await SecureStore.deleteItemAsync('sonaa.auth.session.v1'); }
    catch (error) { console.warn('تعذر مسح الجلسة المحفوظة:', error?.message || error); }
    screenHistoryRef.current = [];
    screenRef.current = 'home';
    setScreenState('home');
    setSession(null); setPasswordChangeRequired(false); setUsername(''); setPassword('');
    setClientData({ orders: [], loading: false, error: '', sn: '', clientToken: '' });
    setTechData({ profile: null, orders: [], offers: [], wallet: [], loading: false, error: '', tab: 'home' });
    setNotifications({ items: [], unread: 0, loading: false, error: '' });
  }

  function logout() {
    Alert.alert('تأكيد تسجيل الخروج', 'هل تريد تسجيل الخروج من حسابك والعودة إلى الصفحة الرئيسية؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'نعم', style: 'destructive', onPress: () => { void performLogout(); } }
    ]);
  }

  const goLogin = async mode => {
    setAuthMode(mode);
    setPassword('');
    let lastPhone = '';
    try { lastPhone = await SecureStore.getItemAsync(`sonaa.auth.lastPhone.v1.${mode}`) || ''; } catch (_) {}
    setUsername(lastPhone);
    setScreen('login');
    if (lastPhone) {
      try {
        const savedPassword = await SecureStore.getItemAsync(`sonaa.auth.password.v1.${mode}.${normalizePhoneDigits(lastPhone)}`);
        if (savedPassword) setPassword(savedPassword);
      } catch (_) {}
    }
  };
  const toggleArray = (key, value) => updateForm(key, form[key].includes(value) ? form[key].filter(item => item !== value) : [...form[key], value]);

  const screenContext = { screen, setScreenState, screenHistoryRef, screenRef, pushTokenRef, setScreen, categories, setCategories, areas, setAreas, areaTechnicianCounts, setAreaTechnicianCounts, selected, setSelected, servicesLoading, setServicesLoading, servicesError, setServicesError, reloadKey, setReloadKey, session, setSession, authRestoring, setAuthRestoring, username, setUsername, password, setPassword, loginLoading, setLoginLoading, authMode, setAuthMode, form, setForm, registrationNameRef, registrationPhoneRef, registrationPasswordRef, registrationConfirmPasswordRef, clientAreaInputRef, clientAddressInputRef, clientDescriptionInputRef, clientBudgetInputRef, clientServiceDetailYRef, clientFormYRef, clientData, setClientData, techData, setTechData, walletTransferNumbers, setWalletTransferNumbers, assignedDetails, setAssignedDetails, technicianSearch, setTechnicianSearch, technicianServiceFilter, setTechnicianServiceFilter, guidelinesChecked, setGuidelinesChecked, guidelinesReachedEnd, setGuidelinesReachedEnd, guidelinesViewportHeight, setGuidelinesViewportHeight, topup, setTopup, clientTab, setClientTab, clientServiceSearch, setClientServiceSearch, servicePickerOpen, setServicePickerOpen, subservicePickerOpen, setSubservicePickerOpen, ratingPrompt, setRatingPrompt, dismissedRatings, setDismissedRatings, ratingDismissalsLoaded, setRatingDismissalsLoaded, ratingDismissalsLoadedFor, setRatingDismissalsLoadedFor, clientTrackSN, setClientTrackSN, clientTrackedOrder, setClientTrackedOrder, clientTrackError, setClientTrackError, clientTrackLoading, setClientTrackLoading, clientComplaint, setClientComplaint, clientComplaintTrack, setClientComplaintTrack, expandedClientOrders, setExpandedClientOrders, expandedTechnicianOrders, setExpandedTechnicianOrders, notificationsOpen, setNotificationsOpen, clientScrollRef, chatScrollRef, clientChatScrollRefs, clientChatAtBottomRef, ratingSubmittingRef, offerDraft, setOfferDraft, notifications, setNotifications, orderChats, setOrderChats, orderChatsRef, acceptedChatAutoOpenedRef, chatDrafts, setChatDrafts, priceDrafts, setPriceDrafts, ratingDrafts, setRatingDrafts, ratingSubmitting, setRatingSubmitting, dismissedRatingsRef, ratingHandledRef, ratingStatusSnapshotRef, supportCases, setSupportCases, supportCase, setSupportCase, supportDraft, setSupportDraft, supportSubject, setSupportSubject, supportLoading, setSupportLoading, supportError, setSupportError, accountPasswordForm, setAccountPasswordForm, profileEditForm, setProfileEditForm, profileEditOpenCategory, setProfileEditOpenCategory, recoveryForm, setRecoveryForm, services, updateForm, ratingAccountId, ratingStorageKey, previousRatingStorageKey, legacyRatingStorageKey, oldestRatingStorageKey, markNotificationRead, markAllNotificationsRead, handleLogin, registerClient, registerTechnician, createOrder, trackClientOrder, submitClientComplaint, trackClientComplaints, sendOffer, submitOffer, cancelClientOrder, acceptClientOffer, completeTechnicianOrder, getOrderSN, uniqueByOrderSN, orderToken, refreshVisibleData, refreshOrderChat, toggleOrderChat, sendOrderChat, requestOrderPriceChange, decideOrderPrice, setOrderRatingStars, renderRatingStars, submitOrderRating, saveRatingDismissal, renderRatingModal, acceptTechnicianGuidelines, submitTopup, loadSupportCases, startSupportCase, openSupportCase, sendSupportMessage, beginProfileEdit, toggleProfileEditSpecialty, saveProfileEdits, changeAccountPassword, startPasswordRecovery, refreshPasswordRecovery, sendRecoveryMessage, verifyRecoveryCode, resetRecoveredPassword, copyOrderCode, openWhatsAppSupport, performLogout, logout, goLogin, toggleArray };

  if (authRestoring) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color={COLORS.blue} /><Text style={styles.statusText}>جاري استعادة حسابك...</Text></View></SafeAreaView>;

  if (screen === 'login') return <LoginScreen authMode={authMode} username={username} setUsername={setUsername} password={password} setPassword={setPassword} handleLogin={handleLogin} loginLoading={loginLoading} setRecoveryForm={setRecoveryForm} setScreen={setScreen} />;

  if (screen === 'account') return <AccountScreen session={session} clientData={clientData} techData={techData} setScreen={setScreen} beginProfileEdit={beginProfileEdit} setRatingPrompt={setRatingPrompt} getOrderSN={getOrderSN} onOpenStore={() => { setClientTab('store'); setScreen('client'); }} />;

  if (screen === 'profileEdit') return <ProfileEditScreen session={session} techData={techData} categories={categories} profileEditForm={profileEditForm} setProfileEditForm={setProfileEditForm} areas={areas} profileEditOpenCategory={profileEditOpenCategory} setProfileEditOpenCategory={setProfileEditOpenCategory} toggleProfileEditSpecialty={toggleProfileEditSpecialty} saveProfileEdits={saveProfileEdits} setScreen={setScreen} />;

  if (screen === 'changePassword') return <ChangePasswordScreen accountPasswordForm={accountPasswordForm} setAccountPasswordForm={setAccountPasswordForm} changeAccountPassword={changeAccountPassword} setScreen={setScreen} required={passwordChangeRequired} />;

  if (screen === 'passwordRecovery') return <PasswordRecoveryScreen recoveryForm={recoveryForm} setRecoveryForm={setRecoveryForm} setScreen={setScreen} startPasswordRecovery={startPasswordRecovery} dateLabel={dateLabel} sendRecoveryMessage={sendRecoveryMessage} verifyRecoveryCode={verifyRecoveryCode} resetRecoveredPassword={resetRecoveredPassword} refreshPasswordRecovery={refreshPasswordRecovery} />;

  if (screen === 'clientRegister' || screen === 'technicianRegister') {
    const isClient = screen === 'clientRegister';
    return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.page}>
      <Button title="‹ رجوع" secondary onPress={() => {
        if (!isClient) { setGuidelinesChecked(false); setGuidelinesReachedEnd(false); setGuidelinesViewportHeight(0); }
        setScreen('home');
      }} />
      <Text style={styles.title}>{isClient ? 'إنشاء حساب عميل' : 'تسجيل فني جديد'}</Text>
      <Field label="الاسم" value={form.name} onChangeText={v => updateForm('name', v)} autoCapitalize="words"
        inputRef={registrationNameRef} returnKeyType="next" returnKeyLabel="التالي"
        onSubmitEditing={() => registrationPhoneRef.current?.focus()} blurOnSubmit={false} />
      <Field label="رقم الهاتف" value={form.phone} onChangeText={v => updateForm('phone', v)} keyboardType="phone-pad"
        inputRef={registrationPhoneRef} returnKeyType="next" returnKeyLabel="التالي"
        onSubmitEditing={() => registrationPasswordRef.current?.focus()} blurOnSubmit={false} />
      <Field label="كود الدعوة (اختياري)" value={form.referralCode || ''} onChangeText={v => updateForm('referralCode', v.trim().slice(0, 50))} autoCapitalize="characters" placeholder="اكتب كود الدعوة لو معاك" />
      <Field label="كلمة السر" value={form.password} onChangeText={v => updateForm('password', v)} secureTextEntry
        inputRef={registrationPasswordRef} returnKeyType="next" returnKeyLabel="التالي"
        onSubmitEditing={() => registrationConfirmPasswordRef.current?.focus()} blurOnSubmit={false} />
      <Field label="تأكيد كلمة السر" value={form.confirmPassword} onChangeText={v => updateForm('confirmPassword', v)} secureTextEntry
        inputRef={registrationConfirmPasswordRef} returnKeyType="go" returnKeyLabel="تسجيل"
        onSubmitEditing={isClient ? registerClient : registerTechnician} blurOnSubmit />
      {!isClient && <>
        <Text style={styles.sectionTitle}>اختار الخدمات اللي بتقدمها</Text>
        {servicesLoading && categories.length === 0 ? <View style={{ paddingVertical: 14, alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.navy} />
          <Text style={[styles.detail, { textAlign: 'center' }]}>جاري تحميل الخدمات...</Text>
        </View> : null}
        {!servicesLoading && servicesError && categories.length === 0 ? <View style={{ backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: COLORS.dangerBorder, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <Text style={[styles.errorText, { textAlign: 'center' }]}>تعذر تحميل الخدمات. تحقق من اتصال الإنترنت ثم أعد المحاولة.</Text>
          <TouchableOpacity onPress={() => setReloadKey(value => value + 1)} disabled={servicesLoading}
            style={{ alignSelf: 'center', backgroundColor: COLORS.navy, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 6 }}>
            <Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 13 }}>إعادة تحميل الخدمات</Text>
          </TouchableOpacity>
        </View> : null}
        {categories.map(category => <View key={category.label} style={styles.selectionGroup}>
          <TouchableOpacity onPress={() => setSelected(current => current?.label === category.label ? null : category)} style={styles.categoryToggle}><Text style={styles.groupTitle}>{category.emoji || '🛠️'} {category.label} · {(category.services || []).length} {selected?.label === category.label ? '▲' : '▼'}</Text></TouchableOpacity>
          {selected?.label === category.label ? (category.services || []).map(service => <TouchableOpacity key={service} onPress={() => toggleArray('specialties', service)} style={styles.choiceRow}><Text style={styles.choiceText}>{form.specialties.includes(service) ? '☑' : '□'} {service}</Text></TouchableOpacity>) : null}
        </View>)}

        <AreaPicker label="مناطق العمل *" options={areas} multiple value={form.areas} onChange={value => updateForm('areas', value)} maxSelections={30} />
        <Text style={styles.detail}>اختار المناطق التي تستطيع العمل فيها من القائمة المعتمدة. يمكنك اختيار حتى 30 منطقة.</Text>

        <Field label="الرقم القومي المصري (14 رقمًا) *" value={form.nationalId || ''} onChangeText={v => updateForm('nationalId', normalizePhoneDigits(v).slice(0, 14))} keyboardType="number-pad" maxLength={14} placeholder="اكتب الرقم القومي كما هو بالبطاقة" />
        <View style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1, borderRadius: 16, padding: 12, marginTop: 12, gap: 10 }}>
          <View>
            <Text style={{ color: '#0F172A', fontSize: 14, fontWeight: '900', textAlign: 'right' }}>صورة بطاقة الرقم القومي *</Text>
            <Text style={{ color: '#475569', fontSize: 11, lineHeight: 19, textAlign: 'right', marginTop: 4 }}>ارفع صورة واضحة للوجه الأمامي والخلفي. الصورتان مطلوبتان ولن يتم إنشاء الحساب بدونهما، وسيتم حفظهما بشكل خاص لمراجعة الإدارة.</Text>
          </View>
          {[{ side: 'front', label: 'الوجه الأمامي' }, { side: 'back', label: 'الوجه الخلفي' }].map(({ side, label }) => {
            const upload = identityCardUploads[side];
            return <View key={side} style={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 12, padding: 10, gap: 9 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#1E293B', fontSize: 12, fontWeight: '900' }}>{label}</Text>
                <Text style={{ color: upload.fileId ? '#047857' : upload.uploading ? '#1D4ED8' : '#DC2626', fontSize: 10, fontWeight: '900' }}>{upload.fileId ? 'تم الرفع ✓' : upload.uploading ? 'جاري الرفع...' : 'مطلوب'}</Text>
              </View>
              {upload.previewUri ? <Image source={{ uri: upload.previewUri }} resizeMode="contain" style={{ width: '100%', height: 150, backgroundColor: '#F8FAFC', borderRadius: 9 }} /> : null}
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                <TouchableOpacity disabled={upload.uploading || loginLoading} onPress={() => pickTechnicianIdentityImage(side, 'gallery')} style={{ flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ color: '#1E40AF', fontSize: 11, fontWeight: '900', textAlign: 'center' }}>{upload.fileId ? 'اختيار من المعرض مرة أخرى' : 'اختيار من المعرض'}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={upload.uploading || loginLoading} onPress={() => pickTechnicianIdentityImage(side, 'camera')} style={{ flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE', backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ color: '#102A9B', fontSize: 11, fontWeight: '900', textAlign: 'center' }}>📷 التقاط بالكاميرا</Text>
                </TouchableOpacity>
              </View>
              {upload.previewUri ? <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                <TouchableOpacity onPress={() => setIdentityPreviewUri(upload.previewUri)} style={{ flex: 1, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#1E293B', fontSize: 11, fontWeight: '800' }}>معاينة الصورة</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={upload.uploading} onPress={() => clearTechnicianIdentityImage(side)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#B91C1C', fontSize: 11, fontWeight: '800' }}>إزالة</Text>
                </TouchableOpacity>
              </View> : null}
              <Text style={{ color: upload.fileId ? '#047857' : upload.uploading ? '#1D4ED8' : '#475569', fontSize: 10, fontWeight: '800', textAlign: 'right' }}>{upload.status || (upload.fileId ? 'تم رفع الصورة بنجاح.' : 'لم يتم رفع الصورة بعد.')}</Text>
            </View>;
          })}
          <View style={{ backgroundColor: '#FFFFFF', borderColor: '#C7D2FE', borderWidth: 1, borderRadius: 12, padding: 10, gap: 9 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#1E293B', fontSize: 12, fontWeight: '900' }}>الصورة الشخصية للفني *</Text>
            <Text style={{ color: identityCardUploads.profile.fileId ? '#047857' : identityCardUploads.profile.uploading ? '#1D4ED8' : '#DC2626', fontSize: 10, fontWeight: '900' }}>{identityCardUploads.profile.fileId ? 'تم الرفع ✓' : identityCardUploads.profile.uploading ? 'جاري الرفع...' : 'مطلوبة'}</Text>
          </View>
          <Text style={{ color: '#475569', fontSize: 11, lineHeight: 19, textAlign: 'right' }}>التقط صورة واضحة لوجهك بالكاميرا. ستظهر صورتك للعملاء بجوار عروضك بدل الحرف الأول من اسمك.</Text>
          {identityCardUploads.profile.previewUri ? <Image source={{ uri: identityCardUploads.profile.previewUri }} resizeMode="cover" style={{ width: 116, height: 116, alignSelf: 'center', borderRadius: 58, backgroundColor: '#F8FAFC' }} /> : null}
          <TouchableOpacity disabled={identityCardUploads.profile.uploading || loginLoading} onPress={() => pickTechnicianIdentityImage('profile', 'camera')} style={{ minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE', backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#102A9B', fontSize: 12, fontWeight: '900' }}>📷 {identityCardUploads.profile.fileId ? 'التقاط صورة شخصية جديدة' : 'التقاط صورة بالكاميرا'}</Text>
          </TouchableOpacity>
          {identityCardUploads.profile.previewUri ? <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <TouchableOpacity onPress={() => setIdentityPreviewUri(identityCardUploads.profile.previewUri)} style={{ flex: 1, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#1E293B', fontSize: 11, fontWeight: '800' }}>معاينة الصورة</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={identityCardUploads.profile.uploading} onPress={() => clearTechnicianIdentityImage('profile')} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#B91C1C', fontSize: 11, fontWeight: '800' }}>إزالة</Text>
            </TouchableOpacity>
          </View> : null}
          <Text style={{ color: identityCardUploads.profile.fileId ? '#047857' : identityCardUploads.profile.uploading ? '#1D4ED8' : '#475569', fontSize: 10, fontWeight: '800', textAlign: 'right' }}>{identityCardUploads.profile.status || 'لم يتم التقاط الصورة الشخصية بعد.'}</Text>
        </View>
        <Text style={{ color: '#64748B', fontSize: 10, lineHeight: 18, textAlign: 'right' }}>الصيغ المقبولة: JPG وPNG وWebP — الحد الأقصى 15 ميجابايت لكل صورة.</Text>
        </View>

        <Text style={styles.sectionTitle}>ميثاق صُنّاع – التعامل المهني مع العملاء</Text>
        <Text style={styles.detail}>اقرأ الميثاق كاملًا. لن تتمكن من الموافقة أو إرسال طلب التسجيل قبل الوصول إلى نهاية النص.</Text>
        <View style={{ height: 240, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, overflow: 'hidden', backgroundColor: COLORS.white }}>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator
            onLayout={event => setGuidelinesViewportHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={(width, height) => {
              if (guidelinesViewportHeight && height <= guidelinesViewportHeight + 8) setGuidelinesReachedEnd(true);
            }}
            onScroll={event => {
              const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 18) setGuidelinesReachedEnd(true);
            }}
            scrollEventThrottle={16}
            contentContainerStyle={{ padding: 14, gap: 12 }}
          >
            <Text style={styles.detail}>١. التزم بسعر العرض الذي وافق عليه العميل. أي زيادة تحتاج موافقة صريحة مسجلة داخل المنصة قبل التنفيذ.</Text>
            <Text style={styles.detail}>٢. تعامل باحترام وصدق، دون ضغط أو تهديد أو تضليل.</Text>
            <Text style={styles.detail}>٣. قبل قبول العرض، الردود المسموحة «نعم»، «لا»، «حسب الاتفاق». ممنوع تبادل بيانات الاتصال أو التحايل على المنصة قبل القبول.</Text>
            <Text style={styles.detail}>٤. لا تضغط إنهاء المهمة إلا بعد إنجازها فعلًا.</Text>
            <Text style={styles.detail}>٥. احمِ بيانات العميل ولا تستخدمها خارج الطلب.</Text>
            <Text style={styles.detail}>٦. يحق للطرفين التقييم بعد الإكمال؛ ممنوع الإكراه على تقييم إيجابي أو التلاعب بالتقييمات.</Text>
            <Text style={styles.detail}>٧. المخالفات قد تؤدي إلى مراجعة الطلب أو تعليق الحساب أو إيقافه.</Text>
            <Text style={styles.detail}>بالضغط على الموافقة، تؤكد أنك قرأت التعليمات وفهمتها وتتعهد بالالتزام بها أثناء استخدام منصة صُنّاع.</Text>
          </ScrollView>
        </View>
        <TouchableOpacity disabled={!guidelinesReachedEnd} onPress={() => setGuidelinesChecked(value => !value)} activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, opacity: guidelinesReachedEnd ? 1 : 0.45 }}>
          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: guidelinesChecked ? COLORS.navy : COLORS.muted, backgroundColor: guidelinesChecked ? COLORS.navy : COLORS.white, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: COLORS.white, fontWeight: '900' }}>{guidelinesChecked ? '✓' : ''}</Text>
          </View>
          <Text style={[styles.detail, { flex: 1, fontWeight: '800', color: COLORS.text }]}>
            {guidelinesReachedEnd ? 'قرأت ميثاق صُنّاع كاملًا وأوافق على الالتزام به.' : 'مرّر الميثاق حتى نهايته لتفعيل الموافقة.'}
          </Text>
        </TouchableOpacity>
      </>}
      {identityPreviewUri ? <Modal visible transparent animationType="fade" onRequestClose={() => setIdentityPreviewUri('')}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.94)', padding: 16, justifyContent: 'center' }}>
          <TouchableOpacity onPress={() => setIdentityPreviewUri('')} style={{ alignSelf: 'flex-end', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 }}>
            <Text style={{ color: '#111827', fontWeight: '900' }}>إغلاق المعاينة</Text>
          </TouchableOpacity>
          <Image source={{ uri: identityPreviewUri }} resizeMode="contain" style={{ width: '100%', flex: 1 }} />
        </View>
      </Modal> : null}
      <Button title={loginLoading ? 'جاري التسجيل...' : isClient ? 'إنشاء حساب' : 'إرسال طلب التسجيل'}
        onPress={isClient ? registerClient : registerTechnician}
        disabled={loginLoading || (!isClient && (!guidelinesReachedEnd || !guidelinesChecked))}
      />
    </ScrollView></SafeAreaView>;
  }

  if (screen === 'client' && session?.role === 'client') return <ClientDashboard context={screenContext} />;

  if (screen === 'technician' && session?.role === 'fanni') return <TechnicianDashboard context={screenContext} />;

  if (screen === 'support' && session && ['client', 'fanni'].includes(session.role)) return <SupportScreen session={session} screenHistoryRef={screenHistoryRef} screenRef={screenRef} setScreenState={setScreenState} setSupportCase={setSupportCase} supportSubject={supportSubject} setSupportSubject={setSupportSubject} supportDraft={supportDraft} setSupportDraft={setSupportDraft} startSupportCase={startSupportCase} supportCases={supportCases} openSupportCase={openSupportCase} supportCase={supportCase} dateLabel={dateLabel} sendSupportMessage={sendSupportMessage} supportLoading={supportLoading} />;

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.homePage} showsVerticalScrollIndicator={false}>
      <View style={styles.homeBrandArea}>
        <View style={styles.homeLogoCirclePremium}>
          <Image source={require('../../assets/LOGO_UPLOAD_HERE/logo.png')} style={styles.homeLogoImage} resizeMode="contain" />
        </View>
        <Text style={styles.homeBrandTitlePremium}>حمزاوي سات</Text>
        <Text style={styles.homeTaglinePremium}>كُلُّ خِدْمَةٍ تَبْدَأُ بِخُطْوَةٍ</Text>
        <Text style={styles.homeIntroPremium}>تركيب وصيانة وضبط الدش وكاميرات المراقبة والشاشات، بخطوات بسيطة وخدمة موثوقة.</Text>
      </View>
      <View style={styles.roleCardsPremium}>
        <TouchableOpacity activeOpacity={0.88} onPress={() => goLogin('client')} style={[styles.roleCardPremium, styles.clientRoleCardPremium]}>
          <View style={styles.clientIconCirclePremium}><Text style={styles.roleIconPremium}>⌂</Text></View>
          <View style={styles.roleCardCopy}><Text style={styles.roleTitlePremium}>الدخول كعميل</Text><Text style={styles.roleDescriptionPremium}>اطلب تركيب أو صيانة الدش أو الكاميرات أو الشاشات، وتابع عروض الفنيين بسهولة.</Text><View style={styles.roleActionBadge}><Text style={styles.roleActionBadgeText}>اطلب الآن ←</Text></View></View>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.88} onPress={() => goLogin('fanni')} style={[styles.roleCardPremium, styles.technicianRoleCardPremium]}>
          <View style={styles.technicianIconCirclePremium}><Text style={styles.roleIconPremium}>⚒</Text></View>
          <View style={styles.roleCardCopy}><Text style={styles.roleTitlePremium}>الدخول كفني</Text><Text style={styles.roleDescriptionPremium}>استقبل طلبات الدش والكاميرات والشاشات، وقدّم عروضك وتابع شغلك.</Text><View style={[styles.roleActionBadge, {backgroundColor:COLORS.navy}]}><Text style={styles.roleActionBadgeText}>شوف فرص الشغل ←</Text></View></View>
        </TouchableOpacity>
      </View>
      <View style={styles.homeFooterPremium}><View style={styles.homeFooterDot} /><Text style={styles.homeFooterText}>اختار طريقة الدخول وابدأ مع حمزاوي سات</Text></View>
    </ScrollView>
  </SafeAreaView>;
}
export default AppScreens;
