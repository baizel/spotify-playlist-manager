import json

from flask import Blueprint, session, request, current_app
from utils.utils import getTokenInfo

bp = Blueprint('sp', __name__, url_prefix='/api/sp')

config = current_app.config


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
    tokenInfo, _ = getTokenInfo(session, config)
    return {'token': tokenInfo['access_token']}


@bp.route('/playlist', methods=['POST'])
def tracks():
    from spotify.spotify import getTracks
    return getTracks(session, request.data), 200
