from flask import current_app, Flask, render_template, session, request, redirect, Response, jsonify, Blueprint
from utils.utils import getTokenInfo
from utils.constants import FILTERABLE
from spotify.spotify import getAllPlaylistInfos

bp = Blueprint('managify', __name__, template_folder="templates", static_folder="static",
               static_url_path="/managify/static")


@bp.route('/')
def index():
    _, isValid = getTokenInfo(session, current_app.config)
    if isValid:
        return redirect('/manager')
    return render_template('index.html')


@bp.route('/manager')
def manager():
    tokenInfo, isValid = getTokenInfo(session, current_app.config)
    if isValid:
        return render_template('manager.html',
                               data=getAllPlaylistInfos(tokenInfo.get('access_token')), filter=FILTERABLE)
    return redirect('/')
