import {describe,it,expect} from "vitest";
import {gatewayPaymentTime} from "./gateway-payment-time";
describe("merchant payment time",()=>{
 const now=new Date("2026-11-07T00:00:00Z");
 it("requires explicit merchant timezone",()=>{expect(gatewayPaymentTime("20261106123045","",now)).toBeNull();expect(gatewayPaymentTime("20261106123045","+07:00",now)).toBe("2026-11-06T05:30:45.000Z");});
 it("rejects invalid dates and future timestamps",()=>{expect(gatewayPaymentTime("20260230120000","+07:00",now)).toBeNull();expect(gatewayPaymentTime("20261108120000","+07:00",now)).toBeNull();expect(gatewayPaymentTime("20261106250000","+07:00",now)).toBeNull();});
});
