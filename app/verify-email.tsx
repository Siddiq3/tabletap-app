import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ApiError, isValidEmailCode } from "../src/contract";
import { api } from "../src/lib/api";
import { signOut } from "../src/lib/auth";
import { useColors } from "../src/theme";

/** "Check your email": owners who signed up with an email enter the 6-digit code first. */
export default function VerifyEmail() {
  const c = useColors();
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.me()
      .then((me) => {
        if (!me.profile || me.profile.emailVerified) router.replace("/orders");
        else setEmail(me.profile.email);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else setError(e instanceof Error ? e.message : "Could not load your account.");
      });
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.retryAfterSeconds) setWait(e.retryAfterSeconds);
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const verify = () =>
    run(async () => {
      try {
        await api.verifyEmail(code);
      } catch (e) {
        setCode("");
        throw e;
      }
      router.replace("/orders");
    });

  const resend = () =>
    run(async () => {
      setWait((await api.resendCode()).retryAfterSeconds);
      setNotice("New code sent. Codes work for 10 minutes; only the newest one counts.");
    });

  const canVerify = !busy && isValidEmailCode(code);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <Text style={[styles.title, { color: c.ink }]}>Check your email</Text>
        <Text style={{ color: c.muted }}>
          {email ? `We sent a 6-digit code to ${email}.` : "We sent you a 6-digit code."} Enter it to continue.
        </Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <TextInput
            style={[styles.input, { borderColor: c.line, backgroundColor: c.soft, color: c.ink }]}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            accessibilityLabel="6-digit code"
            onSubmitEditing={() => { if (canVerify) void verify(); }}
          />
          {error && <Text style={{ color: c.nonveg, fontWeight: "600" }}>{error}</Text>}
          {notice && <Text style={{ color: c.ink, fontWeight: "600" }}>{notice}</Text>}
          <Pressable disabled={!canVerify} style={[styles.btn, { backgroundColor: c.accent, opacity: canVerify ? 1 : 0.5 }]} onPress={() => void verify()}>
            <Text style={[styles.btnText, { color: c.accentInk }]}>{busy ? "Please wait…" : "Verify"}</Text>
          </Pressable>
          <Pressable disabled={busy || wait > 0} onPress={() => void resend()} style={{ opacity: busy || wait > 0 ? 0.5 : 1 }}>
            <Text style={{ color: c.ink, textAlign: "center", fontWeight: "700" }}>
              {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={() => void signOut().then(() => router.replace("/login"))}>
          <Text style={{ color: c.muted, textAlign: "center", fontWeight: "600" }}>Use a different account</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, justifyContent: "center", gap: 12 },
  title: { fontSize: 30, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 22, letterSpacing: 6 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { fontWeight: "800", fontSize: 16 },
});
