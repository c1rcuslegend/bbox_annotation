/**
 * Inline Bounding Box Editor
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inline BBox Editor initializing');

    // DEBUG mode for extra logging
    const DEBUG = true;

    function debug(message) {
        if (DEBUG) console.log(`[BBox Editor] ${message}`);
    }

    // Get DOM elements for controls
    const inlineBboxSelector = document.getElementById('inline-bbox-selector');
    const inlineClassSearch = document.getElementById('inline-class-search');
    const inlineClassSelector = document.getElementById('inline-class-selector');
    const deleteBoxBtn = document.getElementById('inline-bbox-delete');
    const cancelBtn = document.getElementById('inline-bbox-cancel');
    const openPopupBtn = document.getElementById('open-popup-editor');

    // Get the image container
    const imageContainer = document.getElementById('image-with-bboxes');

    // Initialize editor state
    const inlineEditor = {
        initialized: false,
        bboxes: null,
        editor: null,
        currentBoxIndex: -1,
        isDrawing: false,
        isDragging: false,
        isResizing: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartBox: null,
        resizeCorner: null,
        drawStartPos: { x: 0, y: 0 },
        classLabels: {},
        threshold: 0.5,
        tempBox: null,
        canvasElement: null,
        lastSelectedClassId: null, // Track the last selected class ID
        bboxesField: null, // Hidden field for storing bbox data
        labelsInitialized: false  // Track if labels have been initialized
    };

    // Load class labels
    const classesElement = document.getElementById('human-readable-classes');
    if (classesElement && classesElement.textContent) {
        try {
            inlineEditor.classLabels = JSON.parse(classesElement.textContent);
            debug(`Loaded ${Object.keys(inlineEditor.classLabels).length} class labels`);
        } catch (e) {
            console.error('Error parsing class labels:', e);
        }
    }

    // Load threshold value
    const thresholdElement = document.getElementById('threshold');
    if (thresholdElement && thresholdElement.textContent) {
        try {
            inlineEditor.threshold = parseFloat(JSON.parse(thresholdElement.textContent));
        } catch (e) {
            console.error('Error parsing threshold:', e);
        }
    }

    // Load initial bounding boxes
    const bboxDataElement = document.getElementById('bbox-data');
    if (bboxDataElement && bboxDataElement.textContent) {
        try {
            inlineEditor.bboxes = JSON.parse(bboxDataElement.textContent);
            inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.bboxes));

            // Debug the loaded bboxes
            debug('Loaded bboxes:');
            debug(JSON.stringify(inlineEditor.bboxes));

            // Check for 'gt' field and use it as 'labels' if it exists
            if (inlineEditor.bboxes.gt && !inlineEditor.bboxes.labels) {
                debug('Found "gt" field - using as labels array');
                inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
                inlineEditor.labelsInitialized = true;
            }
            // Ensure labels array exists
            else if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.boxes) {
                debug('Creating missing labels array with default values');
                inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
                inlineEditor.labelsInitialized = true;
            } else if (inlineEditor.bboxes.labels) {
                debug(`Labels found: ${JSON.stringify(inlineEditor.bboxes.labels)}`);
                inlineEditor.labelsInitialized = true;
            }

            if (inlineEditor.bboxes.boxes && inlineEditor.bboxes.scores) {
                debug(`Loaded ${inlineEditor.bboxes.boxes.length} boxes, ${inlineEditor.bboxes.boxes.filter((_, i) => 
                    inlineEditor.bboxes.scores[i] >= inlineEditor.threshold).length} above threshold`);
            }
        } catch (e) {
            console.error('Error parsing bbox data:', e);
        }
    }

    // Create hidden form field for bboxes
    createBboxesField();

    // Add Save button to the control buttons div
    addSaveButton();

    // Hook up checkbox event listeners
    setupCategoryCheckboxListeners();

    // Hook up form submission to save bboxes
    setupFormSubmissionHandlers();

    // Create hidden form field for bboxes
    function createBboxesField() {
        // Check if it already exists
        let bboxesField = document.getElementById('bboxes-data-field');
        if (!bboxesField) {
            // Create the field
            bboxesField = document.createElement('input');
            bboxesField.type = 'hidden';
            bboxesField.id = 'bboxes-data-field';
            bboxesField.name = 'bboxes_data';

            // Add it to the form
            const form = document.getElementById('save');
            if (form) {
                form.appendChild(bboxesField);
                debug('Created hidden bboxes field');
            } else {
                console.error('Form not found, cannot add hidden bboxes field');
            }
        }

        // Store reference
        inlineEditor.bboxesField = bboxesField;
    }

    // Function to add a Save button
    function addSaveButton() {
        const controlButtons = document.querySelector('.control-buttons');
        if (!controlButtons) {
            console.error('Control buttons container not found');
            return;
        }

        // Create Save button
        const saveBtn = document.createElement('button');
        saveBtn.id = 'inline-bbox-save';
        saveBtn.className = 'editor-button save-btn';
        saveBtn.textContent = 'Save Changes';

        // Insert it before the Cancel button if it exists
        if (cancelBtn) {
            controlButtons.insertBefore(saveBtn, cancelBtn);
        } else {
            // Otherwise just append it
            controlButtons.appendChild(saveBtn);
        }

        // Add event listener with popup notification
        saveBtn.addEventListener('click', function() {
            saveBboxes();
            // Show a notification only for save action
            showCenterNotification('Bounding Boxes Saved', 'Your changes have been successfully saved');
        });

        debug('Save button added to controls');
    }

    // Center screen notification function (reused from provided code)
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

        // Remove after 2 seconds with animation
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, -50%) scale(0.9)';

            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 2000);
    }

    // Setup form submission to save bboxes before navigating
    function setupFormSubmissionHandlers() {
        // Handle main form submission
        const form = document.getElementById('save');
        if (form) {
            form.addEventListener('submit', function(e) {
                // Prevent default submission to handle it manually
                e.preventDefault();

                // Save bboxes
                saveBboxes();

                // Update hidden field
                updateHiddenBboxesField();

                debug('Form submitted - saved bboxes and updated hidden field');

                // Continue with form submission after a slight delay
                setTimeout(() => {
                    this.submit();
                }, 100);
            });

            debug('Added form submission handler');
        }

        // Handle direct next/prev button clicks
        // Since these might be outside the form or use JS navigation
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(button => {
            if (button.name === 'next' || button.textContent.includes('Next') ||
                button.getAttribute('data-action') === 'next') {
                button.addEventListener('click', function() {
                    saveBboxes();
                    updateHiddenBboxesField();
                    debug('Next button clicked - saved bboxes');
                });
            }
            else if (button.name === 'prev' || button.textContent.includes('Previous') ||
                     button.getAttribute('data-action') === 'prev') {
                button.addEventListener('click', function() {
                    saveBboxes();
                    updateHiddenBboxesField();
                    debug('Prev button clicked - saved bboxes');
                });
            }
        });
    }

    // Update hidden form field with bbox data
    function updateHiddenBboxesField() {
        if (!inlineEditor.bboxesField) {
            console.error('Hidden bboxes field not found');
            return;
        }

        // Format data for saving to form field
        let bboxDataArray = [];

        if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes || !inlineEditor.bboxes.scores) {
            console.error('Invalid bboxes data structure:', inlineEditor.bboxes);
            return;
        }

        // Debug current bboxes state
        debug(`Updating hidden field - current boxes: ${inlineEditor.bboxes.boxes.length}`);
        debug(`Current labels: ${JSON.stringify(inlineEditor.bboxes.labels)}`);

        inlineEditor.bboxes.boxes.forEach((box, i) => {
            if (inlineEditor.bboxes.scores[i] >= inlineEditor.threshold) {
                const label = inlineEditor.bboxes.labels &&
                              inlineEditor.bboxes.labels[i] !== undefined ?
                              inlineEditor.bboxes.labels[i] : 0;

                bboxDataArray.push({
                    coordinates: box,
                    label: label
                });
            }
        });

        // Update the hidden field with JSON string
        inlineEditor.bboxesField.value = JSON.stringify(bboxDataArray);
        debug(`Updated hidden field with ${bboxDataArray.length} bboxes: ${inlineEditor.bboxesField.value.substring(0, 100)}...`);
    }

    // Hook up checkbox event listeners
    function setupCategoryCheckboxListeners() {
        // Also check for the global lastSelectedClassId from checkbox.js
        if (window.lastSelectedClassId !== undefined) {
            inlineEditor.lastSelectedClassId = window.lastSelectedClassId;
            debug(`Found global lastSelectedClassId: ${inlineEditor.lastSelectedClassId}`);
        }

        // Find all category checkboxes
        const categoryCheckboxes = document.querySelectorAll('input[type="checkbox"][name="checkboxes"]');

        categoryCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    // Store the class ID when checkbox is checked
                    inlineEditor.lastSelectedClassId = this.value;
                    debug(`Checkbox changed - selected class ${inlineEditor.lastSelectedClassId} for next bounding box`);
                }
            });
        });

        debug(`Set up listeners for ${categoryCheckboxes.length} category checkboxes`);
    }

    // Hook up Advanced Editor button
    if (openPopupBtn) {
        openPopupBtn.addEventListener('click', function() {
            debug('Advanced Editor button clicked');

            // Get the modal element
            const modal = document.getElementById('bbox-modal-container');
            if (!modal) {
                console.error('Modal element not found');
                return;
            }

            // If we have a selected box, open the editor with that box
            if (inlineEditor.currentBoxIndex >= 0 &&
                inlineEditor.bboxes &&
                inlineEditor.currentBoxIndex < inlineEditor.bboxes.boxes.length) {

                debug(`Opening editor with box ${inlineEditor.currentBoxIndex}`);
                BBoxEditorUI.openModal(
                    inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex],
                    inlineEditor.currentBoxIndex,
                    inlineEditor.bboxes,
                    inlineEditor.editor
                );
            } else {
                // Otherwise open with no selection
                debug('Opening editor with no selection');
                BBoxEditorUI.openModal(
                    null,
                    -1,
                    inlineEditor.bboxes,
                    inlineEditor.editor
                );
            }

            // Show the modal
            modal.classList.add('show-modal');
        });
    }

    // Check for main editor and connect to it
    const checkForEditor = setInterval(() => {
        if (window.bboxEditor) {
            clearInterval(checkForEditor);
            connectToMainEditor();
        }
    }, 200);

    // Connect to the main editor once it's available
    function connectToMainEditor() {
        inlineEditor.editor = window.bboxEditor;

        debug('Main editor found, connecting...');

        // Ensure we don't lose label information
        // Make sure we have bboxes
        if (!inlineEditor.bboxes && inlineEditor.editor.bboxes) {
            debug('Using bboxes from main editor');
            inlineEditor.bboxes = inlineEditor.editor.bboxes;

            // Check if we need to create labels
            if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.boxes) {
                // Check for 'gt' field first
                if (inlineEditor.bboxes.gt) {
                    debug('Using "gt" field as labels');
                    inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
                } else {
                    debug('Creating missing labels array for editor boxes');
                    inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
                }
            }
        } else if (inlineEditor.editor.bboxes) {
            // We have our own bboxes, make sure editor uses them
            debug('Updating main editor with our bboxes');

            // Check for 'gt' field before processing labels
            if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.gt) {
                debug('Using our "gt" field as labels');
                inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
            } 
            // Preserve labels if they exist in our bboxes
            else if (inlineEditor.bboxes.labels && !inlineEditor.editor.bboxes.labels) {
                debug('Preserving our labels when updating editor');
            }
            // If editor has labels but we don't, take them
            else if (!inlineEditor.bboxes.labels && inlineEditor.editor.bboxes.labels) {
                debug('Taking labels from editor');
                inlineEditor.bboxes.labels = [...inlineEditor.editor.bboxes.labels];
            }

            // Now update the editor
            inlineEditor.editor.bboxes = inlineEditor.bboxes;
        }

        // Store original bboxes for cancel functionality
        if (inlineEditor.editor.originalBboxes) {
            inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.editor.originalBboxes));
        } else {
            inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.bboxes));
        }

        // Make sure we have class labels
        if (Object.keys(inlineEditor.classLabels).length === 0 && inlineEditor.editor.classLabels) {
            inlineEditor.classLabels = inlineEditor.editor.classLabels;
        }

        // Get threshold from editor
        if (inlineEditor.editor.threshold) {
            inlineEditor.threshold = inlineEditor.editor.threshold;
        }

        // Make sure we have labels after connection
        if (inlineEditor.bboxes && inlineEditor.bboxes.boxes && !inlineEditor.bboxes.labels) {
            // Check for 'gt' field as final fallback
            if (inlineEditor.bboxes.gt) {
                debug('Using "gt" field as labels after connection check');
                inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
            } else {
                debug('Labels missing after connection, creating them now');
                inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
            }
        } else if (inlineEditor.bboxes && inlineEditor.bboxes.labels) {
            debug(`Labels after connection: ${JSON.stringify(inlineEditor.bboxes.labels)}`);
        }

        // IMPORTANT: Find the canvas element that the main editor created
        if (imageContainer) {
            const canvas = imageContainer.querySelector('canvas');
            if (canvas) {
                inlineEditor.canvasElement = canvas;
                debug('Found canvas element to attach events to');
            } else {
                console.error('Canvas element not found in image container');
            }
        }

        // Override the editor's redraw to handle our temp box
        const originalRedraw = inlineEditor.editor.redrawCanvas;
        inlineEditor.editor.redrawCanvas = function() {
            // Call original redraw
            originalRedraw.call(this);

            // Add our temp box if we're drawing
            if (inlineEditor.isDrawing && inlineEditor.tempBox) {
                this.ctx.strokeStyle = '#00FF00'; // Green
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(
                    inlineEditor.tempBox[0],
                    inlineEditor.tempBox[1],
                    inlineEditor.tempBox[2] - inlineEditor.tempBox[0],
                    inlineEditor.tempBox[3] - inlineEditor.tempBox[1]
                );
            }
        };

        // Initialize UI
        populateClassSelector();
        updateBboxSelector();
        setupEventHandlers();

        // Setup image interactions - only if we found the canvas
        if (inlineEditor.canvasElement) {
            setupCanvasInteraction(inlineEditor.canvasElement);
        }

        // Update the hidden field with initial bbox data
        updateHiddenBboxesField();

        inlineEditor.initialized = true;
        debug('Inline editor initialized and connected to main editor');
    }

    // Rest of your code remains the same...
    // ...

    // Setup event handlers for UI controls
    function setupEventHandlers() {
        // Delete box button
        if (deleteBoxBtn) {
            deleteBoxBtn.addEventListener('click', deleteCurrentBox);
        }

        // Cancel changes button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelChanges);
        }

        // Bbox selector dropdown
        if (inlineBboxSelector) {
            inlineBboxSelector.addEventListener('change', function(e) {
                const selectedIndex = parseInt(e.target.value);
                if (!isNaN(selectedIndex) && selectedIndex >= 0) {
                    selectBox(selectedIndex);
                }
            });
        }

        // Class search input
        if (inlineClassSearch) {
            inlineClassSearch.addEventListener('input', function(e) {
                const searchTerm = e.target.value.toLowerCase();

                if (searchTerm && inlineClassSelector) {
                    let firstMatchFound = false;

                    // Find first matching option
                    Array.from(inlineClassSelector.options).forEach(option => {
                        const optionText = option.textContent.toLowerCase();

                        if (optionText.includes(searchTerm) && !firstMatchFound) {
                            option.selected = true;
                            firstMatchFound = true;

                            // Update the class of the selected box
                            if (firstMatchFound && inlineEditor.currentBoxIndex >= 0) {
                                updateSelectedBoxClass(parseInt(option.value));
                            }
                        }
                    });
                }
            });
        }

        // Class selector dropdown
        if (inlineClassSelector) {
            inlineClassSelector.addEventListener('change', function() {
                const selectedOption = inlineClassSelector.options[inlineClassSelector.selectedIndex];

                if (selectedOption) {
                    // Update search input
                    if (inlineClassSearch) {
                        inlineClassSearch.value = selectedOption.textContent;
                    }

                    // Update box class
                    updateSelectedBoxClass(parseInt(selectedOption.value));
                }
            });
        }
    }

    // Populate class selector dropdown
    function populateClassSelector() {
        if (!inlineClassSelector) return;

        // Clear existing options
        inlineClassSelector.innerHTML = '';

        // Add class options
        if (Object.keys(inlineEditor.classLabels).length > 0) {
            // Sort class IDs numerically
            const sortedClassIds = Object.keys(inlineEditor.classLabels)
                .sort((a, b) => parseInt(a) - parseInt(b));

            sortedClassIds.forEach(classId => {
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = `${classId} - ${inlineEditor.classLabels[classId]}`;
                inlineClassSelector.appendChild(option);
            });

            debug(`Populated class selector with ${sortedClassIds.length} classes`);
        } else {
            // Fall back to generic classes
            for (let i = 0; i < 1000; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `Class ${i}`;
                inlineClassSelector.appendChild(option);
            }
            debug('Populated class selector with generic classes');
        }
    }

    // Update box selector dropdown
    function updateBboxSelector() {
        if (!inlineBboxSelector || !inlineEditor.bboxes) return;

        // Clear existing options
        inlineBboxSelector.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = "-1";
        defaultOption.text = "-- Select a box --";
        inlineBboxSelector.appendChild(defaultOption);

        // Count boxes above threshold for debugging
        let aboveThresholdCount = 0;

        // Add options for each box
        if (inlineEditor.bboxes.boxes && inlineEditor.bboxes.scores) {
            inlineEditor.bboxes.boxes.forEach((_, i) => {
                if (inlineEditor.bboxes.scores[i] >= inlineEditor.threshold) {
                    aboveThresholdCount++;

                    const option = document.createElement('option');
                    option.value = i;

                    // IMPORTANT: Ensure proper class label display
                    let labelText = `Box ${i + 1}`;
                    if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] !== undefined) {
                        const labelId = inlineEditor.bboxes.labels[i];
                        const labelName = inlineEditor.classLabels[labelId] || `Class ${labelId}`;
                        labelText = `Box ${i + 1}: ${labelId} - ${labelName}`;
                    }

                    option.text = labelText;
                    option.selected = i === inlineEditor.currentBoxIndex;
                    inlineBboxSelector.appendChild(option);
                }
            });
        }

        debug(`Added ${aboveThresholdCount} boxes to the selector (threshold: ${inlineEditor.threshold})`);

        // Update selected value
        if (inlineEditor.currentBoxIndex >= 0) {
            inlineBboxSelector.value = inlineEditor.currentBoxIndex;
        } else {
            inlineBboxSelector.value = "-1";
        }
    }

    // Select a box
    function selectBox(boxIndex) {
        inlineEditor.currentBoxIndex = boxIndex;

        if (inlineEditor.editor) {
            inlineEditor.editor.selectedBboxIndex = boxIndex;
            inlineEditor.editor.redrawCanvas();
        }

        // Debug selected box and its label
        if (boxIndex >= 0 && inlineEditor.bboxes && inlineEditor.bboxes.labels) {
            debug(`Selected box ${boxIndex} with label: ${inlineEditor.bboxes.labels[boxIndex]}`);
        }

        // Make sure the correct class is selected in the UI
        if (inlineClassSelector && inlineClassSearch &&
            inlineEditor.bboxes.labels && boxIndex < inlineEditor.bboxes.labels.length) {

            const labelId = inlineEditor.bboxes.labels[boxIndex];

            // Ensure the selector value is set correctly
            if (labelId !== undefined) {
                debug(`Setting class selector to ${labelId}`);
                inlineClassSelector.value = labelId.toString();

                // Find the proper option text
                let displayText;
                try {
                    // First try to get text from the selected option
                    const selectedOption = Array.from(inlineClassSelector.options).find(
                        option => option.value === labelId.toString()
                    );

                    if (selectedOption) {
                        displayText = selectedOption.textContent;
                    } else if (inlineEditor.classLabels && inlineEditor.classLabels[labelId]) {
                        displayText = `${labelId} - ${inlineEditor.classLabels[labelId]}`;
                    } else {
                        displayText = `Class ${labelId}`;
                    }
                } catch (e) {
                    displayText = `Class ${labelId}`;
                    console.error('Error finding class display text:', e);
                }

                // Update search input with proper label
                if (inlineClassSearch) {
                    inlineClassSearch.value = displayText;
                    debug(`Set class search input to: ${displayText}`);
                }
            }
        }

        debug(`Selected box ${boxIndex}`);
    }

    // Delete the current box
    function deleteCurrentBox() {
        if (inlineEditor.currentBoxIndex < 0 || !inlineEditor.bboxes ||
            inlineEditor.currentBoxIndex >= inlineEditor.bboxes.boxes.length) {
            debug('No box selected for deletion');
            return;
        }

        const deletedIndex = inlineEditor.currentBoxIndex;

        // Remove box, score, and label
        inlineEditor.bboxes.boxes.splice(deletedIndex, 1);
        inlineEditor.bboxes.scores.splice(deletedIndex, 1);

        if (inlineEditor.bboxes.labels) {
            inlineEditor.bboxes.labels.splice(deletedIndex, 1);
        }
        
        // Also remove from gt if it exists
        if (inlineEditor.bboxes.gt) {
            inlineEditor.bboxes.gt.splice(deletedIndex, 1);
        }

        // Reset selection
        inlineEditor.currentBoxIndex = -1;

        // Update the editor if available
        if (inlineEditor.editor) {
            inlineEditor.editor.selectedBboxIndex = -1;
            inlineEditor.editor.bboxes = inlineEditor.bboxes;
            inlineEditor.editor.redrawCanvas();
        }

        // Update UI
        updateBboxSelector();

        // Update hidden form field
        updateHiddenBboxesField();

        debug(`Deleted box ${deletedIndex}`);
    }

    // Cancel all changes
    function cancelChanges() {
        if (!inlineEditor.originalBboxes) {
            debug('No original bboxes to restore');
            return;
        }

        // Restore original bboxes
        inlineEditor.bboxes = JSON.parse(JSON.stringify(inlineEditor.originalBboxes));

        // Reset selection
        inlineEditor.currentBoxIndex = -1;

        // Update the editor
        if (inlineEditor.editor) {
            inlineEditor.editor.selectedBboxIndex = -1;
            inlineEditor.editor.bboxes = inlineEditor.bboxes;
            inlineEditor.editor.redrawCanvas();
        }

        // Update UI
        updateBboxSelector();

        // Update hidden form field
        updateHiddenBboxesField();

        debug('Cancelled all changes');
    }

    // Update class of selected box
    function updateSelectedBoxClass(classId) {
        if (inlineEditor.currentBoxIndex < 0 || !inlineEditor.bboxes ||
            inlineEditor.currentBoxIndex >= inlineEditor.bboxes.boxes.length) {
            return;
        }

        // Ensure labels array exists
        if (!inlineEditor.bboxes.labels) {
            inlineEditor.bboxes.labels = Array(inlineEditor.bboxes.boxes.length).fill(0);
            debug('Created missing labels array during class update');
        }

        // Update the class
        inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex] = classId;

        // If there's a "gt" field, update it too to keep them in sync
        if (inlineEditor.bboxes.gt) {
            inlineEditor.bboxes.gt[inlineEditor.currentBoxIndex] = classId;
            debug(`Updated gt field for box ${inlineEditor.currentBoxIndex} to class ${classId}`);
        }

        // Update the editor
        if (inlineEditor.editor) {
            inlineEditor.editor.bboxes = inlineEditor.bboxes;
            inlineEditor.editor.redrawCanvas();
        }

        // Update UI
        updateBboxSelector();

        // Update hidden field
        updateHiddenBboxesField();

        debug(`Updated box ${inlineEditor.currentBoxIndex} class to ${classId}`);
    }

    // Save boxes via AJAX
    function saveBboxes() {
        // Get the current image name
        const imageNameInput = document.querySelector('input[name="image_name"]');
        const imageName = imageNameInput ? imageNameInput.value : 'unknown';

        // Get username from URL
        const pathParts = window.location.pathname.split('/');
        const username = pathParts[1]; // Assuming URL structure is /<username>/label

        // Format data for saving
        let bboxDataArray = [];

        if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes || !inlineEditor.bboxes.scores) {
            console.error('Invalid bboxes data structure:', inlineEditor.bboxes);
            return;
        }

        // Debug all boxes
        debug('All boxes before save:');
        debug(JSON.stringify(inlineEditor.bboxes.boxes));
        debug('All scores before save:');
        debug(JSON.stringify(inlineEditor.bboxes.scores));
        debug('All labels before save:');
        debug(JSON.stringify(inlineEditor.bboxes.labels));
        // Debug gt field if it exists
        if (inlineEditor.bboxes.gt) {
            debug('All gt values before save:');
            debug(JSON.stringify(inlineEditor.bboxes.gt));
        }

        inlineEditor.bboxes.boxes.forEach((box, i) => {
            if (inlineEditor.bboxes.scores[i] >= inlineEditor.threshold) {
                // Ensure we have a proper label for this box
                // First check labels, fall back to gt if needed
                let label = 0;
                if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] !== undefined) {
                    label = inlineEditor.bboxes.labels[i];
                } else if (inlineEditor.bboxes.gt && inlineEditor.bboxes.gt[i] !== undefined) {
                    label = inlineEditor.bboxes.gt[i];
                }

                bboxDataArray.push({
                    coordinates: box,
                    label: label
                });
            }
        });

        // Create request object
        const saveData = {
            image_name: imageName,
            bboxes: bboxDataArray
        };

        debug(`Saving ${bboxDataArray.length} bboxes with Ajax call`);
        debug(`Save data: ${JSON.stringify(saveData).substring(0, 200)}...`);

        // Make AJAX call
        fetch(`/${username}/save_bboxes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(saveData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save bboxes');
            }
            return response.json();
        })
        .then(data => {
            debug('Bboxes saved successfully via Ajax');

            // Update the hidden field for form submission
            updateHiddenBboxesField();

            // Update the original bboxes after a successful save
            inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.bboxes));
        })
        .catch(error => {
            console.error('Error saving bboxes:', error);

            // Show error notification even for errors
            showCenterNotification('Error Saving', 'Failed to save bounding boxes. Please try again.');
        });
    }

    // Setup direct interaction with the canvas element
    function setupCanvasInteraction(canvasElement) {
        if (!canvasElement) {
            console.error('No canvas element provided for interaction setup');
            return;
        }

        debug('Setting up canvas interaction handlers');

        // Helper function to get canvas coordinates
        function getCanvasCoordinates(event) {
            const rect = canvasElement.getBoundingClientRect();

            // Calculate scaling factor - IMPORTANT: use the canvas dimensions
            const scaleX = canvasElement.width / rect.width;
            const scaleY = canvasElement.height / rect.height;

            // Calculate position relative to the canvas
            const x = (event.clientX - rect.left) * scaleX;
            const y = (event.clientY - rect.top) * scaleY;

            return {
                x: Math.max(0, Math.min(canvasElement.width, x)),
                y: Math.max(0, Math.min(canvasElement.height, y))
            };
        }

        // Mouse down - start drawing or selection
        canvasElement.addEventListener('mousedown', function(e) {
            e.preventDefault();

            // Get coordinates
            const coords = getCanvasCoordinates(e);

            // Check if we clicked on an existing box
            const result = findBoxUnderCursor(coords.x, coords.y);

            if (result.found) {
                // We clicked on a box border or corner
                if (result.isCorner) {
                    // Start resizing
                    startResizing(result.index, result.corner, coords);
                } else if (result.isBorder) {
                    // Start dragging
                    startDragging(result.index, coords);
                }
                // We no longer have an option for interior clicks - only borders/corners
            } else {
                // Start drawing a new box
                startDrawing(coords);
            }
        });

        // Mouse move - update drawing/dragging/resizing
        canvasElement.addEventListener('mousemove', function(e) {
            if (!inlineEditor.bboxes) return;

            const coords = getCanvasCoordinates(e);

            if (inlineEditor.isDrawing) {
                // Update drawing
                updateDrawing(coords);
            } else if (inlineEditor.isDragging) {
                // Update dragging
                updateDragging(coords);
            } else if (inlineEditor.isResizing) {
                // Update resizing
                updateResizing(coords);
            } else {
                // Update cursor based on hover position
                updateCursor(coords, canvasElement);
            }
        });

        // Mouse up - finish drawing/dragging/resizing
        canvasElement.addEventListener('mouseup', function() {
            if (inlineEditor.isDrawing) {
                // Finish drawing
                finishDrawing();
            } else if (inlineEditor.isDragging) {
                // Finish dragging
                finishDragging();
            } else if (inlineEditor.isResizing) {
                // Finish resizing
                finishResizing();
            }
        });

        // Mouse leave - cancel operations
        canvasElement.addEventListener('mouseleave', function() {
            cancelOperation();
        });

        // Find box under cursor with detection for corners and borders
        // MODIFIED: Only detect borders and corners, not interior clicks
        function findBoxUnderCursor(x, y) {
            const result = {
                found: false,
                index: -1,
                isCorner: false,
                isBorder: false,
                corner: null
            };

            if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes) return result;

            // Check corners of selected box first (for resizing)
            if (inlineEditor.currentBoxIndex >= 0 &&
                inlineEditor.currentBoxIndex < inlineEditor.bboxes.boxes.length) {

                const box = inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex];
                const cornerResult = isNearCorner(x, y, box);

                if (cornerResult) {
                    result.found = true;
                    result.index = inlineEditor.currentBoxIndex;
                    result.isCorner = true;
                    result.corner = cornerResult;
                    return result;
                }

                // Check borders
                if (isNearBorder(x, y, box)) {
                    result.found = true;
                    result.index = inlineEditor.currentBoxIndex;
                    result.isBorder = true;
                    return result;
                }
            }

            // Check all boxes from top to bottom (visual layers)
            // IMPORTANT: Only check borders and corners, not inside box
            for (let i = inlineEditor.bboxes.boxes.length - 1; i >= 0; i--) {
                if (inlineEditor.bboxes.scores[i] < inlineEditor.threshold) continue;

                const box = inlineEditor.bboxes.boxes[i];

                // First check corners
                const cornerResult = isNearCorner(x, y, box);
                if (cornerResult) {
                    result.found = true;
                    result.index = i;
                    result.isCorner = true;
                    result.corner = cornerResult;
                    return result;
                }

                // Then check borders
                if (isNearBorder(x, y, box)) {
                    result.found = true;
                    result.index = i;
                    result.isBorder = true;
                    return result;
                }

                // REMOVED: Interior click detection - we only want to detect borders and corners
            }

            return result;
        }

        // Check if point is near box corner
        function isNearCorner(x, y, box) {
            const threshold = 10;

            // Check top-left corner
            if (Math.abs(x - box[0]) <= threshold && Math.abs(y - box[1]) <= threshold) {
                return 'topLeft';
            }

            // Check top-right corner
            if (Math.abs(x - box[2]) <= threshold && Math.abs(y - box[1]) <= threshold) {
                return 'topRight';
            }

            // Check bottom-left corner
            if (Math.abs(x - box[0]) <= threshold && Math.abs(y - box[3]) <= threshold) {
                return 'bottomLeft';
            }

            // Check bottom-right corner
            if (Math.abs(x - box[2]) <= threshold && Math.abs(y - box[3]) <= threshold) {
                return 'bottomRight';
            }

            return null;
        }

        // Check if point is near box border
        function isNearBorder(x, y, box) {
            const threshold = 5; // Increased from previous version

            // Left border
            if (Math.abs(x - box[0]) <= threshold && y >= box[1] && y <= box[3]) {
                return true;
            }

            // Right border
            if (Math.abs(x - box[2]) <= threshold && y >= box[1] && y <= box[3]) {
                return true;
            }

            // Top border
            if (Math.abs(y - box[1]) <= threshold && x >= box[0] && x <= box[2]) {
                return true;
            }

            // Bottom border
            return Math.abs(y - box[3]) <= threshold && x >= box[0] && x <= box[2];
        }

        // Update cursor based on mouse position
        function updateCursor(coords, element) {
            if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes) return;

            const result = findBoxUnderCursor(coords.x, coords.y);

            if (result.found) {
                if (result.isCorner) {
                    // Set resize cursor based on corner
                    switch (result.corner) {
                        case 'topLeft':
                        case 'bottomRight':
                            element.style.cursor = 'nwse-resize';
                            break;
                        case 'topRight':
                        case 'bottomLeft':
                            element.style.cursor = 'nesw-resize';
                            break;
                    }
                } else if (result.isBorder) {
                    // Set move cursor
                    element.style.cursor = 'move';
                }
            } else {
                // Default cursor for drawing new boxes
                element.style.cursor = 'crosshair';
            }
        }

        // Drawing operations
        function startDrawing(coords) {
            inlineEditor.isDrawing = true;
            inlineEditor.drawStartPos = coords;
            debug(`Started drawing at x=${coords.x}, y=${coords.y}`);
        }

        function updateDrawing(coords) {
            if (!inlineEditor.isDrawing) return;

            // Create temporary box for visual feedback
            inlineEditor.tempBox = [
                Math.min(inlineEditor.drawStartPos.x, coords.x),
                Math.min(inlineEditor.drawStartPos.y, coords.y),
                Math.max(inlineEditor.drawStartPos.x, coords.x),
                Math.max(inlineEditor.drawStartPos.y, coords.y)
            ];

            // Redraw with temporary box
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }
        }

        function finishDrawing() {
            if (!inlineEditor.isDrawing) return;

            // Only create box if we have a temporary box and it has reasonable size
            if (inlineEditor.tempBox) {
                const width = inlineEditor.tempBox[2] - inlineEditor.tempBox[0];
                const height = inlineEditor.tempBox[3] - inlineEditor.tempBox[1];

                if (width > 5 && height > 5) {
                    // Add the new box
                    inlineEditor.bboxes.boxes.push([...inlineEditor.tempBox]);
                    inlineEditor.bboxes.scores.push(100); // 100% confidence

                    // Add label - first check window.lastSelectedClassId from checkbox.js
                    let classId = 0;
                    if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
                        classId = parseInt(window.lastSelectedClassId);
                        debug(`Using global lastSelectedClassId: ${classId}`);
                    } else if (inlineEditor.lastSelectedClassId !== null) {
                        classId = parseInt(inlineEditor.lastSelectedClassId);
                        debug(`Using local lastSelectedClassId: ${classId}`);
                    }

                    // Ensure labels array exists
                    if (!inlineEditor.bboxes.labels) {
                        inlineEditor.bboxes.labels = Array(inlineEditor.bboxes.boxes.length - 1).fill(0);
                        debug('Created missing labels array during drawing');
                    }

                    // Add the new box's class
                    inlineEditor.bboxes.labels.push(classId);

                    // IMPORTANT FIX: Also update gt array if it exists
                    if (inlineEditor.bboxes.gt) {
                        inlineEditor.bboxes.gt.push(classId);
                        debug(`Added new box to gt array with class ${classId}`);
                    }

                    // Select the new box
                    inlineEditor.currentBoxIndex = inlineEditor.bboxes.boxes.length - 1;

                    // Update editor if available
                    if (inlineEditor.editor) {
                        inlineEditor.editor.selectedBboxIndex = inlineEditor.currentBoxIndex;
                        inlineEditor.editor.bboxes = inlineEditor.bboxes;
                    }

                    // Update UI
                    updateBboxSelector();

                    // Update class selector UI to match the assigned class
                    if (inlineClassSelector) {
                        inlineClassSelector.value = classId.toString();

                        // Find the proper option text
                        const selectedOption = Array.from(inlineClassSelector.options).find(
                            option => option.value === classId.toString()
                        );

                        // Update search input too
                        if (inlineClassSearch) {
                            if (selectedOption) {
                                inlineClassSearch.value = selectedOption.textContent;
                            } else if (inlineEditor.classLabels && inlineEditor.classLabels[classId]) {
                                inlineClassSearch.value = `${classId} - ${inlineEditor.classLabels[classId]}`;
                            } else {
                                inlineClassSearch.value = `Class ${classId}`;
                            }
                        }
                    }

                    // Update hidden field for form submission
                    updateHiddenBboxesField();

                    debug(`Created new box with class ${classId}: [${inlineEditor.tempBox.join(', ')}]`);
                }
            }

            // Clean up
            inlineEditor.isDrawing = false;
            inlineEditor.tempBox = null;

            // Redraw final result
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }
        }

        // Dragging operations
        function startDragging(boxIndex, coords) {
            inlineEditor.isDragging = true;
            inlineEditor.dragStartX = coords.x;
            inlineEditor.dragStartY = coords.y;
            inlineEditor.currentBoxIndex = boxIndex;

            // Store original box for dragging
            inlineEditor.dragStartBox = [...inlineEditor.bboxes.boxes[boxIndex]];

            // Update editor selection
            if (inlineEditor.editor) {
                inlineEditor.editor.selectedBboxIndex = boxIndex;
            }

            // Update UI
            updateBboxSelector();

            // Update class selectors
            if (inlineClassSelector && inlineClassSearch &&
                inlineEditor.bboxes.labels && boxIndex < inlineEditor.bboxes.labels.length) {

                const labelId = inlineEditor.bboxes.labels[boxIndex];

                // Set the selector value
                inlineClassSelector.value = labelId.toString();

                // Find the proper option text
                const selectedOption = Array.from(inlineClassSelector.options).find(
                    option => option.value === labelId.toString()
                );

                // Update search input
                if (selectedOption) {
                    inlineClassSearch.value = selectedOption.textContent;
                } else if (inlineEditor.classLabels && inlineEditor.classLabels[labelId]) {
                    inlineClassSearch.value = `${labelId} - ${inlineEditor.classLabels[labelId]}`;
                } else {
                    inlineClassSearch.value = `Class ${labelId}`;
                }
            }

            debug(`Started dragging box ${boxIndex}`);
        }

        function updateDragging(coords) {
            if (!inlineEditor.isDragging || inlineEditor.currentBoxIndex < 0) return;

            // Calculate movement delta
            const deltaX = coords.x - inlineEditor.dragStartX;
            const deltaY = coords.y - inlineEditor.dragStartY;

            // Get original box dimensions
            const originalBox = inlineEditor.dragStartBox;
            const width = originalBox[2] - originalBox[0];
            const height = originalBox[3] - originalBox[1];

            // Calculate new position, constrained to canvas boundaries
            const newX1 = Math.max(0, Math.min(canvasElement.width - width, originalBox[0] + deltaX));
            const newY1 = Math.max(0, Math.min(canvasElement.height - height, originalBox[1] + deltaY));

            // Update the box
            inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = [
                newX1,
                newY1,
                newX1 + width,
                newY1 + height
            ];

            // Important: Redraw to show real-time updates
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }
        }

        function finishDragging() {
            if (!inlineEditor.isDragging) return;

            // Clean up
            inlineEditor.isDragging = false;
            inlineEditor.dragStartBox = null;

            // Final redraw to ensure proper display
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }

            // Update hidden field
            updateHiddenBboxesField();

            debug(`Finished dragging box ${inlineEditor.currentBoxIndex}`);
        }

        // Resizing operations
        function startResizing(boxIndex, corner, coords) {
            inlineEditor.isResizing = true;
            inlineEditor.resizeCorner = corner;
            inlineEditor.dragStartX = coords.x;
            inlineEditor.dragStartY = coords.y;
            inlineEditor.currentBoxIndex = boxIndex;

            // Store original box for resizing
            inlineEditor.dragStartBox = [...inlineEditor.bboxes.boxes[boxIndex]];

            // Update editor selection
            if (inlineEditor.editor) {
                inlineEditor.editor.selectedBboxIndex = boxIndex;
            }

            // Update UI
            updateBboxSelector();

            // Update class selectors
            if (inlineClassSelector && inlineClassSearch &&
                inlineEditor.bboxes.labels && boxIndex < inlineEditor.bboxes.labels.length) {

                const labelId = inlineEditor.bboxes.labels[boxIndex];

                // Set the selector value
                inlineClassSelector.value = labelId.toString();

                // Find the proper option text
                const selectedOption = Array.from(inlineClassSelector.options).find(
                    option => option.value === labelId.toString()
                );

                // Update search input
                if (selectedOption) {
                    inlineClassSearch.value = selectedOption.textContent;
                } else if (inlineEditor.classLabels && inlineEditor.classLabels[labelId]) {
                    inlineClassSearch.value = `${labelId} - ${inlineEditor.classLabels[labelId]}`;
                } else {
                    inlineClassSearch.value = `Class ${labelId}`;
                }
            }

            debug(`Started resizing box ${boxIndex} from ${corner}`);
        }

        function updateResizing(coords) {
            if (!inlineEditor.isResizing || inlineEditor.currentBoxIndex < 0) return;

            const box = [...inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex]];

            // Update coordinates based on which corner is being dragged
            switch (inlineEditor.resizeCorner) {
                case 'topLeft':
                    box[0] = Math.min(box[2] - 5, Math.max(0, coords.x));
                    box[1] = Math.min(box[3] - 5, Math.max(0, coords.y));
                    break;
                case 'topRight':
                    box[2] = Math.max(box[0] + 5, Math.min(canvasElement.width, coords.x));
                    box[1] = Math.min(box[3] - 5, Math.max(0, coords.y));
                    break;
                case 'bottomLeft':
                    box[0] = Math.min(box[2] - 5, Math.max(0, coords.x));
                    box[3] = Math.max(box[1] + 5, Math.min(canvasElement.height, coords.y));
                    break;
                case 'bottomRight':
                    box[2] = Math.max(box[0] + 5, Math.min(canvasElement.width, coords.x));
                    box[3] = Math.max(box[1] + 5, Math.min(canvasElement.height, coords.y));
                    break;
            }

            // Update the box
            inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = box;

            // Important: Redraw to show real-time updates
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }
        }

        function finishResizing() {
            if (!inlineEditor.isResizing) return;

            // Clean up
            inlineEditor.isResizing = false;
            inlineEditor.resizeCorner = null;
            inlineEditor.dragStartBox = null;

            // Final redraw to ensure proper display
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }

            // Update hidden field
            updateHiddenBboxesField();

            debug(`Finished resizing box ${inlineEditor.currentBoxIndex}`);
        }

        // Cancel any ongoing operation
        function cancelOperation() {
            if (inlineEditor.isDrawing) {
                inlineEditor.isDrawing = false;
                inlineEditor.tempBox = null;
                debug('Drawing cancelled');
            }

            if (inlineEditor.isDragging) {
                inlineEditor.isDragging = false;

                // Restore original box position
                if (inlineEditor.dragStartBox && inlineEditor.currentBoxIndex >= 0) {
                    inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = [...inlineEditor.dragStartBox];
                }

                inlineEditor.dragStartBox = null;
                debug('Dragging cancelled');
            }

            if (inlineEditor.isResizing) {
                inlineEditor.isResizing = false;
                inlineEditor.resizeCorner = null;

                // Restore original box size
                if (inlineEditor.dragStartBox && inlineEditor.currentBoxIndex >= 0) {
                    inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = [...inlineEditor.dragStartBox];
                }

                inlineEditor.dragStartBox = null;
                debug('Resizing cancelled');
            }

            // Make sure to redraw after cancellation
            if (inlineEditor.editor) {
                inlineEditor.editor.redrawCanvas();
            }
        }
    }

    // Initialize debug message to track class label handling
    debug("BBox Editor initialized with border-only selection, selective notifications, and gt field support");
});