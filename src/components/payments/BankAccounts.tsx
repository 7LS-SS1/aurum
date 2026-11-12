"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { BankSelect, BankName } from "./BankIdentity";
import { AurumTheme } from "@/components/ui/AurumTheme";
import type {
  BankAccount,
  BankLedger,
  BankTransfer,
} from "@/lib/bank-transfer";
import { apiFetch } from "@/lib/api-client";
const money = (v: number) =>
  (v / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
type Pending = {
  id: string;
  revision: number;
  amount: number;
  status: string;
  transfer: BankTransfer | null;
};
type Detail = {
  account: BankAccount;
  entries: BankLedger[];
  pending: Pending[];
};
export function BankAccounts({
  id,
  create = false,
}: {
  id?: string;
  create?: boolean;
}) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [closing, setClosing] = useState(false),
    [review, setReview] = useState<Pending | null>(null);
  const [bank, setBank] = useState(""),
    [number, setNumber] = useState(""),
    [name, setName] = useState(""),
    [qr, setQr] = useState<string | null>(null);
  const [reference, setReference] = useState(""),
    [note, setNote] = useState(""),
    [amount, setAmount] = useState(""),
    [when, setWhen] = useState(""),
    [direction, setDirection] = useState("IN");
  const load = useCallback(async () => {
    if (create) return;
    if (id) setDetail(await apiFetch<Detail>(`/api/bank-accounts?id=${id}`));
    else
      setAccounts(
        (await apiFetch<{ accounts: BankAccount[] }>("/api/bank-accounts"))
          .accounts,
      );
  }, [id, create]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function act(action: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/bank-accounts", {
        method: "POST",
        body: JSON.stringify({ action, data }),
      });
      setNotice("บันทึกเรียบร้อยแล้ว");
      setReview(null);
      setClosing(false);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/bank-accounts?upload=qr", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "อัปโหลดไม่สำเร็จ");
      setQr(b.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function beginReview(p: Pending) {
    setReference("");
    setNote("");
    setAmount(String(p.amount));
    setWhen("");
    setReview(p);
  }
  const fields = (
    <>
      <TextField
        label="เลขอ้างอิงธุรกรรมจากธนาคาร"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      <TextField
        label="ยอดเงินจริง (บาท)"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        slotProps={{ htmlInput: { min: "0.01", step: "0.01" } }}
      />
      <TextField
        label="วันเวลาที่เงินจริงเข้า/ออก (เวลาบนอุปกรณ์)"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="หมายเหตุการตรวจสอบ"
        multiline
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </>
  );
  return (
    <AurumTheme>
      <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto", minWidth: 0, "& .MuiPaper-root": { borderRadius: "16px" }, "& .MuiButton-root": { minHeight: 44 } }}>
        <Typography variant="h4">จัดการบัญชี</Typography>
        <Stack direction="row" spacing={2}>
          <Button href="/admin/bank-accounts">บัญชีทั้งหมด</Button>
          <Button href="/admin/bank-accounts/new" variant="contained">
            เพิ่มบัญชีใหม่
          </Button>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {create ? (
          <Paper sx={{ p: 3, maxWidth: 700 }}>
            <Stack spacing={2}>
              <Typography variant="h6">เพิ่มบัญชีรับชำระ</Typography>
              <BankSelect value={bank} onChange={setBank} disabled={busy} />
              <TextField
                label="เลขที่บัญชี"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
              <TextField
                label="ชื่อบัญชี"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button component="label" disabled={busy} variant="outlined">
                อัปโหลด QR-code ชำระเงิน
                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </Button>
              {qr && (
                <Box
                  component="img"
                  alt="QR รับชำระ"
                  src={`/api/public/ads-attachments?id=${qr}&preview=1`}
                  sx={{ maxWidth: 240 }}
                />
              )}
              <Alert severity="info">
                ตรวจเลขบัญชี ชื่อผู้รับ และ QR ให้ตรงกันก่อนเปิดรับเงิน
              </Alert>
              <Button
                disabled={busy || !bank || !number || !name}
                variant="contained"
                onClick={async () => {
                  if (await act("create", { bank, number, name, qr })) {
                    setBank("");
                    setNumber("");
                    setName("");
                    setQr(null);
                  }
                }}
              >
                บันทึกบัญชี
              </Button>
            </Stack>
          </Paper>
        ) : !id ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2,1fr)" },
              gap: 2,
            }}
          >
            {accounts
              .filter((a) => !a.deletedAt)
              .map((a) => (
                <Paper key={a.id} sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6">
                      <BankName name={a.bank} />
                      {a.name}
                    </Typography>
                    <Typography>{a.number}</Typography>
                    <Chip
                      label={a.closedAt ? "ปิดบัญชีแล้ว" : "รับชำระได้"}
                      color={a.closedAt ? "default" : "success"}
                    />
                    <Button href={`/admin/bank-accounts/${a.id}`}>
                      ดูรายละเอียดและประวัติ
                    </Button>
                  </Stack>
                </Paper>
              ))}
            {!accounts.filter((a) => !a.deletedAt).length && (
              <Typography>ยังไม่มีบัญชีรับชำระ</Typography>
            )}
            <Button
              href="/admin/bank-accounts?archive=1"
              onClick={(e) => {
                e.preventDefault();
                setNotice(
                  "รายการที่ลบข้อมูลแล้ว: " +
                    accounts
                      .filter((a) => a.deletedAt)
                      .map((a) => a.id)
                      .join(", "),
                );
              }}
            >
              ดูรหัสบัญชีที่ลบข้อมูลแล้ว
            </Button>
            {accounts
              .filter((a) => a.deletedAt)
              .map((a) => (
                <Button key={a.id} href={`/admin/bank-accounts/${a.id}`}>
                  ประวัติบัญชี {a.id}
                </Button>
              ))}
          </Box>
        ) : (
          detail && (
            <>
              <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 260px" }, gap: 3, alignItems: "start" }}>
                <Stack spacing={2} sx={{ minWidth: 0 }}>
                  <Typography variant="overline" color="primary">บัญชีรับชำระเงิน</Typography>
                  <BankName name={detail.account.bank} />
                  <Chip size="small" label={detail.account.closedAt ? "ปิดรับชำระ" : "เปิดรับชำระ"} color={detail.account.closedAt ? "default" : "success"} sx={{ alignSelf: "start" }} />
                  <Box><Typography variant="caption" color="text.secondary">ชื่อบัญชี</Typography><Typography variant="h6">{detail.account.name}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">เลขที่บัญชี</Typography><Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 700, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{detail.account.deletedAt ? "ลบเลขบัญชีแล้ว" : detail.account.number}</Typography></Box>
                  {detail.account.closedAt ? (
                    <Alert severity="warning">
                      ปิดรับชำระแล้ว ·{" "}
                      {detail.account.deletedAt
                        ? "ลบข้อมูลบัญชีแล้ว"
                        : `ลบข้อมูลวันที่ ${new Date(detail.account.purgeAt!).toLocaleDateString("th-TH")}`}{" "}
                      · ประวัติธุรกรรมยังคงอยู่
                    </Alert>
                  ) : (
                    <Button color="error" onClick={() => setClosing(true)}>
                      ปิดบัญชี
                    </Button>
                  )}
                </Stack>
                {detail.account.qr && <Box sx={{ p: 2, textAlign: "center", bgcolor: "background.default", borderRadius: "12px", minWidth: 0 }}>
                  <Typography sx={{ mb: 2, fontWeight: 600 }}>QR รับชำระเงิน</Typography>
                  <Box component="img" alt="QR บัญชี" src={`/api/public/ads-attachments?id=${detail.account.qr}&preview=1`} sx={{ display: "block", width: "220px !important", maxWidth: "100% !important", height: "auto", maxHeight: 320, objectFit: "contain", mx: "auto", borderRadius: "8px" }} />
                  <Button fullWidth href={`/api/public/ads-attachments?id=${detail.account.qr}&preview=1`} target="_blank" rel="noopener noreferrer" sx={{ mt: 1 }}>เปิดภาพขนาดเต็ม ↗</Button>
                </Box>}
                </Box>
              </Paper>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" }, gap: 2 }}>
                {[{ label: "รับเงินที่บันทึก", value: money(detail.entries.filter(e => e.direction === "IN").reduce((n,e) => n + e.amountSatang,0)) + " บาท" }, { label: "จ่ายเงินที่บันทึก", value: money(detail.entries.filter(e => e.direction === "OUT").reduce((n,e) => n + e.amountSatang,0)) + " บาท" }, { label: "สลิปรอตรวจสอบ", value: detail.pending.filter(p => p.transfer?.state === "review").length + " รายการ" }].map(item => <Paper variant="outlined" key={item.label} sx={{ p: 2.5 }}><Typography color="text.secondary" variant="body2">{item.label}</Typography><Typography variant="h5" color="primary" sx={{ mt: 1, fontWeight: 700 }}>{item.value}</Typography></Paper>)}
              </Box>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6">
                  สลิปและคำสั่งซื้อของบัญชี (ล่าสุด 200 รายการ)
                </Typography>
                {!detail.pending.length && <Alert severity="info" sx={{ mt: 2 }}>ยังไม่มีคำสั่งซื้อของบัญชีนี้</Alert>}
                {detail.pending.map((p) => (
                  <Stack
                    key={p.id}
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    sx={{ p: 2, mt: 2, border: "1px solid", borderColor: "divider", borderRadius: "12px", alignItems: { md: "center" }, flexWrap: "wrap", gap: 1 }}
                  >
                    <Button href={`/admin/ads-orders/${p.id}`} sx={{ overflowWrap: "anywhere", textAlign: "left", justifyContent: "start" }}>คำสั่งซื้อ {p.id}</Button>
                    <Typography>
                      {money(p.amount * 100)} บาท · {p.transfer ? ({ awaiting: "รอแนบสลิป", review: "รอตรวจสอบ", confirmed: "ยืนยันแล้ว", more_info: "ขอข้อมูลเพิ่ม", rejected: "ไม่ผ่าน" }[p.transfer.state]) : "—"}
                    </Typography>
                    {p.transfer?.attachmentId && (
                      <Button
                        href={`/api/public/ads-attachments?id=${p.transfer.attachmentId}&preview=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ดูสลิป
                      </Button>
                    )}
                    {p.transfer?.state === "review" && (
                      <Button variant="contained" onClick={() => beginReview(p)}>
                        ตรวจสอบการชำระเงิน
                      </Button>
                    )}
                  </Stack>
                ))}
              </Paper>
              <Paper sx={{ p: 3, overflowX: "auto" }}>
                <Typography variant="h6">บันทึกรับ–จ่าย</Typography>
                <Alert severity="info">
                  รายการที่บันทึกใน AURUM ไม่ใช่รายการเดินบัญชีทั้งหมดจากธนาคาร
                  · ไม่เชื่อม API · การบันทึกด้วยมือไม่เปลี่ยนสถานะคำสั่งซื้อ
                </Alert>
                <Typography sx={{ my: 2 }}>
                  รับ{" "}
                  {money(
                    detail.entries
                      .filter((e) => e.direction === "IN")
                      .reduce((s, e) => s + e.amountSatang, 0),
                  )}{" "}
                  บาท · จ่าย{" "}
                  {money(
                    detail.entries
                      .filter((e) => e.direction === "OUT")
                      .reduce((s, e) => s + e.amountSatang, 0),
                  )}{" "}
                  บาท
                </Typography>
                <table style={{ width: "100%", minWidth: 650 }}>
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>รายการ</th>
                      <th>รับ</th>
                      <th>จ่าย</th>
                      <th>อ้างอิง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.entries.map((e) => (
                      <tr key={e.id}>
                        <td>
                          {new Date(e.occurredAt).toLocaleString("th-TH")}
                        </td>
                        <td>
                          {e.note}
                          {e.orderId && (
                            <Button href={`/admin/ads-orders/${e.orderId}`}>
                              คำสั่งซื้อ
                            </Button>
                          )}
                        </td>
                        <td>
                          {e.direction === "IN" ? money(e.amountSatang) : "—"}
                        </td>
                        <td>
                          {e.direction === "OUT" ? money(e.amountSatang) : "—"}
                        </td>
                        <td>{e.reference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Paper>
              {!detail.account.deletedAt && (
                <Paper sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Typography variant="h6">
                      บันทึกรายการเงินที่เกิดขึ้นแล้ว
                    </Typography>
                    <TextField
                      select
                      label="ประเภท"
                      value={direction}
                      onChange={(e) => setDirection(e.target.value)}
                    >
                      <MenuItem value="IN">รับเงิน</MenuItem>
                      <MenuItem value="OUT">จ่ายเงิน</MenuItem>
                    </TextField>
                    {fields}
                    <Button
                      disabled={busy || !reference || !amount || !when || !note}
                      onClick={() =>
                        void act("entry", {
                          accountId: id,
                          direction,
                          reference,
                          note,
                          amountSatang: Math.round(Number(amount) * 100),
                          occurredAt: new Date(when).toISOString(),
                        })
                      }
                    >
                      บันทึกรายการ (ไม่ใช่คำสั่งโอนเงิน)
                    </Button>
                  </Stack>
                </Paper>
              )}
            </>
          )
        )}
        <Dialog open={closing} onClose={() => !busy && setClosing(false)}>
          <DialogTitle>ปิดบัญชีรับชำระ?</DialogTitle>
          <DialogContent>
            หยุดแสดงบัญชีให้ลูกค้าทันที และลบข้อมูลบัญชีหลัง 30 วัน
            ประวัติรับ–จ่ายยังคงอยู่ สลิปที่โอนมาแล้วต้องตรวจสอบต่อ
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClosing(false)}>ยกเลิก</Button>
            <Button
              color="error"
              disabled={busy}
              onClick={() => void act("close", { id })}
            >
              ยืนยันปิดบัญชี
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={!!review}
          onClose={() => !busy && setReview(null)}
          fullWidth
        >
          <DialogTitle>ตรวจสอบเงินจริง · {review?.id}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="warning">
                ตรวจเงินเข้าในบัญชีธนาคารจริงก่อนยืนยัน
                การดูสลิปอย่างเดียวไม่เพียงพอ
              </Alert>
              {error && <Alert severity="error">{error}</Alert>}
              {fields}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              disabled={busy || !note}
              onClick={() =>
                void act("review", {
                  id: review!.id,
                  revision: review!.revision,
                  decision: "more_info",
                  note,
                })
              }
            >
              ขอหลักฐานเพิ่ม
            </Button>
            <Button
              color="error"
              disabled={busy || !note}
              onClick={() =>
                void act("review", {
                  id: review!.id,
                  revision: review!.revision,
                  decision: "reject",
                  note,
                })
              }
            >
              ปฏิเสธ
            </Button>
            <Button
              variant="contained"
              disabled={busy || !note || !when || !reference || !amount}
              onClick={() =>
                void act("review", {
                  id: review!.id,
                  revision: review!.revision,
                  decision: "confirm",
                  reference,
                  note,
                  amountSatang: Math.round(Number(amount) * 100),
                  paidAt: new Date(when).toISOString(),
                })
              }
            >
              ยืนยันตรวจเงินเข้าแล้ว
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </AurumTheme>
  );
}
