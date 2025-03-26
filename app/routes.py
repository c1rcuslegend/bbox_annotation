import os
import numpy as np
import json
import time
import timeit
from flask import render_template, request, redirect, url_for, jsonify

from .helper_funcs import get_sample_images_for_categories, copy_to_static_dir, get_image_softmax_dict, \
    get_image_conf_dict, load_json
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

            if 'crowd_flags' in bboxes:
                result['crowd_flags'] = bboxes['crowd_flags']

            return result

    return bboxes  # Return as is if not in expected format


def get_bboxes_from_file(file_path, image_name=None):
    """Load bboxes directly from file without caching"""
    try:
        t=time.time()
        bbox_data = load_json(file_path)
        print("bbox load", time.time()-t)
        # If we're looking for a specific image, extract just that image's data
        if image_name and bbox_data and isinstance(bbox_data, dict):
            result = bbox_data.get(image_name, {'boxes': [], 'scores': [], 'labels': [], 'gt': []})
            return result
        return bbox_data
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error loading file {file_path}: {e}")
        return {}


def ensure_at_least_one_bbox(bboxes, threshold):
    """Ensure at least one bbox is above threshold by boosting the highest scoring box if needed."""
    if not bboxes or 'boxes' not in bboxes or not bboxes['boxes'] or 'scores' not in bboxes or not bboxes['scores']:
        return bboxes

    # Check if any boxes are above threshold
    above_threshold = any(score >= threshold for score in bboxes['scores'])

    if not above_threshold and bboxes['boxes']:
        # Find the box with the highest score
        highest_score_idx = 0
        highest_score = -1

        for i, score in enumerate(bboxes['scores']):
            if score > highest_score:
                highest_score = score
                highest_score_idx = i

        # Boost the score of the highest scoring box
        print(
            f"No boxes above threshold {threshold}. Boosting box {highest_score_idx} with score {highest_score} to display")
        bboxes['scores'][highest_score_idx] = threshold + 1

    return bboxes


