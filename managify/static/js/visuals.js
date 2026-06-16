// ── Visuals tab: mood map, radar, histograms, selection, discovery ──────────

const SCATTER_AXES = [
    { label: 'Energy',           key: 'energy',           range: [-0.05, 1.05] },
    { label: 'Positiveness',     key: 'valence',          range: [-0.05, 1.05] },
    { label: 'Danceability',     key: 'danceability',     range: [-0.05, 1.05] },
    { label: 'BPM',              key: 'tempo',            range: [55, 210] },
    { label: 'Acousticness',     key: 'acousticness',     range: [-0.05, 1.05] },
    { label: 'Instrumentalness', key: 'instrumentalness', range: [-0.05, 1.05] },
    { label: 'Liveness',         key: 'liveness',         range: [-0.05, 1.05] },
    { label: 'Speechiness',      key: 'speechiness',      range: [-0.05, 1.05] },
    { label: 'Loudness',         key: 'loudness',         range: [-65, 5] },
];

const GENRE_COLORS = [
    '#1DB954','#E91E63','#3F51B5','#FF9800','#00BCD4',
    '#9C27B0','#F44336','#4CAF50','#FF5722','#607D8B',
    '#795548','#009688','#CDDC39','#FFC107','#2196F3'
];

const RADAR_FEATURES = [
    { label: 'Energy',           key: 'energy',           norm: v => v },
    { label: 'Positiveness',     key: 'valence',          norm: v => v },
    { label: 'Danceability',     key: 'danceability',     norm: v => v },
    { label: 'Acousticness',     key: 'acousticness',     norm: v => v },
    { label: 'Instrumentalness', key: 'instrumentalness', norm: v => v },
    { label: 'Liveness',         key: 'liveness',         norm: v => v },
    { label: 'Speechiness',      key: 'speechiness',      norm: v => v },
    { label: 'BPM',              key: 'tempo',            norm: v => Math.min(v / 200, 1) },
];

const HISTOGRAM_FEATURES = [
    { key: 'energy',           label: 'Energy',       bins: 20, range: [0, 1] },
    { key: 'valence',          label: 'Positiveness', bins: 20, range: [0, 1] },
    { key: 'danceability',     label: 'Danceability', bins: 20, range: [0, 1] },
    { key: 'tempo',            label: 'BPM',          bins: 30, range: [60, 200] },
    { key: 'instrumentalness', label: 'Instrumental', bins: 20, range: [0, 1] },
];

let currentSelection = [];
let radarChartInstance = null;
let visualsSearchIds = [];
let _searchDebounce = null;

function getAxisKey(selectId, fallback) {
    const el = document.getElementById(selectId);
    return (el && el.value) || fallback;
}

function onVisualsSearch(query) {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => {
        const q = query.trim().toLowerCase();
        const data = getVisualsData() || [];
        visualsSearchIds = q.length >= 2
            ? data.filter(s => s.Song.toLowerCase().includes(q) || s.Artist.toLowerCase().includes(q)).map(s => s.id)
            : [];
        drawMoodMap(data);
    }, 250);
}

// ── Entry point called from manager.js after data/features update ─────────

function refreshVisuals() {
    const data = getVisualsData();
    if (!data || !data.length) return;
    drawMoodMap(data);
    drawRadarChart(data, currentSelection);
    drawHistograms(data);
    drawParallelCoords(storedData.data);
    drawBpmKeyHeatmap(storedData.data);
}

function getVisualsData() {
    if (typeof storedData === 'undefined' || !storedData || !storedData.data) return null;
    const xKey = getAxisKey('scatterXAxis', 'energy');
    const yKey = getAxisKey('scatterYAxis', 'valence');
    return storedData.data.filter(s => typeof s[xKey] === 'number' && typeof s[yKey] === 'number');
}

// ── T6: Scatter plot ──────────────────────────────────────────────────────

