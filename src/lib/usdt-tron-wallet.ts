import { transferData, tronToken, rpcAddress, type Invoice } from "./usdt";

type Transaction = {
  raw_data: {
    contract: {
      type: string;
      parameter: {
        value: {
          owner_address: string;
          contract_address: string;
          data: string;
          call_value?: number;
        };
      };
    }[];
    fee_limit: number;
  };
};
type TronWeb = {
  defaultAddress: { base58: string };
  trx: {
    getBlock(n: number): Promise<{ blockID: string }>;
    sign(tx: Transaction): Promise<Transaction>;
    sendRawTransaction(tx: Transaction): Promise<{ result?: boolean }>;
  };
  transactionBuilder: {
    triggerSmartContract(
      address: string,
      fn: string,
      options: { feeLimit: number; rawParameter: string },
      args: unknown[],
      from: string,
    ): Promise<{ result: { result?: boolean }; transaction: Transaction }>;
  };
};
export async function connectTron() {
  const link = (
    window as Window & {
      tronLink?: {
        request(args: { method: string }): Promise<unknown>;
        tronWeb?: TronWeb;
      };
    }
  ).tronLink;
  if (!link)
    throw Error("กรุณาเปิดผ่าน TronLink หรือเชื่อมต่อส่วนขยาย TronLink");
  await link.request({ method: "tron_requestAccounts" });
  const web = link.tronWeb;
  if (!web?.defaultAddress.base58) throw Error("กรุณาเลือกบัญชีใน TronLink");
  if (
    (await web.trx.getBlock(0)).blockID !==
    "00000000000000001ebf88508a03865c71d452e25f4d51194196a1d22b6653dc"
  )
    throw Error("กรุณาเลือก TRON Mainnet ใน TronLink");
  return web;
}
export async function sendTron(web: TronWeb, bill: Invoice) {
  if (!bill.from || bill.mobile)
    throw Error("กรุณาใช้การโอนจากมือถือสำหรับใบชำระนี้");
  const data = transferData(bill).slice(2);
  const feeLimit = 100_000_000;
  const result = await web.transactionBuilder.triggerSmartContract(
    tronToken,
    "transfer(address,uint256)",
    { feeLimit, rawParameter: data.slice(8) },
    [],
    bill.from,
  );
  const tx = result.transaction,
    contracts = tx?.raw_data.contract;
  const contract = contracts?.[0],
    v = contract?.parameter.value;
  const hex = (a: string) => "41" + rpcAddress(a, "tron").slice(2);
  if (
    !result.result.result ||
    contracts?.length !== 1 ||
    contract?.type !== "TriggerSmartContract" ||
    !v ||
    v.data.toLowerCase() !== data ||
    v.contract_address.toLowerCase() !== hex(tronToken) ||
    v.owner_address.toLowerCase() !== hex(bill.from) ||
    v.call_value ||
    tx.raw_data.fee_limit !== feeLimit
  )
    throw Error("ข้อมูลธุรกรรมไม่ตรงกับใบชำระ");
  const signed = await web.trx.sign(tx);
  if (!(await web.trx.sendRawTransaction(signed)).result)
    throw Error("ส่งธุรกรรม TRON ไม่สำเร็จ");
}
