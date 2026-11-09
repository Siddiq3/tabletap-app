import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { formatINR, upiLink, type Order, type Restaurant } from "./contract";

type Props = {
  order: Order | null;
  restaurant: Restaurant;
  busy: boolean;
  error: string | null;
  onMarkPaid: (order: Order) => void;
  onClose: () => void;
};

/** Full screen, black on white whatever the phone theme, so the guest's UPI app can scan it. */
export function UpiQrModal({ order, restaurant, busy, error, onMarkPaid, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - 64, height * 0.45, 380);

  return (
    <Modal visible={!!order} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {order && (
        <SafeAreaView style={s.screen}>
          <View style={s.body}>
            <Text style={s.amount}>{formatINR(order.totalPaise)}</Text>
            <Text style={s.meta}>Order #{order.orderNo} · {order.tableLabel ?? "No table"}</Text>
            {restaurant.upiId ? (
              <>
                <View style={s.qr}>
                  {/* Amount comes from the API's totalPaise, never recalculated here. */}
                  <QRCode value={upiLink(restaurant.upiId, restaurant.name, order.totalPaise, `Order ${order.orderNo}`)} size={size} />
                </View>
                <Text style={s.upi} selectable>UPI ID: {restaurant.upiId}</Text>
                <Text style={s.hint}>After paying, show your payment screen to the staff.</Text>
              </>
            ) : (
              <Text style={s.hint}>No UPI ID yet. Ask the owner to add one in Settings on the web dashboard.</Text>
            )}
          </View>
          <View style={s.actions}>
            {error && <Text style={s.error}>{error}</Text>}
            {restaurant.upiId && (
              <Pressable disabled={busy} style={[s.btn, s.primary, busy && { opacity: 0.6 }]} onPress={() => onMarkPaid(order)}>
                <Text style={s.primaryText}>{busy ? "Saving…" : "Mark UPI paid"}</Text>
              </Pressable>
            )}
            <Pressable style={s.btn} onPress={onClose}>
              <Text style={s.btnText}>Close</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  amount: { fontSize: 44, fontWeight: "800", color: "#16211D" },
  meta: { fontSize: 16, color: "#5E6B66", fontWeight: "600" },
  qr: { padding: 16, backgroundColor: "#FFFFFF" },
  upi: { fontSize: 16, color: "#16211D", fontWeight: "700" },
  hint: { fontSize: 16, color: "#16211D", textAlign: "center", fontWeight: "600" },
  actions: { padding: 16, gap: 10 },
  error: { color: "#B3261E", fontWeight: "600", textAlign: "center" },
  btn: { borderWidth: 1, borderColor: "#D6DDDA", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { fontWeight: "800", fontSize: 16, color: "#16211D" },
  primary: { backgroundColor: "#D2412A", borderColor: "#D2412A" },
  primaryText: { fontWeight: "800", fontSize: 16, color: "#FFFFFF" },
});
