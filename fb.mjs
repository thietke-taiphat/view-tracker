// Đọc danh sách Reels công khai của 1 Page Facebook: node scripts/fb.mjs <url> <out.json> <cache.json>
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url, out, cachePath] = process.argv.slice(2);
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};

function parseCount(s) {
  if (!s) return null;
  const m = s.trim().match(/^([\d.,]+)\s*(K|M|N|Tr|B)?$/i);
  if (!m) return null;
  let num = m[1], suf = (m[2] || '').toLowerCase();
  if (suf) num = parseFloat(num.replace(',', '.'));
  else num = parseInt(num.replace(/[.,]/g, ''), 10);
  const mult = { k: 1e3, n: 1e3, m: 1e6, tr: 1e6, b: 1e9 }[suf] || 1;
  return Math.round(num * mult);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  locale: 'vi-VN',
  viewport: { width: 1280, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
});
const page = await ctx.newPage();
const reels = new Map();
let followers = null;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  try {
    const body = await page.innerText('body');
    const fm = body.match(/([\d.,]+\s*(?:K|M|N|Tr)?)\s*(?:người theo dõi|followers)/i);
    followers = fm ? parseCount(fm[1]) : null;
  } catch (e) {}
  let stable = 0;
  for (let i = 0; i < 60 && stable < 4; i++) {
    const items = await page.$$eval('a[href*="/reel/"]', as => as.map(a => [a.href, a.innerText.trim()]));
    const before = reels.size;
    for (const [href, txt] of items) {
      const m = href.match(/\/reel\/(\d+)/);
      if (m && !reels.has(m[1])) reels.set(m[1], { id: m[1], url: `https://www.facebook.com/reel/${m[1]}/`, views: parseCount(txt.split('\n').pop()) });
    }
    stable = reels.size === before ? stable + 1 : 0;
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(1500);
  }
  // Lấy tiêu đề (caption) cho reel mới; reel cũ dùng cache
  const todo = [...reels.keys()].filter(id => !cache[id]);
  const worker = async () => {
    const p = await ctx.newPage();
    while (todo.length) {
      const id = todo.pop();
      try {
        await p.goto(`https://www.facebook.com/reel/${id}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(1500);
        const t = await p.$eval('meta[property="og:description"]', m => m.content).catch(() => '');
        if (t) cache[id] = t.split('\n')[0].trim();
      } catch (e) { /* bỏ qua, lần sau thử lại */ }
    }
    await p.close();
  };
  await Promise.all([worker(), worker(), worker()]);
} catch (e) {
  console.error('FB error:', e.message);
}
await browser.close();
const list = [...reels.values()].map(r => ({ ...r, title: cache[r.id] || '' }));
fs.writeFileSync(cachePath, JSON.stringify(cache));
fs.writeFileSync(out, JSON.stringify({ followers, reels: list }));
console.log(`FB ${url}: ${list.length} reels, ${list.filter(r => r.title).length} có tiêu đề`);
process.exit(0);
