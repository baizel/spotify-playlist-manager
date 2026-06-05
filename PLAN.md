# Mixe — Feature Roadmap & Task Plan

Each task below is designed to be executed in a fresh Claude context. Read CLAUDE.md first for full codebase orientation before starting any task.

Status key: `[ ]` todo · `[x]` done · `[~]` in progress

---

## Phase 1 — Foundation fixes (no new features, fix existing bugs)

### T1 — Fix track filter to stop dropping valid songs
**Status:** `[x]`

**Goal:** `isTrackValid()` currently filters out any track without a `preview_url`. This silently drops large numbers of valid tracks (regional previews disabled, local files). Fix it.

**File:** `spotify/spotify.py` lines 119–121

**Current code:**
```python
def isTrackValid(track):
    return track.get('track') is not None and track['track']['type'] == 'track' and track['track']['album'][
        "album_type"] is not None and track['track']["preview_url"] is not None
```

**Change:** Remove the `and track['track']["preview_url"] is not None` clause. Keep the `type == 'track'` check (filters out podcasts/episodes) and `album_type is not None`.

**New code:**
```python
def isTrackValid(track):
    return (track.get('track') is not None
            and track['track']['type'] == 'track'
            and track['track']['album']['album_type'] is not None)
```

The player at `managify/templates/components/player.html` and `managify/static/js/player.js` already handles `preview_url: null` — the toggle defaults to Spotify Connect mode when preview is absent.

Also update `transformTrackInfosBasic` in `spotify/spotify.py` lines 54–87 — the `preview_url` field is stored on the song dict. No other changes needed there; the frontend reads `data.preview_url` and handles null gracefully.

**Test:** Load a large playlist. Songs that previously disappeared should now appear.

---

### T2 — Client-side audio feature cache (localStorage)
**Status:** `[x]`

**Goal:** Audio features for a given Spotify track ID never change. Add a `localStorage` cache so features don't need to be re-fetched when a previously-seen playlist is loaded again. Prefix all keys with `spm_feat_v1_` to avoid collisions.

**New backend endpoint** — add to `api/sp.py`:
```python
@bp.route('/features', methods=['POST'])
def features():
    from spotify.spotify import getFeaturesByIds
    return getFeaturesByIds(session, json.loads(request.data)), 200
```

**New backend function** — add to `spotify/spotify.py`:
```python
def getFeaturesByIds(session, trackIds):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)
    result = {}
    for chunk in chunks(trackIds, 100):
        features = sp.audio_features(chunk)
        for f in features:
            if f:
                result[f['id']] = f
    return result
```
Returns `{ "trackId": { feature fields... }, ... }`.

**Frontend** — add a new file `managify/static/js/featureCache.js` with these exported functions (include it in `manager.html` before `manager.js`):

```js
const FEATURE_CACHE_PREFIX = 'spm_feat_v1_';
const FEATURE_CACHE_MAX = 5000; // max tracks before eviction

function getCachedFeatures(trackIds) {
    const cached = {}, missing = [];
    for (const id of trackIds) {
        const val = localStorage.getItem(FEATURE_CACHE_PREFIX + id);
        if (val) cached[id] = JSON.parse(val);
        else missing.push(id);
    }
    return { cached, missing };
}

function setCachedFeatures(featureMap) {
    // evict if needed
    const keys = Object.keys(localStorage).filter(k => k.startsWith(FEATURE_CACHE_PREFIX));
    if (keys.length > FEATURE_CACHE_MAX) {
        keys.slice(0, Math.floor(FEATURE_CACHE_MAX * 0.2)).forEach(k => localStorage.removeItem(k));
    }
    for (const [id, features] of Object.entries(featureMap)) {
        try {
            localStorage.setItem(FEATURE_CACHE_PREFIX + id, JSON.stringify(features));
        } catch (e) {
            // QuotaExceededError — evict all and retry once
            keys.forEach(k => localStorage.removeItem(k));
            try { localStorage.setItem(FEATURE_CACHE_PREFIX + id, JSON.stringify(features)); } catch {}
        }
    }
}

async function fetchAndCacheFeatures(trackIds) {
    const { cached, missing } = getCachedFeatures(trackIds);
    if (!missing.length) return cached;
    const resp = await fetch('/api/sp/features', { method: 'POST', body: JSON.stringify(missing) });
    const fetched = await resp.json();
    setCachedFeatures(fetched);
    return { ...cached, ...fetched };
}
```

