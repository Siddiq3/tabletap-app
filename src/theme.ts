import { useColorScheme } from 'react-native';
const light = {
  bg: '#F6F8F2', surface: '#FFFFFF', ink: '#203B31', muted: '#5B6E64', line: '#DDE5D7', soft: '#EAF0E5',
  accent: '#D2412A', accentInk: '#FFFFFF', turmeric: '#E3A21A', info: '#2F6FB0',
  veg: '#35713E', nonveg: '#B3261E', good: '#35713E', warn: '#93600F',
};
const dark: typeof light = {
  bg: '#101B15', surface: '#19281F', ink: '#EBF2E5', muted: '#A7B9AA', line: '#36483B', soft: '#24392A',
  accent: '#F8846C', accentInk: '#24100A', turmeric: '#F2B53A', info: '#8BB7EF',
  veg: '#83D396', nonveg: '#FF9B91', good: '#83D396', warn: '#F0C27A',
};
export type Colors = typeof light;
export function useColors(): Colors { return useColorScheme() === 'dark' ? dark : light; }
