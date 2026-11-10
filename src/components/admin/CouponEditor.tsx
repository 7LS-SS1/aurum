"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Chip, Paper, Stack, TextField, Typography, FormControlLabel, Switch } from "@mui/material";
import type { AdsPageConfig } from "@/lib/ads-page-config";
import { bangkokInput, bangkokIso, couponState } from "@/lib/coupon-schedule";
type Coupon = AdsPageConfig["coupons"][number];
export function CouponEditor({ coupons, onChange }: { coupons: Coupon[]; onChange: (coupons: Coupon[]) => void }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  return <Stack spacing={2}>
    <Typography variant="h6">ส่วนลดลูกค้าและกำหนดเวลา</Typography>
    <Alert severity="info">วันและเวลาใช้เขตประเทศไทย (UTC+7) เริ่มใช้ได้ตั้งแต่เวลาเริ่ม และหยุดรับโค้ดเมื่อถึงเวลาสิ้นสุด ใช้ได้ครั้งเดียวต่อบัญชี นับสิทธิ์เมื่อส่งคำสั่งซื้อ และไม่คืนสิทธิ์อัตโนมัติเมื่อยกเลิก</Alert>
    <Button type="button" variant="outlined" disabled={coupons.length >= 50} onClick={() => onChange([...coupons, { code: "PROMO_"+crypto.randomUUID().slice(0,8).toUpperCase(), percent: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now()+30*86400000).toISOString(), maxUses: 100, enabled: false }])}>เพิ่มรหัสส่วนลด</Button>
    {coupons.map((coupon, index) => {
      const update = (changes: Partial<Coupon>) => onChange(coupons.map((c,i) => i === index ? {...c,...changes} : c));
      const invalid = !coupon.startsAt || !coupon.endsAt || Date.parse(coupon.endsAt) <= Date.parse(coupon.startsAt);
      return <Paper key={index} variant="outlined" sx={{ p: 3 }}><Stack spacing={2}>
        <Chip label={now === null ? "กำลังตรวจสอบเวลา" : couponState(coupon, now)} sx={{ alignSelf: "start" }} />
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="รหัสส่วนลด" required value={coupon.code} onChange={e => update({ code: e.target.value.trim().toUpperCase() })} helperText="3–30 ตัวอักษร A–Z, 0–9, _ หรือ -" />
          <TextField label="ส่วนลด (%)" type="number" required value={coupon.percent} onChange={e => update({ percent: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, max: 90 } }} />
          <TextField label="จำนวนสิทธิ์ทั้งหมด" type="number" required value={coupon.maxUses} onChange={e => update({ maxUses: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, max: 100000 } }} />
        </Stack>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="วันเริ่มและเวลา (ประเทศไทย)" type="datetime-local" required value={bangkokInput(coupon.startsAt)} onChange={e => update({ startsAt: bangkokIso(e.target.value) })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="วันสิ้นสุดและเวลา (ประเทศไทย)" type="datetime-local" required error={invalid} helperText={invalid ? "วันสิ้นสุดต้องอยู่หลังวันเริ่ม" : "หากต้องการใช้ได้ตลอดวัน ให้เลือกเวลา 00:00 ของวันถัดไป"} value={bangkokInput(coupon.endsAt)} onChange={e => update({ endsAt: bangkokIso(e.target.value) })} slotProps={{ inputLabel: { shrink: true } }} />
        </Stack>
        <FormControlLabel control={<Switch checked={coupon.enabled} onChange={e => update({ enabled: e.target.checked })} />} label="เปิดใช้งานตามช่วงวันที่กำหนด" />
      </Stack></Paper>;
    })}
    <Typography variant="caption">กดบันทึกการเปลี่ยนแปลงด้านบนเพื่อใช้งานจริง รหัสที่เปิดใช้เป็นข้อเสนอสาธารณะ คำสั่งซื้อเดิมเก็บยอดและเงื่อนไขเดิมไว้</Typography>
  </Stack>;
}
