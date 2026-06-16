import json

from flask import Blueprint, session, request, current_app, jsonify
from utils.utils import getTokenInfo

bp = Blueprint('sp', __name__, url_prefix='/api/sp')


@bp.route('/play', methods=['POST'])
def play():
    from spotify.spotify import playSongs
    return playSongs(session, json.loads(request.data))


@bp.route('/editPlaylist', methods=['POST'])
def edit():
    from spotify.spotify import editPlayList
    return editPlayList(session, json.loads(request.data))


@bp.route('/accessToken', methods=['GET'])
def token():
    config = current_app.config
    tokenInfo, _ = getTokenInfo(session, config)
    return {'token': tokenInfo['access_token']}


@bp.route('/playlist', methods=['POST'])
def tracks():
    from spotify.spotify import getTracks
    return getTracks(session, request.data), 200


@bp.route('/playlist/fast', methods=['POST'])
def tracks_fast():
    """Fast endpoint that skips audio features and detailed artist info."""
    from spotify.spotify import getTracksBasic
    return getTracksBasic(session, request.data), 200


@bp.route('/features', methods=['POST'])
def features():
    from spotify.spotify import getFeaturesByIds
    return getFeaturesByIds(session, json.loads(request.data)), 200


@bp.route('/artists', methods=['POST'])
def artists():
    from spotify.spotify import getArtistsByIds
    return getArtistsByIds(session, json.loads(request.data)), 200


@bp.route('/createPlaylist', methods=['POST'])
def create_playlist():
    from spotify.spotify import createPlaylist
    return createPlaylist(session, json.loads(request.data)), 200



@bp.route('/currently_playing', methods=['GET'])
def currently_playing():
    from spotify.spotify import getCurrentlyPlaying
    result = getCurrentlyPlaying(session)
    if result is None:
        return jsonify(None), 204
    return jsonify(result), 200


@bp.route('/search', methods=['GET'])
def search_playlists():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([]), 200
    from spotify.spotify import searchPlaylists
    import spotipy
    try:
        return jsonify(searchPlaylists(session, query)), 200
    except spotipy.exceptions.SpotifyException as e:
        return jsonify({"error": str(e)}), e.http_status or 500
