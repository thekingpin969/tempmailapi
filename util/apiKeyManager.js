import fs from 'fs';
import path from 'path';

const KEYS_FILE = path.join(process.cwd(), 'util', 'api-keys.json');

const DEFAULTS = {
  monthlyCredits: 1000,
  maxConcurrent: 5,
  creditCost: 10,
  defaultProvider: 'scraperapi',
  defaultResetDay: 1
};

function getCurrentDate() {
  const now = new Date();
  return {
    full: `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`,
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

function parseDate(dateStr) {
  const [day, month, year] = dateStr.split('-').map(Number);
  return { day, month, year };
}

function isAfterOrEqual(dateA, dateB) {
  const a = typeof dateA === 'string' ? parseDate(dateA) : dateA;
  const b = typeof dateB === 'string' ? parseDate(dateB) : dateB;
  
  if (a.year !== b.year) return a.year > b.year;
  if (a.month !== b.month) return a.month > b.month;
  return a.day >= b.day;
}

function getNextResetDate(currentDate, resetDay) {
  let { day, month, year } = currentDate;
  
  if (day < resetDay) {
    return { day: resetDay, month, year };
  }
  
  let nextMonth = month + 1;
  let nextYear = year;
  
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }
  
  const daysInMonth = new Date(nextYear, nextMonth, 0).getDate();
  const validResetDay = Math.min(resetDay, daysInMonth);
  
  return { day: validResetDay, month: nextMonth, year: nextYear };
}

function formatDate(dateObj) {
  return `${String(dateObj.day).padStart(2, '0')}-${String(dateObj.month).padStart(2, '0')}-${dateObj.year}`;
}

function loadKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = fs.readFileSync(KEYS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading keys:', error.message);
  }
  return { keys: {} };
}

function saveKeys(data) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving keys:', error.message);
    throw error;
  }
}

function resetIfNeeded(keyData) {
  const currentDate = getCurrentDate();
  const resetDay = keyData.resetDay || DEFAULTS.defaultResetDay;
  
  if (!keyData.nextResetDate) {
    const nextReset = getNextResetDate(currentDate, resetDay);
    keyData.nextResetDate = formatDate(nextReset);
    keyData.resetDay = resetDay;
    keyData.creditsUsed = 0;
    return keyData;
  }
  
  const { day: currDay, month: currMonth, year: currYear } = currentDate;
  const shouldReset = isAfterOrEqual(currentDate, keyData.nextResetDate);
  
  if (shouldReset) {
    keyData.creditsUsed = 0;
    keyData.lastResetDate = keyData.nextResetDate;
    
    const nextReset = getNextResetDate(currentDate, resetDay);
    keyData.nextResetDate = formatDate(nextReset);
  }
  
  return keyData;
}

function isKeyValid(keyData) {
  keyData = resetIfNeeded(keyData);
  return (
    keyData.creditsUsed + DEFAULTS.creditCost <= keyData.monthlyCredits &&
    keyData.concurrentRequests < keyData.maxConcurrent
  );
}

function selectKey(data) {
  const validKeys = Object.entries(data.keys)
    .filter(([, keyData]) => isKeyValid(keyData))
    .map(([key, keyData]) => ({ key, ...keyData }));

  if (validKeys.length === 0) {
    return null;
  }

  validKeys.sort((a, b) => a.concurrentRequests - b.concurrentRequests);
  return validKeys[0].key;
}

export function getKey() {
  const data = loadKeys();
  const selectedKey = selectKey(data);
  
  if (!selectedKey) {
    throw new Error('No available API keys. All keys exhausted or at concurrent limit.');
  }

  data.keys[selectedKey].concurrentRequests += 1;
  saveKeys(data);

  return selectedKey;
}

export function releaseKey(apiKey) {
  const data = loadKeys();
  if (data.keys[apiKey]) {
    data.keys[apiKey].concurrentRequests = Math.max(
      0,
      data.keys[apiKey].concurrentRequests - 1
    );
    saveKeys(data);
  }
}

export function useCredits(apiKey, amount = DEFAULTS.creditCost) {
  const data = loadKeys();
  if (data.keys[apiKey]) {
    data.keys[apiKey].creditsUsed += amount;
    saveKeys(data);
  }
}

