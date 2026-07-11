import express from 'express';
import proxyReq from './util/proxyReq.js';

const app = express();
const port = 2323;

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
            url: `https://web2.temp-mail.org/mailbox`,
            method: 'post',
            maxBodyLength: Infinity,
            headers: {
                ...BASE_HEADERS,
                'content-length': '0',
                'content-type': 'application/json'
            }
        };

        const response = await proxyReq(config, true);
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
            url: `https://web2.temp-mail.org/messages`,
            headers: {
                ...BASE_HEADERS,
                'authorization': `Bearer ${authToken}`
            }
        };

        const response = await proxyReq(config);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/message', async (req, res) => {
    const authToken = req.query.authtoken;
    const messageId = req.query.messageid;

    if (!authToken) {
        return res.status(400).json({ error: 'authtoken is required' });
    }

    if (!messageId) {
        return res.status(400).json({ error: 'messageid is required' });
    }

    try {
        const config = {
            method: 'get',
            maxBodyLength: Infinity,
            url: `https://web2.temp-mail.org/messages/${messageId}`,
            headers: {
                ...BASE_HEADERS,
                'authorization': `Bearer ${authToken}`
            }
        };

        const response = await proxyReq(config);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Mail API server running on http://localhost:${port}`);
});