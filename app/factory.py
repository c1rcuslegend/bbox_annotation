from flask import Flask
import app.config as config
from app.routes import register_routes
from app.app_utils import setup_logging, load_users_data
from app.app_utils import check_that_needed_files_exist, check_dataset_dirs_have_same_names

def create_app():
    app = Flask(__name__)
    app.config.from_object(config)

    # Add USERNAME to app config for easy access
    app.config['USERNAME'] = config.USERNAME
    app.config['GOOGLE_DRIVE_FOLDER_ID'] = getattr(config, 'GOOGLE_DRIVE_FOLDER_ID', None)

    # reconfigure static folder
    app.static_folder = app.config['STATIC_FOLDER']

    # verify that the needed config variables are set
    if not check_that_needed_files_exist(app):
        raise Exception("Some needed files do not exist. Please check the config for more details.")
    if not check_dataset_dirs_have_same_names(app):
        raise Exception("The annotation dataset and examples dataset do not have the same label names. "
                        "Please check the config for more details.")

    setup_logging(app)

    # Initialize global variables
    # ToDo: create a simple sqlite db to store these variables
    app.current_image_index_dct = dict()
    app.num_predictions_per_user = dict()
    app.user_cache = dict()

    # Load user data
    load_users_data(app)

    register_routes(app)

    return app
