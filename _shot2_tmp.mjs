import { chromium } from "playwright-core";
import path from "node:path";
import { pathToFileURL } from "node:url";

const exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const file = pathToFileURL(path.resolve("_repro2_tmp.html")).href;

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
await page.goto(file);
await page.screenshot({ path: "_repro2_tmp.png" });
await browser.close();
console.log("done");
