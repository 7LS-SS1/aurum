"use client";
import { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Chip,
  Button,
  Stack,
  Typography,
  Alert,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  displayUnits,
  token,
  transferData,
  type Network,
  type Invoice,
} from "@/lib/usdt";
import { QRCodeSVG } from "qrcode.react";
import { connectTron, sendTron } from "@/lib/usdt-tron-wallet";
const bookingErrors: Record<string, string> = {
  slots_unavailable:
    "ตำแหน่งโฆษณาในคำสั่งซื้อนี้มีผู้จองแล้ว กรุณาเลือกตำแหน่งว่างเพื่อสร้างคำสั่งซื้อใหม่",
  website_unavailable: "เว็บไซต์นี้ปิดรับจองแล้ว กรุณาเลือกเว็บไซต์อื่น",
  inventory_changed: "ตำแหน่งโฆษณานี้ปิดรับจองแล้ว กรุณาเลือกตำแหน่งใหม่",
  renewal_expired: "หมดเขตต่ออายุแล้ว กรุณาจองบริการใหม่",
};
type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
export function UsdtCheckout({
  id,
  status,
  reload,
  network,
}: {
  network: Network;
  id: string;
  status: string;
  reload: () => Promise<void>;
}) {
  const [bill, setBill] = useState<Invoice | null>(null),
    [blocked, setBlocked] = useState<string | null>(null),
    [available, setAvailable] = useState(false),
    [preview, setPreview] = useState<{
      rate: string;
      units: string;
      automatic: boolean;
      fetchedAt: string | null;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const endpoint = "/api/public/payments/usdt";
  useEffect(() => {
    let live = true;
    let loading = false;
    async function refresh() {
      if (loading) return;
      loading = true;
      try {
        const r = await fetch(endpoint + "?network=" + network + "&id=" + id, {
          cache: "no-store",
        });
        if (!r.ok) throw Error();
        const b = await r.json();
        if (live) {
          setBill(b.invoice);
          setAvailable(b.available);
          setBlocked(b.blockedReason ?? null);
          setPreview(b.preview);
          setSent(!!sessionStorage.getItem("usdt:" + id));
        }
      } catch {
        if (live) setPreview(null);
      } finally {
        loading = false;
      }
    }
    void refresh();
    const timer =
      status === "REVIEW"
        ? setInterval(() => void refresh(), 15000)
        : undefined;
    return () => {
      clearInterval(timer);
      live = false;
    };
  }, [id, status, network]);
  useEffect(() => {
    if (!bill || bill.settled || status !== "PAYMENT") return;
    let checking = false;
    async function check() {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const r = await fetch(endpoint + "?check=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (r.ok) await reload();
      } catch {
        /* The background worker retries independently. */
      } finally {
        checking = false;
      }
    }
    const timer = setInterval(() => void check(), 12000);
    return () => clearInterval(timer);
  }, [id, bill, status, reload]);
  const selectedNetwork = bill?.network ?? network;
  const [wallets, setWallets] = useState<
    { id: string; name: string; provider: Provider }[]
  >([]);
  const [choice, setChoice] = useState("");
  const [search, setSearch] = useState(0);
  useEffect(() => {
    if (selectedNetwork !== "bsc") return;
    const browser = window as Window & { ethereum?: Provider };
    const found = new Map<
      string,
      { id: string; name: string; provider: Provider }
    >();
    function publish() {
      const options = Array.from(found.values());
      if (!options.length && typeof browser.ethereum?.request === "function")
        options.push({
          id: "injected",
          name: "กระเป๋าในเบราว์เซอร์",
          provider: browser.ethereum,
        });
      setWallets(options);
    }
    function announce(event: Event) {
      const item = (event as CustomEvent).detail;
      if (
        typeof item?.info?.uuid !== "string" ||
        typeof item.info.name !== "string" ||
        typeof item.provider?.request !== "function"
      )
        return;
      found.set(item.info.uuid, {
        id: item.info.uuid,
        name: item.info.name,
        provider: item.provider,
      });
      publish();
    }
    function discover() {
      browser.dispatchEvent(new Event("eip6963:requestProvider"));
      publish();
    }
    browser.addEventListener("eip6963:announceProvider", announce);
    browser.addEventListener("ethereum#initialized", discover);
    browser.addEventListener("focus", discover);
    discover();
    return () => {
      browser.removeEventListener("eip6963:announceProvider", announce);
      browser.removeEventListener("ethereum#initialized", discover);
      browser.removeEventListener("focus", discover);
    };
  }, [selectedNetwork, search]);
  const wallet = wallets.find((w) => w.id === choice) ?? wallets[0];
  const [copied, setCopied] = useState("");
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("คัดลอก" + label + "แล้ว");
    } catch {
      setCopied("กรุณาเลือกข้อความแล้วคัดลอกด้วยตนเอง");
    }
  }
  async function issueInvoice(
    payment: { from: string } | { method: "mobile" },
  ) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, network: selectedNetwork, ...payment }),
    });
    if (!r.ok) {
      const body = await r.json();
      if (body.error === "usdt_rate_unavailable") {
        setPreview(null);
        throw Error("ราคาตลาดไม่พร้อม กรุณารอการอัปเดตครั้งถัดไป");
      }
      if (body.error === "usdt_mobile_amount_unavailable")
        throw Error(
          "ยังไม่มียอดสำหรับการโอนจากมือถือ กรุณาใช้วิธีเชื่อมกระเป๋า",
        );
      if (bookingErrors[body.error]) {
        setBlocked(body.error);
        throw Error(bookingErrors[body.error]);
      }
      throw Error(
        "ออกใบชำระไม่ได้ กรุณาตรวจสอบสถานะรายการ (" +
          (body.error ?? r.status) +
          ")",
      );
    }
    setBill(await r.json());
    await reload();
  }
  async function openMobile() {
    setBusy(true);
    setError("");
    try {
      await issueInvoice({ method: "mobile" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ออกใบชำระไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    setBusy(true);
    setError("");
    try {
      const provider = wallet?.provider;
      const tron = selectedNetwork === "tron" ? await connectTron() : null;
      let from: string;
      if (tron) from = tron.defaultAddress.base58;
      else {
        if (!provider) throw Error("กรุณาเชื่อมกระเป๋า BNB Smart Chain");
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (!accounts[0]) throw Error("กรุณาเลือกบัญชีในกระเป๋า");
        from = accounts[0].toLowerCase();
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x38" }],
        });
      }
      if (!bill) {
        await issueInvoice({ from });
        return;
      }
      if (Date.now() >= Date.parse(bill.expires))
        throw Error("รายการหมดอายุแล้ว");
      if (from !== bill.from)
        throw Error("กรุณาใช้กระเป๋าที่เชื่อมไว้กับรายการนี้");
      if (tron) await sendTron(tron, bill);
      else
        await provider!.request({
          method: "eth_sendTransaction",
          params: [{ from, to: token, data: transferData(bill) }],
        });
      setSent(true);
      sessionStorage.setItem("usdt:" + id, "1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เชื่อมต่อกระเป๋าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  if (blocked && !bill)
    return (
      <Alert severity="warning">
        {bookingErrors[blocked] ?? "รายการนี้ยังไม่พร้อมรับชำระ"}{" "}
        <Button href="/services/ads-banner/book">เลือกตำแหน่งว่าง</Button>
      </Alert>
    );
  if (!available && !bill) return null;
  return (
    <Stack spacing={1}>
      <Typography variant="h6">
        USDT ·{" "}
        {selectedNetwork === "tron"
          ? "TRON (TRC20)"
          : "BNB Smart Chain (BEP20)"}
      </Typography>
      {!bill &&
        (preview ? (
          <Typography>
            ยอดประมาณ {displayUnits(preview.units, selectedNetwork)} USDT ·{" "}
            {preview.rate} บาท/USDT
            {preview.automatic && preview.fetchedAt && (
              <>
                {" "}
                · Bitkub · ดึงราคาเมื่อ{" "}
                {new Date(preview.fetchedAt).toLocaleTimeString("th-TH")}
              </>
            )}
          </Typography>
        ) : (
          <Alert severity="warning">
            ยังดึงอัตราชำระไม่ได้ ระบบจะลองใหม่อัตโนมัติ
          </Alert>
        ))}
      {bill && !bill.mobile && (
        <Typography sx={{ overflowWrap: "anywhere" }}>
          ยอด {displayUnits(bill.units, selectedNetwork)} USDT · {bill.rate}{" "}
          บาท/USDT
          <br />
          ผู้รับ {bill.to}
          <br />
          ชำระภายใน {new Date(bill.expires).toLocaleString("th-TH")}
        </Typography>
      )}
      {!bill && status === "REVIEW" && (
        <Button
          variant="outlined"
          disabled={busy || !preview}
          onClick={openMobile}
        >
          ชำระผ่านมือถือ · คัดลอกที่อยู่หรือสแกน QR
        </Button>
      )}
      {bill?.mobile &&
        status === "PAYMENT" &&
        !bill.settled &&
        (Date.now() < Date.parse(bill.expires) ? (
          <Paper
            component="section"
            variant="outlined"
            sx={{
              p: { xs: 2.5, md: 4 },
              borderRadius: 3,
              backgroundColor: "background.paper",
              borderTop: "3px solid",
              borderTopColor: "primary.main",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "minmax(0,1fr)",
                  md: "minmax(0,1fr) auto",
                },
                gap: { xs: 3, md: 5 },
                alignItems: "center",
              }}
            >
              <Stack spacing={2} sx={{ minWidth: 0 }}>
                <Box>
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    label={
                      selectedNetwork === "tron"
                        ? "TRON · TRC20"
                        : "BNB Smart Chain · BEP20"
                    }
                  />
                </Box>
                <Box>
                  <Typography color="text.secondary">
                    ยอดที่ผู้รับต้องได้รับ
                  </Typography>
                  <Typography
                    component="p"
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: "1.9rem", md: "2.7rem" },
                      lineHeight: 1.25,
                      fontVariantNumeric: "tabular-nums",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {displayUnits(bill.units, selectedNetwork)}{" "}
                    <Box
                      component="span"
                      sx={{ fontSize: "1rem", color: "primary.main" }}
                    >
                      USDT
                    </Box>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    อัตรา {bill.rate} บาทต่อ USDT · โอนให้ตรงทั้ง 6 ตำแหน่ง
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    ที่อยู่กระเป๋ารับเงิน
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "monospace",
                      overflowWrap: "anywhere",
                      userSelect: "all",
                    }}
                  >
                    {bill.to}
                  </Typography>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <Button
                    variant="contained"
                    onClick={() =>
                      void copy(
                        displayUnits(bill.units, selectedNetwork),
                        "ยอด",
                      )
                    }
                  >
                    คัดลอกยอด USDT
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => void copy(bill.to, "ที่อยู่")}
                  >
                    คัดลอกที่อยู่กระเป๋า
                  </Button>
                </Stack>
                {copied && <Typography role="status">{copied}</Typography>}
              </Stack>
              <Stack spacing={1} sx={{ alignItems: "center" }}>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: "white",
                    borderRadius: 2,
                    lineHeight: 0,
                    maxWidth: "100%",
                  }}
                >
                  <QRCodeSVG
                    value={bill.to}
                    size={200}
                    marginSize={4}
                    style={{ maxWidth: "100%", height: "auto" }}
                    title="QR ที่อยู่กระเป๋ารับ USDT"
                  />
                </Box>
                <Typography variant="body2">
                  สแกนเพื่อกรอกที่อยู่ผู้รับ
                </Typography>
              </Stack>
            </Box>
            <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}>
              <Typography sx={{ fontWeight: 600 }}>
                ชำระภายใน {new Date(bill.expires).toLocaleString("th-TH")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                หลังโอน ระบบจะตรวจเงินเข้าและอัปเดตสถานะให้อัตโนมัติ
              </Typography>
            </Box>
          </Paper>
        ) : (
          <Alert severity="warning">ใบชำระหมดอายุแล้ว กรุณางดโอนเงิน</Alert>
        ))}
      {!bill?.mobile &&
        selectedNetwork === "bsc" &&
        !sent &&
        ["REVIEW", "PAYMENT"].includes(status) &&
        (wallets.length === 0 ? (
          <Alert
            severity="info"
            action={
              <Button onClick={() => setSearch((v) => v + 1)}>
                ค้นหาอีกครั้ง
              </Button>
            }
          >
            ไม่พบกระเป๋าในเบราว์เซอร์นี้ เปิดส่วนขยายกระเป๋าที่รองรับ BNB Smart
            Chain และอนุญาตให้เข้าถึงเว็บไซต์นี้ แล้วกดค้นหาอีกครั้ง
          </Alert>
        ) : wallets.length > 1 ? (
          <TextField
            select
            label="กระเป๋าที่ใช้จ่าย"
            value={wallet?.id ?? ""}
            onChange={(e) => setChoice(e.target.value)}
          >
            {wallets.map((w) => (
              <MenuItem key={w.id} value={w.id}>
                {w.name}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Typography variant="body2">กระเป๋าที่พบ · {wallet?.name}</Typography>
        ))}
      {!bill?.mobile &&
        (status === "REVIEW" || status === "PAYMENT") &&
        (sent ? (
          <Alert severity="info">ส่งธุรกรรมแล้ว กำลังตรวจสอบบนเครือข่าย</Alert>
        ) : (
          <Button
            disabled={
              busy ||
              (selectedNetwork === "bsc" && !wallet) ||
              (!bill && !preview) ||
              (!!bill && Date.parse(bill.expires) <= Date.now())
            }
            onClick={pay}
          >
            {bill ? "ยืนยันยอดในกระเป๋า" : "เชื่อมกระเป๋าเพื่อชำระ USDT"}
          </Button>
        ))}
      {bill && !bill.mobile && !sent && status === "PAYMENT" && (
        <Typography variant="caption">
          {selectedNetwork === "tron"
            ? "ตรวจสอบค่า Energy และค่าธรรมเนียม TRX ใน TronLink ก่อนยืนยัน"
            : "กระเป๋าผู้จ่ายต้องมี BNB สำหรับค่าธรรมเนียมเครือข่าย"}
        </Typography>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
