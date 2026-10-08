import type { Preferences } from "./preferences";

// All inputs and persisted GPS data use SI. Conversion belongs to presentation.
export const kmToMiles = (km: number) => km / 1.609344;
export const milesToKm = (miles: number) => miles * 1.609344;
export const metresToFeet = (m: number) => m / 0.3048;
export const feetToMetres = (ft: number) => ft * 0.3048;
export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const fahrenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;
export const kgToLb = (kg: number) => kg / 0.45359237;
export const lbToKg = (lb: number) => lb * 0.45359237;
export const mmToInches = (mm: number) => mm / 25.4;
export const inchesToMm = (inches: number) => inches * 25.4;
const number = (n: number, p: Preferences, decimals = 0) =>
  new Intl.NumberFormat(p.language, { maximumFractionDigits: decimals }).format(
    n,
  );
export function formatDistance(m: number, p: Preferences): string {
  if (p.distanceUnit === "imperial")
    return m < 1609.344
      ? `${number(metresToFeet(m), p)} ft`
      : `${number(kmToMiles(m / 1000), p, 2)} mi`;
  return m < 1000 ? `${number(m, p)} m` : `${number(m / 1000, p, 2)} km`;
}
export const formatAltitude = (m: number, p: Preferences) =>
  `${number(p.altitudeUnit === "ft" ? metresToFeet(m) : m, p)} ${p.altitudeUnit}`;
export const formatTemperature = (c: number, p: Preferences) =>
  `${number(p.temperatureUnit === "F" ? celsiusToFahrenheit(c) : c, p, 1)} °${p.temperatureUnit}`;
export const formatPrecipitation = (mm: number, p: Preferences) =>
  `${number(p.precipitationUnit === "in" ? mmToInches(mm) : mm, p, 2)} ${p.precipitationUnit}`;
export function formatWeight(kg: number, p: Preferences): string {
  if (p.weightUnit === "imperial") {
    const lb = kgToLb(kg);
    return lb < 1 ? `${number(lb * 16, p, 1)} oz` : `${number(lb, p, 2)} lb`;
  }
  return kg < 1 ? `${number(kg * 1000, p)} g` : `${number(kg, p, 2)} kg`;
}
export function formatDate(timestamp: number, p: Preferences): string {
  const parts = new Intl.DateTimeFormat(p.language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(timestamp);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  const d = get("day"),
    m = get("month"),
    y = get("year");
  return p.dateFormat === "ISO"
    ? `${y}-${m}-${d}`
    : p.dateFormat === "MDY"
      ? `${m}/${d}/${y}`
      : `${d}/${m}/${y}`;
}
export const formatTime = (timestamp: number, p: Preferences) =>
  new Intl.DateTimeFormat(p.language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: p.timeFormat === "12" ? "h12" : "h23",
  }).format(timestamp);
export const formatDateTime = (timestamp: number, p: Preferences) =>
  `${formatDate(timestamp, p)} ${formatTime(timestamp, p)}`;
