/**
 * Auto-select class when radio button is clicked
 * Updated to use ground_truth_class_index from backend
 */
document.addEventListener('DOMContentLoaded', function() {
    // Debug mode
    const DEBUG = true;

    function debug(message) {
        if (DEBUG) console.log(`[Class Selector] ${message}`);
    }

    // Store the last selected class ID globally
    window.lastSelectedClassId = null;

    // Store the ground truth class ID if available
    window.groundTruthClassId = null;

    // Extract ground truth class ID directly from the hidden data element
    function extractGroundTruthClassId() {
        const gtDataElement = document.getElementById('ground-truth-data');

        if (gtDataElement && gtDataElement.textContent) {
            try {
                const gtClassId = parseInt(gtDataElement.textContent.trim());
                if (!isNaN(gtClassId)) {
                    window.groundTruthClassId = gtClassId;
                    debug(`Found ground truth class ID from data element: ${window.groundTruthClassId}`);
                    return window.groundTruthClassId;
                }
            } catch (e) {
                debug(`Error parsing ground truth class ID: ${e}`);
            }
        }

        // Fallback to extracting from GT label text
        const gtLabel = document.querySelector('.gt-label');
        if (gtLabel) {
            const gtText = gtLabel.textContent;
            // Extract the class ID from text like "Ground Truth: 123 - Class Name" or just a number
            const match = gtText.match(/Ground Truth:?\s*(\d+)/i) || gtText.match(/(\d+)/);
            if (match && match[1]) {
                const gtClassId = parseInt(match[1]);
                window.groundTruthClassId = gtClassId;
                debug(`Found ground truth class ID from label text: ${window.groundTruthClassId}`);
                return gtClassId;
            }
        }

        debug('Could not find ground truth class ID');
        return null;
    }

    // Extract the ground truth class ID when page loads
    extractGroundTruthClassId();

    // Find all radio buttons for class selection
    const radioButtons = document.querySelectorAll('input[type="radio"][name="class_selection"]');

    // Ensure all radio buttons are unchecked on page load
    radioButtons.forEach(radio => {
        radio.checked = false;
    });
    debug('Cleared all radio button selections on page load');

    // Add click event listeners to radio buttons
    radioButtons.forEach(radio => {
        radio.addEventListener('click', function(e) {
            // Only proceed if radio is being checked
            if (this.checked) {
                const classId = parseInt(this.value);
                debug(`Radio button for class ${classId} selected`);

                // Store the class ID globally for use by the bbox editor
                window.lastSelectedClassId = classId;

                // Get the human-readable class name if available
                let className = `Class ${classId}`;
                const humanReadableElement = document.getElementById('human-readable-classes');
                if (humanReadableElement) {
                    try {
                        const classMap = JSON.parse(humanReadableElement.textContent);
                        if (classMap[classId]) {
                            className = classMap[classId];
                        }
                    } catch (e) {
                        debug(`Error parsing human-readable classes: ${e}`);
                    }
                }

                // Show a center screen notification
                showCenterNotification(`${className} selected!`, `Draw a bounding box for this class`);
            }
        });
    });

    // Function to reset all radio button selections
    window.resetRadioSelection = function() {
        radioButtons.forEach(radio => {
            radio.checked = false;
        });

        // Reset the global selection variable
        window.lastSelectedClassId = null;
        debug('Radio selection has been reset');
    };

    // Helper function to get the current class ID for a new bounding box
    // Exposed globally so it can be called from other scripts
    window.getClassForNewBBox = function() {
        // Priority: 1. Radio button selection, 2. Ground truth
        if (window.lastSelectedClassId !== null && window.lastSelectedClassId !== undefined) {
            debug(`Using selected radio button class: ${window.lastSelectedClassId}`);
            return parseInt(window.lastSelectedClassId);
        }
        else if (window.groundTruthClassId !== null && window.groundTruthClassId !== undefined) {
            debug(`Using ground truth class as default: ${window.groundTruthClassId}`);
            return parseInt(window.groundTruthClassId);
        }

        // Default to 0 if nothing else is available
        debug('No class selection or ground truth available, using default 0');
        return 0;
    };

    // Setup navigation button handlers to clear radio selection when navigating
    setupNavigationHandlers();

    function setupNavigationHandlers() {
        // Handle navigation buttons (prev/next arrows)
        const navigationButtons = document.querySelectorAll('.refresh-btn');
        navigationButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Reset radio buttons when navigating
                window.resetRadioSelection();
                debug('Radio selection cleared due to navigation');
            });
        });
    }

    // Function to show a temporary center screen notification
    function showCenterNotification(title, message) {
        // Remove any existing notification
        const existingNotification = document.getElementById('center-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification container
        const notification = document.createElement('div');
        notification.id = 'center-notification';
        notification.style.position = 'fixed';
        notification.style.left = '50%';
        notification.style.top = '50%';
        notification.style.transform = 'translate(-50%, -50%)';
        notification.style.backgroundColor = 'rgba(33, 150, 243, 0.95)'; // Blue with slight transparency
        notification.style.color = 'white';
        notification.style.padding = '20px 30px';
        notification.style.borderRadius = '8px';
        notification.style.zIndex = '10000';
        notification.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        notification.style.textAlign = 'center';
        notification.style.minWidth = '300px';
        notification.style.maxWidth = '90%';
        notification.style.pointerEvents = 'none'; // Don't interfere with clicks
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -50%) scale(0.9)';

        // Create title element
        const titleElement = document.createElement('div');
        titleElement.textContent = title;
        titleElement.style.fontSize = '20px';
        titleElement.style.fontWeight = 'bold';
        titleElement.style.marginBottom = '10px';
        notification.appendChild(titleElement);

        // Create message element
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.fontSize = '16px';
        notification.appendChild(messageElement);

        // Add an icon (checkmark)
        const icon = document.createElement('div');
        icon.innerHTML = '✓';
        icon.style.fontSize = '36px';
        icon.style.marginBottom = '10px';
        notification.insertBefore(icon, titleElement);

        // Add to document
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 10);

        // Remove after 3 seconds with animation
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, -50%) scale(0.9)';

            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    // Log the ground truth class ID for debugging
    if (window.groundTruthClassId !== null) {
        debug(`Ground truth class ID initialized to: ${window.groundTruthClassId}`);
    } else {
        debug('Ground truth class ID not found, will default to 0');
    }

    debug("Radio button class selection initialized with ground truth prioritization");
});