import axios from 'axios'

// Example usage:
// import proxyReq from './util/proxyReq'
// const response = await proxyReq({
//   method: 'get',
//   url: 'https://api.example.com/data',
//   headers: { 'Authorization': 'Bearer token' }
// })
// console.log(response.data)

const SCRAPER_API_KEY = '37901fa7bc2b2aa175b4c14fe2aa393e';

async function proxyReq(params, keep_headers = true) {
    try {
        return await axios({ ...params, url: `https://api.scraperapi.com/?api_key=${SCRAPER_API_KEY}&url=${params.url}&keep_headers=${keep_headers}` })
    } catch (error) {
        if (error.response) {
            throw error.response.data || error.response
        }
        throw error
    }
}

export default proxyReq;