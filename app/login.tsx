import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { sendLoginCode, verifyLoginCode } from "../src/lib/auth";
import { useColors } from "../src/theme";

export default function Login() {
  const c = useColors();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = [styles.input, { borderColor: c.line, backgroundColor: c.soft, color: c.ink }];
  const disabled = busy || (step === "email" ? !email.includes("@") : code.length < 6);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <Text style={[styles.brand, { color: c.accent }]}>Tabletap</Text>
        <Text style={[styles.title, { color: c.ink }]}>Staff login</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          {step === "email" ? (
            <>
              <Text style={[styles.label, { color: c.ink }]}>Email</Text>
              <TextInput
                style={input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@restaurant.com"
                placeholderTextColor={c.muted}
              />
              <Text style={{ color: c.muted, fontSize: 13 }}>We email you a 6-digit code. No password.</Text>
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: c.ink }]}>Code sent to {email}</Text>
              <TextInput
                style={[input, { letterSpacing: 6, fontSize: 22 }]}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </>
          )}
          {error && <Text style={{ color: c.nonveg, fontWeight: "600" }}>{error}</Text>}
          <Pressable
            disabled={disabled}
            style={[styles.btn, { backgroundColor: c.accent, opacity: disabled ? 0.5 : 1 }]}
            onPress={() =>
              void run(async () => {
                if (step === "email") {
                  await sendLoginCode(email.trim());
                  setStep("code");
                } else {
                  await verifyLoginCode(email.trim(), code);
                  router.replace("/orders");
                }
              })
            }
          >
            <Text style={[styles.btnText, { color: c.accentInk }]}>
              {busy ? "Please wait…" : step === "email" ? "Send login code" : "Log in"}
            </Text>
          </Pressable>
          {step === "code" && (
            <Pressable onPress={() => { setStep("email"); setCode(""); }}>
              <Text style={{ color: c.muted, textAlign: "center", fontWeight: "600" }}>Use a different email</Text>
            </Pressable>
          )}
        </View>
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
