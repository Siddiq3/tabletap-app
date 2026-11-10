// Shared-device state. The PIN session lives in memory only, so restarting the app locks it.
// "Use this device for staff" is per device (AsyncStorage), ON by default in the app.
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PinSessionResponse } from "../contract";

import { DEMO_MODE } from "./demo-store";

const KEY = DEMO_MODE ? "tabletap.demo.pinLock" : "tabletap.pinLock";

/** pinLock null = not read from storage yet. */
type State = { session: PinSessionResponse | null; pinLock: boolean | null };
let state: State = { session: null, pinLock: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

AsyncStorage.getItem(KEY)
  .then((v) => set({ pinLock: v !== "off" }))
  .catch(() => set({ pinLock: true }));

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
export const useStaffMode = () => useSyncExternalStore(subscribe, () => state, () => state);

/** For the API client: X-Staff-Session while a staff member is working. */
export const getStaffSession = () => state.session?.token ?? null;
export const startStaffSession = (session: PinSessionResponse) => set({ session });
/** Switch staff, idle lock, or the server said the session ended. */
export const endStaffSession = () => { if (state.session) set({ session: null }); };

export function setPinLock(on: boolean) {
  void AsyncStorage.setItem(KEY, on ? "on" : "off").catch(() => {});
  set({ pinLock: on, session: on ? state.session : null });
}
