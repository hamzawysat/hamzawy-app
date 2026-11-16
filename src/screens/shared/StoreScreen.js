import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, getMediaUrl } from '../../services/api';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button, Field } from '../../components/FormControls';

function requestKey(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function StoreImage({ value, style }) {
  const [resolved, setResolved] = useState('');
  useEffect(() => {
    let active = true;
    const raw = String(value || '').trim();
    if (!raw) { setResolved(''); return () => { active = false; }; }
    if (raw.startsWith('https://') || raw.startsWith('http://')) { setResolved(raw); return () => { active = false; }; }
    const prefix = '/api/store/media/';
    let mediaId = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    while (mediaId.startsWith('/')) mediaId = mediaId.slice(1);
    getMediaUrl(mediaId).then(url => { if (active) setResolved(url); }).catch(() => { if (active) setResolved(''); });
    return () => { active = false; };
  }, [value]);
  return resolved ? <Image source={{ uri: resolved }} style={style} resizeMode="cover" /> : <View style={[style, { backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 28 }}>📦</Text></View>;
}

function money(value) {
  const amount = Number(value || 0);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString('ar-EG') + ' جنيه';
}

export function StoreAdBanner({ role, session, visible = true, onOpenStore }) {
  const [ads, setAds] = useState([]);
  const [index, setIndex] = useState(0);
  const [rotationSeconds, setRotationSeconds] = useState(5);
  const [displayReady, setDisplayReady] = useState(false);

  useEffect(() => {
    let active = true;
    api('/store/products').then(result => {
      if (!active) return;
      const now = Date.now();
      const eligible = (Array.isArray(result.products) ? result.products : [])
        .filter(item => item.isAdvertised === true)
        .filter(item => !item.adAudience || item.adAudience === 'both' || item.adAudience === role)
        .filter(item => !item.adExpiresAt || new Date(item.adExpiresAt).getTime() > now)
        .filter(item => item.stock === null || item.stock === undefined || Number(item.stock) > 0)
        .filter(item => Boolean(String(item.name || '').trim() && /^https?:\\/\\//i.test(String(item.imageUrl || ''))))
        .sort((a, b) => (Number(b.adPriority) || 0) - (Number(a.adPriority) || 0) ||
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setAds(eligible);
      const configuredSeconds = Number(result.adRotationSeconds);
      setRotationSeconds(Number.isInteger(configuredSeconds) && configuredSeconds >= 5 && configuredSeconds <= 60 ? configuredSeconds : 5);
      setIndex(0);
    }).catch(() => { if (active) setAds([]); });
    return () => { active = false; };
  }, [role, session?.token]);

  useEffect(() => {
    setDisplayReady(false);
    if (!visible || !ads.length) return undefined;
    const firstDisplay = setTimeout(() => setDisplayReady(true), 9000);
    return () => clearTimeout(firstDisplay);
  }, [ads.length, visible]);

  useEffect(() => {
    if (!visible || !displayReady || ads.length < 2) return undefined;
    const timer = setInterval(() => setIndex(current => (current + 1) % ads.length), rotationSeconds * 1000);
    return () => clearInterval(timer);
  }, [ads.length, visible, displayReady, rotationSeconds]);

  const item = ads[index];
  if (!visible || !displayReady || !item) return null;
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onOpenStore}
      style={{ marginHorizontal: 14, marginTop: 8, marginBottom: 4, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: '#DCE6F2', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <StoreImage value={item.imageUrl} style={{ width: 62, height: 62, borderRadius: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '800' }}>عرض من متجر حمزاوي سات</Text>
        <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 13, fontWeight: '900', marginTop: 3 }}>{item.name || 'منتج مميز'}</Text>
        <Text style={{ color: COLORS.teal, fontSize: 12, fontWeight: '900', marginTop: 3 }}>{money(item.price)}</Text>
      </View>
      <Text style={{ color: COLORS.teal, fontWeight: '900' }}>شاهد ←</Text>
    </TouchableOpacity>
  );
}

export default function StoreScreen({ role, session, walletBalance, onWalletBalanceChange }) {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!session?.token) return;
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled([
        api('/store/products'),
        api('/store/' + role + '/orders', { token: session.token })
      ]);
      if (results[0].status === 'rejected') throw results[0].reason;
      const catalog = results[0].value;
      setProducts(Array.isArray(catalog.products) ? catalog.products : []);
      setOrders(results[1].status === 'fulfilled' && Array.isArray(results[1].value.orders) ? results[1].value.orders : []);
    } catch (e) {
      setError(e.message || 'تعذر تحميل المتجر حاليًا.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, session?.token]);

  useEffect(() => { load(); }, [load]);

  const openPurchase = item => {
    setSelected(item);
    setQuantity('1');
    setNote('');
    setPaymentMethod('wallet');
  };

  const submitPurchase = async () => {
    if (!selected || submitting) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
      Alert.alert('الكمية غير صحيحة', 'اكتب كمية من 1 إلى 99.');
      return;
    }
    const isSubscription = selected.type === 'subscription';
    const key = requestKey('store');
    const send = method => api('/store/' + role + '/orders', {
      method: 'POST',
      token: session.token,
      body: {
        productId: String(selected._id),
        quantity: qty,
        note: String(note || '').trim().slice(0, 500),
        ...(isSubscription ? {} : { paymentMethod: method }),
        idempotencyKey: key
      }
    });
    setSubmitting(true);
    try {
      let result;
      try {
        result = await send(isSubscription ? undefined : paymentMethod);
      } catch (e) {
        if (!isSubscription && paymentMethod === 'wallet' && e.status === 409 && e.canUseCashOnDelivery === true) {
          setSubmitting(false);
          Alert.alert('الرصيد غير كافٍ', (e.message || 'رصيد المحفظة غير كافٍ.') + '\nهل تريد إكمال الطلب والدفع عند الاستلام؟', [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'الدفع عند الاستلام', onPress: async () => {
              setSubmitting(true);
              try {
                const fallback = await send('cash_on_delivery');
                if (fallback.balance !== undefined) onWalletBalanceChange?.(Number(fallback.balance));
                setSelected(null);
                Alert.alert('تم إرسال الطلب', fallback.message || 'تم إرسال طلب الشراء.');
                await load(true);
              } catch (fallbackError) {
                Alert.alert('تعذر إرسال الطلب', fallbackError.message || 'حاول مرة أخرى.');
              } finally { setSubmitting(false); }
            } }
          ]);
          return;
        }
        throw e;
      }
      if (result.balance !== undefined) onWalletBalanceChange?.(Number(result.balance));
      setSelected(null);
      Alert.alert('تم إرسال الطلب', result.message || 'تم إرسال طلب الشراء بنجاح.');
      await load(true);
    } catch (e) {
      Alert.alert('تعذر إرسال الطلب', e.message || 'حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const userBalance = Number(walletBalance ?? session?.user?.walletBalance ?? session?.user?.balance ?? 0);

  return (
    <View style={{ width: '100%' }}>
      <View style={{ padding: 14, paddingBottom: 28 }}>
        <View style={[styles.dataCard, { marginBottom: 12 }]}>
          <Text style={styles.cardTitlePremium}>متجر حمزاوي سات 🛍️</Text>
          <Text style={styles.detail}>اختار المنتج اللي محتاجه، وابعت طلبك. الإدارة هتتواصل معاك لتأكيد الطلب وطريقة الدفع.</Text>
          <Text style={[styles.detail, { fontWeight: '900', marginTop: 6 }]}>رصيد محفظتك: {money(userBalance)}</Text>
          <Button title={refreshing ? 'جاري التحديث...' : 'تحديث المتجر وطلباتي'} secondary onPress={() => load(true)} disabled={loading || refreshing} />
        </View>
        <View style={[styles.dataCard, { marginBottom: 12 }]}>
          <Text style={styles.cardTitleSmall}>طلبات المتجر السابقة ({orders.length})</Text>
          {orders.length ? orders.map((order, index) => (
            <View key={String(order._id || index)} style={{ paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: COLORS.border }}>
              <Text style={styles.detailBold}>{order.productName || order.name || 'طلب متجر'}</Text>
              <Text style={styles.detail}>الكمية: {order.quantity || 1} • {money(order.total)} • الحالة: {order.status || 'قيد المراجعة'}</Text>
              {order.createdAt ? <Text style={styles.detailSmall}>{new Date(order.createdAt).toLocaleString('ar-EG')}</Text> : null}
            </View>
          )) : <Text style={styles.emptyText}>لسه مفيش طلبات شراء.</Text>}
        </View>
        {loading ? <ActivityIndicator color={COLORS.teal} size="large" /> : error ? <View style={styles.dataCard}><Text style={styles.errorText}>{error}</Text><Button title="إعادة المحاولة" onPress={() => load()} /></View> :
          products.length ? products.map((item, index) => (
            <View key={String(item._id || index)} style={[styles.dataCard, { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }]}>
              <StoreImage value={item.imageUrl} style={{ width: 96, height: 96, borderRadius: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleSmall}>{item.name || 'منتج'}</Text>
                <Text style={[styles.detail, { color: COLORS.teal, fontWeight: '900' }]}>{item.type === 'subscription' ? 'اشتراك / تجديد اشتراك' : 'منتج وبضاعة'}{item.subscriptionDuration ? ' • ' + item.subscriptionDuration : ''}</Text>
                {item.description ? <Text style={styles.detail}>{item.description}</Text> : null}
                {item.details ? <Text style={styles.detail}>{item.details}</Text> : null}
                <Text style={[styles.detail, { fontWeight: '900', color: COLORS.navy }]}>{money(item.price)}</Text>
                {item.originalPrice != null && Number(item.originalPrice) > Number(item.price) ? <Text style={[styles.detail, { textDecorationLine: 'line-through' }]}>بدلًا من {money(item.originalPrice)}</Text> : null}
                {item.offerText ? <Text style={[styles.detail, { color: COLORS.greenDark }]}>{item.offerText}</Text> : null}
                <Button title="اطلب المنتج" onPress={() => openPurchase(item)} />
              </View>
            </View>
          )) : <View style={styles.dataCard}><Text style={styles.emptyText}>لا توجد منتجات متاحة حاليًا.</Text></View>}
      </View>
      <Modal transparent visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, gap: 10 }}>
            <Text style={styles.cardTitlePremium}>{selected?.name || 'طلب المنتج'}</Text>
            <Text style={styles.detail}>السعر: {money(selected?.price)}</Text>
            <Field label="الكمية" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
            <Field label="ملاحظات للطلب (اختياري)" value={note} onChangeText={setNote} multiline />
            {selected?.type !== 'subscription' ? <>
              <Text style={styles.sectionTitle}>طريقة الدفع</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setPaymentMethod('wallet')} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: paymentMethod === 'wallet' ? COLORS.teal : COLORS.border, backgroundColor: paymentMethod === 'wallet' ? COLORS.indigo50 : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '900', color: COLORS.text }}>من المحفظة</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setPaymentMethod('cash_on_delivery')} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: paymentMethod === 'cash_on_delivery' ? COLORS.teal : COLORS.border, backgroundColor: paymentMethod === 'cash_on_delivery' ? COLORS.indigo50 : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '900', color: COLORS.text }}>عند الاستلام</Text></TouchableOpacity>
              </View>
            </> : <Text style={styles.detail}>طلب الاشتراك لا يخصم أي مبلغ الآن؛ يتم تأكيده وفق إجراءات المتجر.</Text>}
            <Button title={submitting ? 'جاري إرسال الطلب...' : 'تأكيد طلب الشراء'} onPress={submitPurchase} disabled={submitting} />
            <Button title="إلغاء" secondary onPress={() => setSelected(null)} disabled={submitting} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
