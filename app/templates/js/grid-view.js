/**
 * Grid view JavaScript functions for image annotation app
 */

// Global variables
let allChecked = false;
let classLabelMap = {}; // Will be populated with class mappings

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

function updateProgressBar(correctedImages, totalImages) {
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = (correctedImages / totalImages) * 100;
    progressBarFill.style.width = progressPercentage + '%';
    progressText.innerText = `Images Corrected: ${correctedImages} / ${totalImages}`;
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

    // Load class label mappings if available
    const classesElement = document.getElementById('human-readable-classes');
    if (classesElement && classesElement.textContent) {
        try {
            classLabelMap = JSON.parse(classesElement.textContent);
            console.log(`Loaded ${Object.keys(classLabelMap).length} class labels`);
        } catch (e) {
            console.error("Error parsing class labels:", e);
            classLabelMap = {};
        }
    }

    // Draw bounding boxes after a short delay to ensure images are loaded
    setTimeout(() => renderAllBoundingBoxes(threshold), 200);

    // Check initial checkbox state
    checkInitialCheckboxState();

    const correctedImages = parseInt(document.getElementById('num-corrected-images').textContent, 10);
    const totalImages = 50000;
    updateProgressBar(correctedImages, totalImages);
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

            // Create bbox div - border only
            const bboxDiv = document.createElement('div');
            bboxDiv.className = 'bbox';
            bboxDiv.style.left = `${boxLeft}px`;
            bboxDiv.style.top = `${boxTop}px`;
            bboxDiv.style.width = `${boxWidth}px`;
            bboxDiv.style.height = `${boxHeight}px`;

            // Get label ID - check labels first, then gt field as fallback
            let labelId;
            if (bboxData.labels && bboxData.labels[index] !== undefined) {
                labelId = bboxData.labels[index];
            } else if (bboxData.gt && bboxData.gt[index] !== undefined) {
                labelId = bboxData.gt[index];
                console.log(`Using gt[${index}] (${labelId}) for label`);
            } else {
                labelId = 0; // Default if no label found
            }

            // Create and add label element
            const labelDiv = createLabelElement(labelId, boxLeft, boxTop);

            // Add elements to overlay
            overlay.appendChild(bboxDiv);
            overlay.appendChild(labelDiv);
        }
    });
}

// Render boxes in format [{coordinates: [x,y,width,height], label: 0}, ...]
function renderBoxesFormat3(overlay, bboxes, imgLeft, imgTop, scaleX, scaleY) {
    if (!Array.isArray(bboxes) || bboxes.length === 0) {
        return;
    }

    // Draw each box
    bboxes.forEach((bbox, index) => {
        if (bbox && bbox.coordinates && bbox.coordinates.length === 4) {
            // Coordinates can be in two formats:
            // 1. [x1, y1, x2, y2] (two points)
            // 2. [x, y, width, height] (point + dimensions)
            let boxLeft, boxTop, boxWidth, boxHeight;

            const coords = bbox.coordinates;

            // Determine format based on values (if 3rd value is much larger than 1st, it's likely format 1)
            const isCornerFormat = coords[2] > coords[0] * 1.5;

            if (isCornerFormat) {
                // Format [x1, y1, x2, y2]
                boxLeft = imgLeft + (coords[0] * scaleX);
                boxTop = imgTop + (coords[1] * scaleY);
                boxWidth = (coords[2] - coords[0]) * scaleX;
                boxHeight = (coords[3] - coords[1]) * scaleY;
            } else {
                // Format [x, y, width, height]
                boxLeft = imgLeft + (coords[0] * scaleX);
                boxTop = imgTop + (coords[1] * scaleY);
                boxWidth = coords[2] * scaleX;
                boxHeight = coords[3] * scaleY;
            }

            // Create bbox div
            const bboxDiv = document.createElement('div');
            bboxDiv.className = 'bbox';
            bboxDiv.style.left = `${boxLeft}px`;
            bboxDiv.style.top = `${boxTop}px`;
            bboxDiv.style.width = `${boxWidth}px`;
            bboxDiv.style.height = `${boxHeight}px`;

            // Get the label ID from the bbox object
            const labelId = bbox.label !== undefined ? bbox.label : 0;

            // Create and add label element
            const labelDiv = createLabelElement(labelId, boxLeft, boxTop);

            // Add elements to overlay
            overlay.appendChild(bboxDiv);
            overlay.appendChild(labelDiv);
        }
    });
}

// Helper function to create a label element with styling
function createLabelElement(labelId, boxLeft, boxTop) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'bbox-label';

    // Position the label above the box
    labelDiv.style.left = `${boxLeft}px`;
    labelDiv.style.top = `${boxTop - 22}px`; // Position above the box

    // Get the class name from the mapping or use the ID if not found
    let labelName = classLabelMap[labelId] || `Class ${labelId}`;

    // Limit label name to 30 characters
    if (labelName.length > 30) {
        labelName = labelName.substring(0, 27) + '...';
    }

    // Format the label text
    const labelText = `${labelId} - ${labelName}`;
    labelDiv.textContent = labelText;

    return labelDiv;
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

// Add legend toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const legendToggle = document.querySelector('.legend-toggle');
    const legendContainer = document.querySelector('.legend-container');
    const legendClose = document.querySelector('.legend-close');

    legendToggle.addEventListener('click', function() {
        legendContainer.classList.toggle('show');
    });

    legendClose.addEventListener('click', function() {
        legendContainer.classList.remove('show');
    });

    // Close legend when clicking outside
    document.addEventListener('click', function(event) {
        if (!legendContainer.contains(event.target) &&
            !legendToggle.contains(event.target)) {
            legendContainer.classList.remove('show');
        }
    });
});