import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import {
  View, Text, Image, FlatList, TouchableOpacity, ActivityIndicator, ScrollView,
  TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, BackHandler, Linking, Modal
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import { api, getApiUrl } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { getOrderChatTimeline, toList, dateLabel, getServiceEmoji } from '../../utils/app-helpers';
import { Button, Field } from '../../components/FormControls';
import AreaPicker from '../../components/AreaPicker';
import VoiceRecorder from '../../components/VoiceRecorder';
import VoicePlayback from '../../components/VoicePlayback';
import StoreScreen, { StoreAdBanner } from '../shared/StoreScreen';
import { matchesAreaSearch } from '../../utils/area-helpers';
import TechnicianWalletScreen from './TechnicianWalletScreen';
import ReferralCard, { ReferralPromo } from '../shared/ReferralCard';
import PublicContentBanner from '../shared/PublicContentBanner';

export function TechnicianDashboard({ context }) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [activeReplyNotificationId, setActiveReplyNotificationId] = useState('');
  const [notificationReplyDraft, setNotificationReplyDraft] = useState('');
  const [notificationReplySubmitting, setNotificationReplySubmitting] = useState(false);
  const [loadingMoreAvailable, setLoadingMoreAvailable] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [reviewDataDraft, setReviewDataDraft] = useState({});
  const [reviewDataOpenCategory, setReviewDataOpenCategory] = useState('');
  const referralScrollRef = useRef(null);
  const [referralPageOpen, setReferralPageOpen] = useState(false);
  useEffect(() => { if (!referralPageOpen) return undefined; const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setReferralPageOpen(false); return true; }); return () => subscription.remove(); }, [referralPageOpen]);
  const { screen, setScreenState, screenHistoryRef, screenRef, pushTokenRef, reviewUploads, pickTechnicianResubmissionImage, submitTechnicianResubmission, setScreen, categories, setCategories, areas, setAreas, selected, setSelected, servicesLoading, setServicesLoading, servicesError, setServicesError, reloadKey, setReloadKey, session, setSession, authRestoring, setAuthRestoring, username, setUsername, password, setPassword, loginLoading, setLoginLoading, authMode, setAuthMode, form, setForm, registrationNameRef, registrationPhoneRef, registrationPasswordRef, registrationConfirmPasswordRef, clientAreaInputRef, clientAddressInputRef, clientDescriptionInputRef, clientBudgetInputRef, clientServiceDetailYRef, clientFormYRef, clientData, setClientData, techData, setTechData, walletTransferNumbers, setWalletTransferNumbers, assignedDetails, setAssignedDetails, technicianSearch, setTechnicianSearch, technicianServiceFilter, setTechnicianServiceFilter, guidelinesChecked, setGuidelinesChecked, guidelinesReachedEnd, setGuidelinesReachedEnd, guidelinesViewportHeight, setGuidelinesViewportHeight, adminData, setAdminData, topup, setTopup, clientTab, setClientTab, clientServiceSearch, setClientServiceSearch, servicePickerOpen, setServicePickerOpen, subservicePickerOpen, setSubservicePickerOpen, ratingPrompt, setRatingPrompt, dismissedRatings, setDismissedRatings, ratingDismissalsLoaded, setRatingDismissalsLoaded, ratingDismissalsLoadedFor, setRatingDismissalsLoadedFor, clientTrackSN, setClientTrackSN, clientTrackedOrder, setClientTrackedOrder, clientTrackError, setClientTrackError, clientTrackLoading, setClientTrackLoading, clientComplaint, setClientComplaint, clientComplaintTrack, setClientComplaintTrack, expandedClientOrders, setExpandedClientOrders, expandedTechnicianOrders, setExpandedTechnicianOrders, notificationsOpen, setNotificationsOpen, clientScrollRef, chatScrollRef, clientChatScrollRefs, clientChatAtBottomRef, ratingSubmittingRef, offerDraft, setOfferDraft, notifications, setNotifications, orderChats, setOrderChats, orderChatsRef, acceptedChatAutoOpenedRef, chatDrafts, setChatDrafts, priceDrafts, setPriceDrafts, ratingDrafts, setRatingDrafts, ratingSubmitting, setRatingSubmitting, dismissedRatingsRef, ratingHandledRef, ratingStatusSnapshotRef, adminUsers, setAdminUsers, adminExtras, setAdminExtras, adminServiceDraft, setAdminServiceDraft, adminServiceEdit, setAdminServiceEdit, adminRegionDraft, setAdminRegionDraft, adminAnnouncementDraft, setAdminAnnouncementDraft, adminFaqDraft, setAdminFaqDraft, adminReportFilters, setAdminReportFilters, adminWallet, setAdminWallet, adminUsersLoading, setAdminUsersLoading, broadcast, setBroadcast, supportCases, setSupportCases, supportCase, setSupportCase, supportDraft, setSupportDraft, supportSubject, setSupportSubject, supportLoading, setSupportLoading, supportError, setSupportError, accountPasswordForm, setAccountPasswordForm, profileEditForm, setProfileEditForm, profileEditOpenCategory, setProfileEditOpenCategory, recoveryForm, setRecoveryForm, adminSupportCases, setAdminSupportCases, adminSupportSelected, setAdminSupportSelected, adminSupportDraft, setAdminSupportDraft, adminRecoveryCases, setAdminRecoveryCases, adminRecoverySelected, setAdminRecoverySelected, adminRecoveryCode, setAdminRecoveryCode, adminRecoveryDraft, setAdminRecoveryDraft, services, updateForm, ratingAccountId, ratingStorageKey, previousRatingStorageKey, legacyRatingStorageKey, oldestRatingStorageKey, markNotificationRead, markAllNotificationsRead, updateProfessionalLevel, changeAdminRoleForFanni, revokeAdminRoleForUser, moderateTechnician, publishOrder, reviewTopup, setComplaintStatus, handleLogin, registerClient, registerTechnician, createOrder, trackClientOrder, submitClientComplaint, trackClientComplaints, sendOffer, submitOffer, cancelClientOrder, acceptClientOffer, completeTechnicianOrder, getOrderSN, uniqueByOrderSN, orderToken, refreshVisibleData, refreshOrderChat, toggleOrderChat, sendOrderChat, requestOrderPriceChange, decideOrderPrice, setOrderRatingStars, renderRatingStars, submitOrderRating, saveRatingDismissal, renderRatingModal, sendAdminBroadcast, acceptTechnicianGuidelines, submitTopup, loadSupportCases, startSupportCase, openSupportCase, sendSupportMessage, loadAdminSupportCases, loadAdminRecoveryCases, openAdminRecovery, issueAdminRecoveryCode, replyAdminRecovery, replyAdminSupport, beginProfileEdit, toggleProfileEditSpecialty, saveProfileEdits, changeAccountPassword, startPasswordRecovery, refreshPasswordRecovery, sendRecoveryMessage, verifyRecoveryCode, resetRecoveredPassword, adminRefreshExtras, adminAddService, adminBeginServiceEdit, adminSaveServiceEdit, adminMoveCategory, adminMoveService, adminToggleService, adminDeleteService, adminSavePricing, adminAddRegion, adminSaveSettings, adminAddFaqDraft, adminSaveContent, adminGenerateReport, adminOrderAction, adminClientAction, adminSetTechnicianLevel, adminLoadWalletTransactions, adminWalletAction, adminLoadAuditLogs, copyOrderCode, openWhatsAppSupport, performLogout, logout, goLogin, toggleArray } = context;
  const openTechnicianNotification = async item => {
    const id = String(item?._id || item?.id || '');
    if (!id) return;
    if (!item.replyEnabled) { markNotificationRead(item); return; }
    if (!item.read && !item.readAt) {
      try {
        await api('/notifications/fanni/' + encodeURIComponent(id) + '/read', { method: 'PATCH', token: session?.token });
        setNotifications(current => ({ ...current, items: current.items.map(n => String(n._id || n.id) === id ? { ...n, read: true, readAt: new Date().toISOString() } : n), unread: Math.max(0, Number(current.unread || 0) - 1) }));
      } catch (error) { Alert.alert('الإشعارات', error.message || 'تعذر تحديث الإشعار.'); return; }
    }
    setActiveReplyNotificationId(id);
    setNotificationReplyDraft(item.reply?.message || '');
  };
  const submitTechnicianNotificationReply = async () => {
    const message = String(notificationReplyDraft || '').trim();
    const item = notificationItems.find(n => String(n._id || n.id) === activeReplyNotificationId);
    if (!item || !item.replyEnabled || item.reply || !message || notificationReplySubmitting) return;
    setNotificationReplySubmitting(true);
    try {
      const result = await api('/notifications/fanni/' + encodeURIComponent(activeReplyNotificationId) + '/reply', { method: 'POST', token: session?.token, body: { message } });
      setNotifications(current => ({ ...current, items: current.items.map(n => String(n._id || n.id) === activeReplyNotificationId ? { ...n, reply: { message, sentAt: result.reply?.sentAt || new Date().toISOString() } } : n) }));
      setNotificationReplyDraft(message);
    } catch (error) { Alert.alert('الإشعارات', error.message || 'تعذر إرسال الرد.'); }
    finally { setNotificationReplySubmitting(false); }
  };
  const technicianOrders = Array.isArray(techData?.orders) ? techData.orders : [];
  const technicianOffers = Array.isArray(techData?.offers) ? techData.offers : [];
  const technicianOrdersPagination = techData?.ordersPagination || null;
  const notificationItems = Array.isArray(notifications?.items) ? notifications.items : [];\n  useEffect(() => {\n    if (!notificationsOpen) { setActiveReplyNotificationId(''); return; }\n    const pending = notificationItems.find(item => item.replyEnabled && !item.reply);\n    if (pending) { setActiveReplyNotificationId(String(pending._id || pending.id)); setNotificationReplyDraft(''); }\n  }, [notificationsOpen, notifications?.items]);
  const user = techData?.profile || session?.user || {};
  const reviewFields = (Array.isArray(user.identityReviewFields) ? user.identityReviewFields : []).filter(field => ['name', 'phone', 'specialties', 'areas'].includes(field));
  const reviewImages = Array.isArray(user.identityReviewImages) && user.identityReviewImages.length
    ? user.identityReviewImages.filter(side => ['profile', 'front', 'back'].includes(side))
    : (user.identityReviewImage === 'both' ? ['front', 'back'] : ['profile', 'front', 'back'].includes(user.identityReviewImage) ? [user.identityReviewImage] : []);
  useEffect(() => {
    setReviewDataDraft({
      name: String(user.name || ''),
      phone: String(user.phone || ''),
      specialties: Array.isArray(user.specialties) ? user.specialties.filter(value => availableServices.includes(value)) : [],
      areas: Array.isArray(user.areas) ? user.areas.filter(value => Array.isArray(areas) && areas.includes(value)) : []
    });
    setReviewDataOpenCategory('');
  }, [user.name, user.phone, JSON.stringify(user.specialties || []), JSON.stringify(user.areas || []), JSON.stringify(categories || []), JSON.stringify(areas || [])]);

  const [profilePhotoUri, setProfilePhotoUri] = useState('');
  useEffect(() => {
    let cancelled = false;
    const path = String(user.profilePhotoUrl || '').trim();
    if (!path) { setProfilePhotoUri(''); return undefined; }
    getApiUrl((path.startsWith('/api/') ? path.slice(4) : path)).then(uri => {
      if (!cancelled) setProfilePhotoUri(uri);
    }).catch(() => { if (!cancelled) setProfilePhotoUri(''); });
    return () => { cancelled = true; };
  }, [user.profilePhotoUrl]);
  const unreadNotificationCount = Number(notifications?.unread || 0);
  const isApproved = String(user.status || '').trim() === 'معتمد';
  const acceptingOrders = user.acceptingOrders !== false;
  const toggleOrderAvailability = async () => {
    if (!session?.token || !isApproved || availabilitySaving) return;
    const nextValue = !acceptingOrders;
    setAvailabilitySaving(true);
    try {
      const result = await api('/fanni/availability', { method: 'PATCH', token: session.token, body: { acceptingOrders: nextValue } });
      setTechData(current => ({ ...current, profile: { ...(current.profile || user), acceptingOrders: result.acceptingOrders !== false }, ...(result.acceptingOrders === false ? { orders: [], ordersPagination: { page: 1, limit: 20, total: 0, pages: 0 } } : {}) }));
      Alert.alert('حالة استقبال الطلبات', result.message || 'تم تحديث الحالة.');
      setReloadKey(value => value + 1);
    } catch (error) {
      Alert.alert('تعذر تغيير الحالة', error.message || 'حاول مرة أخرى.');
    } finally { setAvailabilitySaving(false); }
  };
    const tab = techData.tab;
    const isRejectedOffer = item => {
      const status = String(item.orderStatus || item.status || '').trim();
      return ['مرفوض', 'تم الرفض', 'تم رفض العرض', 'مرفوضة', 'rejected', 'declined'].includes(status.toLowerCase()) ||
        (item.accepted === false && ['تم اختيار فني', 'جاري التنفيذ', 'قيد التنفيذ'].includes(status));
    };
    const isAcceptedJob = item => !isRejectedOffer(item) && (item.accepted === true || ['تم اختيار فني', 'بانتظار تأكيد العميل', 'جاري التنفيذ', 'قيد التنفيذ'].includes(String(item.orderStatus || item.status || '').trim()));
    const isCompletedJob = item => ['تم الانتهاء', 'مكتمل', 'مكتملة', 'completed', 'finished'].includes(String(item.orderStatus || item.status || '').trim().toLowerCase());
    const displayedOffers = technicianOffers.filter(item => tab === 'currentJobs' ? isAcceptedJob(item) && !isCompletedJob(item) : tab === 'completed' ? isCompletedJob(item) : !isCompletedJob(item));
    const refreshSpin = useRef(new Animated.Value(0)).current;
  const isRefreshing = Boolean(techData.loading);
  useEffect(() => {
    if (!isRefreshing) { refreshSpin.setValue(0); return undefined; }
    const animation = Animated.loop(Animated.timing(refreshSpin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [isRefreshing, refreshSpin]);
  const refreshRotation = refreshSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const availableServices = Array.from(new Set((categories || []).flatMap(category => Array.isArray(category.services) ? category.services : [])));
  const filteredAvailableOrders = technicianOrders.filter(item => {
    const haystack = [item.service, item.specialty, item.area, item.sn, item.orderSn, item.description, item.desc].filter(Boolean).join(' ');
    const searchMatch = matchesAreaSearch(haystack, technicianSearch);
    const serviceMatch = technicianServiceFilter === 'الكل' || String(item.service || item.specialty || '') === technicianServiceFilter;
    return searchMatch && serviceMatch;
  });
    const tabs = [{ key: 'home', label: 'الرئيسية' }, { key: 'profile', label: 'حسابي' }, { key: 'wallet', label: 'المحفظة' }, { key: 'store', label: 'المتجر' }, { key: 'support', label: 'الدعم' }, { key: 'available', label: 'طلبات متاحة' }, { key: 'offers', label: 'طلبات مقدمة' }, { key: 'currentJobs', label: 'طلبات جارية' }, { key: 'completed', label: 'طلبات مكتملة' }, { key: '__empty', empty: true }];
  const hasMoreAvailable = technicianOrdersPagination
    ? Number(technicianOrdersPagination.page || 1) < Number(technicianOrdersPagination.pages || 1)
    : technicianOrders.length >= 20;
  const loadMoreAvailable = async () => {
    if (loadingMoreAvailable || !hasMoreAvailable || !session?.token) return;
    const nextPage = Number(technicianOrdersPagination?.page || 1) + 1;
    setLoadingMoreAvailable(true);
    try {
      const result = await api('/orders/available?page=' + nextPage, { token: session.token });
      const incoming = toList(result, ['orders', 'requests', 'items']);
      setTechData(current => ({ ...current, orders: uniqueByOrderSN([...(current.orders || []), ...incoming]), ordersPagination: result.pagination || { page: nextPage, pages: incoming.length >= 20 ? nextPage + 1 : nextPage } }));
    } catch (error) { Alert.alert('تعذر تحميل المزيد', error.message || 'حاول تحديث الفرص.'); }
    finally { setLoadingMoreAvailable(false); }
  };
  return <SafeAreaView style={styles.technicianSafe}>
      <View style={{height:64,backgroundColor:'#FFF',paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#E7EAF2'}}>
        <TouchableOpacity onPress={()=>{setNotificationsOpen(v=>!v);setReloadKey(v=>v+1);}} style={{width:42,height:42,alignItems:'center',justifyContent:'center'}}><Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="#8A94A6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>{notifications.unread>0?<View style={{position:'absolute',top:1,left:1,minWidth:17,height:17,borderRadius:9,backgroundColor:'#E5484D',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontSize:10,fontWeight:'900'}}>{notifications.unread}</Text></View>:null}</TouchableOpacity>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{color:'#102A9B',fontSize:24,fontWeight:'900'}}>ساتڤيو</Text><Svg width={30} height={32} viewBox="0 0 30 32"><Path d="M5 6c8.2.7 14.3 6.8 15 15-8.2-.7-14.3-6.8-15-15Z" fill="#102A9B"/><Path d="M5 6a17 17 0 0 1 15 15m-4-2 7 7m-7-7 2-5m5 12 3 2M10 29h15m-8-4v4" fill="none" stroke="#102A9B" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/></Svg></View>
      </View>
      {String(user.identityReviewStatus || '') === 'needs_resubmission' ? <View style={{ margin: 12, marginTop: 10, padding: 16, borderRadius: 18, borderWidth: 2, borderColor: '#D97706', backgroundColor: '#FFFBEB', gap: 12 }}>
        <Text style={{ color: '#92400E', fontSize: 19, fontWeight: '900', textAlign: 'right' }}>مطلوب استكمال بيانات حسابك</Text>
        <View style={{ backgroundColor: '#FEF3C7', borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B', padding: 14 }}>
          <Text style={{ color: '#9A3412', fontSize: 18, lineHeight: 29, fontWeight: '900', textAlign: 'right' }}>{user.identityReviewReason || 'يرجى تنفيذ المطلوب لاستكمال مراجعة حسابك.'}</Text>
        </View>
        {reviewFields.length ? <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, gap: 10 }}>
          <Text style={{ color: '#1E293B', fontSize: 15, fontWeight: '900', textAlign: 'right' }}>عدّل البيانات المطلوبة هنا</Text>
          {reviewFields.map(field => <View key={field} style={{ gap: 7 }}>
            <Text style={{ color: '#334155', fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{field === 'name' ? 'الاسم' : field === 'phone' ? 'رقم الهاتف' : field === 'specialties' ? 'التخصصات والخدمات المعتمدة' : 'مناطق العمل المعتمدة'}</Text>
            {field === 'name' || field === 'phone' ? <Field
              value={String(reviewDataDraft[field] ?? user[field] ?? '')}
              onChangeText={value => setReviewDataDraft(current => ({ ...current, [field]: value }))}
              keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
            /> : null}
            {field === 'specialties' ? (categories || []).map(category => {
              const services = Array.isArray(category.services) ? category.services : [];
              const chosenCount = services.filter(service => (reviewDataDraft.specialties || []).includes(service)).length;
              const open = reviewDataOpenCategory === category.label;
              return <View key={category.label} style={{ borderWidth: 1, borderColor: '#DCE3F0', borderRadius: 11, overflow: 'hidden' }}>
                <TouchableOpacity onPress={() => setReviewDataOpenCategory(open ? '' : category.label)} style={{ padding: 11, backgroundColor: '#F8FAFC', flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#1E293B', fontSize: 12, fontWeight: '900', textAlign: 'right' }}>{category.emoji || '🛠️'} {category.label}</Text>
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800' }}>{chosenCount} مختار {open ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {open ? services.map(service => {
                  const checked = (reviewDataDraft.specialties || []).includes(service);
                  return <TouchableOpacity key={service} onPress={() => setReviewDataDraft(current => {
                    const selected = Array.isArray(current.specialties) ? current.specialties : [];
                    if (selected.includes(service)) return { ...current, specialties: selected.filter(item => item !== service) };
                    if (selected.length >= 20) return current;
                    return { ...current, specialties: [...selected, service] };
                  })} style={{ padding: 10, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
                    <Text style={{ color: checked ? '#14532D' : '#334155', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>{checked ? '☑' : '□'} {service}</Text>
                  </TouchableOpacity>;
                }) : null}
              </View>;
            }) : null}
            {field === 'areas' ? <AreaPicker label="اختار مناطق العمل" options={areas || []} multiple value={Array.isArray(reviewDataDraft.areas) ? reviewDataDraft.areas : []} onChange={value => setReviewDataDraft(current => ({ ...current, areas: value }))} maxSelections={30} /> : null}
          </View>)}
        </View> : null}
        {reviewImages.length ? <View style={{ gap: 9 }}>
          <Text style={{ color: '#78350F', fontSize: 14, fontWeight: '900', textAlign: 'right' }}>ارفع الصور التي طلبتها الإدارة فقط</Text>
          {reviewImages.map(side => <View key={side} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 10, gap: 7 }}>
            <Text style={{ color: '#1E293B', fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{side === 'profile' ? 'الصورة الشخصية' : side === 'front' ? 'البطاقة – الوجه الأمامي' : 'البطاقة – الوجه الخلفي'}</Text>
            {reviewUploads?.[side]?.previewUri ? <Image source={{ uri: reviewUploads[side].previewUri }} resizeMode={side === 'profile' ? 'cover' : 'contain'} style={side === 'profile' ? { width: 104, height: 104, borderRadius: 52, alignSelf: 'center' } : { width: '100%', height: 120 }} /> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {side !== 'profile' ? <Button title="اختيار من المعرض" secondary onPress={() => pickTechnicianResubmissionImage(side, 'gallery')} disabled={Boolean(reviewUploads?.[side]?.uploading)} /> : null}
              <Button title={side === 'profile' ? '📷 التقاط صورة شخصية' : '📷 الكاميرا'} secondary onPress={() => pickTechnicianResubmissionImage(side, 'camera')} disabled={Boolean(reviewUploads?.[side]?.uploading)} />
            </View>
            <Text style={styles.detail}>{reviewUploads?.[side]?.status || 'لم يتم رفع الصورة المطلوبة بعد.'}</Text>
          </View>)}
        </View> : null}
        <Button title="إرسال التعديلات والصور للإدارة" onPress={() => submitTechnicianResubmission(reviewDataDraft)} disabled={Boolean(reviewUploads?.front?.uploading || reviewUploads?.back?.uploading || reviewUploads?.profile?.uploading)} />
        <Text style={{ color: '#92400E', fontSize: 11, lineHeight: 19, textAlign: 'right' }}>سيظل حسابك قيد المراجعة حتى تراجع الإدارة ما أرسلته.</Text>
      </View> : null}
      {offerDraft ? <View style={styles.formCard}>
        <Text style={styles.cardTitlePremium}>تقديم عرض على {offerDraft.order.service || 'الخدمة'} — {offerDraft.order.sn}</Text>
        <Field label="السعر بالجنيه" value={offerDraft.price} onChangeText={value => setOfferDraft(current => ({ ...current, price: value }))} keyboardType="numeric" />
        <Field label="رسالة للعميل" value={offerDraft.message} onChangeText={value => setOfferDraft(current => ({ ...current, message: value }))} multiline />
        <Button title="إرسال العرض" onPress={submitOffer} />
        <Button title="إلغاء" secondary onPress={() => setOfferDraft(null)} />
      </View> : null}
      {!referralPageOpen ? <StoreAdBanner role="fanni" session={session} visible={tab !== 'store'} onOpenStore={() => setTechData(v => ({ ...v, tab: 'store' }))} /> : null}
      <View style={{ flex: 1 }}>
        {referralPageOpen ? <ScrollView contentContainerStyle={styles.technicianPage}><View style={{ marginHorizontal: 12 }}><Button title="← رجوع للرئيسية" secondary onPress={() => setReferralPageOpen(false)} /><ReferralCard session={session} kind="fanni" expanded showToggle={false} /></View></ScrollView> : techData.loading ? <View style={styles.center}><ActivityIndicator size="large" color={COLORS.navy} /><Text style={styles.statusText}>جاري تحميل بيانات الفني...</Text></View> : <>
          {tab === 'home' && <ScrollView ref={referralScrollRef} contentContainerStyle={[styles.technicianPage,{paddingHorizontal:12,paddingTop:8,paddingBottom:132}]}>
            <PublicContentBanner role="fanni" />
            <View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <View style={{flexDirection:'row-reverse',alignItems:'center',flex:1}}>
                <View style={{width:38,height:38,borderRadius:19,overflow:'hidden',alignItems:'center',justifyContent:'center',marginLeft:9,backgroundColor:'#E8EDFF'}}>{profilePhotoUri ? <Image source={{uri:profilePhotoUri}} style={{width:38,height:38,borderRadius:19}} /> : <Text style={{color:'#172554',fontSize:16,fontWeight:'900'}}>{String(user.name||'ف').trim().charAt(0)}</Text>}</View>
                <View style={{flex:1}}><Text style={{color:'#09145B',fontSize:16,fontWeight:'900',textAlign:'right'}}>مرحباً {user.name||'بك'}</Text><Text style={{color:'#46506B',fontSize:11,fontWeight:'700',textAlign:'right',marginTop:3}}>{user.level||'مبتدئ'} • معتمد • {Number(user.walletBalance||user.balance||0).toLocaleString('ar-EG')} جنيه</Text></View>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={acceptingOrders ? 'إيقاف استقبال الطلبات' : 'تشغيل استقبال الطلبات'}
                onPress={toggleOrderAvailability}
                disabled={!isApproved || availabilitySaving}
                activeOpacity={0.8}
                style={{alignItems:'center',justifyContent:'center',paddingHorizontal:11,paddingVertical:8,borderRadius:18,backgroundColor:acceptingOrders?'#E5F8EF':'#FFF3D6',borderWidth:1,borderColor:acceptingOrders?'#9BDDBB':'#F0CE7A',opacity:(!isApproved || availabilitySaving)?0.6:1,minWidth:112}}
              >
                <Text style={{color:acceptingOrders?'#16845B':'#946200',fontSize:11,fontWeight:'900'}}>{availabilitySaving?'جارٍ التحديث...':acceptingOrders?'● ON · متصل الآن':'● OFF · غير متصل الآن'}</Text>
                <Text style={{color:acceptingOrders?'#16845B':'#946200',fontSize:9,fontWeight:'700',marginTop:2}}>{acceptingOrders?'اضغط للإيقاف':'اضغط للتفعيل'}</Text>
              </TouchableOpacity>
            </View>
            {!acceptingOrders ? <View style={{marginBottom:8,paddingHorizontal:10,paddingVertical:8,borderRadius:10,backgroundColor:'#FFF4E5',borderWidth:1,borderColor:'#F2D39A',flexDirection:'row-reverse',alignItems:'center',gap:6}}>
              <Text style={{fontSize:14}}>⚠️</Text>
              <Text style={{flex:1,color:'#805500',fontSize:10,fontWeight:'800',textAlign:'right',lineHeight:16}}>أنت غير متصل ولن تستقبل طلبات جديدة. فعّل ON لاستقبال الطلبات.</Text>
            </View> : null}
            <View style={{backgroundColor:'#092D9E',borderRadius:18,paddingHorizontal:13,paddingVertical:10,minHeight:88,marginBottom:6,overflow:'hidden',flexDirection:'row',alignItems:'center',gap:10}}>
              <View style={{flex:1,minWidth:0}}><Text style={{color:'#FFF',fontSize:15,fontWeight:'900',textAlign:'right'}}>فرص عمل متاحة</Text><Text style={{color:'#E3EAFF',fontSize:11,fontWeight:'700',textAlign:'right',marginTop:3,lineHeight:16}}>استكشف الطلبات المتاحة، واختَر المناسب لك وقدّم عرضك</Text><TouchableOpacity onPress={()=>setTechData(v=>({...v,tab:'available'}))} style={{alignSelf:'flex-start',backgroundColor:'#FFF',borderRadius:9,paddingHorizontal:11,paddingVertical:6,marginTop:7}}><Text style={{color:'#102A9B',fontSize:11,fontWeight:'900'}}>استكشف الفرص ←</Text></TouchableOpacity></View>
              <View style={{width:44,height:44,borderRadius:22,backgroundColor:'#DCE6FF',alignItems:'center',justifyContent:'center',flexShrink:0}}><Text style={{fontSize:21}}>💼</Text></View>
            </View>
            <Text style={{color:'#07145C',fontSize:22,fontWeight:'900',textAlign:'right',marginBottom:2}}>الإحصائيات</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10,marginBottom:4}}>
              {[{label:'رصيد المحفظة',value:Number(user.walletBalance||user.balance||0).toLocaleString('ar-EG')+' ج',icon:'💳',action:'wallet'},{label:'فرص متاحة',value:filteredAvailableOrders.length,icon:'💼',action:'available'},{label:'مهام مكتملة',value:technicianOffers.filter(isCompletedJob).length,icon:'✓',action:'completed'},{label:'عروضي',value:technicianOffers.filter(item=>!isCompletedJob(item)).length,icon:'📄',action:'offers'}].map(item=><TouchableOpacity key={item.label} onPress={()=>setTechData(v=>({...v,tab:item.action}))} style={{width:'48%',minHeight:108,backgroundColor:'#FFF',borderRadius:16,padding:10,alignItems:'center',justifyContent:'center',elevation:3,shadowColor:'#172554',shadowOpacity:.09,shadowRadius:7,shadowOffset:{width:0,height:3}}}><View style={{width:42,height:42,borderRadius:21,backgroundColor:'#E3E9FF',alignItems:'center',justifyContent:'center',marginBottom:5}}><Text style={{fontSize:21}}>{item.icon}</Text></View><Text style={{color:'#50566A',fontSize:12,fontWeight:'700'}}>{item.label}</Text><Text style={{color:'#09145B',fontSize:20,fontWeight:'900',marginTop:2}}>{item.value}</Text></TouchableOpacity>)}
            </View>
            <ReferralPromo onPress={()=>setReferralPageOpen(true)} style={{backgroundColor:'#DCE5FF',borderRadius:13,padding:8,marginBottom:2,flexDirection:'row-reverse',alignItems:'center',gap:9}}><Text style={{fontSize:21}}>🎁</Text><View style={{flex:1}}><Text style={{color:'#09145B',fontSize:14,fontWeight:'900',textAlign:'right'}}>ادعُ صديقك واربح 150 جنيه</Text><Text style={{color:'#26356E',fontSize:11,fontWeight:'700',textAlign:'right',marginTop:3}}>شارك رابط الدعوة واكسب رصيد لكل صديق ينضم</Text></View><View style={{backgroundColor:'#102A9B',borderRadius:11,paddingHorizontal:11,paddingVertical:9}}><Text style={{color:'#FFF',fontWeight:'900',fontSize:12}}>دعوة الآن ←</Text></View></ReferralPromo>
            <Text style={{color:'#07145C',fontSize:22,fontWeight:'900',textAlign:'right',marginBottom:2}}>إجراءات سريعة</Text>
            <View style={{backgroundColor:'#FFF',borderRadius:17,paddingHorizontal:12,elevation:3}}>
              {[{label:'سجل المهام',icon:'📋',run:()=>setTechData(v=>({...v,tab:'completed'}))},{label:'التقارير',icon:'📊',run:()=>setTechData(v=>({...v,tab:'offers'}))},{label:'الإعدادات',icon:'⚙️',run:()=>setTechData(v=>({...v,tab:'profile'}))},{label:'طلب دعم فني',icon:'🎧',run:()=>setScreen('support')}].map((item,index)=><TouchableOpacity key={item.label} onPress={item.run} style={{minHeight:52,flexDirection:'row-reverse',alignItems:'center',borderBottomWidth:index===3?0:1,borderBottomColor:'#EDF0F5',gap:12}}><Text style={{fontSize:21,width:28,textAlign:'center'}}>{item.icon}</Text><Text style={{flex:1,color:'#111827',fontSize:15,fontWeight:'800',textAlign:'right'}}>{item.label}</Text><Text style={{color:'#CBD0D9',fontSize:24}}>‹</Text></TouchableOpacity>)}
            </View>
            {!isApproved?<Text style={{color:COLORS.amber800,fontSize:11,lineHeight:20,marginTop:10,textAlign:'right'}}>حسابك {user.status||'قيد المراجعة'}. إرسال العروض وشحن المحفظة متاحان بعد اعتماد الإدارة.</Text>:null}
          </ScrollView>}
          {tab === 'available' && <>{!acceptingOrders ? <View style={[styles.formCard, { marginHorizontal: 12, marginTop: 8, borderColor: COLORS.amber300 }]}><Text style={styles.cardTitleSmall}>استقبال الطلبات الجديدة متوقف</Text><Text style={styles.detail}>فعّل استلام الطلبات عشان تقدر تشوف الطلبات الجديدة وتقدم عروضك. طلباتك الحالية ورسائل العملاء ما زالت تعمل بشكل طبيعي.</Text><Button title="تفعيل استلام الطلبات" onPress={toggleOrderAvailability} disabled={availabilitySaving} /></View> : null}<View style={[styles.formCard, { marginHorizontal: 12, marginTop: 8 }]}>{/*availability*/}<Field label="ابحث بكود الطلب أو المنطقة أو الخدمة" value={technicianSearch} onChangeText={setTechnicianSearch} placeholder="اكتب كلمة للبحث" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 4 }}>{['الكل', ...availableServices].map(service => <TouchableOpacity key={service} onPress={() => setTechnicianServiceFilter(service)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: technicianServiceFilter === service ? '#102A9B' : '#E5E9F2', backgroundColor: technicianServiceFilter === service ? '#EEF2FF' : COLORS.white }}><Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '800' }}>{service}</Text></TouchableOpacity>)}</ScrollView></View><FlatList style={{ flex: 1 }} contentContainerStyle={styles.listPremium} data={filteredAvailableOrders} keyExtractor={(item, i) => String(item._id || item.sn || i)} ListEmptyComponent={<Text style={styles.emptyText}>لا توجد فرص متاحة حاليًا.</Text>} ListFooterComponent={hasMoreAvailable ? <Button title={loadingMoreAvailable ? 'جاري تحميل المزيد...' : 'تحميل 20 طلبًا إضافيًا'} secondary onPress={loadMoreAvailable} disabled={loadingMoreAvailable} /> : null} renderItem={({ item }) => {
             const sn = getOrderSN(item);
             return <View style={styles.orderCardPremium}>
               <Text style={styles.cardTitlePremium}>{item.service || 'طلب خدمة'} — {sn}</Text>
               <Text style={styles.detail}>المنطقة: {item.area || 'غير محددة'} • ميزانية العميل: {item.budget !== undefined && item.budget !== null && String(item.budget).trim() !== '' ? `حوالي ${item.budget} جنيه` : 'غير محددة'}</Text>
               <Text style={styles.detail}>يمكنك تقديم عرضك بالسعر المناسب لك.</Text>
               <Text style={styles.detail}>تقييم العميل: ★ {Number(item.clientRatingAverage || 0).toFixed(1)} ({Number(item.clientRatingCount || 0)} تقييم) • ✓ {Number(item.clientCompletedJobs || 0)} مهمة مكتملة</Text>
               <View style={styles.serviceDescriptionBox}><Text style={styles.serviceDescriptionLabel}>تفاصيل الخدمة من العميل</Text><Text style={styles.serviceDescriptionText}>{item.description || 'لم يضف العميل تفاصيل مكتوبة.'}</Text><VoicePlayback orderSN={sn} token={session?.token} hasVoiceRecording={Boolean(item.hasVoiceRecording)} /></View>
               {(() => {
                 const ownOffer = technicianOffers.find(offer => getOrderSN(offer) === sn);
                 const ownOfferRejected = ownOffer && isRejectedOffer(ownOffer);
                 const ownOfferAccepted = ownOffer && isAcceptedJob(ownOffer);
                 if (ownOfferRejected) return <TouchableOpacity disabled style={[styles.button, styles.buttonDanger]}><Text style={[styles.buttonText, styles.buttonDangerText]}>تم رفض عرضك</Text></TouchableOpacity>;
                 if (ownOfferAccepted) return null;
                 if (ownOffer) return <Button title="جاري انتظار الرد على عرضك" disabled onPress={() => {}} />;
                 if (!isApproved) return <Button title="تقديم العروض بعد اعتماد الحساب" disabled onPress={() => {}} />;
                  return <Button title="تقديم عرض" onPress={() => sendOffer(item)} />;
               })()}
             </View>;
           }} /></>}
          {(tab === 'offers' || tab === 'currentJobs' || tab === 'completed') && <FlatList style={{ flex: 1 }} contentContainerStyle={styles.listPremium} data={displayedOffers} keyExtractor={(item, i) => String(item._id || item.orderSn || i)} ListEmptyComponent={<Text style={styles.emptyText}>{tab === 'currentJobs' ? 'مفيش طلبات جارية حاليًا.' : tab === 'completed' ? 'لسه مفيش خدمات مكتملة.' : 'لسه ماقدمتش عروض جديدة.'}</Text>} renderItem={({ item }) => {
             const sn = getOrderSN(item);
             const alreadyRatedByTechnician = Boolean(item.myRating || item.fanniRating || item.ratingByFanni || (item.ratings || []).some(r => r.reviewerRole === 'fanni'));
             return <View style={styles.orderCardPremium}>
               <Text style={styles.cardTitlePremium}>{item.service || 'خدمة'} — {sn}</Text>
               <Text style={styles.detail}>الحالة: {isRejectedOffer(item) ? 'تم رفض عرضك' : (item.orderStatus || '—')} • السعر: {item.price || '—'} جنيه</Text>
               {tab === 'completed' && !alreadyRatedByTechnician ? <Button title="⭐ قيّم العميل" onPress={() => { setRatingDrafts(current => ({ ...current, [sn]: current[sn] || { stars: '5', comment: '', blockFuture: false } })); setRatingPrompt({ role: 'fanni', order: item }); }} /> : null}
               {isRejectedOffer(item) ? <TouchableOpacity disabled style={[styles.button, styles.buttonDanger]}><Text style={[styles.buttonText, styles.buttonDangerText]}>تم رفض عرضك</Text></TouchableOpacity> : null}
               {item.client ? <Text style={styles.detail}>تقييم العميل: ★ {Number(item.client.ratingAverage || 0).toFixed(1)} ({Number(item.client.ratingCount || 0)} تقييم) • ✓ {Number(item.client.completedJobs || 0)} مهمة مكتملة</Text> : null}
               {isAcceptedJob(item) && !isCompletedJob(item) ? <View style={styles.formCard}><Text style={styles.cardTitleSmall}>تفاصيل العميل</Text>{assignedDetails[sn]?.loading ? <Text style={styles.detail}>جاري تحميل تفاصيل العميل...</Text> : null}{assignedDetails[sn]?.error ? <><Text style={styles.errorText}>{assignedDetails[sn].error}</Text><Button title="إعادة تحميل التفاصيل" secondary onPress={()=>setAssignedDetails(current=>{const next={...current};delete next[sn];return next;})}/></> : null}{assignedDetails[sn]?.order ? <><Text style={styles.detailBold}>العميل: {assignedDetails[sn].order.clientName || 'عميل'}</Text><Text style={styles.detail}>الخدمة التفصيلية: {assignedDetails[sn].order.service || item.service || '—'}</Text><Text style={styles.detail}>المنطقة: {assignedDetails[sn].order.area || item.area || '—'}</Text><Text style={styles.detail}>العنوان بالتفصيل: {assignedDetails[sn].order.address || '—'}</Text><View style={styles.serviceDescriptionBox}><Text style={styles.serviceDescriptionLabel}>تفاصيل الشغل من العميل</Text><Text style={styles.serviceDescriptionText}>{assignedDetails[sn].order.description || item.description || 'لم يضف العميل تفاصيل مكتوبة.'}</Text><VoicePlayback orderSN={sn} token={session?.token} hasVoiceRecording={Boolean(assignedDetails[sn].order.hasVoiceRecording || item.hasVoiceRecording)} /></View><Text style={styles.detail}>السعر المقبول: {assignedDetails[sn].order.acceptedOfferPrice ?? item.price ?? '—'} جنيه</Text>{assignedDetails[sn].order.clientPhone ? <Button title="📞 اتصال بالعميل" secondary onPress={()=>Linking.openURL('tel:'+String(assignedDetails[sn].order.clientPhone).replace(/[^0-9+]/g,''))}/> : <Text style={styles.detail}>رقم العميل غير متاح حاليًا.</Text>}</> : null}</View> : null}
               {isAcceptedJob(item) && !isCompletedJob(item) ? <View style={styles.formCard}><Text style={styles.cardTitleSmall}>طلب زيادة السعر</Text><Text style={styles.detail}>السعر الحالي: {item.acceptedOfferPrice ?? item.client?.acceptedOfferPrice ?? item.priceNum ?? item.price ?? '—'} جنيه</Text><Field label="السعر الجديد بالجنيه" value={priceDrafts[sn]?.price || ''} onChangeText={value=>setPriceDrafts(current=>({...current,[sn]:{...(current[sn]||{}),price:value}}))} keyboardType="numeric" placeholder="السعر بعد الزيادة"/><Field label="سبب الزيادة" value={priceDrafts[sn]?.reason || ''} onChangeText={value=>setPriceDrafts(current=>({...current,[sn]:{...(current[sn]||{}),reason:value}}))} multiline placeholder="وضح سبب طلب الزيادة"/><Button title="إرسال طلب الزيادة" onPress={()=>requestOrderPriceChange(item)}/></View> : null}
               <><View style={styles.roleActions}>{!isRejectedOffer(item) ? <Button title={orderChats[sn]?.open && String(orderChats[sn]?.targetOfferId||'')===String(item._id||item.offerId||item.id||'') ? 'إخفاء المحادثة' : 'محادثة'} secondary onPress={() => toggleOrderChat(item, 'fanni')} /> : null}{isAcceptedJob(item) && !isCompletedJob(item) && String(item.orderStatus || item.status || '').trim() !== 'بانتظار تأكيد العميل' ? <Button title="إنهاء الخدمة" onPress={() => completeTechnicianOrder(item)} /> : null}{String(item.orderStatus || item.status || '').trim() === 'بانتظار تأكيد العميل' ? <Text style={styles.detailBold}>بانتظار تأكيد العميل — ستظل المهمة جارية حتى يؤكد العميل</Text> : null}</View>
               {orderChats[sn]?.open && String(orderChats[sn]?.targetOfferId||'')===String(item._id||item.offerId||item.id||'') ? <View style={styles.chatPanelPremium}>{orderChats[sn]?.loading ? <Text style={styles.detail}>جاري تحميل المحادثة...</Text> : null}{orderChats[sn]?.error ? <Text style={styles.errorText}>{orderChats[sn].error}</Text> : null}{getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).length===0 && !orderChats[sn]?.loading && !orderChats[sn]?.error ? <Text style={styles.detail}>لا توجد رسائل في هذه المحادثة حتى الآن.</Text> : null}{getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).map((entry,j)=>entry._chatItemType==='message' ? <View key={String(entry._id||'message-'+j)} style={[styles.chatMessage, entry.senderRole==='fanni' ? styles.chatMessageTechnician : styles.chatMessageClient]}><Text style={styles.detailSmall}>{entry.senderRole==='fanni'?'أنت':'العميل'} • {dateLabel(entry.createdAt)}</Text><Text style={styles.chatMessageText}>{entry.text}</Text></View> : <View key={String(entry._id||entry.id||'price-'+j)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>طلب زيادة السعر</Text><Text style={styles.detail}>السعر السابق: {entry.oldPrice} جنيه • السعر المطلوب: {entry.newPrice} جنيه</Text><Text style={styles.detail}>السبب: {entry.reason||'—'}</Text><Text style={styles.detailBold}>{entry.status==='قيد الموافقة'?'تم تقديم طلبك، في انتظار رد العميل.':entry.status==='مقبول'?'وافق العميل على زيادة السعر.':entry.status==='مرفوض'?'رفض العميل الزيادة؛ السعر السابق ما زال ساريًا.':'حالة الطلب: '+(entry.status||'غير معروفة')}</Text></View>)}{!isAcceptedJob(item) && !isRejectedOffer(item) ? <View style={styles.roleActions}>{['نعم','لا','حسب الاتفاق','النهاردة بإذن الله','بكرة بإذن الله','دلوقتي لو حبيت'].map(reply=><Button key={reply} title={reply} secondary onPress={()=>sendOrderChat(item,reply)}/>)}</View> : null}{!isCompletedJob(item) ? <><Field label="رسالة للعميل" value={chatDrafts[sn]||''} onChangeText={value=>setChatDrafts(current=>({...current,[sn]:value}))} placeholder={item.accepted===true ? 'اكتب رسالة للعميل' : 'قبل القبول: نعم، لا، حسب الاتفاق، النهاردة بإذن الله، بكرة بإذن الله، دلوقتي لو حبيت'} returnKeyType="send" onSubmitEditing={() => sendOrderChat(item)} blurOnSubmit /><Button title="إرسال" onPress={()=>sendOrderChat(item)}/></> : null}</View> : null}</>
             </View>; }} />}
          {tab === 'store' && <ScrollView contentContainerStyle={styles.technicianPage}><StoreScreen role="fanni" session={session} walletBalance={Number(user.walletBalance || user.balance || 0)} onWalletBalanceChange={value => setTechData(current => ({ ...current, profile: { ...(current.profile || session.user), walletBalance: value } }))} /></ScrollView>}
          {tab === 'wallet' && <TechnicianWalletScreen session={session} user={user} transferNumbers={walletTransferNumbers} topup={topup} setTopup={setTopup} submitTopup={submitTopup} />}
          {tab === 'profile' && <ScrollView contentContainerStyle={styles.technicianPage}><View style={styles.dataCard}><Text style={styles.cardTitlePremium}>{user.name || 'الفني'}</Text><Text style={styles.detail}>الهاتف: {user.phone || ''}</Text><Text style={styles.detail}>المستوى: {user.level || 'مبتدئ'}</Text><Text style={styles.detail}>الحالة: {user.status || 'قيد المراجعة'}</Text><Text style={styles.detail}>الرصيد: {Number(user.walletBalance || 0)} جنيه</Text><Text style={styles.sectionTitleSmall}>التخصصات</Text><Text style={styles.detail}>{Array.isArray(user.specialties) && user.specialties.length ? user.specialties.join('، ') : 'لا توجد تخصصات مسجلة حاليًا.'}</Text><Text style={styles.sectionTitleSmall}>مناطق العمل</Text><Text style={styles.detail}>{Array.isArray(user.areas) && user.areas.length ? user.areas.join('، ') : 'غير محددة'}</Text>{Array.isArray(user.fanniBadges || user.badges) && (user.fanniBadges || user.badges).length ? <View style={{ marginTop: 10 }}><Text style={styles.cardTitleSmall}>الشارات والإنجازات</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{(user.fanniBadges || user.badges).map((badge, index) => <View key={String(badge?.id || badge?.key || badge || index)} style={{ borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' }}><Text style={{ color: COLORS.navy, fontSize: 10, fontWeight: '800' }}>{typeof badge === 'string' ? badge : badge.label || badge.name || badge.title || 'شارة'}</Text></View>)}</View></View> : null}</View><Button title="✏️ تعديل بياناتي" onPress={beginProfileEdit} /><Button title="تغيير كلمة المرور" onPress={() => setScreen('changePassword')} /><View style={{ marginTop: 18 }}><Button title="تسجيل الخروج" secondary onPress={() => setLogoutConfirmOpen(true)} /></View></ScrollView>}
        </>}
      </View>
      {!referralPageOpen ? <View style={{flexDirection:'row-reverse',backgroundColor:'#FFF',borderTopWidth:1,borderTopColor:'#E7EAF2',paddingTop:8,paddingBottom:8,justifyContent:'space-around',elevation:12}}>
        {[{key:'profile',label:'حسابي',icon:'👤'},{key:'offers',label:'الطلبات',icon:'📋'},{key:'wallet',label:'المحفظة',icon:'💳'},{key:'store',label:'المتجر',icon:'🛍️'},{key:'home',label:'الرئيسية',icon:'⌂'}].map(item=><TouchableOpacity key={item.key} onPress={()=>setTechData(v=>({...v,tab:item.key}))} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:3}}><Text style={{fontSize:23,color:tab===item.key?'#102A9B':'#858B96'}}>{item.icon}</Text><Text style={{fontSize:11,fontWeight:'900',color:tab===item.key?'#102A9B':'#555B66',marginTop:2}}>{item.label}</Text></TouchableOpacity>)}
      </View> : null}
      {notificationsOpen ? <Modal transparent visible={notificationsOpen} animationType="fade" onRequestClose={() => setNotificationsOpen(false)}><View style={styles.notificationModalBackdrop}><TouchableOpacity style={styles.notificationModalDismiss} activeOpacity={1} onPress={() => setNotificationsOpen(false)} /><View style={styles.notificationModalCard}><View style={styles.notificationModalHeader}><Text style={styles.cardTitleSmall}>الإشعارات {notifications.unread ? `(${notifications.unread})` : ''}</Text><View style={styles.notificationHeaderActions}>{notifications.unread > 0 ? <Button title="قراءة الكل" secondary onPress={markAllNotificationsRead} /> : null}<Button title="إغلاق" secondary onPress={() => setNotificationsOpen(false)} /></View></View><ScrollView style={styles.notificationModalList} contentContainerStyle={styles.notificationListContent}>{notifications.loading ? <ActivityIndicator color={COLORS.navy} /> : notificationItems.length ? notificationItems.map((item,i)=><TouchableOpacity key={String(item._id||item.id||i)} onPress={()=>openTechnicianNotification(item)} style={[styles.notificationRow, (item.read || item.readAt) ? styles.notificationRead : styles.notificationUnread]}><Text style={[styles.cardTitleSmall, (item.read || item.readAt) && styles.notificationReadText]}>{item.title||'إشعار'}</Text><Text style={[(item.read || item.readAt) ? styles.notificationReadText : styles.detail]}>{item.message||''}</Text>{item.replyEnabled && !item.reply ? <Text style={{marginTop:4,fontSize:11,fontWeight:'900',color:'#6D28D9',backgroundColor:'#F5F3FF',paddingHorizontal:8,paddingVertical:3,borderRadius:10,alignSelf:'flex-start'}}>مسموح بالرد</Text> : null}{item.replyEnabled && activeReplyNotificationId===String(item._id||item.id) ? <View style={{marginTop:10,padding:10,borderRadius:12,backgroundColor:'#EEF4FF'}}><View style={{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',marginBottom:6}}><Text style={{fontWeight:'900',color:COLORS.navy}}>{item.reply?.message ? 'تم إرسال ردك' : 'مسموح بالرد'}</Text><TouchableOpacity onPress={event => { event.stopPropagation?.(); setActiveReplyNotificationId(''); }}><Text style={{fontSize:11,fontWeight:'800',color:'#64748B'}}>إخفاء</Text></TouchableOpacity></View>{item.reply?.message ? <Text style={{color:COLORS.navy}}>{item.reply.message}</Text> : <><TextInput value={notificationReplyDraft} onChangeText={setNotificationReplyDraft} multiline maxLength={1000} placeholder="اكتب ردك للإدارة..." style={{minHeight:76,textAlignVertical:'top',backgroundColor:'#FFF',borderWidth:1,borderColor:'#D7E2F5',borderRadius:10,padding:10,color:'#172554'}}/><TouchableOpacity disabled={notificationReplySubmitting || !notificationReplyDraft.trim()} onPress={event => { event.stopPropagation?.(); submitTechnicianNotificationReply(); }} style={{marginTop:8,backgroundColor:COLORS.navy,borderRadius:10,padding:12,alignItems:'center',opacity:notificationReplySubmitting?0.6:1}}><Text style={{color:'#FFF',fontWeight:'900'}}>{notificationReplySubmitting?'جاري الإرسال...':'إرسال الرد'}</Text></TouchableOpacity></>}</View> : null}</TouchableOpacity>) : <Text style={styles.emptyText}>لا توجد إشعارات حاليًا.</Text>}</ScrollView></View></View></Modal> : null}
      <Modal transparent visible={logoutConfirmOpen} animationType="fade" onRequestClose={() => setLogoutConfirmOpen(false)}>
        <View style={styles.clientLogoutBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setLogoutConfirmOpen(false)} />
          <View style={styles.clientLogoutCard} accessibilityRole="alert">
            <View style={styles.clientLogoutIcon}><Text style={styles.clientLogoutIconText}>↪</Text></View>
            <Text style={styles.clientLogoutTitle}>تأكيد تسجيل الخروج</Text>
            <Text style={styles.clientLogoutMessage}>متأكد إنك عايز تسجّل خروج من حسابك؟</Text>
            <View style={styles.clientLogoutActions}>
              <TouchableOpacity accessibilityRole="button" style={[styles.clientLogoutAction, styles.clientLogoutCancel]} onPress={() => setLogoutConfirmOpen(false)}><Text style={styles.clientLogoutActionText}>لا، خليك معايا</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={[styles.clientLogoutAction, styles.clientLogoutConfirm]} onPress={() => { setLogoutConfirmOpen(false); void performLogout(); }}><Text style={styles.clientLogoutConfirmText}>أيوه، خروج</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {renderRatingModal('fanni')}
    </SafeAreaView>;
}
