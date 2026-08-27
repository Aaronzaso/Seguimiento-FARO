const DECIMAL_PLACES = 2;
const DECIMAL_FACTOR = 10 ** DECIMAL_PLACES;

const integerFormatter = new Intl.NumberFormat("es-CR", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("es-CR", {
  minimumFractionDigits: DECIMAL_PLACES,
  maximumFractionDigits: DECIMAL_PLACES,
});

export function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function finiteNumber(value) {
  return parseNumber(value) ?? 0;
}

export function roundToTwo(value) {
  const number = finiteNumber(value);
  const sign = number < 0 ? -1 : 1;
  const rounded = sign * Math.round((Math.abs(number) + Number.EPSILON) * DECIMAL_FACTOR) / DECIMAL_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function sumNumbers(values) {
  return roundToTwo(Array.from(values || []).reduce((sum, value) => sum + finiteNumber(value), 0));
}

export function formatNumber(value) {
  const rounded = roundToTwo(value);
  return Number.isInteger(rounded)
    ? integerFormatter.format(rounded)
    : decimalFormatter.format(rounded);
}

export function formatInputNumber(value) {
  const rounded = roundToTwo(value);
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(DECIMAL_PLACES).replace(".", ",");
}

export function formatPercent(value) {
  return `${formatNumber(value)}%`;
}

export function parseDecimalInput(value) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? roundToTwo(number) : null;
}
