import os
import pickle
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from PIL import Image
import json
from flask import render_template, request, redirect, url_for, send_from_directory, jsonify
from .helper_funcs import get_sample_images_for_categories, copy_to_static_dir, get_image_softmax_dict, read_json_file
from .app_utils import get_form_data, load_user_data, update_current_image_index, save_user_data, \
    get_label_indices_to_label_names_dicts, load_json_data, save_json_data


def convert_bboxes_to_serializable(bboxes):
    """Convert bbox data to a serializable format for JSON."""
    # If bboxes already has the expected structure but with numpy arrays, convert them
    if isinstance(bboxes, dict):
        if 'boxes' in bboxes:
            boxes = bboxes['boxes'].tolist() if isinstance(bboxes['boxes'], np.ndarray) else bboxes['boxes']
            scores = bboxes['scores'].tolist() if isinstance(bboxes['scores'], np.ndarray) else bboxes['scores']

            result = {
                'boxes': boxes,
                'scores': scores
            }

            # Include labels if present
            if 'labels' in bboxes:
                result['labels'] = bboxes['labels'].tolist() if isinstance(bboxes['labels'], np.ndarray) else bboxes[
                    'labels']

            # Include ground truth if present
            if 'gt' in bboxes:
                result['gt'] = bboxes['gt']

            return result

    return bboxes  # Return as is if not in expected format


