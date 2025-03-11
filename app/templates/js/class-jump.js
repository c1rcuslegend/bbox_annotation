/**
 * Class Jump functionality - Searchable dropdown for jumping to specific classes
 */

// Initialize the searchable dropdown when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Create and initialize the searchable dropdown
    initSearchableDropdown();
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