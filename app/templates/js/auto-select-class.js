/**
 * Auto-select class when checkbox is clicked
 */
document.addEventListener('DOMContentLoaded', function() {
    // Debug mode
    const DEBUG = true;

    function debug(message) {
        if (DEBUG) console.log(`[Class Selector] ${message}`);
    }

    // Store the last selected checkbox class ID globally
    window.lastSelectedClassId = null;

    // Track checkbox state changes
    const checkboxStates = {};

    // Find all category checkboxes
    const checkboxes = document.querySelectorAll('input[name="checkboxes"]');

    // Initialize checkbox states
    checkboxes.forEach(checkbox => {
        checkboxStates[checkbox.value] = checkbox.checked;
    });

    // Add click event listeners to checkboxes
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('click', function(e) {
            // Only proceed if checkbox is being checked (not unchecked)
            if (this.checked && !checkboxStates[this.value]) {
                const classId = parseInt(this.value);
                debug(`Checkbox ${classId} clicked - storing class ID`);

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

            // Update state
            checkboxStates[this.value] = this.checked;
        });
    });

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

    debug("Auto-class selection initialized with center screen notification");
});