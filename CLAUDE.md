# Mixe — Spotify Playlist Manager

## What this is
A Flask web app for combining and managing Spotify playlists. Users select playlists from a sidenav, view all their songs in a filterable/sortable DataTable, see audio feature columns (Energy, BPM, Valence etc.), filter by genre chips, and play tracks via a Spotify Web Playback SDK player or preview URLs. There is a "Visuals" tab stub that currently does nothing.

## Stack
- **Backend:** Python 3.12, Flask 3.1, Spotipy 2.25.1, Flask-Caching
- **Frontend:** Materialize CSS 1.0.0, jQuery 3.5.1, DataTables 1.10.22, Spotify Web Playback SDK
- **Auth:** Spotify OAuth via Spotipy `SpotifyOAuth`
- **Caching:** Flask-Caching (in-memory by default, Redis optional via config)

## Project layout
```
app.py                          Flask app factory, registers blueprints, creates cache
config.json                     Runtime secrets (gitignored); see example.config.json
example.config.json             Config template with SP_CLIENT_ID/SECRET/REDIRECT_URI/SP_SCOPE

api/
  auth.py                       OAuth routes: /auth/login, /auth/callback, /auth/logout
  sp.py                         Spotify proxy routes: /api/sp/*

spotify/
  spotify.py                    All Spotify API logic (track fetching, features, edit, play)

utils/
  constants.py                  LIKED_SONGS_ID, FILTERABLE feature config dict
  utils.py                      getTokenInfo, getNewAuthManager, chunks, mergeDicts, stripChars

managify/
  managify.py                   Page routes: / (login redirect) and /manager
  templates/
    index.html                  Login landing page
    manager.html                Main app shell (includes components, loads scripts)
    components/
      nav.html                  Top nav bar with tab switcher (Playlist Manager / Visuals)
      sidenav.html              Left sidebar with playlist list
      player.html               Bottom-left player (preview + Spotify Connect)
      modal.html                Filter modal (audio feature checkboxes + genre chips)
  static/
    js/
      manager.js                Main frontend logic (table, playlists, filter, selection)
      init.js                   Player initialisation
      player.js                 Spotify Web Playback SDK + preview player logic
    css/
      datatable.css             DataTables custom theme
    manager.css                 Main layout + component styles
```

## Configuration (`config.json`)
```json
{
  "SP_CLIENT_ID": "...",
  "SP_CLIENT_SECRET": "...",
  "SP_REDIRECT_URI": "http://localhost:5000/auth/callback",
  "SP_SCOPE": "user-library-read playlist-read-private playlist-modify-public playlist-modify-private user-read-playback-state user-modify-playback-state streaming user-read-email user-read-private",
  "CACHE_TYPE": "SimpleCache",
  "SECRET_KEY": "..."
}
```
The `SP_SCOPE` above is the full required scope including Web Playback SDK and playlist editing. The app reads from `config.json` via `app.config.from_file()`.

## Data flow — loading a playlist
1. User clicks a playlist in the sidenav → `toggleAndUpdateTable(id, name, isReadOnly)` in `manager.js`
2. `updateTable()` calls `POST /api/sp/playlist/fast` with `[{id, name, isReadOnly}, ...]`
3. Backend `getTracksBasic()` paginates through playlist items, returns minimal track data (no audio features)
4. Table renders immediately. Audio features are **not** loaded in this fast path.
5. The full endpoint `POST /api/sp/playlist` also calls `getTrackFeatures()` and `getArtistInfos()` but is not currently used in the UI (the fast path replaced it for performance).

## Track data shape
**From fast endpoint** (`/api/sp/playlist/fast`):
```json
{
  "data": [{
    "id": "trackId",
    "uri": "spotify:track:...",
    "name": "Song Title",
    "Song": "Song Title",
    "Artist": "Artist Name",
    "artists": [{"id": "artistId", "name": "..."}],
    "album": {"images": [{"url": "..."}], ...},
    "preview_url": "https://... or null",
    "playlists": ["Playlist A"],
    "Playlist A": true,
    "Playlist B": false
  }],
  "columns": [
    {"title": "Song", "data": "Song"},
    {"title": "Artist", "data": "Artist"},
    {"title": "Playlist A", "data": "Playlist A", "id": "playlistId"}
  ],
  "artists": {}
}
```

