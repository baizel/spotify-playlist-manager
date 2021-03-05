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

    data = json.loads(data)
    duplicateRemoved = [dict(t) for t in {tuple(d.items()) for d in data}]
    columns = [{"title": "Song", "data": "Song"}, {"title": "Artist", "data": "Artist"}]

    for playlist in duplicateRemoved:
        columns.append({"title": playlist['name'], "data": playlist['name'], "id": playlist['id']})
        transformTrackInfos(build, playlist, accessToken)

    result['columns'] = columns
    result['data'] = getTrackFeatures(list(build.values()), accessToken)
    return result


def transformTrackInfos(memoizedData, playlist, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    playlistId = playlist['id']
    if playlistId == LIKED_SONGS_ID:
        tracks = sp.current_user_saved_tracks()
    else:
        tracks = sp.playlist_items(playlistId, additional_types=('track',))
    while tracks:
        for i, track in enumerate(tracks['items']):
            if track.get('track') is not None and track['track']['type'] == 'track' and track['track']['album'][
                "album_type"] is not None and track['track']["preview_url"] is not None:
                id = track['track']['id']
                if memoizedData.get(id) is None:
                    memoizedData[id] = track['track']
                    memoizedData[id]['playlists'] = []

                memoizedData[id]['playlists'].append(playlist['name'])
                memoizedData[id]["Song"] = memoizedData[id].pop('name')
                memoizedData[id]["Artist"] = ', '.join([artist['name'] for artist in memoizedData[id].pop('artists')])
                memoizedData[id][playlist['name']] = True if playlist['name'] in memoizedData[id]['playlists'] else False
        if tracks['next']:
            tracks = sp.next(tracks)
        else:
            tracks = None


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
