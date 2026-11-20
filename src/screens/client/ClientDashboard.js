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
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { getOrderChatTimeline, toList, dateLabel, getServiceEmoji } from '../../utils/app-helpers';
import { Button, Field } from '../../components/FormControls';
import VoiceRecorder from '../../components/VoiceRecorder';
import VoicePlayback from '../../components/VoicePlayback';
import AreaPicker from '../../components/AreaPicker';
import StoreScreen, { StoreAdBanner } from '../shared/StoreScreen';
import ClientWalletScreen from './ClientWalletScreen';
import ReferralCard from '../shared/ReferralCard';
import ClientSubscriptionsScreen from './ClientSubscriptionsScreen';
import PublicContentBanner from '../shared/PublicContentBanner';
import { AccountScreen } from '../account/AccountScreens';

const CLIENT_PREVIOUS_ORDER_STATUSES = new Set(['تم الانتهاء', 'منتهي', 'مكتمل', 'مكتملة', 'ملغي', 'مؤرشف', 'منتهي - اعتذار', 'completed', 'complete', 'finished']);
function isPreviousClientOrder(order) {
  return CLIENT_PREVIOUS_ORDER_STATUSES.has(String(order?.status || order?.orderStatus || '').trim().toLowerCase());
}

function technicianBadgeLabel(badge) {
  const key = typeof badge === 'string' ? badge : String(badge?.key || badge?.id || '');
  const labels = { trusted: 'فني موثوق', top_rated: 'الأعلى تقييمًا', verified: 'تم التحقق', fast_response: 'سريع الاستجابة', premium: 'فني مميز', gold: 'الشارة الذهبية' };
  return labels[key] || (typeof badge === 'string' ? badge : badge?.label || badge?.name || badge?.title || '');
}

