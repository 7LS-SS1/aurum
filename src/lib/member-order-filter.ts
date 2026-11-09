export type OrderDateField = "createdAt" | "startsAt" | "endsAt";
export type OrderFilter = { query: string; from: string; to: string; dateField: OrderDateField };
type SearchableOrder = { id: string; quote: { items: string[] }; createdAt: string; startsAt: string | null; endsAt: string | null };
const bangkok = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
export function orderDay(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const parts = bangkok.formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function filterMemberOrders<T extends SearchableOrder>(orders: T[], filter: OrderFilter): T[] {
  if (filter.from && filter.to && filter.from > filter.to) return [];
  const terms = filter.query.trim().toLocaleLowerCase().replace(/^#/, "").split(/\s+/).filter(Boolean);
  return orders.filter(order => {
    const text = `${order.id} ${order.quote.items.join(" ")}`.toLocaleLowerCase();
    if (!terms.every(term => text.includes(term))) return false;
    if (!filter.from && !filter.to) return true;
    const day = orderDay(order[filter.dateField]);
    return !!day && (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to);
  });
}
