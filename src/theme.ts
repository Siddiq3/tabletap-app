import { useColorScheme } from "react-native";

const light = {
  bg: "#EEF1EF", surface: "#FFFFFF", ink: "#16211D", muted: "#5E6B66", line: "#D6DDDA", soft: "#F6F8F7",
  accent: "#D2412A", accentInk: "#FFFFFF", turmeric: "#E3A21A", info: "#2F6FB0",
  veg: "#1E8A3E", nonveg: "#B3261E", good: "#1E8A3E", warn: "#B7791F",
};
const dark: typeof light = {
  bg: "#0F1513", surface: "#18211E", ink: "#E8EEEB", muted: "#93A19B", line: "#2A3632", soft: "#1E2925",
  accent: "#F0634A", accentInk: "#1A0C08", turmeric: "#F2B53A", info: "#6FA8E0",
  veg: "#4CC26F", nonveg: "#F07167", good: "#4CC26F", warn: "#E6A93C",
};

export type Colors = typeof light;
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