**Include in `manager.html`:** Add `<script src="{{ url_for('managify.static', filename='js/featureCache.js') }}"></script>` before `manager.js`.

**Test:** Load a playlist with 200+ songs, note features loaded, reload page, observe features appear immediately without network calls.

---

### T3 — Two-phase loading: table first, features async
**Status:** `[x]`

**Depends on:** T2 (featureCache.js must exist)

**Goal:** Show the song table immediately using the fast endpoint (no features), then load audio features in the background and update the table and visuals. Currently, the table either has no features (fast path) or is slow (full path). With this change, table always appears fast and features fill in within seconds.

**Files to modify:** `managify/static/js/manager.js`

**Change `updateTable()` in `manager.js` (currently lines 153–173):**

```js
async function updateTable(forceUseLastFetchedData) {
    return new Promise(async resolve => {
        if (forceUseLastFetchedData && cachedDataResult) {
            storedData = deepCopyHack(cachedDataResult);
        } else {
            storedData = await getPlaylistTracks(chosenPlaylists, "default");
            cachedDataResult = deepCopyHack(storedData);
        }
        allGeneresInCurrentStage = buildGenres();
        nonFilteredValue = deepCopyHack(storedData);
        showFilterByGenreOptions();
        applyGenreFilter();
        drawTable(() => {
            initSearchBar();
            setEditModeCheckbox();
            onEditMode();
            hideFilterColumns();
            resolve();
        });
        // Load features async after table renders
        loadFeaturesAsync();
    });
}

async function loadFeaturesAsync() {
    if (!storedData || !storedData.data || !storedData.data.length) return;
    const trackIds = storedData.data.map(s => s.id);
    const featureMap = await fetchAndCacheFeatures(trackIds);  // from featureCache.js
    mergeFeatures(featureMap);
    if (typeof refreshVisuals === 'function') refreshVisuals(); // hook for visuals tab (added in later tasks)
}

function mergeFeatures(featureMap) {
    storedData.data.forEach(song => {
        const f = featureMap[song.id];
        if (f) Object.assign(song, f);
    });
    cachedDataResult = deepCopyHack(storedData);
    // Redraw to populate feature columns
    const table = getTableData();
    if (table) {
        table.rows().invalidate().draw(false);
        hideFilterColumns();
    }
}
```

**Note:** `buildGenres()` requires `storedData.artists` to be populated. The fast endpoint returns `artists: {}`. There are two options:
- Option A: Also fetch artist info async (separate call to `/api/sp/artists` — needs a new endpoint similar to `/features`)
- Option B: Accept that genre chips don't work until artist data is fetched

Implement Option A: add `POST /api/sp/artists` endpoint analogous to `/api/sp/features`, accepting `[artistId, ...]` and returning `{artistId: {genres: [...], ...}}`. Fetch artist IDs from `storedData.data.flatMap(s => s.artists.map(a => a.id))` after the fast load, then call `buildGenres()` again once artist data arrives.

**New backend endpoint** in `api/sp.py`:
```python
@bp.route('/artists', methods=['POST'])
def artists():
    from spotify.spotify import getArtistsByIds
    return getArtistsByIds(session, json.loads(request.data)), 200
```

**New backend function** in `spotify/spotify.py`:
```python
def getArtistsByIds(session, artistIds):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)
    result = {}
    for chunk in chunks(list(set(artistIds)), 50):
        artists = sp.artists(chunk)['artists']
        for a in artists:
            if a:
                result[a['id']] = a
    return result
```

**Test:** Select a 500-song playlist. Table should appear in <3 seconds. Feature columns (BPM, Energy, etc.) and genre chips should populate within a few seconds after.

---

### T4 — Audit Spotify API scopes and deprecation check
**Status:** `[x]`

**Goal:** Verify `audio_features` still works for this app. Update `example.config.json` with the full required scope string for all planned features.

**Steps:**

1. Check if `audio_features` works. In `spotify/spotify.py`, temporarily add a log:
   ```python
   result = sp.audio_features(['3n3Ppam7vgaVa1iaRUIOKE'])
   print("audio_features test:", result)
   ```
   If result contains `None` entries or raises 403, the endpoint is blocked. If blocked, the scatter/radar charts cannot be built from Spotify data — document this prominently.

