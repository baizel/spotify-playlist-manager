from utils.utils import getTokenInfo, stripChars, mergeDicts, chunks
from utils.constants import LIKED_SONGS_ID, FILTERABLE
from flask import current_app
from app import cache
import spotipy
import json

def getTracks(session, data):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    result = {"data": [], "columns": [], "artists": {}}

    data = json.loads(data)
    duplicateRemoved = [dict(t) for t in {tuple(d.items()) for d in data}]
    columns = [{"title": "Song", "data": "Song"}, {"title": "Artist", "data": "Artist"}]
    playlistNames = [playlist['name'] for playlist in duplicateRemoved]

    build = {'songs': {},
             "artists": []}  # schema {{songs: {"songId": {"playlists": [{"id": "name"}], "name": "songName", "artist": "artistName"}},artists:[] }
    for playlist in duplicateRemoved:
        columns.append({"title": playlist['name'], "data": playlist['name'], "id": playlist['id']})
        transformTrackInfos(build, playlist, playlistNames, accessToken)

    result['columns'] = columns
    result['data'] = getTrackFeatures(list(build['songs'].values()), accessToken)
    result['artists'] = getArtistInfos(build['artists'], accessToken)
    return result


def getTracksBasic(session, data):
    """Fast version that skips audio features and detailed artist info."""
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    result = {"data": [], "columns": [], "artists": {}}

    data = json.loads(data)
    duplicateRemoved = [dict(t) for t in {tuple(d.items()) for d in data}]
    columns = [{"title": "Song", "data": "Song"}, {"title": "Artist", "data": "Artist"}]
    playlistNames = [playlist['name'] for playlist in duplicateRemoved]

    build = {'songs': {}, "artists": []}
    for playlist in duplicateRemoved:
        columns.append({"title": playlist['name'], "data": playlist['name'], "id": playlist['id']})
        transformTrackInfosBasic(build, playlist, playlistNames, accessToken)

    result['columns'] = columns
    result['data'] = list(build['songs'].values())
    # Skip audio features and artist info for fast loading
    return result


def transformTrackInfosBasic(memoizedData, playlist, allPlaylistsNames, accessToken):
    """Fast version that collects minimal track info."""
    sp = spotipy.Spotify(auth=accessToken)
    playlistId = playlist['id']
    if playlistId == LIKED_SONGS_ID:
        tracks = sp.current_user_saved_tracks()
    else:
        tracks = sp.playlist_items(playlistId, additional_types=('track',))
    while tracks:
        for i, track in enumerate(tracks['items']):
            if isTrackValid(track):
                songId = track['track']['id']
                if memoizedData['songs'].get(songId) is None:
                    trackData = track['track']
                    artistNames = ", ".join([a['name'] for a in trackData['artists']])
                    memoizedData['songs'][songId] = {
                        'id': songId,
                        'uri': trackData['uri'],
                        'name': trackData['name'],
                        'Song': trackData['name'],
                        'Artist': artistNames,
                        'artists': trackData['artists'],
                        'album': trackData['album'],
                        'preview_url': trackData['preview_url'],
                        'playlists': [],
                        **dict.fromkeys(allPlaylistsNames, False)
                    }
                songInfo = memoizedData['songs'][songId]
                songInfo['playlists'].append(playlist['name'])
                songInfo[playlist['name']] = True
        if tracks['next']:
            tracks = sp.next(tracks)
        else:
            tracks = None


def transformTrackInfos(memoizedData, playlist, allPlaylistsNames, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    playlistId = playlist['id']
    if playlistId == LIKED_SONGS_ID:
        tracks = sp.current_user_saved_tracks()
    else:
        tracks = sp.playlist_items(playlistId, additional_types=('track',))
    while tracks:
        for i, track in enumerate(tracks['items']):
            if isTrackValid(track):
                songId = track['track']['id']
                if memoizedData.get(songId) is None:
                    memoizedData['songs'][songId] = {**track['track'], **dict.fromkeys(allPlaylistsNames, False),
                                                     'playlists': []}
                songInfo = memoizedData['songs'][songId]
                songInfo['playlists'].append(playlist['name'])
                songInfo["Song"] = songInfo['name']
                songInfo[playlist['name']] = isSongInAnotherPlaylist(playlist, songInfo['playlists'])
                names = []
                for artist in memoizedData['songs'][songId]['artists']:
                    memoizedData['artists'].append(artist['id'])
                    names.append(artist['name'])
                songInfo["Artist"] = ", ".join(names)
        if tracks['next']:
            tracks = sp.next(tracks)
        else:
            tracks = None


def isTrackValid(track):
    return (track.get('track') is not None
            and track['track']['type'] == 'track'
            and track['track']['album']['album_type'] is not None)


def isSongInAnotherPlaylist(playlist, playlistId):
    return True if playlist['name'] in playlistId else False


def getArtistInfos(artistsIds, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    artistChunks = chunks(artistsIds, 50)  # 50 max allowed per call
    allArtistInfos = []
    for chunk in artistChunks:
        allArtistInfos = allArtistInfos + sp.artists(chunk)['artists']
    return {artist['id']: artist for artist in allArtistInfos}


def getTrackFeatures(tracks, accessToken):
    sp = spotipy.Spotify(auth=accessToken)
    trackChunks = chunks(tracks, 100)  # 100 max allowed per call
    allFeatures = []
    for chunk in trackChunks:
        trackIds = [track['id'] for track in chunk]
        allFeatures = allFeatures + sp.audio_features(trackIds)
    return mergeDicts(tracks, allFeatures)


def buildTrackFromPlaylist(playlist, owner):
    if playlist['images'] is not None and len(playlist['images']) > 0:
        isReadOnly = False if playlist['owner']['id'] == owner['id'] else True
        return {"name": stripChars(playlist['name']), "id": playlist['id'], "image": playlist['images'][0],
                "isReadOnly": isReadOnly}
    return None


def playSongs(session, data):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)
    sp.start_playback(device_id=data['deviceId'], context_uri=None, uris=data['uris'], offset=data['offset'],
                      position_ms=None)
    return {"message": "ok"}, 200


def editPlayList(session, data):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)
    if data["isAdd"]:
        sp.playlist_add_items(data["playlistId"], [data["songId"]])
    else:
        sp.playlist_remove_all_occurrences_of_items(data["playlistId"], [data["songId"]])
    return {"message": "ok"}, 200


def getFeaturesByIds(session, trackIds):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)
    result = {}
    for chunk in chunks(trackIds, 100):
        features = sp.audio_features(chunk)
        if features:
            for f in features:
                if f:
                    result[f['id']] = f
    return result


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


def getRecommendations(session, data):
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    accessToken = tokenInfo.get('access_token')
    sp = spotipy.Spotify(auth=accessToken)

    seed_ids = data.get('seedTrackIds', [])[:5]
    if not seed_ids:
        return {"error": "No seed tracks provided"}, 400

    target_features = data.get('targetFeatures', {})
    allowed_targets = ('energy', 'valence', 'danceability', 'tempo',
                       'instrumentalness', 'acousticness', 'speechiness')
    target_kwargs = {f"target_{k}": v for k, v in target_features.items()
                     if k in allowed_targets}

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
    for chunk in chunks(track_uris, 100):
        sp.playlist_add_items(playlist['id'], chunk)

    return {"playlistId": playlist['id'], "name": playlist['name'], "message": "ok"}


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
