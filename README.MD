# Multilabelfy - Flask App

This repository hosts the **Multilabelfy** Flask application, a simple tool for enhancing the label quality of single-label datasets that are arguably multi-label. The app is specifically designed to streamline the annotation process for computer vision datasets, providing an intuitive web interface for annotators/researchers to efficiently review and refine image labels.

![Multilabelfy Interface](assets/images/multi_label_website.png)

## USE CASE: ImageNetV2 Label Enhancement

Multilabelfy was used in the re-annotation process of **ImageNetV2**. The figure below illustrates the framework used for enhancing the label quality of ImageNetV2, leveraging human-machine interactions for dataset quality enhancement.

![ImageNetV2 Label Enhancement](assets/images/framework_overview.png)

For more details on how this framework was applied to ImageNetV2 and to cite the work, please refer to the following paper:
## Citation

```bibtex
@InProceedings{10.1007/978-3-031-53827-8_27,
  author    = "Anzaku, Esla Timothy and Hong, Hyesoo and Park, Jin-Woo and Yang, Wonjun and Kim, Kangmin and Won, JongBum and Herath, Deshika Vinoshani Kumari and Van Messem, Arnout and De Neve, Wesley",
  editor    = "Choi, Bong Jun and Singh, Dhananjay and Tiwary, Uma Shanker and Chung, Wan-Young",
  title     = "Leveraging Human-Machine Interactions for Computer Vision Dataset Quality Enhancement",
  booktitle = "Intelligent Human Computer Interaction",
  year      = "2024",
  publisher = "Springer Nature Switzerland",
  address   = "Cham",
  pages     = "295--309",
  isbn      = "978-3-031-53827-8"
}
```

## Key Features
- **Light-weight**.
- **Efficient Annotation**: Supports multi-label annotation with a user-friendly interface.
- **Automated Label Proposals**: Integrates machine-generated label suggestions for rapid annotation.
- **Click-to-view**: Allows the view of images in full resolution after clicking on them.
- **Easy Navigation**: Supports easy navigation between images using the arrow keys.
- **Displays Example Images**: This allows annotators quickly decide whether the proposed labels are valid or not.
- **Auto Save**: Automatically saves the annotations to a JSON file after a checkbox or navigation arrow is clicked.

## Setup

1. Clone the repository.
2. Ensure that the variables in the `config.py` file are set according to your paths and dataset.
3. Ensure that all required files are available in the right directories.
4. Run the Flask app to launch the web interface and start annotating.

## How to Run

```bash
# Install dependencies
pip install -r requirements.txt

# Run the Flask app
python run.py
```