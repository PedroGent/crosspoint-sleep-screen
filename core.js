/*
 * Calendar + Weather sleep screen: CrossPoint SD plugin (browser side).
 * Renders a 480x800 BMP (landscape layouts are pre-rotated, the reader never rotates): current weather,
 * next 3 days, month calendar with Belgian public holidays, and writes it to the SD card as a sleep image.
 * Weather: Open-Meteo (no API key), fetched through the device relay.
 */
(function (root) {
  'use strict';
  const FONT = root.CW_FONT || 'sans-serif';   // the GitHub renderer sets a fixed font
  const SHORT = 480, LONG = 800;

  const DEFAULTS = {
    place: 'Gent', lat: 51.0543, lon: 3.7174,
    lang: 'en',          // 'en' | 'nl'
    orientation: 'portrait', // 'portrait' | 'landscape-left' | 'landscape-right' (always a 480x800 file)
    bpp: 1,              // BMP depth: 1 (smallest), 4 (16 grays), 24 (biggest)
    path: '/sleep.bmp',  // where to write on the SD card
    flemishDay: false,   // also mark 11 July (Flemish Community Day)
    autoMin: 0           // re-render every N minutes while this page is open
  };

  const STR = {
    en: {
      cond: { clear: 'Clear', partly: 'Partly cloudy', cloud: 'Cloudy', fog: 'Fog',
              drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', thunder: 'Thunderstorm' },
      rain: 'Rain', wind: 'Wind', updated: 'Updated', loc: 'en-GB'
    },
    nl: {
      cond: { clear: 'Helder', partly: 'Half bewolkt', cloud: 'Bewolkt', fog: 'Mist',
              drizzle: 'Motregen', rain: 'Regen', snow: 'Sneeuw', thunder: 'Onweer' },
      rain: 'Regen', wind: 'Wind', updated: 'Bijgewerkt', loc: 'nl-BE'
    }
  };

  /* ---------- Belgian public holidays ---------- */
  function easter(y) { // anonymous Gregorian algorithm
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  function holidays(y, flemish) { // key "monthIndex-day" -> {en, nl}
    const map = {};
    const add = (dt, en, nl) => { map[dt.getMonth() + '-' + dt.getDate()] = { en, nl }; };
    const D = (m, d) => new Date(y, m - 1, d);
    add(D(1, 1), "New Year's Day", 'Nieuwjaar');
    add(D(5, 1), 'Labour Day', 'Dag van de Arbeid');
    add(D(7, 21), 'National Day', 'Nationale feestdag');
    add(D(8, 15), 'Assumption', 'O.L.V.-Hemelvaart');
    add(D(11, 1), "All Saints' Day", 'Allerheiligen');
    add(D(11, 11), 'Armistice Day', 'Wapenstilstand');
    add(D(12, 25), 'Christmas Day', 'Kerstmis');
    const e = easter(y);
    const off = n => new Date(e.getFullYear(), e.getMonth(), e.getDate() + n);
    add(off(1), 'Easter Monday', 'Paasmaandag');
    add(off(39), 'Ascension Day', 'O.H.-Hemelvaart');
    add(off(50), 'Whit Monday', 'Pinkstermaandag');
    if (flemish) add(D(7, 11), 'Flemish Community Day', 'Vlaamse feestdag');
    return map;
  }

  /* ---------- weather ---------- */
  function kindOf(code) {
    if (code <= 1) return 'clear';
    if (code === 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return 'cloud';
  }

  function weatherUrl(cfg) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lon +
      '&current=temperature_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=auto&forecast_days=4&wind_speed_unit=kmh';
  }

  /* ---------- drawing ---------- */
  function icon(ctx, kind, cx, cy, s) {
    ctx.save();
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
    ctx.lineWidth = Math.max(2, s / 16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const sun = (x, y, r) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4);
        ctx.lineTo(x + Math.cos(a) * r * 1.85, y + Math.sin(a) * r * 1.85);
        ctx.stroke();
      }
    };
    const cloud = (x, y, r) => {
      ctx.beginPath();
      ctx.moveTo(x - 1.6 * r, y + r);
      ctx.arc(x - 1.6 * r, y + 0.2 * r, 0.8 * r, Math.PI / 2, Math.PI * 1.5);
      ctx.arc(x - 0.2 * r, y - 0.2 * r, r, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(x + 1.2 * r, y + 0.3 * r, 0.7 * r, Math.PI * 1.5, Math.PI * 2.5);
      ctx.closePath();
      ctx.save(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      ctx.stroke();
    };
    const drops = (n, len) => {
      for (let i = 0; i < n; i++) {
        const x = cx + (i - (n - 1) / 2) * s * 0.22;
        ctx.beginPath(); ctx.moveTo(x + s * 0.04, cy + s * 0.17); ctx.lineTo(x - s * 0.04, cy + s * 0.17 + len); ctx.stroke();
      }
    };
    if (kind === 'clear') sun(cx, cy, s * 0.22);
    else if (kind === 'partly') { sun(cx + s * 0.12, cy - s * 0.12, s * 0.15); cloud(cx - s * 0.02, cy + s * 0.1, s * 0.19); }
    else if (kind === 'cloud') cloud(cx, cy, s * 0.24);
    else if (kind === 'fog') {
      cloud(cx, cy - s * 0.12, s * 0.2);
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy + s * (0.2 + i * 0.12)); ctx.lineTo(cx + s * 0.32, cy + s * (0.2 + i * 0.12)); ctx.stroke(); }
    }
    else if (kind === 'drizzle') { cloud(cx, cy - s * 0.14, s * 0.2); drops(3, s * 0.08); }
    else if (kind === 'rain') { cloud(cx, cy - s * 0.14, s * 0.2); drops(3, s * 0.17); }
    else if (kind === 'snow') {
      cloud(cx, cy - s * 0.14, s * 0.2);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + (i - 1) * s * 0.22, cy + s * 0.26, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
    }
    else if (kind === 'thunder') {
      cloud(cx, cy - s * 0.14, s * 0.2);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.04, cy + s * 0.1); ctx.lineTo(cx - s * 0.1, cy + s * 0.3);
      ctx.lineTo(cx, cy + s * 0.3); ctx.lineTo(cx - s * 0.06, cy + s * 0.46);
      ctx.lineTo(cx + s * 0.12, cy + s * 0.24); ctx.lineTo(cx + s * 0.02, cy + s * 0.24);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function helpers(ctx) {
    return {
      text: (s, x, y, px, align, color, weight, base, maxW) => {
        ctx.font = (weight || 'bold') + ' ' + px + 'px ' + FONT;
        while (maxW && px > 10 && ctx.measureText(s).width > maxW) { px--; ctx.font = (weight || 'bold') + ' ' + px + 'px ' + FONT; }
        ctx.textAlign = align || 'left'; ctx.textBaseline = base || 'alphabetic';
        ctx.fillStyle = color || '#000'; ctx.fillText(s, x, y);
      },
      rule: (x, y, w) => { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, 2); }
    };
  }

  const pad2 = n => (n < 10 ? '0' : '') + n;
  const subline = (cfg, L, now) => cfg.place + '  ·  ' + L.updated + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  const rainText = (L, d0) => L.rain + ' ' + (d0.precipitation_probability_max[0] == null ? '–' : d0.precipitation_probability_max[0]) + '%';

  // Month grid + holiday legend. b = box geometry for the layout.
  function calendar(ctx, T, cfg, now, b) {
    const L = STR[cfg.lang] || STR.en, loc = L.loc, text = T.text;
    const y0 = now.getFullYear(), m0 = now.getMonth();
    const first = new Date(y0, m0, 1), dim = new Date(y0, m0 + 1, 0).getDate();
    const off = (first.getDay() + 6) % 7, rows = Math.ceil((off + dim) / 7);
    const hol = holidays(y0, cfg.flemishDay);
    const cw = b.w / 7, rh = b.gh / rows;
    text(cap(first.toLocaleDateString(loc, { month: 'long', year: 'numeric' })), b.x, b.titleY, 28);
    for (let i = 0; i < 7; i++) {
      text(cap(new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'short' })), b.x + cw * (i + 0.5), b.hdrY, b.hdrPx, 'center');
    }
    ctx.fillStyle = '#000'; ctx.fillRect(b.x, b.ruleY, b.w, 1);
    for (let d = 1; d <= dim; d++) {
      const idx = off + d - 1, r = Math.floor(idx / 7), c = idx % 7;
      const cx = b.x + cw * (c + 0.5), cy = b.gy + rh * (r + 0.5);
      const bw = cw - 8, bh = Math.min(rh - 6, b.bhMax), bx = cx - bw / 2, by = cy - bh / 2;
      const isToday = d === now.getDate(), isHol = !!hol[m0 + '-' + d];
      if (isToday) { ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, bh); }
      if (isHol) {
        ctx.strokeStyle = isToday ? '#fff' : '#000'; ctx.lineWidth = 2;
        const inset = isToday ? 3 : 1;
        ctx.strokeRect(bx + inset, by + inset, bw - 2 * inset, bh - 2 * inset);
      }
      text(String(d), cx, cy + 1, 20, 'center', isToday ? '#fff' : '#000', isHol || isToday ? 'bold' : 'normal', 'middle');
    }
    const items = [];
    for (let d = 1; d <= dim; d++) {
      const h = hol[m0 + '-' + d];
      if (h) items.push(d + ' ' + new Date(y0, m0, d).toLocaleDateString(loc, { month: 'short' }) + ' ' + h[cfg.lang === 'nl' ? 'nl' : 'en']);
    }
    ctx.font = 'normal 16px ' + FONT;
    const lines = []; let line = '';
    items.forEach(it => {
      const t = line ? line + '  ·  ' + it : it;
      if (ctx.measureText(t).width > b.w && line) { lines.push(line); line = it; } else line = t;
    });
    if (line) lines.push(line);
    lines.slice(0, b.legMax).forEach((ln, i) => text(ln, b.x, b.legY + i * 22, 16, 'left', '#000', 'normal'));
  }

  function drawPortrait(ctx, T, cfg, wx, now) {
    const L = STR[cfg.lang] || STR.en, loc = L.loc, text = T.text, rule = T.rule;
    const cur = wx.current, d0 = wx.daily, ck = kindOf(cur.weather_code);
    text(cap(now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })), 24, 46, 30, 'left', '#000', 'bold', 'alphabetic', 432);
    text(subline(cfg, L, now), 24, 76, 18, 'left', '#000', 'normal', 'alphabetic', 432);
    rule(24, 90, 432);
    icon(ctx, ck, 96, 168, 128);
    text(Math.round(cur.temperature_2m) + '°', 190, 185, 76);
    text(L.cond[ck], 190, 222, 24, 'left', '#000', 'normal');
    text('↑' + Math.round(d0.temperature_2m_max[0]) + '°  ↓' + Math.round(d0.temperature_2m_min[0]) + '°', 96, 258, 20, 'center', '#000', 'bold', 'alphabetic', 138);
    text(rainText(L, d0), 240, 258, 20, 'center', '#000', 'bold', 'alphabetic', 138);
    text(L.wind + ' ' + Math.round(cur.wind_speed_10m) + ' km/h', 384, 258, 20, 'center', '#000', 'bold', 'alphabetic', 138);
    rule(24, 278, 432);
    for (let i = 1; i <= 3; i++) {
      const cx = 96 + (i - 1) * 144, d = new Date(d0.time[i] + 'T12:00:00');
      text(cap(d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric' })), cx, 314, 22, 'center', '#000', 'bold', 'alphabetic', 138);
      icon(ctx, kindOf(d0.weather_code[i]), cx, 366, 72);
      text(Math.round(d0.temperature_2m_max[i]) + '° / ' + Math.round(d0.temperature_2m_min[i]) + '°', cx, 416, 22, 'center', '#000', 'bold', 'alphabetic', 138);
      const p = d0.precipitation_probability_max[i];
      text(p == null ? '' : p + '%', cx, 440, 18, 'center', '#000', 'normal');
    }
    rule(24, 456, 432);
    calendar(ctx, T, cfg, now, { x: 24, w: 432, titleY: 494, hdrY: 530, hdrPx: 17, ruleY: 538,
      gy: 544, gh: 204, bhMax: 32, legY: 770, legMax: 2 });
  }

  function drawLandscape(ctx, T, cfg, wx, now) {
    const L = STR[cfg.lang] || STR.en, loc = L.loc, text = T.text, rule = T.rule;
    const cur = wx.current, d0 = wx.daily, ck = kindOf(cur.weather_code);
    const lx = 24, lw = 352, col = lw / 3;          // left panel
    text(cap(now.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })), lx, 40, 26, 'left', '#000', 'bold', 'alphabetic', lw);
    text(subline(cfg, L, now), lx, 66, 17, 'left', '#000', 'normal', 'alphabetic', lw);
    rule(lx, 78, lw);
    icon(ctx, ck, 90, 146, 112);
    text(Math.round(cur.temperature_2m) + '°', 162, 158, 68);
    text(L.cond[ck], 162, 190, 22, 'left', '#000', 'normal');
    text('↑' + Math.round(d0.temperature_2m_max[0]) + '°  ↓' + Math.round(d0.temperature_2m_min[0]) + '°', lx + col * 0.5, 226, 17, 'center', '#000', 'bold', 'alphabetic', col - 6);
    text(rainText(L, d0), lx + col * 1.5, 226, 17, 'center', '#000', 'bold', 'alphabetic', col - 6);
    text(L.wind + ' ' + Math.round(cur.wind_speed_10m) + ' km/h', lx + col * 2.5, 226, 17, 'center', '#000', 'bold', 'alphabetic', col - 6);
    rule(lx, 242, lw);
    for (let i = 1; i <= 3; i++) {
      const cx = lx + col * (i - 0.5), d = new Date(d0.time[i] + 'T12:00:00');
      text(cap(d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric' })), cx, 278, 20, 'center', '#000', 'bold', 'alphabetic', col - 6);
      icon(ctx, kindOf(d0.weather_code[i]), cx, 334, 72);
      text(Math.round(d0.temperature_2m_max[i]) + '° / ' + Math.round(d0.temperature_2m_min[i]) + '°', cx, 388, 20, 'center', '#000', 'bold', 'alphabetic', col - 6);
      const p = d0.precipitation_probability_max[i];
      text(p == null ? '' : p + '%', cx, 412, 16, 'center', '#000', 'normal');
    }
    ctx.fillStyle = '#000'; ctx.fillRect(399, 24, 2, 432);   // divider
    calendar(ctx, T, cfg, now, { x: 424, w: 352, titleY: 50, hdrY: 88, hdrPx: 16, ruleY: 97,
      gy: 104, gh: 288, bhMax: 36, legY: 420, legMax: 3 });
  }

  // old saved values from v1.1/1.2 map onto the new pre-rotated modes
  const normOrient = o => ({ landscape: 'landscape-left', 'landscape-flip': 'landscape-right' }[o] || o || 'portrait');

  function draw(mk, cfg, wx, now) {
    const o = normOrient(cfg.orientation);
    const land = o === 'landscape-left' || o === 'landscape-right';
    const cv = mk(land ? LONG : SHORT, land ? SHORT : LONG), ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    (land ? drawLandscape : drawPortrait)(ctx, helpers(ctx), cfg, wx, now);
    if (!land) return cv;
    // The reader does not rotate sleep images, so the landscape layout is rotated into a 480x800 file.
    // landscape-left : top of the layout on the image's right edge  -> read it with the device turned left (counter-clockwise)
    // landscape-right: top of the layout on the image's left edge   -> read it with the device turned right (clockwise)
    const f = mk(SHORT, LONG), fc = f.getContext('2d');
    fc.fillStyle = '#fff'; fc.fillRect(0, 0, SHORT, LONG);
    if (o === 'landscape-left') { fc.translate(SHORT, 0); fc.rotate(Math.PI / 2); }
    else { fc.translate(0, LONG); fc.rotate(-Math.PI / 2); }
    fc.drawImage(cv, 0, 0);
    return f;
  }

  /* ---------- BMP encoder (uncompressed, bottom-up) ---------- */
  function toBMP(cv, bpp) {
    const W = cv.width, H = cv.height;
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const rowBytes = Math.ceil(W * bpp / 32) * 4;
    const palN = bpp === 24 ? 0 : (1 << bpp);
    const off = 54 + palN * 4, size = off + rowBytes * H;
    const buf = new Uint8Array(size), dv = new DataView(buf.buffer);
    buf[0] = 0x42; buf[1] = 0x4D;
    dv.setUint32(2, size, true); dv.setUint32(10, off, true);
    dv.setUint32(14, 40, true); dv.setInt32(18, W, true); dv.setInt32(22, H, true);
    dv.setUint16(26, 1, true); dv.setUint16(28, bpp, true);
    dv.setUint32(34, rowBytes * H, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
    dv.setUint32(46, palN, true);
    for (let i = 0; i < palN; i++) { const v = Math.round(i * 255 / (palN - 1)); buf.set([v, v, v, 0], 54 + i * 4); }
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4, dst = off + y * rowBytes;
      for (let x = 0; x < W; x++) {
        const p = src + x * 4, lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
        if (bpp === 1) { if (lum >= 140) buf[dst + (x >> 3)] |= 0x80 >> (x & 7); }
        else if (bpp === 4) { const v = Math.round(lum / 17); buf[dst + (x >> 1)] |= (x & 1) ? v : v << 4; }
        else { const q = dst + x * 3; buf[q] = buf[q + 1] = buf[q + 2] = lum; }
      }
    }
    return buf;
  }

  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  const core = { holidays, easter, kindOf, draw, toBMP, weatherUrl, DEFAULTS, SHORT, LONG, normOrient };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof root.CrossPoint === 'undefined' || !root.CrossPoint.registerPlugin) return;

})(typeof window !== 'undefined' ? window : globalThis);
