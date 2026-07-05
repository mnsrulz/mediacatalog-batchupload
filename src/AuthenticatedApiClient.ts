import ky from 'ky';
// Import the global runtime environment directly
import { env } from "cloudflare:workers";


const apiToken = env.API_TOKEN || '';
const apiBaseUrl = env.API_BASE_URL || '';

export const AuthenticatedApiClient = ky.create({
    baseUrl: apiBaseUrl,
    headers: {
        'Authorization': `Basic ${apiToken}`
    }
})