2. Update `example.config.json` `SP_SCOPE` to include all needed scopes:
   ```
   user-library-read
   playlist-read-private
   playlist-read-collaborative
   playlist-modify-public
   playlist-modify-private
   user-read-playback-state
   user-modify-playback-state
   streaming
   user-read-email
   user-read-private
   ```

3. Check your actual `config.json` against this list and add missing scopes. **Note:** Changing scopes requires the user to re-authorise (visit `/auth/logout` then `/auth/login`).

4. New feature `sp.recommendations()` requires no additional scope beyond `user-read-private`. Confirm this works by testing `sp.recommendations(seed_tracks=['3n3Ppam7vgaVa1iaRUIOKE'], limit=5)` in a test route.

**Files:** `example.config.json`, `config.json` (local only, gitignored)

---

## Phase 2 — Visuals tab: Mood Map scatter plot

### T5 — Enable visuals tab and wire up layout
**Status:** `[x]`

**Goal:** The "Visuals (Soon)" tab is currently `class="tab disabled"`. Enable it, add the tab content containers, and wire the tab-switch event so that switching to Visuals triggers feature loading.

**Files to modify:**
- `managify/templates/components/nav.html`
- `managify/templates/manager.html`
- `managify/static/manager.css`

**`nav.html` change** (line 10–11 currently):
```html
<!-- before -->
<li class="tab active"><a href="#test1">Playlist Manager</a></li>
<li class="tab disabled"><a href="#test2">Visuals (Soon)</a></li>

<!-- after -->
<li class="tab"><a class="active" href="#test1">Playlist Manager</a></li>
<li class="tab"><a href="#test2">Visuals</a></li>
```

**`manager.html` change** — wrap the existing `#tableContainer` and `nodata` divs in `<div id="test1" class="col s12">` and add a new `<div id="test2" class="col s12">`:
```html
<div id="test1" class="col s12">
    <!-- existing #tableContainer and .nodata divs go here -->
</div>
<div id="test2" class="col s12" style="display:none;">
    <div id="visuals-empty" class="valign-wrapper nodata">
        <div class="content"><h3 class="center-align">Select a playlist to see visuals</h3></div>
    </div>
    <div id="visuals-content" style="display:none;">
        <div class="row">
            <div class="col s8" id="moodMapContainer">
                <div id="moodMap" style="height: 500px;"></div>
            </div>
            <div class="col s4">
                <div id="radarChart" style="height: 300px;"></div>
                <div id="selectionPanel"></div>
            </div>
        </div>
        <div class="row">
            <div class="col s12" id="histogramsContainer"></div>
        </div>
        <div class="row">
            <div class="col s12" id="discoveryPanel"></div>
        </div>
    </div>
</div>
```

**Add Materialize tabs init** in `manager.js` `DOMContentLoaded`:
```js
const tabsElem = document.querySelector('.tabs');
const tabsInstance = M.Tabs.init(tabsElem, {
    onShow: function(tabContent) {
        if (tabContent.id === 'test2') {
            onVisualsTabActivated();
        }
    }
});
```

**Add `onVisualsTabActivated()`** in `manager.js`:
```js
function onVisualsTabActivated() {
    if (!storedData || !storedData.data || !storedData.data.length) {
        document.getElementById('visuals-empty').style.display = 'flex';
        document.getElementById('visuals-content').style.display = 'none';
        return;
    }
    document.getElementById('visuals-empty').style.display = 'none';
    document.getElementById('visuals-content').style.display = 'block';
    if (typeof refreshVisuals === 'function') refreshVisuals();
}
```

**Add Plotly.js and Chart.js CDN** to `manager.html` `<head>` (before `manager.js`):
```html
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script src="{{ url_for('managify.static', filename='js/featureCache.js') }}"></script>
<script src="{{ url_for('managify.static', filename='js/visuals.js') }}"></script>
```

**Create empty `managify/static/js/visuals.js`** with just:
```js
function refreshVisuals() {
    // populated in T6
}
```

**Test:** Clicking "Visuals" tab shows the empty state. Clicking "Playlist Manager" tab restores the table. No JS errors.

**Depends on:** T2, T3 (for features to actually render in the tab)

