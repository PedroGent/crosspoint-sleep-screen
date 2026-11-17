'use strict';
// Renders the three sleep-screen variants into ./out (run by GitHub Actions, or locally: npm run render).
process.env.TZ = process.env.TZ || 'Europe/Brussels';   // date, calendar and "Updated" time in Belgian time
const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// Fonts ship with the repo, so the render never depends on what the runner has installed.
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'), 'CW Sans');
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'), 'CW Sans');
globalThis.CW_FONT = process.env.CW_FONT || 'CW Sans';
const core = require('./core.js');

// file name suffix -> orientation (all files are 480x800; landscape layouts are pre-rotated)
const VARIANTS = { portrait: 'portrait', left: 'landscape-left', right: 'landscape-right' };
const REPO = process.env.GITHUB_REPOSITORY || 'PedroGent/crosspoint-sleep-screen';
const BASE = 'https://raw.githubusercontent.com/' + REPO + '/output';
const MAX_CACHE_AGE_MS = 24 * 3600 * 1000;

const sleep = ms => new Promise(res => setTimeout(res, ms));
const pad = n => String(n).padStart(2, '0');
const localDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const valid = j => j && j.current && j.daily && Array.isArray(j.daily.time);

async function fetchFresh(cfg) {
  if (process.env.WEATHER_JSON) return JSON.parse(fs.readFileSync(process.env.WEATHER_JSON, 'utf8')); // local testing
  const waits = [5, 15, 30, 60];                    // seconds between attempts (5 attempts in total)
  let err;
  for (let i = 0; i <= waits.length; i++) {
    try {
      const r = await fetch(core.weatherUrl(cfg), { headers: { Accept: 'application/json', 'User-Agent': 'crosspoint-sleep-screen' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!valid(j)) throw new Error('reply has no forecast data');
      return j;
    } catch (e) {
      err = e; console.error('Weather attempt ' + (i + 1) + ' failed: ' + e.message);
      if (i < waits.length) await sleep(waits[i] * 1000);
    }
  }
  throw err;
}

// weather.json is re-published with every run: { fetchedAt, data }
async function fetchCached() {
  let c;
  if (process.env.CACHE_JSON) c = JSON.parse(fs.readFileSync(process.env.CACHE_JSON, 'utf8'));
  else {
    const r = await fetch(BASE + '/weather.json?t=' + Date.now());
    if (!r.ok) throw new Error('no cached weather (HTTP ' + r.status + ')');
    c = await r.json();
  }
  if (!c || !c.fetchedAt || !valid(c.data)) throw new Error('cached weather is not usable');
  if (Date.now() - new Date(c.fetchedAt).getTime() > MAX_CACHE_AGE_MS) throw new Error('cached weather is older than 24 hours');
  return c;
}

// Drop days before today so that index 0 is today (needed for cached data); require today + 3 more days.
function align(wx, now) {
  const i = wx.daily.time.indexOf(localDay(now));
  if (i < 0 || wx.daily.time.length - i < 4) throw new Error('weather data does not cover today and the next 3 days');
  if (i > 0) for (const k of Object.keys(wx.daily)) wx.daily[k] = wx.daily[k].slice(i);
  return wx;
}

async function getWeather(cfg, now) {
  try {
    const raw = await fetchFresh(cfg);
    const fetchedAt = now.toISOString();
    return { wx: Object.assign(align(JSON.parse(JSON.stringify(raw)), now), { _fetchedAt: fetchedAt }), cache: { fetchedAt, data: raw } };
  } catch (e) {
    console.error('Fresh weather unavailable (' + e.message + '); trying the last good forecast.');
    const c = await fetchCached();            // throws if there is nothing usable: the run fails and old images stay
    const wx = Object.assign(align(JSON.parse(JSON.stringify(c.data)), now), { _fetchedAt: c.fetchedAt });
    console.log('::warning title=Using cached weather::Open-Meteo failed (' + e.message + '). Showing the forecast from ' + c.fetchedAt + '.');
    return { wx, cache: c };
  }
}

(async () => {
  const cfg = Object.assign({}, core.DEFAULTS, JSON.parse(fs.readFileSync('config.json', 'utf8')));
  const now = new Date();
  const { wx, cache } = await getWeather(cfg, now);
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync('out/weather.json', JSON.stringify(cache));
  for (const [name, orientation] of Object.entries(VARIANTS)) {
    const cv = core.draw((w, h) => createCanvas(w, h), Object.assign({}, cfg, { orientation }), wx, now);
    const bmp = core.toBMP(cv, cfg.bpp === 4 ? 4 : 1);
    fs.writeFileSync('out/sleep-' + name + '.bmp', Buffer.from(bmp));
    console.log('wrote out/sleep-' + name + '.bmp (' + bmp.length + ' bytes)');
  }

  // On-device orientation picker: the reader lists catalog.json under Settings > System > Plugins and
  // "downloads" the chosen config-*.json over the plugin's own config.json (read by the sleep event).
  const LABELS = {
    portrait: ['Portrait', 'Hold the reader normally'],
    left: ['Landscape: turn device left', 'Counter-clockwise'],
    right: ['Landscape: turn device right', 'Clockwise']
  };
  const options = [];
  for (const name of Object.keys(VARIANTS)) {
    fs.writeFileSync('out/config-' + name + '.json', JSON.stringify({ image_base: BASE, variant: name }));
    options.push({ id: name, title: LABELS[name][0], subtitle: LABELS[name][1], url: BASE + '/config-' + name + '.json' });
  }
  fs.writeFileSync('out/catalog.json', JSON.stringify({ options }));
  console.log('wrote out/catalog.json and out/config-*.json for ' + BASE);
})().catch(e => { console.error('Render failed: ' + (e && e.stack || e)); process.exit(1); });
