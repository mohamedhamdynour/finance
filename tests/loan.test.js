import test from 'node:test';
import assert from 'node:assert/strict';
import { calcLoan, monthsToGoal } from '../js/domain/loan.js';

test('zero-interest loan creates a complete schedule', () => {
  const loan = calcLoan(12000, 0, 12);
  assert.ok(loan);
  assert.equal(loan.schedule.length, 12);
  assert.equal(loan.schedule[0].principal, 1000);
  assert.equal(loan.schedule.at(-1).balance, 0);
  assert.ok(Math.abs(loan.schedule.reduce((sum, row) => sum + row.principal, 0) - 12000) < 0.01);
});

test('interest-bearing loan schedule has finite values and reaches zero balance', () => {
  const loan = calcLoan(100000, 12, 36);
  assert.ok(loan);
  assert.equal(loan.schedule.length, 36);
  assert.ok(loan.schedule.every(row => Number.isFinite(row.payment) && Number.isFinite(row.interest) && Number.isFinite(row.principal)));
  assert.equal(loan.schedule.at(-1).balance, 0);
  assert.ok(loan.totalPayment > loan.principal);
});

test('invalid loan inputs are rejected', () => {
  assert.equal(calcLoan(0, 10, 12), null);
  assert.equal(calcLoan(1000, -1, 12), null);
  assert.equal(calcLoan(1000, 10, 0), null);
});

test('goal already reached returns zero months', () => {
  assert.deepEqual(monthsToGoal(1000, 100, 5, 1000), { months: 0, reached: true, finalBalance: 1000 });
});

test('unreachable goal is not incorrectly marked as reached after the calculation cap', () => {
  const result = monthsToGoal(1000, 0, 0, 100);
  assert.equal(result.months, 1200);
  assert.equal(result.reached, false);
  assert.equal(result.finalBalance, 100);
});

test('goal calculation handles invalid saving inputs without looping', () => {
  const result = monthsToGoal(1000, -10, 5, 100);
  assert.equal(result.reached, false);
  assert.equal(result.months, 0);
});
