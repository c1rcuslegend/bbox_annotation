/**
 * Add whole image bounding box functionality
 * Updated to use ground truth class index from backend
 * Added support for uncertainty mode
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

            // Don't close the advanced editor modal - let it stay open for further editing
            // The user can close it manually if needed
        });
    }
});

/**
 * Creates a bounding box covering the entire image and selects it
 * Works in both inline editor and advanced editor modes
 * Uses ground_truth_class_index from the backend
 * Supports uncertainty mode
 */
function createWholeImageBBox() {
    // Try different ways to get editor references
    let editor = null;
    let bboxes = null;
    let img = null;
    let isInlineMode = false;        // First check if we're in the advanced editor modal
    const advancedModal = document.getElementById('bbox-modal-container');
    if (advancedModal && advancedModal.classList.contains('show-modal')) {
        isInlineMode = false; // We're in advanced mode
        
        // Always use the shared bboxes array from the inline editor
        if (window.inlineEditor && window.inlineEditor.bboxes) {
            bboxes = window.inlineEditor.bboxes; // Use direct reference, not a copy
            
            // Try multiple ways to get the advanced editor reference
            if (window.BBoxEditorUI && window.BBoxEditorUI.editor) {
                editor = window.BBoxEditorUI.editor;
                img = editor.img;
            } else if (window.bboxEditor) {
                editor = window.bboxEditor;
                img = editor.img;
            }
        } else {
            // Fallback if inline editor not available
            if (window.BBoxEditorUI && window.BBoxEditorUI.editor) {
                editor = window.BBoxEditorUI.editor;
                bboxes = editor.bboxes;
                img = editor.img;
            } else if (window.bboxEditor) {
                editor = window.bboxEditor;
                bboxes = editor.bboxes;
                img = editor.img;
            }
        }
    }
    // Check if we're in the inline editor mode
    else if (window.inlineEditor) {
        isInlineMode = true;

        // Get the editor references from the inline editor
        if (window.inlineEditor.editor) {
            editor = window.inlineEditor.editor;
        } else if (window.bboxEditor) {
            editor = window.bboxEditor;
        }

        // Use direct reference to bboxes from inline editor - not a copy
        bboxes = window.inlineEditor.bboxes;

        // Get the image element
        img = document.querySelector('#image-with-bboxes img');
    }
    // Check if there's a global editor reference (from the main page)
    else if (window.bboxEditor) {
        editor = window.bboxEditor;
        bboxes = editor.bboxes; // Use direct reference, not a copy
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

    // Ensure we have uncertain_flags array
    if (!bboxes.uncertain_flags) {
        bboxes.uncertain_flags = Array(bboxes.boxes.length).fill(false);
    }

    // Ensure we have possible_labels array
    if (!bboxes.possible_labels) {
        bboxes.possible_labels = Array(bboxes.boxes.length).fill([]);
    }

    // Ensure we have crowd_flags array
    if (!bboxes.crowd_flags) {
        bboxes.crowd_flags = Array(bboxes.boxes.length).fill(false);
    }

    // Get the image dimensions
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    // Create a box covering the whole image
    const wholeImageBox = [0, 0, imgWidth, imgHeight];

    // Store the index before adding the new box
    const newBoxIndex = bboxes.boxes.length;

    // Add box to bboxes with a score of 100%
    bboxes.boxes.push([...wholeImageBox]); // Use array copy
    bboxes.scores.push(100);

    // Check if we are in uncertainty mode
    const isUncertaintyMode = (window.inlineEditor && window.inlineEditor.uncertaintyMode) ||
                              window.uncertaintyMode;

    if (isUncertaintyMode) {
        console.log('Creating whole-image bounding box in uncertainty mode');

        // Ensure all arrays have the correct length before adding new values
        while (bboxes.uncertain_flags.length < newBoxIndex) {
            bboxes.uncertain_flags.push(false);
        }
        while (bboxes.crowd_flags.length < newBoxIndex) {
            bboxes.crowd_flags.push(false);
        }
        while (bboxes.possible_labels.length < newBoxIndex) {
            bboxes.possible_labels.push([]);
        }
        while (bboxes.labels.length < newBoxIndex) {
            bboxes.labels.push(0);
        }
        if (bboxes.gt) {
            while (bboxes.gt.length < newBoxIndex) {
                bboxes.gt.push(0);
            }
        }

        // Mark this box as uncertain - add at the end of array
        bboxes.uncertain_flags.push(true);
        bboxes.crowd_flags.push(false);

        // Get selected uncertainty classes
        let selectedClasses = [];
        if (window.inlineEditor && window.inlineEditor.selectedUncertainClasses &&
            window.inlineEditor.selectedUncertainClasses.length) {
            // Make a copy to avoid reference issues
            selectedClasses = [...window.inlineEditor.selectedUncertainClasses];
        } else if (window.selectedUncertainClasses && window.selectedUncertainClasses.length) {
            selectedClasses = [...window.selectedUncertainClasses];
        }

        // Store possible classes - add at the end of array
        bboxes.possible_labels.push(selectedClasses);

        // Use -1 as the label for uncertain boxes - add at the end of array
        bboxes.labels.push(-1);

        // If there's a gt field, add -1 there too
        if (bboxes.gt) {
            bboxes.gt.push(-1);
        }

        // Set the label_type to uncertain
        const labelTypeField = document.getElementById('label_type');
        if (labelTypeField) {
            labelTypeField.value = "uncertain";
        }

        console.log(`Created uncertain whole-image box with possible_labels: ${selectedClasses.join(', ')}`);

        // Reset uncertainty mode flags
        if (window.inlineEditor) {
            window.inlineEditor.uncertaintyMode = false;
        }
        window.uncertaintyMode = false;

        // Remove visual indicator if it exists
        const indicator = document.getElementById('uncertainty-mode-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Remove border highlight
        const imageContainer = document.querySelector('.image-editor-right');
        if (imageContainer) {
            imageContainer.style.border = '';
        }

        // Reset checkboxes in the uncertainty modal
        const checkboxes = document.querySelectorAll('.uncertainty-class-checkbox:checked');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        // Clear the search field
        const searchInput = document.getElementById('uncertainty-search-input');
        if (searchInput) {
            searchInput.value = '';
        }

        // Reset the stored selected classes
        if (window.inlineEditor) {
            window.inlineEditor.selectedUncertainClasses = [];
        }
        window.selectedUncertainClasses = [];
    } else {
        // Normal mode (not uncertainty)
        console.log('Creating whole-image bounding box in normal mode');

        // Ensure all arrays have the correct length before adding new values
        while (bboxes.uncertain_flags.length < newBoxIndex) {
            bboxes.uncertain_flags.push(false);
        }
        while (bboxes.crowd_flags.length < newBoxIndex) {
            bboxes.crowd_flags.push(false);
        }
        while (bboxes.possible_labels.length < newBoxIndex) {
            bboxes.possible_labels.push([]);
        }
        while (bboxes.labels.length < newBoxIndex) {
            bboxes.labels.push(0);
        }
        if (bboxes.gt) {
            while (bboxes.gt.length < newBoxIndex) {
                bboxes.gt.push(0);
            }
        }

        // Mark this box as NOT uncertain - add at the end of array
        bboxes.uncertain_flags.push(false);
        bboxes.crowd_flags.push(false);
        bboxes.possible_labels.push([]);

        // Determine the class ID to use
        let classId = 0;

        // Use our global helper function for consistent class selection
        if (typeof window.getClassForNewBBox === 'function') {
            classId = window.getClassForNewBBox();
            console.log(`Using getClassForNewBBox helper function, got class ID: ${classId}`);
        }
        else {
            // Fallback if helper function is not available

            // Try to get the ground truth class ID from the hidden element first
            const gtDataElement = document.getElementById('ground-truth-data');
            if (gtDataElement && gtDataElement.textContent) {
                try {
                    const gtClassId = parseInt(gtDataElement.textContent.trim());
                    if (!isNaN(gtClassId)) {
                        classId = gtClassId;
                        console.log(`Using ground truth class ID from data element: ${classId}`);
                    }
                } catch (e) {
                    console.error('Error parsing ground truth class ID:', e);
                }
            }
            // If that fails, check if there's a global groundTruthClassId variable
            else if (window.groundTruthClassId !== undefined && window.groundTruthClassId !== null) {
                classId = parseInt(window.groundTruthClassId);
                console.log(`Using global groundTruthClassId: ${classId}`);
            }
            // Last resort, try to get class from radio selection
            else if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
                classId = parseInt(window.lastSelectedClassId);
                console.log(`Using global lastSelectedClassId: ${classId}`);
            }
        }

        // Add label with the determined class ID - add at the end of array
        bboxes.labels.push(classId);

        // Also update gt field if it exists
        if (bboxes.gt) {
            bboxes.gt.push(classId);
            console.log(`Added whole-image box to gt array with class ${classId}`);
        }

        // Only set label_type to basic if there are no uncertain boxes
        if (!bboxes.uncertain_flags.includes(true)) {
            const labelTypeField = document.getElementById('label_type');
            if (labelTypeField) {
                labelTypeField.value = "basic";
            }
        }
    }

    console.log(`Created whole-image bounding box [${wholeImageBox.join(', ')}]`);

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
                // Check if this is an uncertain box - by flag or by label value of -1
                const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[i]) ||
                                   (bboxes.labels && bboxes.labels[i] === -1);

                let bboxData = {
                    coordinates: box,
                    crowd_flag: bboxes.crowd_flags && bboxes.crowd_flags[i]
                };

                if (isUncertain) {
                    // For uncertain boxes
                    bboxData.uncertain_flag = true;
                    bboxData.possible_labels = bboxes.possible_labels && bboxes.possible_labels[i] ?
                        bboxes.possible_labels[i] : [];
                    bboxData.label = -1; // Use -1 for uncertain boxes
                } else {
                    // For regular boxes
                    bboxData.label = bboxes.labels && bboxes.labels[i] !== undefined ?
                        bboxes.labels[i] : 0;
                }

                bboxDataArray.push(bboxData);
            });

            // Create object with label_type
            const labelType = document.getElementById('label_type')?.value || "basic";
            const formData = {
                bboxes: bboxDataArray,
                label_type: labelType
            };

            bboxesField.value = JSON.stringify(formData);
            console.log(`Updated hidden bboxes field in inline mode with label_type: ${labelType}`);
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
                const option = document.createElement('option');
                option.value = i.toString();

                // Check if this is an uncertain box - by flag or by label value of -1
                const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[i]) ||
                                   (bboxes.labels && bboxes.labels[i] === -1);

                let optionText = `Box ${i + 1}`;

                if (isUncertain) {
                    // For uncertain boxes, just show "Not Sure"
                    optionText = `Box ${i + 1}: Not Sure`;
                } else {
                    // For normal boxes, show the class name
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

                    optionText = `Box ${i + 1}: ${bboxes.labels[i]} - ${className}`;
                }

                option.text = optionText;
                option.selected = i === newBoxIndex;
                inlineBboxSelector.appendChild(option);

                if (i === newBoxIndex) {
                    hasSelectedOption = true;
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

        // Check if the new box is uncertain
        const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[newBoxIndex]) ||
                           (bboxes.labels && bboxes.labels[newBoxIndex] === -1);

        // Manually update the class selector and search field
        const inlineClassSelector = document.getElementById('inline-class-selector');
        const inlineClassSearch = document.getElementById('inline-class-search');

        if (inlineClassSearch) {
            if (isUncertain) {
                // For uncertain boxes, show "Not Sure" and disable search
                inlineClassSearch.value = "Not Sure";
                inlineClassSearch.disabled = true;
                console.log('Set class search to "Not Sure" for uncertain box');

                // Set hidden select value for uncertain boxes
                if (inlineClassSelector) {
                    inlineClassSelector.value = "-1";
                }

                // Close dropdown for uncertain boxes
                const dropdownContent = document.querySelector('.dropdown-content');
                if (dropdownContent) {
                    dropdownContent.style.display = 'none';
                }
            } else if (inlineClassSelector) {
                // For regular boxes, enable search and set proper class
                inlineClassSearch.disabled = false;

                const classId = bboxes.labels[newBoxIndex];
                inlineClassSelector.value = classId.toString();
                console.log(`Set inline class selector to ${classId}`);

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
        if (!isUncertain && window.inlineEditor && typeof window.inlineEditor.updateSelectedBoxClass === 'function') {
            window.inlineEditor.updateSelectedBoxClass(bboxes.labels[newBoxIndex]);
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
        console.log('Updating advanced editor mode');
        
        if (editor) {
            // Update the editor's bboxes
            editor.bboxes = bboxes;
            editor.selectedBboxIndex = newBoxIndex; // Select the new box
            editor.redrawCanvas();
            console.log(`Updated advanced editor with new box index ${newBoxIndex}`);

            // If the BBoxEditorUI is available, update it too
            if (window.BBoxEditorUI) {
                window.BBoxEditorUI.bboxes = bboxes;
                window.BBoxEditorUI.selectedIndex = newBoxIndex;
                window.BBoxEditorUI.currentBoxIndex = newBoxIndex;
                console.log('Updated BBoxEditorUI state');

                // Check if the new box is uncertain
                const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[newBoxIndex]) ||
                                   (bboxes.labels && bboxes.labels[newBoxIndex] === -1);

                // Update box selector dropdown - SELECT THE NEW BOX
                const boxSelector = document.getElementById('bbox-selector');
                if (boxSelector) {
                    // Clear existing options
                    boxSelector.innerHTML = '';

                    // Add options for all boxes above threshold
                    bboxes.boxes.forEach((box, i) => {
                        const option = document.createElement('option');
                        option.value = i;

                        // Check if this is an uncertain box
                        const boxUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[i]) ||
                                           (bboxes.labels && bboxes.labels[i] === -1);

                        let optionText;
                        if (boxUncertain) {
                            optionText = `Box ${i + 1} (Not Sure)`;
                        } else {
                            // Get proper class name if available
                            const classLabels = editor.classLabels || {};
                            const labelName = classLabels[bboxes.labels[i]] || `Class ${bboxes.labels[i]}`;
                            optionText = `Box ${i + 1} (${bboxes.labels[i]} - ${labelName})`;
                        }

                        option.text = optionText;
                        option.selected = i === newBoxIndex; // SELECT THE NEW BOX
                        boxSelector.appendChild(option);
                    });

                    // Set the value explicitly
                    boxSelector.value = newBoxIndex.toString();
                    console.log(`[WHOLE-IMAGE] Set bbox selector value to ${newBoxIndex}`);

                    // Trigger a change event
                    const event = new Event('change');
                    boxSelector.dispatchEvent(event);
                    console.log(`[WHOLE-IMAGE] Dispatched change event for bbox selector with value ${newBoxIndex}`);
                    
                    // Double-check the value was set correctly
                    setTimeout(() => {
                        const actualValue = boxSelector.value;
                        console.log(`[WHOLE-IMAGE] Bbox selector value after event: ${actualValue}`);
                        
                        // Verify BBoxEditorUI state
                        if (window.BBoxEditorUI) {
                            console.log(`[WHOLE-IMAGE] BBoxEditorUI.currentBoxIndex after selector change: ${window.BBoxEditorUI.currentBoxIndex}`);
                            console.log(`[WHOLE-IMAGE] BBoxEditorUI.editor.selectedBboxIndex: ${window.BBoxEditorUI.editor ? window.BBoxEditorUI.editor.selectedBboxIndex : 'N/A'}`);
                        }
                        
                        // Verify all bbox state
                        console.log(`[WHOLE-IMAGE] Total boxes after whole image creation: ${bboxes.boxes.length}`);
                        bboxes.boxes.forEach((box, i) => {
                            const label = bboxes.labels ? bboxes.labels[i] : 'unknown';
                            console.log(`[WHOLE-IMAGE]   Box ${i}: [${box.join(', ')}] label: ${label}`);
                        });
                    }, 10);
                }

                // Update class selector
                const classSelector = document.getElementById('bbox-class-selector');
                const classSearch = document.getElementById('class-search-input');

                if (classSelector) {
                    if (isUncertain) {
                        // For uncertain boxes, disable the class selector
                        classSelector.disabled = true;
                        if (classSearch) {
                            classSearch.value = "Not Sure";
                            classSearch.disabled = true;
                        }
                    } else {
                        // For regular boxes, enable the class selector
                        classSelector.disabled = false;
                        if (classSearch) {
                            classSearch.disabled = false;
                        }

                        const classId = bboxes.labels[newBoxIndex];
                        classSelector.value = classId.toString();

                        // Update search input if it exists
                        if (classSearch) {
                            // Find the proper option text
                            const classLabels = editor.classLabels || {};
                            const labelName = classLabels[classId] || `Class ${classId}`;
                            classSearch.value = `${classId} - ${labelName}`;
                        }
                    }
                }

                // Update box values in the form
                window.BBoxEditorUI.updateBoxValues(wholeImageBox);

                // Update preview canvas
                window.BBoxEditorUI.updatePreviewCanvas();
                
                // Force a small delay to ensure DOM updates are complete
                setTimeout(() => {
                    // Ensure the editor reference is properly set for keyboard shortcuts
                    if (editor && window.BBoxEditorUI) {
                        window.BBoxEditorUI.editor = editor;
                        window.bboxEditor = editor; // Ensure global reference is maintained
                        
                        // IMPORTANT: Ensure currentBoxIndex is properly set after whole image bbox creation
                        window.BBoxEditorUI.currentBoxIndex = newBoxIndex;
                        console.log(`Explicitly set BBoxEditorUI.currentBoxIndex to ${newBoxIndex} after whole image bbox creation`);
                        
                        // Also ensure the editor's selectedBboxIndex is set
                        editor.selectedBboxIndex = newBoxIndex;
                        console.log(`Set editor.selectedBboxIndex to ${newBoxIndex}`);
                        
                        // Refresh any cached element references that keyboard shortcuts might use
                        console.log('Refreshed editor references after whole image bbox creation in advanced mode');
                        
                        // Verify the delete button handler is working by testing it
                        const deleteBtn = document.getElementById('bbox-delete');
                        if (deleteBtn) {
                            console.log('Delete button found after whole image bbox creation');
                            // Verify that the button has the proper event handler
                            const hasHandler = deleteBtn.onclick !== null;
                            console.log(`Delete button has onclick handler: ${hasHandler}`);
                        } else {
                            console.error('Delete button NOT found after whole image bbox creation!');
                        }
                    }
                    
                    // Ensure focus is properly managed - remove focus from any input elements
                    // that might interfere with keyboard shortcuts
                    const focusedElement = document.activeElement;
                    if (focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'SELECT')) {
                        focusedElement.blur();
                    }
                }, 50);
            }
        }
    }

    // Reset radio selection if one was used
    if (window.lastSelectedClassId !== null && typeof window.resetRadioSelection === 'function') {
        window.resetRadioSelection();
        console.log('Radio button selection has been reset after creating whole-image bbox');
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