export function ClientDashboard({ context }) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { screen, setScreenState, screenHistoryRef, screenRef, pushTokenRef, setScreen, categories, setCategories, areas, selected, setSelected, servicesLoading, setServicesLoading, servicesError, setServicesError, reloadKey, setReloadKey, session, setSession, authRestoring, setAuthRestoring, username, setUsername, password, setPassword, loginLoading, setLoginLoading, authMode, setAuthMode, form, setForm, registrationNameRef, registrationPhoneRef, registrationPasswordRef, registrationConfirmPasswordRef, clientAreaInputRef, clientAddressInputRef, areaTechnicianCounts, clientDescriptionInputRef, clientBudgetInputRef, clientServiceDetailYRef, clientFormYRef, clientData, setClientData, techData, setTechData, walletTransferNumbers, setWalletTransferNumbers, assignedDetails, setAssignedDetails, technicianSearch, setTechnicianSearch, technicianServiceFilter, setTechnicianServiceFilter, guidelinesChecked, setGuidelinesChecked, guidelinesReachedEnd, setGuidelinesReachedEnd, guidelinesViewportHeight, setGuidelinesViewportHeight, adminData, setAdminData, topup, setTopup, clientTab, setClientTab, clientServiceSearch, setClientServiceSearch, servicePickerOpen, setServicePickerOpen, subservicePickerOpen, setSubservicePickerOpen, ratingPrompt, setRatingPrompt, dismissedRatings, setDismissedRatings, ratingDismissalsLoaded, setRatingDismissalsLoaded, ratingDismissalsLoadedFor, setRatingDismissalsLoadedFor, clientTrackSN, setClientTrackSN, clientTrackedOrder, setClientTrackedOrder, clientTrackError, setClientTrackError, clientTrackLoading, setClientTrackLoading, clientComplaint, setClientComplaint, clientComplaintTrack, setClientComplaintTrack, expandedClientOrders, setExpandedClientOrders, expandedTechnicianOrders, setExpandedTechnicianOrders, notificationsOpen, setNotificationsOpen, clientScrollRef, chatScrollRef, clientChatScrollRefs, clientChatAtBottomRef, ratingSubmittingRef, offerDraft, setOfferDraft, notifications, setNotifications, orderChats, setOrderChats, orderChatsRef, acceptedChatAutoOpenedRef, chatDrafts, setChatDrafts, priceDrafts, setPriceDrafts, ratingDrafts, setRatingDrafts, ratingSubmitting, setRatingSubmitting, dismissedRatingsRef, ratingHandledRef, ratingStatusSnapshotRef, adminUsers, setAdminUsers, adminExtras, setAdminExtras, adminServiceDraft, setAdminServiceDraft, adminServiceEdit, setAdminServiceEdit, adminRegionDraft, setAdminRegionDraft, adminAnnouncementDraft, setAdminAnnouncementDraft, adminFaqDraft, setAdminFaqDraft, adminReportFilters, setAdminReportFilters, adminWallet, setAdminWallet, adminUsersLoading, setAdminUsersLoading, broadcast, setBroadcast, supportCases, setSupportCases, supportCase, setSupportCase, supportDraft, setSupportDraft, supportSubject, setSupportSubject, supportLoading, setSupportLoading, supportError, setSupportError, accountPasswordForm, setAccountPasswordForm, profileEditForm, setProfileEditForm, profileEditOpenCategory, setProfileEditOpenCategory, recoveryForm, setRecoveryForm, adminSupportCases, setAdminSupportCases, adminSupportSelected, setAdminSupportSelected, adminSupportDraft, setAdminSupportDraft, adminRecoveryCases, setAdminRecoveryCases, adminRecoverySelected, setAdminRecoverySelected, adminRecoveryCode, setAdminRecoveryCode, adminRecoveryDraft, setAdminRecoveryDraft, services, updateForm, ratingAccountId, ratingStorageKey, previousRatingStorageKey, legacyRatingStorageKey, oldestRatingStorageKey, markNotificationRead, markAllNotificationsRead, updateProfessionalLevel, changeAdminRoleForFanni, revokeAdminRoleForUser, moderateTechnician, publishOrder, reviewTopup, setComplaintStatus, handleLogin, registerClient, registerTechnician, createOrder, trackClientOrder, submitClientComplaint, trackClientComplaints, sendOffer, submitOffer, cancelClientOrder, acceptClientOffer, completeTechnicianOrder, getOrderSN, uniqueByOrderSN, orderToken, refreshVisibleData, refreshOrderChat, toggleOrderChat, sendOrderChat, requestOrderPriceChange, decideOrderPrice, setOrderRatingStars, renderRatingStars, submitOrderRating, saveRatingDismissal, renderRatingModal, sendAdminBroadcast, acceptTechnicianGuidelines, submitTopup, loadSupportCases, startSupportCase, openSupportCase, sendSupportMessage, loadAdminSupportCases, loadAdminRecoveryCases, openAdminRecovery, issueAdminRecoveryCode, replyAdminRecovery, replyAdminSupport, beginProfileEdit, toggleProfileEditSpecialty, saveProfileEdits, changeAccountPassword, startPasswordRecovery, refreshPasswordRecovery, sendRecoveryMessage, verifyRecoveryCode, resetRecoveredPassword, adminRefreshExtras, adminAddService, adminBeginServiceEdit, adminSaveServiceEdit, adminMoveCategory, adminMoveService, adminToggleService, adminDeleteService, adminSavePricing, adminAddRegion, adminSaveSettings, adminAddFaqDraft, adminSaveContent, adminGenerateReport, adminOrderAction, adminClientAction, adminSetTechnicianLevel, adminLoadWalletTransactions, adminWalletAction, adminLoadAuditLogs, copyOrderCode, openWhatsAppSupport, performLogout, logout, goLogin, toggleArray } = context;
  const [clientNewRequestChoice, setClientNewRequestChoice] = useState('');
  const [referralPageOpen, setReferralPageOpen] = useState(false);
  useEffect(() => { if (!referralPageOpen) return undefined; const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setReferralPageOpen(false); return true; }); return () => subscription.remove(); }, [referralPageOpen]);
  const [walletBalance, setWalletBalance] = useState(Number(session?.user?.walletBalance ?? session?.user?.balance ?? 0));
  useEffect(() => { setWalletBalance(Number(session?.user?.walletBalance ?? session?.user?.balance ?? 0)); if (session?.token) api('/client/wallet', { token: session.token }).then(result => { if (result.balance !== undefined || result.walletBalance !== undefined) setWalletBalance(Number(result.balance ?? result.walletBalance)); }).catch(() => {}); }, [session?.token, session?.user?.walletBalance, session?.user?.balance]);
  const openTrackedOrderDetails = () => {
    const sn = getOrderSN(clientTrackedOrder);
    const found = clientData.orders.find(order => getOrderSN(order) === sn);
    if (!found) { Alert.alert('تفاصيل الطلب', 'الطلب غير موجود ضمن طلبات حسابك. يمكنك متابعة حالته من شاشة التتبع.'); return; }
    const previous = ['تم الانتهاء','منتهي','ملغي','مؤرشف','منتهي - اعتذار'].includes(String(found.status || ''));
    setClientTab(previous ? 'previous' : 'current');
    setExpandedClientOrders(current => ({ ...current, [sn]: true }));
  };

  const payForClientOrder = order => {
    const sn = getOrderSN(order);
    if (!sn || !session?.token) return Alert.alert('تعذر الدفع', 'بيانات الطلب أو تسجيل الدخول غير متاحة.');
    Alert.alert('الدفع من المحفظة', 'تأكيد حجز قيمة الخدمة من محفظتك؟ سيتم تحويل المبلغ للفني بعد إتمام المهمة.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد الدفع', onPress: async () => {
        try {
          const result = await api('/client/orders/' + encodeURIComponent(sn) + '/pay', { method: 'POST', token: session.token, body: {} });
          if (result.balance !== undefined) setWalletBalance(Number(result.balance));
          else { const wallet = await api('/client/wallet', { token: session.token }); if (wallet.balance !== undefined || wallet.walletBalance !== undefined) setWalletBalance(Number(wallet.balance ?? wallet.walletBalance)); }
          Alert.alert('تم حجز المبلغ', result.message || 'تم حجز قيمة الخدمة من محفظتك.');
          setReloadKey(value => value + 1);
          await refreshVisibleData();
        } catch (error) { Alert.alert('تعذر الدفع', error.message || 'حاول مرة أخرى.'); }
      } }
    ]);
  };
  const confirmClientCompletion = order => {
    const sn = getOrderSN(order);
    if (!sn || !session?.token) return Alert.alert('تعذر التأكيد', 'سجّل الدخول بحسابك لتأكيد استلام الخدمة.');
    Alert.alert('تأكيد استلام الخدمة', 'هل راجعت الخدمة وتؤكد استلامها؟ سيبدأ ضمان الإصلاح لمدة 14 يومًا من لحظة التأكيد.', [
      { text: 'رجوع', style: 'cancel' },
      { text: 'تأكيد الاستلام', onPress: async () => {
        try {
          const result = await api('/orders/' + encodeURIComponent(sn) + '/confirm-completion', { method: 'POST', token: session.token, body: {} });
          Alert.alert('تم التأكيد', result.message || 'تم تأكيد الاستلام وبدأ ضمان الإصلاح لمدة 14 يومًا.');
          setReloadKey(value => value + 1);
          await refreshVisibleData();
        } catch (error) { Alert.alert('تعذر التأكيد', error.message || 'حاول مرة أخرى.'); }
      } }
    ]);
  };
  const refreshSpin = useRef(new Animated.Value(0)).current;
  const isRefreshing = Boolean(clientData.loading);
  useEffect(() => {
    if (!isRefreshing) { refreshSpin.setValue(0); return undefined; }
    const animation = Animated.loop(Animated.timing(refreshSpin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    animation.start();
    return () => animation.stop();
  }, [isRefreshing, refreshSpin]);
  const refreshRotation = refreshSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <SafeAreaView style={styles.safe}>
      {/* HEADER PREMIUM COMPACT - اسم العميل صغير */}
      <View style={styles.clientHeader}>
        <View style={styles.clientHeaderLeft}>
          <TouchableOpacity onPress={() => { setNotificationsOpen(v => !v); setReloadKey(v => v + 1); }} style={styles.bellButtonSmall}><Text style={styles.bellText}>🔔</Text>{notifications.unread > 0 ? <View style={styles.bellBadgeDot}><Text style={styles.bellBadgeText}>{notifications.unread}</Text></View> : null}</TouchableOpacity>
          
          <Button title="خروج" logout onPress={() => setLogoutConfirmOpen(true)} />
        </View>
        <View style={styles.clientHeaderRight}>
          <View style={styles.clientHeaderInfo}>
            <Text style={styles.clientNameSmall} numberOfLines={1}>أهلًا {session.user?.name || 'بك'}</Text>
            <Text style={styles.clientRoleSmall}>عميل</Text>
          </View>
        </View>
      </View>

      {!referralPageOpen ? <View style={styles.tabRowPremium}>{[{key:'home',label:'الرئيسية'},{key:'profile',label:'حسابي'},{key:'wallet',label:'المحفظة'},{key:'store',label:'المتجر'},{key:'complaint',label:'الدعم'},{key:'new',label:'طلب جديد',icon:'＋'},{key:'current',label:'الطلبات الجارية',count:clientData.orders.filter(o => !isPreviousClientOrder(o)).length},{key:'previous',label:'الطلبات السابقة',count:clientData.orders.filter(o => isPreviousClientOrder(o)).length},{key:'track',label:'تتبع طلب'},{key:'subscriptions',label:'الاشتراكات'}].map(t => <TouchableOpacity key={t.key} onPress={() => { setClientTab(t.key); if (t.key === 'new') setClientNewRequestChoice(''); }} style={[styles.pillPremium, clientTab===t.key && styles.pillPremiumActive]}><Text style={[styles.pillPremiumText,clientTab===t.key && styles.pillPremiumTextActive]}>{t.icon ? t.icon + ' ' : ''}{t.label}{t.count ? ` (${t.count})` : ''}</Text></TouchableOpacity>)}</View> : null}
      {!referralPageOpen ? <StoreAdBanner role="client" session={session} visible={clientTab !== 'store'} onOpenStore={() => setClientTab('store')} /> : null}

    <ScrollView ref={clientScrollRef} contentContainerStyle={[styles.page, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>
      {referralPageOpen ? <View style={styles.formCard}><Button title="← رجوع للرئيسية" secondary onPress={() => setReferralPageOpen(false)} /><ReferralCard session={session} kind="client" expanded showToggle={false} /></View> : <><PublicContentBanner />
      {clientTab === 'home' ? <View style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={{ color: '#101F9B', fontSize: 20, fontWeight: '900' }}>مرحباً {session.user?.name || 'بك'}</Text><Text style={{ color: '#475569', fontSize: 13, marginTop: 3 }}>عميل • {walletBalance.toLocaleString('ar-EG')} جنيه</Text></View>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#101F9B', alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}><Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '900' }}>{String(session.user?.name || 'ع').trim().charAt(0)}</Text></View>
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => { setClientTab('new'); setClientNewRequestChoice(''); }} activeOpacity={0.9} style={{ marginBottom: 16, padding: 20, minHeight: 150, borderRadius: 22, backgroundColor: '#102A9B', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={{ color: '#FFFFFF', fontSize: 21, fontWeight: '900' }}>اطلب خدمتك بسهولة</Text><Text style={{ color: '#E1E8FF', fontSize: 13, textAlign: 'right', marginTop: 6 }}>اختار الخدمة المناسبة وهنوصلك بالفني</Text><View style={{ marginTop: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 }}><Text style={{ color: '#102A9B', fontWeight: '900' }}>طلب خدمة جديدة ←</Text></View></View>
          <Text style={{ color: '#FFFFFF', fontSize: 38, marginLeft: 12 }}>⌂</Text>
        </TouchableOpacity>
        <Text style={{ color: '#101F9B', fontSize: 20, fontWeight: '900', textAlign: 'right', marginBottom: 9 }}>الإحصائيات</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 }}>
          {[{label:'طلبات جارية',value:clientData.orders.filter(order => !isPreviousClientOrder(order)).length,action:'current',icon:'▣'},{label:'طلبات سابقة',value:clientData.orders.filter(order => isPreviousClientOrder(order)).length,action:'previous',icon:'✓'},{label:'رصيد المحفظة',value:walletBalance.toLocaleString('ar-EG')+' ج',action:'wallet',icon:'▰'},{label:'إشعارات جديدة',value:Number(notifications?.unread || 0),action:'notifications',icon:'▤'}].map(item => <TouchableOpacity key={item.label} onPress={() => item.action === 'notifications' ? (setNotificationsOpen(true),setReloadKey(v=>v+1)) : setClientTab(item.action)} style={{ width: '48%', flexGrow: 1, backgroundColor: '#FFFFFF', borderRadius: 17, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E7EAF2', elevation: 3 }}><View style={{ width: 42, height: 42, borderRadius: 22, backgroundColor: '#E5EAFE', alignItems: 'center', justifyContent: 'center', marginBottom: 7 }}><Text style={{ color: '#102A9B', fontSize: 22, fontWeight: '900' }}>{item.icon}</Text></View><Text style={{ color: '#475569', fontSize: 12 }}>{item.label}</Text><Text style={{ color: '#101F9B', fontSize: 19, fontWeight: '900', marginTop: 2 }}>{item.value}</Text></TouchableOpacity>)}
        </View>
        <TouchableOpacity onPress={() => setReferralPageOpen(true)} activeOpacity={0.88} style={{ marginBottom: 16, padding: 12, borderRadius: 15, backgroundColor: '#DDE6FF', flexDirection: 'row-reverse', alignItems: 'center', gap: 9 }}><Text style={{ fontSize: 27 }}>🎁</Text><View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={{ color: '#101F9B', fontSize: 14, fontWeight: '900' }}>ادعُ صديقك لتحصل على 50 جنيه مكافأة</Text><Text style={{ color: '#334155', fontSize: 11 }}>شارك رابط الدعوة واكسب رصيدًا لكل صديق ينضم</Text></View><Text style={{ color: '#FFFFFF', backgroundColor: '#101F9B', padding: 9, borderRadius: 10, fontWeight: '900' }}>دعوة ←</Text></TouchableOpacity>
        <Text style={{ color: '#101F9B', fontSize: 20, fontWeight: '900', textAlign: 'right', marginBottom: 8 }}>إجراءات سريعة</Text>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 17, paddingHorizontal: 13, borderWidth: 1, borderColor: '#E7EAF2', elevation: 2 }}>
          <Button title="🎧 الدعم الفني" onPress={() => setScreen('support')} />
          {[{label:'سجل الطلبات',icon:'📋',run:()=>setClientTab('current')},{label:'تتبع طلب',icon:'🔎',run:()=>setClientTab('track')},{label:'الاشتراكات',icon:'📄',run:()=>setClientTab('subscriptions')},{label:'الإعدادات والحساب',icon:'⚙',run:()=>setClientTab('profile')}].map((item,index)=><TouchableOpacity key={item.label} onPress={item.run} style={{ minHeight:48, flexDirection:'row-reverse', alignItems:'center', borderBottomWidth:index===4?0:1, borderBottomColor:'#EDF0F5', gap:10 }}><Text style={{ fontSize:19 }}>{item.icon}</Text><Text style={{ flex:1, color:'#111827', fontSize:14, fontWeight:'800', textAlign:'right' }}>{item.label}</Text><Text style={{ color:'#CBD5E1', fontSize:21 }}>‹</Text></TouchableOpacity>)}
        </View>
      </View> : null}
      {clientTab === 'new' && !clientNewRequestChoice ? <View style={styles.formCard}><Text style={styles.cardTitlePremium}>طلب جديد</Text><Text style={styles.detail}>تحب تطلب خدمة ولا تشتري منتج من المتجر؟</Text><Button title="🛠️ عايز صنايعي" onPress={() => setClientNewRequestChoice('technician')} /><Button title="🛍️ عايز أشتري من المتجر" secondary onPress={() => setClientTab('store')} /></View> : null}
      {clientTab === 'new' && clientNewRequestChoice === 'technician' ? <><Button title="رجوع لاختيار نوع الطلب" secondary onPress={() => setClientNewRequestChoice('')} /><View style={styles.welcomeCard}><Text style={styles.welcomeTitle}>اطلب خدمتك الآن 🚀</Text><Text style={styles.welcomeSub}>اختار المهنة والخدمة والفني المناسب هيجيلك</Text></View>
      {servicesLoading ? <ActivityIndicator color={COLORS.navy} /> : <>
        <Text style={styles.fieldLabelPremium}>① اختار المهنة الرئيسية</Text>
        <View style={styles.serviceTilesPremium}>
          {categories.map(category => { const technicianCount = form.area ? Number(category.technicianCountByArea?.[form.area] || 0) : Number(category.technicianCount || 0); return <TouchableOpacity key={category.label} onPress={() => { setSelected(category); updateForm('service', ''); setServicePickerOpen(false); setSubservicePickerOpen(false); requestAnimationFrame(() => clientScrollRef.current?.scrollTo({ y: Math.max(0, clientServiceDetailYRef.current - 24), animated: true })); }} style={[styles.serviceTilePremium, selected?.label === category.label && styles.serviceTilePremiumSelected]}>
            <View style={[styles.serviceIconCircle, selected?.label === category.label && styles.serviceIconCircleSelected]}><Text style={styles.serviceTileIcon}>{category.emoji || '🛠️'}</Text></View>
            <Text style={[styles.serviceTileLabelPremium, selected?.label === category.label && styles.serviceTileLabelPremiumSelected]}>{category.label}</Text>
            <Text style={styles.detailSmall}>{technicianCount} فنيين {form.area ? 'في المنطقة' : 'مسجلين'}</Text>
          </TouchableOpacity>; })}
        </View>
        {selected ? <View onLayout={event => { clientServiceDetailYRef.current = event.nativeEvent.layout.y; }}>
          <Text style={styles.fieldLabelPremium}>② اختار الخدمة التفصيلية</Text>
          <View style={styles.serviceTilesPremium}>
            {(selected.services || []).map(service => { const serviceCount = form.area ? Number(selected.serviceTechnicianCountsByArea?.[service]?.[form.area] || 0) : Number(selected.serviceTechnicianCounts?.[service] || 0); return <TouchableOpacity key={service} onPress={() => { updateForm('service', service); setSubservicePickerOpen(false); requestAnimationFrame(() => { clientScrollRef.current?.scrollTo({ y: Math.max(0, clientFormYRef.current - 16), animated: true }); setTimeout(() => clientAreaInputRef.current?.focus(), 280); }); }} style={[styles.serviceTilePremium, styles.detailTilePremium, form.service === service && styles.serviceTilePremiumSelected]}>
              <View style={[styles.serviceIconCircleSmall, form.service === service && styles.serviceIconCircleSelected]}><Text style={styles.serviceTileIconSmall}>{getServiceEmoji(service)}</Text></View>
              <Text style={[styles.serviceTileLabelPremiumSmall, form.service === service && styles.serviceTileLabelPremiumSelected]}>{service}</Text>
              <Text style={styles.detailSmall}>{serviceCount} فنيين {form.area ? 'في المنطقة' : 'مسجلين'}</Text>
            </TouchableOpacity>; })}
          </View>
        </View> : null}
        <View onLayout={event => { clientFormYRef.current = event.nativeEvent.layout.y; }} style={styles.formCard}><AreaPicker label="المنطقة أو الحي *" options={areas} value={form.area} onChange={value => updateForm('area', value)} multiple={false} inputRef={clientAreaInputRef} technicianCounts={areaTechnicianCounts} />
        {form.area ? <Field inputRef={clientAddressInputRef} label="العنوان بالتفصيل *" value={form.address} onChangeText={v => updateForm('address', v)} placeholder="الشارع ورقم العقار وأقرب علامة مميزة" returnKeyType="next" returnKeyLabel="التالي" onSubmitEditing={() => clientDescriptionInputRef.current?.focus()} blurOnSubmit={false} /> : null}
        <VoiceRecorder value={form.voiceRecordingData} onChange={value => updateForm('voiceRecordingData', value)} disabled={loginLoading} />
        <Field inputRef={clientDescriptionInputRef} label="تفاصيل الشغل المطلوبة (اكتب وصفًا أو سجّل صوتيًا)" value={form.description} onChangeText={v => updateForm('description', v)} multiline placeholder="اكتب تفاصيل الخدمة اللي محتاجها" returnKeyType="next" returnKeyLabel="التالي" onSubmitEditing={() => clientBudgetInputRef.current?.focus()} blurOnSubmit />
        <Field inputRef={clientBudgetInputRef} label="ميزانية متوقعة (اختياري)" value={form.budget} onChangeText={v => updateForm('budget', v)} placeholder="مثال: من 300 إلى 500 جنيه" returnKeyType="go" returnKeyLabel="إرسال الطلب" onSubmitEditing={createOrder} blurOnSubmit />
        <Button title={loginLoading ? 'جاري إرسال الطلب...' : '🚀 إرسال طلب الخدمة'} onPress={createOrder} disabled={loginLoading} /></View>
      </>}</> : null}
      {clientData.sn ? <View style={styles.codeRowPremium}><Text selectable style={styles.successText}>كود الطلب: {clientData.sn}</Text><Button title="نسخ" secondary onPress={() => copyOrderCode(clientData.sn)} /></View> : null}
      {clientTab === 'current' && !clientData.orders.some(order => !isPreviousClientOrder(order)) ? <View style={styles.formCard}><Text style={styles.emptyText}>لا توجد طلبات جارية لديك حاليًا.</Text></View> : null}
      {clientTab === 'previous' && !clientData.orders.some(order => isPreviousClientOrder(order)) ? <View style={styles.formCard}><Text style={styles.emptyText}>لا توجد طلبات سابقة حتى الآن.</Text></View> : null}
      {['current', 'previous'].includes(clientTab) ? clientData.orders.filter(order => clientTab === 'previous' ? isPreviousClientOrder(order) : !isPreviousClientOrder(order)).map((order, i) => {
        const sn = getOrderSN(order), expanded = Boolean(expandedClientOrders[sn]), rating = ratingDrafts[sn];
        return <View key={String(order._id || sn || i)} style={styles.orderCardPremium}>
          <TouchableOpacity onPress={() => setExpandedClientOrders(current => ({ ...current, [sn]: !current[sn] }))} style={styles.orderCardHeader}>
            <View style={[styles.statusDot, ['تم اختيار فني','تم الانتهاء'].includes(order.status) ? styles.statusDotDone : styles.statusDotPending]} />
            <View style={{flex:1}}><Text style={styles.cardTitlePremium}>{order.service || 'طلب خدمة'} — {sn}</Text><Text style={styles.orderStatusSmall}>{order.status || 'قيد المراجعة'} • {order.area || ''}</Text></View>
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {expanded ? <View style={styles.orderCardBody}><Text style={styles.detail}>{dateLabel(order.createdAt)}</Text><Text style={styles.detail}>{order.description || 'لا توجد تفاصيل إضافية.'}</Text>
            {clientTab === 'previous' && ['تم الانتهاء','منتهي','مكتمل','مكتملة','completed','complete','finished'].includes(String(order.status || order.orderStatus || '').trim().toLowerCase()) && !(order.myRating || order.clientRating || order.fanniRating || order.ratingByClient || (order.ratings || []).some(r => r.reviewerRole === 'client')) ? <Button title="⭐ قيّم الفني" onPress={() => { const ratingSN = getOrderSN(order); setRatingDrafts(current => ({ ...current, [ratingSN]: current[ratingSN] || { stars: '5', comment: '', blockFuture: false } })); setRatingPrompt({ role: 'client', order }); }} /> : null}
            {order.status === 'تم اختيار فني' && order.assignedFanniName ? <Text style={styles.detailBold}>الفني: {order.assignedFanniName}</Text> : null}
            {order.status === 'تم اختيار فني' && order.assignedFanniPhone ? <Button title="📞 اتصال بالفني" secondary onPress={() => Linking.openURL(`tel:${order.assignedFanniPhone}`)} /> : null}
            {order.status === 'تم اختيار فني' && !['held','settled'].includes(order.clientPaymentStatus) ? <Button title="💳 ادفع قيمة الخدمة من محفظتك" onPress={() => payForClientOrder(order)} /> : null}
            {order.clientPaymentStatus === 'held' ? <Text style={styles.detail}>تم حجز قيمة الخدمة من محفظتك، وسيتم تحويلها للفني بعد إتمام المهمة.</Text> : null}
            {order.clientPaymentStatus === 'settled' ? <Text style={styles.detail}>تم سداد قيمة الخدمة وتحويل مستحقات الفني.</Text> : null}
            {order.status === 'تم الانتهاء' && order.completionDeclaredAt && !order.clientConfirmedAt ? <Button title="تأكيد استلام الخدمة وبدء ضمان 14 يومًا" onPress={() => confirmClientCompletion(order)} /> : null}
            {order.clientConfirmedAt && order.warrantyExpiresAt ? <Text style={styles.detail}>✓ تم تأكيد الاستلام — ضمان الإصلاح حتى {dateLabel(order.warrantyExpiresAt)}</Text> : null}
            {!['تم اختيار فني','تم الانتهاء','ملغي','مؤرشف','منتهي','منتهي - اعتذار'].includes(order.status) ? <Button title="إلغاء الطلب" secondary onPress={() => cancelClientOrder(order)} /> : null}
            {Array.isArray(order.offers) && order.offers.length ? <><Text style={styles.sectionTitleSmall}>عروض الفنيين ({order.offers.length})</Text>{order.offers.map((offer,j)=><View key={String(offer._id||offer.id||j)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>{offer.fanniName||offer.technicianName||'فني'} — {offer.price??'—'} جنيه</Text><Text style={styles.detail}>المستوى: {offer.fanniLevel || 'غير محدد'} • ★ {Number(offer.fanniRatingAverage||0).toFixed(1)} ({Number(offer.fanniRatingCount||0)} تقييم) • ✓ {Number(offer.fanniCompletedJobs||0)} مهمة مكتملة</Text>{Array.isArray(offer.fanniBadges) && offer.fanniBadges.length ? <Text style={styles.detail}>{offer.fanniBadges.map(technicianBadgeLabel).filter(Boolean).join(' • ')}</Text> : null}<Text style={styles.detail}>{offer.message||''}</Text>{order.status!=='تم اختيار فني'&&order.status!=='تم الانتهاء'&&<><Button title="✅ قبول العرض" onPress={()=>acceptClientOffer(order,offer)}/><Button title={orderChats[sn]?.open && String(orderChats[sn]?.targetOfferId||'')===String(offer._id||offer.id||'')?'إخفاء المحادثة':'💬 محادثة العرض'} secondary onPress={()=>toggleOrderChat({...order,_id:offer._id||offer.id,offerId:offer._id||offer.id},'client')}/></>}</View>)}</> : <Text style={styles.detail}>لا توجد عروض حتى الآن.</Text>}
            {['تم اختيار فني','تم الانتهاء'].includes(order.status) ? <View style={styles.roleActions}><Button title={orderChats[sn]?.open?'إخفاء المحادثة':'💬 محادثة'} secondary onPress={()=>toggleOrderChat({...order,_id:order.acceptedOfferId||order._id,offerId:order.acceptedOfferId||order._id},'client')}/></View> : null}
            {orderChats[sn]?.open ? <View style={styles.chatPanelPremium}>{orderChats[sn]?.loading ? <Text style={styles.detail}>جاري تحميل المحادثة...</Text> : null}{orderChats[sn]?.error ? <Text style={styles.errorText}>{orderChats[sn].error}</Text> : null}{getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).length===0 && !orderChats[sn]?.loading && !orderChats[sn]?.error ? <Text style={styles.detail}>لا توجد رسائل في هذه المحادثة حتى الآن.</Text> : null}{getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).map((entry,j)=>entry._chatItemType==='message' ? <View key={String(entry._id||'message-'+j)} style={[styles.chatMessage, entry.senderRole === 'client' ? styles.chatMessageClient : styles.chatMessageTechnician]}><Text style={styles.detailSmall}>{entry.senderRole==='client'?'أنت':'الفني'} • {dateLabel(entry.createdAt)}</Text><Text style={styles.chatMessageText}>{entry.text}</Text></View> : <View key={String(entry._id||entry.id||'price-'+j)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>طلب تعديل السعر</Text><Text style={styles.detail}>السعر السابق: {entry.oldPrice} جنيه • السعر المطلوب: {entry.newPrice} جنيه</Text><Text style={styles.detail}>السبب: {entry.reason||'—'}</Text><Text style={styles.detail}>الحالة: {entry.status||'—'}</Text>{entry.status==='قيد الموافقة' ? <View style={styles.roleActions}><Button title="موافقة على الزيادة" onPress={()=>decideOrderPrice(order,entry,true)}/><Button title="رفض الزيادة" secondary onPress={()=>decideOrderPrice(order,entry,false)}/></View> : null}</View>)}{!['تم اختيار فني','تم الانتهاء'].includes(order.status) ? <View style={styles.roleActions}>{['هل السعر شامل؟','متى تقدر تيجي؟','هل في تكلفة إضافية؟'].map(question=><Button key={question} title={question} secondary onPress={()=>sendOrderChat({...order,_id:orderChats[sn]?.targetOfferId||order._id,offerId:orderChats[sn]?.targetOfferId||order._id},question)}/>)}</View> : null}{order.status!=='تم الانتهاء' ? <><Field label="رسالة للفني" value={chatDrafts[sn]||''} onChangeText={value=>setChatDrafts(current=>({...current,[sn]:value}))} placeholder="اكتب رسالة" returnKeyType="send" onSubmitEditing={() => sendOrderChat({...order,_id:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id,offerId:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id})} blurOnSubmit /><Button title="إرسال" onPress={()=>sendOrderChat({...order,_id:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id,offerId:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id})}/></> : null}</View>:null}
          </View> : null}
        </View>;
      }) : null}
      {clientTab === 'track' ? <View style={styles.formCard}><Text style={styles.cardTitlePremium}>تتبع طلبك 🔍</Text><Field label="كود الطلب" value={clientTrackSN} onChangeText={setClientTrackSN} placeholder="SN123456" autoCapitalize="characters"/><Button title={clientTrackLoading ? 'جاري البحث...' : 'تتبع الطلب'} onPress={trackClientOrder} disabled={clientTrackLoading}/>{clientTrackError ? <Text style={styles.errorText}>{clientTrackError}</Text> : null}{clientTrackedOrder ? <View style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>{clientTrackedOrder.service || 'طلب خدمة'} — {getOrderSN(clientTrackedOrder)}</Text><Text style={styles.detail}>الحالة: {clientTrackedOrder.status || 'قيد المراجعة'}</Text><Text style={styles.detail}>{clientTrackedOrder.description || 'لا توجد تفاصيل إضافية.'}</Text>{['تم اختيار فني','تم الانتهاء'].includes(clientTrackedOrder.status) ? <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#ECFDF5' }}><Text style={styles.detailBold}>{clientTrackedOrder.status === 'تم الانتهاء' ? 'تم إنهاء المهمة' : 'تم قبول العرض وتعيين الفني لطلبك'}</Text>{clientTrackedOrder.acceptedOfferPrice != null ? <Text style={styles.detail}>سعر التنفيذ المتفق عليه: {clientTrackedOrder.acceptedOfferPrice} جنيه</Text> : null}{clientTrackedOrder.assignedFanniName ? <Text style={styles.detail}>اسم الفني: {clientTrackedOrder.assignedFanniName}</Text> : null}{clientTrackedOrder.status === 'تم اختيار فني' && clientTrackedOrder.assignedFanniPhone ? <Button title={'📞 اتصال بالفني ' + clientTrackedOrder.assignedFanniPhone} secondary onPress={() => Linking.openURL('tel:' + clientTrackedOrder.assignedFanniPhone)} /> : null}</View> : null}{clientTrackedOrder.status === 'تم اختيار فني' && !['held','settled'].includes(clientTrackedOrder.clientPaymentStatus) ? <Button title="💳 ادفع قيمة الخدمة من محفظتك" onPress={() => payForClientOrder(clientTrackedOrder)} /> : null}{clientTrackedOrder.clientPaymentStatus === 'held' ? <Text style={styles.detail}>تم حجز قيمة الخدمة من محفظتك، وسيتم تحويلها للفني بعد إتمام المهمة.</Text> : null}
            {clientTrackedOrder.status === 'تم الانتهاء' && clientTrackedOrder.completionDeclaredAt && !clientTrackedOrder.clientConfirmedAt ? <Button title="تأكيد استلام الخدمة وبدء ضمان 14 يومًا" onPress={() => confirmClientCompletion(clientTrackedOrder)} /> : null}
            {clientTrackedOrder.clientConfirmedAt && clientTrackedOrder.warrantyExpiresAt ? <Text style={styles.detail}>✓ تم تأكيد الاستلام — ضمان الإصلاح حتى {dateLabel(clientTrackedOrder.warrantyExpiresAt)}</Text> : null}{Array.isArray(clientTrackedOrder.offers) && clientTrackedOrder.offers.length ? <><Text style={styles.sectionTitleSmall}>عروض الفنيين ({clientTrackedOrder.offers.length})</Text>{clientTrackedOrder.offers.map((offer, index) => <View key={String(offer._id || index)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>{offer.fanniName || 'فني'} — {offer.price ?? '—'} جنيه</Text><Text style={styles.detail}>المستوى: {offer.fanniLevel || 'غير محدد'} • ★ {Number(offer.fanniRatingAverage || 0).toFixed(1)} ({Number(offer.fanniRatingCount || 0)} تقييم) • ✓ {Number(offer.fanniCompletedJobs || 0)} عمل مكتمل</Text>{Array.isArray(offer.fanniBadges) && offer.fanniBadges.length ? <Text style={styles.detail}>{offer.fanniBadges.map(technicianBadgeLabel).filter(Boolean).join(' • ')}</Text> : null}<Text style={styles.detail}>{offer.message || ''}</Text>{!clientTrackedOrder.acceptedOfferId && !['تم اختيار فني','تم الانتهاء','ملغي','مؤرشف'].includes(clientTrackedOrder.status) ? <><Button title="قبول العرض" onPress={() => acceptClientOffer(clientTrackedOrder, offer)} /></> : null}</View>)}</> : <Text style={styles.detail}>لا توجد عروض حتى الآن.</Text>}<Button title="فتح التفاصيل الكاملة والمحادثة والتقييم" secondary onPress={openTrackedOrderDetails} /></View> : null}</View> : null}
      {clientTab === 'complaint' ? <View style={styles.formCard}><Text style={styles.cardTitlePremium}>تقديم شكوى للإدارة</Text><Field label="كود الطلب" value={clientComplaint.sn} onChangeText={v => setClientComplaint(c => ({ ...c, sn: v.toUpperCase(), error: '' }))} placeholder="SN123456" autoCapitalize="characters"/><Field label="الاسم المسجل" value={clientComplaint.name} onChangeText={v => setClientComplaint(c => ({ ...c, name: v, error: '' }))}/><Field label="تفاصيل الشكوى" value={clientComplaint.text} onChangeText={v => setClientComplaint(c => ({ ...c, text: v, error: '' }))} multiline/><Button title={clientComplaint.loading ? 'جاري الإرسال...' : 'إرسال الشكوى'} onPress={submitClientComplaint} disabled={clientComplaint.loading}/><Text style={[styles.cardTitlePremium, { marginTop: 16 }]}>متابعة الشكاوى</Text><Text style={styles.detail}>تابع حالة شكواك ورد الإدارة عليها باستخدام كود الطلب والاسم المسجل.</Text><Field label="كود الطلب" value={clientComplaintTrack.sn} onChangeText={v => setClientComplaintTrack(c => ({ ...c, sn: v.toUpperCase(), error: '', result: null }))} placeholder="SN123456" autoCapitalize="characters"/><Field label="اسم العميل" value={clientComplaintTrack.name} onChangeText={v => setClientComplaintTrack(c => ({ ...c, name: v, error: '', result: null }))}/><Button title={clientComplaintTrack.loading ? 'جاري تحميل الشكاوى...' : 'متابعة الشكوى'} secondary onPress={trackClientComplaints} disabled={clientComplaintTrack.loading}/>{clientComplaintTrack.error ? <Text style={styles.errorText}>{clientComplaintTrack.error}</Text> : null}{clientComplaintTrack.result ? (Array.isArray(clientComplaintTrack.result.complaints || clientComplaintTrack.result.items || clientComplaintTrack.result.data) ? (clientComplaintTrack.result.complaints || clientComplaintTrack.result.items || clientComplaintTrack.result.data).map((item, index) => <View key={String(item._id || index)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>كود الطلب: {item.sn || clientComplaintTrack.sn}</Text><Text style={styles.detail}>الحالة: {item.status || 'جديدة'}</Text><Text style={styles.detail}>رد الإدارة: {item.adminResponse || 'لم ترد الإدارة بعد.'}</Text>{item.createdAt ? <Text style={styles.detailSmall}>{dateLabel(item.createdAt)}</Text> : null}</View>) : <Text style={styles.detail}>لا توجد شكوى مرتبطة بهذا الطلب.</Text>) : null}</View> : null}
      {clientTab === 'profile' ? <AccountScreen embedded session={session} clientData={clientData} techData={techData} setScreen={setScreen} beginProfileEdit={beginProfileEdit} setRatingPrompt={setRatingPrompt} getOrderSN={getOrderSN} /> : null}
      {clientTab === 'store' ? <StoreScreen role="client" session={session} walletBalance={walletBalance} onWalletBalanceChange={setWalletBalance} /> : null}
      {clientTab === 'wallet' ? <ClientWalletScreen session={session} onBalanceChange={setWalletBalance} /> : null}
      {clientTab === 'subscriptions' ? <ClientSubscriptionsScreen session={session} walletBalance={walletBalance} onWalletBalanceChange={setWalletBalance} onOpenWallet={() => setClientTab('wallet')} /> : null}
      {!referralPageOpen ? <View style={{ position:'absolute',left:10,right:10,bottom:8,height:76,backgroundColor:'#FFFFFF',borderRadius:20,borderWidth:1,borderColor:'#E7EAF2',flexDirection:'row',alignItems:'center',justifyContent:'space-around',elevation:12 }}>
        {[{key:'profile',label:'حسابي',icon:'●'},{key:'current',label:'الطلبات',icon:'▤'},{key:'wallet',label:'المحفظة',icon:'▰'},{key:'store',label:'المتجر',icon:'▣'},{key:'home',label:'الرئيسية',icon:'⌂'}].map(item=><TouchableOpacity key={item.key} onPress={()=>setClientTab(item.key)} style={{ flex:1,alignItems:'center',justifyContent:'center',paddingVertical:8 }}><Text style={{ color:clientTab===item.key?'#101F9B':'#888888',fontSize:22,fontWeight:'900' }}>{item.icon}</Text><Text style={{ color:clientTab===item.key?'#101F9B':'#555555',fontSize:11,fontWeight:clientTab===item.key?'900':'700',marginTop:2 }}>{item.label}</Text></TouchableOpacity>)}
      </View> : null}
      {notificationsOpen ? <Modal transparent visible={notificationsOpen} animationType="fade" onRequestClose={() => setNotificationsOpen(false)}><View style={styles.notificationModalBackdrop}><TouchableOpacity style={styles.notificationModalDismiss} activeOpacity={1} onPress={() => setNotificationsOpen(false)} /><View style={styles.notificationModalCard}><View style={styles.notificationModalHeader}><Text style={styles.cardTitleSmall}>الإشعارات {notifications.unread ? `(${notifications.unread})` : ''}</Text><View style={styles.notificationHeaderActions}>{notifications.unread > 0 ? <Button title="قراءة الكل" secondary onPress={markAllNotificationsRead} /> : null}<Button title="إغلاق" secondary onPress={() => setNotificationsOpen(false)} /></View></View><ScrollView style={styles.notificationModalList} contentContainerStyle={styles.notificationListContent}>{notifications.loading ? <ActivityIndicator color={COLORS.navy} /> : notifications.items.length ? notifications.items.map((item,i)=><TouchableOpacity key={String(item._id||item.id||i)} onPress={()=>markNotificationRead(item)} style={[styles.notificationRow, (item.read || item.readAt) ? styles.notificationRead : styles.notificationUnread]}><Text style={[styles.cardTitleSmall, (item.read || item.readAt) && styles.notificationReadText]}>{item.title||'إشعار'}</Text><Text style={[(item.read || item.readAt) ? styles.notificationReadText : styles.detail]}>{item.message||''}</Text></TouchableOpacity>) : <Text style={styles.emptyText}>لا توجد إشعارات حاليًا.</Text>}</ScrollView></View></View></Modal> : null}</>}
    </ScrollView>
    <View pointerEvents="box-none" style={styles.floatingControls}><TouchableOpacity accessibilityRole="button" accessibilityLabel={isRefreshing ? "جاري تحديث البيانات" : "تحديث البيانات"} accessibilityState={{ busy: isRefreshing }} disabled={isRefreshing} onPress={refreshVisibleData} style={styles.refreshFloatingButton}><LinearGradient colors={['#2563EB', '#0B1B3A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.refreshFloatingGradient}><Animated.View style={{ transform: [{ rotate: refreshRotation }] }}><Svg width={23} height={23} viewBox="0 0 24 24" fill="none"><Path d="M20 11a8 8 0 0 0-14.9-3L3 11" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><Path d="M3 4v7h7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><Path d="M4 13a8 8 0 0 0 14.9 3L21 13" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><Path d="M21 20v-7h-7" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg></Animated.View></LinearGradient></TouchableOpacity></View>
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
    {renderRatingModal('client')}
  </SafeAreaView>;
}
