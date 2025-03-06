import os

from flask import render_template, request, redirect, url_for, send_from_directory
from .helper_funcs import get_sample_images_for_categories, copy_to_static_dir, get_image_softmax_dict, read_json_file
from .app_utils import get_form_data, load_user_data, update_current_image_index, save_user_data, \
    get_label_indices_to_label_names_dicts, update_current_image_index_simple


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
        print(current_image_index)

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

        checkbox_selections_file = os.path.join(app.config['ANNOTATORS_ROOT_DIRECTORY'], username,
                                                f"checkbox_selections_{username}.json")
        checkbox_selections = read_json_file(checkbox_selections_file, app) or {}

        checked_labels = {}
        image_paths = {}
        for selected_index, image_path in zip(selected_indices, selected_images):
            checked_labels[selected_index] = checkbox_selections[image_path] if image_path in checkbox_selections else []
            image_paths[selected_index] = os.path.join(app.config['STATIC_FOLDER'], 'images', image_path)
        assert len(image_paths) == len(label_indices) == len(checked_labels) == NUM_IMG_TO_FETCH

        return render_template('img_grid.html',
                               image_paths=image_paths,
                               label_indices=label_indices,
                               checked_labels=checked_labels,
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
        current_image_index = request.args.get('image_index')
        if current_image_index is None:
            current_image_index = app.current_image_index_dct.get(username, 0)
        else:
            try:
                current_image_index = int(current_image_index)
                update_current_image_index_simple(app, username, app.current_image_index_dct, current_image_index)
            except ValueError:
                current_image_index = 0

        print(f"label_image: {current_image_index}")

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

    @app.route('/<username>/save_grid', methods=['POST'])
    def save_grid(username):
        import timeit
        start = timeit.default_timer()

        image_paths, checkbox_values, direction, _ = get_form_data()
        image_names = image_paths.split('|')
        image_names = list(map( lambda x: x.lstrip('static/images/'), image_names))

        selected_images = {}
        for checkbox in checkbox_values:
            selected_image, label_index = checkbox.split('|')
            selected_images[selected_image] = label_index

        label_indices_to_label_names, _ = get_label_indices_to_label_names_dicts(app)
        _, checkbox_selections = load_user_data(app, username)

        for image_name in image_names:
            if image_name in selected_images:
                if image_name in checkbox_selections:
                    if selected_images[image_name] not in checkbox_selections[image_name]:
                        checkbox_selections[image_name].append(selected_images[image_name])
                else:
                    checkbox_selections[image_name] = [selected_images[image_name]]
            else:
                if image_name in checkbox_selections:
                    for label_index in checkbox_selections[image_name]:
                        if label_indices_to_label_names[label_index] == image_name.split('/')[0]:
                            checkbox_selections[image_name].remove(label_index)
                            break
                    if len(checkbox_selections[image_name]) == 0:
                        del checkbox_selections[image_name]

        try:
            total_num_predictions = app.num_predictions_per_user[username]
            update_current_image_index(app, username, direction, total_num_predictions, app.current_image_index_dct, step=5)
            save_user_data(app, username, checkbox_selections=checkbox_selections)
        except Exception as e:
            app.logger.error(f"Error in save function for user {username}: {e}")
            return "An error occurred"
        print(f"Time taken in save: {timeit.default_timer() - start}")

        return redirect(url_for('grid_image', username=username))

    @app.route('/review/<username>', methods=['POST'])
    def review(username):
        image_path = request.form.get('image')
        image_index = request.form.get("image_index")
        print(f"User is reviewing image: {image_path}")
        return redirect(url_for('label_image', username=username, image_path=image_path, image_index=image_index))

    @app.route('/back2grid/<username>', methods=['POST'])
    def back2grid(username):
        image_index = request.form.get("image_index")
        print(f"User image index: {image_index}")
        return redirect(url_for('grid_image', username=username, image_index=image_index))

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
