import { Client } from "@heroiclabs/nakama-js";

// Initialize the Nakama client
// These should ideally come from environment variables
const serverKey = "default_server_key";
const host = process.env.NEXT_PUBLIC_NAKAMA_HOST || "localhost";
const port = "7350";
const useSSL = false;

const client = new Client(serverKey, host, port, useSSL);

export default client;
