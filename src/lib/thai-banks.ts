// Receiving-bank directory checked 2026-11-11. Excludes representative offices,
// finance/credit-foncier companies and institutions that are not banks.
// https://www.dpa.or.th/Protected-Financial-Institutions
// https://www.bot.or.th/th/fi-branch.html
// https://catalog.fpo.go.th/dataset/msi_d300
// Badges use abbreviations, not reproduced official bank trademarks.
export type ThaiBank = {
  id: string;
  name: string;
  short: string;
  english: string;
  color: string;
  group: string;
};
const commercial = "ธนาคารพาณิชย์ในประเทศไทย";
const state = "ธนาคารเฉพาะกิจของรัฐ";
const foreign = "สาขาธนาคารต่างประเทศ";
function bank(
  id: string,
  name: string,
  short: string,
  english: string,
  color: string,
  group = commercial,
): ThaiBank {
  return { id, name: "ธนาคาร" + name, short, english, color, group };
}
export const thaiBanks: ThaiBank[] = [
  bank("bbl", "กรุงเทพ", "BBL", "Bangkok Bank", "#1e4598"),
  bank("kbank", "กสิกรไทย", "KBank", "Kasikorn Bank", "#137447"),
  bank("ktb", "กรุงไทย", "KTB", "Krung Thai Bank", "#007fae"),
  bank("scb", "ไทยพาณิชย์", "SCB", "Siam Commercial Bank", "#4e2e7f"),
  bank("bay", "กรุงศรีอยุธยา", "BAY", "Krungsri Bank of Ayudhya", "#7c6017"),
  bank("ttb", "ทหารไทยธนชาต", "ttb", "TMBThanachart Bank", "#1753a1"),
  bank("uob", "ยูโอบี", "UOB", "United Overseas Bank", "#143d73"),
  bank("cimb", "ซีไอเอ็มบี ไทย", "CIMB", "CIMB Thai", "#a01e28"),
  bank("kkp", "เกียรตินาคินภัทร", "KKP", "Kiatnakin Phatra", "#615081"),
  bank("tisco", "ทิสโก้", "TISCO", "Tisco Bank", "#244779"),
  bank("lh", "แลนด์ แอนด์ เฮ้าส์", "LH", "Land and Houses Bank", "#555e69"),
  bank("tcrb", "ไทยเครดิต", "Thai Credit", "Thai Credit Bank", "#125ba3"),
  bank(
    "icbc",
    "ไอซีบีซี (ไทย)",
    "ICBC",
    "Industrial and Commercial Bank of China Thai",
    "#a51c30",
  ),
  bank("boc", "แห่งประเทศจีน (ไทย)", "BOC", "Bank of China Thai", "#a42132"),
  bank(
    "mega",
    "เมกะ สากลพาณิชย์",
    "MEGA",
    "Mega International Commercial Bank",
    "#66508a",
  ),
  bank(
    "smbt",
    "ซูมิโตโม มิตซุย ทรัสต์ (ไทย)",
    "SMTB",
    "Sumitomo Mitsui Trust Thai",
    "#226b58",
  ),
  bank(
    "scbt",
    "สแตนดาร์ดชาร์เตอร์ด (ไทย)",
    "SC",
    "Standard Chartered Thai",
    "#16734f",
  ),
  bank("gsb", "ออมสิน", "GSB", "Government Savings Bank", "#ad2475", state),
  bank(
    "baac",
    "เพื่อการเกษตรและสหกรณ์การเกษตร",
    "ธ.ก.ส.",
    "BAAC Bank for Agriculture and Agricultural Cooperatives",
    "#287337",
    state,
  ),
  bank(
    "ghb",
    "อาคารสงเคราะห์",
    "ธอส.",
    "GHB Government Housing Bank",
    "#a85d13",
    state,
  ),
  bank(
    "ibank",
    "อิสลามแห่งประเทศไทย",
    "iBank",
    "Islamic Bank of Thailand",
    "#527624",
    state,
  ),
  bank(
    "exim",
    "เพื่อการส่งออกและนำเข้าแห่งประเทศไทย",
    "EXIM",
    "Export Import Bank of Thailand",
    "#9d263c",
    state,
  ),
  bank(
    "sme",
    "พัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย",
    "SME",
    "SME D Bank Small and Medium Enterprise Development Bank",
    "#78417a",
    state,
  ),
  bank("citi", "ซิตี้แบงก์", "CITI", "Citibank", "#124c86", foreign),
  bank(
    "hsbc",
    "ฮ่องกงและเซี่ยงไฮ้แบงกิ้งคอร์ปอเรชั่น",
    "HSBC",
    "Hongkong and Shanghai Banking Corporation",
    "#a32934",
    foreign,
  ),
  bank(
    "jpm",
    "เจพีมอร์แกน เชส",
    "JPM",
    "JPMorgan Chase Bank",
    "#344c68",
    foreign,
  ),
  bank(
    "boa",
    "แห่งอเมริกา เนชั่นแนล แอสโซซิเอชั่น",
    "BofA",
    "Bank of America National Association",
    "#9d2437",
    foreign,
  ),
  bank(
    "ocbc",
    "โอเวอร์ซี-ไชนีส แบงกิ้งคอร์ปอเรชั่น",
    "OCBC",
    "Oversea Chinese Banking Corporation",
    "#aa2435",
    foreign,
  ),
  bank(
    "smbc",
    "ซูมิโตโม มิตซุย แบงกิ้ง คอร์ปอเรชั่น",
    "SMBC",
    "Sumitomo Mitsui Banking Corporation",
    "#25654b",
    foreign,
  ),
  bank("db", "ดอยซ์แบงก์", "DB", "Deutsche Bank", "#154383", foreign),
  bank("bnp", "บีเอ็นพี พารีบาส์", "BNP", "BNP Paribas", "#19704a", foreign),
  bank("mizuho", "มิซูโฮ", "MIZUHO", "Mizuho Bank", "#273d79", foreign),
  bank("rhb", "อาร์ เอช บี", "RHB", "RHB Bank", "#007ca0", foreign),
  bank(
    "iob",
    "อินเดียน โอเวอร์ซีส์",
    "IOB",
    "Indian Overseas Bank",
    "#28598f",
    foreign,
  ),
  bank(
    "cliq",
    "คลิกซ์",
    "CLIQ",
    "Cliq Bank",
    "#334e8c",
    "ธนาคารพาณิชย์ไร้สาขา",
  ),
];
export function findThaiBank(value: string) {
  const normalized = value.trim().toLocaleLowerCase();
  return thaiBanks.find((b) =>
    [b.name, b.id, b.short, b.english].some(
      (v) => v.toLocaleLowerCase() === normalized,
    ),
  );
}
