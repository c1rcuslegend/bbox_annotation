import os
import json
import logging
from flask import request
from app.helper_funcs import read_json_file
import shutil
from tqdm import tqdm


def copy_styles_file_to_static(app):
    """
    Copies the 'styles.css' file from the 'templates' folder to the 'static' folder.
    """
    # Define source and destination paths
    source_path = os.path.join(app.root_path, 'templates', 'styles.css')
    destination_path = os.path.join(app.root_path, app.config['STATIC_FOLDER'], 'css', 'styles.css')

    # Ensure the static folder exists
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)

    # Copy the file from templates to static
    shutil.copyfile(source_path, destination_path)

    print(f"Copied {source_path} to {destination_path}")


def copy_js_files_to_static(app):
    """
    Copies JavaScript files from the 'templates/js' folder to the 'static/js' folder.
    """
    # Define source and destination directory
    source_dir = os.path.join(app.root_path, 'templates/js')
    destination_dir = os.path.join(app.root_path, app.config['STATIC_FOLDER'], 'js')

    # Ensure the static js folder exists
    os.makedirs(destination_dir, exist_ok=True)

    # List of JavaScript files to copy
    js_files = ['bbox-editor.js', 'bbox-editor-patch.js', 'bbox-editor-ui.js', 'bbox-init.js', 'auto-select-class.js', 'inline-bbox-editor.js', 'grid-view.js', 'class-jump.js']

    # Copy each JavaScript file
    for js_file in js_files:
        source_path = os.path.join(source_dir, js_file)
        destination_path = os.path.join(destination_dir, js_file)

        if os.path.exists(source_path):
            shutil.copyfile(source_path, destination_path)
            print(f"Copied {source_path} to {destination_path}")
        else:
            print(f"Warning: Source file {source_path} not found")


def copy_sample_files_to_static(source, destination, images_per_dir=10):
    """
    This function copies sample files from source to destination, preserving subdirectory structure,
    while avoiding copying files that already exist.
    """

    # Walk through the source directory
    for dirpath, dirnames, filenames in tqdm(os.walk(source), desc="Copying sample images to the static folder"):
        # Compute the relative path from the source directory
        relative_path = os.path.relpath(dirpath, source)

        # Define the destination path
        dest_dir = os.path.join(destination, relative_path)

        # Ensure the destination directory exists
        os.makedirs(dest_dir, exist_ok=True)

        # Copy files from the source directory
        copied_count = 1
        for file in filenames:
            if copied_count > images_per_dir:
                break

            source_file = os.path.join(dirpath, file)
            dest_file = os.path.join(dest_dir, file)

            # Only copy if the file doesn't already exist in the destination
            if not os.path.exists(dest_file):
                shutil.copy2(source_file, dest_file)
                copied_count += 1


def setup_logging(app):
    log_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler = logging.FileHandler('app.log')
    handler.setLevel(logging.INFO)
    handler.setFormatter(log_format)

    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)


def load_users_data(app):
    """
    Loads user-specific data from a root directory specified in the app configuration and sets up initial
    conditions for each user in the system. This function iterates over directories representing users in the
    `ANNOTATORS_ROOT_DIRECTORY` specified in the `app` configuration.

    Parameters:
    -----------
    app : Flask application instance
        The Flask app instance containing configurations and global variables like `ANNOTATORS_ROOT_DIRECTORY`
        and `current_image_index_dct`.

    Example:
    --------
    If the `ANNOTATORS_ROOT_DIRECTORY` contains directories for users "user1" and "user2", this function will
    read or initialize their image indices and load any additional data required for each user.
    """
    for username in os.listdir(app.config['ANNOTATORS_ROOT_DIRECTORY']):
        # Perform initial setup for each user
        user_dir = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username)
        if os.path.isdir(user_dir):
            # read current image index.
            index_file_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                           'current_image_index_{}.txt'.format(username))
            if os.path.exists(index_file_path):
                with open(index_file_path, 'r') as f:
                    app.current_image_index_dct[username] = int(f.read())
            else:
                app.current_image_index_dct[username] = 0  # Initialize image index
            # Load additional user-specific data
            load_user_specific_data(username, app)


