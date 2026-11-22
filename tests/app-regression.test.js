const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function collectJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectJavaScript(fullPath) : /\.js$/.test(entry.name) ? [fs.readFileSync(fullPath, 'utf8')] : [];
  }).join('\n');
}
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8') + '\n' + collectJavaScript(path.join(root, 'src'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('all project JavaScript and JSX files parse successfully', () => {
  const parser = require('@babel/parser');
  const files = [
    path.join(root, 'App.js'),
    path.join(root, 'babel.config.js'),
    ...['src', 'tests'].flatMap(directory => {
      const collect = current => fs.readdirSync(current, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(current, entry.name);
        return entry.isDirectory() ? collect(fullPath) : /\.js$/.test(entry.name) ? [fullPath] : [];
      });
      return collect(path.join(root, directory));
    })
  ];
  const failures = [];
  for (const file of files) {
    try {
      parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx'] });
    } catch (error) {
      failures.push(path.relative(root, file) + ': ' + error.message);
    }
  }
  assert.deepEqual(failures, [], 'JavaScript/JSX syntax errors detected');
});

test('app resolves its API from the stable GitHub Pages configuration and has no embedded backend host', () => {
  const apiSource = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');
  assert.match(apiSource, /https:\/\/hamzawysat\.github\.io\/hamzawy-download\/server-config\.json/);
  assert.match(apiSource, /SecureStore\.getItemAsync/);
  assert.match(apiSource, /SecureStore\.setItemAsync/);
  assert.match(apiSource, /value\.schemaVersion !== 1/);
  assert.match(apiSource, /getApiUrl/);
  assert.match(apiSource, /apiHost/);
  assert.match(apiSource, /apiPort/);
  assert.ok(apiSource.includes("'/api/store/media'"));
  assert.equal(app.includes('API_BASE'), false);
  assert.doesNotMatch(app, /(?:sonaa-backend-v2|hamzawy-sat)\.(?:vercel\.app|dynv6\.net)/);
});

test('rating dismissal uses versioned encrypted storage and keeps migration keys', () => {
  assert.match(app, /sonaa\.rating\.dismissed\.v3:/);
  assert.match(app, /sonaa\.rating\.dismissed\.v1:/);
  assert.match(app, /sonaa\.rating\.dismissed\.v2:/);
  assert.match(app, /SecureStore\.getItemAsync\(ratingStorageKey\)/);
  assert.match(app, /const serialized = JSON\.stringify\(merged\)/);
  assert.match(app, /SecureStore\.setItemAsync\(ratingStorageKey, serialized\)/);
});

test('rating prompt has no skip action and submits from a compact five-star row', () => {
  const modalStart = app.indexOf('function renderRatingModal(role)');
  const modalEnd = app.indexOf('\n  async function acceptTechnicianGuidelines', modalStart);
  assert.notEqual(modalStart, -1, 'rating modal renderer should exist');
  const modalBody = app.slice(modalStart, modalEnd);
  assert.ok(modalBody.includes('renderRatingStars(order, stars, true)'), 'modal should use compact stars');
  assert.ok(modalBody.includes("submitting ? '...' : 'تقييم'"), 'modal should show the تقييم button');
  assert.ok(!modalBody.includes('تخطي'), 'rating modal must not have a skip button');
  assert.ok(!modalBody.includes('تعليق (اختياري)'), 'rating modal should only ask for stars');
  assert.ok(modalBody.includes('onRequestClose={() => {}}'), 'back action must not dismiss the rating prompt');
});

test('rating dismissal state is loaded before being considered ready for the active account', () => {
  assert.match(app, /ratingDismissalsLoadedFor/);
  assert.match(app, /setRatingDismissalsLoaded\(false\)/);
  assert.match(app, /setRatingDismissalsLoadedFor\(ratingStorageKey\)/);
  assert.match(app, /setRatingDismissalsLoaded\(true\)/);
});

test('password-save consent is asked only until a password exists for that role and phone', () => {
  const loginStart = app.indexOf('async function handleLogin()');
  const loginEnd = app.indexOf('async function registerClient()', loginStart);
  const loginBody = app.slice(loginStart, loginEnd);
  assert.ok(loginBody.includes('SecureStore.getItemAsync(savedPasswordKey)'));
  assert.ok(loginBody.includes('if (previouslySavedPassword)'));
  assert.ok(loginBody.includes('if (previouslySavedPassword !== loginPassword)'));
  assert.ok(loginBody.includes("Alert.alert('حفظ بيانات الدخول'"));
  assert.ok(loginBody.includes('sonaa.auth.password.v1.'));
});


test('client and technician sessions are restored from SecureStore and validated', () => {
  assert.match(app, /sonaa\.auth\.session\.v1/);
  assert.match(app, /SecureStore\.getItemAsync\('sonaa\.auth\.session\.v1'\)/);
  assert.match(app, /!saved\?\.token \|\| !\['client', 'fanni'\]\.includes\(saved\.role\)/);
  assert.match(app, /SecureStore\.deleteItemAsync\('sonaa\.auth\.session\.v1'\)/);
});

test('foreground notifications are configured to show alerts and play sound', () => {
  assert.match(app, /Notifications\.setNotificationHandler\(/);
  assert.match(app, /shouldShowAlert: true/);
  assert.match(app, /shouldPlaySound: true/);
});

test('push token registration remains active across session refreshes and logout removes it explicitly', () => {
  assert.ok(app.includes('Notifications.getExpoPushTokenAsync({ projectId })'));
  assert.ok(app.includes('pushTokenRef.current = result.data'));
  assert.ok(app.includes('body: { token: result.data, platform: Platform.OS }'));
  assert.ok(app.includes('tokenRefreshSubscription.remove()'));
  assert.ok(!app.includes("method: 'DELETE', token: session.token, body: { token: registeredToken }"));
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  assert.ok(screens.includes("method: 'DELETE', token: activeSession.token, body: { token: pushToken }"));
  assert.ok(app.includes('Notifications.addPushTokenListener'));
});



test('client can confirm service receipt and sees the fixed 14-day warranty window', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  assert.match(screen, /confirm-completion/);
  assert.match(screen, /تأكيد استلام الخدمة وبدء ضمان 14 يومًا/);
  assert.match(screen, /clientConfirmedAt/);
  assert.match(screen, /warrantyExpiresAt/);
  assert.match(screen, /completionDeclaredAt/);
});

test('required runtime packages are declared', () => {
  for (const name of ['expo', 'react', 'react-native', 'expo-notifications', 'expo-secure-store']) {
    assert.ok(packageJson.dependencies[name], 'missing dependency: ' + name);
  }
});

