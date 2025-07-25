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

function updateProgressBar(correctedImages, totalImages, className) {
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');

    // Calculate percentage with safety checks
    let progressPercentage = 0;
    if (totalImages > 0) {
        progressPercentage = Math.min(100, Math.max(0, (correctedImages / totalImages) * 100));
    }

    // Update progress bar
    progressBarFill.style.width = progressPercentage.toFixed(1) + '%';

    // Update text with class name if provided
    if (className) {
        progressText.innerHTML = `<strong>${className}</strong>: ${correctedImages} / ${totalImages} images corrected (${progressPercentage.toFixed(1)}%)`;
    } else {
        progressText.innerText = `Images Corrected: ${correctedImages} / ${totalImages}`;
    }
}

// Initialize the page on load
window.onload = function() {
    // Add CSS styles for uncertain boxes
    addUncertainBoxStyles();

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
    setTimeout(() => renderAllBoundingBoxes(), 200);

    // Check initial checkbox state
    checkInitialCheckboxState();

    // Load progress data for the current class
    const progressData = document.getElementById('progress-data');
    if (progressData) {
        let className = document.getElementById('current-class-name')?.textContent;
        if (className && className.length > 20) {
            className = className.substring(0, 19) + '...';
        }
        const classCorrectedImages = parseInt(document.getElementById('class-corrected-images')?.textContent || '0', 10);
        const classTotalImages = parseInt(document.getElementById('class-total-images')?.textContent || '0', 10);

        if (classTotalImages > 0) {
            // Use class-specific data
            updateProgressBar(classCorrectedImages, classTotalImages, className);
        } else {
            // Fallback to global progress if class-specific data isn't available
            const correctedImages = parseInt(document.getElementById('num-corrected-images')?.textContent || '0', 10);
            const totalImages = 50000; // Global default
            updateProgressBar(correctedImages, totalImages);
        }
    }
};

