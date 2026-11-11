import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {PaymentSlipHelp} from "./PaymentSlipHelp";
it("shows order ID, exact amount and manual review instructions without marking paid",()=>{
 const html=renderToStaticMarkup(<PaymentSlipHelp id="order-123" amount={1500} expanded/>);
 expect(html).toContain("order-123");expect(html).toContain("1,500.00");expect(html).toContain("คัดลอกหมายเลขคำสั่งซื้อ");expect(html).toContain('href="https://t.me/thaitubevideo"');expect(html).toContain("รอแอดมินตรวจสอบ");expect(html).toContain("ไม่ต้องชำระซ้ำ");expect(html).toContain('open=""');
});
