// Live order signal; same contract as web/src/lib/feed.ts.
import { getSupabase } from "./auth";

import { DEMO_MODE } from "./demo-store";

export function subscribeToOrders(restaurantId: string, onChange: () => void, scope = "orders"): () => void {
  if (DEMO_MODE) return () => {};
  const supabase = getSupabase();
  const channel = supabase
    .channel(`${scope}:${restaurantId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "staff_calls", filter: `restaurant_id=eq.${restaurantId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
