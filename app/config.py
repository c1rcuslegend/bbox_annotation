# config.py
import os

# App Port to run on
PORT_NUMBER = 9000
APP_ROOT_FOLDER = os.path.join(os.getcwd(), 'app')

# Static folder
STATIC_FOLDER = 'static'

# Allowed extensions
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'JPEG', 'png', 'webp', 'avif'}

# Root directory containing the annotator directories
# Each annotator directory must be named after the annotator's username and should contain:
# A file named predictions_<username>.json and sample_images_info.json
ANNOTATORS_ROOT_DIRECTORY = os.path.join(APP_ROOT_FOLDER, "demo_data", "annotator_dirs")

# THRESHOLD for the bounding boxes
THRESHOLD = 0.5

# Annotations root folder
# For this demo, it would be the root directory of the ImageNetV2 dataset. Class names should be in wordnet IDs.
#ANNOTATIONS_ROOT_FOLDER = "/media/esla/nvme1/dataset/imagenet/external/imagenetv2_matched_frequency_wordnetIDs"
ANNOTATIONS_ROOT_FOLDER = "D:\imagenet_val"

# Number of per class examples shown to the user
NUM_EXAMPLES_PER_CLASS = 1

# Dataset classes
NUM_CLASSES = 1000

# The dataset were the examples for each proposed class label are taken from
# Folder names in EXAMPLES_DATASET_ROOT_DIR and ANNOTATIONS_ROOT_FOLDER must match.
# For the demo, we use the ImageNet Validation set. The class names are in WordNet IDs.
#EXAMPLES_DATASET_ROOT_DIR = "/media/esla/nvme1/dataset/imagenet/full/val"
EXAMPLES_DATASET_ROOT_DIR = "D:\imagenet_val"

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
