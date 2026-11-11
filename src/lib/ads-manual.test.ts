import { describe,it,expect } from "vitest";
import { manualAdsSchema,manualReserved,manualServing, type ManualAd } from "./ads-manual";
const ad:ManualAd={slot:"home_top:L1",title:"Test",url:"https://media.example/a.jpg",targetUrl:"https://example.org",startsAt:"2030-01-01T00:00:00Z",endsAt:"2030-02-01T00:00:00Z",enabled:true};
describe("manual ads",()=>{
 it("reserves a future ad but does not show it early",()=>{const now=Date.parse("2029-12-01");expect(manualReserved(ad,now)).toBe(true);expect(manualServing(ad,now)).toBe(false);});
 it("releases disabled and expired slots",()=>{expect(manualReserved({...ad,enabled:false},0)).toBe(false);expect(manualReserved(ad,Date.parse(ad.endsAt))).toBe(false);});
 it("rejects duplicate slots, unsafe URLs and inverted dates",()=>{expect(manualAdsSchema.safeParse([ad,ad]).success).toBe(false);expect(manualAdsSchema.safeParse([{...ad,url:"javascript:alert(1)"}]).success).toBe(false);expect(manualAdsSchema.safeParse([{...ad,startsAt:ad.endsAt}]).success).toBe(false);});
});
