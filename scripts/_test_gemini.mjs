// Разовый тест ключа Gemini. Ничего не публикует — только проверяет ответ.
const k = process.env.GEMINI_API_KEY;
if (!k) { console.log('RESULT: NO_KEY (секрет GEMINI_API_KEY не виден)'); process.exit(1); }
const models = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
for (const m of models) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Ответь ровно одним словом: работает' }] }] }),
      signal: ac.signal
    });
    const t = await r.text();
    console.log('MODEL', m, 'HTTP', r.status);
    if (r.ok) {
      let out = '';
      try { out = (JSON.parse(t).candidates?.[0]?.content?.parts || []).map(p => p.text).join(''); } catch (e) {}
      console.log('RESULT: OK model=' + m + ' reply=' + (out || '').trim().slice(0, 80));
      process.exit(0);
    } else {
      console.log('BODY', t.slice(0, 200));
    }
  } catch (e) { console.log('ERR', m, e.message); }
  finally { clearTimeout(timer); }
}
console.log('RESULT: ALL_FAILED');
process.exit(2);
