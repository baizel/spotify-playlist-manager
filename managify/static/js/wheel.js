// ── Camelot Wheel — harmonic DJ mixing ───────────────────────────────────────

const CAMELOT_MAP = {
    '0m':  {n:5,  r:'A', label:'C min'},  '1m':  {n:12, r:'A', label:'Db min'},
    '2m':  {n:7,  r:'A', label:'D min'},  '3m':  {n:2,  r:'A', label:'Eb min'},
    '4m':  {n:9,  r:'A', label:'E min'},  '5m':  {n:4,  r:'A', label:'F min'},
    '6m':  {n:11, r:'A', label:'F# min'}, '7m':  {n:6,  r:'A', label:'G min'},
    '8m':  {n:1,  r:'A', label:'Ab min'}, '9m':  {n:8,  r:'A', label:'A min'},
    '10m': {n:3,  r:'A', label:'Bb min'}, '11m': {n:10, r:'A', label:'B min'},
    '0M':  {n:8,  r:'B', label:'C maj'},  '1M':  {n:3,  r:'B', label:'Db maj'},
    '2M':  {n:10, r:'B', label:'D maj'},  '3M':  {n:5,  r:'B', label:'Eb maj'},
    '4M':  {n:12, r:'B', label:'E maj'},  '5M':  {n:7,  r:'B', label:'F maj'},
    '6M':  {n:2,  r:'B', label:'Gb maj'}, '7M':  {n:9,  r:'B', label:'G maj'},
    '8M':  {n:4,  r:'B', label:'Ab maj'}, '9M':  {n:11, r:'B', label:'A maj'},
    '10M': {n:6,  r:'B', label:'Bb maj'}, '11M': {n:1,  r:'B', label:'B maj'},
};

// Reverse: '8A' -> {n, r, label, key, mode}
const CAMELOT_REV = {};
Object.entries(CAMELOT_MAP).forEach(([mk, c]) => {
    CAMELOT_REV[`${c.n}${c.r}`] = { ...c, key: parseInt(mk), mode: mk.endsWith('M') ? 1 : 0 };
});

const WHEEL_COLORS = [
    '#f5e642','#b8e04a','#56c25a','#45c9a0',
    '#44aad4','#4472d4','#7844d4','#c244d4',
    '#d44472','#d44444','#d47844','#d4b844'
];

let _wheelSel = null;        // selected camelot id e.g. '8A'
let _wheelSongs = {};        // id -> song, populated on panel render
let _wheelPulseTimer = null;

// ── Public API ────────────────────────────────────────────────────────────────