**Audio features** (added when features endpoint is called, merged into each track):
```
danceability, energy, valence, tempo, instrumentalness,
liveness, loudness, speechiness, key, mode, time_signature, acousticness
```
All 0–1 except: `tempo` (~60–200 BPM), `loudness` (~-60–0 dB), `key` (0–11), `mode` (0/1), `time_signature` (int).

## Key functions — backend (`spotify/spotify.py`)
| Function | Purpose |
|---|---|
| `getTracksBasic(session, data)` | Fast track fetch, no features/artist info |
| `getTracks(session, data)` | Full fetch with audio features + artist genres |
| `transformTrackInfosBasic(...)` | Paginates playlist, builds minimal song dict |
| `transformTrackInfos(...)` | Paginates playlist, collects artist IDs for genre lookup |
| `getTrackFeatures(tracks, accessToken)` | Batches `sp.audio_features()` in chunks of 100 |
| `getArtistInfos(artistIds, accessToken)` | Batches `sp.artists()` in chunks of 50 |
| `getAllPlaylistInfos(accessToken)` | Fetches all user playlists; `@cache.memoize(3600)` |
| `playSongs(session, data)` | Calls `sp.start_playback()` |
| `editPlayList(session, data)` | Add/remove track from playlist |

## Key functions — frontend (`manager.js`)
| Function | Purpose |
|---|---|
| `updateTable(forceUseLastFetchedData)` | Main entry: fetch data, build genres, draw table |
| `getPlaylistTracks(playlists, cachePolicy)` | `POST /api/sp/playlist/fast` |
| `drawTable(onDraw)` | Destroys+recreates DataTable with current `storedData` |
| `buildGenres()` | Derives `topGenre` and `genres Map` from `storedData.artists` — mutates `storedData.data` |
| `applyGenreFilter()` | Filters `storedData.data` to `genreFilters` selection |
| `handleFilterChange()` | Re-renders table after filter modal close |
| `formatCheckboxColumns(...)` | Renders playlist membership checkboxes |
| `deepCopyHack(data)` | JSON round-trip with Map serializer (needed for DataTables) |

## Global state (`manager.js`)
```js
chosenPlaylists    // [{id, name, isReadOnly}] — user-selected playlists
storedData         // {data[], columns[], artists{}} — current view data (may be filtered)
cachedDataResult   // last raw fetch result — used for filter-only re-renders without refetch
filterOptions      // [{title, data, visible, ...}] — audio feature columns appended to DataTable
genreFilters       // string[] — active genre chip IDs
```

