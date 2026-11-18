import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Share, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';

export default function ReferralCard({ session, kind, cardRef, expanded = false, onExpandedChange, showToggle = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isClient = kind === 'client';
  const title = isClient ? 'ادعُ صديقك واكسب 50 جنيهًا' : 'ادعُ فنيًا واكسب 150 جنيهًا';
  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true); setError('');
    try {
      const result = await api('/referrals/me/' + (isClient ? 'client' : 'fanni'), { token: session.token });
      setData(result);
    } catch (e) { setError(e.message || 'تعذر تحميل رابط الدعوة.'); }
    finally { setLoading(false); }
  }, [session?.token, isClient]);
  useEffect(() => { load(); }, [load]);
  const copy = async value => {
    if (!value) return;
    try { await Clipboard.setStringAsync(String(value)); Alert.alert('تم النسخ', 'تم نسخ بيانات الدعوة.'); }
    catch (_) { Alert.alert('تعذر النسخ', String(value)); }
  };
  const share = async () => {
    if (!data?.url) return;
    const invitationMessage = isClient
      ? '🎉 حمّل تطبيق حمزاوي سات واطلب الخدمة اللي محتاجها، واكسب 50 جنيه هدية بعد إكمال أول طلب ليك! 💰 سجّل دلوقتي واستمتع بخدمات حمزاوي سات.'
      : '💰 انضم لفريق فنيين حمزاوي سات واكسب 150 جنيه مكافأة بعد إكمال أول 3 طلبات ليك! 🎉 سجّل دلوقتي وابدأ شغلك معانا.';
    try { await Share.share({ message: invitationMessage + '\n' + data.url }); }
    catch (e) { Alert.alert('تعذر المشاركة', e.message || 'حاول مرة أخرى.'); }
  };
  return <View ref={cardRef} collapsable={false} style={[styles.dataCard, { borderWidth: 1, borderColor: COLORS.teal, marginTop: 12 }]}>
    <Text style={styles.cardTitlePremium}>{title}</Text>
    {showToggle ? <TouchableOpacity onPress={() => onExpandedChange?.(!expanded)} accessibilityRole="button" style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.indigo50, marginTop: 6 }}>
      <Text style={{ textAlign: 'center', color: COLORS.navy, fontWeight: '900' }}>{expanded ? 'إخفاء تفاصيل الدعوة ▲' : 'عرض تفاصيل الدعوة ▼'}</Text>
    </TouchableOpacity> : null}
    {expanded ? <>
    <Text style={[styles.detail, { fontSize: 14, lineHeight: 22, fontWeight: '700', color: COLORS.navy }]}>{isClient ? 'عن كل صديق جديد يسجل من رابط دعوتك ويكمل أول طلب، تحصل أنت وهو على 50 جنيهًا مكافأة.' : 'عن كل فني جديد يسجل من رابط دعوتك ويكمل 3 طلبات، تحصل أنت وهو على 150 جنيهًا مكافأة.'}</Text>
    {loading ? <Text style={styles.detail}>جاري تحميل رابط الدعوة...</Text> : null}
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
    {data?.enabled === false ? <Text style={styles.detail}>إنشاء دعوات جديدة متوقف حاليًا. الدعوات السابقة مستمرة في احتساب إنجازاتها.</Text> : null}
    {data?.code && data?.enabled !== false ? <View style={{ padding: 10, borderRadius: 10, backgroundColor: '#F1F5F9', marginTop: 8 }}>
      <Text style={styles.detailSmall}>كود دعوتك</Text>
      <Text selectable style={[styles.cardTitlePremium, { textAlign: 'center', letterSpacing: 1 }]}>{data.code}</Text>
      <TouchableOpacity onPress={() => copy(data.code)} style={{ padding: 10, borderRadius: 9, backgroundColor: COLORS.white, marginTop: 6 }}><Text style={{ textAlign: 'center', color: COLORS.navy, fontWeight: '900' }}>نسخ الكود</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', paddingVertical: 12, backgroundColor: COLORS.white, borderRadius: 10, marginTop: 10 }}><QRCode value={data.url} size={164} backgroundColor="#FFFFFF" color="#0B1B3A" /><Text style={[styles.detailSmall, { marginTop: 8 }]}>امسح الباركود لفتح رابط الدعوة</Text></View>
      <Text style={[styles.detailSmall, { marginTop: 10 }]}>رابط الدعوة</Text>
      <Text selectable style={styles.detail}>{data.url}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TouchableOpacity onPress={() => copy(data.url)} style={{ flex: 1, padding: 11, borderRadius: 9, backgroundColor: COLORS.white }}><Text style={{ textAlign: 'center', color: COLORS.navy, fontWeight: '900' }}>نسخ الرابط</Text></TouchableOpacity>
        <TouchableOpacity onPress={share} style={{ flex: 1, padding: 11, borderRadius: 9, backgroundColor: COLORS.navy }}><Text style={{ textAlign: 'center', color: COLORS.white, fontWeight: '900' }}>مشاركة</Text></TouchableOpacity>
      </View>
    </View> : null}
    <Text style={[styles.detailSmall, { marginTop: 8 }]}>دعواتك: {Number(data?.totals?.count || 0)} • المكتملة: {Number(data?.totals?.completed || 0)}</Text>
    {Array.isArray(data?.referrals) && data.referrals.length ? <View style={{ marginTop: 8, gap: 7 }}>
      {data.referrals.map(item => <View key={String(item._id || item.number)} style={{ padding: 9, borderRadius: 9, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white }}>
        <Text style={styles.detailBold}>{item.number || 'دعوة'} • {({ pending: 'معلقة', in_progress: 'قيد التقدم', eligible: 'مستحقة', completed: 'مكتملة', rejected: 'مرفوضة' })[item.status] || item.status || '—'}</Text>
        <Text style={styles.detailSmall}>الإنجاز: {Number(item.completedCount || 0)} / {Number(item.requiredCount || (isClient ? 1 : 3))} • مكافأتك: {item.inviterReward?.paidAt ? 'تم الصرف' : 'لم تصرف'} • مكافأة المدعو: {item.inviteeReward?.paidAt ? 'تم الصرف' : 'لم تصرف'}</Text>
      </View>)}
    </View> : null}
    <TouchableOpacity onPress={load} disabled={loading} style={{ paddingVertical: 8 }}><Text style={{ textAlign: 'center', color: COLORS.teal, fontWeight: '900' }}>تحديث بيانات الدعوة</Text></TouchableOpacity>
    </> : <Text style={[styles.detail, { marginTop: 8, fontSize: 14, lineHeight: 22, fontWeight: '700', color: COLORS.navy }]}>{isClient ? 'كل صديق جديد يسجل من رابطك ويكمل أول طلب يمنحك ويمنحه 50 جنيهًا مكافأة.' : 'كل فني جديد يسجل من رابطك ويكمل 3 طلبات يمنحك ويمنحه 150 جنيهًا مكافأة.'} {loading ? 'جاري تحميل البيانات...' : ''}</Text>}
  </View>;
}
