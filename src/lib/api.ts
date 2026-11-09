import { router } from "expo-router";
import { ApiError, EMAIL_UNVERIFIED_ERROR, STAFF_SESSION_ERROR, createApiClient } from "../contract";
import { getToken, loginEmail } from "./auth";
import { endStaffSession, getStaffSession } from "./staff-mode";

const raw = createApiClient(process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000", getToken, getStaffSession);

/** Sends the login token (and the staff session while a staff member is working) with every call. */
export const api = Object.fromEntries(
  Object.entries(raw).map(([name, fn]) => [
    name,
    async (...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (e) {
        // Expired/revoked staff session: back to "Who's working?" instead of logging the device out.
        if (e instanceof ApiError && e.code === STAFF_SESSION_ERROR) endStaffSession();
        // Email not verified yet: go to the code screen from anywhere.
        if (e instanceof ApiError && e.code === EMAIL_UNVERIFIED_ERROR) router.replace("/verify-email");
        throw e;
      }
    },
  ]),
) as typeof raw;

/** Re-checks the device account's password ("Continue as owner", turning the PIN lock off). */
export async function confirmPassword(password: string): Promise<void> {
  const me = await api.me();
  const identifier = me.profile?.username ?? (await loginEmail());
  if (!identifier) throw new Error("Log out and log in again.");
  await api.login({ identifier, password });
}
