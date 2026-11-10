/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoStore } from '../src/lib/demo-store';
import { ApiError } from '../src/contract';
const login = async () => { const store = new DemoStore(); await store.login({ identifier: 'demo', password: 'tabletap123' }); return store; };

test('sample data requires login and uses verified sample owner without a payment destination', async () => {
  const store = new DemoStore();
  await assert.rejects(store.board(), e => e instanceof ApiError && e.status === 401);
  await assert.rejects(store.login({ identifier: 'someone', password: 'wrong' }));
  await store.login({ identifier: 'demo', password: 'tabletap123' });
  const me = await store.me();
  assert.equal(me.profile?.emailVerified, true);
  assert.equal(me.membership?.restaurant.upiId, null);
  const { orders } = await store.board();
  assert.equal(orders.length, 6);
  assert.deepEqual(orders.map(o => o.status), ['new', 'new', 'preparing', 'preparing', 'ready', 'served']);
  for (const order of orders) assert.equal(order.totalPaise, order.lines.reduce((sum, l) => sum + l.qty * l.unitPricePaise, 0) + order.taxPaise);
});
test('orders move through the full lifecycle; invalid transitions and unknown IDs fail', async () => {
  const store = await login();
  await assert.rejects(store.moveOrder('demo-order-1', 'served'));
  for (const stage of ['preparing', 'ready', 'served'] as const) await store.moveOrder('demo-order-1', stage);
  assert.equal((await store.board()).orders[0].status, 'served');
  await assert.rejects(store.moveOrder('demo-order-1', 'new'));
  await assert.rejects(store.moveOrder('missing', 'preparing'));
});
test('kitchen and waiter cannot record payments; cashier payments include attribution', async () => {
  const store = await login();
  for (const staffId of ['demo-kitchen', 'demo-waiter']) {
    const { token } = await store.startPinSession({ staffId, pin: '1234' });
    await assert.rejects(store.markPaid('demo-order-1', 'cash', token), e => e instanceof ApiError && e.status === 403);
  }
  const { token } = await store.startPinSession({ staffId: 'demo-cashier', pin: '1234' });
  await store.markPaid('demo-order-1', 'cash', token);
  const order = (await store.board()).orders[0];
  assert.equal(order.paymentStatus, 'paid'); assert.equal(order.paymentMethod, 'cash'); assert.equal(order.paidByName, 'Meera');
  await assert.rejects(store.markPaid(order.id, 'upi', token));
  await assert.rejects(store.markPaid('missing', 'upi', token));
});
test('incorrect PINs fail and five attempts lock the sample staff member', async () => {
  const store = await login();
  for (let i = 0; i < 5; i++) await assert.rejects(store.startPinSession({ staffId: 'demo-cashier', pin: '0000' }));
  await assert.rejects(store.startPinSession({ staffId: 'demo-cashier', pin: '1234' }), e => e instanceof ApiError && e.status === 429);
  store.reset(); assert.ok((await store.startPinSession({ staffId: 'demo-cashier', pin: '1234' })).token);
});
test('board responses cannot mutate fixtures; reset restores orders; logout revokes sample access', async () => {
  const store = await login();
  const { orders } = await store.board(); orders[0].lines[0].qty = 99;
  assert.equal((await store.board()).orders[0].lines[0].qty, 2);
  await store.markPaid('demo-order-1', 'upi'); await store.moveOrder('demo-order-1', 'preparing');
  store.reset(); assert.equal((await store.board()).orders[0].paymentStatus, 'unpaid'); assert.equal((await store.board()).orders[0].status, 'new');
  store.signOut(); await assert.rejects(store.me()); await assert.rejects(store.board());
});

test('sample guest calls coalesce, reach the staff inbox and can be handled', async () => {
  const store = await login();
  const first = await store.requestStaffCall();
  const repeat = await store.requestStaffCall();
  assert.equal(first.call.id, repeat.call.id);
  assert.equal((await store.staffCalls()).calls.length, 1);
  await store.resolveStaffCall(first.call.id);
  assert.equal((await store.staffCalls()).calls.length, 0);
  await assert.rejects(store.resolveStaffCall(first.call.id));
  store.signOut(); await assert.rejects(store.staffCalls());
});
