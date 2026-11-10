import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../src/lib/api';
import { setSession } from '../src/lib/auth';
import { DEMO_MODE, DEMO_PASSWORD } from '../src/lib/demo-store';
import { useColors } from '../src/theme';
import { Brand, Button, Icon } from '../src/ui';

export default function Login() {
  const c = useColors();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function login(sample = false) {
    setBusy(true); setError(null); setNotice(null);
    try {
      if (forgot && !sample) setNotice((await api.forgotPassword(identifier.trim())).message);
      else {
        const { session } = await api.login({ identifier: sample ? 'demo' : identifier.trim(), password: sample ? DEMO_PASSWORD : password });
        await setSession(session); router.replace('/orders');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not log in. Try again.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled"><View style={s.content}>
      <Brand />
      <View style={[s.intro, { backgroundColor: c.soft }]}><View style={s.introTop}><Icon name="order" color={c.good} size={28}/><Text style={{ color: c.muted, fontSize: 12 }}>Made for your team</Text></View><Text style={[s.hero, { color: c.ink }]}>Good service.{"\n"}Starts here.</Text><Text style={[s.copy, { color: c.muted }]}>From the first order to the last table. Keep your whole team in sync.</Text></View>
      <View style={{ gap: 20 }}><View><Text accessibilityRole="header" style={[s.title, { color: c.ink }]}>{forgot ? 'Reset your password' : 'Welcome back.'}</Text><Text style={{ color: c.muted, marginTop: 8, fontSize: 14 }}>{forgot ? 'We’ll help you get back to your restaurant.' : 'Log in to your restaurant to start your shift.'}</Text></View>
        <View style={{ gap: 8 }}><Text style={[s.label, { color: c.ink }]}>Email, phone or username</Text><TextInput accessibilityLabel="Email, phone or username" style={[s.input, { backgroundColor: c.surface, borderColor: c.line, color: c.ink }]} value={identifier} onChangeText={setIdentifier} placeholder="Your login" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username"/></View>
        {!forgot && <View style={{ gap: 8 }}><Text style={[s.label, { color: c.ink }]}>Password</Text><TextInput accessibilityLabel="Password" style={[s.input, { backgroundColor: c.surface, borderColor: c.line, color: c.ink }]} value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={c.muted} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={() => { if (identifier && password && !busy) void login(); }}/></View>}
        {error && <Text accessibilityRole="alert" style={{ color: c.nonveg, fontWeight: '600' }}>{error}</Text>}
        {notice && <Text accessibilityLiveRegion="polite" style={{ color: c.ink }}>{notice}</Text>}
        <Button title={busy ? 'Please wait…' : forgot ? 'Send reset link' : 'Log in'} disabled={busy || !identifier.trim() || (!forgot && !password)} onPress={() => void login()}/>
        <Pressable accessibilityRole="button" onPress={() => { setForgot(!forgot); setError(null); setNotice(null); }} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.muted, fontWeight: '600' }}>{forgot ? 'Back to login' : 'Forgot password?'}</Text></Pressable>
      </View>
      {DEMO_MODE && <View style={[s.demo, { backgroundColor: c.soft }]}><Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>Take a look around.</Text><Text style={{ color: c.muted, fontSize: 13, lineHeight: 21 }}>Explore a sample restaurant with orders and staff. Nothing here is a real order or payment.</Text><Button secondary title="Open sample restaurant" disabled={busy} onPress={() => void login(true)}/></View>}
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' }}>Owners and managers log in first. Staff can then use their PIN. New restaurant? Create your account on the Tabletap website.</Text>
    </View></ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 24, alignItems: 'center' }, content: { width: '100%', maxWidth: 460, gap: 28, paddingBottom: 20 },
  intro: { padding: 25, borderRadius: 20, gap: 18 }, introTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { fontSize: 36, fontWeight: '800', lineHeight: 41, letterSpacing: -1 }, copy: { fontSize: 14, lineHeight: 22, maxWidth: 320 },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -.6 }, label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, padding: 15, fontSize: 16, minHeight: 52 }, demo: { padding: 20, borderRadius: 16, gap: 12 },
});
