import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(saved = null) {
  const app = { innerHTML: '', querySelectorAll: () => [] };
  const context = vm.createContext({
    document: { querySelector: () => app, addEventListener() {} },
    window: { addEventListener() {} },
    location: { hash: '' },
    localStorage: { getItem: () => saved, setItem() {} },
    Intl, Date, Math, FormData,
  });
  vm.runInContext(readFileSync(new URL('../../docs/live-demo.js', import.meta.url), 'utf8'), context);
  return code => vm.runInContext(code, context);
}

test('public demo rejects premature and repeated reserve release', () => {
  const run = load();
  run('actions.create(); actions.approve(); actions.settle()');
  assert.equal(run('state.order.status'), 'awaiting_payment');
  assert.equal(run('state.reserve.available'), 75000);
  run('actions.confirm(); actions.approve()');
  const available = run('state.reserve.available');
  run('actions.approve(); actions.confirm(); actions.settle(); actions.settle()');
  assert.equal(run('state.order.status'), 'settled');
  assert.equal(run('state.reserve.available'), available);
  assert.equal(run('state.settlements.length'), 1);
});

test('public demo retains an unfinished order and validates amount', () => {
  const run = load();
  run('createOrder(new FormData())');
  const id = run('state.order.id');
  run('actions.create()');
  assert.equal(run('state.order.id'), id);
  run('actions.reset(); const form = new FormData(); form.set("amount", "NaN"); createOrder(form)');
  assert.equal(run('state.order'), null);
});

test('public demo recovers malformed storage', () => {
  assert.equal(load('{broken')('state.reserve.available'), 75000);
  assert.equal(load('{"order":{}}')('state.order'), null);
});
