import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { api } from "../src/lib/api";
import { setSession } from "../src/lib/auth";
import { useColors } from "../src/theme";

export default function Login() {
  const c = useColors();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = [styles.input, { borderColor: c.line, backgroundColor: c.soft, color: c.ink }];
  const disabled = busy || !identifier.trim() || (!forgot && !password);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <Text style={[styles.brand, { color: c.accent }]}>Tabletap</Text>
        <Text style={[styles.title, { color: c.ink }]}>{forgot ? "Reset password" : "Restaurant login"}</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.label, { color: c.ink }]}>Email, phone or username</Text>
          <TextInput
            style={input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />
          {!forgot && (
            <>
              <Text style={[styles.label, { color: c.ink }]}>Password</Text>
              <TextInput
                style={input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
              />
            </>
          )}
          {error && <Text style={{ color: c.nonveg, fontWeight: "600" }}>{error}</Text>}
          {notice && <Text style={{ color: c.ink, fontWeight: "600" }}>{notice}</Text>}
          <Pressable
            disabled={disabled}
            style={[styles.btn, { backgroundColor: c.accent, opacity: disabled ? 0.5 : 1 }]}
            onPress={() =>
              void run(async () => {
                if (forgot) {
                  setNotice((await api.forgotPassword(identifier.trim())).message);
                } else {
                  const { session } = await api.login({ identifier: identifier.trim(), password });
                  await setSession(session);
                  router.replace("/orders");
                }
              })
            }
          >
            <Text style={[styles.btnText, { color: c.accentInk }]}>
              {busy ? "Please wait…" : forgot ? "Send reset link" : "Log in"}
            </Text>
          </Pressable>
          <Pressable onPress={() => { setForgot(!forgot); setError(null); setNotice(null); }}>
            <Text style={{ color: c.muted, textAlign: "center", fontWeight: "600" }}>{forgot ? "Back to login" : "Forgot password?"}</Text>
          </Pressable>
        </View>
        <Text style={{ color: c.muted, textAlign: "center", fontSize: 13 }}>
          Owners and managers log in here. Staff tap their name and enter their PIN after the owner logs in on this phone.
          New restaurant? Sign up on the Tabletap website.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, justifyContent: "center", gap: 12 },
  brand: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontSize: 30, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  label: { fontWeight: "600", fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { fontWeight: "800", fontSize: 16 },
});