def register_routes(app):
    @app.route('/', methods=['GET', 'POST'])
    def index():
        """
        Handles the index page requests of the web application.

        For a GET request, renders and returns the homepage ('index.html').
        For a POST request, extracts the 'username' from the form data, logs it,
        and redirects to the 'label_image' route with the username.

        Returns:
            Rendered template ('index.html') on GET request or redirection to
            'label_image' route on POST request with the username parameter.
        """
        if request.method == 'POST':
            username = request.form.get('username')
            app.logger.info(f"Username received: {username}")
            return redirect(url_for('label_image', username=username))
        else:
            return render_template('index.html')

    @app.route('/<username>')
    def label_image(username):
        """
        Renders the image labeling page for a given user.

        Validates the user from the cached data and processes image data for labeling.
        Returns an error message if the user does not exist or data is unavailable.

        Args:
            username (str): The username of the user.

        Returns:
            Rendered 'user_label.html' template with relevant image data
            if user exists and data is available, otherwise a string error message.
        """
        if username not in app.user_cache:
            return "No such user exists. Please check it again."

        user_data = app.user_cache[username]
        if any(value is None for value in user_data.values()):
            return "Error loading data."

        # Cached data is being used here
        proposals_info = user_data['proposals_info']
        all_sample_images = user_data['all_sample_images']
        app.num_predictions_per_user[username] = user_data['num_predictions']

        # get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        # assert both are not None
        assert label_indices_to_label_names is not None and label_indices_to_human_readable is not None

        image_softmax_dict = get_image_softmax_dict(proposals_info)

        # Set current image index
        current_image_index = app.current_image_index_dct.get(username, 0)

        current_image_data = proposals_info[current_image_index]
        current_image = current_image_data['image_name']
        current_gt_class = current_image_data['ground_truth']
        current_class_name = label_indices_to_label_names[str(current_gt_class)]
        current_imagepath = [os.path.join(current_class_name, current_image)]

        top_categories = image_softmax_dict[current_image][:20]
        similar_images = get_sample_images_for_categories(top_categories, all_sample_images,
                                                          label_indices_to_label_names,
                                                          num_selection=app.config['NUM_EXAMPLES_PER_CLASS'])

        copy_to_static_dir(current_imagepath, app.config['ANNOTATIONS_ROOT_FOLDER'],
                           os.path.join(app.config['APP_ROOT_FOLDER'], app.config['STATIC_FOLDER'], 'images'))

        current_imagepath = [os.path.join(app.config['STATIC_FOLDER'], 'images', image) for image in current_imagepath]
        similar_images = {key: [os.path.join(app.config['STATIC_FOLDER'], 'images', image)
                                for image in value] for key, value in similar_images.items()}

        # Get the image name without the path prefix for lookups
        image_name_for_lookup = current_imagepath[0].lstrip('static/images/')

        # Also get the base image name without the class prefix for demo bboxes lookup
        base_image_name = os.path.basename(image_name_for_lookup)

        # Load user data (comments and checkbox_selections)
        comments_json, checkbox_selections = load_user_data(app, username)

        # Get comments
        comments = comments_json.get(image_name_for_lookup, '')

        # Get checked categories and bboxes
        checked_categories = []
        bboxes = None
        bboxes_source = None  # Track where we got the bboxes from

        # First check if we have bboxes in checkbox_selections
        if image_name_for_lookup in checkbox_selections:
            print(f"Found bboxes for {current_image} in user bboxes file")
            data = checkbox_selections[image_name_for_lookup]

            # If the data is a list of dicts with coordinates, it's bboxes data
            if (isinstance(data, list) and len(data) > 0 and
                    isinstance(data[0], dict) and 'coordinates' in data[0]):

                # Convert to the format expected by the front-end
                boxes = []
                scores = []
                labels = []

                for bbox in data:
                    boxes.append(bbox['coordinates'])
                    labels.append(bbox.get('label', 0))
                    scores.append(1.0)  # Default high confidence score for human-verified boxes

                    # Add the label to checked categories
                    label_id = str(bbox.get('label', 0))
                    if label_id in label_indices_to_label_names:
                        checked_categories.append(label_indices_to_label_names[label_id])

                bboxes = {'boxes': boxes, 'scores': scores, 'labels': labels}
                bboxes_source = 'checkbox_selections'
            else:
                # Regular checkbox selections
                checked_categories = data

        # If no bboxes found in checkbox_selections, try loading from bboxes file
        if bboxes is None:
            # First try user-specific bboxes file
            bbox_file_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'bboxes_{username}.json')
            bbox_data = load_json_data(bbox_file_path) or {}
            #print(f"bbox_data: {bbox_data}")

            if current_image in bbox_data:
                print(f"Found bboxes for {current_image} in general bboxes file")
                bboxes = bbox_data.get(current_image, {'boxes': [], 'scores': [], 'labels': [], 'gt': []})
                bboxes_source = 'general_bboxes'

                # Add the labels to checked categories
                if 'labels' in bboxes and len(bboxes['labels']) > 0:
                    for label in bboxes['labels']:
                        label_id = str(label)
                        if label_id in label_indices_to_label_names:
                            checked_categories.append(label_indices_to_label_names[label_id])

        # If still no bboxes, create empty structure
        if bboxes is None:
            bboxes = {'boxes': [], 'scores': [], 'labels': []}
            bboxes_source = 'empty'

        # Ensure bboxes is properly serializable
        bboxes = convert_bboxes_to_serializable(bboxes)
        threshold = app.config['THRESHOLD']

        return render_template('user_label.html',
                               predicted_image=current_imagepath[0],
                               similar_images=similar_images,
                               username=username,
                               checked_categories=checked_categories,
                               comments=comments,
                               human_readable_classes_map=label_indices_to_human_readable,
                               current_image_index=current_image_index,
                               num_similar_images=app.config['NUM_EXAMPLES_PER_CLASS'],
                               bboxes=bboxes,
                               threshold=threshold,
                               image_name=image_name_for_lookup,
                               bboxes_source=bboxes_source)  # Pass source for debugging if needed

    @app.route('/<username>/save', methods=['POST'])
    def save(username):
        import timeit
        start = timeit.default_timer()

        # Get form data
        image_name, checkbox_values, direction, comments = get_form_data()

        # Load and update user data
        comments_json, checkbox_selections = load_user_data(app, username)
        comments_json[image_name] = comments

        # We don't update bboxes here, only regular checkbox selections
        # If there are already bboxes for this image, preserve them
        if (image_name in checkbox_selections and isinstance(checkbox_selections[image_name], list) and
                len(checkbox_selections[image_name]) > 0 and
                isinstance(checkbox_selections[image_name][0], dict) and
                'coordinates' in checkbox_selections[image_name][0]):
            # Keep the existing bboxes data
            pass
        else:
            # No bboxes yet, just use the checkbox values
            checkbox_selections[image_name] = checkbox_values

        try:
            total_num_predictions = app.num_predictions_per_user[username]
            update_current_image_index(app, username, direction, total_num_predictions, app.current_image_index_dct)
            save_user_data(app, username, comments_json, checkbox_selections)
        except Exception as e:
            app.logger.error(f"Error in save function for user {username}: {e}")
            return "An error occurred"

        print(f"Time taken in save: {timeit.default_timer() - start}")
        return redirect(url_for('label_image', username=username))

    @app.route('/<username>/save_bboxes', methods=['POST'])
    def save_bboxes(username):
        try:
            # Get the data from the request
            data = request.get_json()
            image_name = data.get('image_name')
            bboxes = data.get('bboxes', [])

            if not image_name:
                return jsonify({'error': 'Image name is required'}), 400

            # Remove 'static/images/' prefix if present
            if image_name.startswith('static/images/'):
                image_name = image_name.lstrip('static/images/')

            # Load existing checkbox selections
            _, checkbox_selections = load_user_data(app, username)

            # Update the checkbox_selections with the new bboxes
            checkbox_selections[image_name] = bboxes

            # Save the updated data
            checkbox_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                         f"checkbox_selections_{username}.json")
            save_json_data(checkbox_path, checkbox_selections)

            return jsonify({'success': True, 'message': 'Bboxes saved successfully'})

        except Exception as e:
            app.logger.error(f"Error saving bboxes for user {username}: {str(e)}")
            return jsonify({'error': str(e)}), 500

    return app  # Return the configured app