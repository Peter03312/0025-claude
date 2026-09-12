/**
 * 一次性验收的冒烟检查：确认 web 服务真正返回了核样台页面。
 * 在 compose 网络内默认访问 http://web:80/，可用 SMOKE_URL 覆盖。
 */
const url = process.env.SMOKE_URL ?? 'http://web:80/';
const deadline = Date.now() + 30_000;

let lastError = null;
while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('id="app"')) throw new Error('响应中缺少 #app 挂载点');
    if (!html.includes('锁线装帧核样台')) throw new Error('响应中缺少页面标题');
    console.log(`smoke ok: ${url}`);
    process.exit(0);
  } catch (err) {
    lastError = err;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

console.error(`smoke failed: ${url}`, lastError);
process.exit(1);
