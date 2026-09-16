// Разовый тест: перечислить доступные ключу модели Gemini.
const k = process.env.GEMINI_API_KEY;
if (!k) { console.log('RESULT: NO_KEY'); process.exit(1); }
const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), 20000);
try {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': k }, signal: ac.signal
  });
  console.log('LIST HTTP', r.status);
  const j = await r.json();
  const names = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  const flash = names.filter(n => /flash/i.test(n) && !/thinking|image|tts|audio|live/i.test(n));
  console.log('FLASH_MODELS: ' + flash.join(', '));
  console.log('ALL_COUNT: ' + names.length);
} catch (e) { console.log('ERR', e.message); }
finally { clearTimeout(timer); }
