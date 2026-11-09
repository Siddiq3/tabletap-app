import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { getToken } from "../src/lib/auth";
import { useColors } from "../src/theme";

export default function Start() {
  const c = useColors();
  const [target, setTarget] = useState<"/orders" | "/login" | null>(null);

  useEffect(() => {
    getToken().then((t) => setTarget(t ? "/orders" : "/login"));
  }, []);

  if (target) return <Redirect href={target} />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}
