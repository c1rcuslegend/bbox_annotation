/**
 * Class Jump functionality - Searchable dropdown for jumping to specific classes
 */

// Initialize the searchable dropdown when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Create and initialize the searchable dropdown
    initSearchableDropdown();

    // Initialize the image index search functionality
    initImageIndexSearch();

    // Initialize the cluster dropdown functionality
    initClusterDropdown();
});

// Initialize searchable dropdown component
function initSearchableDropdown() {
    const container = document.querySelector('.class-dropdown');
    if (!container) return;

    // Get the original select element
    const originalSelect = document.getElementById('classJump');
    if (!originalSelect) return;

    // Create custom dropdown elements
    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';

    // Create the search input that looks like a dropdown
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'select-search';
    searchInput.placeholder = 'Search or select a class...';
    searchInput.autocomplete = 'off';

    // Create dropdown icon
    const dropdownIcon = document.createElement('div');
    dropdownIcon.className = 'dropdown-icon';
    dropdownIcon.innerHTML = '▼';

    // Create dropdown options container
    const dropdownOptions = document.createElement('div');
    dropdownOptions.className = 'select-options';

    // Add elements to the DOM
    customSelect.appendChild(searchInput);
    customSelect.appendChild(dropdownIcon);
    customSelect.appendChild(dropdownOptions);

    // Replace the original select with our custom one
    originalSelect.style.display = 'none';
    container.insertBefore(customSelect, originalSelect);

    // Populate options from the original select
    const options = originalSelect.options;
    for (let i = 0; i < options.length; i++) {
        const option = document.createElement('div');
        option.className = 'select-option';
        option.dataset.value = options[i].value;
        option.textContent = options[i].textContent;
        dropdownOptions.appendChild(option);

        // Add click handler for each option
        option.addEventListener('click', function() {
            searchInput.value = this.textContent;
            originalSelect.value = this.dataset.value;
            dropdownOptions.classList.remove('show');

            // Trigger jump if a class was selected
            if (this.dataset.value) {
                jumpToClass(this.dataset.value);
            }
        });
    }

    // Show options on input focus or dropdown icon click
    searchInput.addEventListener('focus', function() {
        dropdownOptions.classList.add('show');
    });

    dropdownIcon.addEventListener('click', function() {
        dropdownOptions.classList.toggle('show');
        if (dropdownOptions.classList.contains('show')) {
            searchInput.focus();
        }
    });

    // Filter options on input
    searchInput.addEventListener('input', function() {
        const filter = this.value.toLowerCase();
        const options = dropdownOptions.querySelectorAll('.select-option');

        let anyVisible = false;
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            const value = option.dataset.value;

            if (text.includes(filter) || (value && value.includes(filter))) {
                option.style.display = '';
                anyVisible = true;
            } else {
                option.style.display = 'none';
            }
        });

        // If no options match, show a message
        let noResultsMsg = dropdownOptions.querySelector('.no-results');
        if (!anyVisible) {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-results';
                noResultsMsg.textContent = 'No matching classes found';
                dropdownOptions.appendChild(noResultsMsg);
            }
            noResultsMsg.style.display = '';
        } else if (noResultsMsg) {
            noResultsMsg.style.display = 'none';
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!customSelect.contains(e.target)) {
            dropdownOptions.classList.remove('show');
        }
    });

    // Handle keyboard navigation
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            // Get the first visible option
            const visibleOption = dropdownOptions.querySelector('.select-option:not([style*="display: none"])');
            if (visibleOption) {
                visibleOption.click();
            }
        } else if (e.key === 'Escape') {
            dropdownOptions.classList.remove('show');
        }
    });
}

