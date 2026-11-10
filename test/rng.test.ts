/**
 * rng.test.ts — deterministický generátor náhodných čísel.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../engine/src/rng.ts";

test("Rng: stejný seed → identická posloupnost", () => {
  const a = new Rng(12345);
  const b = new Rng(12345);
  for (let i = 0; i < 200; i++) {
    assert.equal(a.next(), b.next());
  }
});

test("Rng: různé seedy → různé posloupnosti", () => {
  const a = new Rng(1);
  const b = new Rng(2);
  const ra = Array.from({ length: 10 }, () => a.next());
  const rb = Array.from({ length: 10 }, () => b.next());
  assert.notDeepEqual(ra, rb);
});

test("Rng: next() vrací hodnoty v [0, 1)", () => {
  const r = new Rng(42);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `mimo rozsah: ${v}`);
  }
});

test("Rng: int() vrací celá čísla v mezích včetně", () => {
  const r = new Rng(7);
  for (let i = 0; i < 500; i++) {
    const v = r.int(3, 9);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 3 && v <= 9, `mimo rozsah: ${v}`);
  }
});

test("Rng: range() vrací reálná čísla v [min, max)", () => {
  const r = new Rng(11);
  for (let i = 0; i < 500; i++) {
    const v = r.range(-2, 5);
    assert.ok(v >= -2 && v < 5, `mimo rozsah: ${v}`);
  }
});

test("Rng: chance() na hraničních pravděpodobnostech", () => {
  const r = new Rng(99);
  assert.equal(r.chance(0), false);
  assert.equal(r.chance(1), true);
});

test("Rng: normal() má přibližně nulovou střední hodnotu", () => {
  const r = new Rng(2024);
  let sum = 0;
  const n = 5000;
  for (let i = 0; i < n; i++) sum += r.normal(0, 1);
  const prumer = sum / n;
  assert.ok(Math.abs(prumer) < 0.05, `střední hodnota příliš daleko od 0: ${prumer}`);
});

test("Rng: seed 0 se nahrazuje (nikdy nezamrzne)", () => {
  const r = new Rng(0);
  const vals = [r.next(), r.next(), r.next()];
  assert.ok(vals.every((v) => v >= 0 && v < 1));
  assert.ok(new Set(vals).size > 1);
});

test("Rng: seed() vrací vnitřní stav pro replay", () => {
  const r = new Rng(555);
  r.next();
  r.next();
  const saved = r.seed();
  const r2 = new Rng(saved);
  // Obnovený generátor pokračuje tam, kde skončil původní.
  assert.equal(r2.next(), new Rng(555).next() === undefined ? 0 : (() => {
    const tmp = new Rng(555);
    tmp.next(); tmp.next();
    return tmp.next();
  })());
});
