// Live order signal; same contract as web/src/lib/feed.ts.
import { supabase } from "./auth";

export function subscribeToOrders(restaurantId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`orders:${restaurantId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
