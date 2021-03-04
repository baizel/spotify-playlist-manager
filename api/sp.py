import json

from flask import Blueprint, session, request, current_app
from utils.utils import getTokenInfo

bp = Blueprint('sp', __name__, url_prefix='/api/sp')

config = current_app.config


@bp.route('/play', methods=['POST'])
def play():
    from spotify.spotify import playSongs
    playSongs(session, json.loads(request.data))
    return {}, 200


@bp.route('/accessToken', methods=['GET'])
def token():
    tokenInfo, _ = getTokenInfo(session, config)
    return {'token': tokenInfo['access_token']}


@bp.route('/playlist', methods=['POST'])
def tracks():
    from spotify.spotify import getTracks
    return getTracks(session, request.data), 200
