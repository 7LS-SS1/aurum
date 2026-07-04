/**
 * Exercises the real Auth.js HTTP credentials flow against a running app.
 *
 * Usage:
 *   APP_URL=http://localhost:3000 ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:check-http-login
 *
 * This intentionally does not print passwords, hashes, session tokens, or CSRF
 * token values. It only reports whether each step succeeded and where Auth.js
 * redirected the request.
 */
const appUrl = (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
const email = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;

function appendCookie(jar: Map<string, string>, setCookie: string | null) {
  if (!setCookie) return;
  for (const raw of setCookie.split(/,(?=[^;]+?=)/)) {
    const first = raw.split(";")[0] ?? "";
    const eq = first.indexOf("=");
    if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function listSafeCookies(jar: Map<string, string>) {
  return [...jar.keys()].sort().join(", ") || "-";
}

async function main() {
  if (!email || !password) {
    console.error("Usage: APP_URL=http://... ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:check-http-login");
    process.exit(1);
  }

  const jar = new Map<string, string>();
  console.log(`APP_URL: ${appUrl}`);

  const csrfRes = await fetch(`${appUrl}/api/auth/csrf`, { redirect: "manual" });
  appendCookie(jar, csrfRes.headers.get("set-cookie"));
  const csrf = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
  console.log(`CSRF_STATUS: ${csrfRes.status}`);
  console.log(`CSRF_TOKEN: ${csrf.csrfToken ? "yes" : "no"}`);
  console.log(`COOKIES_AFTER_CSRF: ${listSafeCookies(jar)}`);

  if (!csrf.csrfToken) process.exit(2);

  const body = new URLSearchParams({
    email,
    password,
    csrfToken: csrf.csrfToken,
    callbackUrl: `${appUrl}/admin`,
  });

  const loginRes = await fetch(`${appUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(jar),
    },
    body,
  });

  appendCookie(jar, loginRes.headers.get("set-cookie"));
  console.log(`LOGIN_STATUS: ${loginRes.status}`);
  console.log(`LOGIN_LOCATION: ${loginRes.headers.get("location") || "-"}`);
  console.log(`COOKIES_AFTER_LOGIN: ${listSafeCookies(jar)}`);

  const sessionRes = await fetch(`${appUrl}/api/auth/session`, {
    redirect: "manual",
    headers: { cookie: cookieHeader(jar) },
  });
  const sessionText = await sessionRes.text();
  console.log(`SESSION_STATUS: ${sessionRes.status}`);
  console.log(`SESSION_HAS_USER: ${sessionText.includes('"user"') ? "yes" : "no"}`);

  const adminRes = await fetch(`${appUrl}/admin`, {
    redirect: "manual",
    headers: { cookie: cookieHeader(jar) },
  });
  console.log(`ADMIN_STATUS: ${adminRes.status}`);
  console.log(`ADMIN_LOCATION: ${adminRes.headers.get("location") || "-"}`);

  const ok = loginRes.status >= 300 && loginRes.status < 400 && sessionText.includes('"user"') && adminRes.status !== 302;
  process.exit(ok ? 0 : 3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