test('client order cards define order inside the client orders map callback', () => {
  const clientScreen = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  assert.match(
    clientScreen,
    /clientData\.orders\.filter\([\s\S]*?\)\.map\(\(order, i\) => \{[\s\S]*?const sn = getOrderSN\(order\)/,
    'client order rendering must declare order in the map callback before reading it'
  );
});

test('technician offer flow rejects missing order data before opening or submitting an offer', () => {
  const sendStart = app.indexOf('function sendOffer(order)');
  const submitStart = app.indexOf('async function submitOffer()', sendStart);
  assert.notEqual(sendStart, -1, 'technician sendOffer handler should exist');
  assert.notEqual(submitStart, -1, 'technician submitOffer handler should exist');
  const sendBody = app.slice(sendStart, submitStart);
  const submitEnd = app.indexOf('\n  async function cancelClientOrder', submitStart);
  assert.notEqual(submitEnd, -1, 'submitOffer should end before client order handlers');
  const submitBody = app.slice(submitStart, submitEnd);
  assert.match(sendBody, /!order \|\| typeof order !== 'object' \|\| !getOrderSN\(order\)/);
  assert.match(submitBody, /const orderSN = getOrderSN\(offerDraft\?\.order\)/);
  assert.match(submitBody, /if \(!orderSN \|\| !session\?\.token\)/);
  assert.match(submitBody, /encodeURIComponent\(orderSN\)/);
});

test('rating modal and rating submission safely handle missing technician order data', () => {
  const modalStart = app.indexOf('function renderRatingModal(role)');
  const modalEnd = app.indexOf('\n  async function acceptTechnicianGuidelines', modalStart);
  assert.notEqual(modalStart, -1, 'rating modal renderer should exist');
  assert.notEqual(modalEnd, -1, 'rating modal renderer boundary should exist');
  const modalBody = app.slice(modalStart, modalEnd);
  assert.match(modalBody, /if \(!order \|\| typeof order !== 'object' \|\| !sn\) return null/);
  const submitStart = app.indexOf('async function submitOrderRating(order)');
  const submitEnd = app.indexOf('\n  async function ', submitStart + 10);
  assert.notEqual(submitStart, -1, 'rating submit handler should exist');
  assert.match(app.slice(submitStart, submitEnd), /!order \|\| typeof order !== 'object' \|\| !sn/);
  assert.match(app.slice(submitStart, submitEnd), /if \(!order \|\| typeof order !== 'object' \|\| !sn\) \{[\s\S]*?setRatingPrompt\(null\)/);
});

test('brand header displays the brand without any moving shine or shimmer', () => {
  const appEntry = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.ok(appEntry.includes('<Text style={styles.brandHeaderTitle}>حمزاوي سات</Text>'), 'Hamzawy Sat brand should remain visible as native text');
  assert.doesNotMatch(appEntry, /shimmer|LinearGradient|brandHeaderShimmer/, 'the moving shine effect must be completely removed from the header');
  assert.equal((appEntry.match(/brandHeaderTitle}>حمزاوي سات/g) || []).length, 1, 'header should contain exactly one brand word');
});

test('client and technician account logout buttons appear after account actions and before service history', () => {
  const account = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  const passwordButton = account.indexOf('Button title="تغيير كلمة المرور"');
  const logoutButton = account.indexOf('Button title="تسجيل الخروج"');
  const historyHeading = account.indexOf('سجل الخدمات والتقييمات');
  assert.ok(passwordButton !== -1 && logoutButton > passwordButton && historyHeading > logoutButton, 'logout must follow the two account action buttons and precede service history');
});

test('startup splash stays visible until saved account restoration finishes', () => {
  const appEntry = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  assert.ok(appEntry.includes('authRestoring || !splashMinimumElapsed'), 'splash should cover the startup screen while session restoration is running');
  assert.ok(appEntry.includes('onAuthRestoringChange={setAuthRestoring}'), 'app shell should receive the session restoration state');
  assert.ok(screens.includes('onAuthRestoringChange?.(authRestoring)'), 'screen should report when saved account restoration completes');
});

test('Hamzawy Sat splash keeps the brand and service identity with the animated logo', () => {
  assert.ok(app.includes("const logoRotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '18deg'] })"), 'logo should interpolate between left and right angles');
  assert.ok(app.includes('<Animated.Image source={require("./assets/LOGO_UPLOAD_HERE/logo.png")} style={[splashStyles.logo, { transform: [{ rotate: logoRotation }] }]} resizeMode="contain" />'), 'the logo image itself should rotate');
  assert.ok(!app.includes('spinningLetter'), 'the separate spinning letter should be removed');
  assert.ok(!app.includes('<Animated.Text'), 'the splash should not animate a separate text letter');
  assert.ok(app.includes('<Text style={splashStyles.title}>حمزاوي سات</Text>'), 'the main brand word should remain static');
  assert.ok(app.includes('<Text style={splashStyles.caption}>الدش • كاميرات المراقبة • الشاشات</Text>'), 'splash caption should identify Hamzawy Sat services');
  assert.ok(app.includes('<Text style={styles.homeTaglinePremium}>كُلُّ خِدْمَةٍ تَبْدَأُ بِخُطْوَةٍ</Text>'), 'home tagline should retain the premium home design');
  assert.ok(!app.includes('صُنّاع — كل خدمة تبدأ بخطوة'), 'login should not receive the splash-only tagline');
  assert.ok(!app.includes('<Text style={styles.subtitle}>كل خدمة تبدأ بخطوة</Text>'), 'technician screen should not receive the splash-only tagline');
});


test('technician dashboard guards missing collections and initializes filtered orders before tab labels', () => {
  const tech = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.ok(tech.includes('const technicianOrders = Array.isArray(techData?.orders) ? techData.orders : [];'));
  assert.ok(tech.includes('const technicianOffers = Array.isArray(techData?.offers) ? techData.offers : [];'));
  assert.ok(tech.includes('const notificationItems = Array.isArray(notifications?.items) ? notifications.items : [];'));
  assert.ok(tech.includes('const technicianOrdersPagination = techData?.ordersPagination || null;'));
  assert.ok(tech.indexOf('const filteredAvailableOrders =') < tech.indexOf('const tabs ='), 'filtered orders must exist before tab labels read their count');
});

test('rating prompt appears only when an order transitions to completed while its role is active', () => {
  assert.ok(app.includes('ratingStatusSnapshotRef'), 'previous order statuses should be tracked');
  assert.ok(app.includes('previousStatus && !isCompletedStatus(previousStatus) && isCompletedStatus(status)'), 'prompt should depend on a transition into completed');
  assert.ok(app.includes('if (candidate) setRatingPrompt(current => current || candidate)'), 'only one pending prompt should open at a time');
  assert.ok(app.includes('⭐ قيّم الفني'), 'client keeps a manual rating option in previous orders');
  assert.ok(app.includes('⭐ قيّم العميل'), 'technician keeps a manual rating option in completed jobs');
});

test('blue keyboard send action sends messages in client, technician, and support chats', () => {
  assert.ok(app.includes('returnKeyType="send" onSubmitEditing={() => sendOrderChat('), 'client chat should send from keyboard action');
  assert.ok(app.includes('returnKeyType="send" onSubmitEditing={() => sendOrderChat(item)}'), 'technician chat should send from keyboard action');
  assert.ok(app.includes('returnKeyType="send" onSubmitEditing={() => sendSupportMessage(false)}'), 'support chat should send from keyboard action');
  assert.ok(app.includes('returnKeyType="send" onSubmitEditing={sendRecoveryMessage}'), 'recovery chat should send from keyboard action');
});

test('pre-acceptance chat exposes the server-approved quick questions and replies', () => {
  for (const phrase of ['هل السعر شامل؟', 'متى تقدر تيجي؟', 'هل في تكلفة إضافية؟', 'نعم', 'لا', 'حسب الاتفاق']) assert.ok(app.includes(phrase), 'missing quick chat action: ' + phrase);
});

test('accepted technician jobs load private client details through the authorized API and show call action', () => {
  assert.ok(app.includes('/assigned-details'));
  assert.ok(app.includes('📞 اتصال بالعميل'));
  assert.ok(app.includes('العنوان بالتفصيل:'));
  assert.ok(app.includes('تفاصيل الشغل من العميل'));
});

test('accepted technician details request is not cancelled by its own loading-state update', () => {
  assert.ok(app.includes(".then(result => { setAssignedDetails(current => ({ ...current, [sn]: { loading: false, order: result.order || result.data || null, error: '' } })); })"));
  assert.ok(app.includes(".catch(error => { setAssignedDetails(current => ({ ...current, [sn]: { loading: false, order: null, error: error.message || 'تعذر تحميل تفاصيل العميل' } })); });"));
  assert.ok(!app.includes("if (active) setAssignedDetails(current => ({ ...current, [sn]: { loading: false, order: result.order"));
});

test('technician price increase and client approval controls are wired to existing backend routes', () => {
  assert.ok(app.includes('/price-change'));
  assert.ok(app.includes('إرسال طلب الزيادة'));
  assert.ok(app.includes('موافقة على الزيادة'));
  assert.ok(app.includes('رفض الزيادة'));
  assert.ok(app.includes('لازم السعر الجديد يكون أعلى من السعر الحالي'));
});

test('technician sees a pending price-increase status in the chat to prevent duplicate requests', () => {
  assert.ok(app.includes("تم تقديم طلبك، في انتظار رد العميل."));
  assert.ok(app.includes("لا ترسل طلبًا آخر قبل رد العميل."));
  assert.ok(app.includes("getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests)"));
  assert.ok(app.includes("entry.status==='مقبول'?'وافق العميل على زيادة السعر.'"));
  assert.ok(app.includes("entry.status==='مرفوض'?'رفض العميل الزيادة؛ السعر السابق ما زال ساريًا.'"));
});

test('client and technician notifications continue polling while their app screen is open', () => {
  assert.match(app, /setInterval\(\(\) => loadRoleNotifications\(false\), 5000\)/);
  assert.match(app, /setInterval\(pollOpenChats, 3000\)/);
});


test('technician order cards label area and client budget and invite technicians to submit an offer', () => {
  assert.ok(app.includes('المنطقة: {item.area || \'غير محددة\'} • ميزانية العميل:'));
  assert.ok(app.includes('`حوالي ${item.budget} جنيه`'));
  assert.ok(app.includes('يمكنك تقديم عرضك بالسعر المناسب لك.'));
});

test('client service description is prominent and readable on technician job cards and accepted job details', () => {
  assert.ok(app.includes('serviceDescriptionBox: { backgroundColor: COLORS.indigo50'));
  assert.ok(app.includes('serviceDescriptionText: { color: COLORS.navy, fontSize: 18, fontWeight: \'600\', lineHeight: 28'));
  assert.ok(app.includes('تفاصيل الخدمة من العميل</Text><Text style={styles.serviceDescriptionText}>{item.description'));
  assert.ok(app.includes('تفاصيل الشغل من العميل</Text><Text style={styles.serviceDescriptionText}>{assignedDetails[sn].order.description'));
});

test('client orders and technician offers are deduplicated by serial number on every refresh', () => {
  assert.ok(app.includes('function uniqueByOrderSN(items)'));
  assert.equal(app.split("orders: uniqueByOrderSN(toList(result, ['orders']))").length - 1, 2);
  assert.ok(app.includes("offers: results[1].status === 'fulfilled' ? uniqueByOrderSN(toList(results[1].value, ['offers'])) : current.offers"));
  assert.ok(app.includes("function uniqueByOrderSN(items)"));
  assert.ok(app.includes("const sn = getOrderSN(item)"));
  assert.ok(app.includes("indexBySN.set(sn, result.length)"));
});

test('client previous completed orders expose a manual technician rating button without showing it for canceled or already-rated orders', () => {
  assert.ok(app.includes("clientTab === 'previous' && ['تم الانتهاء','منتهي','مكتمل','مكتملة','completed','complete','finished']"));
  assert.ok(app.includes('⭐ قيّم الفني'));
  assert.ok(app.includes("setRatingPrompt({ role: 'client', order })"));
  assert.ok(app.includes("(order.ratings || []).some(r => r.reviewerRole === 'client')"));
});

test('technician completed orders expose a manual client rating button only when not already rated', () => {
  assert.ok(app.includes("tab === 'completed' && !alreadyRatedByTechnician"));
  assert.ok(app.includes('⭐ قيّم العميل'));
  assert.ok(app.includes("setRatingPrompt({ role: 'fanni', order: item })"));
  assert.ok(app.includes("(item.ratings || []).some(r => r.reviewerRole === 'fanni')"));
});

test('client previous-order classification includes every completed status used by account history', () => {
  const clientScreen = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  assert.match(clientScreen, /const CLIENT_PREVIOUS_ORDER_STATUSES = new Set\(\[.*'مكتمل'.*'مكتملة'.*'completed'.*'complete'.*'finished'/);
  assert.match(clientScreen, /function isPreviousClientOrder\(order\)/);
  assert.ok(clientScreen.includes('isPreviousClientOrder(order)'));
  assert.ok(clientScreen.includes('isPreviousClientOrder(order)'));
});

test('client current orders tab is labeled الطلبات الجارية', () => {
  assert.ok(app.includes("{key:'current',label:'الطلبات',icon:'📋'}"));
});

test('client and technician notifications visually distinguish unread items and provide read all', () => {
  assert.equal(app.split('title="قراءة الكل" secondary onPress={markAllNotificationsRead}').length - 1, 2);
  assert.equal(app.split('(item.read || item.readAt) ? styles.notificationRead : styles.notificationUnread').length - 1, 2);
  assert.ok(app.includes("notificationRead: { backgroundColor: '#F8F9FC', opacity: 0.76 }"));
  assert.ok(app.includes("notificationReadText: { color: '#71809A' }"));
  assert.ok(app.includes("unread: 0 }));"));
});

test('mark all notifications read clears unread count and dims all notifications', () => {
  assert.ok(app.includes('items: current.items.map(n => ({ ...n, read: true, readAt: n.readAt || new Date().toISOString() })), unread: 0'));
});

test('client and technician chats render price-change requests in the same chronological timeline as messages', () => {
  assert.ok(app.includes('function getOrderChatTimeline(messages, priceChangeRequests)'));
  assert.ok(app.includes("item?.createdAt || 0"));
  assert.ok(app.includes("item?.requestedAt || item?.createdAt || 0"));
  assert.ok(app.includes('return aTime - bTime || a._chatStableOrder - b._chatStableOrder'));
  assert.equal(app.split("getOrderChatTimeline(orderChats[sn]?.messages, orderChats[sn]?.priceChangeRequests).map((entry,j)=>entry._chatItemType").length - 1, 2);
  assert.ok(!app.includes('(orderChats[sn]?.priceChangeRequests||[]).map(request=>'), 'price-change requests must not render in a separate fixed section');
  assert.ok(app.includes('onPress={()=>decideOrderPrice(order,entry,true)}'), 'client approval remains connected to each pending request');
  assert.ok(app.includes('onPress={()=>decideOrderPrice(order,entry,false)}'), 'client rejection remains connected to each pending request');
  assert.ok(app.includes("entry.status==='مقبول'?'وافق العميل على زيادة السعر.'"));
  assert.ok(app.includes("entry.status==='مرفوض'?'رفض العميل الزيادة؛ السعر السابق ما زال ساريًا.'"));
});

test('client and technician dashboards remove floating controls while preserving refresh logic and support access', () => {
  assert.equal(app.split('onPress={openWhatsAppSupport} style={[styles.floatingButton,styles.whatsappButton]}').length - 1, 0, 'floating support buttons should be removed');
  const clientDashboard = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const technicianDashboard = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  for (const [role, source] of [['client', clientDashboard], ['technician', technicianDashboard]]) {
    assert.doesNotMatch(source, /floatingControls/, role + ' floating refresh control should be removed');
    assert.ok(source.includes('refreshVisibleData'), role + ' refresh logic should remain available');
  }
  assert.ok(technicianDashboard.includes("setScreen('support')"), 'technician support entry point should remain available');
  assert.ok(clientDashboard.includes("setScreen('support')"), 'client support entry point should remain available');
});

test('technician available orders and offers are deduplicated on initial load and refresh', () => {
  assert.ok(app.includes("orders: results[1].status === 'fulfilled' ? uniqueByOrderSN(toList(results[1].value, ['orders'])) : []"));
  assert.ok(app.includes("offers: results[2].status === 'fulfilled' ? uniqueByOrderSN(toList(results[2].value, ['offers'])) : []"));
  assert.ok(app.includes("orders: results[0].status === 'fulfilled' ? uniqueByOrderSN(toList(results[0].value, ['orders'])) : current.orders"));
  assert.ok(app.includes("offers: results[1].status === 'fulfilled' ? uniqueByOrderSN(toList(results[1].value, ['offers'])) : current.offers"));
});

test('wallet transfer notice explains accepted routes in both client and technician wallets', () => {
  const technicianWallet = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianWalletScreen.js'), 'utf8');
  const clientWallet = fs.readFileSync(path.join(root, 'src/screens/client/ClientWalletScreen.js'), 'utf8');
  for (const [role, source] of [['client', clientWallet], ['technician', technicianWallet]]) {
    assert.ok(source.includes('تنويه بخصوص التحويلات'), role + ' wallet should explain accepted transfer routes');
    assert.ok(source.includes('من محفظة إلكترونية إلى محفظة إلكترونية'), role + ' wallet should state wallet-to-wallet transfers');
    assert.ok(source.includes('من إنستا باي إلى محفظة إلكترونية فقط'), role + ' wallet should state InstaPay-to-wallet transfers');
    assert.ok(source.includes('لا نقبل التحويل من إنستا باي إلى إنستا باي'), role + ' wallet should reject InstaPay-to-InstaPay transfers');
  }
  assert.ok(app.includes('walletNotice:'));
});


test('client order validation shows a separate message for each missing field', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const start = screens.indexOf('  async function createOrder() {');
  const end = screens.indexOf('  async function trackClientOrder()', start);
  const createOrder = screens.slice(start, end);
  assert.ok(createOrder.includes("Alert.alert('الخدمة التفصيلية مطلوبة', 'اختار الخدمة التفصيلية لإكمال الطلب.')"));
  assert.ok(createOrder.includes("Alert.alert('المنطقة مطلوبة', 'اختار منطقة العمل من القائمة لإكمال الطلب.')"));
  assert.ok(createOrder.includes("if (detailedAddress.length < 10)"));
  assert.ok(createOrder.includes('اكتب العنوان بالتفصيل في 10 أحرف على الأقل'));
  assert.ok(!createOrder.includes("'بيانات ناقصة'"), 'combined missing-data alert should be removed');
  assert.ok(createOrder.includes("if (description.length < 10 && !form.voiceRecordingData)"));
});

test('client request form Enter advances from detailed description to budget and submits from budget', () => {
  const descriptionField = app.match(/<Field inputRef=\{clientDescriptionInputRef\}[^\n]+/);
  const budgetField = app.match(/<Field inputRef=\{clientBudgetInputRef\}[^\n]+/);
  assert.ok(descriptionField, 'detailed description field should exist');
  assert.ok(descriptionField[0].includes('returnKeyType="next"'), 'description should show the next keyboard action');
  assert.ok(descriptionField[0].includes('onSubmitEditing={() => clientBudgetInputRef.current?.focus()}'), 'Enter should focus the budget field');
  assert.ok(descriptionField[0].includes('blurOnSubmit'), 'Enter should submit the multiline field rather than insert a newline');
  assert.ok(budgetField, 'budget field should exist');
  assert.ok(budgetField[0].includes('returnKeyType="go"'), 'budget should show the submit keyboard action');
  assert.ok(budgetField[0].includes('onSubmitEditing={createOrder}'), 'Enter in the final field should submit the order');
});

test('mobile client can record, preview, delete, and submit voice order descriptions', () => {
  assert.ok(app.includes("import { Audio } from 'expo-av'"));
  assert.ok(app.includes("import * as FileSystem from 'expo-file-system'"));
  assert.ok(app.includes('function VoiceRecorder({ value, onChange, disabled })'));
  assert.ok(app.includes('Audio.RecordingOptionsPresets.HIGH_QUALITY'));
  assert.ok(app.includes("onChange('data:audio/mp4;base64,' + base64)"));
  assert.ok(app.includes("voiceRecordingData: ''"));
  assert.ok(app.includes("...(form.voiceRecordingData ? { voiceRecordingData: form.voiceRecordingData } : {})"));
  assert.ok(app.includes('description.length < 10 && !form.voiceRecordingData'));
  assert.ok(app.includes('🔴 بدء التسجيل'));
  assert.ok(app.includes('▶️ سماع التسجيل'));
  assert.ok(app.includes('🗑 حذف'));
});
test('technician can play voice descriptions in available and accepted jobs through authenticated backend endpoint', () => {
  assert.equal(app.split('function VoicePlayback({ orderSN, token, hasVoiceRecording })').length - 1, 1);
  assert.ok(app.includes("getApiUrl('/orders/' + encodeURIComponent(String(orderSN)) + '/voice')"));
  assert.ok(app.includes("headers: { Authorization: 'Bearer ' + token }"));
  assert.ok(app.includes('<VoicePlayback orderSN={sn} token={session?.token} hasVoiceRecording={Boolean(item.hasVoiceRecording)} />'));
  assert.ok(app.includes('assignedDetails[sn].order.hasVoiceRecording || item.hasVoiceRecording'));
});
test('voice recording dependencies match Expo SDK 51 and backend voice size validation', () => {
  assert.equal(packageJson.dependencies['expo-av'], '~14.0.7');
  assert.equal(packageJson.dependencies['expo-file-system'], '~17.0.1');
  assert.ok(app.includes('info.size > 360000'));
});

test('voice recorder auto-stop uses a stable recording reference after React state updates', () => {
  const start = app.indexOf('function VoiceRecorder(');
  const end = app.indexOf('function VoicePlayback(', start);
  const recorder = app.slice(start, end);
  assert.ok(recorder.includes('const recordingRef = useRef(null)'));
  assert.ok(recorder.includes('recordingRef.current = created.recording'));
  assert.ok(recorder.includes('const active = recordingRef.current'));
  assert.ok(recorder.includes('finishRecording(); return 30;'));
});

test('Expo native config requests microphone permission for voice recording', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.ok(config.expo.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === 'expo-av' && plugin[1].microphonePermission));
});


test('technician account tab exposes Edit My Details and specialty edits are optional', () => {
  assert.ok(app.includes(`{tab === 'profile' && <ScrollView`), 'technician account tab should exist');
  assert.ok(app.includes('Button title="✏️ تعديل بياناتي" onPress={beginProfileEdit}'), 'technician account tab should open profile editing');
  assert.ok(app.includes('التخصصات والخدمات (اختياري)'), 'specialty selection should be labelled optional');
  assert.ok(!app.includes("اختار تخصصًا واحدًا على الأقل."), 'saving profile edits should not require selecting a specialty');
});

test('technician profile edit loads shared service categories before rendering specialty choices', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  assert.match(screens, /\['client', 'technician', 'clientRegister', 'technicianRegister', 'profileEdit'\]\.includes\(screen\)/);
  assert.ok(account.includes('categories.map(category => { const chosenCount = (category.services || []).filter(service => profileEditForm.specialties.includes(service)).length;'));
});