def register_routes(app):
    # Initialize the global bbox data
    app.bbox_openclip_data = {}

    # Load hierarchy files for class navigation
    def load_hierarchy_files():
        """Load the parent_to_children.json and index_to_parent.json files"""
        try:
            parent_to_children_path = os.path.join(app.config['APP_ROOT_FOLDER'], 'parent_to_children.json')
            index_to_parent_path = os.path.join(app.config['APP_ROOT_FOLDER'], 'index_to_parent.json')

            with open(parent_to_children_path, 'r') as f:
                parent_to_children = json.load(f)

            with open(index_to_parent_path, 'r') as f:
                index_to_parent = json.load(f)

            # Convert string keys to integers in index_to_parent for easier usage
            index_to_parent = {int(k): v for k, v in index_to_parent.items()}

            return parent_to_children, index_to_parent
        except Exception as e:
            app.logger.error(f"Error loading hierarchy files: {e}")
            return {}, {}

    # Load hierarchy data
    app.parent_to_children, app.index_to_parent = load_hierarchy_files()

    # Create a flattened ordered list of class indices based on clusters
    def create_ordered_class_list():
        """Create a flat list of class indices ordered by cluster hierarchy"""
        ordered_classes = []

        # If hierarchy data wasn't loaded successfully, return empty list
        if not app.parent_to_children:
            return []

        # Add classes in order from each cluster
        for cluster in sorted(app.parent_to_children.keys()):
            ordered_classes.extend(app.parent_to_children[cluster])

        return ordered_classes

    app.ordered_class_list = create_ordered_class_list()

    # Helper function to get the next class in the hierarchy
    def get_next_class_in_hierarchy(current_class_index, direction):
        """Get the next class index in the hierarchy based on direction (next/prev)"""
        if not app.ordered_class_list:
            # If there's no hierarchy data, fall back to linear navigation
            return current_class_index + (1 if direction == "next" else -1)

        try:
            # Find the current position in the ordered list
            current_position = app.ordered_class_list.index(current_class_index)

            # Get next/prev position
            next_position = current_position + (1 if direction == "next" else -1)

            # Handle wrap-around
            if next_position < 0:
                next_position = len(app.ordered_class_list) - 1
            elif next_position >= len(app.ordered_class_list):
                next_position = 0

            # Return the class at the new position
            return app.ordered_class_list[next_position]
        except ValueError:
            # If current class not in ordered list, fall back to linear navigation
            return current_class_index + (1 if direction == "next" else -1)

    app.get_next_class_in_hierarchy = get_next_class_in_hierarchy

    # Helper function to get cluster name for a class
    def get_cluster_name(class_index):
        """Get the cluster name for a given class index"""
        return app.index_to_parent.get(class_index, "Unknown Cluster")

    app.get_cluster_name = get_cluster_name

    def load_bbox_openclip_data(username):
        """Helper function to load bbox data for a specific image"""
        if username not in app.bbox_openclip_data:
            # Load entire file for this user
            bbox_file_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'],
                                          username, f'bboxes_{username}.json')
            app.bbox_openclip_data[username] = get_bboxes_from_file(bbox_file_path)

        # Return data for specific image if exists
        if app.bbox_openclip_data:
            return app.bbox_openclip_data[username]

        return {}

    # Attach the loader function to app for access from routes
    app.load_bbox_openclip_data = load_bbox_openclip_data

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
        t=time.time()
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

        # Used to track the progress of the user
        num_corrected_images = len(man_annotated_bboxes_dict)

        # Initialize bbox_data to store bounding boxes for each image
        bbox_data = {}
        checked_labels = set()
        image_paths = {}
        borders = {}
        threshold = app.config.get('THRESHOLD', 0.5)

        MULTILABEL_CONFIDENCE_THRESHOLD = 0.7  # We can move it to the config, anyway further discussion is needed
        print ("time before ing conf", time.time() -t )
        t=time.time()
        # Used for possible multilabel detection based on the confidence
        # image_conf_dict = get_image_conf_dict(proposals_info)
        image_conf_dict = get_image_conf_dict([proposals_info[idx] for idx in selected_indices])
        for selected_index, image_path in zip(selected_indices, selected_images):
            image_basename = os.path.basename(image_path)

            # Check if image is multilabel based on softmax confidence
            if image_conf_dict[image_basename][0] <= MULTILABEL_CONFIDENCE_THRESHOLD:
                borders[selected_index] = 'border-poss-m'

            # Process bounding box data for this image
            bboxes = {'boxes': [], 'scores': [], 'labels': []}
            if image_basename in man_annotated_bboxes_dict:
                checked_labels.add(image_basename)

                data = man_annotated_bboxes_dict[image_basename]
                if data.get('label_type') == 'ood':
                    borders[selected_index] = 'border-ood'
                elif data.get('label_type') == 'uncertain':
                    borders[selected_index] = 'border-not-sure'
                elif len(data.get('bboxes', [])) > 1:
                    labels = set()
                    for bbox in data['bboxes']:
                        if bbox['label'] not in labels:
                            if len(labels) == 0:
                                labels.add(bbox['label'])
                            else:
                                borders[selected_index] = 'border-m'
                                break

                # Extract bounding boxes from annotations
                data = man_annotated_bboxes_dict[image_basename]
                if isinstance(data, dict) and 'bboxes' in data and isinstance(data['bboxes'], list):
                    for bbox in data['bboxes']:
                        if 'coordinates' in bbox and 'label' in bbox:
                            bboxes['boxes'].append(bbox['coordinates'])
                            bboxes['labels'].append(bbox['label'])
                            bboxes['scores'].append(100)  # Default high confidence score
            else:
                # print ("we go for open clip data")
                tt=time.time()
                data = app.load_bbox_openclip_data(username)[image_basename]
                # print("open clip load", time.time() -tt)
                tt=time.time()
                for box, label, score in zip(data['boxes'], data['gt'], data['scores']):
                    bboxes['boxes'].append(box)
                    bboxes['labels'].append(label)
                    bboxes['scores'].append(score)
                tt=time.time()
                # Ensure at least one bbox is displayed
                bboxes = ensure_at_least_one_bbox(bboxes, threshold)


            print(bboxes)
            bbox_data[selected_index] = convert_bboxes_to_serializable(bboxes)

            # Set image path
            image_paths[selected_index] = os.path.join(app.config['STATIC_FOLDER'], 'images', image_path)

        assert len(image_paths) == len(label_indices) == NUM_IMG_TO_FETCH
        print ("time bbox", time.time() -t )

        print("bbox_data: ", bbox_data)
        t=time.time()
        # Load class_corrected_images from checkbox selection file
        class_dict = ClassDictionary()
        current_class = current_image_index // 50
        class_corrected_images = 0
        for img_name_key in man_annotated_bboxes_dict.keys():
            if class_corrected_images == 50:
                break
            if class_dict.get_val_img_class(img_name_key) == current_class:
                class_corrected_images += 1


        # Get cluster name for current class
        cluster_name_final = app.get_cluster_name(current_class)

        print(f"Cluster name for class {current_class}: {cluster_name_final}")

        # Prepare clusters for dropdown menu
        clusters = {}
        for cluster_name in sorted(app.parent_to_children.keys()):
            classes_in_cluster = app.parent_to_children[cluster_name]
            clusters[cluster_name] = []
            for i,class_id in enumerate(classes_in_cluster):
                if str(class_id) in label_indices_to_human_readable:
                    class_name = label_indices_to_human_readable[str(class_id)]
                    clusters[cluster_name].append({
                        'id': class_id,
                        'name': class_name,
                        'rel_class_id': i
                    })
        print("time to load the rest", time.time()-t)

        return render_template('img_grid.html',
                               image_paths=image_paths,
                               label_indices=label_indices,
                               checked_labels=checked_labels,
                               bbox_data=bbox_data,  # Pass bbox data to template
                               threshold=threshold,
                               username=username,
                               human_readable_classes_map=label_indices_to_human_readable,
                               current_image_index=current_image_index,
                               num_corrected_images=num_corrected_images,
                               borders=borders,
                               class_corrected_images=class_corrected_images,
                               class_total_images=50,
                               cluster_name=cluster_name_final,  # Add cluster name to template
                               clusters=clusters)  # Add clusters data for dropdown

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
        t=time.time()
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

        # image_softmax_dict = get_image_softmax_dict(proposals_info)

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

        # top_categories = image_softmax_dict[current_image][:20]

        # load softmax values only for the current image, not for all at once
        top_categories = np.argsort(proposals_info[current_image_index]["softmax_val"])[::-1][:20]
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
        threshold = app.config['THRESHOLD']

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
                    crowd_flags = []
                    # Track unique labels for checked categories
                    checked_labels = set()

                    for bbox in data['bboxes']:
                        boxes.append(bbox['coordinates'])
                        label = bbox.get('label', 0)
                        labels.append(label)
                        scores.append(100)
                        crowd_flags.append(bbox.get('crowd_flag', False))

                        # Track unique labels
                        checked_labels.add(str(label))

                    # Always use bbox labels for checked categories (unless uncertain mode)
                    if label_type == "basic" and checked_labels:
                        checked_categories = [label_id for label_id in checked_labels if
                                              label_id in label_indices_to_label_names]

                    bboxes = {'boxes': boxes, 'scores': scores, 'labels': labels, 'crowd_flags': crowd_flags}
                    bboxes_source = 'checkbox_selections_new_format'
                    print(f"Found {len(boxes)} bboxes in checkbox_selections")

            # Handle legacy format with bboxes as list of dicts
            elif (isinstance(data, list) and len(data) > 0 and
                  isinstance(data[0], dict) and 'coordinates' in data[0]):

                # Converting bbox format
                boxes = []
                scores = []
                labels = []
                crowd_flags = []
                checked_labels = set()

                for bbox in data:
                    boxes.append(bbox['coordinates'])
                    label = bbox.get('label', 0)
                    labels.append(label)
                    scores.append(100)  # Default high confidence score
                    crowd_flags.append(bbox.get('crowd_flag', False))

                    # Track unique labels for checked categories
                    checked_labels.add(str(label))

                # Get checked categories from unique labels
                checked_categories = [label_id for label_id in checked_labels if
                                      label_id in label_indices_to_label_names]

                bboxes = {'boxes': boxes, 'scores': scores, 'labels': labels, 'crowd_flags': crowd_flags}
                bboxes_source = 'checkbox_selections_legacy'
                print(f"Found {len(boxes)} bboxes in annotator format")

        # If no bboxes found in checkbox_selections, try loading from machine-generated bboxes file
        else:

            bbox_data = app.load_bbox_openclip_data(username)[current_image]

            # Check if we got valid bbox data
            if bbox_data and 'boxes' in bbox_data and bbox_data['boxes']:
                print(f"Found {len(bbox_data['boxes'])} bboxes in machine-generated bboxes file")

                # Ensure at least one bbox is displayed
                bbox_data = ensure_at_least_one_bbox(bbox_data, threshold)

                bboxes = bbox_data
                bboxes['crowd_flags'] = [False for i in range(len(bboxes['boxes']))]
                bboxes_source = 'general_bboxes'

                # Extract checked categories from bbox labels
                if 'labels' in bbox_data and bbox_data['labels']:
                    checked_labels = set()
                    for label in bbox_data['labels']:
                        checked_labels.add(str(label))

                    checked_categories = [label_id for label_id in checked_labels if
                                          label_id in label_indices_to_label_names]

                    print(f"Extracted {len(checked_categories)} checked categories from bbox labels")

        # If still no bboxes, create empty structure
        if bboxes is None:
            bboxes = {'boxes': [], 'scores': [], 'labels': [], 'crowd_flags': []}
            bboxes_source = 'empty'
            print(f"No bboxes found for {current_image}")

        # Ensure bboxes is properly serializable
        bboxes = convert_bboxes_to_serializable(bboxes)

        # Get the ground truth class
        class_dict = ClassDictionary()

        # Get cluster name for current class
        current_class = class_dict.get_val_img_class(current_image)
        cluster_name_final = app.get_cluster_name(current_class)

        # Prepare clusters for dropdown menu
        clusters = {}
        for cluster_name in sorted(app.parent_to_children.keys()):
            classes_in_cluster = app.parent_to_children[cluster_name]
            clusters[cluster_name] = []
            for class_id in classes_in_cluster:
                if str(class_id) in label_indices_to_human_readable:
                    class_name = label_indices_to_human_readable[str(class_id)]
                    clusters[cluster_name].append({
                        'id': class_id,
                        'name': class_name
                    })

        end_time = timeit.default_timer()
        # print(time.time() - t, "for load")
        print(f"Total page load time: {end_time - start_time:.4f} seconds")

        return render_template('user_label.html',
                               predicted_image=current_imagepath[0],
                               similar_images=similar_images,
                               username=username,
                               ground_truth_label=class_dict.get_class_name(
                                   class_dict.get_val_img_class(current_image)),
                               ground_truth_class_index=class_dict.get_val_img_class(current_image),
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
                               selected_classes=selected_classes,
                               cluster_name=cluster_name_final,  # Add cluster name to template
                               clusters=clusters)  # Add clusters data for dropdown

    @app.route('/<username>/save_grid', methods=['POST'])
    def save_grid(username):
        """
        Save checkboxes from the grid view, using the new bbox-based format.
        Always use base_image_name as the key for simplicity.
        """
        import timeit
        start = timeit.default_timer()

        image_paths, checkbox_values, direction, _ = get_form_data()

        print(f"Saving grid data for user {username} with direction {direction}")

        # Get base image names only
        all_image_base_names = [os.path.basename(path) for path in image_paths.split('|')]
        checked_image_base_labels = [os.path.basename(path) for path in
                                     [temp.split('|')[1] for temp in checkbox_values]]
        checked_image_base_names = [os.path.basename(path) for path in [temp.split('|')[0] for temp in checkbox_values]]

        # Load user data
        _, checkbox_selections = load_user_data(app, username)
        bboxes_dict = app.load_bbox_openclip_data(username)
        man_annotated_bboxes_dict = read_json_file(
            os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
            app)

        checked_images_count = 0
        # Process each image in the grid
        for base_name in all_image_base_names:
            if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                del checkbox_selections[base_name]  # Remove all bboxes for unchecked images
                continue
            if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                continue  # Skip images that are already annotated by the user

            checkbox_selections[base_name] = {}
            # Get existing data
            bboxes = bboxes_dict[base_name]['boxes']
            scores = bboxes_dict[base_name]['scores']
            if not bboxes:
                continue

            # Make sure we include at least one box per image
            threshold = app.config['THRESHOLD']
            above_threshold = [score >= threshold for score in scores]

            # If no boxes above threshold, include the highest scoring box
            if not any(above_threshold) and scores:
                highest_score_idx = scores.index(max(scores))
                above_threshold[highest_score_idx] = True
                print(f"No boxes above threshold for {base_name}. Including highest score box {highest_score_idx}")

            checkbox_selections[base_name]['bboxes'] = [
                {"coordinates": box, "label": checked_image_base_labels[checked_images_count]}
                for box, include in zip(bboxes, above_threshold) if include
            ]
            checkbox_selections[base_name]['label_type'] = 'basic'
            checked_images_count += 1

        try:
            # Modified to use the hierarchy-based navigation
            current_image_index = app.current_image_index_dct.get(username, 0)
            current_class = current_image_index // 50

            print(f"Current class: {current_class}")
            print(f"Current image index: {current_image_index}")

            # Get the next class based on hierarchy
            if direction == "next":
                next_class = app.get_next_class_in_hierarchy(current_class, "next")
            else:
                next_class = app.get_next_class_in_hierarchy(current_class, "prev")

            print(f"Next class: {next_class}")

            if (direction == "next" and current_image_index + 5 < (current_class+1)*50) or (direction == "prev" and current_image_index - 5 >= current_class*50):
                new_index = current_image_index + 5 if direction == "next" else current_image_index - 5
            else:
                # Calculate new index based on class * 50
                new_index = next_class * 50 if direction == "next" else (next_class + 1) * 50 - 1

            # Update the current image index
            app.current_image_index_dct[username] = new_index

            update_current_image_index_simple(app, username, app.current_image_index_dct, new_index)

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

    @app.route('/<username>/jump_to_class', methods=['POST'])
    def jump_to_class(username):
        """
        Handle jumping to a specific class while saving checkbox selections
        This functions similar to save_grid but with a different navigation target
        """
        import timeit
        import os
        start = timeit.default_timer()

        # Get form data - same as in save_grid
        image_paths, checkbox_values, direction, _ = get_form_data()

        # Get the target image_index or class/cluster
        image_index = request.form.get('image_index')
        cluster_name = request.form.get('cluster_name')
        class_id = request.form.get('class_id')

        print(f"Jumping to class for user {username} with image index {image_index}, class {class_id}, ")

        # If image_index is provided directly, use it
        if image_index:
            try:
                target_index = int(image_index)
            except (ValueError, TypeError):
                app.logger.error(f"Invalid image index for jump: {image_index}")
                return redirect(url_for('grid_image', username=username))

        # If class_id is provided, calculate the index
        elif class_id:
            try:
                target_class = int(class_id)
                target_index = target_class * 50
            except (ValueError, TypeError):
                app.logger.error(f"Invalid class id for jump: {class_id}")
                return redirect(url_for('grid_image', username=username))

        # If cluster_name is provided, get the first class in that cluster
        elif cluster_name:
            if cluster_name in app.parent_to_children and app.parent_to_children[cluster_name]:
                target_class = app.parent_to_children[cluster_name][0]
                target_index = target_class * 50
            else:
                app.logger.error(f"Invalid cluster name or empty cluster: {cluster_name}")
                return redirect(url_for('grid_image', username=username))
        else:
            return redirect(url_for('grid_image', username=username))

        # Process checkbox selections - same as in save_grid
        # Get base image names only
        all_image_base_names = [os.path.basename(path) for path in image_paths.split('|')]
        checked_image_base_labels = []
        checked_image_base_names = []

        if checkbox_values:
            checked_image_base_labels = [os.path.basename(path) for path in
                                         [temp.split('|')[1] for temp in checkbox_values]]
            checked_image_base_names = [os.path.basename(path) for path in
                                        [temp.split('|')[0] for temp in checkbox_values]]

        # Load user data
        _, checkbox_selections = load_user_data(app, username)
        bboxes_dict = app.load_bbox_openclip_data(username)
        man_annotated_bboxes_dict = read_json_file(
            os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
            app)

        checked_images_count = 0
        # Process each image in the grid
        for base_name in all_image_base_names:
            if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                del checkbox_selections[base_name]  # Remove all bboxes for unchecked images
                continue
            if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                continue  # Skip images that are already annotated by the user

            checkbox_selections[base_name] = {}
            # Get existing data
            if base_name in bboxes_dict:
                bboxes = bboxes_dict[base_name]['boxes']
                scores = bboxes_dict[base_name]['scores']
                if not bboxes:
                    continue

                # Include at least one box per image
                threshold = app.config['THRESHOLD']
                above_threshold = [score >= threshold for score in scores]

                # If no boxes above threshold, include the highest scoring box
                if not any(above_threshold) and scores:
                    highest_score_idx = scores.index(max(scores))
                    above_threshold[highest_score_idx] = True
                    app.logger.info(
                        f"No boxes above threshold for {base_name}. Including highest score box {highest_score_idx}")

                if checked_images_count < len(checked_image_base_labels):
                    checkbox_selections[base_name]['bboxes'] = [
                        {"coordinates": box, "label": checked_image_base_labels[checked_images_count]}
                        for box, include in zip(bboxes, above_threshold) if include
                    ]
                    checkbox_selections[base_name]['label_type'] = 'basic'
                    checked_images_count += 1

        try:
            # Update the in-memory index
            update_current_image_index_simple(app, username, app.current_image_index_dct, target_index)

            # Save the checkbox selections
            save_user_data(app, username, checkbox_selections=checkbox_selections)

            app.logger.info(f"User {username} jumped to image index {target_index}")
        except Exception as e:
            app.logger.error(f"Error in jump_to_class function for user {username}: {e}")
            return "An error occurred"

        print(f"Time taken in jump_to_class: {timeit.default_timer() - start}")
        return redirect(url_for('grid_image', username=username))

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
                        'label': int(checkbox_value),
                        'crowd_flag': False
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
                    'label': int(checkbox_value),
                    'crowd_flag': False
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
            # Modified to use the hierarchy-based navigation
            current_image_index = app.current_image_index_dct.get(username, 0)
            current_class = current_image_index // 50

            print(f"Current class: {current_class}")
            print(f"Current image index: {current_image_index}")

            # Get the next class based on hierarchy
            if direction == "next":
                next_class = app.get_next_class_in_hierarchy(current_class, "next")
            else:
                next_class = app.get_next_class_in_hierarchy(current_class, "prev")

            print(f"Next class: {next_class}")

            # Fixed skipping 5 images at once when pressing the next/prev button
            if (direction == "next" and current_image_index + 1 < (current_class + 1) * 50) or (
                    direction == "prev" and current_image_index - 1 >= current_class * 50):
                new_index = current_image_index + 1 if direction == "next" else current_image_index - 1
            else:
                # Calculate new index based on class * 50
                new_index = next_class * 50 if direction == "next" else (next_class + 1) * 50 - 1

            # Update the current image index
            app.current_image_index_dct[username] = new_index

            update_current_image_index_simple(app, username, app.current_image_index_dct, new_index)

            # Save only the checkbox_selections, leave comments unchanged
            save_user_data(app, username, checkbox_selections=checkbox_selections)

        except Exception as e:
            app.logger.error(f"Error in save_grid function for user {username}: {e}")
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

    # New endpoint to handle cluster-based navigation
    @app.route('/<username>/jump_to_cluster', methods=['POST'])
    def jump_to_cluster(username):
        """
        Handle jumping to a specific cluster while saving checkbox selections
        This functions similar to save_grid but with a different navigation target
        """
        import timeit
        start = timeit.default_timer()

        # Get form data - same as in save_grid
        image_paths, checkbox_values, direction, _ = get_form_data()

        # Get the cluster name
        cluster_name = request.form.get('cluster_name')

        if not cluster_name or cluster_name not in app.parent_to_children:
            app.logger.error(f"Invalid cluster name for jump: {cluster_name}")
            return redirect(url_for('grid_image', username=username))

        # Get the first class in the cluster
        try:
            target_class = app.parent_to_children[cluster_name][0]
            target_index = target_class * 50

            # Process checkbox selections - same as in save_grid
            # Get base image names only
            all_image_base_names = [os.path.basename(path) for path in image_paths.split('|')]
            checked_image_base_labels = []
            checked_image_base_names = []

            if checkbox_values:
                checked_image_base_labels = [os.path.basename(path) for path in
                                             [temp.split('|')[1] for temp in checkbox_values]]
                checked_image_base_names = [os.path.basename(path) for path in
                                            [temp.split('|')[0] for temp in checkbox_values]]

            # Load user data
            _, checkbox_selections = load_user_data(app, username)
            bboxes_dict = app.load_bbox_openclip_data(username)
            man_annotated_bboxes_dict = read_json_file(
                os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
                app) or {}

            checked_images_count = 0
            # Process each image in the grid
            for base_name in all_image_base_names:
                if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                    del checkbox_selections[base_name]  # Remove all bboxes for unchecked images
                    continue
                if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                    continue  # Skip images that are already annotated by the user

                checkbox_selections[base_name] = {}
                # Get existing data
                if base_name in bboxes_dict:
                    bboxes = bboxes_dict[base_name]['boxes']
                    scores = bboxes_dict[base_name]['scores']
                    if not bboxes:
                        continue

                    # Include at least one box per image
                    threshold = app.config['THRESHOLD']
                    above_threshold = [score >= threshold for score in scores]

                    # If no boxes above threshold, include the highest scoring box
                    if not any(above_threshold) and scores:
                        highest_score_idx = scores.index(max(scores))
                        above_threshold[highest_score_idx] = True
                        app.logger.info(
                            f"No boxes above threshold for {base_name}. Including highest score box {highest_score_idx}")

                    if checked_images_count < len(checked_image_base_labels):
                        checkbox_selections[base_name]['bboxes'] = [
                            {"coordinates": box, "label": checked_image_base_labels[checked_images_count]}
                            for box, include in zip(bboxes, above_threshold) if include
                        ]
                        checkbox_selections[base_name]['label_type'] = 'basic'
                        checked_images_count += 1

            # Update the in-memory index
            update_current_image_index_simple(app, username, app.current_image_index_dct, target_index)

            # Save the checkbox selections
            save_user_data(app, username, checkbox_selections=checkbox_selections)

            app.logger.info(f"User {username} jumped to cluster {cluster_name}, class {target_class}")

            print(f"Time taken in jump_to_cluster: {timeit.default_timer() - start}")
            return redirect(url_for('grid_image', username=username))
        except (IndexError, ValueError) as e:
            app.logger.error(f"Error jumping to cluster {cluster_name}: {e}")
            return redirect(url_for('grid_image', username=username))

    @app.route('/<username>/refresh_examples', methods=['GET'])
    def refresh_examples(username):
        """
        Refresh example images without reloading the entire page.
        Refreshes only a specific page of examples.
        """
        try:
            # Get current image name
            image_name = request.args.get('image_name', '')
            if not image_name:
                return jsonify({'error': 'No image name provided'}), 400

            # Get page number and class IDs if provided
            page = request.args.get('page', None)
            class_ids_param = request.args.get('class_ids', None)

            # Parse class IDs if provided
            specific_class_ids = None
            if class_ids_param:
                try:
                    specific_class_ids = [int(cid) for cid in class_ids_param.split(',') if cid.strip()]
                    app.logger.info(f"Refreshing specific classes: {specific_class_ids}")
                except ValueError:
                    app.logger.warning(f"Invalid class IDs: {class_ids_param}")

            # Extract base image name
            base_image_name = os.path.basename(image_name)

            # Get user data from cache
            if username not in app.user_cache:
                return jsonify({'error': 'User not found'}), 404

            user_data = app.user_cache[username]
            if any(value is None for value in user_data.values()):
                return jsonify({'error': 'Error loading user data'}), 500

            # Get required data from user cache
            proposals_info = user_data['proposals_info']
            all_sample_images = user_data['all_sample_images']

            # Get class names and mappings
            label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)

            # Create a new random seed based on current time
            new_seed = int(time.time() * 1000) % 10000
            np.random.seed(new_seed)

            # Find the current image data in proposals_info
            current_image_data = None
            current_image_index = -1

            for i, data in enumerate(proposals_info):
                if data['image_name'] == base_image_name:
                    current_image_data = data
                    current_image_index = i
                    break

            if current_image_data is None:
                # If image not found by name, fallback to the current index
                current_image_index = app.current_image_index_dct.get(username, 0)
                # current_image_data = proposals_info[current_image_index]

            # Get top categories for the current image
            # image_softmax_dict = get_image_softmax_dict(proposals_info)
            # top_categories = image_softmax_dict[current_image_data['image_name']][:20]

            # load softmax values only for the current image, not for all at once
            top_categories = np.argsort(proposals_info[current_image_index]["softmax_val"])[::-1][:20]

            # If we have specific class IDs, filter top categories to only include those
            if specific_class_ids:
                # If page is specified, determine the range
                if page:
                    page_num = int(page)
                    start_idx = (page_num - 1) * 5
                    end_idx = start_idx + 5

                    # Only get examples for classes in the current page
                    filtered_top_categories = [cat for i, cat in enumerate(top_categories)
                                               if i >= start_idx and i < end_idx]
                else:
                    # If specific class IDs are provided but no page, use those directly
                    filtered_top_categories = []
                    for cid in specific_class_ids:
                        for cat in top_categories:
                            if int(cat) == int(cid):
                                filtered_top_categories.append(cat)
                                break

                top_categories = filtered_top_categories
                app.logger.info(f"Filtered to {len(top_categories)} categories")

            # Get new sample images with the new random seed
            similar_images = get_sample_images_for_categories(top_categories, all_sample_images,
                                                              label_indices_to_label_names,
                                                              num_selection=app.config['NUM_EXAMPLES_PER_CLASS'])

            # Copy images to static directory
            copy_to_static_dir([], app.config['ANNOTATIONS_ROOT_FOLDER'],
                               os.path.join(app.config['APP_ROOT_FOLDER'], app.config['STATIC_FOLDER'], 'images'))

            # Convert all NumPy int64 keys to Python native integers
            converted_similar_images = {}
            for key, value in similar_images.items():
                # Convert the NumPy int64 key to a standard Python int
                python_int_key = int(key)
                # Update the paths to include static folder
                converted_similar_images[python_int_key] = [
                    os.path.join(app.config['STATIC_FOLDER'], 'images', image) for image in value
                ]

            # Return the new similar images with converted keys as JSON
            return jsonify({
                'similar_images': converted_similar_images,
                'seed': new_seed,
                'page': page,
                'class_ids': specific_class_ids
            })

        except Exception as e:
            app.logger.error(f"Error refreshing examples for {username}: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500