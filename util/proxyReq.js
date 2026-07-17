import axios from 'axios';
import { getKey, releaseKey, useCredits } from './apiKeyManager.js';

const SCRAPER_API_BASE = 'http://api.scrape.do/';
const DEFAULT_COST = 10;

async function proxyReq(params, keep_headers = true) {
  let apiKey = null;

  try {
    apiKey = await getKey();

    const proxyUrl = `${SCRAPER_API_BASE}?url=${params.url}&token=${apiKey}&forwardHeaders=${keep_headers}&super=true`;
    const response = await axios({ ...params, url: proxyUrl });

    await useCredits(apiKey, DEFAULT_COST);

    return response;
  } catch (error) {
    console.log(error)
    if (error.response) {
      throw error.response.data || error.response;
    }
    throw error;
  } finally {
    if (apiKey) {
      await releaseKey(apiKey);
    }
  }
}

export default proxyReq;