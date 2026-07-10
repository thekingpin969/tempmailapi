import express from 'express';
import axios from 'axios';

const app = express();
const port = 2323;

const SCRAPER_API_KEY = '134ecdbc1e0bf4565004cfa789f280fb';

const BASE_HEADERS = {
    'accept': '*/*',
    'accept-language': 'en-GB,en;q=0.9',
    'origin': 'https://temp-mail.org',
    'priority': 'u=1, i',
    'referer': 'https://temp-mail.org/',
    'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
};

app.get('/generate', async (req, res) => {
    try {
        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=https://web2.temp-mail.org/mailbox&keep_headers=true`,
            headers: {
                ...BASE_HEADERS,
                'content-length': '0',
                'content-type': 'application/json'
            }
        };

        const response = await axios.request(config);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/messages', async (req, res) => {
    const authToken = req.query.authtoken;

    if (!authToken) {
        return res.status(400).json({ error: 'authtoken is required' });
    }

    try {
        const config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=https://web2.temp-mail.org/messages&keep_headers=true`,
            headers: {
                ...BASE_HEADERS,
                'authorization': `Bearer ${authToken}`
            }
        };

        const response = await axios.request(config);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Mail API server running on http://localhost:${port}`);
});