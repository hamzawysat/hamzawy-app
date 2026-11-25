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
import VoiceRecorder from '../../components/VoiceRecorder';
import VoicePlayback from '../../components/VoicePlayback';
import AreaPicker from '../../components/AreaPicker';
import StoreScreen, { StoreAdBanner } from '../shared/StoreScreen';
import ClientWalletScreen from './ClientWalletScreen';
import ReferralCard, { ReferralPromo } from '../shared/ReferralCard';
import ClientSubscriptionsScreen from './ClientSubscriptionsScreen';
import PublicContentBanner from '../shared/PublicContentBanner';
import { AccountScreen } from '../account/AccountScreens';

const CLIENT_PREVIOUS_ORDER_STATUSES = new Set(['تم الانتهاء', 'منتهي', 'مكتمل', 'مكتملة', 'ملغي', 'مؤرشف', 'منتهي - اعتذار', 'completed', 'complete', 'finished']);
function isPreviousClientOrder(order) {
  return CLIENT_PREVIOUS_ORDER_STATUSES.has(String(order?.status || order?.orderStatus || '').trim().toLowerCase());
}
function clientOrderWalletDue(order) {
  const cashIncreaseTotal = (order?.priceChangeRequests || [])
    .filter(item => item.status === 'مقبول' && item.paymentMethod === 'cash')
    .reduce((sum, item) => sum + Number(item.cashAmount || 0), 0);
  return Math.max(0, Math.round((Number(order?.acceptedOfferPrice || 0) - cashIncreaseTotal - Number(order?.clientPaymentAmount || 0) + Number.EPSILON) * 100) / 100);
}

function technicianBadgeLabel(badge) {
  const key = typeof badge === 'string' ? badge : String(badge?.key || badge?.id || '');
  const labels = { trusted: 'فني موثوق', top_rated: 'الأعلى تقييمًا', verified: 'تم التحقق', fast_response: 'سريع الاستجابة', premium: 'فني مميز', gold: 'الشارة الذهبية' };
  return labels[key] || (typeof badge === 'string' ? badge : badge?.label || badge?.name || badge?.title || '');
}

