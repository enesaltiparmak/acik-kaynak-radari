import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSnapshot, growth } from './lib.mjs';

const repo = (stars) => ({ id: 'a/b', stars, forks: 1, issues: 2 });

test('mergeSnapshot aynı günü tekrar yazınca çift kayıt oluşturmaz', () => {
  let h = mergeSnapshot(null, '2026-10-28', [repo(10)]);
  h = mergeSnapshot(h, '2026-10-29', [repo(12)]);
  h = mergeSnapshot(h, '2026-10-29', [repo(13)]);
  assert.deepEqual(h.repos['a/b'].map((p) => p[1]), [10, 13]);
});

test('mergeSnapshot 400 günden eski ölçümleri atar', () => {
  let h = mergeSnapshot(null, '2025-01-01', [repo(1)]);
  h = mergeSnapshot(h, '2026-10-29', [repo(2)]);
  assert.deepEqual(h.repos['a/b'].map((p) => p[0]), ['2026-10-29']);
});

test('growth 7 gün önceki ölçümle, yoksa en eskiyle karşılaştırır', () => {
  const pts = [
    ['2026-10-20', 10, 1, 1],
    ['2026-10-22', 15, 1, 1],
    ['2026-10-29', 30, 1, 1],
  ];
  assert.deepEqual(growth(pts, 7, '2026-10-29'), { delta: 15, spanDays: 7 });
  assert.deepEqual(growth(pts, 30, '2026-10-29'), { delta: 20, spanDays: 9 });
});

test('growth tek ölçümde karşılaştırma yapmaz', () => {
  assert.equal(growth([['2026-10-29', 30, 1, 1]], 7).delta, null);
});
