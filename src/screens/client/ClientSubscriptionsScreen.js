import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button } from '../../components/FormControls';

const TYPE_LABEL = { maintenance: 'الصيانة السنوية', iptv: 'الاشتراك الترفيهي', air_network: 'الاشتراك المحلي' };
const STATUS = { active: 'نشط', pending: 'قيد مراجعة الإدارة', paused: 'موقوف مؤقتًا', cancelled: 'ملغي', expired: 'منتهي' };
const PAYMENT_OPTIONS = [
  { value: 'wallet', label: 'محفظة التطبيق', hint: 'الخصم بعد موافقة الإدارة' },
  { value: 'transfer', label: 'تحويل أموال', hint: 'تراجع الإدارة التحويل قبل التفعيل' },
];

function confirmAction(title, message) {
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: 'تأكيد', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

function PaymentChoices({ value, onChange }) {
  return (
    <View style={{ marginTop: 9 }}>
      <Text style={[styles.detail, { fontWeight: '900', marginBottom: 7 }]}>طريقة الدفع — اختار طريقة واحدة</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PAYMENT_OPTIONS.map(option => {
          const selected = value === option.value;
          return (
            <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={{ flex: 1, minWidth: 135, padding: 12, borderRadius: 12, borderWidth: selected ? 2 : 1,
                borderColor: selected ? COLORS.navy : COLORS.border, backgroundColor: selected ? '#EEF3FA' : '#FFFFFF' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 19, height: 19, borderRadius: 10, borderWidth: 2,
                  borderColor: selected ? COLORS.navy : '#9AA4B2', alignItems: 'center', justifyContent: 'center' }}>
                  {selected ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.navy }} /> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '900', color: COLORS.navy }}>{option.label}</Text>
              </View>
              <Text style={[styles.detail, { marginTop: 6, fontSize: 11 }]}>{option.hint}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ClientSubscriptionsScreen({ session, walletBalance = 0, onWalletBalanceChange, onOpenWallet }) {
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [visits, setVisits] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState({});
  const [renewalMethods, setRenewalMethods] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('mine');
  const [expandedPlans, setExpandedPlans] = useState({});

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true); setError('');
    try {
      const [catalog, mine, wallet] = await Promise.all([
        api('/subscriptions/plans', { token: session.token }),
        api('/subscriptions/client/mine', { token: session.token }),
        api('/client/wallet', { token: session.token }),
      ]);
      setPlans(Array.isArray(catalog.plans) ? catalog.plans.filter(plan => plan.active !== false) : []);
      setSubscriptions(Array.isArray(mine.subscriptions) ? mine.subscriptions : []);
      setVisits(Array.isArray(mine.visits) ? mine.visits : []);
      if (wallet.balance !== undefined || wallet.walletBalance !== undefined) onWalletBalanceChange?.(Number(wallet.balance ?? wallet.walletBalance));
    } catch (e) { setError(e.message || 'تعذر تحميل الاشتراكات.'); }
    finally { setLoading(false); }
  }, [session?.token, onWalletBalanceChange]);

  useEffect(() => { load(); }, [load]);

  const submitPlanRequest = async plan => {
    const existing = subscriptions.find(item => String(item.plan) === String(plan._id) && ['pending', 'active', 'paused'].includes(item.status));
    if (existing) { Alert.alert('طلب أو اشتراك قائم', existing.status === 'pending' ? 'طلبك لهذه الباقة قيد مراجعة الإدارة بالفعل.' : 'لديك اشتراك قائم في هذه الباقة بالفعل.'); return; }
    const paymentMethod = paymentMethods[String(plan._id)];
    if (!paymentMethod) { Alert.alert('اختار طريقة الدفع', 'حدد محفظة التطبيق أو تحويل الأموال أولًا.'); return; }
    const confirmed = await confirmAction('تأكيد طلب الاشتراك', 'تأكيد طلب ' + (TYPE_LABEL[plan.type] || 'الاشتراك') + ' بطريقة ' + (paymentMethod === 'wallet' ? 'محفظة التطبيق' : 'تحويل الأموال') + '؟ لن يتم الخصم قبل موافقة الإدارة.');
    if (!confirmed) return;
    setSubmitting(String(plan._id)); setError('');
    try {
      const result = await api('/subscriptions/client/request', { method: 'POST', token: session.token,
        body: { planId: String(plan._id), paymentMethod } });
      Alert.alert('تم إرسال الطلب', result.message || 'تم إرسال طلب الاشتراك للإدارة للمراجعة.');
      await load();
    } catch (e) { setError(e.message || 'تعذر إرسال طلب الاشتراك.'); }
    finally { setSubmitting(''); }
  };

  const submitRenewalRequest = async item => {
    const paymentMethod = renewalMethods[String(item._id)];
    if (!paymentMethod) { Alert.alert('اختار طريقة الدفع', 'حدد طريقة دفع التجديد أولًا.'); return; }
    const confirmed = await confirmAction('تأكيد طلب التجديد', 'تأكيد إرسال طلب التجديد بطريقة ' + (paymentMethod === 'wallet' ? 'محفظة التطبيق' : 'تحويل الأموال') + '؟ لن يتم الخصم الآن.');
    if (!confirmed) return;
    setSubmitting('renew-' + item._id); setError('');
    try {
      const result = await api('/subscriptions/client/request-renewal', { method: 'POST', token: session.token,
        body: { subscriptionId: String(item._id), paymentMethod } });
      Alert.alert('تم إرسال طلب التجديد', result.message || 'ستراجع الإدارة طلب التجديد وطريقة الدفع.');
      await load();
    } catch (e) { setError(e.message || 'تعذر إرسال طلب التجديد.'); }
    finally { setSubmitting(''); }
  };

  const findActiveVisit = subscriptionId => visits.find(visit => {
    const visitSubscriptionId = String(visit.subscription?._id || visit.subscription || '');
    return visitSubscriptionId === String(subscriptionId)
      && ['requested', 'scheduled', 'in_progress', 'awaiting_client_confirmation'].includes(visit.status);
  });

  const requestVisit = async item => {
    const subscriptionId = String(item._id);
    const activeVisit = findActiveVisit(subscriptionId);
    if (activeVisit) {
      if (activeVisit.status === 'requested') {
        Alert.alert('طلب زيارة قائم', 'لديك طلب زيارة قيد مراجعة الإدارة بالفعل.');
      } else {
        Alert.alert('زيارة قائمة', 'لديك زيارة صيانة قائمة بالفعل.');
      }
      return;
    }

    const confirmed = await confirmAction('طلب زيارة صيانة', 'إرسال طلب زيارة صيانة للإدارة؟');
    if (!confirmed) return;
    setSubmitting('visit-' + subscriptionId); setError('');
    try {
      const result = await api('/subscriptions/client/request-visit', { method: 'POST', token: session.token,
        body: { subscriptionId } });
      Alert.alert('تم إرسال طلب الزيارة', result.message || 'ستراجع الإدارة طلب زيارة الصيانة.');
      await load();
    } catch (e) {
      Alert.alert('تعذر إرسال طلب الزيارة', e.message || 'حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.');
      if (e.status === 409) await load();
    } finally { setSubmitting(''); }
  };

  const confirmVisit = async visit => {
    const confirmed = await confirmAction('تأكيد استلام الزيارة', 'تأكيد استلام زيارة الصيانة وإغلاقها؟');
    if (!confirmed) return;
    setSubmitting('confirm-' + visit._id); setError('');
    try {
      const result = await api('/subscriptions/client/visits/' + encodeURIComponent(visit._id) + '/confirm-completion', {
        method: 'POST', token: session.token, body: {},
      });
      Alert.alert('تم تأكيد الزيارة', result.message || 'تم تسجيل تأكيدك.');
      await load();
    } catch (e) { setError(e.message || 'تعذر تأكيد استلام الزيارة.'); }
    finally { setSubmitting(''); }
  };

  const renderPlan = plan => {
    const id = String(plan._id), expanded = Boolean(expandedPlans[id]);
    const hasExisting = subscriptions.some(item => String(item.plan) === id && ['pending', 'active', 'paused'].includes(item.status));
    return (
      <View key={id} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: COLORS.border }}>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitleSmall}>{plan.name || TYPE_LABEL[plan.type] || 'باقة اشتراك'}</Text>
            <Text style={[styles.cardTitleSmall, { color: COLORS.navy, marginTop: 4 }]}>{Number(plan.price || 0).toLocaleString('ar-EG')} جنيه</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
            onPress={() => setExpandedPlans(current => ({ ...current, [id]: !current[id] }))}
            style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 }}>
            <Text style={{ color: COLORS.navy, fontSize: 11, fontWeight: '900' }}>{expanded ? 'إخفاء التفاصيل' : 'تفاصيل'}</Text>
          </Pressable>
        </View>
        {expanded ? <>
          <Text style={styles.detail}>{TYPE_LABEL[plan.type] || 'اشتراك'} • {Number(plan.durationDays || 0)} يوم</Text>
          {plan.description ? <Text style={styles.detail}>{plan.description}</Text> : null}
          {plan.type === 'maintenance' ? <Text style={styles.detail}>عدد زيارات الصيانة: {Number(plan.visitCount || 0)}</Text> : <Text style={styles.detail}>عدد الأجهزة المسموح بها: {Number(plan.allowedDevices || 1)}</Text>}
          {Array.isArray(plan.includedServices) && plan.includedServices.length ? <View style={{ marginTop: 7 }}>
            <Text style={[styles.detail, { fontWeight: '900' }]}>الخدمات المشمولة</Text>
            {plan.includedServices.map((service, i) => <Text key={String(i)} style={styles.detail}>✓ {service}</Text>)}
          </View> : null}
          {Array.isArray(plan.excludedSupplies) && plan.excludedSupplies.length ? <View style={{ marginTop: 5 }}>
            <Text style={[styles.detail, { fontWeight: '900' }]}>غير مشمول في السعر</Text>
            {plan.excludedSupplies.map((supply, i) => <Text key={String(i)} style={styles.detail}>• {supply}</Text>)}
          </View> : null}
          {hasExisting ? <Text style={[styles.detail, { color: COLORS.navy, fontWeight: '900', marginTop: 10 }]}>لديك طلب أو اشتراك قائم لهذه الباقة</Text> : <>
            <PaymentChoices value={paymentMethods[id] || ''}
              onChange={method => setPaymentMethods(current => ({ ...current, [id]: method }))} />
            <Button title={submitting === id ? 'جاري إرسال الطلب...' : 'إرسال طلب الاشتراك'}
              onPress={() => submitPlanRequest(plan)} disabled={Boolean(submitting) || !paymentMethods[id]} />
          </>}
        </> : null}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>الاشتراكات</Text>
        <Text style={styles.detail}>الصيانة السنوية والاشتراك الترفيهي والاشتراك المحلي في نظام موحد.</Text>
        <Text style={[styles.detail, { fontWeight: '900', marginTop: 6 }]}>رصيد المحفظة: {Number(walletBalance || 0).toLocaleString('ar-EG')} جنيه</Text>
        {onOpenWallet ? <Button title="فتح المحفظة" secondary onPress={onOpenWallet} /> : null}
        <Button title={loading ? 'جاري التحديث...' : 'تحديث الاشتراكات والباقات'} secondary onPress={load} disabled={loading} />
      </View>
      {error ? <View style={styles.dataCard}><Text style={styles.errorText}>{error}</Text><Button title="إعادة المحاولة" secondary onPress={load} /></View> : null}
      {loading ? <ActivityIndicator color={COLORS.navy} /> : null}
      {activeView === 'mine' && visits.some(visit => visit.status === 'awaiting_client_confirmation' && !visit.clientConfirmedAt) ? <View style={styles.dataCard}>
        <Text style={[styles.cardTitlePremium, { color: '#8A5200' }]}>مطلوب تأكيد استلام زيارة الصيانة</Text>
        <Text style={styles.detail}>الفني أنهى الزيارة السنوية. راجع الخدمة واضغط تأكيد الاستلام لإغلاقها.</Text>
        {visits.filter(visit => visit.status === 'awaiting_client_confirmation' && !visit.clientConfirmedAt).map(visit => <View key={'pending-' + String(visit._id)} style={{ paddingTop: 9 }}>
          <Text style={styles.detail}>{new Date(visit.scheduledAt).toLocaleString('ar-EG')}</Text>
          <Button title={submitting === 'confirm-' + visit._id ? 'جاري التأكيد...' : 'تأكيد استلام الخدمة'} onPress={() => confirmVisit(visit)} disabled={Boolean(submitting)} />
        </View>)}
      </View> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: activeView === 'mine' }} onPress={() => setActiveView('mine')}
          style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: activeView === 'mine' ? COLORS.navy : COLORS.border, backgroundColor: activeView === 'mine' ? COLORS.navy : '#FFFFFF' }}>
          <Text style={{ textAlign: 'center', fontWeight: '900', fontSize: 12, color: activeView === 'mine' ? '#FFFFFF' : COLORS.navy }}>اشتراكاتي</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: activeView === 'available' }} onPress={() => setActiveView('available')}
          style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: activeView === 'available' ? COLORS.navy : COLORS.border, backgroundColor: activeView === 'available' ? COLORS.navy : '#FFFFFF' }}>
          <Text style={{ textAlign: 'center', fontWeight: '900', fontSize: 12, color: activeView === 'available' ? '#FFFFFF' : COLORS.navy }}>الاشتراكات المتاحة</Text>
        </Pressable>
      </View>
      {activeView === 'mine' ? <>
      <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>اشتراكاتي الحالية ({subscriptions.length})</Text>
        {subscriptions.length ? subscriptions.map(item => {
          const activeVisit = item.type === 'maintenance' ? findActiveVisit(item._id) : null;
          const remaining = item.endsAt ? Math.max(0, Math.ceil((new Date(item.endsAt).getTime() - Date.now()) / 86400000)) : 0;
          const needsRenewal = ['active', 'expired', 'paused'].includes(item.status) && !(item.renewalRequest?.requestedAt && item.renewalRequest?.paymentStatus === 'pending');
          return <View key={String(item._id)} style={{ paddingVertical: 11, borderTopWidth: 1, borderColor: COLORS.border }}>
            <Text style={styles.cardTitleSmall}>{TYPE_LABEL[item.type] || 'اشتراك'} • {item.code || ''}</Text>
            <Text style={styles.detail}>الحالة: {STATUS[item.status] || item.status || 'غير محددة'}</Text>
            <Text style={styles.detail}>ينتهي: {item.endsAt ? new Date(item.endsAt).toLocaleDateString('ar-EG') : '—'} • متبقي {remaining} يوم</Text>
            <Text style={styles.detail}>القيمة: {Number(item.amount || 0).toLocaleString('ar-EG')} جنيه</Text>
            {item.paymentStatus === 'pending' ? <Text style={[styles.detail, { color: '#9A6500', fontWeight: '800' }]}>طريقة الدفع: {item.paymentMethod === 'wallet' ? 'محفظة التطبيق' : 'تحويل أموال'} — قيد مراجعة الإدارة</Text> : null}
            {item.paymentStatus === 'paid' ? <Text style={[styles.detail, { color: '#16734B' }]}>تم تأكيد السداد</Text> : null}
            {item.type === 'maintenance' ? <><Text style={styles.detail}>الطبق: {item.dishSize || '—'} • الرسيفر: {item.receiverType || '—'}</Text><Text style={[styles.detail, { fontWeight: '900', color: COLORS.navy }]}>زيارات الصيانة: المشمول {Number(item.visitsIncluded ?? 0)} • المستهلك {Number(item.visitsConsumed ?? 0)} • المتبقي {Number(item.visitsRemaining ?? item.visitsIncluded ?? 0)}</Text></> : null}
            {item.type === 'air_network' ? <View><Text style={styles.detail}>اسم الباقة: {item.networkName || '—'}</Text><Text style={styles.detail}>بيانات التفعيل: {item.activationCode || '—'}</Text></View> : null}
            {item.type === 'iptv' ? <View><Text style={styles.detail}>اسم المستخدم: {item.iptvUsername || '—'}</Text><Text style={styles.detail}>كلمة المرور: {item.iptvPassword || '—'}</Text><Text style={styles.detail}>رابط الخدمة: {item.portalUrl || '—'} • الأجهزة: {item.allowedDevices || 1}</Text></View> : null}
            {(item.includedServices || []).map((service, i) => <Text key={String(i)} style={styles.detail}>✓ {service}</Text>)}
            {item.type === 'maintenance' && item.status === 'active' ? (
              <Button
                title={submitting === 'visit-' + item._id
                  ? 'جاري إرسال الطلب...'
                  : activeVisit
                    ? activeVisit.status === 'requested'
                      ? 'لديك طلب زيارة في مراجعة الإدارة'
                      : 'لديك زيارة صيانة قائمة بالفعل'
                    : 'طلب زيارة'}
                secondary
                onPress={() => requestVisit(item)}
                disabled={Boolean(submitting) || Boolean(activeVisit)}
              />
            ) : null}
            {needsRenewal ? <>
              <PaymentChoices value={renewalMethods[String(item._id)] || ''}
                onChange={method => setRenewalMethods(current => ({ ...current, [String(item._id)]: method }))} />
              <Button title={submitting === 'renew-' + item._id ? 'جاري إرسال التجديد...' : 'إرسال طلب تجديد الاشتراك'} secondary
                onPress={() => submitRenewalRequest(item)} disabled={Boolean(submitting) || !renewalMethods[String(item._id)]} />
            </> : item.renewalRequest?.requestedAt ? <Text style={styles.detail}>طلب التجديد: {item.renewalRequest.paymentStatus === 'pending' ? 'قيد المراجعة' : item.renewalRequest.paymentStatus}</Text> : null}
          </View>;
        }) : <Text style={styles.emptyText}>لا توجد اشتراكات مسجلة على حسابك حاليًا.</Text>}
      </View>

      {visits.length ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>زيارات الصيانة</Text>
        {visits.map(visit => <View key={String(visit._id)} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: COLORS.border }}>
          <Text style={styles.detail}>{new Date(visit.scheduledAt).toLocaleString('ar-EG')}</Text>
          {visit.workDescription ? <Text style={styles.detail}>{visit.workDescription}</Text> : null}
          <Text style={styles.detail}>{visit.status === 'requested' ? 'طلب الزيارة قيد مراجعة الإدارة' : visit.status === 'completed' ? 'تم تأكيد إنهاء الخدمة' : visit.status === 'awaiting_client_confirmation' ? 'الفني أنهى العمل — في انتظار تأكيدك' : visit.status === 'in_progress' ? 'الزيارة قيد التنفيذ' : visit.status === 'cancelled' ? 'الزيارة ملغاة' : 'زيارة مجدولة'}</Text>
        </View>)}
      </View> : null}


      </> : null}
      {activeView === 'available' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>الاشتراكات المتاحة</Text>
        {plans.length ? plans.map(renderPlan) : <Text style={styles.emptyText}>لا توجد باقات متاحة حاليًا.</Text>}
      </View> : null}
    </ScrollView>
  );
}
