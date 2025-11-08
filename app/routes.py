import os
import numpy as np
import json
import time
import timeit
import threading
from flask import render_template, request, redirect, url_for, jsonify

from .helper_funcs import get_sample_images_for_categories, copy_to_static_dir, get_image_softmax_dict, \
    get_image_conf_dict, load_json
from .app_utils import get_form_data, load_user_data, update_current_image_index, save_user_data, \
    get_label_indices_to_label_names_dicts, save_json_data, update_current_image_index_simple, read_json_file
from class_mapping.class_loader import ClassDictionary
from .google_drive_service import GoogleDriveService
from .time_tracker_utils import get_time_tracker, initialize_time_tracker
import traceback


def convert_bboxes_to_serializable(bboxes_unprocessed, threshold):
    """Convert bbox data to a serializable format for JSON."""
    # If bboxes already has the expected structure but with numpy arrays, convert them
    if isinstance(bboxes_unprocessed, dict):
        if 'boxes' in bboxes_unprocessed:
            result = {
                'boxes': [],
                'scores': [],
                'labels': [],
                'gt': [],
                'crowd_flags': [],
                'reflected_flags': [],
                'rendition_flags': [],
                'ocr_needed_flags': [],
                'uncertain_flags': [],
                'possible_labels': [],
                'group': []
            }

            for i in range(len(bboxes_unprocessed['boxes'])):
                if bboxes_unprocessed['scores'][i] < threshold:
                    continue
                result['boxes'].append(bboxes_unprocessed['boxes'][i])
                result['scores'].append(bboxes_unprocessed['scores'][i])
                if 'labels' in bboxes_unprocessed:
                    result['labels'].append(bboxes_unprocessed['labels'][i])
                if 'gt' in bboxes_unprocessed:
                    result['gt'].append(bboxes_unprocessed['gt'][i])
                result['crowd_flags'].append(bboxes_unprocessed['crowd_flags'][i] if 'crowd_flags' in bboxes_unprocessed else False)
                result['reflected_flags'].append(bboxes_unprocessed['reflected_flags'][i] if 'reflected_flags' in bboxes_unprocessed else False)
                result['rendition_flags'].append(bboxes_unprocessed['rendition_flags'][i] if 'rendition_flags' in bboxes_unprocessed else False)
                result['ocr_needed_flags'].append(bboxes_unprocessed['ocr_needed_flags'][i] if 'ocr_needed_flags' in bboxes_unprocessed else False)
                result['uncertain_flags'].append(bboxes_unprocessed['uncertain_flags'][i] if 'uncertain_flags' in bboxes_unprocessed else False)
                result['possible_labels'].append(bboxes_unprocessed['possible_labels'][i] if 'possible_labels' in bboxes_unprocessed else [])
                result['group'].append(bboxes_unprocessed['group'][i] if 'group' in bboxes_unprocessed else None)

            return result

    return bboxes_unprocessed  # Return as is if not in expected format


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

    # Background upload management
    app.upload_threads = {}  # Dictionary to track upload threads by username
    app.upload_cancel_events = {}  # Dictionary to track cancel events by username

    def background_upload_to_drive(username):
        """
        Background function to upload user data to Google Drive.
        Runs silently without user notification and can be cancelled.
        """
        try:
            # Check if Google Drive is enabled
            if not app.config.get('GOOGLE_DRIVE_ENABLED', False):
                app.logger.debug(f"Background upload skipped for {username}: Google Drive disabled")
                return

            # Create cancel event for this upload
            cancel_event = threading.Event()
            app.upload_cancel_events[username] = cancel_event

            # Initialize Google Drive service
            drive_service = GoogleDriveService(
                app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE'),
                app.config.get('GOOGLE_DRIVE_TOKEN_FILE')
            )

            # Get user data directory
            user_data_dir = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username)

            # Get folder ID from config if specified
            folder_id = app.config.get('GOOGLE_DRIVE_FOLDER_ID')

            # Check if upload was cancelled before starting
            if cancel_event.is_set():
                app.logger.debug(f"Background upload cancelled for {username} before starting")
                return

            app.logger.debug(f"Starting background upload for {username}")

            # Upload data to Google Drive
            upload_results = drive_service.upload_user_data(username, user_data_dir, folder_id)

            # Check if upload was cancelled after completion
            if cancel_event.is_set():
                app.logger.debug(f"Background upload for {username} was cancelled but completed anyway")
                return

            if upload_results['success']:
                app.logger.debug(f"Background upload successful for {username}")
            else:
                app.logger.debug(f"Background upload failed for {username}: {upload_results['errors']}")

        except Exception as e:
            app.logger.debug(f"Background upload error for {username}: {str(e)}")
        finally:
            # Clean up
            if username in app.upload_threads:
                del app.upload_threads[username]
            if username in app.upload_cancel_events:
                del app.upload_cancel_events[username]

    def trigger_background_upload(username):
        """
        Trigger a background upload for the given username.
        Cancels any existing upload for the same user.
        """
        try:
            # Cancel any existing upload for this user
            if username in app.upload_cancel_events:
                app.upload_cancel_events[username].set()
                app.logger.debug(f"Cancelled previous upload for {username}")

            # Wait for previous thread to finish if it exists
            if username in app.upload_threads and app.upload_threads[username].is_alive():
                app.upload_threads[username].join(timeout=1.0)  # Wait max 1 second

            # Start new background upload
            upload_thread = threading.Thread(
                target=background_upload_to_drive,
                args=(username,),
                daemon=True  # Thread will die when main process dies
            )
            upload_thread.start()
            app.upload_threads[username] = upload_thread
            app.logger.debug(f"Started background upload thread for {username}")

        except Exception as e:
            app.logger.error(f"Error triggering background upload for {username}: {str(e)}")

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
            bbox_file_path = os.path.join(app.config['GT_DATA_ROOT_DIRECTORY'], 'bboxes.json')
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
        and redirects to the 'grid_image' route or sanity_check route with the username.

        Returns:
            Rendered template ('index.html') on GET request or redirection to
            'grid_image' route on POST request with the username parameter.
        """
        if request.method == 'POST':
            username = request.form.get('username')
            sanity_check_mode = request.form.get('sanityCheckMode')
            selected_mode = request.form.get('selectedMode')
            
            app.logger.info(f"Username received: {username}")
            app.logger.info(f"Sanity Check Mode: {sanity_check_mode}, Selected Mode: {selected_mode}")

            if username == 'admin':
                return redirect(url_for('compare', username=username, class_index=0))
            
            # Check if sanity check mode is enabled
            if sanity_check_mode == 'true' and selected_mode in ['1', '2']:
                return redirect(url_for('sanity_check', username=username, mode=selected_mode))
            
            return redirect(url_for('grid_image', username=username))
        else:
            return render_template('index.html')

    @app.route('/<username>/sanity_check/<mode>')
    def sanity_check(username, mode):
        """
        Renders the sanity check mode interface for evaluating model predictions.
        
        Args:
            username (str): The username of the annotator
            mode (str): Either '1' or '2' for different evaluation datasets
            
        Returns:
            Rendered template with sanity check interface
        """
        if username not in app.user_cache:
            return "No such user exists. Please check it again."

        # Determine which evaluation report to load based on mode
        if mode == '1':
            eval_file = 'evaluation_report_M-_1537.json'
        elif mode == '2':
            eval_file = 'evaluation_report_S-_1918.json'
        else:
            return "Invalid mode. Please select Mode 1 or Mode 2."

        # Load evaluation report
        eval_report_path = os.path.join(
            app.config['ANNOTATORS_ROOT_DIRECTORY'], 
            username, 
            eval_file
        )
        
        try:
            with open(eval_report_path, 'r') as f:
                evaluation_data = json.load(f)
        except FileNotFoundError:
            return f"Evaluation report not found: {eval_file}"
        except json.JSONDecodeError:
            return f"Error reading evaluation report: {eval_file}"

        # Get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        
        # Get image list
        image_list = [img for img in evaluation_data.keys() if evaluation_data[img]]
        if not image_list:
            return "No images found in evaluation report"
        
        # Load last viewed image index from separate file for this mode
        sanity_check_index_file = os.path.join(
            app.config['ANNOTATORS_ROOT_DIRECTORY'],
            username,
            f'current_image_index_sanity_{mode}_{username}.txt'
        )
        
        try:
            with open(sanity_check_index_file, 'r') as f:
                current_image_index = int(f.read().strip())
                # Validate index
                if current_image_index >= len(image_list) or current_image_index < 0:
                    current_image_index = 0
        except (FileNotFoundError, ValueError):
            current_image_index = 0
        
        # Redirect to sanity check detailed view with the last viewed index
        return redirect(url_for('sanity_check_detail', 
                              username=username, 
                              mode=mode,
                              image_index=current_image_index))

    @app.route('/<username>/sanity_check/<mode>/detail')
    def sanity_check_detail(username, mode):
        """
        Renders the detailed sanity check view with blinded predictions.
        
        Args:
            username (str): The username of the annotator
            mode (str): Either '1' or '2' for different evaluation datasets
            
        Returns:
            Rendered template with sanity check detailed view
        """
        if username not in app.user_cache:
            return "No such user exists. Please check it again."

        # Determine which evaluation report to load based on mode
        if mode == '1':
            eval_file = 'evaluation_report_M-_1537.json'
        elif mode == '2':
            eval_file = 'evaluation_report_S-_1918.json'
        else:
            return "Invalid mode. Please select Mode 1 or Mode 2."

        # Load evaluation report
        eval_report_path = os.path.join(
            app.config['ANNOTATORS_ROOT_DIRECTORY'], 
            username, 
            eval_file
        )
        
        try:
            with open(eval_report_path, 'r') as f:
                evaluation_data = json.load(f)
        except FileNotFoundError:
            return f"Evaluation report not found: {eval_file}"
        except json.JSONDecodeError:
            return f"Error reading evaluation report: {eval_file}"

        # Get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        
        # Get image list and current index
        image_list = [img for img in evaluation_data.keys() if evaluation_data[img]]  # Filter out empty entries
        if not image_list:
            return "No images found in evaluation report"
        
        # Load current image index from separate file for sanity check mode
        sanity_check_index_file = os.path.join(
            app.config['ANNOTATORS_ROOT_DIRECTORY'],
            username,
            f'current_image_index_sanity_{mode}_{username}.txt'
        )
        
        # Try to get index from URL parameter first, otherwise load from file
        current_image_index = request.args.get('image_index', None, type=int)
        if current_image_index is None:
            # Load from file
            try:
                with open(sanity_check_index_file, 'r') as f:
                    current_image_index = int(f.read().strip())
            except (FileNotFoundError, ValueError):
                current_image_index = 0
        
        # Validate and wrap index
        if current_image_index >= len(image_list):
            current_image_index = 0
        elif current_image_index < 0:
            current_image_index = len(image_list) - 1
        
        # Save the current index to file for next time
        try:
            with open(sanity_check_index_file, 'w') as f:
                f.write(str(current_image_index))
        except Exception as e:
            app.logger.error(f"Error saving sanity check index: {e}")
            
        current_image_name = image_list[current_image_index]
        current_image_data = evaluation_data[current_image_name]
        
        # Get class dict to find image path
        class_dict = ClassDictionary()
        current_gt_class = class_dict.get_val_img_class(current_image_name)
        current_class_name = label_indices_to_label_names[str(current_gt_class)]
        current_imagepath = os.path.join(current_class_name, current_image_name)
        
        # Copy image to static directory
        copy_to_static_dir([current_imagepath], 
                          app.config['ANNOTATIONS_ROOT_FOLDER'],
                          os.path.join(app.config['APP_ROOT_FOLDER'], app.config['STATIC_FOLDER'], 'images'))
        
        current_imagepath = os.path.join(app.config['STATIC_FOLDER'], 'images', current_imagepath)
        
        # Determine mode suffix for file naming: Mode 1 = 'S', Mode 2 = 'M'
        mode_suffix = 'S' if mode == '1' else 'M'
        
        # Load existing annotations from mode-specific file
        checkbox_selections = load_user_data(app, username, mode=mode_suffix)
        
        # Check for existing bboxes
        checked_categories = []
        bboxes = None
        label_type = "basic"
        
        if current_image_name in checkbox_selections:
            data = checkbox_selections[current_image_name]
            
            if isinstance(data, dict) and 'label_type' in data:
                label_type = data.get('label_type', 'basic')
                
                if 'bboxes' in data and isinstance(data['bboxes'], list) and len(data['bboxes']) > 0:
                    boxes = []
                    scores = []
                    labels = []
                    crowd_flags = []
                    reflected_flags = []
                    rendition_flags = []
                    ocr_needed_flags = []
                    uncertain_flags = []
                    possible_labels = []
                    group = []
                    checked_labels = set()
                    
                    for bbox in data['bboxes']:
                        boxes.append(bbox['coordinates'])
                        label = bbox.get('label', -1)
                        labels.append(label)
                        scores.append(100)
                        crowd_flags.append(bbox.get('crowd_flag', False))
                        reflected_flags.append(bbox.get('reflected_flag', False))
                        rendition_flags.append(bbox.get('rendition_flag', False))
                        ocr_needed_flags.append(bbox.get('ocr_needed_flag', False))
                        uncertain_flags.append(bbox.get('uncertain_flag', False))
                        possible_labels.append(bbox.get('possible_label', []))
                        group.append(bbox.get('group', None))
                        checked_labels.add(str(label))
                    
                    if label_type == "basic" and checked_labels:
                        checked_categories = [label_id for label_id in checked_labels if
                                            label_id in label_indices_to_label_names]
                    
                    bboxes = {
                        'boxes': boxes,
                        'scores': scores,
                        'labels': labels,
                        'crowd_flags': crowd_flags,
                        'reflected_flags': reflected_flags,
                        'rendition_flags': rendition_flags,
                        'ocr_needed_flags': ocr_needed_flags,
                        'uncertain_flags': uncertain_flags,
                        'possible_labels': possible_labels,
                        'group': group
                    }
        
        # If no bboxes found, create empty structure
        if bboxes is None:
            bboxes = {
                'boxes': [], 'scores': [], 'labels': [], 
                'crowd_flags': [], 'reflected_flags': [], 
                'rendition_flags': [], 'ocr_needed_flags': [],
                'uncertain_flags': [], 'possible_labels': [], 'group': []
            }
        
        # Prepare blinded predictions data
        # Create a mapping of letters to prediction keys
        prediction_keys = ['annotation_labels', 'ChatGPT_prediction', 'SigLip_2_prediction', 'ground_truth']
        letters = ['A', 'B', 'C', 'D']
        
        # Generate a deterministic random mapping based on image name (so it stays consistent)
        import random
        random.seed(hash(current_image_name) % (2**32))
        shuffled_letters = letters.copy()
        random.shuffle(shuffled_letters)
        
        # Create the mapping
        letter_mapping = {}
        for i, key in enumerate(prediction_keys):
            letter_mapping[shuffled_letters[i]] = key
        
        # Create the blinded predictions display
        blinded_predictions = {}
        for letter in ['A', 'B', 'C', 'D']:
            key = letter_mapping[letter]
            if key in current_image_data:
                class_ids = current_image_data[key]
                if not isinstance(class_ids, list):
                    class_ids = [class_ids]
                
                # Format the prediction text
                formatted_labels = []
                for class_id in class_ids:
                    if class_id == -1:
                        formatted_labels.append('-1 - [No prediction]')
                    else:
                        class_name = label_indices_to_human_readable.get(str(class_id), f'Class {class_id}')
                        formatted_labels.append(f'{class_id} - {class_name}')
                
                blinded_predictions[letter] = ', '.join(formatted_labels) if formatted_labels else '-1 - [No prediction]'
            else:
                blinded_predictions[letter] = '-1 - [No prediction]'
        
        # Render the template
        return render_template('user_label.html',
                             predicted_image=current_imagepath,
                             similar_images={},  # Empty for sanity check mode
                             username=username,
                             ground_truth_label=class_dict.get_class_name(current_gt_class),
                             ground_truth_class_index=current_gt_class,
                             checked_categories=checked_categories,
                             comments={},
                             human_readable_classes_map=label_indices_to_human_readable,
                             current_image_index=current_image_index,
                             num_similar_images=0,  # No similar images in sanity check mode
                             bboxes=bboxes,
                             image_name=[current_imagepath],
                             bboxes_source='sanity_check',
                             label_type=label_type,
                             cluster_name='Sanity Check',
                             clusters={},
                             sanity_check_mode=True,  # Flag to indicate sanity check mode
                             sanity_check_mode_number=mode,
                             blinded_predictions=blinded_predictions,
                             total_images=len(image_list))

    @app.route('/<username>/compare/<int:class_index>')
    def compare(username, class_index=None):
        annotators = ['tetyana', 'richard', 'filip', 'evita']  # TODO: remove annotators hardcoded list

        # Set current image index
        current_image_index = class_index * 50

        # get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        assert label_indices_to_label_names is not None and label_indices_to_human_readable is not None

        user_data = app.user_cache.get('tetyana')
        if any(value is None for value in user_data.values()):
            return "Error loading data."
        proposals_info = user_data['proposals_info']

        NUM_IMG_TO_FETCH = 50
        selected_indices = []
        selected_images = []
        for i in range(NUM_IMG_TO_FETCH):
            img_idx = current_image_index + i
            selected_indices.append(img_idx)
            image_data = proposals_info[selected_indices[i]]
            image_name = image_data['image_name']
            gt_class = image_data['ground_truth']
            class_name = label_indices_to_label_names[str(gt_class)]
            image_path = os.path.join(class_name, image_name)
            selected_images.append(image_path)

        copy_to_static_dir(selected_images, app.config['ANNOTATIONS_ROOT_FOLDER'],
                           os.path.join(app.config['APP_ROOT_FOLDER'], app.config['STATIC_FOLDER'], 'images'))

        bbox_data = []
        borders = []
        image_paths = {}
        for user in annotators:
            # Read bbox/checkbox selection
            checkbox_data = read_json_file(
                os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], user, f'checkbox_selections_{user}.json'), app
            )

            # Initialize bbox_data to store bounding boxes for each image
            bbox_data.append({})
            borders.append({})

            for selected_index, image_path in zip(selected_indices, selected_images):
                image_basename = os.path.basename(image_path)

                # Process bounding box data for this image
                bboxes = {'boxes': [], 'scores': [], 'labels': [], 'crowd_flags': [], 'reflected_flags': [], 'rendition_flags': [], 'ocr_needed_flags': [], 'group': []}
                if image_basename in checkbox_data:
                    data = checkbox_data[image_basename]
                    if data.get('label_type') == 'ood':
                        borders[-1][selected_index] = 'border-ood'
                    elif data.get('label_type') == 'uncertain':
                        borders[-1][selected_index] = 'border-not-sure'
                    elif len(data.get('bboxes', [])) > 1:
                        labels = set()
                        for bbox in data['bboxes']:
                            if 'label' in bbox and int(bbox['label']) not in labels:
                                if len(labels) == 0:
                                    labels.add(int(bbox['label']))
                                else:
                                    borders[-1][selected_index] = 'border-m'
                                    break
                            else:
                                borders[-1][selected_index] = 'border-uncertain'
                                labels.add('-1')  # uncertain label
                                break

                    # Extract bounding boxes from annotations
                    data = checkbox_data[image_basename]
                    if isinstance(data, dict) and 'bboxes' in data and isinstance(data['bboxes'], list):
                        for bbox in data['bboxes']:
                            if 'coordinates' in bbox:
                                bboxes['boxes'].append(bbox['coordinates'])
                                if 'label' in bbox:
                                    bboxes['labels'].append(bbox['label'])
                                else:
                                    bboxes['labels'].append(-1)  # Default label if unspecified
                                bboxes['scores'].append(100)  # Default high confidence score
                                if 'crowd_flag' in bbox:
                                    bboxes['crowd_flags'].append(bbox['crowd_flag'])
                                else:
                                    bboxes['crowd_flags'].append(False)
                                if 'reflected_flag' in bbox:
                                    bboxes['reflected_flags'].append(bbox['reflected_flag'])
                                else:
                                    bboxes['reflected_flags'].append(False)
                                if 'rendition_flag' in bbox:
                                    bboxes['rendition_flags'].append(bbox['rendition_flag'])
                                else:
                                    bboxes['rendition_flags'].append(False)
                                if 'ocr_needed_flag' in bbox:
                                    bboxes['ocr_needed_flags'].append(bbox['ocr_needed_flag'])
                                else:
                                    bboxes['ocr_needed_flags'].append(False)
                                if 'group' in bbox:
                                    bboxes['group'].append(bbox['group'])
                                else:
                                    bboxes['group'].append(None)

                bbox_data[-1][selected_index] = convert_bboxes_to_serializable(bboxes, 0)

                # Set image path
                image_paths[selected_index] = os.path.join('images', image_path)
            assert len(image_paths) == NUM_IMG_TO_FETCH

        # Get cluster name for current class
        cluster_name = app.get_cluster_name(class_index)
        print(f"Cluster name for class {class_index}: {cluster_name}")

        return render_template('compare_grid.html',
                               image_paths=image_paths,
                               bbox_data=bbox_data,
                               borders=borders,
                               users=annotators,
                               human_readable_classes_map=label_indices_to_human_readable,
                               cluster_name=cluster_name,
                               class_index=class_index)

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
            bboxes = {'boxes': [], 'scores': [], 'labels': [], 'crowd_flags': [], 'reflected_flags': [], 'rendition_flags': [], 'ocr_needed_flags': [], 'group': []}
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
                        if 'label' in bbox and int(bbox['label']) not in labels:
                            if len(labels) == 0:
                                labels.add(int(bbox['label']))
                            else:
                                borders[selected_index] = 'border-m'
                                break
                        else:
                            borders[selected_index] = 'border-uncertain'
                            labels.add('-1') # uncertain label
                            break

                # Extract bounding boxes from annotations
                data = man_annotated_bboxes_dict[image_basename]
                if isinstance(data, dict) and 'bboxes' in data and isinstance(data['bboxes'], list):
                    for bbox in data['bboxes']:
                        if 'coordinates' in bbox:
                            bboxes['boxes'].append(bbox['coordinates'])
                            if 'label' in bbox:
                                bboxes['labels'].append(bbox['label'])
                            else:
                                bboxes['labels'].append(-1)  # Default label if unspecified
                            bboxes['scores'].append(100)  # Default high confidence score
                            if 'crowd_flag' in bbox:
                                bboxes['crowd_flags'].append(bbox['crowd_flag'])
                            else:
                                bboxes['crowd_flags'].append(False)
                            if 'reflected_flag' in bbox:
                                bboxes['reflected_flags'].append(bbox['reflected_flag'])
                            else:
                                bboxes['reflected_flags'].append(False)
                            if 'rendition_flag' in bbox:
                                bboxes['rendition_flags'].append(bbox['rendition_flag'])
                            else:
                                bboxes['rendition_flags'].append(False)
                            if 'ocr_needed_flag' in bbox:
                                bboxes['ocr_needed_flags'].append(bbox['ocr_needed_flag'])
                            else:
                                bboxes['ocr_needed_flags'].append(False)
                            if 'group' in bbox:
                                bboxes['group'].append(bbox['group'])
                            else:
                                bboxes['group'].append(None)
            else:
                # print ("we go for open clip data")
                data = app.load_bbox_openclip_data(username)[image_basename]
                # print("open clip load", time.time() -tt)
                for box, label, score in zip(data['boxes'], data['gt'], data['scores']):
                    bboxes['boxes'].append(box)
                    bboxes['labels'].append(label)
                    bboxes['scores'].append(score)
                    bboxes['crowd_flags'].append(False)
                    bboxes['reflected_flags'].append(False)
                    bboxes['rendition_flags'].append(False)
                    bboxes['ocr_needed_flags'].append(False)
                    bboxes['group'].append(None)
                # Ensure at least one bbox is displayed
                bboxes = ensure_at_least_one_bbox(bboxes, threshold)


            print(bboxes)
            bbox_data[selected_index] = convert_bboxes_to_serializable(bboxes, threshold)

            # Set image path
            image_paths[selected_index] = os.path.join(app.config['STATIC_FOLDER'], 'images', image_path)

        assert len(image_paths) == len(label_indices) == NUM_IMG_TO_FETCH
        print ("time bbox", time.time() -t )

        print("bbox_data: ", bbox_data)
        t=time.time()
        # Load class_corrected_images from checkbox selection file
        class_dict = ClassDictionary()
        current_class = current_image_index // 50
        
        # Time tracking: Start class session only if class changed
        time_tracker = get_time_tracker()
        class_name = label_indices_to_human_readable.get(str(current_class), f"Class_{current_class}")
        time_tracker.start_class_session_if_changed(str(current_class), class_name)
        
        # End any active image session when returning to grid view
        if time_tracker.current_image_id:
            time_tracker.end_image_session()
        
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

        # Time tracking: Start class session only if class changed, and start image session
        time_tracker = get_time_tracker()
        class_name = label_indices_to_human_readable.get(str(current_gt_class), f"Class_{current_gt_class}")
        time_tracker.start_class_session_if_changed(str(current_gt_class), class_name)
        
        # Start tracking time spent on this specific image (simplified)
        time_tracker.start_image_session(current_image, current_image_index)

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
            checkbox_selections = load_user_data(app, username)
        except Exception as e:
            app.logger.error(f"Error loading user data for {username}: {str(e)}")
            checkbox_selections = {}

        # Get checked categories and bboxes
        checked_categories = []
        bboxes = None
        bboxes_source = None  # Track where we got the bboxes from
        label_type = "basic"  # Default label type
        threshold = app.config['THRESHOLD']

        # First try checkbox_selections (user annotated images)
        if current_image in checkbox_selections:
            data = checkbox_selections[current_image]
            print(f"Found data in checkbox_selections for {current_image}")

            # Handle new data structure with label_type
            if isinstance(data, dict) and 'label_type' in data:
                label_type = data.get('label_type', 'basic')

                # If bboxes exist in the new structure
                if 'bboxes' in data and isinstance(data['bboxes'], list) and len(data['bboxes']) > 0:
                    # Convert bboxes to the format expected by the template
                    boxes = []
                    scores = []
                    labels = []
                    crowd_flags = []
                    reflected_flags = []
                    rendition_flags = []
                    ocr_needed_flags = []
                    uncertain_flags = []
                    possible_labels = []
                    group = []

                    # Track unique labels for checked categories
                    checked_labels = set()

                    for bbox in data['bboxes']:
                        boxes.append(bbox['coordinates'])
                        label = bbox.get('label', -1)
                        labels.append(label)
                        scores.append(100)
                        crowd_flags.append(bbox.get('crowd_flag', False))
                        reflected_flags.append(bbox.get('reflected_flag', False))
                        rendition_flags.append(bbox.get('rendition_flag', False))
                        ocr_needed_flags.append(bbox.get('ocr_needed_flag', False))
                        uncertain_flags.append(bbox.get('uncertain_flag', False))
                        possible_labels.append(bbox.get('possible_label', []))
                        group.append(bbox.get('group', None))

                        # Track unique labels
                        checked_labels.add(str(label))                    # Always use bbox labels for checked categories (unless uncertain mode)
                    if label_type == "basic" and checked_labels:
                        checked_categories = [label_id for label_id in checked_labels if
                                              label_id in label_indices_to_label_names]

                    bboxes = {'boxes': boxes,
                              'scores': scores,
                              'labels': labels,
                              'crowd_flags': crowd_flags,
                              'reflected_flags': reflected_flags,
                              'rendition_flags': rendition_flags,
                              'ocr_needed_flags': ocr_needed_flags,
                              'uncertain_flags': uncertain_flags,
                              'possible_labels': possible_labels,
                              'group': group
                              }
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
                reflected_flags = []
                rendition_flags = []
                ocr_needed_flags = []
                uncertain_flags = []
                possible_labels = []
                group = []
                checked_labels = set()

                for bbox in data:
                    boxes.append(bbox['coordinates'])
                    label = bbox.get('label', -1)
                    labels.append(label)
                    scores.append(100)  # Default high confidence score
                    crowd_flags.append(bbox.get('crowd_flag', False))
                    reflected_flags.append(bbox.get('reflected_flag', False))
                    rendition_flags.append(bbox.get('rendition_flag', False))
                    ocr_needed_flags.append(bbox.get('ocr_needed_flag', False))
                    uncertain_flags.append(bbox.get('uncertain_flag', False))
                    possible_labels.append(bbox.get('possible_label', []))
                    group.append(bbox.get('group', None))

                    # Track unique labels for checked categories
                    checked_labels.add(str(label))

                # Get checked categories from unique labels
                checked_categories = [label_id for label_id in checked_labels if
                                      label_id in label_indices_to_label_names]

                bboxes = {'boxes': boxes,
                          'scores': scores,
                          'labels': labels,
                          'crowd_flags': crowd_flags,
                          'reflected_flags': reflected_flags,
                          'rendition_flags': rendition_flags,
                          'ocr_needed_flags': ocr_needed_flags,
                          'uncertain_flags': uncertain_flags,
                          'possible_labels': possible_labels,
                          'group': group
                          }
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
                bboxes['reflected_flags'] = [False for i in range(len(bboxes['boxes']))]
                bboxes['rendition_flags'] = [False for i in range(len(bboxes['boxes']))]
                bboxes['ocr_needed_flags'] = [False for i in range(len(bboxes['boxes']))]
                bboxes['labels'] = [str(gt) for gt in bboxes['gt']]
                bboxes['group'] = [None for i in range(len(bboxes['boxes']))]
                bboxes_source = 'general_bboxes'

        # If still no bboxes, create empty structure
        if bboxes is None:
            bboxes = {'boxes': [], 'scores': [], 'labels': [], 'crowd_flags': [], 'reflected_flags': [], 'rendition_flags': [], 'ocr_needed_flags': [], 'uncertain_flags': [], 'possible_labels': [], 'group': []}
            bboxes_source = 'empty'
            print(f"No bboxes found for {current_image}")

        # Ensure bboxes is properly serializable
        bboxes = convert_bboxes_to_serializable(bboxes, threshold)

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
                               comments={},
                               human_readable_classes_map=label_indices_to_human_readable,
                               current_image_index=current_image_index,
                               num_similar_images=app.config['NUM_EXAMPLES_PER_CLASS'],
                               bboxes=bboxes,
                               image_name=current_imagepath,
                               bboxes_source=bboxes_source,
                               label_type=label_type,
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

        image_paths, checkbox_values, direction = get_form_data()

        print(f"Saving grid data for user {username} with direction {direction}")

        # Get base image names only
        all_image_base_names = [os.path.basename(path) for path in image_paths.split('|')]
        checked_image_base_labels = [os.path.basename(path) for path in
                                     [temp.split('|')[1] for temp in checkbox_values]]
        checked_image_base_names = [os.path.basename(path) for path in [temp.split('|')[0] for temp in checkbox_values]]

        # Load user data
        checkbox_selections = load_user_data(app, username)
        bboxes_dict = app.load_bbox_openclip_data(username)
        man_annotated_bboxes_dict = read_json_file(
            os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
            app)

        checked_images_count = 0
        # Process each image in the grid
        for base_name in all_image_base_names:
            if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                del checkbox_selections[base_name]  # Remove all bboxes for unchecked images
                # Time tracking: Log deannotation in grid mode
                time_tracker = get_time_tracker()
                time_tracker.log_activity('grid_deannotation', {'image_name': base_name})
                continue
            if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                continue  # Skip images that are already annotated by the user

            checkbox_selections[base_name] = {}
            # Time tracking: Log annotation in grid mode
            time_tracker = get_time_tracker()
            time_tracker.log_activity('grid_annotation', {'image_name': base_name})
            
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
                {"coordinates": box, "label": bboxes_dict[base_name]['gt'][i] if 'gt' in bboxes_dict[base_name] else
                checked_image_base_labels[checked_images_count]}
                for i, (box, include) in enumerate(zip(bboxes, above_threshold)) if include
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
            elif direction == "prev":
                next_class = app.get_next_class_in_hierarchy(current_class, "prev")
            else:
                # For 'stay' direction, don't change the index
                next_class = current_class

            print(f"Next class: {next_class}")

            # Only update index if not staying
            if direction != "stay":
                if (direction == "next" and current_image_index + 5 < (current_class+1)*50) or (direction == "prev" and current_image_index - 5 >= current_class*50):
                    new_index = current_image_index + 5 if direction == "next" else current_image_index - 5
                else:
                    # Calculate new index based on class * 50
                    new_index = next_class * 50 if direction == "next" else (next_class + 1) * 50 - 1

                # Update the current image index
                app.current_image_index_dct[username] = new_index
                update_current_image_index_simple(app, username, app.current_image_index_dct, new_index)
                
                # Time tracking: Check if class changed and start new session if needed
                new_class = new_index // 50
                if new_class != current_class:
                    time_tracker = get_time_tracker()
                    label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
                    class_name = label_indices_to_human_readable.get(str(new_class), f"Class_{new_class}")
                    time_tracker.start_class_session(str(new_class), class_name)

            # Save only the checkbox_selections, leave comments unchanged
            save_user_data(app, username, checkbox_selections=checkbox_selections)

            # Trigger background upload to Google Drive if navigating (next/prev)
            if direction in ["next", "prev"]:
                trigger_background_upload(app.config.get('UPLOAD_USERNAME'))

        except Exception as e:
            app.logger.error(f"Error in save_grid function for user {username}: {e}")
            # Return JSON error for AJAX requests (when direction is 'stay')
            if direction == "stay":
                return jsonify({'success': False, 'error': 'An error occurred while saving'}), 500
            return "An error occurred"

        print(f"Time taken in save_grid: {timeit.default_timer() - start}")
        
        # Return JSON response for AJAX requests (when direction is 'stay')
        if direction == "stay":
            return jsonify({'success': True, 'message': 'Grid data saved successfully'})
        
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
        # End any active image session when returning to grid
        time_tracker = get_time_tracker()
        if time_tracker.current_image_id:
            time_tracker.end_image_session()
            
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
        image_paths, checkbox_values, direction = get_form_data()

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
        checkbox_selections = load_user_data(app, username)
        bboxes_dict = app.load_bbox_openclip_data(username)
        man_annotated_bboxes_dict = read_json_file(
            os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
            app) or {}

        checked_images_count = 0
        # Process each image in the grid
        for base_name in all_image_base_names:
            if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                del checkbox_selections[base_name]  # Remove all bboxes for unchecked images
                # Time tracking: Log deannotation in grid mode
                time_tracker = get_time_tracker()
                time_tracker.log_activity('grid_deannotation', {'image_name': base_name})
                continue
            if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                continue  # Skip images that are already annotated by the user

            checkbox_selections[base_name] = {}
            # Time tracking: Log annotation in grid mode
            time_tracker = get_time_tracker()
            time_tracker.log_activity('grid_annotation', {'image_name': base_name})
            
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
                        {"coordinates": box,
                         "label": bboxes_dict[base_name]['gt'][i] if 'gt' in bboxes_dict[base_name] else
                         checked_image_base_labels[checked_images_count]}
                        for i, (box, include) in enumerate(zip(bboxes, above_threshold)) if include
                    ]
                    checkbox_selections[base_name]['label_type'] = 'basic'
                    checked_images_count += 1

        try:
            # Get current class before updating
            current_index = app.current_image_index_dct.get(username, 0)
            current_class = current_index // 50
            
            # Update the in-memory index
            update_current_image_index_simple(app, username, app.current_image_index_dct, target_index)
            
            # Time tracking: Log class change/visit only if class actually changed
            time_tracker = get_time_tracker()
            new_class = target_index // 50
            
            if new_class != current_class:
                label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
                class_name = label_indices_to_human_readable.get(str(new_class), f"Class_{new_class}")
                time_tracker.start_class_session(str(new_class), class_name)
            
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
        image_name, checkbox_values, direction = get_form_data()

        # Extract the base image name - we only save with base_image_name as key
        base_image_name = os.path.basename(image_name)

        # Get new label_type field (default to "basic")
        label_type = request.form.get('label_type', 'basic')

        # Check for bboxes_data field
        bboxes_data = request.form.get('bboxes_data')
        bboxes = []
        if bboxes_data:
            try:
                bboxes = json.loads(bboxes_data)
                app.logger.info(f"Loaded {len(bboxes)} bboxes from form data")
                for box in bboxes['bboxes']:
                    if 'label' in box and box['label'] == -1:
                        box['label'] = '-1'  # Set label to -1 for uncertain bboxes
            except json.JSONDecodeError:
                app.logger.error(f"Invalid JSON for bboxes_data: {bboxes_data}")
                bboxes = []

        # Load and update user data
        checkbox_selections = load_user_data(app, username)

        # Create or update the image data structure
        # If there are bboxes, use those
        if bboxes:
            # Create new image data with bboxes and label type info
            image_data = {
                "bboxes": bboxes['bboxes'],
                "label_type": label_type
            }

            # Update the checkbox_selections using base_image_name as key
            checkbox_selections[base_image_name] = image_data

        # If no bboxes or selected classes, but we have checkbox values
        elif checkbox_values:
            # Convert checkbox values to bboxes
            new_bboxes = []
            for checkbox_value in checkbox_values:
                new_bbox = {
                    'coordinates': [10, 10, 50, 50],
                    'label': int(checkbox_value),
                    'crowd_flag': False,
                    'reflected_flag': False,
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
            # Only navigate if direction is explicitly set to next/prev AND it's not just a save
            should_navigate = direction in ["next", "prev"] and direction != "save"
            
            if should_navigate:
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
                
                # Time tracking: Check if class changed and start new session if needed
                new_class = new_index // 50
                if new_class != current_class:
                    time_tracker = get_time_tracker()
                    label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
                    class_name = label_indices_to_human_readable.get(str(new_class), f"Class_{new_class}")
                    time_tracker.start_class_session(str(new_class), class_name)

            # Save only the checkbox_selections, leave comments unchanged
            save_user_data(app, username, checkbox_selections=checkbox_selections)

        except Exception as e:
            app.logger.error(f"Error in save_grid function for user {username}: {e}")
            return "An error occurred"

        print(f"Time taken in save: {timeit.default_timer() - start}")
        return redirect(url_for('label_image', username=username))

    @app.route('/<username>/sanity_check/<mode>/save', methods=['POST'])
    def save_sanity_check(username, mode):
        """Save annotations for sanity check mode and navigate to next/previous image."""
        import timeit
        start = timeit.default_timer()

        # Get form data
        image_name, checkbox_values, direction = get_form_data()

        # Extract the base image name
        base_image_name = os.path.basename(image_name)

        # Get label_type field (default to "basic")
        label_type = request.form.get('label_type', 'basic')

        # Check for bboxes_data field
        bboxes_data = request.form.get('bboxes_data')
        bboxes = []
        if bboxes_data:
            try:
                bboxes = json.loads(bboxes_data)
                app.logger.info(f"Loaded {len(bboxes)} bboxes from form data")
                for box in bboxes['bboxes']:
                    if 'label' in box and box['label'] == -1:
                        box['label'] = '-1'
            except json.JSONDecodeError:
                app.logger.error(f"Invalid JSON for bboxes_data: {bboxes_data}")
                bboxes = []

        # Determine mode suffix for file naming: Mode 1 = 'S', Mode 2 = 'M'
        mode_suffix = 'S' if mode == '1' else 'M'

        # Load and update user data from mode-specific file
        checkbox_selections = load_user_data(app, username, mode=mode_suffix)

        # Create or update the image data structure
        if bboxes:
            image_data = {
                "bboxes": bboxes['bboxes'],
                "label_type": label_type
            }
            checkbox_selections[base_image_name] = image_data
        else:
            image_data = {
                "bboxes": [],
                "label_type": label_type
            }
            checkbox_selections[base_image_name] = image_data

        # Save the updated checkbox selections to mode-specific file
        save_user_data(app, username, checkbox_selections=checkbox_selections, mode=mode_suffix)

        # Get current image index and navigate
        current_image_index = int(request.form.get('current_image_index', 0))
        
        # Determine which evaluation report to load based on mode
        if mode == '1':
            eval_file = 'evaluation_report_M-_1537.json'
        else:
            eval_file = 'evaluation_report_S-_1918.json'

        eval_report_path = os.path.join(
            app.config['ANNOTATORS_ROOT_DIRECTORY'], 
            username, 
            eval_file
        )
        
        try:
            with open(eval_report_path, 'r') as f:
                evaluation_data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return "Error loading evaluation report"

        image_list = [img for img in evaluation_data.keys() if evaluation_data[img]]
        
        # Navigate based on direction
        if direction == "next":
            new_index = current_image_index + 1
            if new_index >= len(image_list):
                new_index = 0  # Wrap to beginning
        elif direction == "prev":
            new_index = current_image_index - 1
            if new_index < 0:
                new_index = len(image_list) - 1  # Wrap to end
        else:
            new_index = current_image_index

        print(f"Time taken in save_sanity_check: {timeit.default_timer() - start}")
        return redirect(url_for('sanity_check_detail', username=username, mode=mode, image_index=new_index))

    @app.route('/<username>/save_bboxes', methods=['POST'])
    def save_bboxes(username):
        """Save bounding box data via AJAX."""
        try:
            # Get the data from the request
            data = request.get_json()
            image_name = data.get('image_name')
            bboxes = data.get('bboxes', [])
            is_uncertain = False

            # Convert bbox coordinates to integers
            for bbox in bboxes:
                if 'uncertain_flag' in bbox and bbox['uncertain_flag']:
                    is_uncertain = True
                    bbox['label'] = '-1'  # Set label to -1 for uncertain bboxes
                if 'coordinates' in bbox:
                    bbox['coordinates'] = [round(coord) for coord in bbox['coordinates']]

            timestamp = data.get('timestamp', time.time())  # For debugging

            if not image_name:
                return jsonify({'error': 'Image name is required'}), 400

            # Extract base image name regardless of path
            base_image_name = os.path.basename(image_name)

            # Load existing checkbox selections
            checkbox_selections = load_user_data(app, username)

            # Check if we already have label_type info for this image
            label_type = "basic" if not is_uncertain else "uncertain"

            checkbox_selections[base_image_name] = {
                "bboxes": bboxes,
                "label_type": label_type
            }

            # Save the updated checkbox selections
            checkbox_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                         f"checkbox_selections_{username}.json")
            save_json_data(checkbox_path, checkbox_selections)

            return jsonify({'success': True, 'message': 'Bboxes saved successfully'})

        except Exception as e:
            app.logger.error(f"Error saving bboxes for user {username}: {str(e)}")
            return jsonify({'error': str(e)}), 500

    @app.route('/<username>/save_bboxes_sanity/<mode>', methods=['POST'])
    def save_bboxes_sanity(username, mode):
        """Save bounding box data via AJAX for sanity check mode."""
        try:
            # Get the data from the request
            data = request.get_json()
            image_name = data.get('image_name')
            bboxes = data.get('bboxes', [])
            is_uncertain = False

           

            # Convert bbox coordinates to integers
            for bbox in bboxes:
                if 'uncertain_flag' in bbox and bbox['uncertain_flag']:
                    is_uncertain = True
                    bbox['label'] = '-1'  # Set label to -1 for uncertain bboxes
                if 'coordinates' in bbox:
                    bbox['coordinates'] = [round(coord) for coord in bbox['coordinates']]

            timestamp = data.get('timestamp', time.time())  # For debugging

            if not image_name:
                return jsonify({'error': 'Image name is required'}), 400

            # Extract base image name regardless of path
            base_image_name = os.path.basename(image_name)

            # Determine mode suffix for file naming: Mode 1 = 'S', Mode 2 = 'M'
            mode_suffix = 'S' if mode == '1' else 'M'

            # Load existing checkbox selections from mode-specific file
            checkbox_selections = load_user_data(app, username, mode=mode_suffix)

            # Check if we already have label_type info for this image
            label_type = "basic" if not is_uncertain else "uncertain"

            checkbox_selections[base_image_name] = {
                "bboxes": bboxes,
                "label_type": label_type
            }

            # Save the updated checkbox selections to mode-specific file
            save_user_data(app, username, checkbox_selections=checkbox_selections, mode=mode_suffix)

            return jsonify({'success': True, 'message': 'Bboxes saved successfully'})

        except Exception as e:
            app.logger.error(f"Error saving bboxes for user {username} in sanity mode {mode}: {str(e)}")
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
        image_paths, checkbox_values, direction = get_form_data()

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
            checkbox_selections = load_user_data(app, username)
            bboxes_dict = app.load_bbox_openclip_data(username)
            man_annotated_bboxes_dict = read_json_file(
                os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f'checkbox_selections_{username}.json'),
                app) or {}

            checked_images_count = 0
            # Process each image in the grid
            for base_name in all_image_base_names:
                if base_name in man_annotated_bboxes_dict and base_name not in checked_image_base_names:
                    del checkbox_selections[base_name]  # Remove all bboxes for unchecked images
                    # Time tracking: Log deannotation in grid mode
                    time_tracker = get_time_tracker()
                    time_tracker.log_activity('grid_deannotation', {'image_name': base_name})
                    continue
                if base_name in man_annotated_bboxes_dict or base_name not in checked_image_base_names:
                    continue  # Skip images that are already annotated by the user

                checkbox_selections[base_name] = {}
                # Time tracking: Log annotation in grid mode
                time_tracker = get_time_tracker()
                time_tracker.log_activity('grid_annotation', {'image_name': base_name})
                
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
                            {"coordinates": box,
                             "label": bboxes_dict[base_name]['gt'][i] if 'gt' in bboxes_dict[base_name] else
                             checked_image_base_labels[checked_images_count]}
                            for i, (box, include) in enumerate(zip(bboxes, above_threshold)) if include
                        ]
                        checkbox_selections[base_name]['label_type'] = 'basic'
                        checked_images_count += 1

            # Update the in-memory index
            update_current_image_index_simple(app, username, app.current_image_index_dct, target_index)

            # Save the checkbox selections
            save_user_data(app, username, checkbox_selections=checkbox_selections)

            # Trigger background upload to Google Drive when jumping to a cluster
            trigger_background_upload(app.config.get('UPLOAD_USERNAME'))

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
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500

    # Google Drive Integration Routes
    @app.route('/upload_to_drive', methods=['POST'])
    def upload_to_drive():
        """Upload user annotation data to Google Drive."""
        try:
            # Check if Google Drive is enabled
            if not app.config.get('GOOGLE_DRIVE_ENABLED', False):
                return jsonify({'error': 'Google Drive integration is disabled'}), 400

            # Get username from config
            username = app.config.get('UPLOAD_USERNAME')
            if not username:
                return jsonify({'error': 'Username not configured'}), 400

            # Initialize Google Drive service
            drive_service = GoogleDriveService(
                app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE'),
                app.config.get('GOOGLE_DRIVE_TOKEN_FILE')
            )

            # Get user data directory
            user_data_dir = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username)

            # Get folder ID from config if specified
            folder_id = app.config.get('GOOGLE_DRIVE_FOLDER_ID')

            app.logger.info(f"Google Drive upload for user {username} started. Data directory: {user_data_dir}, Folder ID: {folder_id}")
            
            # Upload data to Google Drive
            upload_results = drive_service.upload_user_data(username, user_data_dir, folder_id)

            # Get time tracking data and upload both JSON and Google Sheet
            time_tracker = get_time_tracker()
            time_tracking_results = {'success': True, 'errors': []}
            json_upload_results = {'success': True, 'errors': []}
            
            # Always try to upload time tracking data if it exists
            if time_tracker and time_tracker.session_data:
                # Finalize the current session to ensure complete data
                time_tracker.finalize_session()
                
                # Get time tracking folder ID (same folder for both JSON and Google Sheets)
                time_tracking_folder_id = app.config.get('GOOGLE_DRIVE_TIME_TRACKING_FOLDER_ID')
                
                # Upload time tracking JSON file
                json_upload_results = drive_service.upload_time_tracking_json(
                    username,
                    time_tracker.session_data,
                    user_data_dir,
                    time_tracking_folder_id
                )
                
                # Upload time tracking data as Google Sheet (only if there are class sessions)
                if time_tracker.session_data.get('class_sessions'):
                    time_tracking_results = drive_service.create_time_tracking_sheet(
                        username, 
                        time_tracker.session_data, 
                        time_tracking_folder_id
                    )
                else:
                    app.logger.info(f"No class sessions found for user {username}, skipping Google Sheet creation")
                    time_tracking_results = {'success': True, 'message': 'No class sessions to export'}

            # Determine overall success
            overall_success = (upload_results['success'] and 
                             time_tracking_results['success'] and 
                             json_upload_results['success'])
            
            if overall_success:
                app.logger.info(f"Successfully uploaded all data for user {username} to Google Drive")
                response_data = {
                    'success': True,
                    'message': f"Successfully uploaded all data to Google Drive",
                    'uploaded_files': upload_results['uploaded_files']
                }
                
                # Add time tracking JSON info if uploaded
                if json_upload_results.get('uploaded_file'):
                    response_data['time_tracking_json'] = json_upload_results['uploaded_file']['filename']
                
                # Add Google Sheet info if created
                if time_tracking_results.get('sheet_url'):
                    response_data['time_tracking_sheet'] = time_tracking_results['sheet_url']
                elif time_tracking_results.get('message'):
                    response_data['time_tracking_note'] = time_tracking_results['message']
                    
                return jsonify(response_data)
            else:
                errors = (upload_results.get('errors', []) + 
                         time_tracking_results.get('errors', []) + 
                         json_upload_results.get('errors', []))
                app.logger.error(f"Failed to upload data for user {username}: {errors}")
                return jsonify({
                    'success': False,
                    'message': 'Upload failed',
                    'errors': errors
                }), 500

        except Exception as e:
            app.logger.error(f"Error uploading to Google Drive for user {username}: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': f'Upload failed: {str(e)}'}), 500

    @app.route('/download_from_drive', methods=['POST'])
    def download_from_drive():
        """Download user annotation data from Google Drive."""
        try:
            # Check if Google Drive is enabled
            if not app.config.get('GOOGLE_DRIVE_ENABLED', False):
                return jsonify({'error': 'Google Drive integration is disabled'}), 400

            # Get username from config
            username = app.config.get('UPLOAD_USERNAME')
            if not username:
                return jsonify({'error': 'Username not configured'}), 400

            # Initialize Google Drive service
            drive_service = GoogleDriveService(
                app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE'),
                app.config.get('GOOGLE_DRIVE_TOKEN_FILE')
            )

            # Get user data directory
            user_data_dir = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username)

            # Get folder ID from config if specified
            folder_id = app.config.get('GOOGLE_DRIVE_FOLDER_ID')

            # Download data from Google Drive
            download_results = drive_service.download_user_data(username, user_data_dir, folder_id)

            if download_results['success']:
                app.logger.info(f"Successfully downloaded data for user {username} from Google Drive")
                
                # Clear user cache to force reload with new data
                if username in app.user_cache:
                    del app.user_cache[username]
                
                # Reload current image index from file if it exists
                index_file_path = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                               f'current_image_index_{username}.txt')
                if os.path.exists(index_file_path):
                    try:
                        with open(index_file_path, 'r') as f:
                            app.current_image_index_dct[username] = int(f.read())
                    except (ValueError, FileNotFoundError):
                        app.current_image_index_dct[username] = 0
                else:
                    app.current_image_index_dct[username] = 0
                
                # Repopulate the cache with the newly downloaded data
                from app.app_utils import load_user_specific_data
                load_user_specific_data(username, app)
                
                return jsonify({
                    'success': True,
                    'message': f"Successfully downloaded file from Google Drive",
                    'downloaded_files': download_results['downloaded_files'],
                    'reload_page': True  # Signal frontend to reload
                })
            else:
                app.logger.error(f"Failed to download data for user {username}: {download_results['errors']}")
                return jsonify({
                    'success': False,
                    'message': 'Download failed',
                    'errors': download_results['errors']
                }), 500

        except Exception as e:
            app.logger.error(f"Error downloading from Google Drive for user {username}: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': f'Download failed: {str(e)}'}), 500

    @app.route('/check_drive_status', methods=['GET'])
    def check_drive_status():
        """Check if Google Drive service is available and user has data."""
        try:
            if not app.config.get('GOOGLE_DRIVE_ENABLED', False):
                return jsonify({'available': False, 'reason': 'Google Drive integration is disabled'})

            # Check if credentials file exists
            credentials_file = app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE')
            if not os.path.exists(credentials_file):
                return jsonify({
                    'available': False, 
                    'reason': 'Google Drive credentials file not found'
                })

            # Try to initialize service (this will check authentication)
            drive_service = GoogleDriveService(
                app.config.get('GOOGLE_DRIVE_CREDENTIALS_FILE'),
                app.config.get('GOOGLE_DRIVE_TOKEN_FILE')
            )
            
            # Try to authenticate to check if service is working
            drive_service.authenticate()

            return jsonify({
                'available': True,
                'message': 'Google Drive service is available'
            })

        except Exception as e:
            app.logger.error(f"Error checking Google Drive status: {str(e)}")
            return jsonify({
                'available': False,
                'reason': f'Google Drive service error: {str(e)}'
            })

    @app.route('/time_tracking_status', methods=['GET'])
    def time_tracking_status():
        """Get current time tracking status for debugging."""
        try:
            time_tracker = get_time_tracker()
            if time_tracker:
                status = {
                    'session_id': time_tracker.session_id,
                    'username': time_tracker.username,
                    'current_class_id': time_tracker.current_class_id,
                    'current_session_active': time_tracker.current_class_session is not None,
                    'current_image_id': time_tracker.current_image_id,
                    'current_image_session_active': time_tracker.current_image_id is not None,
                    'total_class_sessions': len(time_tracker.session_data.get('class_sessions', [])),
                    'session_start_time': time_tracker.session_data.get('start_time'),
                    'current_class_session': time_tracker.current_class_session,
                    'total_image_sessions': sum(len(cs.get('image_sessions', [])) for cs in time_tracker.session_data.get('class_sessions', []))
                }
                return jsonify(status)
            else:
                return jsonify({'error': 'No time tracker initialized'}), 404
        except Exception as e:
            return jsonify({'error': str(e)}), 500