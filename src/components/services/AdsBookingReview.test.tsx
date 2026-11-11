import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdsBookingReview } from "./AdsBookingReview";
import { quoteBooking } from "@/lib/ads-booking";
import { defaultAdsPage } from "@/lib/ads-page-config";
const contact={name:"Customer",email:"customer@example.org",contact:"@customer"};
it("shows per-slot quantities, unit prices, amounts and missing artwork",()=>{
 const quote=quoteBooking({kind:"slots",slots:["home_top:L1"],days:90},defaultAdsPage);
 const html=renderToStaticMarkup(<AdsBookingReview quote={quote} contact={contact} files={{}} days={90}>{null}</AdsBookingReview>);
 expect(html).toContain("1,500.00");expect(html).toContain("4,500.00");expect(html).toContain("3 รอบ");expect(html).toContain("ยังไม่ได้แนบไฟล์");expect(html).toContain("ยังไม่ชำระเงิน");
});
it("shows bundle price once and coupon in totals with exact net amount",()=>{
 const config={...defaultAdsPage,coupons:[{code:"TEN",percent:10,maxUses:10,enabled:true,startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+60000).toISOString()}]};
 const quote=quoteBooking({kind:"homepage",slots:[],days:30,couponCode:"TEN"},config);
 const html=renderToStaticMarkup(<AdsBookingReview quote={quote} contact={contact} files={{}} days={30}>{null}</AdsBookingReview>);
 expect(html).toContain("10,000.00");expect(html).toContain("−1,000.00");expect(html).toContain("9,000.00");expect(html).toContain("แพ็กเกจหน้าแรก");expect(html).not.toContain("แพ็กเกจ homepage");expect(html).toContain("16 ไฟล์");
});
it("does not display zero as a payable total when quote is invalid",()=>{
 const html=renderToStaticMarkup(<AdsBookingReview quote={null} contact={contact} files={{}} days={30}>{null}</AdsBookingReview>);
 expect(html).toContain("ยังคำนวณยอดไม่ได้");expect(html).not.toContain("0.00");
});