def load_user_specific_data(username, app):
    """
    Loads and caches user-specific data for a given user in the application. The cached data can be quickly
    accessed later without reloading from disk.

    Parameters:
    -----------
    username : str
        The username of the annotator for whom the data is being loaded.
    app : Flask application instance
        The Flask app instance containing configuration and cache.

    Description:
    ------------
    This function loads two JSON files from the user's directory within `ANNOTATORS_ROOT_DIRECTORY`:

    1. `predictions_{username}.json`: Contains information for each label proposal for the image to be annotated.
    2. `sample_images_info.json`: Contains information about the sample images to be displayed alongside the
    image to be annotated.
    """
    # Load JSON files
    proposals_infofile = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f"predictions_{username}.json")
    all_sample_images_file = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, "sample_images_info.json")

    proposals_info = read_json_file(proposals_infofile, app)
    all_sample_images = read_json_file(all_sample_images_file, app)

    # Cache data in some form of data structure
    app.user_cache[username] = {
        'proposals_info': proposals_info,
        'all_sample_images': all_sample_images,
        'num_predictions': len(proposals_info) if proposals_info else 0
    }


def get_form_data():
    image_name = request.form.get('image_name')
    checkbox_values = request.form.getlist('checkboxes')
    direction = request.form.get('direction')
    comments = request.form.get('comments')
    return image_name, checkbox_values, direction, comments


def load_user_data(app, username):
    results_dir = app.config['ANNOTATORS_ROOT_DIRECTORY']
    comments_json = load_json_data(os.path.join(results_dir, username, 'comments_{}.json'.format(username)))
    checkbox_selections = load_json_data(os.path.join(results_dir, username,
                                                      'checkbox_selections_{}.json'.format(username)))
    return comments_json, checkbox_selections


def load_json_data(file_path):
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def get_total_num_predictions(app, username):
    results_dir = app.config['ANNOTATORS_ROOT_DIRECTORY']
    predictions_data_file = os.path.join(results_dir, username, 'predictions_{}.json'.format(username))
    with open(predictions_data_file, 'r') as f:
        predictions_data = json.load(f)
    return len(predictions_data)


def update_current_image_index(app, username, direction, total_num_predictions, current_image_index_dct, step=1):
    # global current_image_index_dct
    results_dir = app.config['ANNOTATORS_ROOT_DIRECTORY']
    if direction == 'next':
        current_image_index_dct[username] = min(current_image_index_dct.get(username, 0) + step, total_num_predictions - step)
    elif direction == 'prev':
        current_image_index_dct[username] = max(current_image_index_dct.get(username, 0) - step, 0)

    index_file_path = os.path.join(results_dir, username, 'current_image_index_{}.txt'.format(username))
    with open(index_file_path, 'w') as f:
        f.write(str(current_image_index_dct[username]))


def update_current_image_index_simple(app, username, current_image_index_dct, current_index):
    results_dir = app.config['ANNOTATORS_ROOT_DIRECTORY']
    current_image_index_dct[username] = current_index

    index_file_path = os.path.join(results_dir, username, 'current_image_index_{}.txt'.format(username))
    with open(index_file_path, 'w') as f:
        f.write(str(current_image_index_dct[username]))


def save_user_data(app, username, comments_json=None, checkbox_selections=None):
    results_dir = app.config['ANNOTATORS_ROOT_DIRECTORY']
    if comments_json is not None:
        save_json_data(os.path.join(results_dir, username, 'comments_{}.json'.format(username)), comments_json)
    if checkbox_selections is not None:
        save_json_data(os.path.join(results_dir, username, 'checkbox_selections_{}.json'.format(username)),
                       checkbox_selections)


def save_json_data(file_path, data):
    with open(file_path, 'w') as f:
        json.dump(data, f)


def check_user_files_exist(app, username):
    # Define the paths to the required files
    proposals_infofile = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f"predictions_{username}.json")
    all_sample_images_file = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, "sample_images_info.json")

    # Check if both files exist
    files_exist = True

    if not os.path.isfile(proposals_infofile):
        app.logger.error(f"File not found: {proposals_infofile}")
        files_exist = False

    if not os.path.isfile(all_sample_images_file):
        app.logger.error(f"File not found: {all_sample_images_file}")
        files_exist = False

    return files_exist


def check_annotator_task_files(app, annotators_directories):
    """
    This function ensures that all the necessary annotators' files exists for all available annotators' directors
    :param app:
    :param annotators_directories:
    :return:
    """
    for annotator_dir in annotators_directories:
        app.logger.error(f"Checking the required annotation task files for annotator -- {annotator_dir}")
        if not check_user_files_exist(app, annotator_dir):
            # app.log(f"Incomplete annotation task file for user {annotator_dir}")
            return False
    return True


