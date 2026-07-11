import pg from 'pg';
import path from 'path';
import fs from 'fs';

const { Pool } = pg;

const KEYS_FILE = path.join(process.cwd(), 'util', 'api-keys.json');

let pool;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not set in environment');
    }
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

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

async function loadAllKeys() {
  const client = getPool();
  try {
    const result = await client.query('SELECT * FROM api_keys');
    const keys = {};
    result.rows.forEach(row => {
      keys[row.key_value] = {
        creditsUsed: row.credits_used,
        concurrentRequests: row.concurrent_requests,
        resetDay: row.reset_day,
        nextResetDate: row.next_reset_date,
        lastResetDate: row.last_reset_date,
        provider: row.provider,
        label: row.label,
        monthlyCredits: row.monthly_credits,
        maxConcurrent: row.max_concurrent
      };
    });
    return { keys };
  } catch (error) {
    console.error('Error loading keys:', error.message);
    return { keys: {} };
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

async function selectKey() {
  const data = await loadAllKeys();
  const validKeys = Object.entries(data.keys)
    .filter(([, keyData]) => isKeyValid(keyData))
    .map(([key, keyData]) => ({ key, ...keyData }));

  if (validKeys.length === 0) {
    return null;
  }

  validKeys.sort((a, b) => a.concurrentRequests - b.concurrentRequests);
  return validKeys[0].key;
}

export async function getKey() {
  const selectedKey = await selectKey();
  
  if (!selectedKey) {
    throw new Error('No available API keys. All keys exhausted or at concurrent limit.');
  }

  const client = getPool();
  await client.query(
    'UPDATE api_keys SET concurrent_requests = concurrent_requests + 1 WHERE key_value = $1',
    [selectedKey]
  );

  return selectedKey;
}

export async function releaseKey(apiKey) {
  const client = getPool();
  await client.query(
    'UPDATE api_keys SET concurrent_requests = GREATEST(0, concurrent_requests - 1) WHERE key_value = $1',
    [apiKey]
  );
}

export async function useCredits(apiKey, amount = DEFAULTS.creditCost) {
  const client = getPool();
  await client.query(
    'UPDATE api_keys SET credits_used = credits_used + $1 WHERE key_value = $2',
    [amount, apiKey]
  );
}

export function addKey(apiKey, metadata = {}) {
  return new Promise(async (resolve, reject) => {
    const currentDate = getCurrentDate();
    const resetDay = metadata.resetDay ? parseInt(metadata.resetDay, 10) : DEFAULTS.defaultResetDay;
    
    if (metadata.resetDay && (resetDay < 1 || resetDay > 31)) {
      return resolve({ success: false, error: 'resetDay must be between 1 and 31' });
    }

    const nextReset = getNextResetDate(currentDate, resetDay);
    const nextResetDate = formatDate(nextReset);

    const client = getPool();
    try {
      await client.query(
        `INSERT INTO api_keys (key_value, provider, label, reset_day, monthly_credits, max_concurrent, credits_used, concurrent_requests, next_reset_date, last_reset_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          apiKey,
          metadata.provider || DEFAULTS.defaultProvider,
          metadata.label || null,
          resetDay,
          metadata.monthlyCredits || DEFAULTS.monthlyCredits,
          metadata.maxConcurrent || DEFAULTS.maxConcurrent,
          0,
          0,
          nextResetDate,
          null
        ]
      );
      resolve({ success: true, key: apiKey });
    } catch (error) {
      if (error.code === '23505') {
        resolve({ success: false, error: 'Key already exists', key: apiKey });
      } else {
        reject(error);
      }
    }
  });
}

export async function getKeyStatuses() {
  const client = getPool();
  const currentDate = getCurrentDate();
  
  try {
    const result = await client.query('SELECT * FROM api_keys');
    
    const statuses = result.rows.map(row => {
      let keyData = {
        creditsUsed: row.credits_used,
        concurrentRequests: row.concurrent_requests,
        resetDay: row.reset_day,
        nextResetDate: row.next_reset_date,
        lastResetDate: row.last_reset_date,
        provider: row.provider,
        label: row.label,
        monthlyCredits: row.monthly_credits,
        maxConcurrent: row.max_concurrent
      };
      
      keyData = resetIfNeeded({ ...keyData });
      
      const available = keyData.creditsUsed + DEFAULTS.creditCost <= keyData.monthlyCredits &&
                        keyData.concurrentRequests < keyData.maxConcurrent;
      
      return {
        key: row.key_value.substring(0, 8) + '...',
        fullKey: row.key_value,
        provider: row.provider,
        label: row.label,
        creditsUsed: keyData.creditsUsed,
        creditsRemaining: row.monthly_credits - keyData.creditsUsed,
        monthlyCredits: row.monthly_credits,
        concurrentRequests: row.concurrent_requests,
        maxConcurrent: row.max_concurrent,
        resetDay: row.reset_day,
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
  } catch (error) {
    console.error('Error getting key statuses:', error.message);
    return { keys: [], totalKeys: 0, availableKeys: 0 };
  }
}

export async function removeKey(apiKey) {
  const client = getPool();
  const result = await client.query('DELETE FROM api_keys WHERE key_value = $1', [apiKey]);
  
  if (result.rowCount > 0) {
    return { success: true };
  }
  return { success: false, error: 'Key not found' };
}

export async function getCreditsByProvider() {
  const client = getPool();
  const currentDate = getCurrentDate();
  
  try {
    const result = await client.query('SELECT * FROM api_keys');
    const providerStats = {};

    result.rows.forEach(row => {
      let keyData = {
        creditsUsed: row.credits_used,
        resetDay: row.reset_day,
        nextResetDate: row.next_reset_date,
        provider: row.provider,
        monthlyCredits: row.monthly_credits
      };
      
      keyData = resetIfNeeded({ ...keyData });
      const provider = row.provider || 'unknown';
      
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

      const creditsRemaining = row.monthly_credits - keyData.creditsUsed;
      const isAvailable = keyData.creditsUsed + DEFAULTS.creditCost <= row.monthly_credits &&
                          row.concurrent_requests < row.max_concurrent;

      providerStats[provider].totalCredits += row.monthly_credits;
      providerStats[provider].totalCreditsUsed += keyData.creditsUsed;
      providerStats[provider].totalCreditsRemaining += creditsRemaining;
      providerStats[provider].totalKeys += 1;
      if (isAvailable) providerStats[provider].availableKeys += 1;
      providerStats[provider].keys.push({
        key: row.label || row.provider + '-' + providerStats[provider].totalKeys,
        creditsUsed: keyData.creditsUsed,
        creditsRemaining,
        monthlyCredits: row.monthly_credits,
        nextResetDate: keyData.nextResetDate,
        available: isAvailable
      });
    });

    return {
      currentDate: currentDate.full,
      providers: Object.values(providerStats),
      totalProviders: Object.keys(providerStats).length
    };
  } catch (error) {
    console.error('Error getting credits by provider:', error.message);
    return { currentDate: currentDate.full, providers: [], totalProviders: 0 };
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}