function drawMoodMap(data) {
    const xKey = getAxisKey('scatterXAxis', 'energy');
    const yKey = getAxisKey('scatterYAxis', 'valence');
    const xCfg = SCATTER_AXES.find(a => a.key === xKey) || SCATTER_AXES[0];
    const yCfg = SCATTER_AXES.find(a => a.key === yKey) || SCATTER_AXES[1];

    const genreGroups = {};
    data.forEach(song => {
        const g = song.topGenre || 'Unknown';
        if (!genreGroups[g]) genreGroups[g] = [];
        genreGroups[g].push(song);
    });

    const genres = Object.keys(genreGroups);
    const traces = genres.map((genre, i) => {
        const songs = genreGroups[genre];
        return {
            x: songs.map(s => s[xKey]),
            y: songs.map(s => s[yKey]),
            customdata: songs.map(s => s.id),
            text: songs.map(s =>
                `<b>${escapeHtml(s.Song)}</b><br>${escapeHtml(s.Artist)}<br>` +
                `Genre: ${escapeHtml(genre)}<br>` +
                `${xCfg.label}: ${((s[xKey]) || 0).toFixed(2)}  ${yCfg.label}: ${((s[yKey]) || 0).toFixed(2)}`
            ),
            hovertemplate: '%{text}<extra></extra>',
            mode: 'markers',
            type: 'scatter',
            name: genre,
            marker: {
                size: 9,
                color: GENRE_COLORS[i % GENRE_COLORS.length],
                opacity: 0.75,
                line: { width: 0.5, color: '#fff' }
            }
        };
    });

    if (visualsSearchIds.length) {
        const matched = data.filter(s => visualsSearchIds.includes(s.id));
        if (matched.length) {
            traces.push({
                x: matched.map(s => s[xKey]),
                y: matched.map(s => s[yKey]),
                customdata: matched.map(s => s.id),
                text: matched.map(s => `<b>${escapeHtml(s.Song)}</b><br>${escapeHtml(s.Artist)}`),
                hovertemplate: '%{text}<extra></extra>',
                mode: 'markers',
                type: 'scatter',
                name: 'Search match',
                marker: { symbol: 'star', size: 14, color: '#FFD700', opacity: 1, line: { width: 1, color: '#555' } }
            });
        }
    }

    const xMid = (xCfg.range[0] + xCfg.range[1]) / 2;
    const yMid = (yCfg.range[0] + yCfg.range[1]) / 2;

    const layout = {
        dragmode: 'lasso',
        xaxis: { title: xCfg.label, range: xCfg.range, zeroline: false, gridcolor: '#eee' },
        yaxis: { title: yCfg.label, range: yCfg.range, zeroline: false, gridcolor: '#eee' },
        paper_bgcolor: '#fafafa',
        plot_bgcolor: '#fafafa',
        margin: { t: 30, r: 10, b: 80, l: 60 },
        legend: { orientation: 'h', y: -0.25, font: { size: 11 } },
        shapes: [
            { type: 'line', x0: xMid, x1: xMid, y0: yCfg.range[0], y1: yCfg.range[1], line: { color: '#ddd', width: 1, dash: 'dot' } },
            { type: 'line', x0: xCfg.range[0], x1: xCfg.range[1], y0: yMid, y1: yMid, line: { color: '#ddd', width: 1, dash: 'dot' } },
        ]
    };

    Plotly.react('moodMap', traces, layout, { responsive: true, displayModeBar: true, modeBarButtonsToRemove: ['toImage'] });

    const plotEl = document.getElementById('moodMap');
    // Remove old listeners to avoid duplicates on re-render
    plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_selected');
    plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_deselect');

    plotEl.on('plotly_selected', function (eventData) {
        if (!eventData || !eventData.points.length) {
            currentSelection = [];
        } else {
            currentSelection = eventData.points.map(p => p.customdata);
        }
        updateSelectionPanel(currentSelection);
        drawRadarChart(getVisualsData(), currentSelection);
    });

    plotEl.on('plotly_deselect', function () {
        currentSelection = [];
        updateSelectionPanel([]);
        drawRadarChart(getVisualsData(), []);
    });
}

// ── T7: Radar chart ───────────────────────────────────────────────────────

function avgFeatures(songs) {
    if (!songs.length) return RADAR_FEATURES.map(() => 0);
    return RADAR_FEATURES.map(({ key, norm }) => {
        const vals = songs.map(s => s[key]).filter(v => typeof v === 'number');
        if (!vals.length) return 0;
        return norm(vals.reduce((a, b) => a + b, 0) / vals.length);
    });
}