## API routes
| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/auth/login` | `auth.login` | Redirects to Spotify OAuth |
| GET | `/auth/callback` | `auth.callback` | Saves token to session |
| GET | `/auth/logout` | `auth.logout` | Clears session |
| GET | `/` | `managify.index` | Login page or redirect to /manager |
| GET | `/manager` | `managify.manager` | Main app |
| POST | `/api/sp/playlist` | `sp.tracks` | Full track fetch (features + artists) |
| POST | `/api/sp/playlist/fast` | `sp.tracks_fast` | Fast fetch, no features |
| POST | `/api/sp/play` | `sp.play` | Start playback via Spotify Connect |
| POST | `/api/sp/editPlaylist` | `sp.edit` | Add/remove track from playlist |
| GET | `/api/sp/accessToken` | `sp.token` | Returns access token for Web Playback SDK |

## Audio features reference (`utils/constants.py` → `FILTERABLE`)
```python
FILTERABLE = {
    "BPM":            {"apiName": "tempo",            "isChecked": True},
    "Danceability":   {"apiName": "danceability",     "isChecked": True},
    "Energy":         {"apiName": "energy",           "isChecked": True},
    "Instrumentalness": {"apiName": "instrumentalness", "isChecked": False},
    "Liveness":       {"apiName": "liveness",         "isChecked": False},
    "Loudness":       {"apiName": "loudness",         "isChecked": False},
    "Speechiness":    {"apiName": "speechiness",      "isChecked": False},
    "Positiveness":   {"apiName": "valence",          "isChecked": False},
}
```
`isChecked` controls which feature columns are visible by default in the filter modal.

## Known issues / gotchas
1. **`isTrackValid()` requires `preview_url`** (`spotify/spotify.py:119–121`): filters out any track without a preview URL. Drops many valid tracks (regional restrictions, local files). The player already handles null `preview_url` gracefully.

2. **Several Spotify endpoints deprecated for new apps**: `GET /audio-features/{id}`, `GET /audio-analysis/{id}`, and `GET /recommendations` all return 403 for apps created after November 2024. There are **no replacement endpoints**. Features that depended on these (`audio_features` columns in the table, the Analysis tab, the Discover button) have been removed from the UI and backend entirely rather than showing permanent error states.

3. **Fast path skips features**: `getTracksBasic` (current default) returns no audio features. The feature columns in the DataTable are currently never populated because the fast path is used. The full `/api/sp/playlist` endpoint is wired but not called.

4. **Genres require artists**: `buildGenres()` in `manager.js` reads `storedData.artists` which is only populated by the full (slow) endpoint. The fast endpoint returns `artists: {}` so genre chips never populate currently.

5. **`deepCopyHack`**: DataTables can't handle JS `Map` objects in data. The workaround serialises Maps via `JSON.stringify` with a custom replacer. Every deep copy of `storedData` must go through this function.

6. **Spotipy instantiated per call**: Each function in `spotify.py` creates `spotipy.Spotify(auth=accessToken)` inline. This is fine functionally but slightly wasteful.

7. **Flask-Caching only on `getAllPlaylistInfos`**: Track data and features are not server-cached; repeated calls re-fetch from Spotify. Client-side `localStorage` caching for features is the planned improvement.

## Spotify Web API rules

These rules apply to all Spotify API usage in this project:

- **OpenAPI spec**: All endpoint paths, parameters, and response schemas must match the official spec at `https://developer.spotify.com/reference/web-api/open-api-schema.yaml`. Do not guess endpoints or field names.
- **Auth flow**: Use the **Authorization Code flow** (backend handles the secret). Never use the deprecated Implicit Grant flow. Client Credentials is only acceptable for public, non-user data.
- **Redirect URIs**: Use HTTPS in production. For local dev use `http://127.0.0.1:5000/auth/callback` — **not** `http://localhost` (Spotify rejects `localhost`). No wildcard URIs.
- **Scopes**: Request only the minimum scopes needed. Current required scopes are documented in `example.config.json`. Do not add scopes preemptively.
- **Token management**: Tokens are stored in the Flask session and refreshed by Spotipy automatically via `SpotifyOAuth`. The client secret must never appear in frontend code.
- **Rate limits**: On HTTP 429 responses, read the `Retry-After` header and wait that many seconds before retrying. No tight loops or immediate retries.
- **Deprecated endpoints**: Do not use deprecated endpoints. `GET /audio-features` and `GET /audio-analysis` are deprecated — see Known issues #2. Use `/playlists/{id}/items` (not `/playlists/{id}/tracks`).
- **Error handling**: All Spotify HTTP errors are caught as `spotipy.exceptions.SpotifyException`. Return the status code and message to the frontend rather than swallowing errors silently (except expected 403s from deprecated endpoints).
- **Caching**: Do not cache Spotify content beyond immediate use. The existing `@cache.memoize(3600)` on `getAllPlaylistInfos` is acceptable. Audio features are cached client-side in `localStorage` — these must be invalidated if the user revokes access.
- **Attribution**: Always attribute content to Spotify when displaying track/artist/album data in the UI.
- **No ML training**: Do not use Spotify API data to train machine learning models.

## Planned features (see PLAN.md)
- Two-phase loading: fast table first, features loaded async in background
- Client-side `localStorage` cache for audio features
- Visuals tab: Energy vs Valence scatter plot (mood map) with lasso selection
- Visuals tab: Radar chart for feature profile of selection vs playlist
- Visuals tab: Feature distribution histograms
- Song discovery via Spotify `/v1/recommendations` seeded from selection
- Create new playlist from selected songs