export function ClientDashboard({ context }) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [activeReplyNotificationId, setActiveReplyNotificationId] = useState('');
  const [notificationReplyDraft, setNotificationReplyDraft] = useState('');
  const [notificationReplySubmitting, setNotificationReplySubmitting] = useState(false);
  const [offerPhotoUrls, setOfferPhotoUrls] = useState({});
  const { screen, setScreenState, screenHistoryRef, screenRef, pushTokenRef, setScreen, categories, setCategories, areas, selected, setSelected, servicesLoading, setServicesLoading, servicesError, setServicesError, reloadKey, setReloadKey, session, setSession, authRestoring, setAuthRestoring, username, setUsername, password, setPassword, loginLoading, setLoginLoading, authMode, setAuthMode, form, setForm, registrationNameRef, registrationPhoneRef, registrationPasswordRef, registrationConfirmPasswordRef, clientAreaInputRef, clientAddressInputRef, areaTechnicianCounts, clientDescriptionInputRef, clientBudgetInputRef, clientServiceDetailYRef, clientFormYRef, clientData, setClientData, techData, setTechData, walletTransferNumbers, setWalletTransferNumbers, assignedDetails, setAssignedDetails, technicianSearch, setTechnicianSearch, technicianServiceFilter, setTechnicianServiceFilter, guidelinesChecked, setGuidelinesChecked, guidelinesReachedEnd, setGuidelinesReachedEnd, guidelinesViewportHeight, setGuidelinesViewportHeight, adminData, setAdminData, topup, setTopup, clientTab, setClientTab, clientServiceSearch, setClientServiceSearch, servicePickerOpen, setServicePickerOpen, subservicePickerOpen, setSubservicePickerOpen, ratingPrompt, setRatingPrompt, dismissedRatings, setDismissedRatings, ratingDismissalsLoaded, setRatingDismissalsLoaded, ratingDismissalsLoadedFor, setRatingDismissalsLoadedFor, clientTrackSN, setClientTrackSN, clientTrackedOrder, setClientTrackedOrder, clientTrackError, setClientTrackError, clientTrackLoading, setClientTrackLoading, clientComplaint, setClientComplaint, clientComplaintTrack, setClientComplaintTrack, expandedClientOrders, setExpandedClientOrders, expandedTechnicianOrders, setExpandedTechnicianOrders, notificationsOpen, setNotificationsOpen, clientScrollRef, chatScrollRef, clientChatScrollRefs, clientChatAtBottomRef, ratingSubmittingRef, offerDraft, setOfferDraft, notifications, setNotifications, orderChats, setOrderChats, orderChatsRef, acceptedChatAutoOpenedRef, chatDrafts, setChatDrafts, priceDrafts, setPriceDrafts, ratingDrafts, setRatingDrafts, ratingSubmitting, setRatingSubmitting, dismissedRatingsRef, ratingHandledRef, ratingStatusSnapshotRef, adminUsers, setAdminUsers, adminExtras, setAdminExtras, adminServiceDraft, setAdminServiceDraft, adminServiceEdit, setAdminServiceEdit, adminRegionDraft, setAdminRegionDraft, adminAnnouncementDraft, setAdminAnnouncementDraft, adminFaqDraft, setAdminFaqDraft, adminReportFilters, setAdminReportFilters, adminWallet, setAdminWallet, adminUsersLoading, setAdminUsersLoading, broadcast, setBroadcast, supportCases, setSupportCases, supportCase, setSupportCase, supportDraft, setSupportDraft, supportSubject, setSupportSubject, supportLoading, setSupportLoading, supportError, setSupportError, accountPasswordForm, setAccountPasswordForm, profileEditForm, setProfileEditForm, profileEditOpenCategory, setProfileEditOpenCategory, recoveryForm, setRecoveryForm, adminSupportCases, setAdminSupportCases, adminSupportSelected, setAdminSupportSelected, adminSupportDraft, setAdminSupportDraft, adminRecoveryCases, setAdminRecoveryCases, adminRecoverySelected, setAdminRecoverySelected, adminRecoveryCode, setAdminRecoveryCode, adminRecoveryDraft, setAdminRecoveryDraft, services, updateForm, ratingAccountId, ratingStorageKey, previousRatingStorageKey, legacyRatingStorageKey, oldestRatingStorageKey, markNotificationRead, markAllNotificationsRead, updateProfessionalLevel, changeAdminRoleForFanni, revokeAdminRoleForUser, moderateTechnician, publishOrder, reviewTopup, setComplaintStatus, handleLogin, registerClient, registerTechnician, createOrder, trackClientOrder, submitClientComplaint, trackClientComplaints, sendOffer, submitOffer, cancelClientOrder, acceptClientOffer, completeTechnicianOrder, getOrderSN, uniqueByOrderSN, orderToken, refreshVisibleData, refreshOrderChat, toggleOrderChat, sendOrderChat, requestOrderPriceChange, decideOrderPrice, setOrderRatingStars, renderRatingStars, submitOrderRating, saveRatingDismissal, renderRatingModal, sendAdminBroadcast, acceptTechnicianGuidelines, submitTopup, loadSupportCases, startSupportCase, openSupportCase, sendSupportMessage, loadAdminSupportCases, loadAdminRecoveryCases, openAdminRecovery, issueAdminRecoveryCode, replyAdminRecovery, replyAdminSupport, beginProfileEdit, toggleProfileEditSpecialty, saveProfileEdits, changeAccountPassword, startPasswordRecovery, refreshPasswordRecovery, sendRecoveryMessage, verifyRecoveryCode, resetRecoveredPassword, adminRefreshExtras, adminAddService, adminBeginServiceEdit, adminSaveServiceEdit, adminMoveCategory, adminMoveService, adminToggleService, adminDeleteService, adminSavePricing, adminAddRegion, adminSaveSettings, adminAddFaqDraft, adminSaveContent, adminGenerateReport, adminOrderAction, adminClientAction, adminSetTechnicianLevel, adminLoadWalletTransactions, adminWalletAction, adminLoadAuditLogs, copyOrderCode, openWhatsAppSupport, performLogout, logout, goLogin, toggleArray } = context;
  const openClientNotification = async item => {
    const id = String(item?._id || item?.id || '');
    if (!id) return;
    if (!item.replyEnabled) { markNotificationRead(item); return; }
    if (!item.read && !item.readAt) {
      try {
        await api('/notifications/client/' + encodeURIComponent(id) + '/read', { method: 'PATCH', token: session?.token });
        setNotifications(current => ({ ...current, items: current.items.map(n => String(n._id || n.id) === id ? { ...n, read: true, readAt: new Date().toISOString() } : n), unread: Math.max(0, Number(current.unread || 0) - 1) }));
      } catch (error) { Alert.alert('الإشعارات', error.message || 'تعذر تحديث الإشعار.'); return; }
    }
    setActiveReplyNotificationId(id);
    setNotificationReplyDraft(item.reply?.message || '');
  };
  useEffect(() => {\n    if (!notificationsOpen) { setActiveReplyNotificationId(''); return; }\n    const pending = (notifications?.items || []).find(item => item.replyEnabled && !item.reply);\n    if (pending) { setActiveReplyNotificationId(String(pending._id || pending.id)); setNotificationReplyDraft(''); }\n  }, [notificationsOpen, notifications?.items]);\n  const submitClientNotificationReply = async () => {
    const message = String(notificationReplyDraft || '').trim();
    const item = (notifications?.items || []).find(n => String(n._id || n.id) === activeReplyNotificationId);
    if (!item || !item.replyEnabled || item.reply || !message || notificationReplySubmitting) return;
    setNotificationReplySubmitting(true);
    try {
      const result = await api('/notifications/client/' + encodeURIComponent(activeReplyNotificationId) + '/reply', { method: 'POST', token: session?.token, body: { message } });
      setNotifications(current => ({ ...current, items: current.items.map(n => String(n._id || n.id) === activeReplyNotificationId ? { ...n, reply: { message, sentAt: result.reply?.sentAt || new Date().toISOString() } } : n) }));
      setNotificationReplyDraft(message);
    } catch (error) { Alert.alert('الإشعارات', error.message || 'تعذر إرسال الرد.'); }
    finally { setNotificationReplySubmitting(false); }
  };
  useEffect(() => {
    if (clientTab !== 'current' || !session?.token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await api('/client/orders/offers/mark-viewed', { method: 'POST', token: session.token, body: {} });
        if (!cancelled) await refreshVisibleData();
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [clientTab, session?.token]);
  useEffect(() => {
    let cancelled = false;
    const paths = [...new Set((clientData.orders || []).flatMap(order => (order.offers || []).map(offer => String(offer.fanniPhotoUrl || '').trim()).filter(Boolean)))];
    Promise.all(paths.map(async path => {
      try { return [path, await getApiUrl((path.startsWith('/api/') ? path.slice(4) : path))]; }
      catch (_) { return [path, '']; }
    })).then(entries => {
      if (!cancelled) setOfferPhotoUrls(Object.fromEntries(entries.filter(([, url]) => url)));
    });
    return () => { cancelled = true; };
  }, [clientData.orders]);
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
  const unreadOffersCount = clientData.orders.reduce((total, order) => total + (isPreviousClientOrder(order) ? 0 : Number(order.unreadOffersCount || 0)), 0);
  const newOffersPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!unreadOffersCount) { newOffersPulse.setValue(1); return undefined; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(newOffersPulse, { toValue: 0.25, duration: 520, useNativeDriver: true }),
      Animated.timing(newOffersPulse, { toValue: 1, duration: 520, useNativeDriver: true })
    ]));
    animation.start();
    return () => animation.stop();
  }, [unreadOffersCount, newOffersPulse]);
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
      <View style={{height:64,backgroundColor:'#FFF',paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#E7EAF2'}}>
        <TouchableOpacity onPress={()=>{setNotificationsOpen(v=>!v);setReloadKey(v=>v+1);}} style={{width:42,height:42,alignItems:'center',justifyContent:'center'}}><Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="#8A94A6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>{notifications.unread>0?<View style={{position:'absolute',top:1,left:1,minWidth:17,height:17,borderRadius:9,backgroundColor:'#E5484D',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#FFF',fontSize:10,fontWeight:'900'}}>{notifications.unread}</Text></View>:null}</TouchableOpacity>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{color:'#102A9B',fontSize:24,fontWeight:'900'}}>ساتڤيو</Text><Svg width={30} height={32} viewBox="0 0 30 32"><Path d="M5 6c8.2.7 14.3 6.8 15 15-8.2-.7-14.3-6.8-15-15Z" fill="#102A9B"/><Path d="M5 6a17 17 0 0 1 15 15m-4-2 7 7m-7-7 2-5m5 12 3 2M10 29h15m-8-4v4" fill="none" stroke="#102A9B" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"/></Svg></View>
      </View>
      <View style={{minHeight:76,paddingHorizontal:16,paddingVertical:10,backgroundColor:'#F2F4F9',flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between'}}>
        <View style={{flexDirection:'row-reverse',alignItems:'center',flex:1}}>
          <View style={{width:34,height:34,alignItems:'center',justifyContent:'center',marginLeft:10}}><Text style={{color:'#8195E5',fontSize:35,lineHeight:37,fontWeight:'900',textShadowColor:'#DCE4FF',textShadowOffset:{width:0,height:1},textShadowRadius:3}}>✦</Text><Text style={{position:'absolute',color:'#172554',fontSize:14,fontWeight:'900',fontStyle:'italic',textShadowColor:'#FFFFFF',textShadowOffset:{width:0,height:0},textShadowRadius:2,transform:[{rotate:'-8deg'}]}}>{String(session.user?.name||'ع').trim().charAt(0)}</Text></View>
          <View style={{flex:1}}><Text style={{color:'#09145B',fontSize:16,fontWeight:'900',textAlign:'right'}}>مرحباً {session.user?.name||'بك'}</Text><Text style={{color:'#46506B',fontSize:12,fontWeight:'700',textAlign:'right',marginTop:3}}>عميل • {walletBalance.toLocaleString('ar-EG')} جنيه</Text></View>
        </View>
      </View>
      {!referralPageOpen ? <StoreAdBanner role="client" session={session} visible={clientTab !== 'store'} onOpenStore={() => setClientTab('store')} /> : null}

    <ScrollView ref={clientScrollRef} contentContainerStyle={[styles.page, { paddingBottom: 132 }]} showsVerticalScrollIndicator={false}>
      {referralPageOpen ? <View style={styles.formCard}><Button title="← رجوع للرئيسية" secondary onPress={() => setReferralPageOpen(false)} /><ReferralCard session={session} kind="client" expanded showToggle={false} /></View> : <><PublicContentBanner role="client" />
      {clientTab === 'home' ? <View style={{paddingHorizontal:12,paddingTop:8,gap:10}}>
        <TouchableOpacity onPress={() => { setClientTab('new'); setClientNewRequestChoice(''); }} activeOpacity={0.9} style={{backgroundColor:'#092D9E',borderRadius:18,padding:14,minHeight:116,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
          <View style={{flex:1}}><Text style={{color:'#FFF',fontSize:18,fontWeight:'900',textAlign:'right'}}>اطلب خدمتك بسهولة</Text><Text style={{color:'#E3EAFF',fontSize:13,fontWeight:'700',textAlign:'right',marginTop:6}}>اختار الخدمة المناسبة وهنوصلك بالفني</Text><View style={{alignSelf:'flex-end',backgroundColor:'#FFF',borderRadius:11,paddingHorizontal:14,paddingVertical:8,marginTop:12}}><Text style={{color:'#102A9B',fontSize:13,fontWeight:'900'}}>اطلب الآن ←</Text></View></View>
          <View style={{width:54,height:54,borderRadius:27,backgroundColor:'#DCE6FF',alignItems:'center',justifyContent:'center',marginLeft:12}}><Text style={{fontSize:26}}>🛠️</Text></View>
        </TouchableOpacity>
        <Text style={{color:'#07145C',fontSize:22,fontWeight:'900',textAlign:'right'}}>الإحصائيات</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10}}>
          {[{label:'طلبات جارية',value:clientData.orders.filter(order=>!isPreviousClientOrder(order)).length,icon:'📋',action:'current'},{label:'رصيد المحفظة',value:walletBalance.toLocaleString('ar-EG')+' ج',icon:'💳',action:'wallet'},{label:'طلبات سابقة',value:clientData.orders.filter(order=>isPreviousClientOrder(order)).length,icon:'✓',action:'previous'},{label:'إجمالي الطلبات',value:clientData.orders.length,icon:'📄',action:'current'}].map(item=><TouchableOpacity key={item.label} onPress={()=>setClientTab(item.action)} style={{width:'48%',minHeight:108,backgroundColor:'#FFF',borderRadius:16,padding:10,alignItems:'center',justifyContent:'center',elevation:3,shadowColor:'#172554',shadowOpacity:.09,shadowRadius:7,shadowOffset:{width:0,height:3},position:'relative'}}>{item.action==='current'&&item.label==='طلبات جارية'&&unreadOffersCount>0?<Animated.View style={{position:'absolute',top:7,left:7,zIndex:2,opacity:newOffersPulse,backgroundColor:'#DC2626',borderColor:'#FCA5A5',borderWidth:1,borderRadius:20,paddingHorizontal:8,paddingVertical:4}}><Text style={{color:'#FFF',fontSize:9,fontWeight:'900'}}>{unreadOffersCount} {unreadOffersCount===1?'عرض جديد':'عروض جديدة'}</Text></Animated.View>:null}<View style={{width:42,height:42,borderRadius:21,backgroundColor:'#E3E9FF',alignItems:'center',justifyContent:'center',marginBottom:5}}><Text style={{fontSize:21}}>{item.icon}</Text></View><Text style={{color:'#50566A',fontSize:12,fontWeight:'700'}}>{item.label}</Text><Text style={{color:'#09145B',fontSize:20,fontWeight:'900',marginTop:2}}>{item.value}</Text></TouchableOpacity>)}
        </View>
        <ReferralPromo onPress={()=>setReferralPageOpen(true)} style={{backgroundColor:'#DCE5FF',borderRadius:13,padding:8,flexDirection:'row-reverse',alignItems:'center',gap:9}}><Text style={{fontSize:21}}>🎁</Text><View style={{flex:1}}><Text style={{color:'#09145B',fontSize:14,fontWeight:'900',textAlign:'right'}}>ادعُ صديقك واربح 50 جنيه</Text><Text style={{color:'#26356E',fontSize:11,fontWeight:'700',textAlign:'right',marginTop:3}}>شارك رابط الدعوة واكسب رصيد عند انضمام صديقك</Text></View><View style={{backgroundColor:'#102A9B',borderRadius:11,paddingHorizontal:11,paddingVertical:9}}><Text style={{color:'#FFF',fontWeight:'900',fontSize:12}}>دعوة الآن ←</Text></View></ReferralPromo>
        <Text style={{color:'#07145C',fontSize:22,fontWeight:'900',textAlign:'right'}}>إجراءات سريعة</Text>
        <View style={{backgroundColor:'#FFF',borderRadius:17,paddingHorizontal:12,elevation:3}}>
          {[{label:'سجل الطلبات',icon:'📋',run:()=>setClientTab('current')},{label:'التقارير',icon:'📊',run:()=>setClientTab('previous')},{label:'الإعدادات',icon:'⚙️',run:()=>setClientTab('profile')},{label:'طلب دعم فني',icon:'🎧',run:()=>setScreen('support')}].map((item,index)=><TouchableOpacity key={item.label} onPress={item.run} style={{minHeight:52,flexDirection:'row-reverse',alignItems:'center',borderBottomWidth:index===3?0:1,borderBottomColor:'#EDF0F5',gap:12}}><Text style={{fontSize:21,width:28,textAlign:'center'}}>{item.icon}</Text><Text style={{flex:1,color:'#111827',fontSize:15,fontWeight:'800',textAlign:'right'}}>{item.label}</Text><Text style={{color:'#CBD0D9',fontSize:24}}>‹</Text></TouchableOpacity>)}
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
            <View style={[styles.statusDot, ['تم اختيار فني','بانتظار تأكيد العميل','تم الانتهاء'].includes(order.status) ? styles.statusDotDone : styles.statusDotPending]} />
            <View style={{flex:1}}><Text style={styles.cardTitlePremium}>{order.service || 'طلب خدمة'} — {sn}</Text><Text style={styles.orderStatusSmall}>{order.status || 'قيد المراجعة'} • {order.area || ''}</Text></View>
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {expanded ? <View style={styles.orderCardBody}><Text style={styles.detail}>{dateLabel(order.createdAt)}</Text><Text style={styles.detail}>{order.description || 'لا توجد تفاصيل إضافية.'}</Text>
            {clientTab === 'previous' && ['تم الانتهاء','منتهي','مكتمل','مكتملة','completed','complete','finished'].includes(String(order.status || order.orderStatus || '').trim().toLowerCase()) && !(order.myRating || order.clientRating || order.fanniRating || order.ratingByClient || (order.ratings || []).some(r => r.reviewerRole === 'client')) ? <Button title="⭐ قيّم الفني" onPress={() => { const ratingSN = getOrderSN(order); setRatingDrafts(current => ({ ...current, [ratingSN]: current[ratingSN] || { stars: '5', comment: '', blockFuture: false } })); setRatingPrompt({ role: 'client', order }); }} /> : null}
            {order.status === 'تم اختيار فني' && order.assignedFanniName ? <Text style={styles.detailBold}>الفني: {order.assignedFanniName}</Text> : null}
            {order.status === 'تم اختيار فني' && order.assignedFanniPhone ? <Button title="📞 اتصال بالفني" secondary onPress={() => Linking.openURL(`tel:${order.assignedFanniPhone}`)} /> : null}
            {order.status === 'تم اختيار فني' && clientOrderWalletDue(order) > 0 && order.clientPaymentStatus !== 'settled' ? <Button title={'💳 ادفع المبلغ المتبقي من محفظتك (' + clientOrderWalletDue(order) + ' جنيه)'} onPress={() => payForClientOrder(order)} /> : null}
            {order.clientPaymentStatus === 'held' ? <Text style={styles.detail}>تم حجز {Number(order.clientPaymentAmount || 0)} جنيه من محفظتك.{clientOrderWalletDue(order) > 0 ? ' المتبقي عبر المحفظة ' + clientOrderWalletDue(order) + ' جنيه.' : ' وسيتم تحويل المبلغ المحجوز للفني بعد تأكيد استلام الخدمة.'}</Text> : null}
            {order.clientPaymentStatus === 'settled' ? <Text style={styles.detail}>تم سداد قيمة الخدمة وتحويل مستحقات الفني.</Text> : null}
            {order.status === 'بانتظار تأكيد العميل' && order.completionDeclaredAt && !order.clientConfirmedAt ? <Button title="تأكيد استلام الخدمة وبدء ضمان 14 يومًا" onPress={() => confirmClientCompletion(order)} /> : null}
            {order.clientConfirmedAt && order.warrantyExpiresAt ? <Text style={styles.detail}>✓ تم تأكيد الاستلام — ضمان الإصلاح حتى {dateLabel(order.warrantyExpiresAt)}</Text> : null}
            {!['تم اختيار فني','بانتظار تأكيد العميل','تم الانتهاء','ملغي','مؤرشف','منتهي','منتهي - اعتذار'].includes(order.status) ? <Button title="إلغاء الطلب" secondary onPress={() => cancelClientOrder(order)} /> : null}
            {Array.isArray(order.offers) && order.offers.length ? <><Text style={styles.sectionTitleSmall}>عروض الفنيين ({order.offers.length})</Text>{order.offers.map((offer,j)=><View key={String(offer._id||offer.id||j)} style={styles.offerCardPremium}><View style={{flexDirection:'row-reverse',alignItems:'center',gap:10}}>{offerPhotoUrls[offer.fanniPhotoUrl] ? <Image source={{uri:offerPhotoUrls[offer.fanniPhotoUrl]}} style={{width:48,height:48,borderRadius:24,backgroundColor:'#EEF2FF'}} /> : <View style={{width:48,height:48,borderRadius:24,backgroundColor:'#E8EDFF',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:20,fontWeight:'900',color:'#102A9B'}}>{String(offer.fanniName||offer.technicianName||'ف').trim().charAt(0)}</Text></View>}<View style={{flex:1}}><Text style={styles.cardTitleSmall}>{offer.fanniName||offer.technicianName||'فني'} — {offer.price??'—'} جنيه</Text><Text style={styles.detail}>المستوى: {offer.fanniLevel || 'غير محدد'} • ★ {Number(offer.fanniRatingAverage||0).toFixed(1)} ({Number(offer.fanniRatingCount||0)} تقييم) • ✓ {Number(offer.fanniCompletedJobs||0)} مهمة مكتملة</Text></View></View>{Array.isArray(offer.fanniBadges) && offer.fanniBadges.length ? <Text style={styles.detail}>{offer.fanniBadges.map(technicianBadgeLabel).filter(Boolean).join(' • ')}</Text> : null}<Text style={styles.detail}>{offer.message||''}</Text>{order.status!=='تم اختيار فني'&&order.status!=='بانتظار تأكيد العميل'&&order.status!=='تم الانتهاء'&&<><Button title="✅ قبول العرض" onPress={()=>acceptClientOffer(order,offer)}/><Button title={orderChats[sn]?.open && String(orderChats[sn]?.targetOfferId||'')===String(offer._id||offer.id||'')?'إخفاء المحادثة':'💬 محادثة العرض'} secondary onPress={()=>toggleOrderChat({...order,_id:offer._id||offer.id,offerId:offer._id||offer.id},'client')}/></>}</View>)}</> : <Text style={styles.detail}>لا توجد عروض حتى الآن.</Text>}
            {['تم اختيار فني','بانتظار تأكيد العميل','تم الانتهاء'].includes(order.status) ? <View style={styles.roleActions}><Button title={orderChats[sn]?.open?'إخفاء المحادثة':'💬 محادثة'} secondary onPress={()=>toggleOrderChat({...order,_id:order.acceptedOfferId||order._id,offerId:order.acceptedOfferId||order._id},'client')}/></View> : null}
            {orderChats[sn]?.open ? <View style={styles.chatPanelPremium}>{orderChats[sn]?.loading ? <Text style={styles.detail}>جاري تحميل المحادثة...</Text> : null}{orderChats[sn]?.error ? <Text style={styles.errorText}>{orderChats[sn].error}</Text> : null}{getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).length===0 && !orderChats[sn]?.loading && !orderChats[sn]?.error ? <Text style={styles.detail}>لا توجد رسائل في هذه المحادثة حتى الآن.</Text> : null}{getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).map((entry,j)=>entry._chatItemType==='message' ? <View key={String(entry._id||'message-'+j)} style={[styles.chatMessage, entry.senderRole === 'client' ? styles.chatMessageClient : styles.chatMessageTechnician]}><Text style={styles.detailSmall}>{entry.senderRole==='client'?'أنت':'الفني'} • {dateLabel(entry.createdAt)}</Text><Text style={styles.chatMessageText}>{entry.text}</Text></View> : <View key={String(entry._id||entry.id||'price-'+j)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>طلب تعديل السعر</Text><Text style={styles.detail}>السعر السابق: {entry.oldPrice} جنيه • السعر المطلوب: {entry.newPrice} جنيه</Text><Text style={styles.detail}>السبب: {entry.reason||'—'}</Text><Text style={styles.detail}>الحالة: {entry.status||'—'}</Text>{entry.status==='قيد الموافقة' ? <View style={styles.roleActions}><Button title="موافقة على الزيادة" onPress={()=>decideOrderPrice(order,entry,true)}/><Button title="رفض الزيادة" secondary onPress={()=>decideOrderPrice(order,entry,false)}/></View> : null}</View>)}{!['تم اختيار فني','بانتظار تأكيد العميل','تم الانتهاء'].includes(order.status) ? <View style={styles.roleActions}>{['هل السعر شامل؟','متى تقدر تيجي؟','هل في تكلفة إضافية؟'].map(question=><Button key={question} title={question} secondary onPress={()=>sendOrderChat({...order,_id:orderChats[sn]?.targetOfferId||order._id,offerId:orderChats[sn]?.targetOfferId||order._id},question)}/>)}</View> : null}{order.status!=='تم الانتهاء' ? <><Field label="رسالة للفني" value={chatDrafts[sn]||''} onChangeText={value=>setChatDrafts(current=>({...current,[sn]:value}))} placeholder="اكتب رسالة" returnKeyType="send" onSubmitEditing={() => sendOrderChat({...order,_id:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id,offerId:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id})} blurOnSubmit /><Button title="إرسال" onPress={()=>sendOrderChat({...order,_id:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id,offerId:orderChats[sn]?.targetOfferId||order.acceptedOfferId||order._id})}/></> : null}</View>:null}
          </View> : null}
        </View>;
      }) : null}
      {clientTab === 'track' ? <View style={styles.formCard}><Text style={styles.cardTitlePremium}>تتبع طلبك 🔍</Text><Field label="كود الطلب" value={clientTrackSN} onChangeText={setClientTrackSN} placeholder="SN123456" autoCapitalize="characters"/><Button title={clientTrackLoading ? 'جاري البحث...' : 'تتبع الطلب'} onPress={trackClientOrder} disabled={clientTrackLoading}/>{clientTrackError ? <Text style={styles.errorText}>{clientTrackError}</Text> : null}{clientTrackedOrder ? <View style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>{clientTrackedOrder.service || 'طلب خدمة'} — {getOrderSN(clientTrackedOrder)}</Text><Text style={styles.detail}>الحالة: {clientTrackedOrder.status || 'قيد المراجعة'}</Text><Text style={styles.detail}>{clientTrackedOrder.description || 'لا توجد تفاصيل إضافية.'}</Text>{['تم اختيار فني','بانتظار تأكيد العميل','تم الانتهاء'].includes(clientTrackedOrder.status) ? <View style={{ marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#ECFDF5' }}><Text style={styles.detailBold}>{clientTrackedOrder.status === 'تم الانتهاء' ? 'تم تأكيد إنهاء الخدمة' : clientTrackedOrder.status === 'بانتظار تأكيد العميل' ? 'الفني أعلن إنهاء الخدمة — في انتظار تأكيدك' : 'تم قبول العرض وتعيين الفني لطلبك'}</Text>{clientTrackedOrder.acceptedOfferPrice != null ? <Text style={styles.detail}>سعر التنفيذ المتفق عليه: {clientTrackedOrder.acceptedOfferPrice} جنيه</Text> : null}{clientTrackedOrder.assignedFanniName ? <Text style={styles.detail}>اسم الفني: {clientTrackedOrder.assignedFanniName}</Text> : null}{clientTrackedOrder.status === 'تم اختيار فني' && clientTrackedOrder.assignedFanniPhone ? <Button title={'📞 اتصال بالفني ' + clientTrackedOrder.assignedFanniPhone} secondary onPress={() => Linking.openURL('tel:' + clientTrackedOrder.assignedFanniPhone)} /> : null}</View> : null}{clientTrackedOrder.status === 'تم اختيار فني' && clientOrderWalletDue(clientTrackedOrder) > 0 && clientTrackedOrder.clientPaymentStatus !== 'settled' ? <Button title={'💳 ادفع المبلغ المتبقي من محفظتك (' + clientOrderWalletDue(clientTrackedOrder) + ' جنيه)'} onPress={() => payForClientOrder(clientTrackedOrder)} /> : null}{clientTrackedOrder.clientPaymentStatus === 'held' ? <Text style={styles.detail}>تم حجز {Number(clientTrackedOrder.clientPaymentAmount || 0)} جنيه من محفظتك.{clientOrderWalletDue(clientTrackedOrder) > 0 ? ' المتبقي عبر المحفظة ' + clientOrderWalletDue(clientTrackedOrder) + ' جنيه.' : ' وسيتم تحويل المبلغ المحجوز للفني بعد تأكيد استلام الخدمة.'}</Text> : null}
            {clientTrackedOrder.status === 'بانتظار تأكيد العميل' && clientTrackedOrder.completionDeclaredAt && !clientTrackedOrder.clientConfirmedAt ? <Button title="تأكيد استلام الخدمة وبدء ضمان 14 يومًا" onPress={() => confirmClientCompletion(clientTrackedOrder)} /> : null}
            {clientTrackedOrder.clientConfirmedAt && clientTrackedOrder.warrantyExpiresAt ? <Text style={styles.detail}>✓ تم تأكيد الاستلام — ضمان الإصلاح حتى {dateLabel(clientTrackedOrder.warrantyExpiresAt)}</Text> : null}{Array.isArray(clientTrackedOrder.offers) && clientTrackedOrder.offers.length ? <><Text style={styles.sectionTitleSmall}>عروض الفنيين ({clientTrackedOrder.offers.length})</Text>{clientTrackedOrder.offers.map((offer, index) => <View key={String(offer._id || index)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>{offer.fanniName || 'فني'} — {offer.price ?? '—'} جنيه</Text><Text style={styles.detail}>المستوى: {offer.fanniLevel || 'غير محدد'} • ★ {Number(offer.fanniRatingAverage || 0).toFixed(1)} ({Number(offer.fanniRatingCount || 0)} تقييم) • ✓ {Number(offer.fanniCompletedJobs || 0)} عمل مكتمل</Text>{Array.isArray(offer.fanniBadges) && offer.fanniBadges.length ? <Text style={styles.detail}>{offer.fanniBadges.map(technicianBadgeLabel).filter(Boolean).join(' • ')}</Text> : null}<Text style={styles.detail}>{offer.message || ''}</Text>{!clientTrackedOrder.acceptedOfferId && !['تم اختيار فني','بانتظار تأكيد العميل','تم الانتهاء','ملغي','مؤرشف'].includes(clientTrackedOrder.status) ? <><Button title="قبول العرض" onPress={() => acceptClientOffer(clientTrackedOrder, offer)} /></> : null}</View>)}</> : <Text style={styles.detail}>لا توجد عروض حتى الآن.</Text>}<Button title="فتح التفاصيل الكاملة والمحادثة والتقييم" secondary onPress={openTrackedOrderDetails} /></View> : null}</View> : null}
      {clientTab === 'complaint' ? <View style={styles.formCard}><Text style={styles.cardTitlePremium}>تقديم شكوى للإدارة</Text><Field label="كود الطلب" value={clientComplaint.sn} onChangeText={v => setClientComplaint(c => ({ ...c, sn: v.toUpperCase(), error: '' }))} placeholder="SN123456" autoCapitalize="characters"/><Field label="الاسم المسجل" value={clientComplaint.name} onChangeText={v => setClientComplaint(c => ({ ...c, name: v, error: '' }))}/><Field label="تفاصيل الشكوى" value={clientComplaint.text} onChangeText={v => setClientComplaint(c => ({ ...c, text: v, error: '' }))} multiline/><Button title={clientComplaint.loading ? 'جاري الإرسال...' : 'إرسال الشكوى'} onPress={submitClientComplaint} disabled={clientComplaint.loading}/><Text style={[styles.cardTitlePremium, { marginTop: 16 }]}>متابعة الشكاوى</Text><Text style={styles.detail}>تابع حالة شكواك ورد الإدارة عليها باستخدام كود الطلب والاسم المسجل.</Text><Field label="كود الطلب" value={clientComplaintTrack.sn} onChangeText={v => setClientComplaintTrack(c => ({ ...c, sn: v.toUpperCase(), error: '', result: null }))} placeholder="SN123456" autoCapitalize="characters"/><Field label="اسم العميل" value={clientComplaintTrack.name} onChangeText={v => setClientComplaintTrack(c => ({ ...c, name: v, error: '', result: null }))}/><Button title={clientComplaintTrack.loading ? 'جاري تحميل الشكاوى...' : 'متابعة الشكوى'} secondary onPress={trackClientComplaints} disabled={clientComplaintTrack.loading}/>{clientComplaintTrack.error ? <Text style={styles.errorText}>{clientComplaintTrack.error}</Text> : null}{clientComplaintTrack.result ? (Array.isArray(clientComplaintTrack.result.complaints || clientComplaintTrack.result.items || clientComplaintTrack.result.data) ? (clientComplaintTrack.result.complaints || clientComplaintTrack.result.items || clientComplaintTrack.result.data).map((item, index) => <View key={String(item._id || index)} style={styles.offerCardPremium}><Text style={styles.cardTitleSmall}>كود الطلب: {item.sn || clientComplaintTrack.sn}</Text><Text style={styles.detail}>الحالة: {item.status || 'جديدة'}</Text><Text style={styles.detail}>رد الإدارة: {item.adminResponse || 'لم ترد الإدارة بعد.'}</Text>{item.createdAt ? <Text style={styles.detailSmall}>{dateLabel(item.createdAt)}</Text> : null}</View>) : <Text style={styles.detail}>لا توجد شكوى مرتبطة بهذا الطلب.</Text>) : null}</View> : null}
      {clientTab === 'profile' ? <AccountScreen embedded session={session} clientData={clientData} techData={techData} setScreen={setScreen} beginProfileEdit={beginProfileEdit} setRatingPrompt={setRatingPrompt} getOrderSN={getOrderSN} onLogout={() => setLogoutConfirmOpen(true)} /> : null}
      {clientTab === 'store' ? <StoreScreen role="client" session={session} walletBalance={walletBalance} onWalletBalanceChange={setWalletBalance} /> : null}
      {clientTab === 'wallet' ? <ClientWalletScreen session={session} onBalanceChange={setWalletBalance} /> : null}
      {clientTab === 'subscriptions' ? <ClientSubscriptionsScreen session={session} walletBalance={walletBalance} onWalletBalanceChange={setWalletBalance} onOpenWallet={() => setClientTab('wallet')} /> : null}
      {notificationsOpen ? <Modal transparent visible={notificationsOpen} animationType="fade" onRequestClose={() => setNotificationsOpen(false)}><View style={styles.notificationModalBackdrop}><TouchableOpacity style={styles.notificationModalDismiss} activeOpacity={1} onPress={() => setNotificationsOpen(false)} /><View style={styles.notificationModalCard}><View style={styles.notificationModalHeader}><Text style={styles.cardTitleSmall}>الإشعارات {notifications.unread ? `(${notifications.unread})` : ''}</Text><View style={styles.notificationHeaderActions}>{notifications.unread > 0 ? <Button title="قراءة الكل" secondary onPress={markAllNotificationsRead} /> : null}<Button title="إغلاق" secondary onPress={() => setNotificationsOpen(false)} /></View></View><ScrollView style={styles.notificationModalList} contentContainerStyle={styles.notificationListContent}>{notifications.loading ? <ActivityIndicator color={COLORS.navy} /> : notifications.items.length ? notifications.items.map((item,i)=><TouchableOpacity key={String(item._id||item.id||i)} onPress={()=>openClientNotification(item)} style={[styles.notificationRow, (item.read || item.readAt) ? styles.notificationRead : styles.notificationUnread]}><Text style={[styles.cardTitleSmall, (item.read || item.readAt) && styles.notificationReadText]}>{item.title||'إشعار'}</Text><Text style={[(item.read || item.readAt) ? styles.notificationReadText : styles.detail]}>{item.message||''}</Text>{item.replyEnabled ? <Text style={{marginTop:4,fontSize:11,fontWeight:'900',color:'#2563EB'}}>مسموح بالرد</Text> : null}{item.replyEnabled && activeReplyNotificationId===String(item._id||item.id) ? <View style={{marginTop:10,padding:10,borderRadius:12,backgroundColor:'#EEF4FF'}}><Text style={{fontWeight:'900',color:COLORS.navy,marginBottom:6}}>مسموح بالرد</Text>{item.reply?.message ? <Text style={{color:COLORS.navy}}>{item.reply.message}</Text> : <><TextInput value={notificationReplyDraft} onChangeText={setNotificationReplyDraft} multiline maxLength={1000} placeholder="اكتب ردك للإدارة..." style={{minHeight:76,textAlignVertical:'top',backgroundColor:'#FFF',borderWidth:1,borderColor:'#D7E2F5',borderRadius:10,padding:10,color:'#172554'}}/><TouchableOpacity disabled={notificationReplySubmitting || !notificationReplyDraft.trim()} onPress={event => { event.stopPropagation?.(); submitClientNotificationReply(); }} style={{marginTop:8,backgroundColor:COLORS.navy,borderRadius:10,padding:12,alignItems:'center',opacity:notificationReplySubmitting?0.6:1}}><Text style={{color:'#FFF',fontWeight:'900'}}>{notificationReplySubmitting?'جاري الإرسال...':'إرسال الرد'}</Text></TouchableOpacity></>}</View> : null}</TouchableOpacity>) : <Text style={styles.emptyText}>لا توجد إشعارات حاليًا.</Text>}</ScrollView></View></View></Modal> : null}</>}
    </ScrollView>
      {!referralPageOpen ? <View style={{flexDirection:'row-reverse',backgroundColor:'#FFF',borderTopWidth:1,borderTopColor:'#E7EAF2',paddingTop:8,paddingBottom:8,justifyContent:'space-around',elevation:12}}>
        {[{key:'profile',label:'حسابي',icon:'👤'},{key:'current',label:'الطلبات',icon:'📋'},{key:'wallet',label:'المحفظة',icon:'💳'},{key:'store',label:'المتجر',icon:'🛍️'},{key:'home',label:'الرئيسية',icon:'⌂'}].map(item=><TouchableOpacity key={item.key} onPress={()=>setClientTab(item.key)} style={{flex:1,alignItems:'center',justifyContent:'center',paddingVertical:3}}><Text style={{fontSize:23,color:clientTab===item.key?'#102A9B':'#858B96'}}>{item.icon}</Text><Text style={{fontSize:11,fontWeight:'900',color:clientTab===item.key?'#102A9B':'#555B66',marginTop:2}}>{item.label}</Text></TouchableOpacity>)}
      </View> : null}
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
