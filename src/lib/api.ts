import { createApiClient } from "../contract";
import { getToken } from "./auth";

export const api = createApiClient(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000", getToken);