function drawRadarChart(allData, selectedIds) {
    const allSongs = allData || [];
    const selected = selectedIds && selectedIds.length
        ? allSongs.filter(s => selectedIds.includes(s.id))
        : [];

    const labels = RADAR_FEATURES.map(f => f.label);
    const playlistAvg = avgFeatures(allSongs);
    const datasets = [{
        label: `Playlist (${allSongs.length})`,
        data: playlistAvg,
        borderColor: 'rgba(29,185,84,0.85)',
        backgroundColor: 'rgba(29,185,84,0.12)',
        pointRadius: 3,
        borderWidth: 2,
    }];

    if (selected.length) {
        datasets.push({
            label: `Selection (${selected.length})`,
            data: avgFeatures(selected),
            borderColor: 'rgba(233,30,99,0.9)',
            backgroundColor: 'rgba(233,30,99,0.12)',
            pointRadius: 3,
            borderWidth: 2,
        });
    }

    const ctx = document.getElementById('radarChart');
    if (!ctx) return;

    if (radarChartInstance) radarChartInstance.destroy();
    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: { labels, datasets },
        options: {
            scales: {
                r: {
                    min: 0, max: 1,
                    ticks: { stepSize: 0.25, font: { size: 9 }, backdropColor: 'transparent' },
                    pointLabels: { font: { size: 10 } }
                }
            },
            plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } } },
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}

// ── T8: Feature histograms ─────────────────────────────────────────────────

function drawHistograms(data) {
    const container = document.getElementById('histogramsContainer');
    if (!container) return;

    HISTOGRAM_FEATURES.forEach(feat => {
        const divId = `hist_${feat.key}`;
        if (!document.getElementById(divId)) {
            const div = document.createElement('div');
            div.id = divId;
            div.style.cssText = 'width:180px; height:160px; flex-shrink:0;';
            container.appendChild(div);
        }
        const values = data.map(s => s[feat.key]).filter(v => typeof v === 'number');
        Plotly.react(divId, [{
            x: values,
            type: 'histogram',
            nbinsx: feat.bins,
            marker: { color: '#1DB954', opacity: 0.75 },
        }], {
            title: { text: feat.label, font: { size: 12 } },
            margin: { t: 28, r: 5, b: 28, l: 30 },
            paper_bgcolor: '#fafafa',
            plot_bgcolor: '#fafafa',
            xaxis: { range: feat.range, tickfont: { size: 9 } },
            yaxis: { tickfont: { size: 9 } },
            bargap: 0.05,
        }, { responsive: false, displayModeBar: false });
    });
}

// ── Selection panel (shared by T6 + T10) ─────────────────────────────────

function updateSelectionPanel(selectedIds) {
    const panel = document.getElementById('selectionPanel');
    if (!panel) return;

    if (!selectedIds || !selectedIds.length) {
        panel.innerHTML = '<p class="grey-text center-align" style="padding:16px; font-size:13px;">Lasso songs on the chart to select them</p>';
        return;
    }

    const songs = (storedData.data || []).filter(s => selectedIds.includes(s.id));
    const listHTML = songs.slice(0, 40).map(s =>
        `<div class="truncate" style="font-size:11px; padding:1px 0; line-height:1.4">
            <b>${escapeHtml(s.Song)}</b> <span class="grey-text">— ${escapeHtml(s.Artist)}</span>
        </div>`
    ).join('');
    const more = songs.length > 40
        ? `<div class="grey-text" style="font-size:11px; padding:2px 0">…and ${songs.length - 40} more</div>`
        : '';

    panel.innerHTML = `
        <div style="padding: 4px 0 8px">
            <b style="font-size:13px">${songs.length} songs selected</b>
            <div style="max-height:180px; overflow-y:auto; margin:6px 0; border-top:1px solid #eee; padding-top:4px">
                ${listHTML}${more}
            </div>
            <button class="btn btn-small waves-effect grey lighten-1" onclick="showCreatePlaylistForm()"
                    style="font-size:11px">
                <i class="material-icons left" style="font-size:14px">playlist_add</i>Save
            </button>
        </div>`;
}

// ── T11: Create playlist ───────────────────────────────────────────────────

function showCreatePlaylistForm() {
    const existing = document.getElementById('createPlaylistForm');
    if (existing) { existing.remove(); return; }

    const panel = document.getElementById('selectionPanel');
    const form = document.createElement('div');
    form.id = 'createPlaylistForm';
    form.style.marginTop = '8px';
    form.innerHTML = `
        <div style="display:flex; gap:6px; align-items:center">
            <input id="newPlaylistName" type="text" placeholder="Playlist name"
                   style="border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:12px; flex:1; height:28px;">
            <button class="btn btn-small waves-effect" style="background:#1DB954; height:28px; line-height:28px; padding:0 10px; font-size:11px"
                    onclick="doCreatePlaylist()">Create</button>
        </div>
        <label style="display:flex; align-items:center; gap:6px; margin-top:8px; cursor:pointer; font-size:11px; color:#555;">
            <input type="checkbox" id="camelotOrder"
                   style="width:14px; height:14px; margin:0; cursor:pointer;">
            <span>Order by Camelot wheel <span style="color:#aaa;">(keys blend naturally)</span></span>
        </label>`;
    panel.appendChild(form);
    document.getElementById('newPlaylistName').focus();
}

