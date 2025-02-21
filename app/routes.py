import os
from flask import render_template, request, redirect, url_for, send_from_directory
from .helper_funcs import get_sample_images_for_categories, copy_to_static_dir, get_image_softmax_dict, read_json_file
from .app_utils import get_form_data, load_user_data, update_current_image_index, save_user_data, \
    get_label_indices_to_label_names_dicts


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
        # dataset_classes = user_data['imagenet_classes']
        app.num_predictions_per_user[username] = user_data['num_predictions']

        # get class names and mappings
        label_indices_to_label_names, label_indices_to_human_readable = get_label_indices_to_label_names_dicts(app)
        # assert both are not None
        assert label_indices_to_label_names is not None and label_indices_to_human_readable is not None

        image_softmax_dict = get_image_softmax_dict(proposals_info)

        # Set current image index
        current_image_index = app.current_image_index_dct.get(username, 0)
        print(current_image_index)
        print(proposals_info)
        print(len(proposals_info))
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

        checkbox_selections_file = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                                f"checkbox_selections_{username}.json")
        comments_file = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username, f"comments_{username}.json")

        checkbox_selections = read_json_file(checkbox_selections_file, app) or {}
        comments_json = read_json_file(comments_file, app) or {}

        comments = comments_json.get(current_imagepath[0].lstrip('static/images'), '')
        checked_categories = checkbox_selections.get(current_imagepath[0].lstrip('static/images'), [])

        return render_template('user_label.html',
                               predicted_image=current_imagepath[0],
                               similar_images=similar_images,
                               username=username,
                               checked_categories=checked_categories,
                               comments=comments,
                               human_readable_classes_map=label_indices_to_human_readable,
                               current_image_index=current_image_index,
                               num_similar_images=app.config['NUM_EXAMPLES_PER_CLASS'])

    @app.route('/<username>/save', methods=['POST'])
    def save(username):
        import timeit
        start = timeit.default_timer()
        image_name, checkbox_values, direction, comments = get_form_data()

        comments_json, checkbox_selections = load_user_data(app, username)

        comments_json[image_name] = comments
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
