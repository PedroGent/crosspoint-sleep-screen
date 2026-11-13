'use strict';
// Renders the three sleep-screen variants into ./out (run by GitHub Actions, or locally: npm run render).
process.env.TZ = process.env.TZ || 'Europe/Brussels';   // date, calendar and "Updated" time in Belgian time
const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');
globalThis.CW_FONT = process.env.CW_FONT || 'DejaVu Sans';
const core = require('./core.js');

// file name suffix -> orientation (all files are 480x800; landscape layouts are pre-rotated)
const VARIANTS = { portrait: 'portrait', left: 'landscape-left', right: 'landscape-right' };

async function getWeather(cfg) {
  if (process.env.WEATHER_JSON) return JSON.parse(fs.readFileSync(process.env.WEATHER_JSON, 'utf8')); // local testing
  let err;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(core.weatherUrl(cfg), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.current || !j.daily) throw new Error('reply has no forecast data');
      return j;
    } catch (e) {
      err = e; console.error('Weather attempt ' + i + ' failed: ' + e.message);
      await new Promise(res => setTimeout(res, 3000 * i));
    }
  }
  throw err;   // fail the run: the previously published images stay in place
}

(async () => {
  const cfg = Object.assign({}, core.DEFAULTS, JSON.parse(fs.readFileSync('config.json', 'utf8')));
  const wx = await getWeather(cfg);
  const now = new Date();
  fs.mkdirSync('out', { recursive: true });
  for (const [name, orientation] of Object.entries(VARIANTS)) {
    const cv = core.draw((w, h) => createCanvas(w, h), Object.assign({}, cfg, { orientation }), wx, now);
    const bmp = core.toBMP(cv, cfg.bpp === 4 ? 4 : 1);
    fs.writeFileSync('out/sleep-' + name + '.bmp', Buffer.from(bmp));
    console.log('wrote out/sleep-' + name + '.bmp (' + bmp.length + ' bytes)');
  }
})().catch(e => { console.error(e); process.exit(1); });