def check_that_needed_files_exist(app):
    """
    Validates the config variables in config.py.
    """
    print("Checking that needed files exist...")
    if not os.path.isdir(app.config['STATIC_FOLDER']):
        os.makedirs(app.config['STATIC_FOLDER'])
    copy_sample_files_to_static(app.config['EXAMPLES_DATASET_ROOT_DIR'],
                                os.path.join(app.config['APP_ROOT_FOLDER'],
                                             app.config['STATIC_FOLDER'],
                                             'images'))

    # Copy styles.css from templates directory to static directory
    copy_styles_file_to_static(app)
    copy_js_files_to_static(app)

    if not os.path.isdir(app.config['ANNOTATORS_ROOT_DIRECTORY']):
        app.logger.error(f"Annotation task root directory does not exist: {app.config['ANNOTATORS_ROOT_DIRECTORY']}")
        return False
    if not os.path.isdir(app.config['ANNOTATIONS_ROOT_FOLDER']):
        app.logger.error(f"\nAnnotations root folder does not exist: {app.config['ANNOTATIONS_ROOT_FOLDER']}")
        app.logger.error(
            "Invalid root directory. Please ensure it contains class-named subdirectories, each with their respective "
            "images to be annotated.")
        return False
    # Check that at least one directory exists for annotation tasks
    if len(os.listdir(app.config['ANNOTATORS_ROOT_DIRECTORY'])) == 0:
        app.logger.error("No annotators' task is created. At least one annotation directory containing the necessary"
                         "annotation task files must exist")

    if not check_annotator_task_files(app, os.listdir(app.config['ANNOTATORS_ROOT_DIRECTORY'])):
        return False

    if not os.path.isdir(app.config['EXAMPLES_DATASET_ROOT_DIR']):
        app.logger.error(f"Dataset root folder does not exist: {app.config['EXAMPLES_DATASET_ROOT_DIR']}")
        app.logger.error(
            "Please provide a valid dataset root directory containing examples for each proposed class label. "
            "Class names must match those in the ANNOTATIONS_ROOT_FOLDER.")
        return False
    if not os.path.isfile(app.config['LABEL_INDICES_TO_HR_JSONFILE']):
        app.logger.error(f"Label indices to human-readable JSON file does not exist: "
                         f"{app.config['LABEL_INDICES_TO_HR_JSONFILE']}")
        app.logger.error("")
        return False
    # check if the label indices to human-readable JSON file is valid when the labels are not human-readable
    if not app.config['ARE_LABELS_HUMAN_READABLE']:
        try:
            with open(app.config['LABEL_INDICES_TO_HR_JSONFILE'], 'r') as file:
                json.load(file)
        except FileNotFoundError:
            app.logger.error(f"Label indices to human-readable JSON file does not exist: "
                             f"{app.config['LABEL_INDICES_TO_HR_JSONFILE']}")
            return False
    return True


def check_dataset_dirs_have_same_names(app):
    # label folder names match
    annot_dataset_dir = app.config['ANNOTATIONS_ROOT_FOLDER']
    examples_dataset_dir = app.config['EXAMPLES_DATASET_ROOT_DIR']
    annot_dataset_label_names = os.listdir(annot_dataset_dir)
    examples_dataset_label_names = os.listdir(examples_dataset_dir)
    # assert that annotation dataset label names are a subset of the examples dataset label names
    if not set(annot_dataset_label_names).issubset(set(examples_dataset_label_names)):
        app.logger.error(f"Annotation dataset label names are not a subset of the examples dataset label names. "
                         f"Annotation dataset label names: {annot_dataset_label_names}. "
                         f"Examples dataset label names: {examples_dataset_label_names}")
        return False
    # assert that examples dataset label names are a subset of the annotation dataset label names
    indices_to_label_names, _ = get_label_indices_to_label_names_dicts(app)
    if not set(examples_dataset_label_names).issubset(set(indices_to_label_names.values())):
        app.logger.error(f"Examples dataset label names are not a subset of the annotation dataset label names. "
                         f"Annotation dataset label names: {annot_dataset_label_names}. "
                         f"Examples dataset label names: {examples_dataset_label_names}")
        return False
    return True


def get_label_indices_to_label_names_dicts(app):
    """
    Returns two dictionaries. First one maps label indices to folder names, while the second maps label indices
    to human-readable labels.
    """
    label_indices_to_label_names = read_json_file(app.config['LABEL_INDICES_TO_LABEL_NAMES_JSONFILE'], app)
    if label_indices_to_label_names is None:
        return None, None
    if app.config['ARE_LABELS_HUMAN_READABLE']:
        label_indices_to_human_readable = label_indices_to_label_names
    else:
        label_indices_to_human_readable = read_json_file(app.config['LABEL_INDICES_TO_HR_JSONFILE'], app)
        if label_indices_to_human_readable is None:
            return None, None
    return label_indices_to_label_names, label_indices_to_human_readable
