import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, getMediaUrl } from '../../services/api';
import * as SecureStore from 'expo-secure-store';
import { COLORS } from '../../theme/colors';
import { styles } from '../../theme/styles';
import { Button, Field } from '../../components/FormControls';
import { normalizeArabicStoreSearch, matchesArabicStoreProductSearch } from '../../utils/store-search';

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
  return resolved ? <Image source={{ uri: resolved }} style={style} resizeMode="contain" /> : <View style={[style, { backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 28 }}>📦</Text></View>;
}

function money(value) {
  const amount = Number(value || 0);
  return (Number.isFinite(amount) ? amount : 0).toLocaleString('ar-EG') + ' جنيه';
}

export function StoreAdBanner({ role, session, visible = true, onOpenStore }) {
  const [item, setItem] = useState(null);
  const [displayReady, setDisplayReady] = useState(false);

  useEffect(() => {
    let active = true;
    let boundaryTimer = null;
    let retryTimer = null;
    let loading = false;
    const syncAdvertisement = async () => {
      if (!active || loading) return;
      loading = true;
      try {
        const result = await api('/store/advertisement/current?audience=' + encodeURIComponent(role));
        if (!active) return;
        setItem(result.currentAdvertisement || null);
        if (boundaryTimer) clearTimeout(boundaryTimer);
        const delay = Math.max(250, Number(result.nextChangeAt) - Number(result.serverTime) + 100);
        boundaryTimer = setTimeout(syncAdvertisement, delay);
      } catch (_) {
        if (active) retryTimer = setTimeout(syncAdvertisement, 5000);
      } finally { loading = false; }
    };
    syncAdvertisement();
    return () => {
      active = false;
      if (boundaryTimer) clearTimeout(boundaryTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [role, session?.token]);

  useEffect(() => {
    if (!visible || !item || displayReady) return undefined;
    const firstDisplay = setTimeout(() => setDisplayReady(true), 9000);
    return () => clearTimeout(firstDisplay);
  }, [item?._id, visible, displayReady]);

  if (!visible || !displayReady || !item) return null;
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onOpenStore}
      style={{ marginHorizontal: 12, marginTop: 6, marginBottom: 4, padding: 8, borderRadius: 14, borderWidth: 1, borderColor: '#D8E1FF', backgroundColor: '#EEF2FF', flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#102A9B', shadowOpacity: 0.07, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 }}>
      <StoreImage value={item.imageUrl} style={{ width: 46, height: 46, borderRadius: 9 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#102A9B', fontSize: 10, fontWeight: '900' }}>إعلان من متجر ساتفيو</Text>
        <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 2 }}>{item.name || 'منتج مميز'}</Text>
        <Text style={{ color: '#102A9B', fontSize: 12, fontWeight: '900', marginTop: 3 }}>{money(item.price)}</Text>
      </View>
      <Text style={{ color: '#102A9B', fontWeight: '900' }}>شاهد ←</Text>
    </TouchableOpacity>
  );
}

export default function StoreScreen({ role, session, walletBalance, onWalletBalanceChange }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [submitting, setSubmitting] = useState(false);
  const [previousOrdersOpen, setPreviousOrdersOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedProductDetails, setExpandedProductDetails] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [cartNote, setCartNote] = useState('');
  const [cartPaymentMethod, setCartPaymentMethod] = useState('wallet');
  const [cartSubmitting, setCartSubmitting] = useState(false);
  const [cartLoadedFor, setCartLoadedFor] = useState('');
  const cartStorageKey = useMemo(() => 'sonaa.store.cart.v1:' + role + ':' + String(session?.user?._id || session?.user?.id || 'account'), [role, session?.user?._id, session?.user?.id]);

  useEffect(() => {
    let active = true;
    setCart([]);
    setCartLoadedFor('');
    SecureStore.getItemAsync(cartStorageKey).then(serialized => {
      if (!active) return;
      let saved = [];
      try {
        const parsed = JSON.parse(serialized || '[]');
        if (Array.isArray(parsed)) saved = parsed.filter(item => item && typeof item.productId === 'string' && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0);
      } catch (_) {}
      setCart(saved);
      setCartLoadedFor(cartStorageKey);
    }).catch(() => { if (active) setCartLoadedFor(cartStorageKey); });
    return () => { active = false; };
  }, [cartStorageKey]);

  useEffect(() => {
    if (cartLoadedFor !== cartStorageKey) return;
    SecureStore.setItemAsync(cartStorageKey, JSON.stringify(cart)).catch(() => {});
  }, [cart, cartLoadedFor, cartStorageKey]);

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
      setCategories(Array.isArray(catalog.categories) ? catalog.categories : []);
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

  const addToCart = item => {
    if (!item?._id) return;
    if (item.type === 'subscription') { openPurchase(item); return; }
    const productId = String(item._id);
    setCart(current => {
      const existing = current.find(entry => entry.productId === productId);
      if (existing) return current.map(entry => entry.productId === productId
        ? { ...entry, quantity: Math.min(1000, Number(entry.quantity || 1) + 1) }
        : entry);
      return [...current, { productId, name: String(item.name || 'منتج'), price: Number(item.price || 0), quantity: 1 }];
    });
    Alert.alert('سلة المشتريات', 'تمت إضافة المنتج إلى السلة.');
  };

  const updateCartQuantity = (productId, quantity) => {
    const next = Number(quantity);
    if (!Number.isInteger(next) || next < 0 || next > 1000) return;
    setCart(current => next === 0
      ? current.filter(item => item.productId !== String(productId))
      : current.map(item => item.productId === String(productId) ? { ...item, quantity: next } : item));
  };

  const refreshCartPrices = async () => {
    const catalog = await api('/store/products');
    const freshProducts = Array.isArray(catalog.products) ? catalog.products : [];
    setProducts(freshProducts);
    setCategories(Array.isArray(catalog.categories) ? catalog.categories : []);
    setCart(current => current.map(entry => {
      const fresh = freshProducts.find(product => String(product._id) === entry.productId);
      return fresh ? { ...entry, name: String(fresh.name || entry.name), price: Number(fresh.price || 0) } : entry;
    }));
  };

  const submitCartOrder = async () => {
    if (!cart.length || cartSubmitting) return;
    if (cart.length > 50) {
      Alert.alert('السلة كبيرة', 'الحد الأقصى للطلب المجمع هو 50 منتجًا مختلفًا.');
      return;
    }
    const key = requestKey('store-bulk');
    const send = method => api('/store/' + role + '/orders/bulk', {
      method: 'POST',
      token: session.token,
      body: {
        items: cart.map(item => ({
          productId: item.productId,
          quantity: Number(item.quantity || 1),
          expectedPrice: Number(item.price || 0)
        })),
        note: String(cartNote || '').trim().slice(0, 1000),
        paymentMethod: method,
        idempotencyKey: key
      }
    });
    setCartSubmitting(true);
    try {
      let result;
      try {
        result = await send(cartPaymentMethod);
      } catch (error) {
        if (error?.priceChanged) {
          try { await refreshCartPrices(); } catch (_) {}
          Alert.alert('السعر اتغير', 'حدّثنا أسعار المنتجات المتاحة. راجع إجمالي السلة قبل تأكيد الطلب مرة أخرى.');
          return;
        }
        if (cartPaymentMethod === 'wallet' && error?.status === 409 && error?.canUseCashOnDelivery === true) {
          setCartSubmitting(false);
          Alert.alert('رصيد المحفظة غير كافٍ', (error.message || 'رصيد المحفظة غير كافٍ.') + '\nهل تريد إكمال الطلب والدفع عند الاستلام؟', [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'الدفع عند الاستلام', onPress: async () => {
              setCartSubmitting(true);
              try {
                const fallback = await send('cash_on_delivery');
                if (fallback.balance !== undefined) onWalletBalanceChange?.(Number(fallback.balance));
                setCart([]);
                setCartNote('');
                Alert.alert('تم إرسال الطلب', fallback.message || 'تم إرسال طلب الشراء المجمع.');
                await load(true);
              } catch (fallbackError) {
                if (fallbackError?.priceChanged) {
                  try { await refreshCartPrices(); } catch (_) {}
                  Alert.alert('السعر اتغير', 'راجع الأسعار الجديدة في السلة ثم أعد التأكيد.');
                } else {
                  Alert.alert('تعذر إرسال الطلب', fallbackError.message || 'حاول مرة أخرى.');
                }
              } finally { setCartSubmitting(false); }
            } }
          ]);
          return;
        }
        throw error;
      }
      if (result.balance !== undefined) onWalletBalanceChange?.(Number(result.balance));
      setCart([]);
      setCartNote('');
      Alert.alert('تم إرسال الطلب', result.message || 'تم إرسال طلب الشراء المجمع بنجاح.');
      await load(true);
    } catch (error) {
      Alert.alert('تعذر إرسال الطلب', error.message || 'حاول مرة أخرى.');
    } finally {
      setCartSubmitting(false);
    }
  };

  const userBalance = Number(walletBalance ?? session?.user?.walletBalance ?? session?.user?.balance ?? 0);
  const groupedProducts = useMemo(() => {
    const groups = new Map();
    (Array.isArray(products) ? products : []).forEach((item, index) => {
      const category = String(item?.category || 'عام').trim() || 'عام';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push({ item, index });
    });
    return Array.from(groups.entries()).map(([category, items]) => {
      const categoryInfo = (Array.isArray(categories) ? categories : []).find(entry => String(entry?.name || '') === category);
      const fallbackProduct = items.find(({ item }) => String(item?.imageUrl || '').trim())?.item || items[0]?.item;
      return { category, items, imageUrl: String(categoryInfo?.imageUrl || fallbackProduct?.imageUrl || '').trim() };
    });
  }, [products, categories]);
  const selectedGroup = groupedProducts.find(group => group.category === selectedCategory);
  const normalizedQuery = normalizeArabicStoreSearch(searchQuery);
  const searchMatches = useMemo(() => products
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => matchesArabicStoreProductSearch(item, normalizedQuery)), [products, normalizedQuery]);
  const displayedProducts = normalizedQuery ? searchMatches : (selectedGroup?.items || null);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0), [cart]);

  return (
    <View style={{ width: '100%' }}>
      <View style={{ padding: 14, paddingBottom: 28 }}>
        <View style={{ backgroundColor: '#101F9B', borderRadius: 21, padding: 17, marginBottom: 13, shadowColor: '#07136E', shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900', textAlign: 'right' }}>متجر ساتفيو</Text>
          <Text style={{ color: '#E2E8FF', fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 5 }}>منتجات وخدمات مختارة… اطلب بسهولة وتابع مشترياتك</Text>
          <View style={{ alignSelf: 'flex-end', marginTop: 11, backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ color: '#101F9B', fontSize: 11, fontWeight: '900' }}>تسوق الآن</Text>
          </View>
        </View>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ابحث عن منتج أو قسم أو وصف..."
          placeholderTextColor={COLORS.muted}
          accessibilityLabel="البحث في منتجات المتجر"
          style={{ backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, color: COLORS.text, textAlign: 'right', marginBottom: 12, borderColor: '#DDE3F3' }}
        />
        <View style={[styles.dataCard, { marginBottom: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: previousOrdersOpen }}
              onPress={() => setPreviousOrdersOpen(open => !open)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
            >
              <Text style={styles.cardTitleSmall}>طلبات المتجر السابقة ({orders.length})</Text>
              <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '900' }}>{previousOrdersOpen ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => load(true)} disabled={loading || refreshing}>
              <Text style={{ color: COLORS.navy, fontWeight: '900' }}>{refreshing ? '...' : 'تحديث'}</Text>
            </TouchableOpacity>
          </View>
          {previousOrdersOpen ? (
            orders.length ? orders.map((order, index) => (
              <View key={String(order._id || index)} style={{ paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: COLORS.border }}>
                <Text style={styles.detailBold}>{order.productName || order.name || 'طلب متجر'}</Text>
                <Text style={styles.detail}>الكمية: {order.quantity || 1} • {money(order.total)} • الحالة: {order.status || 'قيد المراجعة'}</Text>
                {order.createdAt ? <Text style={styles.detailSmall}>{new Date(order.createdAt).toLocaleString('ar-EG')}</Text> : null}
              </View>
            )) : <Text style={styles.emptyText}>لسه مفيش طلبات شراء.</Text>
          ) : null}
        </View>
        {cart.length ? (
          <View style={[styles.dataCard, { marginBottom: 12 }]}>
            <Text style={styles.cardTitleSmall}>سلة المشتريات ({cart.length})</Text>
            {cart.map(item => (
              <View key={item.productId} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailBold}>{item.name}</Text>
                  <Text style={styles.detailSmall}>{money(item.price)} × {item.quantity}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={'تقليل كمية ' + item.name} onPress={() => updateCartQuantity(item.productId, Number(item.quantity) - 1)} style={{ padding: 8 }}>
                  <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '900' }}>−</Text>
                </TouchableOpacity>
                <Text style={{ color: COLORS.text, fontWeight: '900' }}>{item.quantity}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={'زيادة كمية ' + item.name} onPress={() => updateCartQuantity(item.productId, Math.min(1000, Number(item.quantity) + 1))} style={{ padding: 8 }}>
                  <Text style={{ color: COLORS.navy, fontSize: 18, fontWeight: '900' }}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={'حذف ' + item.name} onPress={() => updateCartQuantity(item.productId, 0)} style={{ padding: 6 }}>
                  <Text style={{ color: COLORS.red, fontSize: 11, fontWeight: '900' }}>حذف</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[styles.detailBold, { textAlign: 'right', marginTop: 12 }]}>الإجمالي: {money(cartTotal)}</Text>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>طريقة الدفع</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={() => setCartPaymentMethod('wallet')} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: cartPaymentMethod === 'wallet' ? COLORS.navy : COLORS.border, backgroundColor: cartPaymentMethod === 'wallet' ? '#EEF2FF' : COLORS.white }}>
                <Text style={{ textAlign: 'center', fontWeight: '900', color: COLORS.text }}>من المحفظة</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCartPaymentMethod('cash_on_delivery')} style={{ flex: 1, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: cartPaymentMethod === 'cash_on_delivery' ? COLORS.navy : COLORS.border, backgroundColor: cartPaymentMethod === 'cash_on_delivery' ? '#EEF2FF' : COLORS.white }}>
                <Text style={{ textAlign: 'center', fontWeight: '900', color: COLORS.text }}>عند الاستلام</Text>
              </TouchableOpacity>
            </View>
            <Field label="ملاحظات للطلب (اختياري)" value={cartNote} onChangeText={setCartNote} multiline />
            <Button title={cartSubmitting ? 'جاري إرسال الطلب...' : 'تأكيد الطلب المجمع'} onPress={submitCartOrder} disabled={cartSubmitting} />
          </View>
        ) : null}
        {loading ? <ActivityIndicator color={COLORS.navy} size="large" /> : error ? <View style={styles.dataCard}><Text style={styles.errorText}>{error}</Text><Button title="إعادة المحاولة" onPress={() => load()} /></View> :
          displayedProducts ? (
            <View style={{ marginBottom: 12 }}>
              {normalizedQuery ? (
                <Text style={[styles.sectionTitle, { textAlign: 'right', marginBottom: 12 }]}>نتائج البحث: {displayedProducts.length} منتج</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedCategory('')}
                    style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white }}>
                    <Text style={{ color: COLORS.navy, fontSize: 12, fontWeight: '900' }}>← كل الأقسام</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.sectionTitle}>{selectedGroup?.category}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: '700' }}>{displayedProducts.length} منتج</Text>
                  </View>
                </View>
              )}
              {normalizedQuery && !displayedProducts.length ? <View style={styles.dataCard}><Text style={styles.emptyText}>ملقيناش منتجات مطابقة. جرّب كلمة أقصر أو كتابة مختلفة.</Text></View> : null}
              {displayedProducts.map(({ item, index }) => (
                <View key={String(item._id || index)} style={[styles.dataCard, { marginBottom: 10, flexDirection: 'column', alignItems: 'stretch', gap: 10, overflow: 'hidden' }]}>
                  <StoreImage value={item.imageUrl} style={{ width: '100%', height: 180, borderRadius: 12, alignSelf: 'stretch' }} />
                  <View style={{ width: '100%', minWidth: 0 }}>
                    <Text style={[styles.cardTitleSmall, { textAlign: 'right' }]}>{item.name || 'منتج'}</Text>
                    <Text style={[styles.detail, { fontWeight: '900', color: COLORS.navy, marginTop: 6, textAlign: 'right' }]}>{money(item.price)}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ expanded: Boolean(expandedProductDetails[String(item._id || index)]) }}
                      onPress={() => setExpandedProductDetails(current => ({ ...current, [String(item._id || index)]: !current[String(item._id || index)] }))}
                      style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 2, marginTop: 4 }}
                    >
                      <Text style={{ color: COLORS.navy, fontSize: 12, fontWeight: '900' }}>
                        تفاصيل المنتج {expandedProductDetails[String(item._id || index)] ? '⌃' : '⌄'}
                      </Text>
                    </TouchableOpacity>
                    {expandedProductDetails[String(item._id || index)] ? (
                      <View style={{ marginTop: 4, padding: 10, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: COLORS.border, gap: 6, width: '100%' }}>
                        <Text style={styles.detail}>النوع: {item.type === 'subscription' ? 'اشتراك / تجديد اشتراك' : 'منتج وبضاعة'}{item.subscriptionDuration ? ' • ' + item.subscriptionDuration : ''}</Text>
                        <Text style={styles.detail}>الوصف: {String(item.description || '').trim() || 'لا يوجد وصف'}</Text>
                        {String(item.details || '').trim() ? <Text style={styles.detail}>المواصفات: {item.details}</Text> : null}
                        {item.originalPrice != null && Number(item.originalPrice) > Number(item.price) ? <Text style={[styles.detail, { textDecorationLine: 'line-through' }]}>السعر السابق: {money(item.originalPrice)}</Text> : null}
                        {item.offerText ? <Text style={[styles.detail, { color: COLORS.greenDark }]}>{item.offerText}</Text> : null}
                      </View>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 8, marginTop: 8, width: '100%' }}>
                      <TouchableOpacity accessibilityRole="button" onPress={() => addToCart(item)}
                        style={{ flexGrow: 1, flexBasis: 0, minWidth: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 11 }}>
                        <Text style={{ color: COLORS.white, fontWeight: '900', fontSize: 12, textAlign: 'center' }}>{item.type === 'subscription' ? 'اطلب الاشتراك' : 'أضف للسلة'}</Text>
                      </TouchableOpacity>
                      {item.type !== 'subscription' ? <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => openPurchase(item)}
                        style={{ flexGrow: 1, flexBasis: 0, minWidth: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.blue, borderColor: COLORS.indigo700, borderWidth: 1, borderBottomWidth: 3, borderBottomColor: COLORS.indigo700, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42 }}
                      >
                        <Text style={{ color: COLORS.white, fontWeight: '800', fontSize: 12, textAlign: 'center' }}>شراء مباشر</Text>
                      </TouchableOpacity> : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : groupedProducts.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
              {groupedProducts.map(group => {
                const coverProduct = group.items.find(({ item }) => String(item?.imageUrl || '').trim())?.item || group.items[0]?.item;
                return (
                  <TouchableOpacity key={group.category} accessibilityRole="button"
                    accessibilityLabel={'فتح قسم ' + group.category}
                    onPress={() => setSelectedCategory(group.category)}
                    style={{ width: '48%', marginBottom: 2, borderRadius: 19, borderWidth: 1, borderColor: '#E5E9F2', backgroundColor: COLORS.white, overflow: 'hidden' }}>
                    <StoreImage value={group.imageUrl || coverProduct?.imageUrl} style={{ width: '100%', height: 112 }} />
                    <View style={{ padding: 12 }}>
                      <Text numberOfLines={1} style={{ color: COLORS.navy, fontSize: 13, fontWeight: '900', textAlign: 'right' }}>{group.category}</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: '700', textAlign: 'right', marginTop: 4 }}>{group.items.length} منتج</Text>
                      <Text style={{ color: COLORS.navy, fontSize: 10, fontWeight: '900', textAlign: 'right', marginTop: 8 }}>عرض المنتجات ←</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : <View style={styles.dataCard}><Text style={styles.emptyText}>لا توجد منتجات متاحة حاليًا.</Text></View>}
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
                <TouchableOpacity onPress={() => setPaymentMethod('wallet')} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: paymentMethod === 'wallet' ? COLORS.navy : COLORS.border, backgroundColor: paymentMethod === 'wallet' ? '#EEF2FF' : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '900', color: COLORS.text }}>من المحفظة</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setPaymentMethod('cash_on_delivery')} style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: paymentMethod === 'cash_on_delivery' ? COLORS.navy : COLORS.border, backgroundColor: paymentMethod === 'cash_on_delivery' ? '#EEF2FF' : COLORS.white }}><Text style={{ textAlign: 'center', fontWeight: '900', color: COLORS.text }}>عند الاستلام</Text></TouchableOpacity>
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
