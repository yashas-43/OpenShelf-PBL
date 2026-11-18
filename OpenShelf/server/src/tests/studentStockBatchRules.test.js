import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStudentStockBatch } from '../services/studentStockBatchRules.js';

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';

test('batch accepts different textbooks with independent quantities and stock snapshots', () => {
  assert.deepEqual(validateStudentStockBatch([
    { id: A, totalCopies: 3, expectedTotalCopies: 0 },
    { id: B, totalCopies: 2, expectedTotalCopies: 1 }
  ]), [
    { id: A, totalCopies: 3, expectedTotalCopies: 0 },
    { id: B, totalCopies: 2, expectedTotalCopies: 1 }
  ]);
});

test('batch rejects duplicate records even if the casing of the id differs', () => {
  assert.throws(() => validateStudentStockBatch([
    { id: A, totalCopies: 1, expectedTotalCopies: 0 },
    { id: A.toUpperCase(), totalCopies: 2, expectedTotalCopies: 0 }
  ]), /only once/);
});

test('batch rejects malformed ids and invalid quantities before any database transaction', () => {
  assert.throws(() => validateStudentStockBatch([{ id: 'bad', totalCopies: 3, expectedTotalCopies: 0 }]), /identifier/);
  for (const totalCopies of [-1, 1.5, 10001, NaN, '3', null]) {
    assert.throws(() => validateStudentStockBatch([
      { id: A, totalCopies, expectedTotalCopies: 0 }
    ]), /whole numbers/);
  }
  assert.throws(() => validateStudentStockBatch([{ id: A, totalCopies: 3, expectedTotalCopies: -1 }]), /whole numbers/);
});

test('batch rejects empty and oversized submissions', () => {
  assert.throws(() => validateStudentStockBatch([]), /between 1 and 100/);
  assert.throws(() => validateStudentStockBatch(Array(101).fill({ id: A, totalCopies: 3, expectedTotalCopies: 0 })), /between 1 and 100/);
});