export function addKey(apiKey, metadata = {}) {
  const data = loadKeys();
  const currentDate = getCurrentDate();

  if (data.keys[apiKey]) {
    return { success: false, error: 'Key already exists', key: apiKey };
  }

  const resetDay = metadata.resetDay ? parseInt(metadata.resetDay, 10) : DEFAULTS.defaultResetDay;
  
  if (metadata.resetDay && (resetDay < 1 || resetDay > 31)) {
    return { success: false, error: 'resetDay must be between 1 and 31' };
  }

  const nextReset = getNextResetDate(currentDate, resetDay);

  data.keys[apiKey] = {
    creditsUsed: 0,
    concurrentRequests: 0,
    resetDay,
    nextResetDate: formatDate(nextReset),
    lastResetDate: null,
    provider: metadata.provider || DEFAULTS.defaultProvider,
    label: metadata.label || null,
    monthlyCredits: metadata.monthlyCredits || DEFAULTS.monthlyCredits,
    maxConcurrent: metadata.maxConcurrent || DEFAULTS.maxConcurrent
  };

  saveKeys(data);
  return { success: true, key: apiKey, data: data.keys[apiKey] };
}

export function getKeyStatuses() {
  const data = loadKeys();
  const currentDate = getCurrentDate();
  
  const statuses = Object.entries(data.keys).map(([key, keyData]) => {
    keyData = resetIfNeeded({ ...keyData });
    const available = keyData.creditsUsed + DEFAULTS.creditCost <= keyData.monthlyCredits &&
                      keyData.concurrentRequests < keyData.maxConcurrent;
    return {
      key: key.substring(0, 8) + '...',
      fullKey: key,
      provider: keyData.provider,
      label: keyData.label,
      creditsUsed: keyData.creditsUsed,
      creditsRemaining: keyData.monthlyCredits - keyData.creditsUsed,
      monthlyCredits: keyData.monthlyCredits,
      concurrentRequests: keyData.concurrentRequests,
      maxConcurrent: keyData.maxConcurrent,
      resetDay: keyData.resetDay,
      nextResetDate: keyData.nextResetDate,
      lastResetDate: keyData.lastResetDate,
      available,
      currentDate: currentDate.full
    };
  });

  return {
    keys: statuses,
    totalKeys: statuses.length,
    availableKeys: statuses.filter(k => k.available).length
  };
}

export function removeKey(apiKey) {
  const data = loadKeys();
  if (data.keys[apiKey]) {
    delete data.keys[apiKey];
    saveKeys(data);
    return { success: true };
  }
  return { success: false, error: 'Key not found' };
}

export function getCreditsByProvider() {
  const data = loadKeys();
  const currentDate = getCurrentDate();
  const providerStats = {};

  Object.values(data.keys).forEach(keyData => {
    keyData = resetIfNeeded({ ...keyData });
    const provider = keyData.provider || 'unknown';
    
    if (!providerStats[provider]) {
      providerStats[provider] = {
        provider,
        totalCredits: 0,
        totalCreditsUsed: 0,
        totalCreditsRemaining: 0,
        totalKeys: 0,
        availableKeys: 0,
        keys: []
      };
    }

    const creditsRemaining = keyData.monthlyCredits - keyData.creditsUsed;
    const isAvailable = keyData.creditsUsed + DEFAULTS.creditCost <= keyData.monthlyCredits &&
                        keyData.concurrentRequests < keyData.maxConcurrent;

    providerStats[provider].totalCredits += keyData.monthlyCredits;
    providerStats[provider].totalCreditsUsed += keyData.creditsUsed;
    providerStats[provider].totalCreditsRemaining += creditsRemaining;
    providerStats[provider].totalKeys += 1;
    if (isAvailable) providerStats[provider].availableKeys += 1;
    providerStats[provider].keys.push({
      key: keyData.label || keyData.provider + '-' + providerStats[provider].totalKeys,
      creditsUsed: keyData.creditsUsed,
      creditsRemaining,
      monthlyCredits: keyData.monthlyCredits,
      nextResetDate: keyData.nextResetDate,
      available: isAvailable
    });
  });

  return {
    currentDate: currentDate.full,
    providers: Object.values(providerStats),
    totalProviders: Object.keys(providerStats).length
  };
}