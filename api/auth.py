from flask import current_app, Flask, render_template, session, request, redirect, Response, jsonify, Blueprint
from utils.utils import getNewAuthManager

bp = Blueprint('auth', __name__, url_prefix='/auth')


@bp.route('/login')
def login():
    return redirect(getNewAuthManager(current_app.config).get_authorize_url())


@bp.route('/logout')
def logout():
    session.clear()
    return redirect('/')


@bp.route('/callback')
def callback():
    spOauth = getNewAuthManager(current_app.config)
    session.clear()
    code = request.args.get('code')
    tokenInfo = spOauth.get_access_token(code)

    # Saving the access token along with all other token related info
    session["token_info"] = tokenInfo
    return redirect('/')
