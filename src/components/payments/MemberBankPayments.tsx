"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { AurumTheme } from "@/components/ui/AurumTheme";
import {
  PaymentMethods,
  type PaymentMethod,
} from "@/components/services/BankTransferCheckout";
import { statusLabels } from "@/lib/ads-booking";
type Order = {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
  quote: { items: string[] };
};
export function MemberBankPayments({ usdtReady,tronReady }: { usdtReady: boolean;tronReady:boolean }) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [orders, setOrders] = useState<Order[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(next?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/public/account/orders" + (next ? "?cursor=" + next : ""),
        { cache: "no-store" },
      );
      const b = await r.json();
      if (!r.ok) throw Error("โหลดรายการชำระเงินไม่สำเร็จ");
      setOrders((old) => (next ? [...old, ...b.orders] : b.orders));
      setCursor(b.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <AurumTheme>
      <Stack spacing={3} sx={{ p: { xs: 2, md: 4 } }}>
        <Typography variant="h4">การชำระเงินของฉัน</Typography>
        <PaymentMethods
          value={method}
          onSelect={setMethod}
          usdtReady={usdtReady} tronReady={tronReady}
        />
        {method && (
          <Alert severity="info">
            {orders.some((o) => o.status === "REVIEW")
              ? "เลือกคำสั่งซื้อด้านล่างเพื่อชำระด้วย" +
                (method !== "bank" ? (method==="tron"?" TRC20-USDT":" BEP20-USDT") : "การโอนเงิน")
              : "ในรายการที่แสดงยังไม่มีคำสั่งซื้อที่เลือกช่องทางใหม่ได้"}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        <Button disabled={busy} onClick={() => void load()}>
          อัปเดตรายการ
        </Button>
        {!busy && !orders.length && <Typography>ยังไม่มีคำสั่งซื้อ</Typography>}
        {orders.map((o) => (
          <Paper key={o.id} sx={{ p: 3 }}>
            <Stack spacing={1}>
              <Typography>{o.id}</Typography>
              <Typography>{o.quote.items.join(" · ")}</Typography>
              <Typography color="primary">
                {o.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}{" "}
                บาท · {statusLabels[o.status] || o.status}
              </Typography>
              <Button
                href={`/services/ads-banner/checkout/${o.id}${o.status === "REVIEW" && method ? "?method=" + method : ""}`}
              >
                {o.status === "REVIEW" && method
                  ? method !== "bank"
                    ? (method==="tron"?"ชำระด้วย TRC20-USDT":"ชำระด้วย BEP20-USDT")
                    : "ชำระด้วยการโอนเงิน"
                  : "ดูรายละเอียดคำสั่งซื้อ"}
              </Button>
            </Stack>
          </Paper>
        ))}
        {cursor && (
          <Button disabled={busy} onClick={() => void load(cursor)}>
            ดูรายการเพิ่มเติม
          </Button>
        )}
      </Stack>
    </AurumTheme>
  );
}
