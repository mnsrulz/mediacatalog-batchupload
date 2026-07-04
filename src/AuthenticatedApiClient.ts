import ky from 'ky';
const apiToken = process.env.API_TOKEN || '';
const apiBaseUrl = process.env.API_BASE_URL || '';

export const AuthenticatedApiClient = ky.create({
    baseUrl: apiBaseUrl,
    headers: {
        'Authorization': `Basic ${apiToken}`
    }
})