---

### T6 — Scatter plot: Energy vs Valence mood map
**Status:** `[x]`

**Depends on:** T5 (visuals tab layout), T3 (features loaded into storedData)

**Goal:** Render a scatter plot of all loaded songs by Energy (X-axis) vs Valence/Positiveness (Y-axis) in `#moodMap`. Colour points by `topGenre`. Show song name + artist on hover. Add quadrant annotations.

**File to create/modify:** `managify/static/js/visuals.js`

**Plotly.js CDN** must be loaded in `manager.html` before `visuals.js` (done in T5).

**Full implementation of `refreshVisuals()` and scatter in `visuals.js`:**

```js
const GENRE_COLORS = [
    '#1DB954','#E91E63','#3F51B5','#FF9800','#00BCD4',
    '#9C27B0','#F44336','#4CAF50','#FF5722','#607D8B'
];

let currentSelection = []; // track IDs selected by lasso

function refreshVisuals() {
    const data = getVisualsData(); // reads window.storedData
    if (!data || !data.length) return;
    drawMoodMap(data);
    drawRadarChart(data, currentSelection);
}

function getVisualsData() {
    if (typeof storedData === 'undefined' || !storedData.data) return null;
    // Only songs that have features loaded
    return storedData.data.filter(s => typeof s.energy === 'number' && typeof s.valence === 'number');
}

function drawMoodMap(data) {
    // Build one trace per genre for legend grouping
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
            x: songs.map(s => s.energy),
            y: songs.map(s => s.valence),
            customdata: songs.map(s => s.id),
            text: songs.map(s => `<b>${s.Song}</b><br>${s.Artist}<br>Genre: ${genre}<br>Energy: ${s.energy?.toFixed(2)}, Mood: ${s.valence?.toFixed(2)}`),
            hovertemplate: '%{text}<extra></extra>',
            mode: 'markers',
            type: 'scatter',
            name: genre,
            marker: {
                size: 8,
                color: GENRE_COLORS[i % GENRE_COLORS.length],
                opacity: 0.75
            }
        };
    });

    const layout = {
        dragmode: 'lasso',
        xaxis: { title: 'Energy  (calm → intense)', range: [-0.05, 1.05], zeroline: false },
        yaxis: { title: 'Positiveness  (dark → happy)', range: [-0.05, 1.05], zeroline: false },
        paper_bgcolor: '#fafafa',
        plot_bgcolor: '#fafafa',
        margin: { t: 30, r: 10, b: 60, l: 60 },
        legend: { orientation: 'h', y: -0.2 },
        annotations: [
            { x: 0.78, y: 0.95, xref: 'x', yref: 'y', text: 'Energetic & Happy', showarrow: false, font: { color: '#bbb', size: 11 } },
            { x: 0.78, y: 0.05, xref: 'x', yref: 'y', text: 'Intense & Dark',    showarrow: false, font: { color: '#bbb', size: 11 } },
            { x: 0.22, y: 0.95, xref: 'x', yref: 'y', text: 'Calm & Happy',      showarrow: false, font: { color: '#bbb', size: 11 } },
            { x: 0.22, y: 0.05, xref: 'x', yref: 'y', text: 'Calm & Dark',       showarrow: false, font: { color: '#bbb', size: 11 } },
        ],
        shapes: [
            { type: 'line', x0: 0.5, x1: 0.5, y0: 0, y1: 1, line: { color: '#ddd', width: 1, dash: 'dot' } },
            { type: 'line', x0: 0, x1: 1, y0: 0.5, y1: 0.5, line: { color: '#ddd', width: 1, dash: 'dot' } },
        ]
    };

    Plotly.react('moodMap', traces, layout, { responsive: true });

    const plotEl = document.getElementById('moodMap');
    plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_selected');
    plotEl.on('plotly_selected', function(eventData) {
        if (!eventData || !eventData.points.length) {
            currentSelection = [];
        } else {
            currentSelection = eventData.points.map(p => p.customdata);
        }
        updateSelectionPanel(currentSelection);
        drawRadarChart(getVisualsData(), currentSelection);
    });
    plotEl.on('plotly_deselect', function() {
        currentSelection = [];
        updateSelectionPanel([]);
        drawRadarChart(getVisualsData(), []);
    });
}
```