test('modular screen files are connected and app assets resolve from their new locations', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const appEntry = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.match(screen, /import \{ api(?:, uploadRegistrationIdentity)? \} from '\.\.\/services\/api';/);
  assert.match(screen, /from '\.\/auth\/AuthScreens'/);
  assert.match(screen, /from '\.\/account\/AccountScreens'/);
  assert.ok(!screen.includes('require("./assets/'), 'screen assets must use the path relative to src/screens');
  assert.match(screen, /require\('\.\.\/\.\.\/assets\/LOGO_UPLOAD_HERE\/logo\.png'\)/);
  assert.match(appEntry, /from '\.\/src\/screens\/AppScreens'/);
});

test('client account is a dashboard tab and uses the shared ad banner above its content', () => {
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  assert.match(client, /key:'profile',label:'حسابي',icon:'👤'/);
  assert.doesNotMatch(client, /Button title="حسابي"[^\n]*setScreen\('account'\)/);
  assert.match(client, /clientTab === 'profile' \? <AccountScreen embedded session=\{session\}/);
  assert.match(client, /<StoreAdBanner role="client" session=\{session\} visible=\{clientTab !== 'store'\}/);
  assert.match(account, /embedded = false/);
  assert.match(account, /!embedded \? <Button title="‹ رجوع"/);
  assert.doesNotMatch(account, /StoreAdBanner/);
});

