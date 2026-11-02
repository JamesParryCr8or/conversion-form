"use client";

import { useEffect, useRef } from "react";
import "intl-tel-input/styles";

type Props = {
  /** E.164 value to show when resuming (e.g. "+447700900123"). Read once on mount. */
  initialValue: string;
  /** Called with the E.164 number as the visitor types or changes country. Empty string if nothing typed. */
  onChange: (e164: string) => void;
  defaultCountry: string;
  preferredCountries: string[];
  /** If set, only these countries can be picked (also the OTP fraud allow-list). */
  allowedCountries?: string[];
  labelId: string;
  invalid: boolean;
  autoFocus?: boolean;
};

/**
 * Country flag + dial-code picker (intl-tel-input), per docs/validation-services.md section 4.
 * Always reports E.164. The server re-validates with libphonenumber-js, so this is UX only.
 * The library is imported inside the effect so it never runs during server rendering.
 */
export function PhoneInput({ initialValue, onChange, defaultCountry, preferredCountries, allowedCountries, labelId, invalid, autoFocus = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const allowedKey = allowedCountries?.join(",") ?? "";
  const preferredKey = preferredCountries.join(",");

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { default: intlTelInput } = await import("intl-tel-input");
      if (cancelled) return;

      const only = allowedKey ? allowedKey.split(",").map((c) => c.toLowerCase()) : null;
      const preferred = preferredKey.split(",").filter(Boolean).map((c) => c.toLowerCase());
      const initial = defaultCountry.toLowerCase();

      const iti = intlTelInput(input, {
        initialCountry: (only && !only.includes(initial) ? only[0] : initial) as never,
        countryOrder: (only ? preferred.filter((c) => only.includes(c)) : preferred) as never,
        onlyCountries: only as never,
        loadUtils: () => import("intl-tel-input/utils"),
        strictMode: true,
        countrySearch: true,
      });

      const emit = () => onChangeRef.current(input.value.trim() === "" ? "" : iti.getNumber());
      input.addEventListener("input", emit);
      input.addEventListener("countrychange", emit);
      if (initialValue) iti.setNumber(initialValue);

      destroy = () => {
        input.removeEventListener("input", emit);
        input.removeEventListener("countrychange", emit);
        iti.destroy();
      };
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
    // initialValue is intentionally read once; the library owns the field after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCountry, preferredKey, allowedKey]);

  return (
    <input
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      autoFocus={autoFocus}
      aria-labelledby={labelId}
      aria-invalid={invalid}
      className="w-full rounded-[var(--radius)] border-2 border-black/15 bg-white/70 px-4 py-3.5 text-lg outline-none transition focus:border-[var(--primary)] aria-[invalid=true]:border-red-500"
    />
  );
}