// Function to add uncertain box styles
function addUncertainBoxStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Uncertain box styles */
        .bbox.uncertain-box {
            border: 2px solid #FFCC00 !important; /* Yellow border for uncertain boxes */
        }
        
        .bbox-label.uncertain-label {
            background-color: rgba(255, 204, 0, 0.85) !important; /* Yellow background */
            color: black !important; /* Black text for better contrast on yellow */
            font-weight: bold;
        }
        
        /* Crowd Reflected box styles */
        .bbox.crowd-reflected-box {
            border: 2px solid #5E6DAD !important; /* Blue border for crowd reflected boxes */
        }
        
        .bbox-label.crowd-reflected-label {
            background-color: rgba(94, 109, 173, 0.85) !important; /* Blue background */
            color: white !important; /* White text for better contrast on blue */
            font-weight: bold;
        }
        
        /* Reflected box styles */
        .bbox.reflected-box {
            border: 2px solid #20B2AA !important; /* Teal border for reflected boxes */
        }
        
        .bbox-label.reflected-label {
            background-color: rgba(32, 178, 170, 0.85) !important; /* Teal background */
            color: white !important; /* White text for better contrast on teal */
            font-weight: bold;
        }
        
        /* Crowd box styles */
        .bbox.crowd-box {
            border: 2px solid #9C27B0 !important; /* Purple border for crowd boxes */
        }
        
        .bbox-label.crowd-label {
            background-color: rgba(156, 39, 176, 0.85) !important; /* Purple background */
            color: white !important; /* White text for better contrast on purple */
            font-weight: bold;
        }
        
        /* Rendition box styles */
        .bbox.rendition-box {
            border: 2px solid #FF7043 !important; /* Orange border for rendition boxes */
        }
        
        .bbox-label.rendition-label {
            background-color: rgba(255, 112, 67, 0.85) !important; /* Orange background */
            color: white !important; /* White text for better contrast on orange */
            font-weight: bold;
        }
        
        /* Crowd Rendition box styles */
        .bbox.crowd-rendition-box {
            border: 2px solid #B39DDB !important; /* Light purple border for crowd rendition boxes */
        }
        
        .bbox-label.crowd-rendition-label {
            background-color: rgba(179, 157, 219, 0.85) !important; /* Light purple background */
            color: white !important; /* White text for better contrast on light purple */
            font-weight: bold;
        }
        
        /* Reflected Rendition box styles */
        .bbox.reflected-rendition-box {
            border: 2px solid #FF8A65 !important; /* Orange-coral border for reflected rendition boxes */
        }
        
        .bbox-label.reflected-rendition-label {
            background-color: rgba(255, 138, 101, 0.85) !important; /* Orange-coral background */
            color: white !important; /* White text for better contrast on orange-coral */
            font-weight: bold;
        }
        
        /* Crowd Reflected Rendition box styles */
        .bbox.crowd-reflected-rendition-box {
            border: 2px solid #81C784 !important; /* Light green border for crowd reflected rendition boxes */
        }
        
        .bbox-label.crowd-reflected-rendition-label {
            background-color: rgba(129, 199, 132, 0.85) !important; /* Light green background */
            color: white !important; /* White text for better contrast on light green */
            font-weight: bold;
        }
        
    `;
    document.head.appendChild(style);
}

// Function to render bounding boxes for all images
function renderAllBoundingBoxes() {
    const imageContainers = document.querySelectorAll('.image-container, .image-container-row');
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

            // Create overlay for bboxes if not exists
            let overlay = container.querySelector('.bbox-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'bbox-overlay';
                container.querySelector('.bbox-container').appendChild(overlay);
            }

            // Wait for image to load to get proper dimensions
            if (img.complete) {
                renderBoundingBoxes(overlay, bboxesData, img, imageIndex);
            } else {
                img.onload = function() {
                    renderBoundingBoxes(overlay, bboxesData, img, imageIndex);
                };
            }
        } catch (e) {
            console.error(`Error processing bboxes for image ${imageIndex}:`, e);
        }
    });
}

// Function to render bounding boxes on an overlay element
function renderBoundingBoxes(overlay, bboxData, img, imageIndex) {
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
        if (Array.isArray(bboxData.boxes)) {
            // Format 1: {boxes: [[x1,y1,x2,y2],...], scores: [], labels: []}
            renderBoxes(overlay, bboxData, imgLeft, imgTop, scaleX, scaleY, displayHeight);
        } else if (bboxData[imageIndex] && bboxData[imageIndex].boxes) {
            // Format 2: {imageIndex: {boxes: [...], scores: [...], labels: [...]}}
            renderBoxes(overlay, bboxData[imageIndex], imgLeft, imgTop, scaleX, scaleY, displayHeight);
        } else if (Array.isArray(bboxData)) {
            // Format 3: Array of box objects with coordinates
            renderBoxObjects(overlay, bboxData, imgLeft, imgTop, scaleX, scaleY, displayHeight);
        }
    }
}

// Simplified function to render boxes based on their label value
function renderBoxes(overlay, bboxData, imgLeft, imgTop, scaleX, scaleY, imgHeight) {
    if (!bboxData.boxes || !Array.isArray(bboxData.boxes) || bboxData.boxes.length === 0) {
        return;
    }

    // Draw each box
    bboxData.boxes.forEach((box, index) => {
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

            // Get label ID - check labels first, then gt field as fallback
            let labelId;
            if (bboxData.labels && bboxData.labels[index] !== undefined) {
                labelId = bboxData.labels[index];
            } else if (bboxData.gt && bboxData.gt[index] !== undefined) {
                labelId = bboxData.gt[index];
            } else {
                labelId = 0; // Default if no label found
            }

            // Check if this box is uncertain (label = -1)
            const isUncertain = labelId === "-1" || labelId === -1;

            // Check if this box is a crowd box
            const isCrowd = bboxData.crowd_flags && bboxData.crowd_flags[index];

            // Check if this box is a reflected box
            const isReflected = bboxData.reflected_flags && bboxData.reflected_flags[index];

            // Check if this box is a rendition box
            const isRendition = bboxData.rendition_flags && bboxData.rendition_flags[index];

            // Apply appropriate classes
            if (isCrowd && isReflected && isRendition) {
                bboxDiv.classList.add('crowd-reflected-rendition-box');
            } else if (isReflected && isRendition) {
                bboxDiv.classList.add('reflected-rendition-box');
            } else if (isCrowd && isRendition) {
                bboxDiv.classList.add('crowd-rendition-box');
            } else if (isCrowd && isReflected) {
                bboxDiv.classList.add('crowd-reflected-box');
            } else if (isRendition) {
                bboxDiv.classList.add('rendition-box');
            } else if (isReflected) {
                bboxDiv.classList.add('reflected-box');
            } else if (isCrowd) {
                bboxDiv.classList.add('crowd-box');
            } else if (isUncertain) {
                bboxDiv.classList.add('uncertain-box');
            }

            bboxDiv.style.left = `${boxLeft}px`;
            bboxDiv.style.top = `${boxTop}px`;
            bboxDiv.style.width = `${boxWidth}px`;
            bboxDiv.style.height = `${boxHeight}px`;

            // Add the box to the overlay
            overlay.appendChild(bboxDiv);

            // Add the label - either "Not Sure" or the class name
            if (isUncertain) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'bbox-label uncertain-label';
                labelDiv.textContent = "Not Sure";

                // Position the label
                const labelHeight = 22;
                const buffer = 5;
                const labelTop = boxTop - labelHeight - buffer;
                const isOutOfBoundsTop = labelTop < imgTop + buffer;

                if (isOutOfBoundsTop) {
                    labelDiv.style.left = `${boxLeft}px`;
                    labelDiv.style.top = `${boxTop + buffer}px`;
                    labelDiv.classList.add('below-top-left');
                } else {
                    labelDiv.style.left = `${boxLeft}px`;
                    labelDiv.style.top = `${boxTop - labelHeight - buffer}px`;
                }

                overlay.appendChild(labelDiv);
            } else {
                // For normal boxes, add regular class label
                const labelDiv = document.createElement('div');
                labelDiv.className = 'bbox-label';

                // Add crowd-label class if it's a crowd box
                // Add reflected-label class if it's a reflected box
                // Add rendition-label class if it's a rendition box
                if (isCrowd && isReflected && isRendition) {
                    labelDiv.classList.add('crowd-reflected-rendition-label');
                } else if (isReflected && isRendition) {
                    labelDiv.classList.add('reflected-rendition-label');
                } else if (isCrowd && isRendition) {
                    labelDiv.classList.add('crowd-rendition-label');
                } else if (isCrowd && isReflected) {
                    labelDiv.classList.add('crowd-reflected-label');
                } else if (isRendition) {
                    labelDiv.classList.add('rendition-label');
                } else if (isReflected) {
                    labelDiv.classList.add('reflected-label');
                } else if (isCrowd) {
                    labelDiv.classList.add('crowd-label');
                }

                // Get the class name
                let labelName = classLabelMap[labelId] || `Class ${labelId}`;
                if (labelName.length > 30) {
                    labelName = labelName.substring(0, 27) + '...';
                }

                labelDiv.textContent = `${labelId} - ${labelName}`;

                // Position the label
                const labelHeight = 22;
                const buffer = 5;
                const labelTop = boxTop - labelHeight - buffer;
                const isOutOfBoundsTop = labelTop < imgTop + buffer;

                if (isOutOfBoundsTop) {
                    labelDiv.style.left = `${boxLeft}px`;
                    labelDiv.style.top = `${boxTop + buffer}px`;
                    labelDiv.classList.add('below-top-left');
                } else {
                    labelDiv.style.left = `${boxLeft}px`;
                    labelDiv.style.top = `${boxTop - labelHeight - buffer}px`;
                }

                overlay.appendChild(labelDiv);
            }
        }
    });
}


// Add window resize handler to redraw bounding boxes
window.addEventListener('resize', function() {
    setTimeout(function() {
        renderAllBoundingBoxes();
    }, 100);
});

// Add legend toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const legendToggle = document.querySelector('.legend-toggle');
    const legendContainer = document.querySelector('.legend-container');
    const legendClose = document.querySelector('.legend-close');

    if (legendToggle && legendContainer && legendClose) {
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
    }
});