test('authentication and account screens are extracted from the main screen controller', () => {
  const authScreens = fs.readFileSync(path.join(root, 'src/screens/auth/AuthScreens.js'), 'utf8');
  const accountScreens = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  for (const name of ['LoginScreen', 'ChangePasswordScreen', 'PasswordRecoveryScreen']) assert.match(authScreens, new RegExp('export function ' + name));
  for (const name of ['AccountScreen', 'ProfileEditScreen']) assert.match(accountScreens, new RegExp('export function ' + name));
});


test('extracted screen modules contain component bodies, not the old screen condition wrappers', () => {
  const authScreens = fs.readFileSync(path.join(root, 'src/screens/auth/AuthScreens.js'), 'utf8');
  const accountScreens = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  assert.ok(!authScreens.includes("if (screen === 'login')"));
  assert.ok(!accountScreens.includes("if (screen === 'account')"));
  assert.ok(!accountScreens.includes("if (screen === 'profileEdit')"));
  assert.match(authScreens, /return <SafeAreaView style=\{styles\.loginSafe\}>/);
  assert.match(accountScreens, /return <SafeAreaView style=\{styles\.safe\}>/);
  assert.match(authScreens, /require\('\.\.\/\.\.\/\.\.\/assets\/LOGO_UPLOAD_HERE\/logo\.png'\)/);
});




