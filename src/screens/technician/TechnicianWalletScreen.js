import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button, Field } from '../../components/FormControls';

function transactionLabel(type) {
  return ({ technician_settlement: 'مستحقات تنفيذ طلب', commission: 'عمولة المنصة', topup: 'شحن محفظة', admin_adjustment: 'تسوية إدارية', refund: 'استرداد' })[type] || 'حركة مالية';
}

const METHODS = [
  { id: 'vodafone_cash', label: 'فودافون كاش' },
  { id: 'orange_cash', label: 'أورنج كاش' },
  { id: 'etisalat_cash', label: 'اتصالات كاش' },
  { id: 'we_cash', label: 'WE Pay' }
];

export default function TechnicianWalletScreen({ session, user, transferNumbers, topup, setTopup, submitTopup, onBalanceChange }) {
  const [tab, setTab] = useState('topup');
  const [requests, setRequests] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true); setError('');
    try {
      const result = await api('/fanni/wallet/history', { token: session.token });
      const history = Array.isArray(result.history) ? result.history : Array.isArray(result.requests) ? result.requests : Array.isArray(result.items) ? result.items : [];
      const entries = Array.isArray(result.transactions) ? result.transactions : [];
      setRequests(history);
      setTransactions(entries);
    } catch (e) { setError(e.message || 'تعذر تحميل سجل المحفظة.'); }
    finally { setLoading(false); }
  }, [session?.token]);

  useEffect(() => { load(); }, [load]);

  const handleTopup = async () => {
    if (submitting || !submitTopup) return;
    setSubmitting(true);
    try { await submitTopup(); } finally { setSubmitting(false); }
  };

  const copy = async number => {
    try { await Clipboard.setStringAsync(number); }
    catch (_) {}
  };

  return (
    <ScrollView contentContainerStyle={styles.technicianPage} showsVerticalScrollIndicator={false}>
      <View style={styles.walletCard}>
        <Text style={styles.walletTitle}>المحفظة 💰</Text>
        <Text style={styles.walletAmount}>{Number(user?.walletBalance || user?.balance || 0).toLocaleString('ar-EG')} جنيه</Text>
        <Button title={loading ? 'جاري التحديث...' : 'تحديث الرصيد والسجل'} secondary onPress={load} disabled={loading} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 10 }}>
        {[{ id: 'topup', label: 'شحن المحفظة' }, { id: 'requests', label: 'طلبات الشحن' }, { id: 'transactions', label: 'سجل العمليات' }].map(item =>
          <TouchableOpacity key={item.id} onPress={() => setTab(item.id)} style={{ flex: 1, minHeight: 48, justifyContent: 'center', padding: 7, borderRadius: 10, borderWidth: 1, borderColor: tab === item.id ? COLORS.navy : COLORS.border, backgroundColor: tab === item.id ? COLORS.navy : COLORS.white }}>
            <Text style={{ color: tab === item.id ? COLORS.white : COLORS.text, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>{item.label}</Text>
          </TouchableOpacity>)}
      </View>
      {error ? <View style={styles.dataCard}><Text style={styles.errorText}>{error}</Text></View> : null}
      {loading ? <ActivityIndicator color={COLORS.teal} /> : null}
      {tab === 'topup' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>أرقام التحويل المعتمدة</Text>
        {[1, 2].map(index => {
          const number = String(transferNumbers?.['walletPhone' + index] || '').trim();
          const valid = /^01[0-9]{9}$/.test(number);
          return <View key={index} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, marginTop: 8 }}>
            <Text style={styles.detailBold}>{valid ? number : 'رقم التحويل ' + index + ': غير متاح'}</Text>
            {valid ? <Button title="نسخ الرقم" secondary onPress={() => copy(number)} /> : null}
          </View>;
        })}
        <Text style={styles.detail}>راجع الرقم وبيانات التحويل قبل إرسال أي مبلغ. طلب الشحن يحتاج مراجعة الإدارة.</Text>
        <Field label="مبلغ الشحن بالجنيه" value={topup.amount} onChangeText={value => setTopup(current => ({ ...current, amount: value }))} keyboardType="numeric" />
        <Field label="رقم الهاتف المحوّل منه" value={topup.fromPhone} onChangeText={value => setTopup(current => ({ ...current, fromPhone: value }))} keyboardType="phone-pad" />
        <Text style={styles.sectionTitle}>نوع المحفظة المحوَّل منها</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {METHODS.map(item => <TouchableOpacity key={item.id} onPress={() => setTopup(current => ({ ...current, method: item.id }))} style={{ padding: 9, borderRadius: 9, borderWidth: 1, borderColor: topup.method === item.id ? COLORS.teal : COLORS.border, backgroundColor: topup.method === item.id ? COLORS.indigo50 : COLORS.white }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: COLORS.text }}>{item.label}</Text>
          </TouchableOpacity>)}
        </View>
        <Field label="الكود المرجعي للتحويل (اختياري)" value={topup.reference} onChangeText={value => setTopup(current => ({ ...current, reference: value }))} />
        <View style={styles.walletNotice}>
          <Text style={styles.walletNoticeTitle}>⚠️ تنويه بخصوص التحويلات</Text>
          <Text style={styles.walletNoticeText}>نقبل التحويل من محفظة إلكترونية إلى محفظة إلكترونية، أو من إنستا باي إلى محفظة إلكترونية فقط.</Text>
          <Text style={styles.walletNoticeEmphasis}>لا نقبل التحويل من إنستا باي إلى إنستا باي.</Text>
        </View>
        {String(user?.status || '').trim() !== 'معتمد' ? <Text style={{ color: COLORS.amber800, fontSize: 11, fontWeight: '800', marginTop: 8 }}>شحن المحفظة متاح بعد اعتماد حسابك من الإدارة.</Text> : null}<Button title={submitting ? 'جاري إرسال طلب الشحن...' : 'إرسال طلب شحن'} onPress={handleTopup} disabled={submitting || String(user?.status || '').trim() !== 'معتمد'} />
      </View> : null}
      {tab === 'requests' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>طلبات الشحن</Text>
        {requests.length ? requests.map((item, index) => <View key={String(item._id || index)} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
          <Text style={styles.detailBold}>{Number(item.amount || 0).toLocaleString('ar-EG')} جنيه • {item.status || 'قيد المراجعة'}</Text>
          <Text style={styles.detail}>{item.senderNumber || item.fromPhone || item.phone || ''} • {METHODS.find(method => method.id === item.method)?.label || 'تحويل محفظة'}</Text>
          {item.reference || item.referenceCode ? <Text style={styles.detail}>الكود المرجعي: {item.reference || item.referenceCode}</Text> : null}
          {item.createdAt ? <Text style={styles.detailSmall}>{new Date(item.createdAt).toLocaleString('ar-EG')}</Text> : null}
        </View>) : <Text style={styles.emptyText}>لا توجد طلبات شحن سابقة.</Text>}
      </View> : null}
      {tab === 'transactions' ? <View style={styles.dataCard}>
        <Text style={styles.cardTitlePremium}>سجل الحركات المالية</Text>
        {transactions.length ? transactions.map((item, index) => <View key={String(item._id || index)} style={{ paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: COLORS.border }}>
          <Text style={styles.detailBold}>{transactionLabel(item.type)} • <Text style={{ color: Number(item.amount) >= 0 ? COLORS.greenDark : COLORS.red }}>{Number(item.amount || 0) > 0 ? '+' : ''}{item.amount ?? '—'} ج</Text></Text>
          <Text style={styles.detail}>{item.description || ''}</Text>
          {item.createdAt ? <Text style={styles.detailSmall}>{new Date(item.createdAt).toLocaleString('ar-EG')}</Text> : null}
        </View>) : <Text style={styles.emptyText}>لا توجد حركات مالية مسجلة حتى الآن.</Text>}
      </View> : null}
    </ScrollView>
  );
}
