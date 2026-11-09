// 2C2P returns yyyyMMddHHmmss without a timezone. Configure the offset only
// after it is confirmed for this merchant account; unknown remains unknown.
export function gatewayPaymentTime(value: unknown, offset = process.env.TWOC2P_TRANSACTION_UTC_OFFSET, now = new Date()): string | null {
  if(typeof value!=="string"||!/^\d{14}$/.test(value)||!offset||!/^([+-])(0\d|1[0-4]):[0-5]\d$/.test(offset))return null;
  const parts=[value.slice(0,4),value.slice(4,6),value.slice(6,8),value.slice(8,10),value.slice(10,12),value.slice(12,14)].map(Number);
  const [y,m,d,h,min,s]=parts as [number,number,number,number,number,number];
  const local=new Date(Date.UTC(y,m-1,d,h,min,s));
  if(local.getUTCFullYear()!==y||local.getUTCMonth()!==m-1||local.getUTCDate()!==d||local.getUTCHours()!==h||local.getUTCMinutes()!==min||local.getUTCSeconds()!==s)return null;
  const minutes=(Number(offset.slice(1,3))*60+Number(offset.slice(4)))*(offset[0]==="-"?-1:1);
  const date=new Date(local.getTime()-minutes*60000);
  return date.getTime()>now.getTime()+60000?null:date.toISOString();
}
