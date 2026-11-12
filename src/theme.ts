import { useColorScheme } from 'react-native';
const light = {
  // 60-30-10, same as the website: light surfaces, curry-leaf green text, turmeric for the main action.
  bg: '#F6F8F6', surface: '#FFFFFF', ink: '#0B2A20', muted: '#56675F', line: '#DBE3DD', soft: '#EEF2EE',
  accent: '#F4B400', accentInk: '#0B2A20', turmeric: '#F4B400', info: '#2F6FB0',
  veg: '#35713E', nonveg: '#B3261E', good: '#35713E', warn: '#93600F',
};
const dark: typeof light = {
  bg: '#0B1F18', surface: '#12291F', ink: '#F2F5EF', muted: '#9FB1A8', line: '#24423A', soft: '#173126',
  accent: '#F4B400', accentInk: '#0B2A20', turmeric: '#F4B400', info: '#8BB7EF',
  veg: '#83D396', nonveg: '#FF9B91', good: '#83D396', warn: '#F0C27A',
};
export type Colors = typeof light;
export function useColors(): Colors { return useColorScheme() === 'dark' ? dark : light; }
