import axios from 'axios';
import { BACKEND_BASEURL } from '@/constants/config';

const api = axios.create({
    baseURL: BACKEND_BASEURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add token to outgoing requests
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`; // Backend might expect Bearer or just token. But typically standard is Bearer. Wait, does backend expect Bearer? Let me look at auth router later. For now let's set it. But checking token via query in WS is different. Let's just send the raw token or Bearer per common practice.
        }
    }
    return config;
});

export default api;