**Selection panel** (`updateSelectionPanel`) — renders selected song list into `#selectionPanel` (layout added in T5):
```js
function updateSelectionPanel(selectedIds) {
    const panel = document.getElementById('selectionPanel');
    if (!selectedIds.length) {
        panel.innerHTML = '<p class="grey-text center-align" style="padding:16px">Lasso songs on the chart to select them</p>';
        return;
    }
    const songs = storedData.data.filter(s => selectedIds.includes(s.id));
    const listHTML = songs.slice(0, 50).map(s =>
        `<div class="truncate" style="font-size:12px; padding:2px 0"><b>${s.Song}</b> — ${s.Artist}</div>`
    ).join('');
    const more = songs.length > 50 ? `<div class="grey-text">...and ${songs.length - 50} more</div>` : '';
    panel.innerHTML = `
        <div style="padding: 8px 0">
            <b>${songs.length} songs selected</b>
            <div style="max-height:200px; overflow-y:auto; margin: 8px 0">${listHTML}${more}</div>
            <button class="btn btn-small waves-effect" onclick="onDiscoverSimilar()" style="margin-right:8px; background:#1DB954">
                <i class="material-icons left">explore</i>Discover Similar
            </button>
            <button class="btn btn-small waves-effect grey" onclick="showCreatePlaylistForm()">
                <i class="material-icons left">playlist_add</i>Save as Playlist
            </button>
        </div>`;
}
```

**Test:** Load a playlist with features (T3 must be done). Visuals tab shows scatter plot with coloured dots and quadrant labels. Hovering shows song name and values. Lasso-selecting a group shows selection panel with song list.

---

### T7 — Radar chart: feature profile for selection vs playlist
**Status:** `[x]`

**Depends on:** T5, T6 (scatter + selection state)

**Goal:** A radar chart in `#radarChart` showing average audio features of the current lasso selection vs the full playlist average. Uses Chart.js (already loaded in T5).

**Add to `visuals.js`:**

The 8 features to display on the radar, all normalised 0–1:
```js
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

let radarChartInstance = null;

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
    const selected = selectedIds.length
        ? allSongs.filter(s => selectedIds.includes(s.id))
        : [];

    const playlistAvg = avgFeatures(allSongs);
    const selectionAvg = avgFeatures(selected);
    const labels = RADAR_FEATURES.map(f => f.label);

    const datasets = [{
        label: 'Playlist avg',
        data: playlistAvg,
        borderColor: 'rgba(29,185,84,0.8)',
        backgroundColor: 'rgba(29,185,84,0.15)',
        pointRadius: 3,
    }];

    if (selected.length) {
        datasets.push({
            label: `Selection (${selected.length})`,
            data: selectionAvg,
            borderColor: 'rgba(233,30,99,0.9)',
            backgroundColor: 'rgba(233,30,99,0.15)',
            pointRadius: 3,
        });
    }

    const ctx = document.getElementById('radarChart');
    if (!ctx) return;

    if (radarChartInstance) radarChartInstance.destroy();
    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: { labels, datasets },
        options: {
            scales: { r: { min: 0, max: 1, ticks: { stepSize: 0.25, font: { size: 10 } } } },
            plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}
```

Note: `#radarChart` in T5 layout uses a `<div>` but Chart.js needs a `<canvas>`. Change the container in T5 layout to:
```html
<div id="radarChartContainer" style="height: 300px; position: relative;">
    <canvas id="radarChart"></canvas>
</div>
```

**Test:** With a playlist loaded, radar shows one line for playlist average. After lasso-selecting songs, a second line appears for the selection. Values look plausible.

---

### T8 — Feature distribution histograms
**Status:** `[x]`

**Depends on:** T5, T3

**Goal:** 5 mini-histograms at the bottom of the visuals tab showing distribution of Energy, Valence, Danceability, BPM, and Instrumentalness across the loaded tracks. Uses Plotly (already loaded).

**Add to `visuals.js`:**

