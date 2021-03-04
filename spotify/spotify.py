from utils.utils import getTokenInfo, stripChars, mergeDicts, chunks
from utils.constants import LIKED_SONGS_ID, FILTERABLE
from flask import current_app
from app import cache
import spotipy
import json

config = current_app.config


def getTracks(session, data):
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    result = {"data": [], "columns": []}
    build = {}  # schema {"songId": {"playlists": [{"id": "name"}], "name": "songName", "artist": "artistName"} }
    # print(data)
    data = json.loads(data)
    duplicateRemoved = [dict(t) for t in {tuple(d.items()) for d in data}]
    columns = [{"title": "Song", "data": "Song"}, {"title": "Artist", "data": "Artist"}]
    # TODO: Optimize this
    for playlist in duplicateRemoved:
        columns.append({"title": playlist['name'], "data": playlist['name'], "id": playlist['id']})
        tracks = getPlayListTracks(playlist['id'], accessToken)
        for track in tracks:
            if build.get(track['id']) is None:
                build[track['id']] = {**{"playlists": [playlist['name']]}, **track}
            else:
                build[track['id']]['playlists'].append(playlist['name'])

    for songId in build.keys():
        artist = ', '.join([artist['name'] for artist in build[songId].pop('artists')])
        ret = {"Song": build[songId].pop('name'), "Artist": artist, **build[songId]}
        for playlist in duplicateRemoved:
            ret[playlist['name']] = True if playlist['name'] in build[songId]['playlists'] else False
        result['data'].append(ret)
    result['columns'] = columns
    result['data'] = getTrackFeatures(result['data'], accessToken)
    # print(json.dumps(result))
    return result


@cache.memoize(timeout=60 * 60)
def getAllPlaylistInfos(accessToken):
    res = [{"name": "Liked Songs", "id": LIKED_SONGS_ID, "image": {"url": "/static/image.jpg"}, "isReadOnly": False}]
    sp = spotipy.Spotify(auth=accessToken)
    owner = sp.me()
    playlists = sp.current_user_playlists()
    while playlists:
        # res = res + [buildTrackFromPlaylist(plylist, sp.me()) for plylist in playlists['items'] ]
        res = res + [result for eachPlaylist in playlists['items'] if
                     (result := buildTrackFromPlaylist(eachPlaylist, owner)) is not None]
        if playlists['next']:
            playlists = sp.next(playlists)
        else:
            playlists = None
    return res


@cache.memoize(timeout=60 * 60)
def getPlayListTracks(playlistId, accessToken):
    # fields = "items(added_by(id,uri,type), track(id,type,name,popularity,artists(id,name,uri),album(images,
    # album_type,artists(id,name,uri))))"
    sp = spotipy.Spotify(auth=accessToken)
    if playlistId == LIKED_SONGS_ID:
        tracks = sp.current_user_saved_tracks()
    else:
        tracks = sp.playlist_items(playlistId, additional_types=('track',))
    res = []
    while tracks:
        for i, track in enumerate(tracks['items']):
            if track.get('track') is not None and track['track']['type'] == 'track' and track['track']['album'][
                "album_type"] is not None and track['track']["preview_url"] is not None:
                # Add popularity and preview url here
                # data = {"id": track['track']['id'], "name": track['track']['name'],
                #         "artist": track['track']['artists'][0]['name']}
                data = {**track['track']}
                if track['track'].get('album') is not None:
                    data["images"] = track['track']['album']['images']
                res.append(data)
        if tracks['next']:
            tracks = sp.next(tracks)
        else:
            tracks = None
    return res


def getTrackFeatures(tracks, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    trackChunks = chunks(tracks, 100)  # 100 max allowed oer call
    allFeatures = []
    for chunk in trackChunks:
        trackIds = [track['id'] for track in chunk]
        allFeatures = allFeatures + sp.audio_features(trackIds)
    return mergeDicts(tracks, allFeatures)


def buildTrackFromPlaylist(playlist, owner):
    if len(playlist['images']) > 0:
        isReadOnly = False if playlist['owner']['id'] == owner['id'] else True
        return {"name": stripChars(playlist['name']), "id": playlist['id'], "image": playlist['images'][0],
                "isReadOnly": isReadOnly}
    return None


def playSongs(session, data):
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)
    sp.start_playback(device_id=data['deviceId'], context_uri=None, uris=data['uris'], offset=data['offset'],
                      position_ms=None)
    return 200
