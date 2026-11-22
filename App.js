import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, View, Text, Image } from 'react-native';
import * as Updates from 'expo-updates';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AppScreens from './src/screens/AppScreens';
import StartupErrorBoundary from './src/components/StartupErrorBoundary';
import { styles } from './src/theme/styles';
import { splashStyles } from './src/theme/splashStyles';

function AppContent() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [headerInitial, setHeaderInitial] = useState('');
  const handleScreenChange = useCallback((screen, initial) => {
    setCurrentScreen(screen);
    if (initial !== undefined) setHeaderInitial(initial);
  }, []);
  const [authRestoring, setAuthRestoring] = useState(true);
  const [splashMinimumElapsed, setSplashMinimumElapsed] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const updateInProgress = useRef(false);
  const updateDownloaded = useRef(false);
  const applyingUpdate = useRef(false);
  const appState = useRef(AppState.currentState);
  const spin = useRef(new Animated.Value(0)).current;
  const showSplash = authRestoring || !splashMinimumElapsed;
  const showBrandHeader = !['home', 'login'].includes(currentScreen);

  const applyDownloadedUpdate = useCallback(async () => {
    if (!updateDownloaded.current || applyingUpdate.current || authRestoring || currentScreen !== 'home' || appState.current !== 'active') return;
    applyingUpdate.current = true;
    try {
      await Updates.reloadAsync();
    } catch (error) {
      applyingUpdate.current = false;
      console.warn('تعذر تطبيق تحديث التطبيق:', error?.message || error);
    }
  }, [authRestoring, currentScreen]);

  const checkAndDownloadUpdate = useCallback(async () => {
    if (!Updates.isEnabled || updateInProgress.current || updateDownloaded.current) return;
    updateInProgress.current = true;
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) return;
      setUpdateStatus('جاري تحديث التطبيق...');
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        updateDownloaded.current = true;
        setUpdateStatus('');
        await applyDownloadedUpdate();
      } else {
        setUpdateStatus('');
      }
    } catch (error) {
      setUpdateStatus('');
      console.warn('تعذر فحص أو تنزيل تحديث التطبيق:', error?.message || error);
    } finally {
      updateInProgress.current = false;
    }
  }, [applyDownloadedUpdate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appState.current;
      appState.current = nextState;
      if (nextState === 'active' && previousState !== 'active') {
        if (updateDownloaded.current) void applyDownloadedUpdate();
        else void checkAndDownloadUpdate();
      }
    });
    void checkAndDownloadUpdate();
    return () => subscription.remove();
  }, [applyDownloadedUpdate, checkAndDownloadUpdate]);

  useEffect(() => {
    void applyDownloadedUpdate();
  }, [applyDownloadedUpdate]);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(spin, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(spin, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation.start();
    const timer = setTimeout(() => setSplashMinimumElapsed(true), 2200);
    return () => { animation.stop(); clearTimeout(timer); };
  }, [spin]);

  const logoRotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '18deg'] });
  return <View style={styles.appRoot}>
    {showBrandHeader ? <SafeAreaView style={styles.brandHeaderSafe}>
      <View style={styles.brandHeader}>
        {headerInitial ? <View style={styles.brandHeaderAvatar}><Text style={styles.brandHeaderAvatarStar}>✦</Text><Text style={styles.brandHeaderAvatarText}>{headerInitial}</Text></View> : null}
        <Image source={require("./assets/LOGO_UPLOAD_HERE/logo.png")} style={styles.brandHeaderLogo} resizeMode="contain" />
        <Text style={styles.brandHeaderTitle}>حمزاوي سات</Text>
      </View>
    </SafeAreaView> : null}
    <View style={styles.appScreenArea}><AppScreens onScreenChange={handleScreenChange} onAuthRestoringChange={setAuthRestoring} /></View>
    {showSplash ? <View style={splashStyles.overlay}>
      <View style={splashStyles.logoFrame}>
        <Animated.Image source={require("./assets/LOGO_UPLOAD_HERE/logo.png")} style={[splashStyles.logo, { transform: [{ rotate: logoRotation }] }]} resizeMode="contain" />
      </View>
      <Text style={splashStyles.title}>حمزاوي سات</Text>
      <Text style={splashStyles.caption}>{updateStatus || 'الدش • كاميرات المراقبة • الشاشات'}</Text>
      <View style={splashStyles.loadingTrack}><View style={splashStyles.loadingFill} /></View>
    </View> : null}
    {updateStatus && !showSplash ? <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 22, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#102A9B', elevation: 8 }}>
      <Text style={{ color: '#FFFFFF', textAlign: 'center', fontSize: 13, fontWeight: '900' }}>{updateStatus}</Text>
    </View> : null}
  </View>;
}
export default function App() {
  return <SafeAreaProvider><StartupErrorBoundary><AppContent /></StartupErrorBoundary></SafeAreaProvider>;
}
