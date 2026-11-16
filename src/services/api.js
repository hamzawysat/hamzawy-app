import * as SecureStore from 'expo-secure-store';

const SERVER_CONFIG_URL = 'https://hamzawysat.github.io/hamzawy-download/server-config.json';
const CONFIG_CACHE_KEY = 'hamzawy.server-config.v1';
const CONFIG_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CONFIG_TIMEOUT_MS = 8000;
// Preserve a last-known-good cached configuration while GitHub Pages is unavailable.

let activeConfig = null;
let lastConfigRefreshAt = 0;
let configLoadPromise = null;

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch (_) {
    return null;
  }
}

function isValidConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.schemaVersion !== 1 || !Number.isInteger(value.configVersion) || value.configVersion < 1) return false;
  const apiBaseUrl = normalizeBaseUrl(value.apiBaseUrl);
  if (!apiBaseUrl || !apiBaseUrl.endsWith('/api')) return false;
  const mediaBaseUrl = value.mediaBaseUrl === '' || value.mediaBaseUrl == null
    ? ''
    : normalizeBaseUrl(value.mediaBaseUrl);
  if (value.mediaBaseUrl && !mediaBaseUrl) return false;
  return { schemaVersion: 1, configVersion: value.configVersion, apiBaseUrl, mediaBaseUrl };
}

async function readCachedConfig() {
  try {
    const raw = await SecureStore.getItemAsync(CONFIG_CACHE_KEY);
    if (!raw) return null;
    return isValidConfig(JSON.parse(raw)) || null;
  } catch (_) {
    return null;
  }
}

async function fetchRemoteConfig() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(SERVER_CONFIG_URL, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('تعذر تحميل إعدادات الخادم.');
    const raw = await response.json();
    const config = isValidConfig(raw);
    if (!config) throw new Error('ملف إعدادات الخادم غير صالح أو غير متوافق.');
    try { await SecureStore.setItemAsync(CONFIG_CACHE_KEY, JSON.stringify(config)); } catch (_) {}
    return config;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadConfig() {
  try {
    const remote = await fetchRemoteConfig();
    activeConfig = remote;
    lastConfigRefreshAt = Date.now();
    return remote;
  } catch (remoteError) {
    const cached = activeConfig || await readCachedConfig();
    if (cached) {
      activeConfig = cached;
      return cached;
    }
    throw new Error(remoteError?.message || 'تعذر تحديد عنوان الخادم. تحقق من الاتصال وحاول مرة أخرى.');
  }
}

export async function getServerConfig(forceRefresh = false) {
  if (!forceRefresh && activeConfig && Date.now() - lastConfigRefreshAt < CONFIG_REFRESH_INTERVAL_MS) {
    return activeConfig;
  }
  if (!configLoadPromise) {
    configLoadPromise = loadConfig().finally(() => { configLoadPromise = null; });
  }
  return configLoadPromise;
}

export async function getApiUrl(path = '') {
  const config = await getServerConfig();
  const suffix = String(path || '');
  return config.apiBaseUrl + (suffix.startsWith('/') ? suffix : '/' + suffix);
}

export async function getMediaUrl(path = '') {
  const config = await getServerConfig();
  const base = config.mediaBaseUrl || config.apiBaseUrl + '/media';
  const suffix = String(path || '');
  return base + (suffix.startsWith('/') ? suffix : '/' + suffix);
}

async function api(path, options = {}) {
  const { token, body, headers, signal: externalSignal, timeoutMs = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  let response;
  try {
    const url = await getApiUrl(path);
    response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (timedOut) throw new Error('الخادم لم يستجب خلال 30 ثانية. تحقق من الاتصال ثم حاول مرة أخرى.');
    if (error?.name === 'AbortError') throw new Error('تم إلغاء الطلب قبل اكتماله.');
    if (error?.message?.includes('إعدادات الخادم')) throw error;
    throw new Error('تعذر الاتصال بالإنترنت أو بالخادم. تأكد من الاتصال ثم أعد المحاولة.');
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', abortFromCaller);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `خطأ من الخادم (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export { api };
