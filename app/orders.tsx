import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, Vibration, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ApiError, BOARD_STAGES, NEXT_STATUS, STAFF_IDLE_LOCK_MS, STAFF_SESSION_ERROR, STATUS_LABEL, formatINR,
  type Membership, type Order, type OrderStatus, type PaymentMethod, type StaffMember,
} from "../src/contract";
import { StaffCalls } from "../src/StaffCalls";
import { Brand, Button, Icon } from "../src/ui";
import { DEMO_MODE, demoStore } from "../src/lib/demo-store";
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
  const { width } = useWindowDimensions();
  const columns = width >= 800 ? 2 : 1;
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
      if (me.profile && !me.profile.emailVerified) {
        router.replace("/verify-email");
        return;
      }
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

  useEffect(() => {
    if (qrId && orders.some(o => o.id === qrId && o.paymentStatus === "paid")) setQrId(null);
  }, [orders, qrId]);

  if (!device) return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}><View style={{ flex: 1, padding: 24, justifyContent: "center", alignItems: "center", gap: 18 }}><Brand />{error ? <><Text style={s.error}>{error}</Text><Button title="Try again" onPress={() => void loadMember()}/></> : <><ActivityIndicator color={c.accent}/><Text style={s.muted}>Opening your restaurant…</Text></>}</View></SafeAreaView>;

  if (locked || waitingForLock) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ padding: 20, gap: 18 }}><Brand />{DEMO_MODE && <View style={{ gap: 10 }}><Text style={s.demoText}>Sample restaurant · Staff PIN: 1234 · Owner password: tabletap123</Text><Button secondary title="Reset sample data" onPress={() => { demoStore.reset(); void load(); }}/></View>}</View>
        <Text style={[s.title, { paddingHorizontal: 24, paddingTop: 8 }]} numberOfLines={1}>{device?.restaurant.name}</Text>
        {error && <Text style={s.error}>{error}</Text>}
        {locked ? <StaffLock staff={staff!} onOwner={() => setOwnerUnlocked(true)} /> : <Text style={[s.muted, s.empty]}>Loading…</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]} onTouchStart={touched}>
      <View style={{ flex: 1, width: "100%", maxWidth: 1100, alignSelf: "center" }}>
      <View style={s.brandRow}><Brand /><View style={s.live}><View style={[s.liveDot, { backgroundColor: DEMO_MODE ? c.warn : c.good }]}/><Text style={s.muted}>{DEMO_MODE ? "Demo mode" : "Orders board"}</Text></View></View>
      {DEMO_MODE && <View style={s.demoBanner}><Text style={s.demoText}>Sample data only · No real orders or payments</Text><Pressable accessibilityRole="button" onPress={() => { setQrId(null); demoStore.reset(); void load(); }} style={s.resetButton}><Icon name="refresh" color={c.ink} size={16}/><Text style={s.resetText}>Reset</Text></Pressable></View>}
      <View style={s.header}>
        <View style={{ flexGrow: 1, flexBasis: 160 }}>
          <Text style={s.title} numberOfLines={1}>{member?.restaurant.name ?? "Your restaurant"}</Text>
          <Text style={s.muted}>
            {session ? `${session.staff.name} · ${session.staff.role}` : member ? `${member.role} · live orders` : "Loading…"}
          </Text>
        </View>
        {member && member.role !== "kitchen" && (
          <Pressable accessibilityRole="button" onPress={() => router.push("/bills")} style={[s.smallBtn, { backgroundColor: c.accent, borderColor: c.accent }]}>
            <Text style={[s.smallBtnText, { color: c.accentInk }]}>Bills</Text>
          </Pressable>
        )}
        {lockApplies && (
          <Pressable accessibilityRole="button" onPress={lock} style={[s.smallBtn, { backgroundColor: c.ink, borderColor: c.ink }]}>
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
          <Pressable accessibilityRole="button" onPress={() => { endStaffSession(); void signOut().then(() => router.replace("/login")); }} style={s.smallBtn}>
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

      <View style={s.serviceHeading}><Text accessibilityRole="header" style={s.serviceTitle}>Service, in sync.</Text><Text style={s.muted}>Every table. Every order. Right here.</Text></View>
      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statValue}>{orders.filter(o => ["new", "preparing", "ready"].includes(o.status)).length}</Text><Text style={s.muted}>Active orders</Text></View>
        <View style={s.stat}><Text style={[s.statValue, { color: c.good }]}>{orders.filter(o => o.status === "ready").length}</Text><Text style={s.muted}>Ready to serve</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{orders.filter(o => o.paymentStatus === "unpaid").length}</Text><Text style={s.muted}>Unpaid bills</Text></View>
      </View>
      <View style={s.tabs}>
        {BOARD_STAGES.map((st) => {
          const count = orders.filter((o) => o.status === st).length;
          const on = st === stage;
          return (
            <Pressable key={st} accessibilityRole="button" accessibilityLabel={`${STATUS_LABEL[st]} orders (${count})`} accessibilityState={{ selected: on }} onPress={() => setStage(st)} style={[s.tab, on && { backgroundColor: c.ink }]}>
              <Text style={[s.tabText, on && { color: c.surface }]}>{STATUS_LABEL[st]}</Text>
              {(
                <View style={[s.badge, on && { backgroundColor: c.surface }]}><Text style={[s.badgeText, on && { color: c.ink }]}>{count}</Text></View>
              )}
            </Pressable>
          );
        })}
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      <FlatList
        ListHeaderComponent={<StaffCalls restaurantId={member!.restaurant.id}/>}
        key={columns}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: 16 } : undefined}
        data={stage === "served" ? list.slice(0, 20) : list}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([loadMember(), load()]); setRefreshing(false); }} />}
        ListEmptyComponent={<View style={s.emptyState}><Icon name="order" size={36} color={c.muted}/><Text style={s.emptyTitle}>All clear here.</Text><Text style={[s.muted, { textAlign: "center", lineHeight: 22 }]}>No {STATUS_LABEL[stage].toLowerCase()} orders right now. Pull down to check for the latest.</Text></View>}
        renderItem={({ item: o }) => {
          const next = NEXT_STATUS[o.status];
          const disabled = busy === o.id;
          const pay = (m: PaymentMethod) => act(o.id, () => api.markPaid(o.id, m));
          return (
            <View style={[s.ticket, { opacity: disabled ? 0.6 : 1 }]}>
              <View style={s.row}><View style={{ gap: 6 }}><Text style={s.table}>{o.tableLabel?.replace(/^T(?=\d)/, "Table ") ?? "No table"}</Text><Text style={s.muted}>Order #{o.orderNo} · {minutesAgo(o.createdAt, now)}</Text></View><Text style={[s.pill, { backgroundColor: o.paymentStatus === "paid" ? c.soft : c.bg, color: o.paymentStatus === "paid" ? c.good : c.warn }]}>{o.paymentStatus === "paid" ? "Paid" : "Unpaid"}</Text></View>
              <View style={s.divider}/>
              {o.lines.map((l, i) => <View key={i} style={s.line}><Text style={s.qty}>{l.qty}×</Text><View style={[s.mark, { borderColor: l.isVeg ? c.veg : c.nonveg }]}><View style={[s.markDot, { backgroundColor: l.isVeg ? c.veg : c.nonveg, borderRadius: l.isVeg ? 3 : 0 }]}/></View><Text style={s.lineText}>{l.name}</Text></View>)}
              {o.note && <View style={s.note}><Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Kitchen note</Text><Text style={{ color: c.ink, fontSize: 14 }}>{o.note}</Text></View>}
              <View style={[s.row, { marginTop: 4 }]}><Text style={s.muted}>Total, including GST</Text><Text style={s.total}>{formatINR(o.totalPaise)}</Text></View>
              {o.paymentStatus === "paid" && <Text style={s.paidDetail}>Paid by {o.paymentMethod?.toUpperCase()}{o.paidByName ? ` · Recorded by ${o.paidByName}` : ""}</Text>}
              {o.paymentStatus !== "paid" && canTakePayment && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel={`Mark order ${o.orderNo} cash paid`} disabled={disabled} style={s.smallBtn} onPress={() => void pay("cash")}><Text style={s.smallBtnText}>Cash paid</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Mark order ${o.orderNo} UPI paid`} disabled={disabled} style={s.smallBtn} onPress={() => void pay("upi")}><Text style={s.smallBtnText}>UPI paid</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Show UPI QR for order ${o.orderNo}`} disabled={disabled} style={s.smallBtn} onPress={() => { setError(null); setQrId(o.id); }}><Text style={s.smallBtnText}>{DEMO_MODE ? "Demo QR" : "UPI QR"}</Text></Pressable></View>}
              {next && <Button title={disabled ? "Updating…" : next.action} disabled={disabled} onPress={() => void act(o.id, () => api.moveOrder(o.id, next.to))}/>}
            </View>
          );
        }}
      />
      </View>
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
    brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 16 },
    live: { flexDirection: "row", alignItems: "center", gap: 7 }, liveDot: { width: 7, height: 7, borderRadius: 4 },
    demoBanner: { backgroundColor: c.soft, marginHorizontal: 20, paddingLeft: 12, paddingRight: 4, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    demoText: { fontSize: 11, color: c.muted, flexShrink: 1, lineHeight: 18 }, resetButton: { flexDirection: "row", gap: 6, padding: 10, alignItems: "center", minHeight: 44 }, resetText: { color: c.ink, fontSize: 11, fontWeight: "700" },
    header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 20, paddingBottom: 12 },
    title: { fontSize: 19, fontWeight: "700", color: c.ink }, muted: { color: c.muted, fontSize: 12 },
    serviceHeading: { padding: 20, paddingTop: 10, paddingBottom: 20, gap: 6 }, serviceTitle: { color: c.ink, fontSize: 32, fontWeight: "800", letterSpacing: -.9 },
    stats: { flexDirection: "row", marginHorizontal: 20, backgroundColor: c.soft, borderRadius: 14, paddingVertical: 18, marginBottom: 20 }, stat: { flex: 1, alignItems: "center", gap: 5 }, statValue: { color: c.ink, fontSize: 26, fontWeight: "800" },
    tabs: { flexDirection: "row", gap: 6, marginHorizontal: 20, padding: 5, borderRadius: 14, backgroundColor: c.soft },
    tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 11, borderRadius: 10, minHeight: 64 }, tabText: { fontWeight: "600", fontSize: 12, color: c.muted },
    badge: { backgroundColor: c.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 }, badgeText: { color: c.muted, fontSize: 11, fontWeight: "700" },
    error: { color: c.nonveg, fontWeight: "600", paddingHorizontal: 20, paddingTop: 10 }, empty: { textAlign: "center", paddingVertical: 40 },
    emptyState: { padding: 30, paddingVertical: 55, alignItems: "center", gap: 15 }, emptyTitle: { color: c.ink, fontSize: 22, fontWeight: "700" },
    ticket: { flex: 1, backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 18, gap: 13 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }, table: { fontSize: 22, fontWeight: "800", color: c.ink, letterSpacing: -.4 }, divider: { height: 1, backgroundColor: c.line, marginVertical: 2 },
    line: { flexDirection: "row", alignItems: "center", gap: 9 }, qty: { fontWeight: "700", color: c.ink, minWidth: 26, fontSize: 15 }, lineText: { color: c.ink, fontSize: 15, flexShrink: 1 },
    mark: { width: 13, height: 13, borderWidth: 1.3, borderRadius: 2, alignItems: "center", justifyContent: "center" }, markDot: { width: 5, height: 5 },
    note: { backgroundColor: c.soft, borderRadius: 9, padding: 12 }, pill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
    total: { color: c.ink, fontSize: 20, fontWeight: "800" }, paidDetail: { color: c.good, fontSize: 12 },
    smallBtn: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 12, minHeight: 44, justifyContent: "center", alignItems: "center" }, smallBtnText: { fontWeight: "600", color: c.ink, fontSize: 12 },
  });
}
