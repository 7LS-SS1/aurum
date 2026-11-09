import { domainToASCII } from "node:url";

/** Syntax only: a service inquiry never requires DNS or registers a domain. */
export function normalizeRequestDomain(value: string): string | null {
  const input = value.trim();
  if (!input || /[\s/:@?#%\\]/u.test(input)) return null;
  const domain = domainToASCII(input).toLowerCase();
  if (!domain || domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every(label =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) return null;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels.at(-1)!)) return null;
  return domain;
}
