import os

import numpy as np


class ClassDictionary:
    """
    Class to manage and retrieve class names from files containing ImageNet class data.

    Attributes:
        filename (str): The path to the file containing class-name mapping for ImageNet2012.
        filename_21k (str): The path to the file containing the class mapping from ImageNet21k to ImageNet2012.
        class2name (dict): A dictionary to store the class data for ImageNet2012.
        class2short_class (dict): A dictionary to store the class data for ImageNet21k.
    """
    def __init__(self, filename: str = 'imagenet2012_classes.npy', custom_cls_filename='class_names_mod_v2.npy',
                 filename_21k: str = 'imagenet21k_classes.npy', filename_21k_r: str = 'imagenet21k_classes_r.npy',
                 filename_val_class: str = 'val_img_classes_pairs.npy'):
        current_dir = os.path.dirname(__file__)
        self.filename: str = os.path.join(current_dir, filename)
        self.custom_cls_filename: str = os.path.join(current_dir, '../data/class_names', custom_cls_filename)
        self.filename_21k: str = os.path.join(current_dir, filename_21k)
        self.filename_21k_r: str = os.path.join(current_dir, filename_21k_r)
        self.filename_val_class: str = os.path.join(current_dir, filename_val_class)
        self.class2name: dict[int, list[str]] = {}
        self.class2custom_name = None
        self.class2short_class: dict[str, int] = {}
        self.class2short_class_r: dict[int, str] = {}
        self.val2short_class: dict[str, int] = {}
        self._data_loaded: bool = False
        self._custom_data_loaded: bool = False
        self._data_21k_loaded: bool = False
        self._data_21k_r_loaded: bool = False
        self._val_class_loaded: bool = False

    def __load_class2name_mapping(self):
        """Loads class data from the file into the class2name dictionary."""
        try:
            self.class2name = np.load(self.filename, allow_pickle=True).item()
            self._data_loaded = True
        except FileNotFoundError:
            print(f"Error: The file '{self.filename}' was not found.")
            self._data_loaded = False
        except ValueError:
            print(f"Error: The file '{self.filename}' contains invalid data.")
            self._data_loaded = False
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            self._data_loaded = False

    def __load_class2custom_name_mapping(self):
        """Loads class data from the file into the class2custom_name dictionary."""
        try:
            self.class2custom_name = np.load(self.custom_cls_filename)
            self._custom_data_loaded = True
        except FileNotFoundError:
            print(f"Error: The file '{self.custom_cls_filename}' was not found.")
            self._data_loaded = False
        except ValueError:
            print(f"Error: The file '{self.custom_cls_filename}' contains invalid data.")
            self._data_loaded = False
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            self._custom_data_loaded = False

    def __load_class2short_class_mapping(self):
        """Loads class data from the file into the class2short_class dictionary."""
        try:
            self.class2short_class = np.load(self.filename_21k, allow_pickle=True).item()
            self._data_21k_loaded = True
        except FileNotFoundError:
            print(f"Error: The file '{self.filename_21k}' was not found.")
            self._data_21k_loaded = False
        except ValueError:
            print(f"Error: The file '{self.filename_21k}' contains invalid data.")
            self._data_21k_loaded = False
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            self._data_21k_loaded = False

    def __load_class2short_class_r_mapping(self):
        """Loads numeric class data from the file into the class2short_class dictionary."""
        try:
            self.class2short_class_r = np.load(self.filename_21k_r, allow_pickle=True).item()
            self._data_21k_r_loaded = True
        except FileNotFoundError:
            print(f"Error: The file '{self.filename_21k_r}' was not found.")
            self._data_21k_r_loaded = False
        except ValueError:
            print(f"Error: The file '{self.filename_21k_r}' contains invalid data.")
            self._data_21k_r_loaded = False
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            self._data_21k_r_loaded = False

    def __load_val2short_class_mapping(self):
        """Loads validation images data from the file into the val2short_class dictionary."""
        try:
            self.val2short_class = np.load(self.filename_val_class, allow_pickle=True).item()
            self._val_class_loaded = True
        except FileNotFoundError:
            print(f"Error: The file '{self.filename_val_class}' was not found.")
            self._val_class_loaded = False
        except ValueError:
            print(f"Error: The file '{self.filename_val_class}' contains invalid data.")
            self._val_class_loaded = False
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            self._val_class_loaded = False

    def get_class_name(self, key: int) -> list[str] | None:
        """
        Retrieves the class names associated with a given key.

        Args:
            key (int): The key for which to retrieve class names.

        Returns:
            list[str] | None: A list of class names if the key exists, None otherwise.
        """
        if not self._data_loaded:
            self.__load_class2name_mapping()
        return self.class2name.get(key)

    def get_custom_class_name(self, key: int) -> str | None:
        """
        Retrieves the custom class names associated with a given key.

        Args:
            key (int): The key for which to retrieve class names.

        Returns:
            str | None: A class name if the key exists, None otherwise.
        """
        if not self._custom_data_loaded:
            self.__load_class2custom_name_mapping()
        return self.class2custom_name[key]

    def get_class_1k(self, key: str) -> int | None:
        """
        Retrieves the class names associated with a given key from the ImageNet21k file.

        Args:
            key (str): The key for which to perform mapping.

        Returns:
            int | None: class label in imagenet2012 if the key exists, None otherwise.
        """
        if not self._data_21k_loaded:
            self.__load_class2short_class_mapping()
        return self.class2short_class.get(key)

    def get_class_1k_r(self, key: int) -> str | None:
        """
        Retrieves the numeric class names associated with a given key from the ImageNet21k file.

        Args:
            key (int): The key for which to perform mapping.

        Returns:
            str | None: class label in imagenet21k if the key exists, None otherwise.
        """
        if not self._data_21k_r_loaded:
            self.__load_class2short_class_r_mapping()
        return self.class2short_class_r.get(key)

    def get_val_img_class(self, key: str) -> str | None:
        """
        Retrieves the numeric class names associated with a given image key from the ImageNet21k file.

        Args:
            key (str): The validation split image id.

        Returns:
            str | None: class label in imagenet21k if the key exists, None otherwise.
        """
        if not self._val_class_loaded:
            self.__load_val2short_class_mapping()
        return self.val2short_class.get(key)

    def create_cls_name_dict(self, class_names):
        return {idx: cls for idx, cls in enumerate(class_names)}

    def create_im_to_orig(self, class_list):
        return {cls: idx for idx, cls in enumerate(class_list)}