function refreshWheel() {
    if (typeof storedData === 'undefined' || !storedData || !storedData.data) return;
    const byKey = _buildByKey();
    _drawWheel(byKey);
    if (_wheelSel) _updateKeyPanel(_wheelSel, byKey);
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function _buildByKey() {
    const map = {};
    (storedData.data || []).forEach(s => {
        const cid = _songCamelot(s);
        if (!cid) return;
        if (!map[cid]) map[cid] = [];
        map[cid].push(s);
    });
    return map;
}

function _songCamelot(song) {
    if (typeof song.key !== 'number' || typeof song.mode !== 'number') return null;
    const mk = `${song.key}${song.mode === 1 ? 'M' : 'm'}`;
    const c = CAMELOT_MAP[mk];
    return c ? `${c.n}${c.r}` : null;
}

function _compatible(cid) {
    const info = CAMELOT_REV[cid];
    if (!info) return [];
    const { n, r } = info;
    const prev = ((n - 2 + 12) % 12) + 1;
    const next  = (n % 12) + 1;
    return [`${prev}${r}`, `${next}${r}`, `${n}${r === 'A' ? 'B' : 'A'}`];
}

// ── SVG drawing ───────────────────────────────────────────────────────────────

function _arc(cx, cy, r1, r2, a1deg, a2deg) {
    const r = d => d * Math.PI / 180;
    const a1 = r(a1deg), a2 = r(a2deg);
    const large = a2deg - a1deg > 180 ? 1 : 0;
    const p = (rr, a) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    const [ix1, iy1] = p(r1, a1), [ox1, oy1] = p(r2, a1);
    const [ox2, oy2] = p(r2, a2), [ix2, iy2] = p(r1, a2);
    return `M${ix1},${iy1} L${ox1},${oy1} A${r2},${r2} 0 ${large} 1 ${ox2},${oy2} L${ix2},${iy2} A${r1},${r1} 0 ${large} 0 ${ix1},${iy1}Z`;
}

function _drawWheel(byKey) {
    const container = document.getElementById('camelotWheel');
    if (!container) return;

    const cx = 250, cy = 250;
    const rB1 = 158, rB2 = 222;  // outer B (major)
    const rA1 = 90,  rA2 = 154;  // inner A (minor)
    const compat = _wheelSel ? _compatible(_wheelSel) : [];

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 500 500');
    svg.style.cssText = 'width:100%; max-width:500px; cursor:pointer; user-select:none;';

    const mkEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    };
    const txt = (x, y, content, attrs) => {
        const el = mkEl('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'pointer-events': 'none', ...attrs });
        el.textContent = content;
        return el;
    };

    for (let pos = 1; pos <= 12; pos++) {
        const color = WHEEL_COLORS[pos - 1];
        const a1 = (pos - 1) * 30 - 90;
        const a2 = a1 + 29.4;
        const aMid = a1 + 15;
        const midRad = aMid * Math.PI / 180;

        ['A', 'B'].forEach(ring => {
            const [r1, r2] = ring === 'B' ? [rB1, rB2] : [rA1, rA2];
            const cid = `${pos}${ring}`;
            const info = CAMELOT_REV[cid];
            const count = (byKey[cid] || []).length;
            const isSel   = _wheelSel === cid;
            const isComp  = compat.includes(cid);
            const hasSongs = count > 0;

            const seg = mkEl('path', {
                d: _arc(cx, cy, r1, r2, a1, a2),
                fill: color,
                'fill-opacity': isSel ? '1' : isComp ? (hasSongs ? '0.9' : '0.6') : (hasSongs ? '0.82' : '0.22'),
                stroke: isSel ? '#fff' : isComp ? '#222' : '#fff',
                'stroke-width': isSel ? '3.5' : isComp ? '1.5' : '0.8',
            });
            if (isSel) seg.setAttribute('filter', 'drop-shadow(0 0 5px rgba(0,0,0,0.35))');
            seg.dataset.cid = cid;
            seg.addEventListener('click', () => _onSegClick(cid));
            svg.appendChild(seg);

            // Labels
            const midR = (r1 + r2) / 2;
            const lx = cx + midR * Math.cos(midRad);
            const ly = cy + midR * Math.sin(midRad);
            svg.appendChild(txt(lx, ly - 6, `${pos}${ring}`, { 'font-size': '11', 'font-weight': 'bold', fill: isSel ? '#000' : '#222' }));
            if (info) {
                const short = info.label.replace(' min', 'm').replace(' maj', '');
                svg.appendChild(txt(lx, ly + 7, short, { 'font-size': '8', fill: '#444' }));
            }

            // Count badge at outer edge
            if (count > 0) {
                const bx = cx + (r2 - 10) * Math.cos(midRad);
                const by = cy + (r2 - 10) * Math.sin(midRad);
                svg.appendChild(mkEl('circle', { cx: bx, cy: by, r: 9, fill: 'rgba(0,0,0,0.5)', 'pointer-events': 'none' }));
                svg.appendChild(txt(bx, by, count > 99 ? '99+' : count, { 'font-size': '9', 'font-weight': 'bold', fill: '#fff' }));
            }
        });
    }

    // Centre disc
    svg.appendChild(mkEl('circle', { cx, cy, r: '82', fill: '#f8f8f8', stroke: '#ddd', 'stroke-width': '1' }));
    svg.appendChild(txt(cx, cy - 9, 'Camelot', { 'font-size': '13', 'font-weight': 'bold', fill: '#555' }));
    svg.appendChild(txt(cx, cy + 8, 'Wheel', { 'font-size': '11', fill: '#888' }));
    svg.appendChild(txt(cx, cy + 24, 'outer = major', { 'font-size': '8', fill: '#bbb' }));

    container.innerHTML = '';
    container.appendChild(svg);
}

// ── Interaction ───────────────────────────────────────────────────────────────

function _onSegClick(cid) {
    _wheelSel = _wheelSel === cid ? null : cid;
    const byKey = _buildByKey();
    _drawWheel(byKey);
    const panel = document.getElementById('wheelPanel');
    if (!panel) return;
    if (_wheelSel) {
        _updateKeyPanel(_wheelSel, byKey);
    } else {
        panel.innerHTML = '<p class="grey-text center-align" style="padding:16px; font-size:13px;">Click a key on the wheel to see compatible songs</p>';
    }
}

function _updateKeyPanel(cid, byKey) {
    const panel = document.getElementById('wheelPanel');
    if (!panel) return;
    _wheelSongs = {};

    const info = CAMELOT_REV[cid];
    const compat = _compatible(cid);

    const chipCss = id => {
        const n = (parseInt(id) - 1 + 12) % 12;
        return `background:${WHEEL_COLORS[n]}; color:#222; font-size:11px; height:20px; line-height:20px; padding:0 8px; border-radius:10px; display:inline-block; margin:2px; cursor:pointer;`;
    };

    const compatChips = compat.map(id =>
        `<span style="${chipCss(id)}" data-jump="${id}">${id} ${CAMELOT_REV[id] ? CAMELOT_REV[id].label : ''}</span>`
    ).join(' ');

    const songRowHtml = (s, sc) => {
        _wheelSongs[s.id] = s;
        return `<div class="wsr" data-sid="${s.id}" style="padding:5px 4px; cursor:pointer; border-radius:4px; font-size:12px; display:flex; align-items:center; gap:6px;">
            <span style="${chipCss(sc)}">${sc}</span>
            <span class="truncate"><b>${_esc(s.Song)}</b> <span class="grey-text">— ${_esc(s.Artist)}</span></span>
        </div>`;
    };

    const selectedSongs = byKey[cid] || [];
    const compatRows = compat.flatMap(c => {
        const songs = byKey[c] || [];
        if (!songs.length) return [];
        return [`<div style="margin-top:8px; font-size:11px; color:#888;">${c} — ${CAMELOT_REV[c] ? CAMELOT_REV[c].label : ''}</div>`,
                ...songs.map(s => songRowHtml(s, c))];
    }).join('');

    panel.innerHTML = `
        <div style="padding:4px 0 10px">
            <b style="font-size:15px">${cid}</b>
            <span class="grey-text" style="font-size:12px; margin-left:6px">${info ? info.label : ''}</span>
            <div style="margin:8px 0 4px; font-size:11px; color:#888;">Mix with:</div>
            <div style="margin-bottom:10px">${compatChips}</div>
            ${selectedSongs.length
                ? `<div style="font-size:11px; color:#888; padding:2px 0;">Songs in ${cid}</div>
                   ${selectedSongs.map(s => songRowHtml(s, cid)).join('')}`
                : '<div class="grey-text" style="font-size:12px; padding:4px 0;">No songs in this key</div>'}
            ${compatRows}
        </div>`;

    // Hover styles + click delegation
    panel.querySelectorAll('.wsr').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = '#f0f0f0');
        el.addEventListener('mouseleave', () => el.style.background = '');
    });
    panel.addEventListener('click', e => {
        const row = e.target.closest('.wsr');
        if (row && _wheelSongs[row.dataset.sid]) _onSongClick(_wheelSongs[row.dataset.sid]);
        const jump = e.target.closest('[data-jump]');
        if (jump) _onSegClick(jump.dataset.jump);
    }, { once: true });
}

