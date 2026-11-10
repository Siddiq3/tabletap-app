import { ApiError, canMoveTo, type AuthResponse, type LoginRequest, type MeResponse, type Order, type OrderStatus, type PaymentMethod, type PinSessionRequest, type PinSessionResponse, type StaffCall, type StaffMember } from '../contract';

export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const DEMO_PASSWORD = 'tabletap123';
export const DEMO_PIN = '1234';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const staff: StaffMember[] = [
  { id: 'demo-kitchen', name: 'Arjun', role: 'kitchen', isActive: true },
  { id: 'demo-cashier', name: 'Meera', role: 'cashier', isActive: true },
  { id: 'demo-waiter', name: 'Riya', role: 'waiter', isActive: true },
];
function seedOrders(): Order[] {
  const rows = [
    { table: 'T7', status: 'new', age: 2, dishes: [['Paneer tikka bowl', 24000, 2, true], ['Classic cold coffee', 12000, 1, true]], note: 'Less spicy, please.', paid: false },
    { table: 'T3', status: 'new', age: 4, dishes: [['Butter chicken', 32000, 1, false], ['Garlic naan', 6000, 2, true]], note: null, paid: false },
    { table: 'T2', status: 'preparing', age: 9, dishes: [['Garden goodness bowl', 24000, 1, true], ['Lemon iced tea', 9000, 2, true]], note: 'Dressing on the side.', paid: true },
    { table: 'T5', status: 'preparing', age: 12, dishes: [['Margherita pizza', 28000, 1, true]], note: null, paid: false },
    { table: 'T1', status: 'ready', age: 15, dishes: [['Masala dosa', 14000, 2, true], ['Filter coffee', 6000, 2, true]], note: null, paid: false },
    { table: 'T4', status: 'served', age: 24, dishes: [['Veg biryani', 22000, 2, true]], note: null, paid: true },
  ] as const;
  return rows.map((row, i) => {
    const lines = row.dishes.map(([name, unitPricePaise, qty, isVeg]) => ({ name, unitPricePaise, qty, isVeg }));
    const subtotalPaise = lines.reduce((sum, line) => sum + line.unitPricePaise * line.qty, 0);
    const taxPaise = Math.round(subtotalPaise * .05);
    return { id: `demo-order-${i + 1}`, orderNo: 1041 + i, tableId: `demo-${row.table}`, tableLabel: row.table, status: row.status, paymentStatus: row.paid ? 'paid' : 'unpaid', paymentMethod: row.paid ? 'upi' : null, note: row.note, subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise, createdAt: new Date(Date.now() - row.age * 60000).toISOString(), lines };
  });
}

/** In-memory fixtures only. No fetch, Supabase client, payment URI, or real credentials. */
export class DemoStore {
  signedIn = false;
  private calls: StaffCall[] = [];
  private orders = seedOrders();
  private sessions = new Map<string, StaffMember>();
  private failures = new Map<string, number>();
  private serial = 0;
  reset() { this.calls = []; this.orders = seedOrders(); this.failures.clear(); }
  private requireLogin() { if (!this.signedIn) throw new ApiError(401, 'Open the sample restaurant to continue.'); }
  async login(input: LoginRequest): Promise<AuthResponse> {
    if (input.identifier !== 'demo' || input.password !== DEMO_PASSWORD) throw new ApiError(401, 'Use demo and tabletap123 for the sample restaurant.');
    this.signedIn = true;
    return { session: { accessToken: 'demo-only-token', refreshToken: 'demo-only-refresh' } };
  }
  async me(): Promise<MeResponse> {
    this.requireLogin();
    return { userId: 'demo-owner', profile: { fullName: 'Ananya Sharma', username: 'demo', email: 'owner@example.test', phone: null, emailVerified: true }, membership: { role: 'owner', restaurant: { id: 'demo-restaurant', slug: 'the-green-table', name: 'The Green Table', address: 'Sample restaurant', upiId: null, taxPercent: 5, plan: 'trial' } } };
  }
  async staffCalls() { this.requireLogin(); return { calls: clone(this.calls.filter(c => !c.resolvedAt)) }; }
  async requestStaffCall() {
    this.requireLogin();
    const existing = this.calls.find(c => !c.resolvedAt && c.tableId === 'demo-T7');
    if (existing) return { call: clone(existing) };
    const call: StaffCall = { id: `demo-call-${++this.serial}`, tableId: 'demo-T7', tableLabel: 'T7', createdAt: new Date().toISOString(), resolvedAt: null };
    this.calls.push(call); return { call: clone(call) };
  }
  async resolveStaffCall(id: string) {
    this.requireLogin();
    const call = this.calls.find(c => c.id === id && !c.resolvedAt);
    if (!call) throw new ApiError(404, 'This call was already handled.');
    call.resolvedAt = new Date().toISOString(); return null;
  }
  async board() { this.requireLogin(); return { orders: clone(this.orders) }; }
  async staffList() { this.requireLogin(); return { staff: clone(staff) }; }
  async startPinSession(input: PinSessionRequest): Promise<PinSessionResponse> {
    this.requireLogin();
    const person = staff.find(s => s.id === input.staffId);
    if (!person) throw new ApiError(404, 'Staff member not found.');
    const failures = this.failures.get(person.id) ?? 0;
    if (failures >= 5) throw new ApiError(429, 'Sample PIN locked. Reset sample data to try again.');
    if (input.pin !== DEMO_PIN) { this.failures.set(person.id, failures + 1); throw new ApiError(403, 'Incorrect PIN. The sample PIN is 1234.'); }
    this.failures.delete(person.id);
    const token = `demo-session-${++this.serial}`;
    this.sessions.set(token, person);
    return { token, staff: clone(person), expiresAt: new Date(Date.now() + 3600000).toISOString() };
  }
  private person(token: string | null) {
    this.requireLogin();
    if (!token) return null;
    const person = this.sessions.get(token);
    if (!person) throw new ApiError(403, 'Sample session ended.', 'STAFF_SESSION');
    return person;
  }
  async moveOrder(id: string, to: OrderStatus, token: string | null = null) {
    this.person(token);
    const order = this.orders.find(o => o.id === id);
    if (!order) throw new ApiError(404, 'Order not found.');
    if (!canMoveTo(order.status, to)) throw new ApiError(409, 'This order cannot move to that stage.');
    order.status = to;
    return null;
  }
  async markPaid(id: string, method: PaymentMethod, token: string | null = null) {
    const person = this.person(token);
    if (person && !['manager', 'cashier'].includes(person.role)) throw new ApiError(403, 'Only an owner, manager, or cashier can record payments.');
    const order = this.orders.find(o => o.id === id);
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.paymentStatus === 'paid') throw new ApiError(409, 'This order is already paid.');
    if (!['cash', 'upi'].includes(method)) throw new ApiError(400, 'Choose cash or UPI in the sample restaurant.');
    Object.assign(order, { paymentStatus: 'paid', paymentMethod: method, paidByName: person?.name ?? null });
    return null;
  }
  signOut() { this.signedIn = false; this.sessions.clear(); }
}
export const demoStore = new DemoStore();