```js
const HISTOGRAM_FEATURES = [
    { key: 'energy',           label: 'Energy',         bins: 20, range: [0, 1] },
    { key: 'valence',          label: 'Positiveness',   bins: 20, range: [0, 1] },
    { key: 'danceability',     label: 'Danceability',   bins: 20, range: [0, 1] },
    { key: 'tempo',            label: 'BPM',            bins: 30, range: [60, 200] },
    { key: 'instrumentalness', label: 'Instrumental',   bins: 20, range: [0, 1] },
];

function drawHistograms(allData) {
    const container = document.getElementById('histogramsContainer');
    if (!container) return;

    // Create a div per histogram if not already present
    HISTOGRAM_FEATURES.forEach(feat => {
        const divId = `hist_${feat.key}`;
        if (!document.getElementById(divId)) {
            const div = document.createElement('div');
            div.id = divId;
            div.className = 'col s12 m6 l2';
            div.style.height = '180px';
            container.appendChild(div);
        }
        const values = allData.map(s => s[feat.key]).filter(v => typeof v === 'number');
        Plotly.react(divId, [{
            x: values,
            type: 'histogram',
            nbinsx: feat.bins,
            marker: { color: '#1DB954', opacity: 0.7 },
            xbins: { start: feat.range[0], end: feat.range[1] }
        }], {
            title: { text: feat.label, font: { size: 12 } },
            margin: { t: 30, r: 5, b: 30, l: 30 },
            paper_bgcolor: '#fafafa', plot_bgcolor: '#fafafa',
            xaxis: { range: feat.range },
            yaxis: { title: '' },
            bargap: 0.05,
        }, { responsive: true, displayModeBar: false });
    });
}
```

Call `drawHistograms(getVisualsData())` from `refreshVisuals()` after `drawMoodMap()`.

Add `class="row"` wrapper for the histogram `col` divs to work in Materialize grid.

**Test:** Histograms appear at the bottom of visuals tab. BPM histogram shows reasonable 60–200 distribution. Histograms update when playlists change.

---

## Phase 3 — Song discovery

### T9 — Backend: Spotify recommendations endpoint
**Status:** `[x]`

**Goal:** Add `POST /api/sp/discover` that accepts seed track IDs and target feature averages, calls Spotify's `/v1/recommendations`, and returns ~20 recommended tracks the user hasn't heard yet.

**File to modify:** `api/sp.py`
**File to modify:** `spotify/spotify.py`

**Add to `api/sp.py`:**
```python
@bp.route('/discover', methods=['POST'])
def discover():
    from spotify.spotify import getRecommendations
    return getRecommendations(session, json.loads(request.data)), 200
```

**Add to `spotify/spotify.py`:**
```python
def getRecommendations(session, data):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)

    seed_ids = data.get('seedTrackIds', [])[:5]
    if not seed_ids:
        return {"error": "No seed tracks provided"}, 400

    target_features = data.get('targetFeatures', {})
    # Spotify kwargs: target_energy, target_valence, etc.
    target_kwargs = {f"target_{k}": v for k, v in target_features.items()
                     if k in ('energy','valence','danceability','tempo','instrumentalness','acousticness','speechiness')}

    limit = min(data.get('limit', 20), 100)
    result = sp.recommendations(seed_tracks=seed_ids, limit=limit, **target_kwargs)

    tracks = result.get('tracks', [])
    return [{
        'id': t['id'],
        'uri': t['uri'],
        'name': t['name'],
        'Song': t['name'],
        'Artist': ', '.join(a['name'] for a in t['artists']),
        'artists': t['artists'],
        'albumArt': t['album']['images'][0]['url'] if t['album']['images'] else '/static/music-placeholder.png',
        'preview_url': t['preview_url'],
        'spotifyUrl': t['external_urls'].get('spotify', ''),
        'duration_ms': t['duration_ms'],
    } for t in tracks]
```

**Request shape:**
```json
{
  "seedTrackIds": ["id1", "id2", "id3"],
  "targetFeatures": { "energy": 0.8, "valence": 0.6 },
  "limit": 20
}
```

**Response shape:** Array of simplified track objects (see above).

**Test:** POST to `/api/sp/discover` with a known track ID returns 20 tracks. Test with `limit: 5` and no `targetFeatures`.

---

### T10 — Frontend: Discovery results panel
**Status:** `[x]`

**Depends on:** T7 (selection panel with "Discover Similar" button), T9 (backend endpoint)

**Goal:** When the user clicks "Discover Similar" in the selection panel, compute the feature centroid of selected songs, pick the 5 most representative seeds, call `/api/sp/discover`, and render results in `#discoveryPanel`.

