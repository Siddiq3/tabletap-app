import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, Vibration, View } from 'react-native';
import type { StaffCall } from './contract';
import { api } from './lib/api';
import { DEMO_MODE, demoStore } from './lib/demo-store';
import { subscribeToOrders } from './lib/feed';
import { useCallSound } from './useCallSound';
import { useColors } from './theme';
import { Button, Icon } from './ui';

export function StaffCalls({ restaurantId }: { restaurantId: string }) {
  const c = useColors();
  const sound = useCallSound();
  const [calls, setCalls] = useState<StaffCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const load = useCallback(async () => {
    try {
      const { calls } = await api.staffCalls();
      if (calls.some(call => !seen.current.has(call.id))) { Vibration.vibrate([0, 250, 100, 250]); sound.notify(); }
      calls.forEach(call => seen.current.add(call.id));
      setCalls(calls); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load guest calls. Retrying…'); }
  }, [sound.notify]);
  useEffect(() => {
    void load(); const unsubscribe = subscribeToOrders(restaurantId, () => void load(), 'staff-calls');
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 5000);
    const active = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { unsubscribe(); clearInterval(timer); active.remove(); };
  }, [restaurantId, load]);
  async function resolve(id: string) {
    setBusy(id);
    try { await api.resolveStaffCall(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update this call.'); }
    finally { setBusy(null); }
  }
  return <View style={{ padding: 16, backgroundColor: c.soft, borderRadius: 14, gap: 12, marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon name="people" color={c.ink}/><Text accessibilityRole="header" style={{ color: c.ink, fontSize: 18, fontWeight: '700' }}>Guest calls ({calls.length})</Text></View>
    <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 12 }}>{calls.length ? `${calls.length} table${calls.length === 1 ? '' : 's'} waiting for assistance.` : 'No tables waiting for assistance.'}</Text>
    <Button secondary title={sound.enabled ? 'Call sound on · mute' : 'Enable call sound'} onPress={() => void sound.toggle()}/>
    {sound.error && <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 12 }}>{sound.error}</Text>}
    {error && <Text accessibilityRole="alert" style={{ color: c.nonveg }}>{error}</Text>}
    {calls.map(call => <View key={call.id} style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, gap: 12 }}><Text style={{ color: c.ink, fontWeight: '700', fontSize: 17 }}>Table {call.tableLabel.replace(/^T(?=\d)/, '')} needs assistance</Text><Button title={busy === call.id ? 'Saving…' : 'Mark handled'} disabled={busy === call.id} onPress={() => void resolve(call.id)}/></View>)}
    {DEMO_MODE && <Button secondary title="Simulate guest calling staff" onPress={() => { void demoStore.requestStaffCall().then(() => load()).catch(e => setError(e.message)); }}/> }
  </View>;
}
