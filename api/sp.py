from flask import Blueprint, session, request
from spotify.spotify import getTracks

bp = Blueprint('sp', __name__, url_prefix='/api/sp')


@bp.route('/playlist', methods=['POST'])
def tracks():
    return getTracks(session, request.data), 200
