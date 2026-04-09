import { Client } from "@heroiclabs/nakama-js";

// Initialize the Nakama client with environment variable fallbacks
const serverKey = process.env.NEXT_PUBLIC_NAKAMA_SERVER_KEY || "default_server_key";
const host = process.env.NEXT_PUBLIC_NAKAMA_HOST || "127.0.0.1";
const port = process.env.NEXT_PUBLIC_NAKAMA_PORT || "7350";
export const useSSL = process.env.NEXT_PUBLIC_NAKAMA_USE_SSL === "true";

const client = new Client(serverKey, host, port, useSSL);

export default client;