test('client and technician dashboards are split into dedicated feature modules', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const technician = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.match(screen, /from '\.\/client\/ClientDashboard'/);
  assert.match(screen, /from '\.\/technician\/TechnicianDashboard'/);
  assert.match(screen, /<ClientDashboard context=\{screenContext\}/);
  assert.match(screen, /<TechnicianDashboard context=\{screenContext\}/);
  assert.match(client, /export function ClientDashboard/);
  assert.match(technician, /export function TechnicianDashboard/);
  assert.match(client, /const \{ screen, setScreen/);
  assert.match(technician, /const \{ screen, setScreen/);
});


test('application state is grouped in a dedicated hook without changing state ownership', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const hook = fs.readFileSync(path.join(root, 'src/hooks/useAppState.js'), 'utf8');
  assert.match(screen, /import \{ useAppState \} from '\.\.\/hooks\/useAppState';/);
  assert.match(screen, /const appState = useAppState\(\)/);
  assert.match(hook, /export function useAppState\(\)/);
  assert.match(hook, /const \[session, setSession\] = useState\(null\)/);
  assert.match(hook, /const \[clientData, setClientData\] = useState/);
  assert.match(hook, /const \[techData, setTechData\] = useState/);
  assert.match(hook, /const services = useMemo/);
  assert.match(hook, /return \{[\s\S]*?session[\s\S]*?clientData[\s\S]*?techData/);
});


test('navigation and push registration are isolated in dedicated hooks', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'src/hooks/useScreenNavigation.js'), 'utf8');
  const push = fs.readFileSync(path.join(root, 'src/hooks/usePushNotifications.js'), 'utf8');
  assert.match(screen, /useScreenNavigation\(\)/);
  assert.match(screen, /onScreenChange\?\.\(screen, headerInitial\)/);
  assert.match(screen, /usePushNotifications\(session, handlePushNotificationResponse\)/);
  assert.match(navigation, /export function useScreenNavigation/);
  assert.match(push, /export function usePushNotifications/);
  assert.match(push, /getExpoPushTokenAsync/);
  assert.match(push, /push-token/);
  assert.match(push, /Notifications\.setNotificationHandler/);
});



 
test('area search normalizes Arabic alif variants and strips diacritics and invisible marks', () => {
  const helpers = fs.readFileSync(path.join(root, 'src/utils/area-helpers.js'), 'utf8');
  assert.match(helpers, /\[أإآٱ\]\/g/);
  assert.match(helpers, /\\u064B-\\u065F/);
  assert.match(helpers, /isReservedAreaLabel/);
  assert.match(helpers, /\.replace\(\/\[ة\]\/g, 'ه'\)/, 'Arabic ta marbuta and ha should normalize consistently');
});

test('technician registration and profile edits use approved multi-select areas, not free text', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  assert.ok(screens.includes('<AreaPicker label="مناطق العمل *" options={areas} multiple'));
  assert.match(screens, /areas: selectedAreas/);
  assert.ok(account.includes('<AreaPicker label="مناطق العمل *" options={areas} multiple'));
  assert.doesNotMatch(screens, /مناطق العمل \(اكتب المناطق وافصل بينها بفاصلة\)/);
  assert.doesNotMatch(account, /مناطق العمل \(افصل بين المناطق بفاصلة\)/);
});

test('client order area is selected from approved options and service counts react to selected area', () => {
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  assert.ok(client.includes('<AreaPicker label="المنطقة أو الحي *" options={areas}'));
  assert.match(client, /technicianCountByArea\?\.\[form\.area\]/);
  assert.match(client, /serviceTechnicianCountsByArea\?\.\[service\]\?\.\[form\.area\]/);
  assert.match(screens, /!areas\.includes\(form\.area\)/);
});

 


