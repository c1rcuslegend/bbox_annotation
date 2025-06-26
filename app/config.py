# config.py
import os

USERNAME = "c1rcuslegend"

# App Port to run on
PORT_NUMBER = 9000
APP_ROOT_FOLDER = os.path.join(os.getcwd(), 'app')

# Static folder
STATIC_FOLDER = 'static'

# Allowed extensions
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'JPEG', 'png', 'webp', 'avif'}

# Root directories containing the annotator directories and ground truth data respectively.
# Each annotator directory must be named after the annotator's username and should contain:
# Gt data shoul contain: A file named predictions_<username>.json and sample_images_info.json
ANNOTATORS_ROOT_DIRECTORY = os.path.join(APP_ROOT_FOLDER, "demo_data", "annotator_dirs")
GT_DATA_ROOT_DIRECTORY = os.path.join(APP_ROOT_FOLDER, "gt_data")

# THRESHOLD for the bounding boxes
THRESHOLD = 50

USER_PATHS = {
    "gonikisgo": {
        "ANNOTATIONS_ROOT_FOLDER": "/Users/gonikisgo/Desktop/val",
        "EXAMPLES_DATASET_ROOT_DIR": "/Users/gonikisgo/Desktop/val"
    },
    "c1rcuslegend": {
        "ANNOTATIONS_ROOT_FOLDER": "D:\\imagenet_val",
        "EXAMPLES_DATASET_ROOT_DIR": "D:\\imagenet_val"
    },
    "tetiana": {
        "ANNOTATIONS_ROOT_FOLDER": "./imagenet_val",
        "EXAMPLES_DATASET_ROOT_DIR": "./imagenet_val"
    }
}

if USERNAME in USER_PATHS:
    # The dataset were the examples for each proposed class label are taken from
    # Folder names in EXAMPLES_DATASET_ROOT_DIR and ANNOTATIONS_ROOT_FOLDER must match.
    # For the demo, we use the ImageNet Validation set. The class names are in WordNet IDs.
    EXAMPLES_DATASET_ROOT_DIR = USER_PATHS[USERNAME]["EXAMPLES_DATASET_ROOT_DIR"]

    # Annotations root folder
    ANNOTATIONS_ROOT_FOLDER = USER_PATHS[USERNAME]["ANNOTATIONS_ROOT_FOLDER"]
else:
    raise ValueError(f"Unknown username: {USERNAME}. Please define it in USER_PATHS.")

# Number of per class examples shown to the user
NUM_EXAMPLES_PER_CLASS = 5

# Dataset classes
NUM_CLASSES = 1000

# Provide the JSON file that maps class indices (integers) to their corresponding class names
LABEL_INDICES_TO_LABEL_NAMES_JSONFILE = f"./required_files/imagenet_v2/label_indices_to_wordnet_ids.json"

# A variable to check if the directory names in the dataset are human-readable (HR) or not. If not, a file containing
# the mapping from label index to human-readable labels is required. Keys are the label indices and values are the
# human-readable labels as strings.
ARE_LABELS_HUMAN_READABLE = False

# Provide the JSON file that maps class indices (integers) to their corresponding human-readable class names.
# This is necessary because some datasets, like ImageNet, use identifier names (e.g., WordNet IDs)
# that differ from human-readable class names.
# JSON Example:
# {
#   0: "tench, Tinca tinca",
#   1: "goldfish, Carassius auratus",
#   2: "great white shark, white shark, man-eater, man-eating shark, Carcharodon carcharias"
# }
# If your dataset class names are already in the human-readable format, simply set ARE_LABELS_HUMAN_READABLE to True.
# That way, you do not need to provide any link below and set this to an empty string
LABEL_INDICES_TO_HR_JSONFILE = f"./required_files/imagenet_v2/label_indices_to_full_synonyms.json"
