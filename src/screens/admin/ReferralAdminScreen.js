import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button, Field } from '../../components/FormControls';

const statusLabel = value => ({ pending: 'معلقة', in_progress: 'قيد التقدم', eligible: 'مستحقة', completed: 'مكتملة', rejected: 'مرفوضة' })[value] || value || '—';

export default function ReferralAdminScreen({ session }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [paid, setPaid] = useState('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (kind !== 'all') params.set('kind', kind);
      if (status !== 'all') params.set('status', status);
      if (paid !== 'all') params.set('paid', paid);
      if (search.trim()) params.set('q', search.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const [s, list] = await Promise.all([
        api('/referrals/admin/summary', { token: session.token }),
        api('/referrals/admin/list' + (params.toString() ? '?' + params.toString() : ''), { token: session.token })
      ]);
      setSummary(s); setEnabled(s.enabled !== false);
      setRows(Array.isArray(list.referrals) ? list.referrals : Array.isArray(list.data) ? list.data : []);
    } catch (e) { setError(e.message || 'تعذر تحميل إدارة الدعوات.'); }
    finally { setLoading(false); }
  }, [session?.token, kind, status, paid, search, from, to]);
  useEffect(() => { load(); }, [load]);
  const setSystemEnabled = async value => {
    setSaving(true);
    try { const result = await api('/referrals/admin/settings', { method: 'PATCH', token: session.token, body: { enabled: value } }); setEnabled(result.enabled !== false); Alert.alert('تم تحديث النظام', value ? 'تم تشغيل إنشاء الدعوات الجديدة.' : 'تم إيقاف إنشاء الدعوات الجديدة، والدعوات السابقة مستمرة.'); await load(); }
    catch (e) { Alert.alert('تعذر تحديث الإعداد', e.message || 'حاول مرة أخرى.'); }
    finally { setSaving(false); }
  };
  const openDetail = async item => {
    setDetail({ loading: true });
    try { const result = await api('/referrals/admin/' + encodeURIComponent(item._id), { token: session.token }); setDetail(result); }
    catch (e) { setDetail(null); Alert.alert('تعذر تحميل التفاصيل', e.message || 'حاول مرة أخرى.'); }
  };
  const reject = async () => {
    if (!rejecting || reason.trim().length < 3) { Alert.alert('سبب الرفض مطلوب', 'اكتب سببًا واضحًا لا يقل عن 3 أحرف.'); return; }
    setSaving(true);
    try { await api('/referrals/admin/' + encodeURIComponent(rejecting._id) + '/reject', { method: 'POST', token: session.token, body: { reason: reason.trim() } }); setRejecting(null); setReason(''); Alert.alert('تم رفض الدعوة', 'تم تسجيل سبب الرفض وبيانات المسؤول.'); await load(); }
    catch (e) { Alert.alert('تعذر رفض الدعوة', e.message || 'حاول مرة أخرى.'); }
    finally { setSaving(false); }
  };
  const stat = (label, value) => <View style={{ flex: 1, minWidth: '30%', padding: 10, backgroundColor: '#F1F5F9', borderRadius: 10 }}><Text style={styles.detailSmall}>{label}</Text><Text style={styles.cardTitlePremium}>{Number(value || 0).toLocaleString('ar-EG')}</Text></View>;
  const statusCounts = summary?.statuses || {};
  const rewards = summary?.rewards || [];
  const paidFor = type => { const row = rewards.find(x => x._id === type) || {}; return Number(row.inviterPaid || 0) + Number(row.inviteePaid || 0); };
  const paidClient = paidFor('client');
  const paidFanni = paidFor('fanni');
  const rewardTotal = paidClient + paidFanni;
  const dueTotal = rewards.reduce((sum, x) => sum + Number(x.inviterDue || 0) + Number(x.inviteeDue || 0), 0);
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listPremium} keyboardShouldPersistTaps="handled">
    <View style={styles.dataCard}>
      <Text style={styles.cardTitlePremium}>إدارة الدعوات والمكافآت</Text>
      <Text style={styles.detail}>إيقاف النظام يمنع الدعوات الجديدة فقط، ولا يوقف استحقاق الدعوات المسجلة سابقًا.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Button title={saving ? 'جاري الحفظ...' : enabled ? 'إيقاف الدعوات الجديدة' : 'تشغيل الدعوات الجديدة'} secondary onPress={() => setSystemEnabled(!enabled)} disabled={saving} />
        <Button title="تحديث" secondary onPress={load} disabled={loading} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {stat('إجمالي الدعوات', summary?.total)}
        {stat('دعوات العملاء', summary?.clients)}
        {stat('دعوات الفنيين', summary?.technicians)}
        {stat('معلقة', statusCounts.pending)}
        {stat('قيد التقدم', statusCounts.in_progress)}
        {stat('مستحقة', statusCounts.eligible)}
        {stat('مكتملة', statusCounts.completed)}
        {stat('مرفوضة', statusCounts.rejected)}
        {stat('مكافآت العملاء المصروفة', paidClient)}
        {stat('مكافآت الفنيين المصروفة', paidFanni)}
        {stat('إجمالي المكافآت المصروفة', rewardTotal)}
        {stat('المكافآت المستحقة', dueTotal)}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
    <View style={styles.dataCard}>
      <Text style={styles.cardTitleSmall}>البحث والتصفية</Text>
      <Field label="بحث بالاسم أو المعرف أو رقم الدعوة" value={search} onChangeText={setSearch} placeholder="اكتب كلمة البحث" />
      <Text style={styles.detailSmall}>نوع الدعوة</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[['all','الكل'],['client','عملاء'],['fanni','فنيون']].map(x => <TouchableOpacity key={x[0]} onPress={() => setKind(x[0])} style={{ padding: 9, borderRadius: 9, backgroundColor: kind === x[0] ? COLORS.navy : '#F1F5F9' }}><Text style={{ color: kind === x[0] ? COLORS.white : COLORS.text, fontWeight: '800' }}>{x[1]}</Text></TouchableOpacity>)}</View>
      <Text style={[styles.detailSmall, { marginTop: 10 }]}>الحالة</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[['all','الكل'],['pending','معلقة'],['in_progress','قيد التقدم'],['eligible','مستحقة'],['completed','مكتملة'],['rejected','مرفوضة']].map(x => <TouchableOpacity key={x[0]} onPress={() => setStatus(x[0])} style={{ padding: 8, borderRadius: 9, backgroundColor: status === x[0] ? COLORS.navy : '#F1F5F9' }}><Text style={{ color: status === x[0] ? COLORS.white : COLORS.text, fontSize: 10, fontWeight: '800' }}>{x[1]}</Text></TouchableOpacity>)}</View>
      <Text style={[styles.detailSmall, { marginTop: 10 }]}>حالة الصرف</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>{[['all','الكل'],['yes','تم الصرف للطرفين'],['no','لم يكتمل الصرف']].map(x => <TouchableOpacity key={x[0]} onPress={() => setPaid(x[0])} style={{ padding: 8, borderRadius: 9, backgroundColor: paid === x[0] ? COLORS.navy : '#F1F5F9' }}><Text style={{ color: paid === x[0] ? COLORS.white : COLORS.text, fontSize: 10, fontWeight: '800' }}>{x[1]}</Text></TouchableOpacity>)}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="من تاريخ" value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" /></View>
        <View style={{ flex: 1 }}><Field label="إلى تاريخ" value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" /></View>
      </View>
      <Button title="تطبيق البحث والتصفية" onPress={load} disabled={loading} />
    </View>
    {loading ? <ActivityIndicator color={COLORS.teal} /> : null}
    {rows.map(item => <View key={String(item._id)} style={styles.dataCard}>
      <Text style={styles.cardTitleSmall}>{item.number} • {item.kind === 'client' ? 'دعوة عميل' : 'دعوة فني'}</Text>
      <Text style={styles.detail}>الداعي: {item.inviterData?.name || item.inviter} • {item.inviterData?.id || item.inviter}</Text>
      <Text style={styles.detail}>المدعو: {item.inviteeData?.name || item.invitee} • {item.inviteeData?.id || item.invitee}</Text>
      <Text style={styles.detail}>التاريخ: {item.invitedAt ? new Date(item.invitedAt).toLocaleDateString('ar-EG') : '—'} • الحالة: {statusLabel(item.status)}</Text>
      <Text style={styles.detail}>الإنجاز: {Number(item.completedCount || 0)} / {Number(item.requiredCount || 0)}</Text>
      <Text style={styles.detail}>الداعي: 50 ج — {item.inviterReward?.paidAt ? 'تم الصرف' : 'لم يصرف'} • المدعو: 50 ج — {item.inviteeReward?.paidAt ? 'تم الصرف' : 'لم يصرف'}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="التفاصيل" secondary onPress={() => openDetail(item)} /></View>
      {item.status !== 'completed' && item.status !== 'rejected' && !item.inviterReward?.paidAt && !item.inviteeReward?.paidAt ? <View style={{ flex: 1 }}><Button title="رفض الدعوة" secondary onPress={() => { setRejecting(item); setReason(''); }} /></View> : null}</View>
    </View>)}
    {!loading && !rows.length ? <Text style={styles.emptyText}>لا توجد دعوات مطابقة.</Text> : null}
    <Modal transparent visible={Boolean(detail)} animationType="slide" onRequestClose={() => setDetail(null)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 14 }}><View style={{ maxHeight: '90%', backgroundColor: COLORS.white, borderRadius: 16, padding: 14 }}><ScrollView><Text style={styles.cardTitlePremium}>تفاصيل الدعوة</Text>{detail?.loading ? <ActivityIndicator color={COLORS.teal} /> : detail?.referral ? <><Text style={styles.detail}>رقم الدعوة: {detail.referral.number}</Text><Text style={styles.detail}>الداعي: {detail.inviter?.name || '—'} • {detail.inviter?.phone || '—'}</Text><Text style={styles.detail}>المدعو: {detail.invitee?.name || '—'} • {detail.invitee?.phone || '—'}</Text><Text style={styles.detail}>الحالة: {statusLabel(detail.referral.status)}</Text><Text style={styles.detail}>الإنجازات المسجلة: {detail.referral.achievementLog?.length || 0}</Text>{(detail.referral.achievementLog || []).map((x,i) => <Text key={String(x.orderId || i)} style={styles.detailSmall}>{x.orderSN || x.jobId || 'إنجاز'} • {x.completedAt ? new Date(x.completedAt).toLocaleString('ar-EG') : '—'}</Text>)}<Text style={styles.sectionTitleSmall}>حركات المحفظة</Text>{(detail.transactions || []).map((x,i) => <Text key={String(x._id || i)} style={styles.detail}>{x.description || 'مكافأة دعوة'} • {x.amount} ج • {x.createdAt ? new Date(x.createdAt).toLocaleString('ar-EG') : '—'}</Text>)}</> : null}<Button title="إغلاق" secondary onPress={() => setDetail(null)} /></ScrollView></View></View></Modal>
    <Modal transparent visible={Boolean(rejecting)} animationType="fade" onRequestClose={() => setRejecting(null)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 16 }}><View style={{ backgroundColor: COLORS.white, borderRadius: 16, padding: 16 }}><Text style={styles.cardTitlePremium}>رفض الدعوة</Text><Text style={styles.detail}>اكتب سبب الرفض، وسيتم تسجيله في سجل الإدارة.</Text><TextInput value={reason} onChangeText={setReason} multiline placeholder="سبب الرفض" textAlign="right" style={{ minHeight: 90, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, marginVertical: 10, color: COLORS.text }} /><Button title={saving ? 'جاري الرفض...' : 'تأكيد الرفض'} onPress={reject} disabled={saving || reason.trim().length < 3} /><Button title="إلغاء" secondary onPress={() => setRejecting(null)} /></View></View></Modal>
  </ScrollView>;
}
