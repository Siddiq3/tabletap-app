import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ApiError, STAFF_IDLE_LOCK_MS, formatINR, formatInvoiceNo, rupeesToPaise,
  type Bill, type DiningTable, type Membership, type MenuItem, type PaymentMethod, type StaffOrderRequest,
} from "../src/contract";
import { api } from "../src/lib/api";
import { subscribeToOrders } from "../src/lib/feed";
import { endStaffSession, useStaffMode } from "../src/lib/staff-mode";
import { Button, Icon } from "../src/ui";
import { useColors, type Colors } from "../src/theme";

type Target = Pick<StaffOrderRequest, "tableId" | "billId" | "takeaway">;
const title = (b: Pick<Bill, "kind" | "tableLabel" | "customerName">) =>
  b.kind === "takeaway" ? `Takeaway${b.customerName ? ` · ${b.customerName}` : ""}` : `Table ${(b.tableLabel ?? "").replace(/^T(?=\d)/, "")}`;
const rupees = (p: number) => (p / 100).toFixed(2).replace(/\.00$/, "");

/** Table bills on the phone: waiters add items for guests; cashiers take (split) payments. Printing stays on the counter screen. */
export default function Bills() {
  const c = useColors();
  const s = useMemo(() => styles(c), [c]);
  const { session, pinLock } = useStaffMode();
  const [device, setDevice] = useState<Membership | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ title: string; target: Target } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const role = session?.staff.role ?? device?.role;
  const canSettle = role === "owner" || role === "manager" || role === "cashier";

  const load = useCallback(async () => {
    try { setBills((await api.bills()).bills); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load bills."); }
  }, []);

  useEffect(() => {
    api.me().then((me) => setDevice(me.membership)).catch(() => router.replace("/orders"));
    api.tables().then((r) => setTables(r.tables.filter((t) => t.isActive))).catch(() => {});
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => (device ? subscribeToOrders(device.restaurant.id, () => void load(), "bills") : undefined), [device, load]);

  // Shared phone with PIN lock: no one may stay here unlocked; idle → back to "Who's working?".
  useEffect(() => {
    if (!pinLock) return;
    if (!session && device && (device.role === "owner" || device.role === "manager")) { router.replace("/orders"); return; }
    const t = setTimeout(() => { endStaffSession(); router.replace("/orders"); }, STAFF_IDLE_LOCK_MS);
    return () => clearTimeout(t);
  }, [pinLock, session, device, bills, picker, selected]);

  const bill = bills.find((b) => b.id === selected) ?? null;
  const freeTables = tables.filter((t) => !bills.some((b) => b.tableId === t.id));

  if (picker) {
    return <ItemPicker title={picker.title} onCancel={() => setPicker(null)} onSubmit={async (items, note) => {
      const r = await api.addOrder({ ...picker.target, items, note });
      setPicker(null); setNotice(`Order #${r.orderNo} sent to the kitchen.`); if (r.billId) setSelected(r.billId); void load();
    }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right"]}>
      <View style={s.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (bill ? setSelected(null) : router.back())} style={s.iconBtn}><Icon name="back" color={c.ink} /></Pressable>
        <Text accessibilityRole="header" style={s.title}>{bill ? title(bill) : "Bills"}</Text>
      </View>
      {notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {bill ? (
        <BillDetail bill={bill} canSettle={canSettle} s={s} c={c}
          onAdd={() => setPicker({ title: `Add items · ${title(bill)}`, target: { billId: bill.id } })}
          onPaid={(msg) => { setNotice(msg); void load(); }}
          onError={(msg) => { setError(msg); void load(); }} />
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={{ gap: 10, marginBottom: 6 }}>
              <Button title="New takeaway" secondary onPress={() => setPicker({ title: "New takeaway", target: { takeaway: {} } })} />
              {freeTables.length > 0 && <Text style={s.muted}>Start an order for a free table:</Text>}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {freeTables.map((t) => (
                  <Pressable key={t.id} accessibilityRole="button" onPress={() => setPicker({ title: `New order · Table ${t.label.replace(/^T(?=\d)/, "")}`, target: { tableId: t.id } })} style={s.chip}>
                    <Text style={s.chipText}>{t.label.replace(/^T(?=\d)/, "Table ")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={[s.muted, { textAlign: "center", padding: 20 }]}>No open bills. QR orders, waiter orders and takeaways appear here.</Text>}
          renderItem={({ item: b }) => (
            <Pressable accessibilityRole="button" onPress={() => { setSelected(b.id); setNotice(null); setError(null); }} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{title(b)}</Text>
                <Text style={s.muted}>#{formatInvoiceNo(b.invoiceNo)} · {b.orders.length} {b.orders.length === 1 ? "order" : "orders"}</Text>
              </View>
              <Text style={s.amount}>{formatINR(b.duePaise)}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function BillDetail({ bill, canSettle, s, c, onAdd, onPaid, onError }: {
  bill: Bill; canSettle: boolean; s: ReturnType<typeof styles>; c: Colors;
  onAdd: () => void; onPaid: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [amount, setAmount] = useState(rupees(bill.duePaise));
  const [busy, setBusy] = useState(false);
  useEffect(() => setAmount(rupees(bill.duePaise)), [bill.duePaise, bill.totalPaise]);
  const paise = rupeesToPaise(amount);
  const ok = paise !== null && paise > 0 && paise <= bill.duePaise;
  const row = (k: string, v: string, strong = false) => (
    <View key={k} style={s.row}><Text style={strong ? s.strong : s.muted}>{k}</Text><Text style={strong ? s.strong : s.value}>{v}</Text></View>
  );

  function pay(method: PaymentMethod) {
    if (!ok) return;
    Alert.alert(`Take ${formatINR(paise!)} by ${method.toUpperCase()}?`, paise === bill.duePaise ? "This closes the bill." : `Leaves ${formatINR(bill.duePaise - paise!)} to pay.`, [
      { text: "Back", style: "cancel" },
      { text: "Confirm", onPress: async () => {
        setBusy(true);
        try {
          await api.payBill(bill.id, { method, amountPaise: paise!, expectedTotalPaise: bill.totalPaise });
          onPaid(paise === bill.duePaise ? `${title(bill)} paid and closed.` : `${formatINR(paise!)} received by ${method.toUpperCase()}.`);
        } catch (e) {
          onError(e instanceof ApiError && e.code === "BILL_CHANGED" ? "This bill just changed. Check it again, then take payment." : e instanceof Error ? e.message : "Could not save the payment.");
        } finally { setBusy(false); }
      } },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
      <Text style={s.muted}>Invoice {formatInvoiceNo(bill.invoiceNo)}</Text>
      {bill.orders.map((o) => (
        <View key={o.id} style={s.card}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.strong}>#{o.orderNo} · {o.source === "staff" ? `added by ${o.placedByName ?? "staff"}` : "guest QR"}</Text>
            {o.lines.map((l, i) => <Text key={l.id ?? i} style={s.value}>{l.qty} × {l.name}</Text>)}
            {o.note && <Text style={s.muted}>“{o.note}”</Text>}
          </View>
        </View>
      ))}
      <View style={[s.card, { flexDirection: "column", alignItems: "stretch", gap: 6 }]}>
        {row("Subtotal", formatINR(bill.subtotalPaise))}
        {bill.discountPaise > 0 && row(`Discount${bill.discountReason ? ` (${bill.discountReason})` : ""}`, `− ${formatINR(bill.discountPaise)}`)}
        {bill.serviceChargePaise > 0 && row("Service charge", formatINR(bill.serviceChargePaise))}
        {bill.packagingPaise > 0 && row("Packaging", formatINR(bill.packagingPaise))}
        {row("GST", formatINR(bill.taxPaise))}
        {bill.roundOffPaise !== 0 && row("Round off", formatINR(bill.roundOffPaise))}
        {row("Total", formatINR(bill.totalPaise), true)}
        {bill.payments.map((p) => row(`Paid ${p.method.toUpperCase()}`, formatINR(p.amountPaise)))}
        {bill.paidPaise > 0 && row("Balance due", formatINR(bill.duePaise), true)}
      </View>
      <Button title="Add items" secondary onPress={onAdd} />
      {canSettle && bill.duePaise > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={s.strong}>Take payment</Text>
          <TextInput accessibilityLabel="Amount in rupees" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} style={s.input} />
          {!ok && <Text style={s.error}>Enter an amount up to {formatINR(bill.duePaise)}. Less than the total splits the bill.</Text>}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["cash", "upi", "card"] as PaymentMethod[]).map((m) => <Button key={m} title={m.toUpperCase()} disabled={!ok || busy} onPress={() => pay(m)} style={{ flex: 1 }} />)}
          </View>
        </View>
      )}
      <Text style={[s.muted, { textAlign: "center" }]}>Print the bill and KOTs from the counter screen.</Text>
    </ScrollView>
  );
}

function ItemPicker({ title, onSubmit, onCancel }: { title: string; onSubmit: (items: { menuItemId: string; qty: number }[], note: string) => Promise<void>; onCancel: () => void }) {
  const c = useColors();
  const s = useMemo(() => styles(c), [c]);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.menu().then((m) => setItems(m.items.filter((i) => i.isAvailable))).catch((e) => setError(e instanceof Error ? e.message : "Could not load the menu.")); }, []);
  const chosen = Object.entries(qty).filter(([, n]) => n > 0);
  const total = chosen.reduce((sum, [id, n]) => sum + (items?.find((i) => i.id === id)?.pricePaise ?? 0) * n, 0);
  const shown = (items ?? []).filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const change = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(50, (q[id] ?? 0) + d)) }));
  return (
    <Modal animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={s.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={s.iconBtn}><Icon name="back" color={c.ink} /></Pressable>
          <Text accessibilityRole="header" style={s.title}>{title}</Text>
        </View>
        <TextInput accessibilityLabel="Search dishes" placeholder="Search dishes" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} style={[s.input, { marginHorizontal: 16 }]} />
        {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={<Text style={s.muted}>{items ? "No dish matches." : "Loading menu…"}</Text>}
          renderItem={({ item: i }) => (
            <View style={s.card}>
              <View style={{ flex: 1 }}><Text style={s.strong}>{i.name}</Text><Text style={s.muted}>{formatINR(i.pricePaise)}</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${i.name}`} disabled={!qty[i.id]} onPress={() => change(i.id, -1)} style={s.qtyBtn}><Text style={s.strong}>−</Text></Pressable>
                <Text style={[s.strong, { minWidth: 22, textAlign: "center" }]}>{qty[i.id] ?? 0}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${i.name}`} onPress={() => change(i.id, 1)} style={s.qtyBtn}><Text style={s.strong}>+</Text></Pressable>
              </View>
            </View>
          )}
        />
        <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.line }}>
          <TextInput accessibilityLabel="Note for the kitchen" placeholder="Note for the kitchen (optional)" placeholderTextColor={c.muted} value={note} onChangeText={setNote} maxLength={300} style={s.input} />
          <Button
            title={busy ? "Sending…" : chosen.length ? `Send ${chosen.reduce((n, [, q]) => n + q, 0)} items · ${formatINR(total)} + GST` : "Choose dishes"}
            disabled={busy || chosen.length === 0}
            onPress={async () => {
              setBusy(true); setError(null);
              try { await onSubmit(chosen.map(([menuItemId, q]) => ({ menuItemId, qty: q })), note); }
              catch (e) { setError(e instanceof Error ? e.message : "Could not send the order."); setBusy(false); }
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = (c: Colors) => StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  title: { fontSize: 22, fontWeight: "800", color: c.ink, flex: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: c.ink },
  amount: { fontSize: 17, fontWeight: "800", color: c.ink },
  chip: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  chipText: { color: c.ink, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  strong: { color: c.ink, fontWeight: "800", fontSize: 15 },
  value: { color: c.ink, fontSize: 14 },
  muted: { color: c.muted, fontSize: 13 },
  error: { color: c.nonveg, paddingHorizontal: 16, fontWeight: "600" },
  notice: { color: c.good, paddingHorizontal: 16, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, color: c.ink, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, fontSize: 16 },
  qtyBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
});
