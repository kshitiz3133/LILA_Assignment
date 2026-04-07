export const BACKEND_BASEURL = process.env.NEXT_PUBLIC_BACKEND_BASEURL || 'http://localhost:3000';
export const WS_BACKEND_BASEURL = BACKEND_BASEURL.replace(/^http/, 'ws');