**File to modify:** `managify/static/js/visuals.js`

**Centroid seed selection** — pick 5 songs closest to feature mean of selection:
```js
function pickSeeds(selectedSongs, n = 5) {
    if (selectedSongs.length <= n) return selectedSongs.map(s => s.id);
    const keys = ['energy', 'valence', 'danceability', 'tempo'];
    const centroid = {};
    keys.forEach(k => {
        const vals = selectedSongs.map(s => s[k] || 0);
        centroid[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    const scored = selectedSongs.map(s => {
        const dist = keys.reduce((sum, k) => {
            const norm = k === 'tempo' ? 200 : 1;
            return sum + Math.pow((s[k] || 0) / norm - centroid[k] / norm, 2);
        }, 0);
        return { id: s.id, dist };
    });
    scored.sort((a, b) => a.dist - b.dist);
    return scored.slice(0, n).map(s => s.id);
}
```

**`onDiscoverSimilar()` function:**
```js
async function onDiscoverSimilar() {
    const selectedSongs = storedData.data.filter(s => currentSelection.includes(s.id));
    if (!selectedSongs.length) return;

    const seedIds = pickSeeds(selectedSongs);
    const avgFeats = {};
    ['energy', 'valence', 'danceability', 'tempo'].forEach(k => {
        const vals = selectedSongs.map(s => s[k]).filter(v => typeof v === 'number');
        if (vals.length) avgFeats[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
    });

    const panel = document.getElementById('discoveryPanel');
    panel.innerHTML = '<div class="center-align" style="padding:24px"><div class="preloader-wrapper small active"><div class="spinner-layer spinner-green-only"><div class="circle-clipper left"><div class="circle"></div></div><div class="gap-patch"><div class="circle"></div></div><div class="circle-clipper right"><div class="circle"></div></div></div></div></div>';

    const resp = await fetch('/api/sp/discover', {
        method: 'POST',
        body: JSON.stringify({ seedTrackIds: seedIds, targetFeatures: avgFeats, limit: 20 })
    });
    const results = await resp.json();
    renderDiscoveryResults(results);
}

function renderDiscoveryResults(tracks) {
    const loadedIds = new Set((storedData.data || []).map(s => s.id));
    const panel = document.getElementById('discoveryPanel');

    const cards = tracks.map(t => {
        const inLibrary = loadedIds.has(t.id);
        const badge = inLibrary ? '<span class="chip green white-text" style="font-size:10px">In library</span>' : '';
        return `
        <div class="col s12 m6 l3" style="padding: 8px">
            <div class="card z-depth-1" style="margin:0">
                <div class="card-image" style="height:80px; overflow:hidden">
                    <img src="${t.albumArt}" style="width:100%; object-fit:cover">
                </div>
                <div class="card-content" style="padding: 8px 12px">
                    <p class="truncate" style="font-weight:bold; font-size:13px; margin:0">${t.name}</p>
                    <p class="truncate grey-text" style="font-size:11px; margin:0">${t.Artist}</p>
                    ${badge}
                </div>
                <div class="card-action" style="padding: 6px 12px">
                    ${t.preview_url ? `<a href="#" onclick="playPreview('${t.preview_url}', '${t.name}', '${t.albumArt}'); return false;" class="green-text">Preview</a>` : '<span class="grey-text" style="font-size:11px">No preview</span>'}
                    <a href="${t.spotifyUrl}" target="_blank" class="right">Open</a>
                </div>
            </div>
        </div>`;
    }).join('');

    panel.innerHTML = `
        <h6 style="padding: 16px 0 8px"><b>Discovered Songs</b> (${tracks.length} recommendations)</h6>
        <div class="row">${cards}</div>`;
}
```

**Note on `playPreview()`:** This should call the existing preview player from `player.js`. Check `managify/static/js/player.js` for the function signature and reuse it. If it's not easily callable from visuals context, create a simple `<audio>` inline player as fallback.

**Test:** Select songs on scatter, click "Discover Similar", see 20 recommendation cards. "In library" badge appears for songs already in loaded playlists.

---

## Phase 4 — Playlist creation from selection

### T11 — Create new Spotify playlist from selection
**Status:** `[x]`

**Depends on:** T7 (selection panel), T9 (discover endpoint shows the pattern)

