from flask import Flask, render_template, session, request, redirect, Response, jsonify
from spotipy.oauth2 import SpotifyOAuth
from flask_caching import Cache
from typing import Tuple
import spotipy
import time
import json

cache = Cache(config={'CACHE_TYPE': 'simple'})

scope = "user-library-read"

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
    return render_template('manager.html', data=getData())


@app.route('/playlist', methods=['POST'])
def getTracks():
    result = {"result": []}
    build = {}  # schema {"songId": {"playlists": [{"id": "name"}], "name": "songName", "artist": "artistName"} }
    data = json.loads(request.data)
    duplicateRemoved = [dict(t) for t in {tuple(d.items()) for d in data}]

    # TODO: Optimize this
    for playlist in duplicateRemoved:
        tracks = getPlayListTracks(playlist['id'])
        for track in tracks:
            if build.get(track['id']) is None:
                build[track['id']] = {**{"playlists": [playlist['name']]}, **track}
            else:
                build[track['id']]['playlists'].append(playlist['name'])

    for songId in build.keys():
        ret = {"Song": build[songId]['name'], "Artist": build[songId]['artist']}
        for playlist in duplicateRemoved:
            ret[playlist['name']] = True if playlist['name'] in build[songId]['playlists'] else False
        result['result'].append(ret)

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
def getData():
    res = []
    tokenInfo, isValid = get_token(session)
    sp = spotipy.Spotify(auth=tokenInfo.get('access_token'))
    playlists = sp.current_user_playlists()
    while playlists:
        for i, playlist in enumerate(playlists['items']):
            print(playlist)
            if len(playlist['images']) > 0:
                res.append({"name": playlist['name'], "id": playlist['id'], "image": playlist['images'][0]})
        if playlists['next']:
            playlists = sp.next(playlists)
        else:
            playlists = None
    return res


@cache.memoize(timeout=60 * 5)
def getPlayListTracks(id):
    tokenInfo, _ = get_token(session)
    sp = spotipy.Spotify(auth=tokenInfo.get('access_token'))
    tracks = sp.playlist_items(id)
    res = []
    while tracks:
        for i, track in enumerate(tracks['items']):
            if track.get('track') is not None and track['track']['type'] == 'track':
                data = {"id": track['track']['id'], "name": track['track']['name'],
                        "artist": track['track']['artists'][0]['name']}
                res.append(data)
        if tracks['next']:
            tracks = sp.next(tracks)
        else:
            tracks = None
    return res


if __name__ == '__main__':
    app.run()
