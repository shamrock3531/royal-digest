// Резервный сборщик «Королевского дайджеста» для GitHub Actions.
// Работает как страховка: если index.html уже содержит сегодняшний выпуск —
// ничего не делает. Иначе собирает свежие новости о британской монархии,
// переводит и пересказывает их на русский через GitHub Models и публикует
// в существующем формате страницы (массивы NEWS и STORIES).
//
// Правки только в блоках данных и в дате выпуска — вёрстка, стили, скрипты
// (в т.ч. авто-обновление страницы) остаются нетронутыми. Запись в файл
// происходит один раз в самом конце: любой сбой на промежуточном шаге
// оставляет index.html без изменений (страница не портится).

import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'index.html';
const TZ_OFFSET_MIN = 180; // Москва, UTC+3
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля',
  'августа','сентября','октября','ноября','декабря'];

const now = new Date(Date.now() + TZ_OFFSET_MIN * 60000); // московское «стенное» время
const today = now.toISOString().slice(0, 10);
const ruDate = `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

let html = readFileSync(FILE, 'utf8');

// 1. Уже сегодняшний выпуск? — выходим без изменений.
const lu = (html.match(/"lastUpdate":"([0-9-]+)"/) || [])[1] || null;
if (lu === today) {
  console.log(`already up to date (${today}) — no-op`);
  process.exit(0);
}

// 2. Уже известные ссылки — чтобы не дублировать.
const newsBlock = html.slice(
  html.indexOf('const NEWS = ['),
  html.indexOf('];\n/* ==== NEWS_DATA_END')
);
const knownUrls = new Set([...newsBlock.matchAll(/"url":\s*"([^"]+)"/g)].map(m => m[1]));

// 3. Кандидаты из RSS-лент.
async function getText(u) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'royal-digest-bot' } });
    return r.ok ? await r.text() : '';
  } catch (e) { console.log('feed err', u, e.message); return ''; }
}
function parseRss(xml) {
  const out = [];
  const clean = s => s.replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  for (const m of xml.matchAll(/<item[\s\S]*?<\/item>/g)) {
    const it = m[0];
    const t = clean((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const l = clean((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    if (t && l) out.push({ title: t, link: l });
  }
  return out;
}

const FEEDS = [
  'https://news.google.com/rss/search?q=(%22royal%20family%22%20OR%20%22King%20Charles%22%20OR%20%22Prince%20William%22%20OR%20%22Princess%20of%20Wales%22%20OR%20%22Prince%20Harry%22)%20when:2d&hl=en-GB&gl=GB&ceid=GB:en',
  'https://www.theguardian.com/uk/royals/rss'
];
let cands = [];
for (const f of FEEDS) cands.push(...parseRss(await getText(f)));

const seen = new Set();
cands = cands.filter(c => {
  const k = c.title.toLowerCase();
  if (seen.has(k) || knownUrls.has(c.link)) return false;
  seen.add(k); return true;
}).slice(0, 14);

if (cands.length === 0) { console.log('no fresh candidates — no-op'); process.exit(0); }

// 4. GitHub Models: перевод + пересказ в нашу JSON-схему.
const token = process.env.GITHUB_TOKEN;
const sys = `Ты — редактор русскоязычного дайджеста о британской королевской семье.
На вход даны заголовки и ссылки англоязычных новостей. Верни СТРОГО JSON без markdown-обёртоъ:${\"news\":[...],\"stories\":[...]}.
news — массив объектов вида {"date":"${today}","title":"<заголовок по-русски>","source":"<издание>","tier":"official|quality|glossy|tabloid","url":"<исходная ссылка>","persons":["..."],"topics":["..."],"sum":"<пересказ по-русски, 2–3 предложения>"}.
Включай ТОЛЬКО материалы, реально относящиеся к британской монархии; отсеивай рекламу, гороскопы и повторы.
persons выбирай из: Карл III, Камилла, Уильям, Кейт, Джордж, Шарлотта, Луи, Гарри, Меган, Эндрю, Сара Фергюсон, Евгения, Беатрис, Анна, Софи, Эдвард, Елизавета II (память), Диана (память).
topics выбирай из: Официальные визиты, Содружество, Сассексы, Семья и дети, Образование, Здоровье, Скандалы и расследования, Европейские монархии, Памятные даты, Светская хроника.
tier: official — royal.uk; quality — BBC/Guardian/Reuters/AP/CNN/Times/Telegraph/Sky/ITV/NBC/ABC; glossy — Hello!/People/Tatler/Vanity Fair; tabloid — Daily Mail/Sun/Mirror.
stories — 1–2 объекта вида {"kick":"Сюжет · <короткая тема>","title":"<заголовок сюжета>","body":["<абзац>","<абзац>"],"cmp":"Как подают: <кратко, как разные издания освещают>"} — обзор главных сюжетов дня по-русски.
Сегодня ${today}. Пиши живым, но сдержанным языком; не выдумывай фактов сверх заголовков.`;
const userMsg = cands.map(c => `- ${c.title} | ${c.link}`).join('\n');

async function callModel() {
  const body = {
    model: 'openai/gpt-4o',
    temperature: 0.4,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }]
  };
  const endpoints = [
    'https://models.github.ai/inference/chat/completions',
    'https://models.inference.ai.azure.com/chat/completions'
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) { console.log('model http', ep, r.status, (await r.text()).slice(0, 300)); continue; }
      const j = await r.json();
      return j.choices?.[0]?.message?.content || '';
    } catch (e) { console.log('model err', ep, e.message); }
  }
  return '';
}

let raw = await callModel();
if (!raw) { console.log('model unavailable — no-op (page will catch up)'); process.exit(0); }
raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
let parsed;
try { parsed = JSON.parse(raw); }
catch (e) { console.log('bad model json — no-op:', e.message); process.exit(0); }

const news = (parsed.news || []).filter(n => n && n.title && n.url && !knownUrls.has(n.url));
const stories = (parsed.stories || []).filter(s => s && s.title && Array.isArray(s.body) && s.body.length);
if (news.length === 0) { console.log('model returned no usable news — no-op'); process.exit(0); }

// 5. Слияние в HTML.
const newsText = '\n' + news.map(o => JSON.stringify(o)).join(',\n') + ',';
html = html.replace('const NEWS = [', 'const NEWS = [' + newsText);

if (stories.length) {
  const s1 = html.indexOf('const STORIES = [');
  const sEnd = html.indexOf('];\n/* ==== STORIES_DATA_END');
  if (s1 >= 0 && sEnd >= 0) {
    const stText = 'const STORIES = [\n' + stories.map(o => JSON.stringify(o)).join(',\n') + '\n';
    html = html.slice(0, s1) + stText + html.slice(sEnd);
  }
}

html = html.replace(/"lastUpdate":"[0-9-]+"/, `"lastUpdate":"${today}"`);
html = html.replace(/выпуск от [0-9]+ [а-яё]+ [0-9]{4}/i, `выпуск от ${ruDate}`);

writeFileSync(FILE, html);
console.log(`published ${news.length} items, ${stories.length} stories for ${today}`);