// Function to initialize the cluster dropdown
function initClusterDropdown() {
    const container = document.querySelector('.cluster-dropdown');
    if (!container) return;

    // Get the original select element
    const originalSelect = document.getElementById('clusterJump');
    if (!originalSelect) return;

    // Create custom dropdown elements
    const customSelect = document.createElement('div');
    customSelect.className = 'custom-select';

    // Create the search input that looks like a dropdown
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'select-search';
    searchInput.placeholder = 'Search or select a cluster...';
    searchInput.autocomplete = 'off';

    // Create dropdown icon
    const dropdownIcon = document.createElement('div');
    dropdownIcon.className = 'dropdown-icon';
    dropdownIcon.innerHTML = '▼';

    // Create dropdown options container
    const dropdownOptions = document.createElement('div');
    dropdownOptions.className = 'select-options';

    // Add elements to the DOM
    customSelect.appendChild(searchInput);
    customSelect.appendChild(dropdownIcon);
    customSelect.appendChild(dropdownOptions);

    // Replace the original select with our custom one
    originalSelect.style.display = 'none';
    container.insertBefore(customSelect, originalSelect);

    // Populate options from the original select
    const options = originalSelect.options;
    for (let i = 0; i < options.length; i++) {
        const option = document.createElement('div');
        option.className = 'select-option';
        option.dataset.value = options[i].value;
        option.textContent = options[i].textContent;
        dropdownOptions.appendChild(option);

        // Add click handler for each option
        option.addEventListener('click', function() {
            searchInput.value = this.textContent;
            originalSelect.value = this.dataset.value;
            dropdownOptions.classList.remove('show');

            // Trigger jump if a cluster was selected
            if (this.dataset.value) {
                jumpToCluster(this.dataset.value);
            }
        });
    }

    // Show options on input focus or dropdown icon click
    searchInput.addEventListener('focus', function() {
        dropdownOptions.classList.add('show');
    });

    dropdownIcon.addEventListener('click', function() {
        dropdownOptions.classList.toggle('show');
        if (dropdownOptions.classList.contains('show')) {
            searchInput.focus();
        }
    });

    // Filter options on input
    searchInput.addEventListener('input', function() {
        const filter = this.value.toLowerCase();
        const options = dropdownOptions.querySelectorAll('.select-option');

        let anyVisible = false;
        options.forEach(option => {
            const text = option.textContent.toLowerCase();
            const value = option.dataset.value;

            if (text.includes(filter) || (value && value.includes(filter))) {
                option.style.display = '';
                anyVisible = true;
            } else {
                option.style.display = 'none';
            }
        });

        // If no options match, show a message
        let noResultsMsg = dropdownOptions.querySelector('.no-results');
        if (!anyVisible) {
            if (!noResultsMsg) {
                noResultsMsg = document.createElement('div');
                noResultsMsg.className = 'no-results';
                noResultsMsg.textContent = 'No matching clusters found';
                dropdownOptions.appendChild(noResultsMsg);
            }
            noResultsMsg.style.display = '';
        } else if (noResultsMsg) {
            noResultsMsg.style.display = 'none';
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!customSelect.contains(e.target)) {
            dropdownOptions.classList.remove('show');
        }
    });

    // Handle keyboard navigation
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            // Get the first visible option
            const visibleOption = dropdownOptions.querySelector('.select-option:not([style*="display: none"])');
            if (visibleOption) {
                visibleOption.click();
            }
        } else if (e.key === 'Escape') {
            dropdownOptions.classList.remove('show');
        }
    });
}

// Function to initialize the image index search functionality
function initImageIndexSearch() {
    const searchInput = document.querySelector('.search-input');
    if (!searchInput) return;

    // Add event listener for Enter key press
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const indexValue = searchInput.value.trim();

            // Check if the input is a valid number
            if (indexValue && !isNaN(indexValue)) {
                jumpToImageIndex(parseInt(indexValue));
            } else {
                alert('Please enter a valid image index number.');
            }
        }
    });
}

// Function to jump to a specific image index
function jumpToImageIndex(targetIndex) {
    if (targetIndex < 0 || targetIndex > 49999) {
        alert('Please enter a valid image index between 0 and 49999.');
        return;
    }

    // Re-use the jump form from jumpToClass function
    const form = document.getElementById('jumpForm');

    // Clear existing hidden inputs
    while (form.firstChild) {
        form.removeChild(form.firstChild);
    }

    // Add the target index as a hidden input
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = 'image_index';
    hiddenInput.value = targetIndex;
    form.appendChild(hiddenInput);

    // Add image paths hidden input
    const imagePathsInput = document.createElement('input');
    imagePathsInput.type = 'hidden';
    imagePathsInput.name = 'image_name';
    imagePathsInput.value = document.querySelector('input[name="image_name"]').value;
    form.appendChild(imagePathsInput);

    // Add direction hidden input
    const directionInput = document.createElement('input');
    directionInput.type = 'hidden';
    directionInput.name = 'direction';
    directionInput.value = 'jump';
    form.appendChild(directionInput);

    // Gather all checked checkboxes and copy their values to the jump form
    const checkboxes = document.querySelectorAll('input[form="save"][name="checkboxes"]:checked');
    checkboxes.forEach((checkbox) => {
        const hiddenCheckbox = document.createElement('input');
        hiddenCheckbox.type = 'hidden';
        hiddenCheckbox.name = 'checkboxes';
        hiddenCheckbox.value = checkbox.value;
        form.appendChild(hiddenCheckbox);
    });

    // Submit the form to update the server-side index
    form.submit();
}

