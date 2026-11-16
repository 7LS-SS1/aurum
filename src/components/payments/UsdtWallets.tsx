"use client";
import { useState, useEffect } from "react";
import {
  Button,
  Stack,
  TextField,
  Typography,
  Checkbox,
  Switch,
  MenuItem,
  Paper,
  Chip,
  Box,
  FormControlLabel,
  Alert,
} from "@mui/material";
import { AurumTheme } from "@/components/ui/AurumTheme";
import { paymentRate, wallet } from "@/lib/usdt";
import type { z } from "zod";
type Wallet = z.infer<typeof wallet>;
export function UsdtWallets() {
  const [rows, setRows] = useState<Wallet[]>([]),
    [edit, setEdit] = useState<Wallet | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  async function load() {
    const r = await fetch("/api/usdt-wallets", { cache: "no-store" });
    if (!r.ok) throw Error();
    setRows(await r.json());
  }
  useEffect(() => {
    void load().catch(() => setError("โหลดข้อมูลไม่สำเร็จ"));
  }, []);
  async function save() {
    setSuccess("");
    const result = wallet.safeParse(edit);
    if (!result.success) {
      const messages: Record<string, string> = {
        name: "กรุณาระบุชื่อกระเป๋า (สูงสุด 80 ตัวอักษร)",
        address:
          edit?.network === "tron"
            ? "กรุณาระบุที่อยู่ TRON ที่ขึ้นต้นด้วย T และมี checksum ถูกต้อง"
            : "กรุณาใช้ที่อยู่รับบน BNB Smart Chain (BEP20) ที่ขึ้นต้นด้วย 0x ตามด้วยเลขฐานสิบหก 40 ตัว",
        rate: "กรุณากรอกอัตราบาทต่อ USDT เป็นเลขบวก ทศนิยมไม่เกิน 4 ตำแหน่ง หรือเปิดเรตอัตโนมัติ",
      };
      setError(
        result.error.issues
          .map(
            (issue) =>
              messages[String(issue.path[0])] ||
              "กรุณาเปิดฟอร์มเพิ่มกระเป๋าใหม่อีกครั้ง",
          )
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(" · "),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/usdt-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const reasons: Record<string, string> = {
          unauthorized: "กรุณาเข้าสู่ระบบอีกครั้ง",
          forbidden: "ต้องใช้สิทธิ์ผู้จัดการขึ้นไป",
          invalid_origin: "กรุณาเปิดหน้าจัดการผ่านโดเมนที่ตั้งค่าไว้",
          validation_failed: "ข้อมูลกระเป๋าไม่ผ่านการตรวจสอบ",
        };
        throw Error(
          reasons[body.error] || `บันทึกไม่สำเร็จ (HTTP ${r.status})`,
        );
      }
      setEdit(null);
      setSuccess("บันทึกกระเป๋าเรียบร้อยแล้ว");
      try {
        await load();
      } catch {
        setError("บันทึกแล้ว แต่โหลดรายการล่าสุดไม่ได้ กรุณารีเฟรชหน้า");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AurumTheme>
      <Stack
        component="section"
        spacing={2}
        sx={{
          maxWidth: 1200,
          mx: "auto",
          my: 4,
          px: { xs: 2, md: 0 },
          minWidth: 0,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            alignItems: { sm: "center" },
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              กระเป๋ารับ USDT
            </Typography>
            <Typography color="text.secondary">
              BNB Smart Chain · BEP20 / TRON · TRC20
            </Typography>
          </Box>
          <Button
            variant="contained"
            sx={{ alignSelf: "start" }}
            onClick={() =>
              setEdit({
                id: crypto.randomUUID(),
                name: "",
                network: "bsc",
                address: "",
                rate: "",
                automaticRate: false,
                active: false,
              })
            }
          >
            เพิ่มกระเป๋า
          </Button>
        </Stack>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2,minmax(0,1fr))" },
            gap: 2,
          }}
        >
          {rows.map((w) => (
            <Paper key={w.id} variant="outlined" sx={{ p: 3, minWidth: 0 }}>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  sx={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>
                    {w.name}
                  </Typography>
                  <Chip
                    size="small"
                    color={w.active ? "success" : "default"}
                    label={w.active ? "กระเป๋าหลัก" : "ปิดใช้งาน"}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  ที่อยู่รับ {w.network === "tron" ? "TRC20" : "BEP20"}
                </Typography>
                <Typography
                  sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
                >
                  {w.address}
                </Typography>
                <Typography variant="body2">
                  {w.automaticRate
                    ? "อัตราอัตโนมัติจาก Bitkub"
                    : w.rate + " บาท/USDT"}
                </Typography>
                <Button
                  variant="outlined"
                  sx={{ alignSelf: "flex-start" }}
                  onClick={() => {
                    setEdit(w);
                    setError("");
                    setSuccess("");
                  }}
                >
                  แก้ไขกระเป๋า
                </Button>
              </Stack>
            </Paper>
          ))}
        </Box>
        {edit && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, maxWidth: 720 }}>
            <Stack spacing={2}>
              <Typography variant="h6">
                {rows.some((w) => w.id === edit.id)
                  ? "แก้ไขกระเป๋า"
                  : "เพิ่มกระเป๋ารับ USDT"}
              </Typography>
              <TextField
                label="ชื่อกระเป๋า"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
              <TextField
                select
                label="เครือข่ายรับเงิน"
                value={edit.network}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    network: e.target.value === "tron" ? "tron" : "bsc",
                    address: "",
                  })
                }
              >
                <MenuItem value="bsc">BNB Smart Chain (BEP20)</MenuItem>
                <MenuItem value="tron">TRON (TRC20)</MenuItem>
              </TextField>
              <TextField
                label={
                  edit.network === "tron"
                    ? "ที่อยู่รับ TRON (TRC20)"
                    : "ที่อยู่รับ BSC (BEP20)"
                }
                helperText={
                  edit.network === "tron"
                    ? "ใช้ที่อยู่ TRON Mainnet ที่ขึ้นต้นด้วย T"
                    : "ใช้ที่อยู่ 0x ของเครือข่าย BNB Smart Chain"
                }
                value={edit.address}
                onChange={(e) =>
                  setEdit({ ...edit, address: e.target.value.trim() })
                }
              />
              <FormControlLabel
                label="อัปเดตอัตราชำระอัตโนมัติจาก Bitkub"
                control={
                  <Switch
                    checked={edit.automaticRate}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        automaticRate: e.target.checked,
                        rate: paymentRate.safeParse(edit.rate).success
                          ? edit.rate
                          : "",
                      })
                    }
                  />
                }
              />
              {edit.automaticRate ? (
                <Typography variant="body2">
                  ใช้ราคาซื้อขายล่าสุดของ USDT/THB เมื่อลูกค้าออกใบชำระ
                </Typography>
              ) : (
                <TextField
                  label="อัตรารับชำระ บาทต่อ 1 USDT"
                  value={edit.rate}
                  onChange={(e) => setEdit({ ...edit, rate: e.target.value })}
                />
              )}
              <FormControlLabel
                label="ใช้เป็นกระเป๋าหลักสำหรับรายการใหม่"
                control={
                  <Checkbox
                    checked={edit.active}
                    onChange={(e) =>
                      setEdit({ ...edit, active: e.target.checked })
                    }
                  />
                }
              />
              <Stack direction="row" sx={{ gap: 1 }}>
                <Button variant="contained" disabled={busy} onClick={save}>
                  บันทึก
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEdit(null);
                    setError("");
                  }}
                >
                  ยกเลิก
                </Button>
              </Stack>
            </Stack>
          </Paper>
        )}
        {success && <Alert severity="success">{success}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </AurumTheme>
  );
}
