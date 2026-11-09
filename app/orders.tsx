import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ApiError, BOARD_STAGES, NEXT_STATUS, STAFF_IDLE_LOCK_MS, STAFF_SESSION_ERROR, STATUS_LABEL, formatINR,
  type Membership, type Order, type OrderStatus, type PaymentMethod, type StaffMember,
} from "../src/contract";
import { api } from "../src/lib/api";
import { signOut } from "../src/lib/auth";
import { subscribeToOrders } from "../src/lib/feed";
import { useColors, type Colors } from "../src/theme";
import { UpiQrModal } from "../src/UpiQrModal";
import { PasswordForm, StaffLock } from "../src/StaffLock";
import { endStaffSession, setPinLock, useStaffMode } from "../src/lib/staff-mode";

function minutesAgo(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : `${m} min ago`;
}

export default function Orders() {
  const c = useColors();
  /** The account logged in on this phone. */
  const [device, setDevice] = useState<Membership | null>(null);
  const { session, pinLock } = useStaffMode();
  const [staff, setStaff] = useState<StaffMember[] | null>(null); // null = not loaded yet
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [askLockOff, setAskLockOff] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stage, setStage] = useState<OrderStatus>("new");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);

  // Only a real logout (401) signs the phone out. A 403 is just "your role can't do this", and an
  // ended staff session goes back to "Who's working?" (lib/api.ts handles that).
  const handleAuthError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401 && e.code !== STAFF_SESSION_ERROR) {
      void signOut().then(() => router.replace("/login"));
      return true;
    }
    return false;
  }, []);

  const load = useCallback(async () => {
    try {
      const { orders } = await api.board();
      const fresh = orders.filter((o) => o.status === "new" && seen.current && !seen.current.has(o.id));
      seen.current = new Set(orders.map((o) => o.id));
      if (fresh.length) Vibration.vibrate([0, 300, 150, 300]);
      setOrders(orders);
      setError(null);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof Error ? e.message : "Could not load orders.");
    }
  }, [handleAuthError]);

  // Restaurant details (UPI ID, name, role) can change on the web, so re-read them whenever the app
  // comes back on screen and on pull-to-refresh. A stale UPI ID would send guests to the wrong account.
  const loadMember = useCallback(async () => {
    try {
      const me = await api.me();
      if (!me.membership) {
        // This login has no restaurant (set it up on the website).
        void signOut().then(() => router.replace("/login"));
        return;
      }
      setDevice(me.membership);
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof Error ? e.message : "Could not load your restaurant.");
    }
  }, [handleAuthError]);

  useEffect(() => {
    void loadMember();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadMember();
    });
    return () => sub.remove();
  }, [loadMember]);

  const canLock = !!device && (device.role === "owner" || device.role === "manager");
  // Names for "Who's working?", loaded with the device's own role (no staff session active).
  useEffect(() => {
    if (!canLock || !pinLock || session) return;
    api.staffList()
      .then((r) => setStaff(r.staff.filter((m) => m.isActive)))
      .catch((e) => { if (!handleAuthError(e)) setError(e instanceof Error ? e.message : "Could not load staff."); });
  }, [canLock, pinLock, session, handleAuthError]);

  const lockApplies = canLock && !!pinLock && !!staff?.length;
  const locked = lockApplies && !session && !ownerUnlocked;
  // Fail closed: with the PIN lock on, show the board only once we know whether to lock.
  const waitingForLock = canLock && pinLock !== false && !session && !ownerUnlocked && staff === null;

  const lock = useCallback(() => {
    endStaffSession();
    setOwnerUnlocked(false);
  }, []);

  // Back to "Who's working?" after 10 minutes without a tap.
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touched = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = lockApplies && !locked ? setTimeout(lock, STAFF_IDLE_LOCK_MS) : null;
  }, [lockApplies, locked, lock]);
  useEffect(() => {
    touched();
    return () => { if (idle.current) clearTimeout(idle.current); };
  }, [touched]);

  // While a staff member is working, their role decides what they can do (the API enforces it too).
  const member: Membership | null = device && session ? { ...device, role: session.staff.role } : device;
  const restaurantId = member?.restaurant.id;
  useEffect(() => {
    if (!restaurantId) return;
    void load();
    const unsubscribe = subscribeToOrders(restaurantId, () => void load());
    const t = setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    return () => { unsubscribe(); clearInterval(t); };
  }, [restaurantId, load]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      await load();
    } catch (e) {
      if (!handleAuthError(e)) setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const canTakePayment = member ? ["owner", "manager", "cashier"].includes(member.role) : false;
  const list = orders.filter((o) => o.status === stage);
  const s = makeStyles(c);
  // Latest copy from the board; once it's paid (here or on another device) the QR closes.
  const qrOrder = orders.find((o) => o.id === qrId && o.paymentStatus !== "paid") ?? null;

  if (locked || waitingForLock) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <Text style={[s.title, { paddingHorizontal: 16, paddingTop: 8 }]} numberOfLines={1}>{device?.restaurant.name}</Text>
        {error && <Text style={s.error}>{error}</Text>}
        {locked ? <StaffLock staff={staff!} onOwner={() => setOwnerUnlocked(true)} /> : <Text style={[s.muted, s.empty]}>Loading…</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]} onTouchStart={touched}>
      <View style={s.header}>
        <View style={{ flexGrow: 1, flexBasis: 160 }}>
          <Text style={s.title} numberOfLines={1}>{member?.restaurant.name ?? "Tabletap"}</Text>
          <Text style={s.muted}>
            {session ? `${session.staff.name} · ${session.staff.role}` : member ? `${member.role} · live orders` : "Loading…"}
          </Text>
        </View>
        {lockApplies && (
          <Pressable onPress={lock} style={[s.smallBtn, { backgroundColor: c.ink, borderColor: c.ink }]}>
            <Text style={[s.smallBtnText, { color: c.surface }]}>Switch staff</Text>
          </Pressable>
        )}
        {!session && canLock && (
          <Pressable
            onPress={() => (pinLock ? setAskLockOff(true) : setPinLock(true))}
            style={s.smallBtn}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!pinLock }}
            accessibilityLabel="Use this device for staff (PIN lock)"
          >
            <Text style={s.smallBtnText}>PIN lock {pinLock ? "on" : "off"}</Text>
          </Pressable>
        )}
        {!session && (
          <Pressable onPress={() => void signOut().then(() => router.replace("/login"))} style={s.smallBtn}>
            <Text style={s.smallBtnText}>Log out</Text>
          </Pressable>
        )}
      </View>
      <Modal visible={askLockOff} transparent animationType="fade" onRequestClose={() => setAskLockOff(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.6)" }}>
          <PasswordForm
            title="Turn off PIN lock on this phone"
            onDone={() => { setPinLock(false); setAskLockOff(false); }}
            onCancel={() => setAskLockOff(false)}
          />
        </View>
      </Modal>

      <View style={s.tabs}>
        {BOARD_STAGES.map((st) => {
          const count = orders.filter((o) => o.status === st).length;
          const on = st === stage;
          return (
            <Pressable key={st} onPress={() => setStage(st)} style={[s.tab, on && { borderBottomColor: c.accent }]}>
              <Text style={[s.tabText, on && { color: c.ink }]}>{STATUS_LABEL[st]}</Text>
              {count > 0 && st !== "served" && (
                <View style={s.badge}><Text style={s.badgeText}>{count}</Text></View>
              )}
            </Pressable>
          );
        })}
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      <FlatList
        data={stage === "served" ? list.slice(0, 20) : list}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([loadMember(), load()]); setRefreshing(false); }} />}
        ListEmptyComponent={<Text style={[s.muted, s.empty]}>No {STATUS_LABEL[stage].toLowerCase()} orders right now.</Text>}
        renderItem={({ item: o }) => {
          const next = NEXT_STATUS[o.status];
          const disabled = busy === o.id;
          const pay = (m: PaymentMethod) => act(o.id, () => api.markPaid(o.id, m));
          return (
            <View style={[s.ticket, { opacity: disabled ? 0.6 : 1 }]}>
              <View style={s.row}>
                <Text style={s.table}>{o.tableLabel ?? "No table"}</Text>
                <Text style={s.muted}>#{o.orderNo} · {minutesAgo(o.createdAt, now)}</Text>
              </View>
              {o.lines.map((l, i) => (
                <View key={i} style={s.line}>
                  <Text style={s.qty}>{l.qty}×</Text>
                  <View style={[s.mark, { borderColor: l.isVeg ? c.veg : c.nonveg }]}>
                    <View style={[s.markDot, { backgroundColor: l.isVeg ? c.veg : c.nonveg }]} />
                  </View>
                  <Text style={s.lineText}>{l.name}</Text>
                </View>
              ))}
              {o.note && <Text style={s.note}>Note: {o.note}</Text>}
              <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
                <Text style={[s.pill, { color: o.paymentStatus === "paid" ? c.good : c.warn, borderColor: o.paymentStatus === "paid" ? c.good : c.warn }]}>
                  {o.paymentStatus === "paid"
                    ? `PAID ${(o.paymentMethod ?? "").toUpperCase()}${o.paidByName ? ` BY ${o.paidByName.toUpperCase()}` : ""}`
                    : `DUE ${formatINR(o.totalPaise)}`}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {o.paymentStatus !== "paid" && canTakePayment && (
                    <>
                      <Pressable disabled={disabled} style={s.smallBtn} onPress={() => void pay("cash")}><Text style={s.smallBtnText}>Cash</Text></Pressable>
                      <Pressable disabled={disabled} style={s.smallBtn} onPress={() => void pay("upi")}><Text style={s.smallBtnText}>UPI</Text></Pressable>
                      <Pressable disabled={disabled} style={s.smallBtn} onPress={() => { setError(null); setQrId(o.id); }}><Text style={s.smallBtnText}>Show UPI QR</Text></Pressable>
                    </>
                  )}
                  {next && (
                    <Pressable disabled={disabled} style={[s.smallBtn, { backgroundColor: c.ink, borderColor: c.ink }]} onPress={() => void act(o.id, () => api.moveOrder(o.id, next.to))}>
                      <Text style={[s.smallBtnText, { color: c.surface }]}>{next.action}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
      {member && (
        <UpiQrModal
          order={qrOrder}
          restaurant={member.restaurant}
          busy={!!qrOrder && busy === qrOrder.id}
          error={error}
          onMarkPaid={(o) => void act(o.id, () => api.markPaid(o.id, "upi"))}
          onClose={() => setQrId(null)}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    title: { fontSize: 22, fontWeight: "800", color: c.ink },
    muted: { color: c.muted, fontSize: 13 },
    tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.line, paddingHorizontal: 8 },
    tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
    tabText: { fontWeight: "700", color: c.muted },
    badge: { backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
    badgeText: { color: c.accentInk, fontSize: 11, fontWeight: "800" },
    error: { color: c.nonveg, fontWeight: "600", paddingHorizontal: 16, paddingTop: 10 },
    empty: { textAlign: "center", paddingVertical: 40 },
    ticket: { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    table: { fontSize: 20, fontWeight: "800", color: c.ink },
    line: { flexDirection: "row", alignItems: "center", gap: 8 },
    qty: { fontWeight: "800", color: c.ink, minWidth: 26, fontSize: 15 },
    lineText: { color: c.ink, fontSize: 15, flexShrink: 1 },
    mark: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 2, alignItems: "center", justifyContent: "center" },
    markDot: { width: 6, height: 6, borderRadius: 3 },
    note: { backgroundColor: c.soft, color: c.ink, borderRadius: 6, padding: 6, fontSize: 13 },
    pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: "800" },
    smallBtn: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    smallBtnText: { fontWeight: "700", color: c.ink, fontSize: 13 },
  });
}
