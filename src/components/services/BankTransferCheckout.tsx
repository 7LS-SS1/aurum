"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { BankName } from "@/components/payments/BankIdentity";
import { AurumTheme } from "@/components/ui/AurumTheme";
import { ContractSummary } from "./ContractSummary";
import { OrderHistory } from "./OrderHistory";
import { OrderRenewal } from "./OrderRenewal";
import { OrderRequests } from "./OrderRequests";
import { statusLabels } from "@/lib/ads-booking";
import type { BankTransfer } from "@/lib/bank-transfer";
type State = {
  accounts: {
    id: string;
    bank: string;
    name: string;
    number: string;
    qr: boolean;
  }[];
  transfer: BankTransfer | null;
  order: {
    id: string;
    revision: number;
    status: string;
    amount: number;
    days: number;
    quote: { items: string[] };
    startsAt: string | null;
    endsAt: string | null;
    holdUntil: string | null;
    staffNote: string;
  };
};
const messages: Record<string, string> = {
  account_closed: "บัญชีนี้ปิดแล้ว กรุณาติดต่อเจ้าหน้าที่ก่อนโอนเงิน",
  slots_unavailable: "ตำแหน่งไม่ว่างแล้ว กรุณาติดต่อเจ้าหน้าที่",
  duplicate_slip: "สลิปนี้ถูกใช้กับคำสั่งซื้ออื่นแล้ว",
  amount_mismatch: "ยอดที่แจ้งต้องตรงกับคำสั่งซื้อ",
  existing_payment_channel:
    "รายการนี้มีช่องทางชำระเดิม กรุณาติดต่อเจ้าหน้าที่เพื่อป้องกันจ่ายซ้ำ",
  invalid_transition: "สถานะรายการเปลี่ยนแล้ว กรุณาโหลดใหม่",
  invalid_slip: "กรุณาใช้สลิป PNG, JPEG หรือ WebP ของคุณ",
  upload_storage_unavailable:
    "พื้นที่เก็บหลักฐานยังไม่พร้อม กรุณาติดต่อเจ้าหน้าที่",
  rate_limited: "กรุณารอสักครู่แล้วลองใหม่",
};
export function PaymentMethods() {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" },
        gap: 2,
      }}
    >
      <Paper variant="outlined" sx={{ p: 3, borderColor: "primary.main" }}>
        <Typography variant="h5" aria-hidden>
          ▣
        </Typography>
        <Typography variant="h6">โอนเงินแนบสลิป</Typography>
        <Chip size="small" label="ตรวจสอบโดยแอดมิน" color="primary" />
      </Paper>
      {["BEP20-USDT", "TRC20-USDT"].map((label, i) => (
        <Paper key={label} variant="outlined" sx={{ p: 3, opacity: 0.65 }}>
          <Box
            component="svg"
            viewBox="0 0 32 32"
            width={32}
            height={32}
            aria-label={i ? "เครือข่าย TRON" : "เครือข่าย BNB Smart Chain"}
          >
            <circle cx="16" cy="16" r="15" fill={i ? "#b83232" : "#c99d1a"} />
            <text x="16" y="22" textAnchor="middle" fill="white" fontSize="20">
              ₮
            </text>
          </Box>
          <Typography variant="h6">{label}</Typography>
          <Typography variant="caption">
            {i ? "TRON · TRC20 (TRON20)" : "BNB Smart Chain · BEP20"}
          </Typography>
          <Box>
            <Chip size="small" label="รอเปิดใช้งานเร็ว ๆ นี้" />
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
export function BankTransferCheckout({ id }: { id: string }) {
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [amount, setAmount] = useState(""),
    [paidAt, setPaidAt] = useState(""),
    [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const endpoint = "/api/public/payments/bank-transfer";
  const load = useCallback(async () => {
    const r = await fetch(`${endpoint}?id=${id}`, { cache: "no-store" });
    const b = await r.json();
    if (!r.ok) throw Error(messages[b.error] || "โหลดข้อมูลไม่สำเร็จ");
    setData(b);
  }, [id]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  async function post(action: string, input: unknown) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data: input }),
    });
    const b = await r.json();
    if (!r.ok)
      throw Error(messages[b.error] || `ดำเนินการไม่สำเร็จ (${b.error})`);
  }
  async function select() {
    setBusy(true);
    setError("");
    try {
      await post("select", { id, accountId: selected });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 20 * 1024 * 1024
      )
        throw Error("ใช้ PNG, JPEG หรือ WebP ขนาดไม่เกิน 20 MB");
      const r = await fetch("/api/public/ads-attachments", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const b = await r.json();
      if (!r.ok) throw Error(messages[b.error] || "อัปโหลดสลิปไม่สำเร็จ");
      await post("slip", {
        id,
        attachmentId: b.id,
        amountSatang: Math.round(Number(amount) * 100),
        paidAt: new Date(paidAt).toISOString(),
      });
      setFile(null);
      setNotice("ส่งสลิปแล้ว รอแอดมินตรวจสอบเงินจริง กรุณาอย่าโอนซ้ำ");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const o = data?.order,
    t = data?.transfer,
    a = data?.accounts.find((a) => a.id === t?.accountId);
  return (
    <AurumTheme>
      <Stack
        spacing={3}
        sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 }, minWidth: 0, "& .MuiButton-root": { minHeight: 44 }, "& .MuiTextField-root": { minWidth: 0 } }}
      >
        <Button href="/account" sx={{ alignSelf: "start" }}>
          ← บัญชีและคำสั่งซื้อ
        </Button>
        <Box><Typography variant="overline" color="primary">PAYMENT • ชำระค่าบริการ</Typography><Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>ตรวจสอบยอดและแจ้งการโอนเงิน</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>โอนตามยอดคำสั่งซื้อ แล้วส่งหลักฐานเพื่อให้เจ้าหน้าที่ตรวจสอบ</Typography></Box>
        <PaymentMethods />
        {error && (
          <Alert
            severity="error"
            action={
              <Button
                onClick={() => void load().catch((e) => setError(e.message))}
              >
                โหลดใหม่
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        {notice && <Alert severity="success">{notice}</Alert>}
        {!o ? (
          <Typography>กำลังโหลดคำสั่งซื้อ…</Typography>
        ) : (
          <>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, minWidth: 0 }}>
              <Stack spacing={2}>
                <Typography variant="h6">สรุปยอดชำระ</Typography><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>เลขคำสั่งซื้อ {o.id}</Typography>
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(o.id)
                      .then(() => setNotice("คัดลอกเลขคำสั่งซื้อแล้ว"))
                      .catch(() =>
                        setError(
                          "คัดลอกไม่สำเร็จ กรุณาเลือกคัดลอกเลขคำสั่งซื้อ",
                        ),
                      )
                  }
                >
                  คัดลอกเลขคำสั่งซื้อ
                </Button>
                <Chip label={statusLabels[o.status] || o.status} sx={{ alignSelf: "start" }} />
                {o.quote.items.map((item, i) => (
                  <Typography key={i}>{item}</Typography>
                ))}
                <Typography variant="h4" color="primary">
                  {o.amount.toLocaleString("th-TH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  บาท
                </Typography>
              </Stack>
            </Paper>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3, minWidth: 0 }}>
              <Stack spacing={2}>
                <Typography variant="h6">โอนเงินแนบสลิป</Typography>
                {!t && o.status === "REVIEW" && (
                  <>
                    {data!.accounts.length ? (
                      <>
                        <TextField
                          select
                          label="เลือกบัญชีรับเงิน"
                          value={selected}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          {data!.accounts.map((a) => (
                            <MenuItem key={a.id} value={a.id}>
                              <BankName name={a.bank} /> · {a.name}
                            </MenuItem>
                          ))}
                        </TextField>
                        <Button
                          variant="contained"
                          disabled={busy || !selected}
                          onClick={select}
                        >
                          ตรวจตำแหน่งว่างและแสดงบัญชีรับเงิน
                        </Button>
                      </>
                    ) : (
                      <Alert severity="warning">
                        ยังไม่มีบัญชีรับชำระที่เปิดใช้งาน
                        กรุณาติดต่อแอดมินก่อนโอน
                      </Alert>
                    )}
                  </>
                )}
                {t && o.status === "PAYMENT" && a && (
                  <>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 300px" }, gap: 3, alignItems: "center", p: { xs: 2, md: 3 }, border: "1px solid", borderColor: "divider", borderRadius: 3, background: "linear-gradient(135deg, rgba(230,195,112,.09), transparent)" }}>
                      <Stack spacing={2} sx={{ minWidth: 0 }}>
                        <Typography variant="overline" color="primary">01 / บัญชีรับชำระ</Typography>
                        <BankName name={a.bank} />
                        <Box><Typography variant="caption" color="text.secondary">ชื่อบัญชี</Typography><Typography sx={{ fontWeight: 600 }}>{a.name}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">เลขที่บัญชี</Typography><Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 700, letterSpacing: 1, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{a.number}</Typography></Box>
                        <Button variant="outlined" sx={{ alignSelf: { xs: "stretch", md: "start" } }} onClick={() => void navigator.clipboard.writeText(a.number).then(() => setNotice("คัดลอกเลขบัญชีแล้ว")).catch(() => setError("คัดลอกไม่สำเร็จ"))}>คัดลอกเลขบัญชี</Button>
                        <Box sx={{ pt: 2, borderTop: "1px solid", borderColor: "divider" }}><Typography color="text.secondary" variant="body2">ยอดที่ต้องโอน</Typography><Typography variant="h4" color="primary" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{o.amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <Typography component="span">บาท</Typography></Typography></Box>
                      </Stack>
                      {a.qr && <Stack spacing={1.5} sx={{ alignItems: "center", p: 2, borderRadius: 2, bgcolor: "background.default" }}>
                        <Typography sx={{ fontWeight: 600 }}>สแกน QR เพื่อโอนเงิน</Typography>
                        <Box component="img" src={`${endpoint}?id=${id}&qr=${a.id}`} alt="QR-code บัญชีรับชำระ" sx={{ width: 220, maxWidth: "100%", height: "auto", borderRadius: 1, bgcolor: "white" }} />
                        <Button component="a" href={`${endpoint}?id=${id}&qr=${a.id}`} target="_blank" rel="noopener noreferrer" variant="outlined" fullWidth>เปิดรูป QR ขนาดเต็ม ↗</Button>
                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>บนมือถือ: เปิดรูป QR แล้วบันทึกไว้เลือกจากแอปธนาคาร</Typography>
                      </Stack>}
                    </Box>
                    <Alert severity="warning">
                      ตรวจชื่อผู้รับในแอปธนาคารก่อนยืนยันโอน · กรุณาชำระก่อน{" "}
                      {o.holdUntil
                        ? new Date(o.holdUntil).toLocaleString("th-TH")
                        : "ติดต่อเจ้าหน้าที่"}
                    </Alert>
                  </>
                )}
                {t &&
                  !a &&
                  ["PAYMENT", "PAYMENT_REVIEW", "EXPIRED"].includes(
                    o.status,
                  ) && (
                    <Alert severity="warning">
                      บัญชีรับเงินปิดแล้ว ห้ามโอนเพิ่มเติม
                      หากโอนไปแล้วสามารถส่งหลักฐานให้แอดมินตรวจสอบได้
                    </Alert>
                  )}
                {t?.state === "review" && (
                  <Alert severity="info">
                    ได้รับสลิปแล้ว รอตรวจสอบการชำระเงิน กรุณาอย่าโอนซ้ำ
                  </Alert>
                )}
                {t?.state === "confirmed" && (
                  <Alert severity="success">
                    แอดมินยืนยันเงินเข้าแล้ว{" "}
                    {o.status === "REFUND_REQUIRED"
                      ? "อยู่ระหว่างตรวจสอบคืนเงิน"
                      : "กำลังดำเนินการตามขั้นตอนบริการ"}
                  </Alert>
                )}
                {o.status === "EXPIRED" && (
                  <Alert severity="warning">
                    สิทธิ์จองหมดอายุแล้ว ห้ามโอนเพิ่ม
                    ส่งหลักฐานได้เฉพาะเงินที่โอนแล้ว แอดมินจะตรวจสอบการคืนเงิน
                  </Alert>
                )}
                {o.staffNote && (
                  <Alert severity="info">ข้อความจากแอดมิน: {o.staffNote}</Alert>
                )}
                {t &&
                  ["PAYMENT", "PAYMENT_REVIEW", "EXPIRED"].includes(o.status) &&
                  ["awaiting", "more_info", "rejected"].includes(t.state) && (
                    <>
                      <Box sx={{ pt: 2 }}><Typography variant="overline" color="primary">02 / แจ้งหลักฐานการชำระเงิน</Typography><Typography variant="h6">แนบสลิปหลังโอนเงิน</Typography><Typography variant="body2" color="text.secondary">กรอกยอดและวันเวลาตามสลิป เจ้าหน้าที่จะตรวจสอบก่อนยืนยัน</Typography></Box>
                      <Button
                        component="label"
                        disabled={busy}
                        variant="outlined"
                        sx={{ borderStyle: "dashed", borderWidth: 2, minHeight: 100, p: 3, overflowWrap: "anywhere", textAlign: "center" }}
                      >
                        {file
                          ? file.name
                          : "เลือกสลิป PNG / JPEG / WebP (ไม่เกิน 20 MB)"}
                        <input
                          hidden
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                      </Button>
                      {preview && <Box sx={{ p: 2, textAlign: "center", borderRadius: 2, bgcolor: "background.default" }}><Box component="img" src={preview} alt="ตัวอย่างสลิปที่เลือก" sx={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain" }} /><Button onClick={() => setFile(null)} disabled={busy} fullWidth>นำสลิปออก / เลือกใหม่</Button></Box>}
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                      <TextField
                        label="ยอดที่โอน (บาท)"
                        type="number"
                        slotProps={{ htmlInput: { min: 0.01, step: "0.01", inputMode: "decimal" } }}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <TextField
                        type="datetime-local"
                        label="วันเวลาโอน (เวลาบนอุปกรณ์)"
                        slotProps={{ inputLabel: { shrink: true } }}
                        value={paidAt}
                        onChange={(e) => setPaidAt(e.target.value)}
                      />
                      </Box>
                      <Button
                        size="large"
                        sx={{ py: 1.75 }}
                        variant="contained"
                        disabled={busy || !file || !paidAt || !amount}
                        onClick={submit}
                      >
                        {busy ? "กำลังส่งหลักฐาน…" : "ส่งสลิปให้แอดมินตรวจสอบ"}
                      </Button>
                      <Typography variant="caption">
                        สลิปเป็นข้อมูลส่วนตัว
                        การส่งสลิปยังไม่ถือว่าชำระสำเร็จหรือเริ่มบริการ
                      </Typography>
                    </>
                  )}
                <Button
                  href="https://t.me/thaitubevideo"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ติดต่อแอดมิน
                </Button>
              </Stack>
            </Paper>
            <ContractSummary
              quote={o.quote}
              startsAt={o.startsAt}
              endsAt={o.endsAt}
              days={o.days}
              status={o.status}
            />
            <OrderHistory key={o.revision} id={id} />
            <OrderRenewal id={id} />
            <OrderRequests id={id} />
          </>
        )}
      </Stack>
    </AurumTheme>
  );
}
