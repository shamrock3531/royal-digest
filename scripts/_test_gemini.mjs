// Разовый тест: реальная генерация на новой цепочке моделей.
const k = process.env.GEMINI_API_KEY;
if (!k) { console.log('RESULT: NO_KEY'); process.exit(1); }
const models = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];
for (const m of models) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Верни строго JSON: {"ok":true,"word":"работает"}' }] }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      signal: ac.signal
    });
    console.log('MODEL', m, 'HTTP', r.status);
    const t = await r.text();
    if (r.ok) {
      let out = '';
      try { out = (JSON.parse(t).candidates?.[0]?.content?.parts || []).map(p => p.text).join(''); } catch (e) {}
      console.log('RESULT: OK model=' + m + ' reply=' + (out || '').replace(/\s+/g, ' ').trim().slice(0, 90));
      process.exit(0);
    } else { console.log('BODY', t.slice(0, 150)); }
  } catch (e) { console.log('ERR', m, e.message); }
  finally { clearTimeout(timer); }
}
console.log('RESULT: ALL_FAILED');
process.exit(2);