async function doCreatePlaylist() {
    const nameInput = document.getElementById('newPlaylistName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) { M.toast({ html: 'Enter a playlist name' }); return; }

    let trackIds = currentSelection.length
        ? currentSelection
        : (storedData.data || []).map(s => s.id);

    if (document.getElementById('camelotOrder')?.checked) {
        trackIds = camelotChain(trackIds);
    }

    try {
        const resp = await fetch('/api/sp/createPlaylist', {
            method: 'POST',
            body: JSON.stringify({ name, trackIds, public: false, description: 'Created with Mixe' })
        });
        const result = await resp.json();
        if (result.message === 'ok') {
            M.toast({ html: `Playlist "${escapeHtml(result.name)}" created!` });
            document.getElementById('createPlaylistForm')?.remove();
        } else {
            M.toast({ html: result.error || 'Failed to create playlist' });
        }
    } catch (e) {
        M.toast({ html: 'Failed to create playlist' });
    }
}

function camelotChain(trackIds) {
    const byId = {};
    (storedData.data || []).forEach(s => { byId[s.id] = s; });

    const withKey = trackIds.filter(id => byId[id] && typeof byId[id].key === 'number');
    const noKey   = trackIds.filter(id => !withKey.includes(id));
    if (withKey.length <= 1) return [...withKey, ...noKey];

    const remaining = new Set(withKey);
    const chain = [withKey[0]];
    remaining.delete(withKey[0]);

    while (remaining.size > 0) {
        const cur = byId[chain[chain.length - 1]];
        const curCid = typeof _songCamelot === 'function' ? _songCamelot(cur) : null;
        let best = null, bestScore = Infinity;
        for (const id of remaining) {
            const score = _camelotCompatScore(curCid, cur, byId[id]);
            if (score < bestScore) { bestScore = score; best = id; }
        }
        chain.push(best);
        remaining.delete(best);
    }

    return [...chain, ...noKey];
}

function _camelotCompatScore(curCid, s1, s2) {
    const cid2 = typeof _songCamelot === 'function' ? _songCamelot(s2) : null;
    let keyScore;
    if (!curCid || !cid2) {
        keyScore = 20;
    } else if (curCid === cid2) {
        keyScore = 0;
    } else {
        const c1 = CAMELOT_REV[curCid], c2 = CAMELOT_REV[cid2];
        const dist = Math.min(Math.abs(c1.n - c2.n), 12 - Math.abs(c1.n - c2.n));
        const sameRing = c1.r === c2.r;
        if (dist === 1 && sameRing) keyScore = 1;       // ±1 same ring: smooth
        else if (dist === 0) keyScore = 2;              // same number, other ring: energy shift
        else keyScore = 3 + dist;
    }
    const energyDiff = Math.abs((s1.energy || 0.5) - (s2.energy || 0.5));
    return keyScore * 10 + energyDiff;
}

// ── Parallel Coordinates ──────────────────────────────────────────────────

const PARCOORDS_DIMS = [
    { label: 'Energy',           key: 'energy',           range: [0, 1],    norm: v => v },
    { label: 'Positiveness',     key: 'valence',          range: [0, 1],    norm: v => v },
    { label: 'Danceability',     key: 'danceability',     range: [0, 1],    norm: v => v },
    { label: 'Acousticness',     key: 'acousticness',     range: [0, 1],    norm: v => v },
    { label: 'Instrumentalness', key: 'instrumentalness', range: [0, 1],    norm: v => v },
    { label: 'Speechiness',      key: 'speechiness',      range: [0, 1],    norm: v => v },
    { label: 'BPM',              key: 'tempo',            range: [0, 1],    norm: v => Math.min(v / 210, 1) },
    { label: 'Loudness',         key: 'loudness',         range: [0, 1],    norm: v => Math.max((v + 65) / 70, 0) },
];

let _parEl = null;

function drawParallelCoords(data) {
    const songs = (data || []).filter(s => typeof s.energy === 'number');
    if (!songs.length) return;

    const dimensions = PARCOORDS_DIMS.map(d => ({
        label: d.label,
        range: [0, 1],
        values: songs.map(s => typeof s[d.key] === 'number' ? d.norm(s[d.key]) : null),
        tickvals: [0, 0.25, 0.5, 0.75, 1],
        ticktext: d.key === 'tempo'
            ? ['0', '53', '105', '158', '210']
            : d.key === 'loudness'
            ? ['-65', '-49', '-33', '-16', '0']
            : ['0', '.25', '.5', '.75', '1'],
    }));

    const colorVals = songs.map(s => s.energy || 0);

    Plotly.react('parallelCoordsChart', [{
        type: 'parcoords',
        line: { color: colorVals, colorscale: 'Viridis', showscale: true,
                colorbar: { title: { text: 'Energy', font: { size: 11 } }, thickness: 12, len: 0.6 } },
        dimensions,
    }], {
        margin: { t: 30, r: 80, b: 30, l: 80 },
        paper_bgcolor: '#fafafa',
    }, { responsive: true, displayModeBar: false });

    const el = document.getElementById('parallelCoordsChart');
    if (el === _parEl) return; // listener already attached
    _parEl = el;

    el.on('plotly_restyle', () => {
        const trace = el._fullData && el._fullData[0];
        if (!trace) return;
        const dims = trace.dimensions;
        const selected = songs.filter((_, i) =>
            dims.every(dim => {
                const cr = dim.constraintrange;
                if (!cr || !cr.length) return true;
                const val = dim.values[i];
                if (val === null) return false;
                const ranges = Array.isArray(cr[0]) ? cr : [cr];
                return ranges.some(([lo, hi]) => val >= lo && val <= hi);
            })
        );
        currentSelection = selected.map(s => s.id);
        updateSelectionPanel(currentSelection);
        drawRadarChart(getVisualsData(), currentSelection);
    });
}

// ── BPM × Key Heatmap ────────────────────────────────────────────────────

const BPM_LABELS  = ['<70','70–80','80–90','90–100','100–110','110–120','120–130','130–140','140–150','150–160','160+'];
const CAM_LABELS  = ['1A','1B','2A','2B','3A','3B','4A','4B','5A','5B','6A','6B',
                     '7A','7B','8A','8B','9A','9B','10A','10B','11A','11B','12A','12B'];

let _heatSongIds = [];  // [bpmRow][camCol] = [id, ...]

function _bpmBucket(tempo) {
    if (!tempo || tempo < 70) return 0;
    if (tempo >= 160) return 10;
    return Math.floor((tempo - 70) / 10) + 1;
}

function drawBpmKeyHeatmap(data) {
    const songs = (data || []).filter(s => typeof s.key === 'number' && typeof s.tempo === 'number');
    if (!songs.length) return;

    const nRows = BPM_LABELS.length, nCols = CAM_LABELS.length;
    const z = Array.from({ length: nRows }, () => new Array(nCols).fill(0));
    _heatSongIds = Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => []));

    songs.forEach(s => {
        const cid = typeof _songCamelot === 'function' ? _songCamelot(s) : null;
        if (!cid) return;
        const col = CAM_LABELS.indexOf(cid);
        if (col === -1) return;
        const row = _bpmBucket(s.tempo);
        z[row][col]++;
        _heatSongIds[row][col].push(s.id);
    });

    Plotly.react('bpmKeyHeatmap', [{
        type: 'heatmap',
        z,
        x: CAM_LABELS,
        y: BPM_LABELS,
        colorscale: 'YlGn',
        hoverongaps: false,
        hovertemplate: '%{y}  %{x}<br>%{z} songs<extra></extra>',
        showscale: true,
        colorbar: { thickness: 12, len: 0.8, title: { text: 'Songs', font: { size: 11 } } },
    }], {
        margin: { t: 20, r: 80, b: 60, l: 60 },
        paper_bgcolor: '#fafafa',
        plot_bgcolor: '#fafafa',
        xaxis: { title: 'Camelot key', tickfont: { size: 10 } },
        yaxis: { title: 'BPM range', tickfont: { size: 10 } },
    }, { responsive: true, displayModeBar: false });

    const el = document.getElementById('bpmKeyHeatmap');
    el.removeAllListeners && el.removeAllListeners('plotly_click');
    el.on('plotly_click', evt => {
        if (!evt || !evt.points.length) return;
        const pt = evt.points[0];
        const row = BPM_LABELS.indexOf(pt.y);
        const col = CAM_LABELS.indexOf(pt.x);
        if (row === -1 || col === -1) return;
        currentSelection = [...(_heatSongIds[row][col] || [])];
        updateSelectionPanel(currentSelection);
        drawRadarChart(getVisualsData(), currentSelection);
    });
}

// ── Utility ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