test('single customer area selection closes the results until the user changes or searches again', () => {
  const picker = fs.readFileSync(path.join(root, 'src/components/AreaPicker.js'), 'utf8');
  assert.match(picker, /const \[showResults, setShowResults\] = useState\(multiple \|\| !value\)/);
  assert.match(picker, /setShowResults\(false\)/);
  assert.match(picker, /onFocus=\{\(\) => setShowResults\(true\)\}/);
  assert.match(picker, /onChange\?\.\(''\); setShowResults\(true\)/);
  assert.match(picker, /\{showResults \? \(/);
});





test('client area selection hides the search field, reveals the detailed address, and shows live technician totals', () => {
  const picker = fs.readFileSync(path.join(root, 'src/components/AreaPicker.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  assert.match(picker, /technicianCounts = \{\}/);
  assert.match(picker, /Number\(technicianCounts\?\.\[area\] \|\| 0\)\} فني/);
  assert.match(picker, /\(multiple \|\| !selected\.length\) \? <TextInput/);
  assert.ok(client.includes('technicianCounts={areaTechnicianCounts}'));
  assert.ok(client.includes('{form.area ? <Field inputRef={clientAddressInputRef} label="العنوان بالتفصيل *"'));
  assert.ok(screens.includes('setAreaTechnicianCounts(areaResponse.status'));
  assert.ok(screens.includes('areaTechnicianCounts, setAreaTechnicianCounts,'));
});

test('client and technician dashboards open on their browser-equivalent home views', () => {
  const state = fs.readFileSync(path.join(root, 'src/hooks/useAppState.js'), 'utf8');
  assert.match(state, /const \[clientTab, setClientTab\] = useState\('home'\)/);
  assert.match(state, /tab: 'home'/);
  assert.match(state, /useState\('home'\)/);
});



test('client dashboard includes browser service/store chooser, store, wallet, subscriptions, support and complaint tracking', () => {
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'src/screens/shared/StoreScreen.js'), 'utf8');
  const wallet = fs.readFileSync(path.join(root, 'src/screens/client/ClientWalletScreen.js'), 'utf8');
  const subscriptions = fs.readFileSync(path.join(root, 'src/screens/client/ClientSubscriptionsScreen.js'), 'utf8');
  assert.ok(client.includes("clientNewRequestChoice === 'technician'"));
  assert.ok(client.includes("setClientTab('store')"));
  assert.ok(client.includes("clientTab === 'store'"));
  assert.ok(client.includes("clientTab === 'wallet'"));
  assert.ok(client.includes("clientTab === 'subscriptions'"));
  assert.ok(client.includes('trackClientComplaints'));
  assert.ok(client.includes('payForClientOrder'));
  assert.ok(client.includes('openTrackedOrderDetails'));
  assert.ok(client.includes('notifications.unread'));
  assert.ok(client.includes('طلبات سابقة'));
  assert.ok(store.includes("api('/store/products')"));
  assert.ok(store.includes("'/store/' + role + '/orders'"));
  assert.ok(store.includes('idempotencyKey'));
  assert.ok(wallet.includes("api('/client/wallet'"));
  assert.ok(wallet.includes("'/client/wallet/topup'"));
  assert.ok(wallet.includes('topupRequests'));
  assert.ok(wallet.includes('transactions'));
  assert.ok(subscriptions.includes("'/client/commerce/catalog'"));
  assert.ok(subscriptions.includes("'/client/commerce/subscriptions/purchase'"));
  assert.ok(subscriptions.includes("'/client/commerce/subscriptions/'"));
});

test('native store ads use one server-clock schedule shared by clients and technicians across app restarts', () => {
  const store = fs.readFileSync(path.join(root, 'src/screens/shared/StoreScreen.js'), 'utf8');
  assert.ok(store.includes("api('/store/advertisement/current?audience=' + encodeURIComponent(role))"));
  assert.ok(store.includes('result.nextChangeAt'));
  assert.ok(store.includes('result.serverTime'));
  assert.ok(!store.includes('storeAdRotationMemory'));
  assert.ok(!store.includes('setInterval'));
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const tech = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.ok(client.includes('<StoreAdBanner role="client" session={session} visible={clientTab !== \'store\'}'));
  assert.ok(tech.includes('<StoreAdBanner role="fanni" session={session} visible={tab !== \'store\'}'));
  assert.ok(client.includes("onOpenStore={() => setClientTab('store')}"));
  assert.ok(tech.includes("onOpenStore={() => setTechData(v => ({ ...v, tab: 'store' }))}"));
});

test('technician dashboard includes browser home, store, support, filters, pagination and full wallet tabs', () => {
  const tech = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  const wallet = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianWalletScreen.js'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'src/screens/shared/StoreScreen.js'), 'utf8');
  assert.ok(tech.includes("key: 'home'"));
  assert.ok(tech.includes("key: 'store'"));
  assert.ok(tech.includes("key: 'support'"));
  assert.ok(tech.includes('filteredAvailableOrders'));
  assert.ok(tech.includes('technicianServiceFilter'));
  assert.ok(tech.includes('loadMoreAvailable'));
  assert.ok(tech.includes('<StoreScreen role="fanni"'));
  assert.ok(tech.includes('<TechnicianWalletScreen'));
  assert.ok(wallet.includes("api('/fanni/wallet/history'"));
  assert.ok(wallet.includes("id: 'requests'"));
  assert.ok(wallet.includes("id: 'transactions'"));
  assert.ok(store.includes("'/store/' + role + '/orders'"));
});


test('technician home shows browser-equivalent approval guidance and blocks offers and wallet top-ups until approved', () => {
  const tech = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  const wallet = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianWalletScreen.js'), 'utf8');
  assert.ok(tech.includes("const isApproved = String(user.status || '').trim() === 'معتمد'"));
  assert.ok(tech.includes('if (!isApproved) return <Button title="تقديم العروض بعد اعتماد الحساب"'));
  assert.ok(tech.includes('إرسال العروض وشحن المحفظة متاحان بعد اعتماد الإدارة'));
  assert.ok(wallet.includes("disabled={submitting || String(user?.status || '').trim() !== 'معتمد'}"));
});

test('embedded client account keeps the site name and removes only the account heading', () => {
  const account = fs.readFileSync(path.join(root, 'src/screens/account/AccountScreens.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  assert.ok(!account.includes('>حسابي</Text>'), 'account heading must be removed from source');
  assert.ok(account.includes('<View style={styles.dataCard}>'));
  assert.ok(client.includes('مرحباً {session.user?.name||\'بك\'}'));
  assert.ok(client.includes('عميل'), 'client role label should use the approved generic wording');
  assert.ok(!client.includes('عميل صُنّاع'), 'legacy client role label should not remain');
  assert.ok(client.includes('<PublicContentBanner />'), 'client account should keep the shared public content banner');
});

test('native client dashboard displays public maintenance notices, announcements and FAQs without the redundant site name', () => {
  const banner = fs.readFileSync(path.join(root, 'src/screens/shared/PublicContentBanner.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  assert.ok(client.includes('<PublicContentBanner />'), 'public content banner remains available on client tabs');
  assert.ok(!banner.includes('content.siteName'), 'redundant small site name must not render in the banner');
  assert.ok(banner.includes('const hasVisibleContent = content.maintenance || content.announcement.trim() || content.faqs.length'), 'banner visibility should depend only on actual public content');
  assert.ok(banner.includes("api('/content')"));
  assert.ok(banner.includes('maintenanceMessage'));
  assert.ok(banner.includes('announcement'));
  assert.ok(banner.includes('faqs'));
});


test('client wallet top-ups keep an idempotency key across retries and refresh the wallet balance', () => {
  const wallet = fs.readFileSync(path.join(root, 'src/screens/client/ClientWalletScreen.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  assert.ok(wallet.includes('const requestId = idempotencyKey || requestKey()'));
  assert.ok(wallet.includes('idempotencyKey: requestId'));
  assert.ok(wallet.includes("api('/client/wallet/topup'"));
  assert.ok(client.includes("api('/client/wallet'"));
});

test('technician wallet top-ups follow browser approval, amount and phone validation', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const wallet = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianWalletScreen.js'), 'utf8');
  assert.ok(screens.includes("technicianStatus !== 'معتمد'"));
  assert.ok(screens.includes('amount > 10000'));
  assert.ok(screens.includes('/^01[0125][0-9]{8}$/'));
  assert.ok(screens.includes('referenceCode: reference'));
  assert.ok(wallet.includes("disabled={submitting || String(user?.status || '').trim() !== 'معتمد'}"));
});

test('native API preserves structured store purchase errors and resolves media URLs through central configuration', () => {
  const api = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');
  assert.ok(api.includes('error.canUseCashOnDelivery = data?.canUseCashOnDelivery === true'));
  assert.ok(api.includes('export async function getMediaUrl'), 'getMediaUrl should be exported');
  assert.ok(api.includes('export { api }'));
  assert.ok(api.includes('config.mediaBaseUrl'));
});

test('central API config validates HTTPS URLs and preserves a last-known-good configuration', () => {
  const source = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');
  assert.match(source, /CONFIG_CACHE_KEY/);
  assert.match(source, /isValidConfig/);
  assert.match(source, /last-known-good|last known good/i);
  assert.match(source, /value\.apiProtocol !== 'https'/);
  assert.match(source, /configVersion/);
});

test('app config does not embed a backend URL in Expo metadata', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(config.expo.extra.apiUrl, undefined);
  assert.equal(config.expo.android.minSdkVersion, 23);
});

test('APK workflow builds only the requested Modern ARM64 artifact and runs regression tests first', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');
  assert.equal((workflow.match(/logo\.thumbnail\(\(860, 860\)/g) || []).length, 1);
  assert.ok(workflow.includes('run: npm test'));
  assert.ok(workflow.includes('build-modern:'));
  assert.ok(workflow.includes('reactNativeArchitectures=arm64-v8a'));
  assert.ok(workflow.includes('path: hamzawy-sat-modern.apk'));
  assert.ok(!workflow.includes('build-lite:'));
  assert.ok(!workflow.includes('armeabi-v7a'));
});


test('native client and technician dashboards use fixed bottom navigation without upper tabs', () => {
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const tech = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  for (const source of [client, tech]) {
    assert.doesNotMatch(source, /tabRowPremium/);
    assert.doesNotMatch(source, /floatingControls/);
    assert.match(source, /label:'الرئيسية'/);
    assert.match(source, /label:'المتجر'/);
  }
  assert.match(client, /label:'الطلبات'/);
  assert.match(tech, /label:'الطلبات'/);
});

test('technician registration requires both private identity card uploads and sends backend file IDs', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/services/api.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(screens.includes("import * as ImagePicker from 'expo-image-picker'")); 
  assert.ok(screens.includes("import * as ImageManipulator from 'expo-image-manipulator'"));
  assert.ok(screens.includes("import { api, uploadRegistrationIdentity } from '../services/api'"));
  assert.ok(screens.includes('uploadRegistrationIdentity(side, uploadUri, uploadMime)'));
  assert.ok(screens.includes('identityCardFrontFileId: identityCardUploads.front.fileId'));
  assert.ok(screens.includes('identityCardBackFileId: identityCardUploads.back.fileId'));
  assert.ok(screens.includes('identityCardUploads.front.uploading') && screens.includes('identityCardUploads.back.uploading'));
  assert.ok(screens.indexOf('صورة بطاقة الرقم القومي *') < screens.indexOf('ميثاق صُنّاع – التعامل المهني مع العملاء'), 'ID card upload section must appear before the terms');
  assert.ok(screens.indexOf('ميثاق صُنّاع – التعامل المهني مع العملاء') < screens.indexOf('<TouchableOpacity disabled={!guidelinesReachedEnd}'), 'agreement checkbox must remain after the terms');
  assert.ok(api.includes('FileSystem.uploadAsync'));
  assert.ok(api.includes("'/fanni/registration-media?side='"));
  assert.equal(pkg.dependencies['expo-image-picker'], '~15.0.7');
  assert.equal(pkg.dependencies['expo-image-manipulator'], '~12.0.5');
});


test('client and technician always start on their home tab after login and session restore', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const state = fs.readFileSync(path.join(root, 'src/hooks/useAppState.js'), 'utf8');
  assert.match(state, /const \[techData, setTechData\] = useState\([^;]*tab: 'home'/);
  assert.ok(screens.includes("if (saved.role === 'client') setClientTab('home')"));
  assert.ok(screens.includes("if (saved.role === 'fanni') setTechData(current => ({ ...current, tab: 'home' }))"));
  assert.ok(screens.includes("if (role === 'client') setClientTab('home')"));
  assert.ok(screens.includes("if (role === 'fanni') setTechData(current => ({ ...current, tab: 'home' }))"));
  assert.ok(screens.includes("setTechData({ profile: null, orders: [], offers: [], wallet: [], loading: false, error: '', tab: 'home' });"));
  assert.ok(!screens.includes("if (role === 'fanni') setTechData(current => ({ ...current, tab: 'offers' }))"));
});

test('client and technician dashboards use the reference home layout without upper tabs', () => {
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const technician = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  for (const source of [client, technician]) {
    assert.doesNotMatch(source, /tabRowPremium/);
    assert.doesNotMatch(source, /floatingControls/);
    assert.match(source, /حمزاوي سات/);
    assert.match(source, /الإحصائيات/);
    assert.match(source, /إجراءات سريعة/);
    assert.match(source, /paddingBottom:\s*132/);
  }
  assert.match(client, /ادعُ صديقك واربح 50 جنيه/);
  assert.match(technician, /ادعُ صديقك واربح 150 جنيه/);
});

test('native customer and technician stores use managed category artwork with product-image fallback', () => {
  const store = fs.readFileSync(path.join(root, 'src/screens/shared/StoreScreen.js'), 'utf8');
  assert.ok(store.includes('const [categories, setCategories] = useState([])'));
  assert.ok(store.includes('setCategories(Array.isArray(catalog.categories) ? catalog.categories : [])'));
  assert.ok(store.includes('const groupedProducts = useMemo(() => {'));
  assert.ok(store.includes("String(item?.category || 'عام').trim() || 'عام'"));
  assert.ok(store.includes("const [selectedCategory, setSelectedCategory] = useState('')"));
  assert.ok(store.includes('const selectedGroup = groupedProducts.find(group => group.category === selectedCategory)'));
  assert.ok(store.includes('groupedProducts.map(group => {'));
  assert.ok(store.includes('const categoryInfo = (Array.isArray(categories) ? categories : []).find(entry => String(entry?.name || \'\') === category)'));
  assert.ok(store.includes('imageUrl: String(categoryInfo?.imageUrl || fallbackProduct?.imageUrl || \'\').trim()'));
  assert.ok(store.includes('<StoreImage value={group.imageUrl || coverProduct?.imageUrl}'));
  assert.ok(store.includes('onPress={() => setSelectedCategory(group.category)}'));
  assert.ok(store.includes('const displayedProducts = normalizedQuery ? searchMatches : (selectedGroup?.items || null)'));
  assert.ok(store.includes('displayedProducts.map(({ item, index }) => ('));
  assert.ok(store.includes("onPress={() => setSelectedCategory('')}"));
});

test('push notification taps route technician and client wallet events to the wallet screen, including cold starts', () => {
  const hook = fs.readFileSync(path.join(root, 'src/hooks/usePushNotifications.js'), 'utf8');
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  assert.match(hook, /addNotificationResponseReceivedListener/);
  assert.match(hook, /getLastNotificationResponseAsync/);
  assert.match(hook, /if \(!session\) return;/);
  assert.match(hook, /clearLastNotificationResponseAsync/);
  assert.match(screens, /fanni_wallet_credit/);
  assert.match(screens, /wallet_credit/);
  assert.match(screens, /fanni_wallet_settlement/);
  assert.match(screens, /setTechData\(current => \(\{ \.\.\.current, tab: 'wallet' \}\)\)/);
  assert.match(screens, /type\.startsWith\('client_wallet_'\)/);
  assert.match(screens, /setClientTab\('wallet'\)/);
  assert.match(screens, /async function markNotificationRead\(item\)/);
  assert.match(screens, /setNotificationsOpen\(false\)/);
  assert.match(screens, /setTechData\(current => \(\{ \.\.\.current, tab: 'wallet' \}\)\)/);
});


test('technician can pause new opportunities without affecting current orders or notifications', () => {
  const screen = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  const backendContract = screen.includes("api('/fanni/availability'") &&
    screen.includes("acceptingOrders: nextValue");
  assert.ok(backendContract, 'technician app must persist availability through the backend');
  assert.ok(screen.includes('استقبال الطلبات الجديدة متوقف'), 'paused available-orders tab must explain why no opportunities appear');
  assert.ok(screen.includes('رسائل العملاء ما زالت تعمل بشكل طبيعي'), 'paused state must reassure that current customer messages continue');
  assert.ok(screen.includes("acceptingOrders: result.acceptingOrders !== false"), 'server-confirmed availability must update the technician profile');
  assert.ok(app.includes('Notifications.setNotificationHandler('), 'native notification delivery must remain enabled');
  assert.ok(app.includes('Notifications.addNotificationResponseReceivedListener'), 'notification tap handling must remain enabled');
});


test('client and technician referral cards load server-issued invite links and render QR codes', () => {
  const card = fs.readFileSync(path.join(root, 'src/screens/shared/ReferralCard.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const technician = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.match(card, /\/referrals\/me\//);
  assert.match(card, /react-native-qrcode-svg/);
  assert.match(card, /QRCode value=\{data\.url\}/);
  assert.match(card, /Clipboard\.setStringAsync/);
  assert.match(card, /Share\.share/);
  assert.match(card, /🎉 حمّل تطبيق حمزاوي سات واطلب الخدمة اللي محتاجها، واكسب 50 جنيه هدية بعد إكمال أول طلب ليك! 💰 سجّل دلوقتي واستمتع بخدمات حمزاوي سات\./);
  assert.match(card, /💰 انضم لفريق فنيين حمزاوي سات واكسب 150 جنيه مكافأة بعد إكمال أول 3 طلبات ليك! 🎉 سجّل دلوقتي وابدأ شغلك معانا\./);
  assert.match(card, /invitationMessage \+ '\\n' \+ data\.url/);
  assert.match(card, /عن كل فني جديد يسجل من رابط دعوتك ويكمل 3 طلبات، تحصل أنت وهو على 150 جنيهًا مكافأة/);
  assert.match(card, /كل فني جديد يسجل من رابطك ويكمل 3 طلبات يمنحك ويمنحه 150 جنيهًا مكافأة/);
  assert.match(client, /ادعُ صديقك واربح 50 جنيه/);
  assert.match(technician, /ادعُ صديقك واربح 150 جنيه/);
  assert.match(card, /data\?\.referrals\) && data\.referrals\.length/);
  assert.match(card, /data\?\.enabled !== false/);
  assert.match(client, /<ReferralCard session=\{session\} kind="client"/);
  assert.match(technician, /<ReferralCard session=\{session\} kind="fanni"/);
  assert.equal(packageJson.dependencies['react-native-qrcode-svg'], '^6.3.15');
});

test('mobile registration forwards referral codes and existing wallet screens label referral rewards', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const clientWallet = fs.readFileSync(path.join(root, 'src/screens/client/ClientWalletScreen.js'), 'utf8');
  const technicianWallet = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianWalletScreen.js'), 'utf8');
  assert.match(screens, /referralCode: String\(form\.referralCode \|\| ''\)\.trim\(\)/);
  assert.match(clientWallet, /referral_reward: 'مكافأة دعوة'/);
  assert.match(technicianWallet, /referral_reward: 'مكافأة دعوة'/);
  assert.match(clientWallet, /item\.referralNumber/);
  assert.match(technicianWallet, /item\.referralNumber/);
});



test('native store search normalizes Arabic spelling and tolerates common typos', () => {
  const {
    normalizeArabicStoreSearch,
    matchesArabicStoreProductSearch
  } = require('../src/utils/store-search');
  assert.equal(normalizeArabicStoreSearch('إشــتراك مُميّز'), 'اشتراك مميز');
  assert.equal(normalizeArabicStoreSearch('أجهزة آيفون ١٢'), 'اجهزه ايفون 12');
  const product = {
    name: 'اشتراك مميز',
    category: 'الباقات',
    description: 'تجديد اشتراك القنوات',
    details: 'رسيفر HD'
  };
  assert.equal(matchesArabicStoreProductSearch(product, 'اشترك مميز'), true);
  assert.equal(matchesArabicStoreProductSearch(product, 'تجديد قنوات'), true);
  assert.equal(matchesArabicStoreProductSearch(product, 'رسيفر'), true);
  assert.equal(matchesArabicStoreProductSearch(product, 'منتج غير موجود'), false);
});

test('native client and technician store use the authenticated bulk-order flow safely', () => {
  const store = fs.readFileSync(path.join(root, 'src/screens/shared/StoreScreen.js'), 'utf8');
  assert.ok(store.includes("'/store/' + role + '/orders/bulk'"));
  assert.ok(store.includes('expectedPrice: Number(item.price || 0)'));
  assert.ok(store.includes('idempotencyKey: key'));
  assert.ok(store.includes('error?.priceChanged'));
  assert.ok(store.includes('error?.canUseCashOnDelivery === true'));
  assert.ok(store.includes("item.type === 'subscription'"));
  assert.ok(store.includes("api('/store/' + role + '/orders'"));
  assert.ok(store.includes('ابحث عن منتج أو قسم أو وصف'));
  assert.ok(store.includes('تأكيد الطلب المجمع'));
});


test('native store cart persists per signed-in role and account across screen changes', () => {
  const store = fs.readFileSync(path.join(root, 'src/screens/shared/StoreScreen.js'), 'utf8');
  assert.ok(store.includes("import * as SecureStore from 'expo-secure-store'"));
  assert.ok(store.includes('sonaa.store.cart.v1:'));
  assert.ok(store.includes('SecureStore.getItemAsync(cartStorageKey)'));
  assert.ok(store.includes('SecureStore.setItemAsync(cartStorageKey, JSON.stringify(cart))'));
  assert.ok(store.includes('cartLoadedFor !== cartStorageKey'));
});


test('client and technician notification taps use real dashboard tab keys', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  assert.ok(screens.includes("setTechData(current => ({ ...current, tab: 'currentJobs' }))"), 'technician order notifications must open the current jobs tab');
  assert.ok(screens.includes("setClientTab('current')"), 'client order notifications must open the current orders tab');
  assert.ok(!screens.includes("tab: 'myOrders'"), 'myOrders is a browser tab name, not a native technician tab');
  assert.ok(!screens.includes("setClientTab('orders')"), 'orders is a browser tab name, not a native client tab');
});


test('technician wallet top-ups preserve an idempotency key across retries and clear it only after success', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const start = screens.indexOf('async function submitTopup()');
  const end = screens.indexOf('\n  async function loadSupportCases()', start);
  assert.ok(start >= 0 && end > start, 'technician top-up handler should exist');
  const handler = screens.slice(start, end);
  assert.ok(handler.includes('sonaa.fanni.topup.pending.v1.'), 'pending key should be scoped to the technician account');
  assert.ok(handler.includes('pending?.fingerprint === fingerprint'), 'same request should reuse its pending key');
  assert.ok(handler.includes('idempotencyKey, note:'), 'the idempotency key should be sent to the backend');
  assert.ok(handler.includes('SecureStore.deleteItemAsync(pendingKeyStorage)'), 'pending key should be cleared after confirmed success');
});


test('forced password changes from client and technician login are enforced until completion', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const auth = fs.readFileSync(path.join(root, 'src/screens/auth/AuthScreens.js'), 'utf8');
  assert.ok(screens.includes('const mustChangePassword = result.mustChangePassword === true'));
  assert.ok(screens.includes("setScreen(mustChangePassword ? 'changePassword'"));
  assert.ok(screens.includes('mustChangePassword: saved.mustChangePassword === true'));
  assert.ok(screens.includes("if (passwordChangeRequired) return true"));
  assert.ok(screens.includes('setPasswordChangeRequired(false)'));
  assert.ok(auth.includes('required = false'));
  assert.ok(auth.includes('{!required ? <Button title="‹ رجوع إلى حسابي"'));
  assert.ok(auth.includes('{!required ? <Field label="كلمة المرور الحالية"'), 'forced password change must hide the current password field');
  assert.ok(screens.includes('(!passwordChangeRequired && !currentPassword)'), 'current password is required only for voluntary changes');
  assert.ok(screens.includes('...(passwordChangeRequired ? {} : { currentPassword })'), 'forced password change must omit currentPassword from the API request');
});


test('saved client and technician passwords are silently prefilled when opening login', () => {
  const start = app.indexOf('const goLogin = async mode =>');
  const end = app.indexOf('const toggleArray =', start);
  assert.ok(start >= 0 && end > start, 'login navigation handler should exist');
  const handler = app.slice(start, end);
  assert.ok(handler.includes('SecureStore.getItemAsync(`sonaa.auth.password.v1.${mode}.'));
  assert.ok(handler.includes('if (savedPassword) setPassword(savedPassword)'));
  assert.ok(!handler.includes('Alert.alert'));
  assert.ok(!handler.includes('تسجيل دخول أسرع'));
  assert.ok(!handler.includes('هكتبها بنفسي'));
});

test('password changes ask whether to update the securely stored password for both account roles', () => {
  assert.ok(app.includes('function promptSavedPasswordUpdate(role, phone, newPassword, successMessage)'));
  assert.ok(app.includes("text: 'نعم، حدّثها'"));
  assert.ok(app.includes('SecureStore.setItemAsync(savedPasswordKey, newPassword)'));
  assert.ok(app.includes('SecureStore.deleteItemAsync(savedPasswordKey)'));
  const changeStart = app.indexOf('async function changeAccountPassword()');
  const changeEnd = app.indexOf('async function startPasswordRecovery()', changeStart);
  const changeHandler = app.slice(changeStart, changeEnd);
  assert.ok(changeHandler.includes('promptSavedPasswordUpdate(role, session.user?.phone, newPassword'));
  assert.ok(!changeHandler.includes('deleteItemAsync(`sonaa.auth.password.v1.'));
});

test('password recovery also offers to update the saved password without retaining stale credentials', () => {
  const start = app.indexOf('async function resetRecoveredPassword()');
  const end = app.indexOf('\n  useEffect(() => {\n    if (screen !== \'passwordRecovery\'', start);
  assert.ok(start >= 0 && end > start, 'password recovery handler should exist');
  const handler = app.slice(start, end);
  assert.ok(handler.includes('promptSavedPasswordUpdate(recoveryForm.role, recoveryForm.phone, recoveryForm.newPassword'));
});


test('public banner omits the redundant site name and referral promos pulse on both dashboards', () => {
  const banner = fs.readFileSync(path.join(root, 'src/screens/shared/PublicContentBanner.js'), 'utf8');
  const referral = fs.readFileSync(path.join(root, 'src/screens/shared/ReferralCard.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const technician = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.doesNotMatch(banner, /siteName|حمزاوي سات/);
  assert.match(referral, /Animated\.loop\(Animated\.sequence/);
  assert.match(referral, /toValue: 1\.035/);
  assert.match(client, /<ReferralPromo onPress=/);
  assert.match(technician, /<ReferralPromo onPress=/);
});


test('area and technician search tolerate spelling mistakes and rank the closest Arabic matches first', () => {
  const helpers = fs.readFileSync(path.join(root, 'src/utils/area-helpers.js'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'src/components/AreaPicker.js'), 'utf8');
  const technician = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.match(helpers, /areaSearchEditDistance/);
  assert.match(helpers, /areaMatchScore/);
  assert.match(helpers, /\.sort\(\(a, b\) => a\.score - b\.score/);
  assert.match(picker, /filterAreaOptions\(options, query\)/);
  assert.match(technician, /matchesAreaSearch\(haystack, technicianSearch\)/);
});

test('client and technician quick actions place technical support last', () => {
  const client = fs.readFileSync(path.join(root, 'src/screens/client/ClientDashboard.js'), 'utf8');
  const technician = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  for (const dashboard of [client, technician]) {
    const start = dashboard.indexOf("label:'سجل");
    const support = dashboard.indexOf("label:'طلب دعم فني'");
    const end = dashboard.indexOf("].map((item,index)=><TouchableOpacity", support);
    assert.ok(start !== -1 && support > start, 'support shortcut should follow the other quick actions');
    assert.ok(end !== -1, 'quick actions should keep their existing rendering');
    assert.ok(dashboard.slice(start, support).includes("label:'الإعدادات'"), 'settings should precede support');
  }
});


test('client and technician header initial uses a light star mark instead of a navy circle', () => {
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src/theme/styles.js'), 'utf8');
  assert.match(app, /brandHeaderAvatarStar/);
  assert.match(app, /✦/);
  const avatarStyle = styles.match(/brandHeaderAvatar: \{([^}]+)\}/);
  assert.ok(avatarStyle, 'header initial wrapper style should exist');
  assert.doesNotMatch(avatarStyle[1], /borderRadius|backgroundColor|borderWidth/);
  assert.match(styles, /brandHeaderAvatarStar: \{[^}]*#8195E5/s);
  assert.match(styles, /brandHeaderAvatarText: \{[^}]*fontStyle: 'italic'/s);
});


test('OTA updates are checked periodically while the app stays in the foreground', () => {
  const appEntry = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.match(appEntry, /setInterval\(\(\) => \{/);
  assert.match(appEntry, /appState\.current === 'active' && !updateDownloaded\.current/);
  assert.match(appEntry, /\}, 60 \* 1000\)/);
  assert.match(appEntry, /clearInterval\(updateCheckInterval\)/);
  assert.match(appEntry, /currentScreen !== 'home'/);
});
