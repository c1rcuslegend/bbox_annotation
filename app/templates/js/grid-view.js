/**
 * Grid view JavaScript functions for image annotation app
 */

// Global variables
let allChecked = false;

// Change navigation direction and submit form
function change(direction) {
    document.getElementById("direction").value = direction;
}

// Toggle all checkboxes
function checkAllCheckboxes() {
    const checkboxes = document.querySelectorAll('input[name="checkboxes"]');
    allChecked = !allChecked;

    checkboxes.forEach(checkbox => {
        checkbox.checked = allChecked;
    });

    const button = document.querySelector('.all-correct-btn');
    button.innerText = allChecked ? "UNSELECT ALL" : "EVERYTHING IS CORRECT";
}

// Check if all checkboxes are checked on page load
function checkInitialCheckboxState() {
    const checkboxes = document.querySelectorAll('input[name="checkboxes"]');
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);

    const button = document.querySelector('.all-correct-btn');
    button.innerText = allChecked ? "UNSELECT ALL" : "EVERYTHING IS CORRECT";
}

// Initialize the page on load
window.onload = function() {
    // Load the global threshold value
    const thresholdData = document.getElementById('threshold-data');
    let threshold = 0.5; // Default value
    if (thresholdData) {
        try {
            const thresholdConfig = JSON.parse(thresholdData.textContent);
            threshold = thresholdConfig.threshold || 0.5;
            console.log(`Using threshold: ${threshold}`);
        } catch (e) {
            console.error("Error parsing threshold data:", e);
        }
    }

    // Draw bounding boxes after a short delay to ensure images are loaded
    setTimeout(() => renderAllBoundingBoxes(threshold), 200);

    // Check initial checkbox state
    checkInitialCheckboxState();
};

// Function to render bounding boxes for all images
function renderAllBoundingBoxes(threshold) {
    console.log("Rendering all bounding boxes with threshold:", threshold);
    const imageContainers = document.querySelectorAll('.image-container');

    imageContainers.forEach(container => {
        const imageIndex = container.getAttribute('data-index');
        const bboxDataScript = container.querySelector('.bbox-data');
        const img = container.querySelector('.image-thumbnail');

        if (!bboxDataScript || !img) {
            console.error("Data script or image not found in container", container);
            return;
        }

        try {
            let bboxesData = JSON.parse(bboxDataScript.textContent || '{}');
            console.log(`Parsed bbox data for image ${imageIndex}:`, bboxesData);

            // Create overlay for bboxes if not exists
            let overlay = container.querySelector('.bbox-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'bbox-overlay';
                container.querySelector('.bbox-container').appendChild(overlay);
            }

            // Wait for image to load to get proper dimensions
            if (img.complete) {
                renderBoundingBoxes(overlay, bboxesData, img, threshold, imageIndex);
            } else {
                img.onload = function() {
                    renderBoundingBoxes(overlay, bboxesData, img, threshold, imageIndex);
                };
            }
        } catch (e) {
            console.error(`Error processing bboxes for image ${imageIndex}:`, e);
        }
    });
}

// Function to render bounding boxes on an overlay element
function renderBoundingBoxes(overlay, bboxData, img, threshold, imageIndex) {
    console.log(`Rendering bboxes for image ${imageIndex}`);

    // Clear existing boxes
    overlay.innerHTML = '';

    // Get image dimensions
    const displayWidth = img.width;
    const displayHeight = img.height;

    // Get natural dimensions (original size)
    const naturalWidth = img.naturalWidth || displayWidth;
    const naturalHeight = img.naturalHeight || displayHeight;

    // Get position of image relative to overlay
    const imgRect = img.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();

    // Calculate image position within overlay
    const imgLeft = imgRect.left - overlayRect.left;
    const imgTop = imgRect.top - overlayRect.top;

    // Calculate scaling factors
    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    // Handle different data formats
    if (bboxData && typeof bboxData === 'object') {
        // Format 1: {boxes: [[x1,y1,x2,y2],...], scores: [], labels: []}
        if (Array.isArray(bboxData.boxes)) {
            renderBoxesFormat1(overlay, bboxData, imgLeft, imgTop, scaleX, scaleY, threshold);
        }
        // Format 2: {imageIndex: {boxes: [...], scores: [...], labels: [...]}}
        else if (bboxData[imageIndex] && bboxData[imageIndex].boxes) {
            renderBoxesFormat1(overlay, bboxData[imageIndex], imgLeft, imgTop, scaleX, scaleY, threshold);
        }
        // Format 3: Array of box objects
        else if (Array.isArray(bboxData)) {
            renderBoxesFormat3(overlay, bboxData, imgLeft, imgTop, scaleX, scaleY);
        }
    }
}

// Render boxes in format {boxes: [[x1,y1,x2,y2],...], scores: [], labels: []}
function renderBoxesFormat1(overlay, bboxData, imgLeft, imgTop, scaleX, scaleY, threshold) {
    if (!bboxData.boxes || !Array.isArray(bboxData.boxes) || bboxData.boxes.length === 0) {
        return;
    }

    // Draw each box
    bboxData.boxes.forEach((box, index) => {
        // Skip if the score is below threshold
        if (bboxData.scores && bboxData.scores[index] < threshold) {
            return;
        }

        if (box && box.length === 4) {
            // Original coordinates [x1, y1, x2, y2]
            const [x1, y1, x2, y2] = box;

            // Calculate box position and size
            const boxLeft = imgLeft + (x1 * scaleX);
            const boxTop = imgTop + (y1 * scaleY);
            const boxWidth = (x2 - x1) * scaleX;
            const boxHeight = (y2 - y1) * scaleY;

            // Create bbox div - only border, no fill and no label
            const bboxDiv = document.createElement('div');
            bboxDiv.className = 'bbox';
            bboxDiv.style.left = `${boxLeft}px`;
            bboxDiv.style.top = `${boxTop}px`;
            bboxDiv.style.width = `${boxWidth}px`;
            bboxDiv.style.height = `${boxHeight}px`;
            overlay.appendChild(bboxDiv);
        }
    });
}

// Render boxes in format [{coordinates: [x,y,width,height], label: 0}, ...]
function renderBoxesFormat3(overlay, bboxes, imgLeft, imgTop, scaleX, scaleY) {
    if (!Array.isArray(bboxes) || bboxes.length === 0) {
        return;
    }

    // Draw each box
    bboxes.forEach(bbox => {
        if (bbox && bbox.coordinates && bbox.coordinates.length === 4) {
            const [x, y, width, height] = bbox.coordinates;

            // Calculate scaled position and size
            const boxLeft = imgLeft + (x * scaleX);
            const boxTop = imgTop + (y * scaleY);
            const boxWidth = width * scaleX;
            const boxHeight = height * scaleY;

            // Create bbox div - only border, no fill and no label
            const bboxDiv = document.createElement('div');
            bboxDiv.className = 'bbox';
            bboxDiv.style.left = `${boxLeft}px`;
            bboxDiv.style.top = `${boxTop}px`;
            bboxDiv.style.width = `${boxWidth}px`;
            bboxDiv.style.height = `${boxHeight}px`;
            overlay.appendChild(bboxDiv);
        }
    });
}

// Add window resize handler to redraw bounding boxes
window.addEventListener('resize', function() {
    setTimeout(function() {
        const thresholdData = document.getElementById('threshold-data');
        let threshold = 0.5;
        if (thresholdData) {
            try {
                threshold = JSON.parse(thresholdData.textContent).threshold || 0.5;
            } catch (e) {}
        }
        renderAllBoundingBoxes(threshold);
    }, 100);
});