function _onSongClick(song) {
    const cid = _songCamelot(song);
    const compat = _compatible(cid);
    const allIds = cid ? [cid, ...compat] : [];

    if (cid) _flashSeg(cid);

    const panel = document.getElementById('wheelPanel');
    if (!panel) return;

    // In-playlist suggestions ranked by energy + tempo closeness
    const candidates = (storedData.data || [])
        .filter(s => s.id !== song.id && allIds.includes(_songCamelot(s)))
        .sort((a, b) => {
            const d = s => Math.abs((s.energy || 0) - (song.energy || 0)) +
                           Math.abs(((s.tempo || 120) - (song.tempo || 120)) / 200);
            return d(a) - d(b);
        });

    const chipCss = id => {
        if (!id) return '';
        const n = (parseInt(id) - 1 + 12) % 12;
        return `background:${WHEEL_COLORS[n]}; color:#222; font-size:10px; height:18px; line-height:18px; padding:0 6px; border-radius:9px; display:inline-block; flex-shrink:0;`;
    };

    const mixRows = candidates.slice(0, 6).map(s => {
        const sc = _songCamelot(s);
        return `<div style="padding:5px 4px; font-size:12px; display:flex; align-items:center; gap:6px; border-bottom:1px solid #f0f0f0; cursor:pointer;" class="wsr-mix" data-cid="${sc || ''}">
            ${sc ? `<span style="${chipCss(sc)}" title="Flash on wheel">${sc}</span>` : ''}
            <span class="truncate"><b>${_esc(s.Song)}</b> <span class="grey-text">— ${_esc(s.Artist)}</span></span>
        </div>`;
    }).join('');

    panel.innerHTML = `
        <div style="padding:4px 0">
            <div style="font-size:13px; font-weight:600">${_esc(song.Song)}</div>
            <div class="grey-text" style="font-size:11px; margin-bottom:2px">${_esc(song.Artist)}
                ${cid ? `· <span style="${chipCss(cid)}">${cid}</span>` : ''}
            </div>
            <div style="margin-top:12px; font-size:12px; font-weight:600; color:#555;">Mix with (your playlist)</div>
            ${mixRows || '<div class="grey-text" style="font-size:12px; padding:6px 0;">No compatible songs in this playlist</div>'}
            <div id="wDisc" style="margin-top:10px">
                <div class="grey-text" style="font-size:11px; padding:2px 0;">Loading Spotify suggestions…</div>
            </div>
            <div style="margin-top:10px">
                <a href="#" class="grey-text" style="font-size:11px;" id="wBack">← Back to key view</a>
            </div>
        </div>`;

    panel.querySelectorAll('.wsr-mix').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = '#f5f5f5');
        el.addEventListener('mouseleave', () => el.style.background = '');
        el.addEventListener('click', () => { if (el.dataset.cid) _flashSeg(el.dataset.cid); });
    });
    panel.querySelector('#wBack').addEventListener('click', e => {
        e.preventDefault();
        if (_wheelSel) _updateKeyPanel(_wheelSel, _buildByKey());
    });

    // Async Spotify suggestions
    if (song.id) {
        fetch('/api/sp/discover', {
            method: 'POST',
            body: JSON.stringify({
                seedTrackIds: [song.id],
                targetFeatures: { energy: song.energy, valence: song.valence, danceability: song.danceability, tempo: song.tempo },
                limit: 8
            })
        }).then(r => r.ok ? r.json() : null).then(tracks => {
            const disc = document.getElementById('wDisc');
            if (!disc) return;
            if (!tracks || tracks.error || !tracks.length) {
                disc.innerHTML = '<div class="grey-text" style="font-size:11px;">No Spotify suggestions available</div>';
                return;
            }
            const cards = tracks.map(t => {
                const previewIcon = t.preview_url
                    ? `<a href="#" onclick="if(typeof playDiscoveryPreview==='function')playDiscoveryPreview(this._t); return false;"
                          style="color:#1DB954; font-size:16px; flex-shrink:0; text-decoration:none;" title="Preview">▶</a>`
                    : '';
                const row = `<div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid #f0f0f0; font-size:12px;">
                    <img src="${t.albumArt || ''}" style="width:32px; height:32px; object-fit:cover; border-radius:3px; flex-shrink:0;" onerror="this.style.display='none'">
                    <div class="truncate" style="flex:1">
                        <div style="font-weight:600;">${_esc(t.name)}</div>
                        <div class="grey-text">${_esc(t.Artist)}</div>
                    </div>
                    <span class="grey-text" style="font-size:10px; flex-shrink:0;" title="Key unknown for external tracks">?</span>
                    ${previewIcon}
                </div>`;
                return { row, t };
            });
            disc.innerHTML = `<div style="font-size:12px; font-weight:600; color:#555; margin-bottom:4px;">Spotify suggestions</div>` +
                cards.map(c => c.row).join('');
            // Wire preview buttons after render
            disc.querySelectorAll('a[title="Preview"]').forEach((btn, i) => {
                btn._t = cards[i].t;
            });
        }).catch(() => {
            const disc = document.getElementById('wDisc');
            if (disc) disc.innerHTML = '';
        });
    }
}

function _flashSeg(cid) {
    clearTimeout(_wheelPulseTimer);
    const prev = _wheelSel;
    _wheelSel = cid;
    _drawWheel(_buildByKey());
    _wheelSel = prev;
    _wheelPulseTimer = setTimeout(() => _drawWheel(_buildByKey()), 900);
}

function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