// Function to handle class jumping with form submission
function jumpToClass(selectedClass) {
    if (!selectedClass) {
        const classSelector = document.getElementById('classJump');
        selectedClass = classSelector.value;
    }

    if (selectedClass) {
        // Create hidden form elements
        const form = document.getElementById('jumpForm');

        // Clear existing hidden inputs
        while (form.firstChild) {
            form.removeChild(form.firstChild);
        }

        // Calculate the new index (50 * class_number)
        const newIndex = 50 * parseInt(selectedClass);

        // Add the target index as a hidden input
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.name = 'image_index';
        hiddenInput.value = newIndex;
        form.appendChild(hiddenInput);

        // Add class_id input
        const classIdInput = document.createElement('input');
        classIdInput.type = 'hidden';
        classIdInput.name = 'class_id';
        classIdInput.value = selectedClass;
        form.appendChild(classIdInput);

        // Add image paths hidden input
        const imagePathsInput = document.createElement('input');
        imagePathsInput.type = 'hidden';
        imagePathsInput.name = 'image_name';
        imagePathsInput.value = document.querySelector('input[name="image_name"]').value;
        form.appendChild(imagePathsInput);

        // Add direction hidden input
        const directionInput = document.createElement('input');
        directionInput.type = 'hidden';
        directionInput.name = 'direction';
        directionInput.value = 'jump';
        form.appendChild(directionInput);

        // Gather all checked checkboxes and copy their values to the jump form
        const checkboxes = document.querySelectorAll('input[form="save"][name="checkboxes"]:checked');
        checkboxes.forEach((checkbox) => {
            const hiddenCheckbox = document.createElement('input');
            hiddenCheckbox.type = 'hidden';
            hiddenCheckbox.name = 'checkboxes';
            hiddenCheckbox.value = checkbox.value;
            form.appendChild(hiddenCheckbox);
        });

        // Submit the form to update the server-side index
        form.submit();
    }
}

// Function to handle cluster jump
function jumpToCluster(clusterName) {
    if (!clusterName) return;

    // Set the cluster name in the form
    var form = document.getElementById('jumpClusterForm');

    // Remove any existing hidden inputs
    while (form.firstChild) {
        form.removeChild(form.firstChild);
    }

    // Create and append a new hidden input
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'cluster_name';
    input.value = clusterName;
    form.appendChild(input);

    // Add image paths hidden input for consistency
    const imagePathsInput = document.createElement('input');
    imagePathsInput.type = 'hidden';
    imagePathsInput.name = 'image_name';
    imagePathsInput.value = document.querySelector('input[name="image_name"]').value;
    form.appendChild(imagePathsInput);

    // Add direction hidden input
    const directionInput = document.createElement('input');
    directionInput.type = 'hidden';
    directionInput.name = 'direction';
    directionInput.value = 'jump';
    form.appendChild(directionInput);

    // Gather all checked checkboxes and copy their values to the jump form
    const checkboxes = document.querySelectorAll('input[form="save"][name="checkboxes"]:checked');
    checkboxes.forEach((checkbox) => {
        const hiddenCheckbox = document.createElement('input');
        hiddenCheckbox.type = 'hidden';
        hiddenCheckbox.name = 'checkboxes';
        hiddenCheckbox.value = checkbox.value;
        form.appendChild(hiddenCheckbox);
    });

    // Submit the form
    form.submit();
}

document.addEventListener('DOMContentLoaded', function() {
    // Set up class dropdown navigation
    const dropdownItems = document.querySelectorAll('.superclass-dropdown .dropdown-item');
    const dropdownTrigger = document.querySelector('.class-counter');
    const dropdown = document.querySelector('.superclass-dropdown');

    // Toggle dropdown when clicking on the trigger
    if (dropdownTrigger && dropdown) {
        dropdownTrigger.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent this click from closing the dropdown

            // Toggle the dropdown
            if (dropdown.style.display === 'block') {
                dropdown.style.display = 'none';
            } else {
                dropdown.style.display = 'block';
            }
        });
    }

    // Handle clicking on dropdown items
    dropdownItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent this click from bubbling to document

            const classId = this.getAttribute('data-class-id');

            // Set class ID in form
            const jumpForm = document.getElementById('jumpForm');

            // Clear any existing inputs (to avoid duplicates)
            jumpForm.innerHTML = '';

            // Add the class_id input
            const classInput = document.createElement('input');
            classInput.type = 'hidden';
            classInput.name = 'class_id';
            classInput.value = classId;
            jumpForm.appendChild(classInput);

            // Add the image_name input
            const imageNameInput = document.querySelector('input[name="image_name"]');
            if (imageNameInput) {
                const imagePathsInput = document.createElement('input');
                imagePathsInput.type = 'hidden';
                imagePathsInput.name = 'image_name';
                imagePathsInput.value = imageNameInput.value;
                jumpForm.appendChild(imagePathsInput);
            }

            // Add direction input
            const directionInput = document.createElement('input');
            directionInput.type = 'hidden';
            directionInput.name = 'direction';
            directionInput.value = 'next';
            jumpForm.appendChild(directionInput);

            // Submit the form
            jumpForm.submit();
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function() {
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    });
});