**Goal:** Let users save a lasso selection directly as a new Spotify playlist.

**New backend endpoint** — add to `api/sp.py`:
```python
@bp.route('/createPlaylist', methods=['POST'])
def create_playlist():
    from spotify.spotify import createPlaylist
    return createPlaylist(session, json.loads(request.data)), 200
```

**New backend function** — add to `spotify/spotify.py`:
```python
def createPlaylist(session, data):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)

    user = sp.me()
    playlist = sp.user_playlist_create(
        user['id'],
        data['name'],
        public=data.get('public', False),
        description=data.get('description', 'Created with Mixe')
    )
    track_uris = [f"spotify:track:{tid}" for tid in data['trackIds']]
    for chunk in chunks(track_uris, 100):  # Spotify max 100 per call
        sp.playlist_add_items(playlist['id'], chunk)

    return {"playlistId": playlist['id'], "name": playlist['name'], "message": "ok"}
```

**Request shape:**
```json
{
  "name": "My Playlist Name",
  "trackIds": ["id1", "id2", ...],
  "public": false,
  "description": "Created from mood map selection"
}
```

**Frontend** — add `showCreatePlaylistForm()` to `visuals.js` (called from selection panel "Save as Playlist" button in T6):
```js
function showCreatePlaylistForm() {
    const panel = document.getElementById('selectionPanel');
    const existing = document.getElementById('createPlaylistForm');
    if (existing) { existing.remove(); return; }

    const form = document.createElement('div');
    form.id = 'createPlaylistForm';
    form.style.marginTop = '8px';
    form.innerHTML = `
        <div class="input-field" style="margin: 4px 0">
            <input id="newPlaylistName" type="text" placeholder="Playlist name">
        </div>
        <button class="btn btn-small waves-effect" style="background:#1DB954" onclick="doCreatePlaylist()">
            Create
        </button>`;
    panel.appendChild(form);
    document.getElementById('newPlaylistName').focus();
}

async function doCreatePlaylist() {
    const name = document.getElementById('newPlaylistName').value.trim();
    if (!name) { M.toast({ html: 'Enter a playlist name' }); return; }
    const trackIds = currentSelection.length
        ? currentSelection
        : (storedData.data || []).map(s => s.id);

    const resp = await fetch('/api/sp/createPlaylist', {
        method: 'POST',
        body: JSON.stringify({ name, trackIds, public: false, description: 'Created with Mixe' })
    });
    const result = await resp.json();
    if (result.message === 'ok') {
        M.toast({ html: `Playlist "${result.name}" created!` });
        document.getElementById('createPlaylistForm')?.remove();
    } else {
        M.toast({ html: 'Failed to create playlist' });
    }
}
```

**Note:** The new playlist won't appear in the sidenav until the page is refreshed (because `getAllPlaylistInfos` is cached for 1 hour). After success, optionally call `window.location.reload()` or clear the cache: there's no current mechanism to invalidate `getAllPlaylistInfos` cache from the frontend. Either tolerate this or add a `GET /api/sp/refreshPlaylists` route that calls `cache.delete_memoized(getAllPlaylistInfos, accessToken)`.

**Scope required:** `playlist-modify-private` (and `playlist-modify-public` if public). Ensure these are in `config.json` `SP_SCOPE`.

**Test:** Select songs on scatter, click "Save as Playlist", enter a name, click Create. Playlist appears in Spotify. Page reload shows it in the sidenav.

---

## Implementation order summary

```
T1  Fix isTrackValid (preview_url)        — 15 min, no deps
T4  Scope/deprecation audit               — 30 min, no deps
T2  localStorage feature cache            — 1 hr, no deps
T3  Two-phase loading                     — 1 hr, depends on T2
T5  Enable visuals tab + layout           — 1 hr, depends on T2, T3
T6  Scatter plot mood map                 — 2 hr, depends on T5, T3
T7  Radar chart                           — 1 hr, depends on T6
T8  Histograms                            — 1 hr, depends on T5, T3
T9  Discovery backend endpoint            — 1 hr, no deps
T10 Discovery results panel               — 2 hr, depends on T9, T6
T11 Create playlist from selection        — 1 hr, depends on T6
```

Start with T1 and T4 (quick wins, no dependencies). Then T2 → T3 → T5 → T6 unlocks everything else.
