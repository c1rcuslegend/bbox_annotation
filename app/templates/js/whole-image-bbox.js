/**
 * Add whole image bounding box functionality
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Registering Whole Image BBox functionality');

    // Add event listener for the whole image button
    const wholeImageBtn = document.getElementById('inline-bbox-whole-image');
    if (wholeImageBtn) {
        wholeImageBtn.addEventListener('click', function() {
            createWholeImageBBox();
        });
    }
    const wholeImageBtn2 = document.getElementById('bbox-whole-image');
    if (wholeImageBtn2) {
        wholeImageBtn2.addEventListener('click', function() {
            createWholeImageBBox();
        });
    }
});

/**
 * Creates a bounding box covering the entire image and selects it
 * Works in both inline editor and advanced editor modes
 */
function createWholeImageBBox() {
    // Try different ways to get editor references
    let editor = null;
    let bboxes = null;
    let img = null;
    let isInlineMode = false;

    // First check if we're in the inline editor mode
    if (window.inlineEditor) {
        console.log('Using inline editor reference (global inlineEditor)');
        isInlineMode = true;

        // Get the editor references from the inline editor
        if (window.inlineEditor.editor) {
            editor = window.inlineEditor.editor;
        } else if (window.bboxEditor) {
            editor = window.bboxEditor;
        }

        // Get bboxes from inline editor
        bboxes = window.inlineEditor.bboxes;

        // Get the image element
        img = document.querySelector('#image-with-bboxes img');
    }
    // Check if we're in the modal/advanced editor context
    else if (window.BBoxEditorUI && window.BBoxEditorUI.editor) {
        console.log('Using advanced editor reference');
        editor = window.BBoxEditorUI.editor;
        bboxes = editor.bboxes;
        img = editor.img;
    }
    // Check if there's a global editor reference (from the main page)
    else if (window.bboxEditor) {
        console.log('Using global editor reference');
        editor = window.bboxEditor;
        bboxes = editor.bboxes;
        img = editor.img;

        // Check if we're still in inline mode
        if (document.getElementById('inline-bbox-selector')) {
            isInlineMode = true;
        }
    }

    // As a fallback, check for the bbox-data element
    if (!bboxes) {
        const bboxDataElem = document.getElementById('bbox-data');
        if (bboxDataElem && bboxDataElem.textContent) {
            try {
                bboxes = JSON.parse(bboxDataElem.textContent);
                console.log('Found bboxes data from hidden element');

                // Check if we're in inline mode
                if (document.getElementById('inline-bbox-selector')) {
                    isInlineMode = true;
                }
            } catch (e) {
                console.error('Error parsing inline bbox data:', e);
            }
        }
    }

    // Check if we have what we need
    if (!img) {
        console.error('Could not find image element for whole-image bbox');
        return;
    }

    if (!bboxes) {
        console.error('Could not find bboxes data for whole-image bbox');
        bboxes = { boxes: [], scores: [], labels: [] };
    }

    // Ensure we have labels array
    if (!bboxes.labels) {
        bboxes.labels = [];
    }

    // Get the image dimensions
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    // Create a box covering the whole image
    const wholeImageBox = [0, 0, imgWidth, imgHeight];

    // Add box to bboxes with a score of 100%
    bboxes.boxes.push(wholeImageBox);
    bboxes.scores.push(100);

    // Determine the class ID to use
    let classId = 0;

    // Try to get the class from the inline editor first
    if (isInlineMode) {
        // Try to get the last selected class ID from various sources
        if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
            classId = parseInt(window.lastSelectedClassId);
            console.log(`Using global lastSelectedClassId: ${classId}`);
        }

        // Also check for selected class in the inline selector
        const inlineClassSelector = document.getElementById('inline-class-selector');
        if (inlineClassSelector && inlineClassSelector.value) {
            classId = parseInt(inlineClassSelector.value);
            console.log(`Using inline class selector value: ${classId}`);
        }
    }
    // Try to get class from advanced editor mode
    else {
        const classSelector = document.getElementById('bbox-class-selector');
        if (classSelector && classSelector.value) {
            classId = parseInt(classSelector.value);
            console.log(`Using advanced editor class selector: ${classId}`);
        }
    }

    // Add label with the determined class ID
    bboxes.labels.push(classId);

    // Also update gt field if it exists
    if (bboxes.gt) {
        bboxes.gt.push(classId);
        console.log(`Added whole-image box to gt array with class ${classId}`);
    }

    // Update the selected box index
    const newBoxIndex = bboxes.boxes.length - 1;

    console.log(`Created whole-image bounding box [${wholeImageBox.join(', ')}] with class ${classId}`);

    // Update the UI based on which mode we're in
    if (isInlineMode) {
        // For inline mode
        console.log('Updating inline editor UI with new whole-image bbox');

        // Update the inline editor's state directly
        if (window.inlineEditor) {
            window.inlineEditor.bboxes = bboxes;
            window.inlineEditor.currentBoxIndex = newBoxIndex;
            console.log(`Set inlineEditor.currentBoxIndex to ${newBoxIndex}`);

            // If the editor is connected, update it too
            if (window.inlineEditor.editor) {
                window.inlineEditor.editor.bboxes = bboxes;
                window.inlineEditor.editor.selectedBboxIndex = newBoxIndex;
                window.inlineEditor.editor.redrawCanvas();
                console.log('Updated connected editor');
            }
        }

        // Update the hidden bboxes field if it exists
        const bboxesField = document.getElementById('bboxes-data-field');
        if (bboxesField) {
            // Format data for form field
            let bboxDataArray = [];

            bboxes.boxes.forEach((box, i) => {
                if (bboxes.scores[i] >= 0.5) { // Default threshold if not specified
                    bboxDataArray.push({
                        coordinates: box,
                        label: bboxes.labels && bboxes.labels[i] !== undefined ? bboxes.labels[i] : 0
                    });
                }
            });

            bboxesField.value = JSON.stringify(bboxDataArray);
            console.log('Updated hidden bboxes field in inline mode');
        }

        // Update the bbox data element
        const bboxDataElem = document.getElementById('bbox-data');
        if (bboxDataElem) {
            bboxDataElem.textContent = JSON.stringify(bboxes);
        }

        // Get the selector and update it
        const inlineBboxSelector = document.getElementById('inline-bbox-selector');
        if (inlineBboxSelector) {
            // Clear existing options first to ensure we have updated values
            while (inlineBboxSelector.options.length > 0) {
                inlineBboxSelector.remove(0);
            }

            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = "-1";
            defaultOption.text = "-- Select a box --";
            inlineBboxSelector.add(defaultOption);

            // Add options for all boxes above threshold
            let hasSelectedOption = false;
            bboxes.boxes.forEach((box, i) => {
                if (bboxes.scores[i] >= 0.5) { // Default threshold
                    const option = document.createElement('option');
                    option.value = i.toString();

                    // Get proper class name if available
                    let className = `Class ${bboxes.labels[i]}`;
                    const classesElement = document.getElementById('human-readable-classes');
                    if (classesElement && classesElement.textContent) {
                        try {
                            const classLabels = JSON.parse(classesElement.textContent);
                            if (classLabels[bboxes.labels[i]]) {
                                className = classLabels[bboxes.labels[i]];
                            }
                        } catch (e) {}
                    }

                    option.text = `Box ${i + 1}: ${bboxes.labels[i]} - ${className}`;
                    option.selected = i === newBoxIndex;
                    inlineBboxSelector.appendChild(option);

                    if (i === newBoxIndex) {
                        hasSelectedOption = true;
                    }
                }
            });

            // Force selection if needed
            if (hasSelectedOption) {
                inlineBboxSelector.value = newBoxIndex.toString();
                console.log(`Set inline selector value to ${newBoxIndex}`);
            }

            // Call selectBox function if it exists in the inline editor
            if (window.inlineEditor && typeof window.inlineEditor.selectBox === 'function') {
                window.inlineEditor.selectBox(newBoxIndex);
                console.log('Called selectBox function directly');
            } else {
                // Otherwise manually dispatch a change event
                const event = new Event('change');
                inlineBboxSelector.dispatchEvent(event);
                console.log('Dispatched change event on selector');
            }
        }

        // Manually update the class selector and search field
        const inlineClassSelector = document.getElementById('inline-class-selector');
        const inlineClassSearch = document.getElementById('inline-class-search');

        if (inlineClassSelector) {
            inlineClassSelector.value = classId.toString();
            console.log(`Set inline class selector to ${classId}`);

            // Also update the class search if it exists
            if (inlineClassSearch) {
                // Try to get the proper class name
                let displayText = `Class ${classId}`;

                try {
                    // Look for class labels
                    const classesElement = document.getElementById('human-readable-classes');
                    if (classesElement && classesElement.textContent) {
                        const classLabels = JSON.parse(classesElement.textContent);
                        if (classLabels[classId]) {
                            displayText = `${classId} - ${classLabels[classId]}`;
                        }
                    } else if (editor && editor.classLabels && editor.classLabels[classId]) {
                        displayText = `${classId} - ${editor.classLabels[classId]}`;
                    }
                } catch (e) {
                    console.error('Error getting class display text:', e);
                }

                inlineClassSearch.value = displayText;
                console.log(`Set inline class search to: ${displayText}`);
            }
        }

        // Force the canvas to update by directly calling its redraws
        if (editor) {
            editor.redrawCanvas();
            console.log('Called editor.redrawCanvas()');
        } else if (window.bboxEditor) {
            window.bboxEditor.redrawCanvas();
            console.log('Called window.bboxEditor.redrawCanvas()');
        }

        // Try to call the updateSelectedBoxClass function if it exists
        if (window.inlineEditor && typeof window.inlineEditor.updateSelectedBoxClass === 'function') {
            window.inlineEditor.updateSelectedBoxClass(classId);
            console.log('Called updateSelectedBoxClass to ensure proper class display');
        }

        // Also call the selectBox function again, which may be needed to fully
        // initialize the UI with the selected box
        if (window.inlineEditor && typeof window.inlineEditor.selectBox === 'function') {
            setTimeout(() => {
                window.inlineEditor.selectBox(newBoxIndex);
                console.log('Called selectBox function again after delay');
            }, 50);
        }

    } else {
        // For advanced editor mode
        if (editor) {
            // Update the editor's bboxes
            editor.bboxes = bboxes;
            editor.selectedBboxIndex = newBoxIndex; // Select the new box
            editor.redrawCanvas();

            // If the BBoxEditorUI is available, update it too
            if (window.BBoxEditorUI) {
                window.BBoxEditorUI.bboxes = bboxes;
                window.BBoxEditorUI.selectedIndex = newBoxIndex;
                window.BBoxEditorUI.currentBoxIndex = newBoxIndex;

                // Update box selector dropdown - SELECT THE NEW BOX
                const boxSelector = document.getElementById('bbox-selector');
                if (boxSelector) {
                    // Clear existing options
                    boxSelector.innerHTML = '';

                    // Add options for all boxes above threshold
                    bboxes.boxes.forEach((box, i) => {
                        if (bboxes.scores[i] >= 0.5) { // Default threshold
                            const option = document.createElement('option');
                            option.value = i;

                            // Get proper class name if available
                            const classLabels = editor.classLabels || {};
                            const labelName = classLabels[bboxes.labels[i]] || `Class ${bboxes.labels[i]}`;

                            option.text = `Box ${i + 1} (${bboxes.labels[i]} - ${labelName})`;
                            option.selected = i === newBoxIndex; // SELECT THE NEW BOX
                            boxSelector.appendChild(option);
                        }
                    });

                    // Set the value explicitly
                    boxSelector.value = newBoxIndex.toString();

                    // Trigger a change event
                    const event = new Event('change');
                    boxSelector.dispatchEvent(event);
                }

                // Update class selector
                const classSelector = document.getElementById('bbox-class-selector');
                const classSearch = document.getElementById('class-search-input');

                if (classSelector) {
                    classSelector.value = classId.toString();

                    // Update search input if it exists
                    if (classSearch) {
                        // Find the proper option text
                        const classLabels = editor.classLabels || {};
                        const labelName = classLabels[classId] || `Class ${classId}`;
                        classSearch.value = `${classId} - ${labelName}`;
                    }
                }

                // Update box values in the form
                window.BBoxEditorUI.updateBoxValues(wholeImageBox);

                // Update preview canvas
                window.BBoxEditorUI.updatePreviewCanvas();
            }
        }
    }

    // Try to focus the first class selector found
    setTimeout(function() {
        const classSelector = document.getElementById('bbox-class-selector') ||
                             document.getElementById('inline-class-selector');
        if (classSelector) {
            classSelector.focus();
        }
    }, 100);

    return wholeImageBox;
}