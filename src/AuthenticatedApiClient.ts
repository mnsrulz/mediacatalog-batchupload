import got from 'got';
const apiToken = process.env.API_TOKEN || '';
const apiBaseUrl = process.env.API_BASE_URL || '';

export const AuthenticatedApiClient = got.extend({
    prefixUrl: apiBaseUrl,
    headers: {
        'Authorization': `Basic ${apiToken}`
    },
    responseType: 'json'
})