import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useColors } from './theme';
export function Icon({ name, color, size = 22 }: { name: 'arrow' | 'order' | 'people' | 'check' | 'back' | 'refresh'; color: string; size?: number }) {
  const paths = { arrow: 'M4 12h15m-6-6 6 6-6 6', order: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 5h6m-6 4h6', people: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-3a6 6 0 0 1 12 0v3m3-8a5 5 0 0 1 5 5v3', check: 'm5 12 4 4L19 6', back: 'm14 5-7 7 7 7', refresh: 'M20 7v5h-5M4 17v-5h5m10-5a8 8 0 0 0-14 2m0 8a8 8 0 0 0 14-2' };
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden={true}><Path d={paths[name]} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}
export function Brand() {
  const c = useColors();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Svg width={32} height={32} viewBox="0 0 32 32" aria-hidden={true}><Rect width={32} height={32} rx={10} fill={c.accent}/><Path d="M9 12h14M16 8v13c0 3 4 3 5 1" stroke={c.accentInk} strokeWidth={2.8} strokeLinecap="round"/><Circle cx={10} cy={21} r={2} fill={c.accentInk}/></Svg><Text style={{ fontSize: 27, fontWeight: '800', letterSpacing: -1, color: c.ink }}>tabletap<Text style={{ color: c.accent }}>.</Text></Text></View>;
}
export function Button({ title, onPress, disabled, secondary, style }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; style?: ViewStyle }) {
  const c = useColors();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ minHeight: 48, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, backgroundColor: secondary ? c.soft : c.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .45 : pressed ? .75 : 1 }, style]}><Text style={{ color: secondary ? c.ink : c.accentInk, fontWeight: '700', fontSize: 15 }}>{title}</Text></Pressable>;
}
