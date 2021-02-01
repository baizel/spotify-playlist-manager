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
        ret = {"Song": build[songId].pop('name'), "Artist": build[songId].pop('artist'), **build[songId]}
        for playlist in duplicateRemoved:
            ret[playlist['name']] = True if playlist['name'] in build[songId]['playlists'] else False
        result['data'].append(ret)
    result['columns'] = columns
    result['data'] = getTrackFeatures(result['data'], accessToken)
    return result


@cache.memoize(timeout=60 * 60)
def getAllPlaylists(accessToken):
    res = [{"name": "Liked Songs", "id": LIKED_SONGS_ID, "image": {"url": "/static/image.jpg"}}]
    sp = spotipy.Spotify(auth=accessToken)
    playlists = sp.current_user_playlists()
    while playlists:
        res = res + [x for x in map(buildTrackFromPlaylist, playlists['items']) if x is not None]
        if playlists['next']:
            playlists = sp.next(playlists)
        else:
            playlists = None
    return res


@cache.memoize(timeout=60 * 60)
def getPlayListTracks(playlistId, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    if playlistId == LIKED_SONGS_ID:
        tracks = sp.current_user_saved_tracks()
    else:
        tracks = sp.playlist_items(playlistId)
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


def getTrackFeatures(tracks, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    trackChunks = chunks(tracks, 100)  # 100 max allowed oer call
    allFeatures = []
    for chunk in trackChunks:
        trackIds = [track['id'] for track in chunk]
        allFeatures = allFeatures + sp.audio_features(trackIds)
    return mergeDicts(tracks, allFeatures)


def buildTrackFromPlaylist(playlist):
    if len(playlist['images']) > 0:
        return {"name": stripChars(playlist['name']), "id": playlist['id'], "image": playlist['images'][0]}
    return None
