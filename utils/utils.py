import time
from collections import defaultdict
from typing import Tuple
from spotipy import SpotifyOAuth


def mergeDicts(d1, d2):
    d = defaultdict(dict)
    for l in (d1, d2):
        for elem in l:
            d[elem['id']].update(elem)
    return list(d.values())


def chunks(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]


def stripChars(val):
    val = val.replace(".", "")
    val = val.replace(",", "")
    return val


# Checks to see if token is valid and gets a new token if not
def getTokenInfo(sess, spConfig) -> Tuple[any, bool]:
    tokenInfo = sess.get("token_info", {})

    # Checking if the session already has a token stored
    if not (sess.get('token_info', False)):
        isTokenValid = False
        return tokenInfo, isTokenValid

    # Checking if token has expired
    now = int(time.time())
    isTokenExpired = sess.get('token_info').get('expires_at') - now < 60
    # Refreshing token if it has expired
    if isTokenExpired:
        # Don't reuse a SpotifyOAuth object because they store token info and you could leak user tokens if you reuse
        # a SpotifyOAuth object
        spotifyAuthManager = getNewAuthManager(spConfig)
        tokenInfo = spotifyAuthManager.refresh_access_token(sess.get('token_info').get('refresh_token'))
        sess['token_info'] = tokenInfo
        sess.modified = True

    isTokenValid = True
    return tokenInfo, isTokenValid


def getNewAuthManager(config) -> SpotifyOAuth:
    return SpotifyOAuth(client_id=config["SP_CLIENT_ID"],
                        client_secret=config["SP_CLIENT_SECRET"],
                        redirect_uri=config["SP_REDIRECT_URI"],
                        scope=config['SP_SCOPE'])


