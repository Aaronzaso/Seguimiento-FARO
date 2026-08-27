import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNumber,
  formatInputNumber,
  formatPercent,
  parseDecimalInput,
  parseNumber,
  roundToTwo,
  sumNumbers,
} from "../src/numbers.js";

test("cierra enteros y muestra exactamente dos decimales cuando hay fracción", () => {
  assert.equal(roundToTwo(830.9999999999999), 831);
  assert.equal(formatNumber(830.9999999999999), "831");
  assert.equal(formatNumber(69.69999999999999), "69,70");
  assert.equal(formatNumber(12.345), "12,35");
  assert.equal(formatNumber(12), "12");
  assert.equal(formatPercent(69.69999999999999), "69,70%");
  assert.equal(formatInputNumber(1000.5), "1000,50");
});

test("suma horas sin conservar colas binarias", () => {
  assert.equal(sumNumbers([33.3, 36.4]), 69.7);
  assert.equal(sumNumbers([159.69999999999996, 341.99999999999994, 329.3]), 831);
});

test("acepta coma o punto en entradas y limita la captura a dos decimales", () => {
  assert.equal(parseDecimalInput("33,30"), 33.3);
  assert.equal(parseDecimalInput("36.40"), 36.4);
  assert.equal(parseDecimalInput("12,345"), null);
  assert.equal(parseNumber("33,30"), 33.3);
});
