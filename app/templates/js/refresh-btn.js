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

    console.log("Refreshing examples for user:", username, "and image:", imageName);

    // Show loading message or indicator
    const allImageColumns = document.querySelectorAll('.row > .column.page1_element, .row > .column.page2_element, .row > .column.page3_element, .row > .column.page4_element');
    allImageColumns.forEach(column => {
        const rightDivs = column.querySelectorAll('.right');
        rightDivs.forEach(div => {
            div.innerHTML = '<div class="loading-indicator">Loading</div>';
        });
    });

    // Fetch new examples via AJAX - fixed URL construction
    const refreshUrl = `/${username}/refresh_examples?image_name=${encodeURIComponent(imageName)}`;
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
        // Update the example images in the DOM
        if (data.similar_images) {
            updateExampleImages(data.similar_images);
            console.log('Examples refreshed with seed:', data.seed);
        } else {
            console.error('No similar images returned:', data);
        }

        // Stop the spinning animation
        refreshIcon.classList.remove('spinning');
        refreshBtn.classList.remove('loading'); // Remove loading class
    })
    .catch(error => {
        console.error('Error refreshing example images:', error);
        refreshIcon.classList.remove('spinning');
        refreshBtn.classList.remove('loading'); // Remove loading class

        // Show error message in the UI
        allImageColumns.forEach(column => {
            const rightDivs = column.querySelectorAll('.right');
            rightDivs.forEach(div => {
                div.innerHTML = '<div class="error-message">Failed to load examples</div>';
            });
        });
    });

    // After successful refresh:
    const successNotification = document.getElementById('refreshSuccess');
    successNotification.classList.add('show');
    setTimeout(() => {
        successNotification.classList.remove('show');
    }, 3000);
}

/**
 * Updates the example images in the DOM with new data
 */
function updateExampleImages(similarImages) {
    // Find all columns
    const columns = document.querySelectorAll('.row > .column.page1_element, .row > .column.page2_element, .row > .column.page3_element, .row > .column.page4_element');

    // Track which classes we've processed
    const processedClasses = new Set();

    // Get number of similar images per class
    const numSimilarImages = parseInt(document.querySelector('.page1_element .right').querySelectorAll('img').length) || 3;

    // Process each category (up to 20)
    let index = 0;

    // Convert the similarImages object to an array of entries for easier processing
    const entries = Object.entries(similarImages);

    // Process up to 20 categories
    for (let i = 0; i < Math.min(entries.length, 20); i++) {
        const [predInfo, images] = entries[i];

        // Skip if we've already processed this class
        if (processedClasses.has(predInfo)) {
            continue;
        }
        processedClasses.add(predInfo);

        // Find the column for this class (1-based index)
        const columnIndex = index % 20;
        const column = columns[columnIndex];

        if (!column) {
            console.error(`Column not found for index ${columnIndex}`);
            continue;
        }

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

        index++;
    }

    // Apply page visibility based on current selection
    let currentPage = 1;
    for (let i = 1; i <= 4; i++) {
        if (document.getElementById('page' + i).classList.contains('selected')) {
            currentPage = i;
            break;
        }
    }
    pageSelect(currentPage);
}

// Add event listener once DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add click handler for the refresh button
    const refreshBtn = document.getElementById('refreshExamples');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshExampleImages);
    }
});