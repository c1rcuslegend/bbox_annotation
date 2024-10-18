import os
import shutil
import random
import numpy as np
import json


def read_json_file(file_path, app):
    try:
        with open(file_path, 'r') as file:
            return json.load(file)
    except FileNotFoundError:
        app.logger.error(f"File not found: {file_path}")
        return None


def get_image_softmax_dict(proposals_info):
    image_softmax_dict = {}
    for info in proposals_info:
        image_name = info['image_name']
        softmax_vector = info['softmax_val']
        softmax_indices = np.argsort(softmax_vector)[::-1]
        image_softmax_dict[image_name] = softmax_indices
    return image_softmax_dict


def get_sample_images_for_categories(top_categories, all_sample_images, indices_to_class_names, num_selection=10):
    """
    Returns a dictionary of sample images for each of the top categories.

    Args:
    - top_categories: a list of length top-k containing the human-readable names of the top predictions

    Returns:
    - a dictionary with top-k lists of randomly sampled images for each of the top categories
    """
    sample_images = dict()
    for category in top_categories:
        sample_images[category] = get_sample_image_for_category(category, all_sample_images,
                                                                indices_to_class_names, num_selection=num_selection)
    return sample_images


def get_sample_image_for_category_orig(category, all_sample_images, indices_to_class_names, num_selection):
    """
    Returns a list of sample images for a given category.

    Args:
    - category: an integer representing the index of the category
    - all_sample_images: a pandas dataframe containing information on all the sample images
    - imagenet_classes: a dictionary mapping class indices to wordnet ids and human-readable names
    - num_selection: the number of sample images to return

    Returns:
    - a list of length num_selection containing the sample images for the given category
    """

    # slice the dataframe to get the sample images for the category
    sample_images = all_sample_images[all_sample_images["TrueLabels"] == category]
    # Shuffle and sample num_selection images
    sample_images = sample_images.sample(frac=1).reset_index(drop=True)
    sample_images = sample_images[:num_selection]
    # Get the image paths
    selected_images_per_category = []

    for idx, row in sample_images.iterrows():
        class_name = indices_to_class_names[row["TrueLabels"]]
        imagefile = os.path.join(class_name, row.ImageNames)
        selected_images_per_category.append(imagefile)

    # Return the first num_selection sample images
    return selected_images_per_category


def get_sample_image_for_category(category, all_sample_images, indices_to_class_names, num_selection):
    """
    Returns a list of sample images for a given category.

    Args:
    - category: an integer representing the index of the category
    - all_sample_images: a list of dictionaries containing image_name and ground truth label
    - imagenet_classes: a dictionary mapping class indices to wordnet ids and human-readable names
    - num_selection: the number of sample images to return

    Returns:
    - a list of length num_selection containing the sample images for the given category
    """

    # slice the dataframe to get the sample images for the category
    sample_images = [elem for elem in all_sample_images if elem['ground_truth'] == category]

    # Shuffle and sample num_selection images
    random.shuffle(sample_images)
    sample_images = sample_images[:num_selection]
    # Get the image paths
    selected_image_filenames = []

    for elem in sample_images:
        ground_truth = elem['ground_truth']
        class_name = indices_to_class_names[str(ground_truth)]
        imagefile = os.path.join(class_name, elem['image_name'])
        selected_image_filenames.append(imagefile)

    # Return the first num_selection sample images
    return selected_image_filenames


# Copy to static directory
def copy_to_static_dir(images, src_rootdir, static_dir):
    if isinstance(images, dict):
        for _, filepaths in images.items():
            for filepath in filepaths:
                dest_file = os.path.join(static_dir, filepath)
                src_file = os.path.join(src_rootdir, filepath)
                # ensure the destination directories exist
                os.makedirs(os.path.dirname(dest_file), exist_ok=True)
                shutil.copy(src_file, dest_file)
    elif isinstance(images, list):
        for filepath in images:
            dest_file = os.path.join(static_dir, filepath)
            src_file = os.path.join(src_rootdir, filepath)
            os.makedirs(os.path.dirname(dest_file), exist_ok=True)
            shutil.copy(src_file, dest_file)
    else:
        raise ValueError("Invalid image type! images must be either a dictionary or a list")
