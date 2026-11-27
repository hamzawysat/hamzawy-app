import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button } from '../../components/FormControls';

function idempotencyKey() {
  return 'commerce-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

const STATUS = { active: 'نشط', pending: 'قيد المراجعة', paused: 'موقوف مؤقتًا', cancelled: 'ملغي', expired: 'منتهي' };

export default function ClientSubscriptionsScreen({ session, walletBalance = 0, onWalletBalanceChange, onOpenWallet }) {
  const [items, setItems] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [specialPlans, setSpecialPlans] = useState([]);
  const [specialSubscriptions, setSpecialSubscriptions] = useState([]);
  const [specialVisits, setSpecialVisits] = useState([]);
  const [view, setView] = useState('available');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true); setError('');
    try {
      const [catalog, current, wallet, specialCatalog, specialMine] = await Promise.all([
        api('/client/commerce/catalog', { token: session.token }),
        api('/client/commerce/subscriptions', { token: session.token }),
        api('/client/wallet', { token: session.token }),
        api('/subscriptions/plans', { token: session.token }),
        api('/subscriptions/client/mine', { token: session.token })
      ]);
      setItems(Array.isArray(catalog.items) ? catalog.items : []);
      setSubscriptions(Array.isArray(current.subscriptions) ? current.subscriptions : []);
      setSpecialPlans(Array.isArray(specialCatalog.plans) ? specialCatalog.plans : []);
      setSpecialSubscriptions(Array.isArray(specialMine.subscriptions) ? specialMine.subscriptions : []);
      setSpecialVisits(Array.isArray(specialMine.visits) ? specialMine.visits : []);
      if (wallet.balance !== undefined || wallet.walletBalance !== undefined) onWalletBalanceChange?.(Number(wallet.balance ?? wallet.walletBalance));
    } catch (e) { setError(e.message || 'تعذر تحميل الاشتراكات.'); }
    finally { setLoading(false); }
  }, [session?.token, onWalletBalanceChange]);

  useEffect(() => { load(); }, [load]);

  const purchase = item => {
    const price = Number(item.price || 0);
    if (!Number.isFinite(price) || price < 0) { Alert.alert('سعر غير صحيح', 'سعر الباقة غير صحيح.'); return; }
    const submit = async paymentMethod => {
      setSubmitting(String(item._id)); setError('');
      try {
        const result = await api('/client/commerce/subscriptions/purchase', {
          method: 'POST', token: session.token,
          body: { itemId: String(item._id), paymentMethod, idempotencyKey: idempotencyKey() }
        });
        if (result.balance !== undefined) onWalletBalanceChange?.(Number(result.balance));
        Alert.alert('تم إرسال الطلب', result.message || 'تم إرسال طلب الاشتراك للمراجعة.');
        await load();
      } catch (e) { setError(e.message || 'تعذر شراء الاشتراك.'); }
      finally { setSubmitting(''); }
    };
    Alert.alert(
      'اختيار طريقة الدفع',
      'قيمة الاشتراك ' + price + ' جنيه. اختار طريقة الدفع قبل تأكيد الطلب.',
      [
        { text: 'الدفع من محفظة التطبيق', onPress: () => submit('wallet') },
        { text: 'تحويل أموال', onPress: () => submit('transfer') },
        { text: 'رجوع', style: 'cancel' }
      ]
    );
  };

  const renew = item => {
    const amount = Number(item.amount || 0);
    if (Number(walletBalance) < amount) {
      Alert.alert('الرصيد غير كافٍ', 'اشحن محفظتك أولًا لتجديد الاشتراك.', [
        { text: 'لاحقًا', style: 'cancel' },
        { text: 'فتح المحفظة', onPress: () => onOpenWallet?.() }
      ]);
      return;
    }
    Alert.alert('تأكيد التجديد', 'تجديد ' + (item.itemName || 'الاشتراك') + ' بمبلغ ' + amount + ' جنيه من محفظتك؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد التجديد', onPress: async () => {
        setSubmitting(String(item._id)); setError('');
        try {
          const result = await api('/client/commerce/subscriptions/' + encodeURIComponent(item._id) + '/renew', {
            method: 'POST', token: session.token, body: { idempotencyKey: idempotencyKey() }
          });
          if (result.balance !== undefined) onWalletBalanceChange?.(Number(result.balance));
          Alert.alert('تم التجديد', result.message || 'تم تجديد الاشتراك.');
          await load();
        } catch (e) { setError(e.message || 'تعذر تجديد الاشتراك.'); }
        finally { setSubmitting(''); }
      } }
    ]);
  };

  const requestSpecialRenewal = async (item, paymentMethod) => {
    setSubmitting(String(item._id)); setError('');
    try {
      const result = await api('/subscriptions/client/request-renewal', { method: 'POST', token: session.token, body: { subscriptionId: String(item._id), paymentMethod } });
      Alert.alert('تم إرسال طلب التجديد', result.message || 'سيتم مراجعة طلبك من الإدارة.');
      await load();
    } catch (e) { setError(e.message || 'تعذر إرسال طلب التجديد.'); }
    finally { setSubmitting(''); }
  };

  return (
    <View style={{ padding: 14, paddingBottom: 30 }}>
      <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>الاشتراكات</Text>
        <Text style={styles.detail}>تابع اشتراكاتك أو استعرض الباقات المتاحة.</Text>
        <Text style={[styles.detail, { fontWeight: '900', marginTop: 6 }]}>رصيد المحفظة: {Number(walletBalance || 0).toLocaleString('ar-EG')} جنيه</Text>
        <Button title={loading ? 'جاري التحديث...' : 'تحديث الاشتراكات والباقات'} secondary onPress={load} disabled={loading} />
      </View>
      <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>اشتراكاتي الخاصة</Text>
        <Text style={styles.detail}>الأسعار والمدد والخدمات يحددها فريق الإدارة.</Text>
        {specialSubscriptions.length ? specialSubscriptions.map((item, index) => {
          const remaining = item.endsAt ? Math.max(0, Math.ceil((new Date(item.endsAt).getTime() - Date.now()) / 86400000)) : 0;
          return <View key={String(item._id)} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
            <Text style={styles.cardTitleSmall}>{item.type === 'maintenance' ? 'صيانة سنوية' : item.type === 'air_network' ? 'اشتراك محلي' : 'اشتراك ترفيهي'} • {item.code}</Text>
            <Text style={styles.detail}>الحالة: {item.status === 'active' ? (remaining <= 7 ? 'قرب الانتهاء' : 'نشط') : item.status === 'expired' ? 'منتهي' : item.status}</Text>
            <Text style={styles.detail}>ينتهي: {new Date(item.endsAt).toLocaleDateString('ar-EG')} • متبقي {remaining} يوم</Text>
            {item.type === 'maintenance' ? <Text style={styles.detail}>الطبق: {item.dishSize || '—'} • الرسيفر: {item.receiverType || '—'}</Text> : null}
            {item.type === 'air_network' ? <View><Text style={styles.detail}>اسم الباقة: {item.networkName || '—'}</Text><Text style={styles.detail}>بيانات الدخول: {item.activationCode || '—'}</Text></View> : null}
            {item.type === 'iptv' ? <View><Text style={styles.detail}>نوع الخدمة: اشتراك ترفيهي</Text><Text style={styles.detail}>بيانات الدخول: {item.iptvUsername || '—'} / {item.iptvPassword || '—'}</Text><Text style={styles.detail}>رابط الخدمة: {item.portalUrl || '—'} • عدد الأجهزة: {item.allowedDevices || 1}</Text></View> : null}
            {(item.includedServices || []).map((x,i)=><Text key={i} style={styles.detail}>• {x}</Text>)}
            {item.type === 'maintenance' && item.status === 'active' ? <Button title="طلب زيارة صيانة" secondary onPress={() => Alert.alert('طلب زيارة', 'إرسال طلب زيارة صيانة للإدارة؟', [{text:'رجوع',style:'cancel'},{text:'إرسال الطلب',onPress:async()=>{setSubmitting(String(item._id));try{const result=await api('/subscriptions/client/request-visit',{method:'POST',token:session.token,body:{subscriptionId:String(item._id)}});Alert.alert('تم إرسال الطلب',result.message||'سيتم التواصل معك لتأكيد الموعد.');}catch(e){setError(e.message||'تعذر إرسال طلب الزيارة.');}finally{setSubmitting('');}}}])} disabled={Boolean(submitting)} /> : null}
            {['active','expired','paused'].includes(item.status) ? <Button title="طلب تجديد الاشتراك" secondary onPress={() => Alert.alert('اختيار طريقة الدفع للتجديد', 'اختار طريقة الدفع قبل إرسال طلب تجديد ' + item.code + '.', [{text:'الدفع من المحفظة',onPress:()=>requestSpecialRenewal(item,'wallet')},{text:'تحويل أموال',onPress:()=>requestSpecialRenewal(item,'transfer')},{text:'رجوع',style:'cancel'}])} disabled={Boolean(submitting)} /> : null}
          </View>;
        }) : <Text style={styles.emptyText}>لا توجد اشتراكات مفعلة على حسابك.</Text>}
        {specialVisits.length ? <Text style={[styles.detail,{fontWeight:'900',marginTop:8}]}>مواعيد الصيانة</Text> : null}
        {specialVisits.map(v => <View key={String(v._id)} style={{paddingVertical:7,borderTopWidth:1,borderColor:COLORS.border}}><Text style={styles.detail}>{new Date(v.scheduledAt).toLocaleString('ar-EG')} • {v.status === 'completed' ? 'تم تأكيد إنهاء الخدمة من الطرفين' : v.status === 'awaiting_client_confirmation' ? 'الفني طلب إنهاء الخدمة — يلزم تأكيدك' : v.status === 'in_progress' ? 'الخدمة قيد التنفيذ' : 'زيارة مجدولة'}</Text>{v.status === 'awaiting_client_confirmation' && !v.clientConfirmedAt ? <Button title={submitting===String(v._id)?'جاري التأكيد...':'تأكيد إنهاء الخدمة'} onPress={async()=>{setSubmitting(String(v._id));try{const result=await api('/subscriptions/client/visits/'+encodeURIComponent(v._id)+'/confirm-completion',{method:'POST',token:session.token,body:{}});Alert.alert('تأكيد الخدمة',result.message||'تم تسجيل تأكيدك.');await load();}catch(e){setError(e.message||'تعذر تأكيد إنهاء الخدمة.');}finally{setSubmitting('');}}} disabled={Boolean(submitting)}/> : null}</View>)}
        <Text style={[styles.cardTitleSmall,{marginTop:12}]}>الخطط المتاحة</Text>
        {specialPlans.map(plan => <View key={String(plan._id)} style={{paddingVertical:8,borderTopWidth:1,borderColor:COLORS.border}}>
          <Text style={styles.cardTitleSmall}>اسم الباقة: {plan.name}</Text>
          <Text style={styles.detail}>{plan.description || ''} • {Number(plan.durationDays)} يوم • {Number(plan.price).toLocaleString('ar-EG')} جنيه</Text>
          <Button title={submitting === 'special-'+plan._id ? 'جاري الإرسال...' : 'طلب الاشتراك'} secondary onPress={() => Alert.alert('طلب اشتراك', 'إرسال طلب ' + plan.name + ' للإدارة؟', [{text:'رجوع',style:'cancel'},{text:'إرسال',onPress:async()=>{
            setSubmitting('special-'+plan._id);
            try { const result=await api('/subscriptions/client/request',{method:'POST',token:session.token,body:{planId:String(plan._id)}}); Alert.alert('تم إرسال الطلب',result.message || 'سيتم التواصل معك.'); await load(); }
            catch(e){setError(e.message || 'تعذر إرسال الطلب.');}
            finally{setSubmitting('');}
          }}])} disabled={Boolean(submitting)} />
        </View>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        <View style={{ flex: 1 }}><Button title={'اشتراكاتي الحالية (' + subscriptions.length + ')'} secondary={view !== 'current'} onPress={() => setView('current')} /></View>
        <View style={{ flex: 1 }}><Button title={'الاشتراكات المتاحة (' + items.length + ')'} secondary={view !== 'available'} onPress={() => setView('available')} /></View>
      </View>
      {error ? <View style={styles.dataCard}><Text style={styles.errorText}>{error}</Text><Button title="إعادة المحاولة" secondary onPress={load} /></View> : null}
      {loading ? <ActivityIndicator color={COLORS.navy} /> : null}
      {view === 'available' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitleSmall}>الاشتراكات المتاحة</Text>
        {items.length ? items.map((item, index) => <View key={String(item._id || index)} style={{ paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
          <Text style={styles.cardTitleSmall}>{item.name || 'باقة'}</Text>
          <Text style={styles.detail}>{item.description || ''}</Text>
          <Text style={styles.detail}>المدة: {Number(item.durationDays || 30)} يوم • السعر: {Number(item.price || 0)} جنيه</Text>
          {Array.isArray(item.features) ? item.features.map((feature, i) => <Text key={i} style={styles.detail}>• {feature}</Text>) : null}
          <Button title={submitting === String(item._id) ? 'جاري إرسال الطلب...' : 'إرسال طلب الاشتراك'} onPress={() => purchase(item)} disabled={Boolean(submitting)} />
        </View>) : <Text style={styles.emptyText}>لا توجد باقات متاحة حاليًا.</Text>}
      </View> : <View style={styles.dataCard}>
        <Text style={styles.cardTitleSmall}>اشتراكاتي الحالية</Text>
        {subscriptions.length ? subscriptions.map((item, index) => <View key={String(item._id || index)} style={{ paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
          <Text style={styles.cardTitleSmall}>{item.itemName || 'اشتراك'}</Text>
          <Text style={styles.detail}>الحالة: {STATUS[item.status] || item.status || 'غير محددة'}</Text>
          <Text style={styles.detail}>{item.startsAt ? 'من ' + new Date(item.startsAt).toLocaleDateString('ar-EG') : ''}{item.endsAt ? ' إلى ' + new Date(item.endsAt).toLocaleDateString('ar-EG') : ''}</Text>
          <Text style={styles.detail}>قيمة التجديد: {Number(item.amount || 0)} جنيه</Text>
          {item.subscriptionDetails ? <Text style={[styles.detail, { marginTop: 6 }]}>{item.subscriptionDetails}</Text> : null}
          {['active', 'expired'].includes(item.status) ? <Button title={submitting === String(item._id) ? 'جاري التجديد...' : 'تجديد الاشتراك'} onPress={() => renew(item)} disabled={Boolean(submitting)} /> : null}
        </View>) : <Text style={styles.emptyText}>لم تشترك في أي باقة حتى الآن.</Text>}
      </View>}
    </View>
  );
}
