from flask import Flask
from flask_caching import Cache

# create and configure the app
# app = Flask(__name__, instance_relative_config=True)
app = Flask(__name__, static_url_path='/static')
app.config.from_mapping(
    SECRET_KEY='dev'
)

# load the instance config, if it exists, when not testing
app.config.from_json('config.json', silent=False)

cache = Cache(app)
with app.app_context():
    from managify import managify
    from api import auth, sp

    app.register_blueprint(auth.bp)
    app.register_blueprint(sp.bp)
    app.register_blueprint(managify.bp)

if __name__ == '__main__':
    app.run()
