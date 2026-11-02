/**
 * Temporary phone normaliser until the intl-tel-input block lands (to-do section 5).
 * Turns what a UK visitor typically types into E.164. Anything else is returned
 * trimmed and the server validation decides.
 */
export function toE164Guess(input: string, defaultCountry = "gb"): string {
  const v = input.trim().replace(/[\s().-]/g, "");
  if (v.startsWith("+")) return v;
  if (v.startsWith("00")) return `+${v.slice(2)}`;
  if (defaultCountry.toLowerCase() === "gb" && v.startsWith("0")) return `+44${v.slice(1)}`;
  return v;
}
