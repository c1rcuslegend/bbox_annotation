/**
 * Refreshes example images without reloading the entire page
 */
function refreshExampleImages() {
    // Show loading state
    const refreshBtn = document.getElementById('refreshExamples');
    const refreshIcon = refreshBtn.querySelector('.refresh-icon');
    refreshIcon.classList.add('spinning');
    refreshBtn.classList.add('loading'); // Add loading class to button

    // Get the current image name
    const imageNameInput = document.querySelector('input[name="image_name"]');
    const imageName = imageNameInput ? imageNameInput.value : '';

    // Get the username from the URL path
    const pathParts = window.location.pathname.split('/');
    const username = pathParts[1]; // First part after the initial slash

    // Determine which page is currently selected
    let currentPage = 1;
    for (let i = 1; i <= 4; i++) {
        if (document.getElementById('page' + i).classList.contains('selected')) {
            currentPage = i;
            break;
        }
    }

    // Calculate the range of classes to refresh based on the current page
    const startIndex = (currentPage - 1) * 5;
    const endIndex = startIndex + 5;

    console.log("Refreshing examples for user:", username, "and image:", imageName);

    // Get the class IDs from the visible columns
    const visibleColumns = document.querySelectorAll(`.column.page${currentPage}_element`);
    const classIds = [];

    visibleColumns.forEach(column => {
        // Get the class ID from the radio button in this column
        const radio = column.querySelector('input[type="radio"]');
        if (radio && radio.value) {
            classIds.push(radio.value);
        }
    });

    console.log("Refreshing classes:", classIds);

    // Show loading indicator only in the visible columns
    visibleColumns.forEach(column => {
        const rightDivs = column.querySelectorAll('.right');
        rightDivs.forEach(div => {
            div.innerHTML = '<div class="loading-indicator">Loading</div>';
        });
    });

    // Fetch new examples via AJAX - include page and class IDs
    const refreshUrl = `/${username}/refresh_examples?image_name=${encodeURIComponent(imageName)}&page=${currentPage}&class_ids=${classIds.join(',')}`;
    console.log("Fetching from URL:", refreshUrl);

    fetch(refreshUrl, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        if (!response.ok) {
            console.error("Server responded with status:", response.status);
            throw new Error('Network response was not ok: ' + response.status);
        }
        return response.json();
    })
    .then(data => {
        // Update only the example images for the current page
        if (data.similar_images) {
            updatePageExamples(data.similar_images, currentPage);
            console.log('Examples refreshed with seed:', data.seed);

            // Show success notification
            const successNotification = document.getElementById('refreshSuccess');
            if (successNotification) {
                successNotification.classList.add('show');
                setTimeout(() => {
                    successNotification.classList.remove('show');
                }, 3000);
            }
        } else {
            console.error('No similar images returned:', data);
        }

        // Stop the spinning animation
        refreshIcon.classList.remove('spinning');
        refreshBtn.classList.remove('loading');
    })
    .catch(error => {
        console.error('Error refreshing examples:', error);
        refreshIcon.classList.remove('spinning');
        refreshBtn.classList.remove('loading');

        // Show error message only in the visible columns
        visibleColumns.forEach(column => {
            const rightDivs = column.querySelectorAll('.right');
            rightDivs.forEach(div => {
                div.innerHTML = '<div class="error-message">Failed to load examples</div>';
            });
        });
    });
}

/**
 * Updates only the examples for a specific page
 */
function updatePageExamples(similarImages, pageNumber) {
    // Find all columns for the current page
    const columns = document.querySelectorAll(`.column.page${pageNumber}_element`);
    console.log(`Updating ${columns.length} columns for page ${pageNumber}`);

    // Process each column and match it with the right class data
    columns.forEach(column => {
        // Get the class ID from the radio button or category label
        let classId = null;

        // Try to get from radio button
        const radio = column.querySelector('input[type="radio"]');
        if (radio && radio.value) {
            classId = radio.value;
        }

        // Skip if we couldn't find the class ID
        if (!classId) {
            console.warn("Could not determine class ID for column:", column);
            return;
        }

        console.log(`Processing column for class ${classId}`);

        // Get the images for this class
        const images = similarImages[classId];
        if (!images || !images.length) {
            console.warn(`No images found for class ${classId}`);
            return;
        }

        // Get number of similar images per class
        const numSimilarImages = parseInt(document.querySelector('.page1_element .right').querySelectorAll('img').length) || 3;

        // Update the images in the right divs
        let rightDivs = column.querySelectorAll('.right');

        // If there aren't enough right divs, create them
        if (rightDivs.length === 0) {
            const rightDiv = document.createElement('div');
            rightDiv.className = 'right';
            column.appendChild(rightDiv);
            rightDivs = [rightDiv];
        }

        // Clear all right divs except the first one
        for (let j = 1; j < rightDivs.length; j++) {
            rightDivs[j].remove();
        }

        // Get the first right div
        let currentRightDiv = rightDivs[0];
        currentRightDiv.innerHTML = '';

        // Add images to the right divs
        images.forEach((imgUrl, imgIndex) => {
            // If we've filled the current right div, create a new one
            if (imgIndex > 0 && imgIndex % numSimilarImages === 0) {
                const newRightDiv = document.createElement('div');
                newRightDiv.className = 'right';
                column.appendChild(newRightDiv);
                currentRightDiv = newRightDiv;
            }

            // Create the image element
            const img = document.createElement('img');
            img.className = 'thumbnail';
            img.src = '/' + imgUrl;
            img.alt = 'Class Image';
            img.onclick = function() { show_image(this); };

            // Add it to the current right div
            currentRightDiv.appendChild(img);
        });
    });
}

// Add event listener once DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add click handler for the refresh button
    const refreshBtn = document.getElementById('refreshExamples');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshExampleImages);
    }
});