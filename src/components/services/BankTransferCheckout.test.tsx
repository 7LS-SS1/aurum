import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaymentMethods } from "./BankTransferCheckout";
import { AurumTheme } from "../ui/AurumTheme";
describe("payment options", () => {
  it("shows bank transfer and both unavailable USDT networks without payment links", () => {
    const html = renderToStaticMarkup(
      <AurumTheme>
        <PaymentMethods />
      </AurumTheme>,
    );
    expect(html).toContain("โอนเงินแนบสลิป");
    expect(html).toContain("BEP20-USDT");
    expect(html).toContain("TRC20-USDT");
    expect(html.match(/รอเปิดใช้งานเร็ว ๆ นี้/g)).toHaveLength(2);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("PromptPay");
  });
});
