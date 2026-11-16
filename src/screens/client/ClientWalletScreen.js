import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button, Field } from '../../components/FormControls';

const METHODS = [
  { id: 'vodafone_cash', label: 'فودافون كاش' },
  { id: 'orange_cash', label: 'أورنج كاش' },
  { id: 'etisalat_cash', label: 'اتصالات كاش' },
  { id: 'we_cash', label: 'WE Pay' }
];

function transactionLabel(type) {
  return ({
    client_topup: 'شحن محفظة',
    client_admin_adjustment: 'إضافة رصيد من الإدارة',
    client_admin_deduction: 'خصم رصيد من الإدارة',
    client_admin_settlement: 'تسوية رصيد من الإدارة',
    client_service_payment: 'دفع خدمة',
    client_subscription_payment: 'شراء أو تجديد اشتراك',
    client_refund: 'استرداد مبلغ',
    client_escrow_hold: 'حجز مبلغ لطلب',
    client_escrow_release: 'تحرير مبلغ',
    technician_settlement: 'تسوية مستحقات'
  })[type] || 'حركة مالية';
}

function requestKey() {
  return 'client-wallet-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

export default function ClientWalletScreen({ session, onBalanceChange }) {
  const [wallet, setWallet] = useState({ balance: 0, frozen: false, transactions: [], topupRequests: [] });
  const [numbers, setNumbers] = useState([]);
  const [tab, setTab] = useState('topup');
  const [fromPhone, setFromPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('vodafone_cash');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError('');
    try {
      const [result, settings] = await Promise.all([
        api('/client/wallet', { token: session.token }),
        api('/wallet-settings').catch(() => ({}))
      ]);
      const next = {
        balance: Number(result.balance ?? result.walletBalance ?? 0),
        frozen: Boolean(result.frozen),
        transactions: Array.isArray(result.transactions) ? result.transactions : [],
        topupRequests: Array.isArray(result.topupRequests) ? result.topupRequests : []
      };
      setWallet(next);
      onBalanceChange?.(next.balance);
      setNumbers([settings.walletPhone1, settings.walletPhone2].map(value => String(value || '').trim()).filter(value => /^01[0-9]{9}$/.test(value)));
    } catch (e) {
      setError(e.message || 'تعذر تحميل المحفظة.');
    } finally { setLoading(false); }
  }, [session?.token, onBalanceChange]);

  useEffect(() => { load(); }, [load]);

  const copyNumber = async number => {
    try {
      await Clipboard.setStringAsync(String(number));
      Alert.alert('تم النسخ', 'تم نسخ رقم المحفظة.');
    } catch (_) { Alert.alert('تعذر النسخ', 'يمكنك نسخ الرقم يدويًا: ' + number); }
  };

  const submitTopup = async () => {
    if (submitting) return;
    const phone = fromPhone.replace(/\D/g, '');
    const value = Number(amount);
    if (!/^01[0-9]{9}$/.test(phone)) return setError('اكتب رقم الهاتف المحوّل منه بشكل صحيح.');
    if (!Number.isInteger(value) || value < 10 || value > 10000) return setError('مبلغ الشحن يجب أن يكون من 10 إلى 10000 جنيه.');
    if (wallet.frozen) return setError('المحفظة مجمدة حاليًا. تواصل مع خدمة العملاء.');
    if (!numbers.length) return setError('أرقام التحويل غير متاحة حاليًا. تواصل مع خدمة العملاء قبل التحويل.');
    setSubmitting(true); setError(''); setSuccess('');
    try {
      const result = await api('/client/wallet/topup', {
        method: 'POST',
        token: session.token,
        body: { fromPhone: phone, amount: value, method, reference: reference.trim().slice(0, 50), idempotencyKey: requestKey() }
      });
      setSuccess(result.message || 'تم إرسال طلب الشحن للمراجعة.');
      setFromPhone(''); setAmount(''); setReference('');
      await load();
    } catch (e) { setError(e.message || 'تعذر إرسال طلب الشحن.'); }
    finally { setSubmitting(false); }
  };

  const tabs = [{ id: 'topup', label: 'شحن المحفظة' }, { id: 'requests', label: 'طلبات الشحن' }, { id: 'transactions', label: 'سجل العمليات' }];

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.dataCard, { backgroundColor: COLORS.navy, borderColor: COLORS.navy }]}>
        <Text style={{ color: '#DCEBFA', fontSize: 12, fontWeight: '800' }}>رصيد محفظتك</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 6 }}>{wallet.balance.toLocaleString('ar-EG')} جنيه</Text>
        <Text style={{ color: '#E5F1FB', fontSize: 11, marginTop: 8, lineHeight: 19 }}>تقدر تدفع قيمة الخدمة من محفظتك بعد تعيين الفني، وتشترك في الباقات وتجددها مباشرة من رصيدك.</Text>
        <Button title={loading ? 'جاري التحديث...' : 'تحديث الرصيد والسجل'} secondary onPress={load} disabled={loading} />
      </View>
      {wallet.frozen ? <View style={styles.dataCard}><Text style={styles.errorText}>المحفظة مجمدة مؤقتًا. لا يمكن إرسال طلب شحن جديد حاليًا.</Text></View> : null}
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 12 }}>
        {tabs.map(item => <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={{ flex: 1, minHeight: 48, borderRadius: 10, padding: 8, justifyContent: 'center', backgroundColor: tab === item.id ? COLORS.navy : COLORS.white, borderWidth: 1, borderColor: tab === item.id ? COLORS.navy : COLORS.border }}>
          <Text style={{ textAlign: 'center', fontSize: 10, fontWeight: '900', color: tab === item.id ? COLORS.white : COLORS.text }}>{item.label}</Text>
        </TouchableOpacity>)}
      </View>
      {loading ? <ActivityIndicator color={COLORS.teal} /> : null}
      {error ? <View style={styles.dataCard}><Text style={styles.errorText}>{error}</Text><Button title="إعادة المحاولة" secondary onPress={load} /></View> : null}
      {tab === 'topup' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>شحن المحفظة</Text>
        <Text style={styles.detail}>حوّل المبلغ إلى أحد الأرقام المعتمدة، ثم سجّل بيانات التحويل. الرصيد لا يُضاف إلا بعد مراجعة الإدارة.</Text>
        {numbers.length ? numbers.map((number, index) => <View key={number} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 8 }}>
          <Text style={{ color: COLORS.navy, fontSize: 16, fontWeight: '900' }}>{number}</Text><Button title="نسخ" secondary onPress={() => copyNumber(number)} />
        </View>) : <Text style={[styles.detail, { color: COLORS.red, marginTop: 8 }]}>أرقام التحويل غير متاحة حاليًا. تواصل مع خدمة العملاء قبل التحويل.</Text>}
        <Field label="رقم الهاتف المحوّل منه" value={fromPhone} onChangeText={setFromPhone} keyboardType="phone-pad" />
        <Field label="المبلغ بالجنيه" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Text style={styles.sectionTitle}>طريقة التحويل</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {METHODS.map(item => <TouchableOpacity key={item.id} onPress={() => setMethod(item.id)} style={{ padding: 9, borderRadius: 9, borderWidth: 1, borderColor: method === item.id ? COLORS.teal : COLORS.border, backgroundColor: method === item.id ? COLORS.indigo50 : COLORS.white }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.text }}>{item.label}</Text>
          </TouchableOpacity>)}
        </View>
        <Field label="رقم العملية المرجعي (اختياري)" value={reference} onChangeText={setReference} />
        {success ? <Text style={{ color: COLORS.greenDark, fontWeight: '800', marginVertical: 6 }}>{success}</Text> : null}
        <Button title={submitting ? 'جاري إرسال الطلب...' : 'إرسال طلب الشحن'} onPress={submitTopup} disabled={submitting || wallet.frozen || !numbers.length} />
      </View> : null}
      {tab === 'requests' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>طلبات الشحن</Text>
        {wallet.topupRequests.length ? wallet.topupRequests.map((item, index) => <View key={String(item._id || index)} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
          <Text style={styles.detailBold}>{Number(item.amount || 0).toLocaleString('ar-EG')} جنيه • {item.status || 'قيد المراجعة'}</Text>
          <Text style={styles.detail}>{(METHODS.find(x => x.id === item.method)?.label || 'تحويل محفظة') + ' • ' + (item.senderNumber || item.fromPhone || '')}</Text>
          {item.reviewReason ? <Text style={styles.errorText}>{item.reviewReason}</Text> : null}
          {item.createdAt ? <Text style={styles.detailSmall}>{new Date(item.createdAt).toLocaleString('ar-EG')}</Text> : null}
        </View>) : <Text style={styles.emptyText}>لا توجد طلبات شحن حتى الآن.</Text>}
      </View> : null}
      {tab === 'transactions' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>سجل الحركات المالية</Text>
        {wallet.transactions.length ? wallet.transactions.map((item, index) => <View key={String(item._id || index)} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
          <Text style={styles.detailBold}>{transactionLabel(item.type)} • <Text style={{ color: Number(item.amount) >= 0 ? COLORS.greenDark : COLORS.red }}>{Number(item.amount) > 0 ? '+' : ''}{item.amount} ج</Text></Text>
          <Text style={styles.detail}>{item.description || ''}</Text>
          {item.createdAt ? <Text style={styles.detailSmall}>{new Date(item.createdAt).toLocaleString('ar-EG')}</Text> : null}
        </View>) : <Text style={styles.emptyText}>لا توجد حركات مالية مسجلة.</Text>}
      </View> : null}
    </ScrollView>
  );
}
