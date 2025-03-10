import os
import numpy as np
import json
import time
import timeit
from flask import render_template, request, redirect, url_for, jsonify
from holoviews.operation import threshold

from .helper_funcs import get_sample_images_for_categories, copy_to_static_dir, get_image_softmax_dict
from .app_utils import get_form_data, load_user_data, update_current_image_index, save_user_data, \
    get_label_indices_to_label_names_dicts, save_json_data, update_current_image_index_simple, read_json_file
from class_mapping.class_loader import ClassDictionary


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


def get_bboxes_from_file(file_path, image_name=None):
    """Load bboxes directly from file without caching"""
    try:
        with open(file_path, 'r') as f:
            bbox_data = json.load(f)

        # If we're looking for a specific image, extract just that image's data
        if image_name and bbox_data and isinstance(bbox_data, dict):
            result = bbox_data.get(image_name, {'boxes': [], 'scores': [], 'labels': [], 'gt': []})
            return result
        return bbox_data
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error loading file {file_path}: {e}")
        return {}


def register_routes(app):
    @app.route('/', methods=['GET', 'POST'])
    def index():
        """
        Handles the index page requests of the web application.

        For a GET request, renders and returns the homepage ('index.html').
        For a POST request, extracts the 'username' from the form data, logs it,
        and redirects to the 'grid_image' route with the username.

        Returns:
            Rendered template ('index.html') on GET request or redirection to
            'grid_image' route on POST request with the username parameter.
        """
        if request.method == 'POST':
            username = request.form.get('username')
            app.logger.info(f"Username received: {username}")
            return redirect(url_for('grid_image', username=username))
        else:
            return render_template('index.html')

    @app.route('/<username>')
    def grid_image(username):
        """
        Renders the image labeling page for a given user.

        Validates the user from the cached data and processes image data for labeling.
        Returns an error message if the user does not exist or data is unavailable.

        Args:
            username (str): The username of the user.

        Returns:
            Rendered 'img_grid.html' template with relevant image data
            if user exists and data is available, otherwise a string error message.
        """
        if username not in app.user_cache:
            return "No such user exists. Please check it again."

        user_data = app.user_cache[username]
        if any(value is None for value in user_data.values()):
            return "Error loading data."

        # Cached data is being used here
        proposals_info = user_data['proposals_info']
        # dataset_classes = user_data['imagenet_classes']
        app.num_predictions_per_user[username] = user_data['num_predictions']

        # get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        # assert both are not None
        assert label_indices_to_label_names is not None and label_indices_to_human_readable is not None

        # Set current image index
        current_image_index = app.current_image_index_dct.get(username, 0)
        current_image_index = current_image_index - (current_image_index % 5)

        NUM_IMG_TO_FETCH = 5
        selected_indices = []
        selected_images = []
        label_indices = {}
        for i in range(NUM_IMG_TO_FETCH):
            selected_indices.append(current_image_index + i)
            image_data = proposals_info[selected_indices[i]]
            image_name = image_data['image_name']
            gt_class = image_data['ground_truth']
            class_name = label_indices_to_label_names[str(gt_class)]
            image_path = os.path.join(class_name, image_name)
            selected_images.append(image_path)
            label_indices[selected_indices[i]] = gt_class

        copy_to_static_dir(selected_images, app.config['ANNOTATIONS_ROOT_FOLDER'],
                           os.path.join(app.config['APP_ROOT_FOLDER'], app.config['STATIC_FOLDER'], 'images'))

        # Load checkbox selections with bounding box data
        man_annotated_bboxes_dict = read_json_file(
            os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
            app) or {}

        # Initialize bbox_data to store bounding boxes for each image
        bbox_data = {}
        checked_labels = set()
        image_paths = {}

        for selected_index, image_path in zip(selected_indices, selected_images):
            image_basename = os.path.basename(image_path)

            # Process bounding box data for this image
            bboxes = {'boxes': [], 'scores': [], 'labels': []}
            if image_basename in man_annotated_bboxes_dict:
                checked_labels.add(image_basename)

                # Extract bounding boxes from annotations
                data = man_annotated_bboxes_dict[image_basename]
                if isinstance(data, dict) and 'bboxes' in data and isinstance(data['bboxes'], list):
                    for bbox in data['bboxes']:
                        if 'coordinates' in bbox and 'label' in bbox:
                            bboxes['boxes'].append(bbox['coordinates'])
                            bboxes['labels'].append(bbox['label'])
                            bboxes['scores'].append(100)  # Default high confidence score
            else:
                data = get_bboxes_from_file(os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'],
                                                              username, f'bboxes_{username}.json'), image_basename)
                for box,label,score in zip(data['boxes'], data['gt'], data['scores']):
                    bboxes['boxes'].append(box)
                    bboxes['labels'].append(label)
                    bboxes['scores'].append(score)

            print(bboxes)
            bbox_data[selected_index] = convert_bboxes_to_serializable(bboxes)

            # Set image path
            image_paths[selected_index] = os.path.join(app.config['STATIC_FOLDER'], 'images', image_path)

        assert len(image_paths) == len(label_indices) == NUM_IMG_TO_FETCH

        print(bbox_data)

        threshold = app.config.get('THRESHOLD', 0.5)

        return render_template('img_grid.html',
                               image_paths=image_paths,
                               label_indices=label_indices,
                               checked_labels=checked_labels,
                               bbox_data=bbox_data,  # Pass bbox data to template
                               threshold=threshold,
                               username=username,
                               human_readable_classes_map=label_indices_to_human_readable,
                               current_image_index=current_image_index)



    @app.route('/<username>/label_image')
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
        start_time = timeit.default_timer()
        print(f"Started loading page at: {time.strftime('%H:%M:%S')}")

        if username not in app.user_cache:
            return "No such user exists. Please check it again."

        user_data = app.user_cache[username]
        if any(value is None for value in user_data.values()):
            return "Error loading data."

        # Get data from user cache
        proposals_info = user_data['proposals_info']
        all_sample_images = user_data['all_sample_images']
        app.num_predictions_per_user[username] = user_data['num_predictions']

        # Get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        # Assert both are not None
        assert label_indices_to_label_names is not None and label_indices_to_human_readable is not None

        image_softmax_dict = get_image_softmax_dict(proposals_info)

        # Set current image index
        current_image_index = request.args.get('image_index')
        if current_image_index is None:
            current_image_index = app.current_image_index_dct.get(username, 0)
        else:
            try:
                current_image_index = int(current_image_index)
                update_current_image_index_simple(app, username, app.current_image_index_dct, current_image_index)
            except ValueError:
                current_image_index = 0

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

        print(f"Looking up data for image: {current_image}")

        # Load user data directly from file every time (no caching)
        try:
            comments_json, checkbox_selections = load_user_data(app, username)
        except Exception as e:
            app.logger.error(f"Error loading user data for {username}: {str(e)}")
            comments_json = {}
            checkbox_selections = {}

        # Get comments
        comments = comments_json.get(current_image, '')

        # Get checked categories and bboxes
        checked_categories = []
        bboxes = None
        bboxes_source = None  # Track where we got the bboxes from
        label_type = "basic"  # Default label type
        selected_classes = {}  # For uncertain type

        # First try checkbox_selections (user annotated images)
        if current_image in checkbox_selections:
            data = checkbox_selections[current_image]
            print(f"Found data in checkbox_selections for {current_image}")

            # Handle new data structure with label_type
            if isinstance(data, dict) and 'label_type' in data:
                label_type = data.get('label_type', 'basic')

                # Get selected classes for uncertain type
                if label_type == 'uncertain' and 'selected_classes' in data:
                    selected_classes = data.get('selected_classes', {})
                    # Use selected_classes for checked categories in uncertain mode
                    checked_categories = list(selected_classes.keys())

                # If bboxes exist in the new structure
                if 'bboxes' in data and isinstance(data['bboxes'], list) and len(data['bboxes']) > 0:
                    # Convert bboxes to the format expected by the template
                    boxes = []
                    scores = []
                    labels = []
                    # Track unique labels for checked categories
                    checked_labels = set()

                    for bbox in data['bboxes']:
                        boxes.append(bbox['coordinates'])
                        label = bbox.get('label', 0)
                        labels.append(label)
                        scores.append(100)

                        # Track unique labels
                        checked_labels.add(str(label))

                    # FIXED: Always use bbox labels for checked categories (unless uncertain mode)
                    if label_type == "basic" and checked_labels:
                        checked_categories = [label_id for label_id in checked_labels if
                                              label_id in label_indices_to_label_names]

                    bboxes = {'boxes': boxes, 'scores': scores, 'labels': labels}
                    bboxes_source = 'checkbox_selections_new_format'
                    print(f"Found {len(boxes)} bboxes in checkbox_selections")

            # Handle legacy format with bboxes as list of dicts
            elif (isinstance(data, list) and len(data) > 0 and
                  isinstance(data[0], dict) and 'coordinates' in data[0]):

                # Converting bbox format
                boxes = []
                scores = []
                labels = []
                checked_labels = set()

                for bbox in data:
                    boxes.append(bbox['coordinates'])
                    label = bbox.get('label', 0)
                    labels.append(label)
                    scores.append(100)  # Default high confidence score

                    # Track unique labels for checked categories
                    checked_labels.add(str(label))

                # Get checked categories from unique labels
                checked_categories = [label_id for label_id in checked_labels if
                                      label_id in label_indices_to_label_names]

                bboxes = {'boxes': boxes, 'scores': scores, 'labels': labels}
                bboxes_source = 'checkbox_selections_legacy'
                print(f"Found {len(boxes)} bboxes in annotator format")

        # If no bboxes found in checkbox_selections, try loading from machine-generated bboxes file
        if bboxes is None:
            bbox_file_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                          f'bboxes_{username}.json')

            bbox_data = get_bboxes_from_file(bbox_file_path, current_image)

            # Check if we got valid bbox data
            if bbox_data and 'boxes' in bbox_data and bbox_data['boxes']:
                print(f"Found {len(bbox_data['boxes'])} bboxes in machine-generated bboxes file")
                bboxes = bbox_data
                bboxes_source = 'general_bboxes'

                # FIXED: Extract checked categories from bbox labels
                if 'labels' in bbox_data and bbox_data['labels']:
                    checked_labels = set()
                    for label in bbox_data['labels']:
                        checked_labels.add(str(label))

                    checked_categories = [label_id for label_id in checked_labels if
                                          label_id in label_indices_to_label_names]

                    print(f"Extracted {len(checked_categories)} checked categories from bbox labels")

        # If still no bboxes, create empty structure
        if bboxes is None:
            bboxes = {'boxes': [], 'scores': [], 'labels': []}
            bboxes_source = 'empty'
            print(f"No bboxes found for {current_image}")

        # Ensure bboxes is properly serializable
        bboxes = convert_bboxes_to_serializable(bboxes)
        threshold = app.config['THRESHOLD']

        # Get the ground truth class
        class_dict = ClassDictionary()

        end_time = timeit.default_timer()
        print(f"Total page load time: {end_time - start_time:.4f} seconds")

        return render_template('user_label.html',
                               predicted_image=current_imagepath[0],
                               similar_images=similar_images,
                               username=username,
                               ground_truth_label=class_dict.get_class_name(
                                   class_dict.get_val_img_class(current_image)),
                               checked_categories=checked_categories,
                               comments=comments,
                               human_readable_classes_map=label_indices_to_human_readable,
                               current_image_index=current_image_index,
                               num_similar_images=app.config['NUM_EXAMPLES_PER_CLASS'],
                               bboxes=bboxes,
                               threshold=threshold,
                               image_name=current_imagepath,
                               bboxes_source=bboxes_source,
                               label_type=label_type,
                               selected_classes=selected_classes)

    @app.route('/<username>/save_grid', methods=['POST'])
    def save_grid(username):
        """
        Save checkboxes from the grid view, using the new bbox-based format.
        Always use base_image_name as the key for simplicity.
        """
        import timeit
        start = timeit.default_timer()

        image_paths, checkbox_values, direction, _ = get_form_data()

        # Get base image names only
        all_image_base_names = [os.path.basename(path) for path in image_paths.split('|')]
        checked_image_base_labels = [os.path.basename(path) for path in [temp.split('|')[1] for temp in checkbox_values]]
        checked_image_base_names = [os.path.basename(path) for path in [temp.split('|')[0] for temp in checkbox_values]]

        # Load user data
        _, checkbox_selections = load_user_data(app, username)
        bboxes_dict = read_json_file(os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'bboxes_{username}.json'), app)
        man_annotated_bboxes_dict = read_json_file(os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'), app)

        checked_images_count = 0
        # Process each image in the grid
        for base_name in all_image_base_names:
            if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                del checkbox_selections[base_name] # Remove all bboxes for unchecked images
                continue
            if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                continue # Skip images that are already annotated by the user

            checkbox_selections[base_name] = {}
            # Get existing data
            bboxes = bboxes_dict[base_name]['boxes']
            scores = bboxes_dict[base_name]['scores']
            if not bboxes:
                continue

            checkbox_selections[base_name]['bboxes'] = [{"coordinates": box, "label": checked_image_base_labels[checked_images_count]} for (score,box) in zip(scores, bboxes) if score >= app.config['THRESHOLD']]
            checkbox_selections[base_name]['label_type'] = 'basic'
            checked_images_count += 1

        try:
            total_num_predictions = app.num_predictions_per_user[username]
            update_current_image_index(app, username, direction, total_num_predictions, app.current_image_index_dct,
                                       step=5)
            # Save only the checkbox_selections, leave comments unchanged
            save_user_data(app, username, checkbox_selections=checkbox_selections)
        except Exception as e:
            app.logger.error(f"Error in save_grid function for user {username}: {e}")
            return "An error occurred"

        print(f"Time taken in save_grid: {timeit.default_timer() - start}")
        return redirect(url_for('grid_image', username=username))

    @app.route('/review/<username>', methods=['POST'])
    def review(username):
        """
        Handle review requests from grid view to detailed view.
        """
        # Get the base image name directly
        image_path = request.form.get('image')
        image_index = request.form.get("image_index")
        print(f"User is reviewing image: {image_path}")
        return redirect(url_for('label_image', username=username, image_path=image_path, image_index=image_index))

    @app.route('/back2grid/<username>', methods=['POST', 'GET'])
    def back2grid(username):
        image_index = request.form.get("image_index")
        return redirect(url_for('grid_image', username=username, image_index=image_index))

    @app.route('/<username>/save', methods=['POST'])
    def save(username):
        """Save annotations for an image."""
        import timeit
        start = timeit.default_timer()

        # Get form data
        image_name, checkbox_values, direction, comments = get_form_data()

        # Extract the base image name - we only save with base image name as key
        base_image_name = os.path.basename(image_name)

        # Get new label_type field (default to "basic")
        label_type = request.form.get('label_type', 'basic')

        # Get selected_classes if label_type is "uncertain"
        selected_classes = {}
        if label_type == "uncertain":
            selected_classes_json = request.form.get('selected_classes', '{}')
            try:
                selected_classes = json.loads(selected_classes_json)
            except json.JSONDecodeError:
                app.logger.error(f"Invalid JSON for selected_classes: {selected_classes_json}")
                selected_classes = {}

        # Check for bboxes_data field
        bboxes_data = request.form.get('bboxes_data')
        bboxes = []
        if bboxes_data:
            try:
                bboxes = json.loads(bboxes_data)
                app.logger.info(f"Loaded {len(bboxes)} bboxes from form data")
            except json.JSONDecodeError:
                app.logger.error(f"Invalid JSON for bboxes_data: {bboxes_data}")
                bboxes = []

        # Load and update user data
        comments_json, checkbox_selections = load_user_data(app, username)
        comments_json[base_image_name] = comments

        # Process checkbox values to apply them to bboxes
        # Add a new bbox for each checked category if it doesn't exist yet
        if checkbox_values and label_type == "basic" and not selected_classes:
            # Get existing bboxes or create new array
            existing_bboxes = []

            if bboxes:
                existing_bboxes = bboxes
            elif (base_image_name in checkbox_selections and isinstance(checkbox_selections[base_image_name], dict)
                  and 'bboxes' in checkbox_selections[base_image_name]):
                existing_bboxes = checkbox_selections[base_image_name]['bboxes']

            # Extract existing labels
            existing_labels = set()
            for bbox in existing_bboxes:
                if 'label' in bbox:
                    existing_labels.add(str(bbox['label']))

            # For each checkbox that doesn't have a bbox already, create one
            for checkbox_value in checkbox_values:
                if checkbox_value not in existing_labels:
                    # Create a new bbox for this class
                    # Using a placeholder position (could be refined in future)
                    new_bbox = {
                        'coordinates': [10, 10, 50, 50],
                        'label': int(checkbox_value)
                    }
                    existing_bboxes.append(new_bbox)

            # Use the updated bboxes
            bboxes = existing_bboxes

        # Create or update the image data structure
        # If there are bboxes, use those
        if bboxes:
            # Create new image data with bboxes and label type info
            image_data = {
                "bboxes": bboxes,
                "label_type": label_type
            }

            # Add selected_classes if uncertain
            if label_type == "uncertain":
                image_data["selected_classes"] = selected_classes

            # Update the checkbox_selections using base_image_name as key
            checkbox_selections[base_image_name] = image_data

        # If no bboxes but we have selected classes for uncertain mode
        elif label_type == "uncertain" and selected_classes:
            # Create new image data with just label type info and selected classes
            image_data = {
                "bboxes": [],
                "label_type": label_type,
                "selected_classes": selected_classes
            }

            # Update the checkbox_selections
            checkbox_selections[base_image_name] = image_data

        # If no bboxes or selected classes, but we have checkbox values
        elif checkbox_values:
            # Convert checkbox values to bboxes
            new_bboxes = []
            for checkbox_value in checkbox_values:
                new_bbox = {
                    'coordinates': [10, 10, 50, 50],
                    'label': int(checkbox_value)
                }
                new_bboxes.append(new_bbox)

            # Create new image data
            image_data = {
                "bboxes": new_bboxes,
                "label_type": label_type
            }

            # Update the checkbox_selections
            checkbox_selections[base_image_name] = image_data
        else:
            # No bboxes, no selected classes, no checkboxes - create empty structure
            image_data = {
                "bboxes": [],
                "label_type": label_type
            }

            # Update the checkbox_selections
            checkbox_selections[base_image_name] = image_data

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
        """Save bounding box data via AJAX."""
        try:
            # Get the data from the request
            data = request.get_json()
            image_name = data.get('image_name')
            bboxes = data.get('bboxes', [])
            # Convert bbox coordinates to integers
            for bbox in bboxes:
                if 'coordinates' in bbox:
                    bbox['coordinates'] = [round(coord) for coord in bbox['coordinates']]


            timestamp = data.get('timestamp', time.time())  # For debugging

            if not image_name:
                return jsonify({'error': 'Image name is required'}), 400

            # Extract base image name regardless of path
            base_image_name = os.path.basename(image_name)

            # Load existing checkbox selections
            _, checkbox_selections = load_user_data(app, username)

            # Check if we already have label_type info for this image
            label_type = "basic"
            selected_classes = {}

            # Check for existing data using both full path and base name
            if base_image_name in checkbox_selections:
                existing_data = checkbox_selections[base_image_name]

                # Handle existing data structure with label_type
                if isinstance(existing_data, dict) and "label_type" in existing_data:
                    label_type = existing_data.get("label_type", "basic")
                    selected_classes = existing_data.get("selected_classes", {})

            # Update with new bboxes while preserving label type info
            # Always use base_image_name as the key
            checkbox_selections[base_image_name] = {
                "bboxes": bboxes,
                "label_type": label_type
            }

            # Add selected_classes if uncertain
            if label_type == "uncertain":
                checkbox_selections[base_image_name]["selected_classes"] = selected_classes

            # Save the updated checkbox selections
            checkbox_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                         f"checkbox_selections_{username}.json")
            save_json_data(checkbox_path, checkbox_selections)

            return jsonify({'success': True, 'message': 'Bboxes saved successfully'})

        except Exception as e:
            app.logger.error(f"Error saving bboxes for user {username}: {str(e)}")
            return jsonify({'error': str(e)}), 500

    return app  # Return the configured app
