import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { isValidPin, type StaffMember } from "./contract";
import { api, confirmPassword } from "./lib/api";
import { startStaffSession } from "./lib/staff-mode";
import { useColors, type Colors } from "./theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** "Who's working?": staff tap their name, then enter their PIN. The device owner can continue with their password. */
export function StaffLock({ staff, onOwner }: { staff: StaffMember[]; onOwner: () => void }) {
  const c = useColors();
  const s = makeStyles(c);
  const [picked, setPicked] = useState<StaffMember | "owner" | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => { setPicked(null); setPin(""); setError(null); };

  async function submit() {
    if (!picked || picked === "owner" || !isValidPin(pin)) return;
    setBusy(true);
    setError(null);
    try {
      startStaffSession(await api.startPinSession({ staffId: picked.id, pin }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setPin("");
      setBusy(false);
    }
  }

  if (!picked) {
    return (
      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.title}>Who's working?</Text>
        <View style={s.names}>
          {staff.map((m) => (
            <Pressable key={m.id} style={s.name} onPress={() => setPicked(m)} accessibilityRole="button">
              <Text style={s.nameText}>{m.name}</Text>
              <Text style={s.muted}>{m.role}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setPicked("owner")} style={s.ghost}>
          <Text style={s.ghostText}>Continue as owner</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (picked === "owner") {
    return (
      <View style={s.wrap}>
        <PasswordForm title="Continue as owner" onDone={onOwner} onCancel={back} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>Hi {picked.name}, enter your PIN</Text>
      <View style={s.dots} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[s.dot, i < pin.length && { backgroundColor: c.ink, borderColor: c.ink }]} />
        ))}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <View style={s.pad}>
        {KEYS.map((k, i) =>
          k ? (
            <Pressable
              key={i}
              disabled={busy}
              style={s.key}
              accessibilityLabel={k === "⌫" ? "Delete" : k}
              onPress={() => setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 6 ? p + k : p))}
            >
              <Text style={s.keyText}>{k}</Text>
            </Pressable>
          ) : <View key={i} style={[s.key, { borderWidth: 0, backgroundColor: "transparent" }]} />,
        )}
      </View>
      <Pressable disabled={busy || !isValidPin(pin)} style={[s.btn, { opacity: busy || !isValidPin(pin) ? 0.5 : 1 }]} onPress={() => void submit()}>
        <Text style={s.btnText}>{busy ? "Checking…" : "Start"}</Text>
      </Pressable>
      <Pressable onPress={back} style={s.ghost}>
        <Text style={s.ghostText}>Not {picked.name}?</Text>
      </Pressable>
    </ScrollView>
  );
}

/** The device account's password: "Continue as owner" and turning the PIN lock off. */
export function PasswordForm({ title, onDone, onCancel }: { title: string; onDone: () => void; onCancel: () => void }) {
  const c = useColors();
  const s = makeStyles(c);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await confirmPassword(password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wrong login or password.");
      setBusy(false);
    }
  }

  return (
    <View style={s.card}>
      <Text style={[s.title, { fontSize: 22, textAlign: "left" }]}>{title}</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoFocus
        placeholder="Your password"
        placeholderTextColor={c.muted}
        onSubmitEditing={() => void submit()}
      />
      {error && <Text style={[s.error, { textAlign: "left" }]}>{error}</Text>}
      <Pressable disabled={busy || !password} style={[s.btn, { opacity: busy || !password ? 0.5 : 1 }]} onPress={() => void submit()}>
        <Text style={s.btnText}>{busy ? "Checking…" : "Confirm"}</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={s.ghost}>
        <Text style={s.ghostText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { flexGrow: 1, padding: 20, gap: 16, justifyContent: "center" },
    title: { fontSize: 28, fontWeight: "800", color: c.ink, textAlign: "center" },
    muted: { color: c.muted, fontSize: 13 },
    names: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
    name: { minWidth: 150, flexGrow: 1, minHeight: 88, alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1.5, borderColor: c.line, backgroundColor: c.surface, borderRadius: 16, padding: 14 },
    nameText: { fontSize: 22, fontWeight: "800", color: c.ink },
    dots: { flexDirection: "row", gap: 12, justifyContent: "center" },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.line },
    pad: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", alignSelf: "center", width: 300 },
    key: { width: 90, height: 64, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    keyText: { fontSize: 24, fontWeight: "800", color: c.ink },
    error: { color: c.nonveg, fontWeight: "600", textAlign: "center" },
    btn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", alignSelf: "stretch" },
    btnText: { color: c.accentInk, fontWeight: "800", fontSize: 16 },
    ghost: { paddingVertical: 12, alignItems: "center" },
    ghostText: { color: c.muted, fontWeight: "700" },
    card: { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, borderRadius: 16, padding: 18, gap: 12 },
    input: { borderWidth: 1, borderColor: c.line, backgroundColor: c.soft, color: c.ink, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  });
}
