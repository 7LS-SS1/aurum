import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentMethods } from "./BankTransferCheckout";
import { AurumTheme } from "../ui/AurumTheme";
describe("payment options", () => {
  it("shows selectable BEP20 and bank transfer while TRC20 remains disabled", () => {
    const html = renderToStaticMarkup(
      <AurumTheme>
        <PaymentMethods value="usdt" usdtReady onSelect={()=>{}} />
      </AurumTheme>,
    );
    expect(html).toContain("โอนเงินแนบสลิป");
    expect(html).toContain("BEP20-USDT");
    expect(html).toContain("TRC20-USDT");
    expect(html.match(/ยังไม่เปิดรับชำระ/g)).toHaveLength(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("href=");
    expect(html).not.toContain("PromptPay");
  });
});
