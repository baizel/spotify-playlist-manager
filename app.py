from collections import defaultdict

from flask import Flask, render_template, session, request, redirect, Response, jsonify
from spotipy.oauth2 import SpotifyOAuth
from flask_caching import Cache
from typing import Tuple
import spotipy
import time
import json

cache = Cache(config={'CACHE_TYPE': 'simple'})

scope = "user-library-read"

LIKED_SONGS_ID = "myplaylistid"
FILTERABLE = {"BPM": "tempo", "Danceability": "danceability", "Energy": "energy",
              "Instrumentalness": "instrumentalness", "Liveness": "liveness", "Loudness": "loudness",
              "Speechiness": "speechiness", "Positiveness ": "valence"}

REDIRECT_URI = 'http://127.0.0.1:5000/callback'
CLIENT_ID = '05e5055c73a74eb8b8f536e3a2e5a3ac'
CLIENT_SECRET = '843776a768bf4b3bb08181252c4c624f'
SCOPE = 'playlist-modify-private ' \
        'playlist-read-private ' \
        'playlist-modify-public ' \
        'user-top-read ' \
        'user-read-recently-played ' \
        'user-follow-read ' \
        'user-library-modify'

app = Flask(__name__, static_url_path='/static')
app.secret_key = 'super secret key'
app.config['SESSION_TYPE'] = 'filesystem'
cache.init_app(app)


@app.route('/')
def index():
    tokenInfo, isValid = get_token(session)
    if isValid:
        return redirect('/manager')
    authManager = getAuthManager()
    url = authManager.get_authorize_url()
    return render_template('index.html', url=url)


@app.route('/logout')
def out():
    session.clear()
    return redirect('/')


@app.route('/callback')
def callback():
    spOauth = getAuthManager()
    session.clear()
    code = request.args.get('code')
    token_info = spOauth.get_access_token(code)

    # Saving the access token along with all other token related info
    session["token_info"] = token_info
    return redirect('/')


@app.route('/manager')
def manager():
    return render_template('manager.html', data=getAllPlaylists(), filter=FILTERABLE)


@app.route('/playlist', methods=['POST'])
def getTracks():
    result = {"data": [], "columns": []}
    build = {}  # schema {"songId": {"playlists": [{"id": "name"}], "name": "songName", "artist": "artistName"} }
    # print(request.data)
    data = json.loads(request.data)
    duplicateRemoved = [dict(t) for t in {tuple(d.items()) for d in data}]
    columns = [{"title": "Song", "data": "Song"}, {"title": "Artist", "data": "Artist"}]
    # TODO: Optimize this
    for playlist in duplicateRemoved:
        columns.append({"title": playlist['name'], "data": playlist['name'], "id": playlist['id']})
        tracks = getPlayListTracks(playlist['id'])
        for track in tracks:
            if build.get(track['id']) is None:
                build[track['id']] = {**{"playlists": [playlist['name']]}, **track}
            else:
                build[track['id']]['playlists'].append(playlist['name'])
    for songId in build.keys():
        ret = {"Song": build[songId].pop('name'), "Artist": build[songId].pop('artist'), **build[songId]}
        for playlist in duplicateRemoved:
            ret[playlist['name']] = True if playlist['name'] in build[songId]['playlists'] else False
        result['data'].append(ret)
    result['columns'] = columns
    result['data'] = getTrackFeatures(result['data'])
    print(json.dumps(result))
    return result, 200


def getAuthManager() -> SpotifyOAuth:
    return SpotifyOAuth(client_id=CLIENT_ID, client_secret=CLIENT_SECRET, redirect_uri=REDIRECT_URI,
                        scope=SCOPE)


# Checks to see if token is valid and gets a new token if not
def get_token(sess) -> Tuple[any, bool]:
    token_valid = False
    token_info = sess.get("token_info", {})

    # Checking if the session already has a token stored
    if not (sess.get('token_info', False)):
        token_valid = False
        return token_info, token_valid

    # Checking if token has expired
    now = int(time.time())
    is_token_expired = sess.get('token_info').get('expires_at') - now < 60
    # Refreshing token if it has expired
    if is_token_expired:
        # Don't reuse a SpotifyOAuth object because they store token info and you could leak user tokens if you reuse
        # a SpotifyOAuth object
        sp_oauth = getAuthManager()
        token_info = sp_oauth.refresh_access_token(sess.get('token_info').get('refresh_token'))
        sess['token_info'] = token_info
        sess.modified = True

    token_valid = True
    return token_info, token_valid


@cache.cached(timeout=60 * 5, key_prefix='allPlaylists')
def getAllPlaylists():
    res = [{"name": "Liked Songs", "id": LIKED_SONGS_ID, "image": {"url": "/static/image.jpg"}}]
    tokenInfo, isValid = get_token(session)
    sp = spotipy.Spotify(auth=tokenInfo.get('access_token'))
    playlists = sp.current_user_playlists()
    while playlists:
        for i, playlist in enumerate(playlists['items']):
            # print(playlist)
            if len(playlist['images']) > 0:
                res.append({"name": stripChars(playlist['name']), "id": playlist['id'], "image": playlist['images'][0]})
        if playlists['next']:
            playlists = sp.next(playlists)
        else:
            playlists = None
    return res


def stripChars(val):
    val = val.replace(".", "")
    val = val.replace(",", "")
    return val


@cache.memoize(timeout=60 * 5)
def getPlayListTracks(id):
    tokenInfo, _ = get_token(session)
    sp = spotipy.Spotify(auth=tokenInfo.get('access_token'))
    if id == LIKED_SONGS_ID:
        tracks = sp.current_user_saved_tracks()
    else:
        tracks = sp.playlist_items(id)
    res = []
    while tracks:
        for i, track in enumerate(tracks['items']):
            if track.get('track') is not None and track['track']['type'] == 'track' and track['track']['album'][
                "album_type"] is not None:
                data = {"id": track['track']['id'], "name": track['track']['name'],
                        "artist": track['track']['artists'][0]['name']}
                if track['track'].get('album') is not None:
                    data["images"] = track['track']['album']['images']
                res.append(data)
        if tracks['next']:
            tracks = sp.next(tracks)
        else:
            tracks = None
    return res


def getTrackFeatures(tracks):
    tokenInfo, _ = get_token(session)
    sp = spotipy.Spotify(auth=tokenInfo.get('access_token'))
    trackChunks = chunks(tracks, 100)
    allFeatures = []
    for chunk in trackChunks:
        trackIds = [track['id'] for track in chunk]
        allFeatures = allFeatures + sp.audio_features(trackIds)
    return mergeDicts(tracks, allFeatures)


def mergeDicts(d1, d2):
    d = defaultdict(dict)
    for l in (d1, d2):
        for elem in l:
            d[elem['id']].update(elem)
    return list(d.values())


def chunks(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


if __name__ == '__main__':
    app.run()
