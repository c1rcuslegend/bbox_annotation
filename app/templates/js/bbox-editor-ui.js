/**
 * Handles the UI for the bounding box editor modal
 * Updated to fix Not Sure functionality and properly detect Not Sure mode from inline editor
 */
class BBoxEditorUI {
    static openModal(box, boxIndex, bboxes, editor) {
        // Store the class in window for cross-script access
        window.BBoxEditorUI = BBoxEditorUI;
        
        const modal = document.getElementById('bbox-modal-container');
        const previewCanvas = document.getElementById('bbox-preview-canvas');
        if (!modal || !previewCanvas) {
            console.error('Modal or preview canvas not found');
            return;
        }

        // Store editor reference and current box index for use in event handlers
        this.editor = editor;
        this.currentBoxIndex = boxIndex;

        // Make the editor globally accessible for whole image bbox functionality
        window.BBoxEditorUI.editor = editor;
        window.BBoxEditorUI.currentBoxIndex = boxIndex;

        // Always use the shared bboxes from inline editor if available
        if (window.inlineEditor && window.inlineEditor.bboxes) {
            this.bboxes = window.inlineEditor.bboxes;
            editor.bboxes = window.inlineEditor.bboxes; // Sync the main editor too
        } else {
            this.bboxes = bboxes;
        }

        // Check if Not Sure mode is active from the inline editor
        this.checkNotSureMode();

        // Handle gt field - ensure labels array exists
        if (!this.bboxes.labels && this.bboxes.gt) {
            this.bboxes.labels = this.bboxes.gt;
        }

        // Initialize Not Sure boxes
        this.initializeNotSureBoxes();

        // Show the modal
        modal.classList.add('show-modal');

        // Set up the enhanced class selector dropdown with search
        this.setupEnhancedClassSelector(boxIndex, this.bboxes, editor.classLabels);

        // Set up event listeners
        this.setupEventListeners(this.bboxes, editor);

        // Populate input fields
        this.updateBoxValues(box);

        // Initialize the preview canvas
        this.initPreviewCanvas(previewCanvas, editor.img, this.bboxes, boxIndex);

        // Update bbox selector with available boxes
        this.updateBboxSelector(this.bboxes, boxIndex, editor.classLabels);
        
        // Update checkboxes to match current state
        this.updateCrowdCheckbox(boxIndex);
        
        // Check if this is a multi-label box and update checkbox
        this.updateMultiLabelCheckbox(boxIndex);
        this.updateReflectedCheckbox(boxIndex);
        this.updateRenditionCheckbox(boxIndex);
        this.updateOcrNeededCheckbox(boxIndex);
        this.updateClassNumbersCheckbox();
        // When switching selected box, update multi-label checkbox state
        const bboxSelector = document.getElementById('bbox-selector');
        if (bboxSelector) {
            bboxSelector.onchange = () => {
                const idx = parseInt(bboxSelector.value, 10);
                this.currentBoxIndex = idx;
                this.updateMultiLabelCheckbox(idx);
            };
        }

        // Add event listener to handle modal close event
        document.addEventListener('bbox-modal-closed', function handleModalClose(e) {
            // Update the main editor to ensure correct display of Not Sure boxes
            if (editor && editor.bboxes) {
                // Force redraw of main canvas
                if (typeof editor.forceRedraw === 'function') {
                    editor.forceRedraw();
                } else if (typeof editor.redrawCanvas === 'function') {
                    editor.redrawCanvas();
                }
            }

            // Also update inline editor if it exists
            if (window.inlineEditor) {
                // Make sure uncertain flags are properly set for -1 labels
                if (window.inlineEditor.bboxes && window.inlineEditor.bboxes.labels) {
                    const labels = window.inlineEditor.bboxes.labels;
                    if (!window.inlineEditor.bboxes.uncertain_flags) {
                        window.inlineEditor.bboxes.uncertain_flags = new Array(labels.length).fill(false);
                    }

                    for (let i = 0; i < labels.length; i++) {
                        if (labels[i] === -1) {
                            window.inlineEditor.bboxes.uncertain_flags[i] = true;
                        }
                    }
                }

                // Update bbox selector
                if (typeof window.inlineEditor.updateBboxSelector === 'function') {
                    window.inlineEditor.updateBboxSelector();
                }

                // Force redraw
                if (window.inlineEditor.editor) {
                    window.inlineEditor.editor.redrawCanvas();
                }
            }

            // Remove this event listener to avoid duplicates
            document.removeEventListener('bbox-modal-closed', handleModalClose);
        }, {once: false});
    }

    // Check if Not Sure mode is active from inline editor
    static checkNotSureMode() {
        // Check if the Not Sure mode indicator exists from the inline editor
        const indicator = document.getElementById('uncertainty-mode-indicator');

        // Initialize possible labels collection
        this.possibleLabels = [];

        // Check for possible labels stored in the hidden div
        const possibleLabelsDiv = document.getElementById('stored-possible-labels');
        if (possibleLabelsDiv && possibleLabelsDiv.dataset.labels) {
            try {
                this.possibleLabels = JSON.parse(possibleLabelsDiv.dataset.labels);
            } catch (e) {
                // Error parsing labels - ignore
            }
        }

        // Check for inline editor Not Sure state
        if (indicator) {
            this.notSureMode = true;

            // If we didn't get labels from the hidden div, try the global variable
            if (this.possibleLabels.length === 0 && window.selectedUncertainClasses &&
                Array.isArray(window.selectedUncertainClasses)) {
                this.possibleLabels = [...window.selectedUncertainClasses];
            }
        } else if (window.uncertaintyMode) {
            // Also check the global uncertainty mode flag
            this.notSureMode = true;

            // If we didn't get labels from the hidden div, try the global variable
            if (this.possibleLabels.length === 0 && window.selectedUncertainClasses &&
                Array.isArray(window.selectedUncertainClasses)) {
                this.possibleLabels = [...window.selectedUncertainClasses];
            }
        } else {
            this.notSureMode = false;
        }

        return this.notSureMode;
    }

    // Turn off Not Sure mode in inline editor
    static turnOffNotSureMode() {
        // Check for and remove the indicator div
        const indicator = document.getElementById('uncertainty-mode-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Remove the yellow border from image container
        const imageContainer = document.querySelector('.image-editor-right');
        if (imageContainer) {
            imageContainer.style.border = '';
        }

        // Reset global uncertainty mode flag if it exists
        if (window.uncertaintyMode !== undefined) {
            window.uncertaintyMode = false;
        }

        // Reset inline editor's uncertainty mode if available
        if (window.inlineEditor && window.inlineEditor.uncertaintyMode !== undefined) {
            window.inlineEditor.uncertaintyMode = false;
        }

        // Reset selection in inline editor if needed
        if (window.inlineEditor && typeof window.inlineEditor.resetUncertaintyCheckboxes === 'function') {
            window.inlineEditor.resetUncertaintyCheckboxes();
        }

        // Reset the possible labels in uncertainty modal
        const checkboxes = document.querySelectorAll('.uncertainty-class-checkbox:checked');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        // Clear the search field in uncertainty modal
        const searchInput = document.getElementById('uncertainty-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        // Clear the hidden div
        const possibleLabelsDiv = document.getElementById('stored-possible-labels');
        if (possibleLabelsDiv) {
            possibleLabelsDiv.dataset.labels = '[]';
        }

        // Reset our internal state
        this.notSureMode = false;
        this.possibleLabels = [];
    }

    static setupEventListeners(bboxes, editor) {
        // Close button 
        const closeButton = document.querySelector('.bbox-editor-close');
        if (closeButton) {
            closeButton.onclick = () => {
                // Save current changes before closing (same logic as save button)
                this.saveCurrentChanges(bboxes, editor);
                
                // Update the hidden form field if needed
                if (typeof window.updateHiddenBboxesField === 'function') {
                    window.updateHiddenBboxesField();
                }
                
                // Make sure inline editor is in sync
                if (window.inlineEditor) {
                    // Ensure bboxes is shared
                    window.inlineEditor.bboxes = bboxes;
                    if (window.inlineEditor.editor) {
                        window.inlineEditor.editor.bboxes = bboxes;
                        
                        // Clear the selection in inline editor to prevent orphaned selection
                        window.inlineEditor.currentBoxIndex = -1;
                        window.inlineEditor.editor.selectedBboxIndex = -1;
                        
                        window.inlineEditor.editor.redrawCanvas();
                    }
                    
                    // Update bbox selector
                    if (typeof window.inlineEditor.updateBboxSelector === 'function') {
                        window.inlineEditor.updateBboxSelector();
                    }
                }
                
                // Create a custom event to trigger updates in other components
                const event = new CustomEvent('bbox-modal-closed', {
                    detail: {
                        needsRedraw: true
                    }
                });
                document.dispatchEvent(event);
                
                // Close the modal
                document.getElementById('bbox-modal-container').classList.remove('show-modal');
            };
        }

        // Save button
        const saveButton = document.getElementById('bbox-update');
        if (saveButton) {
            saveButton.onclick = () => {
                // Save current changes
                this.saveCurrentChanges(bboxes, editor);
                
                // Update the hidden form field if needed
                if (typeof window.updateHiddenBboxesField === 'function') {
                    window.updateHiddenBboxesField();
                }
                
                // Make sure inline editor is in sync
                if (window.inlineEditor) {
                    // Ensure bboxes is shared
                    window.inlineEditor.bboxes = bboxes;
                    if (window.inlineEditor.editor) {
                        window.inlineEditor.editor.bboxes = bboxes;
                        
                        // Clear the selection in inline editor to prevent orphaned selection
                        window.inlineEditor.currentBoxIndex = -1;
                        window.inlineEditor.editor.selectedBboxIndex = -1;
                        
                        window.inlineEditor.editor.redrawCanvas();
                    }
                    
                    // Update bbox selector
                    if (typeof window.inlineEditor.updateBboxSelector === 'function') {
                        window.inlineEditor.updateBboxSelector();
                    }
                }
                
                // Create a custom event to trigger updates in other components
                const event = new CustomEvent('bbox-modal-closed', {
                    detail: {
                        needsRedraw: true
                    }
                });
                document.dispatchEvent(event);
                
                // Close the modal
                document.getElementById('bbox-modal-container').classList.remove('show-modal');
            };
        }

        // Delete button
        const deleteButton = document.getElementById('bbox-delete');
        if (deleteButton) {
            deleteButton.onclick = () => {
                // Get the bbox selector state
                const bboxSelector = document.getElementById('bbox-selector');
                const selectorValue = bboxSelector ? bboxSelector.value : 'N/A';
                
                // Try to get the current box index from multiple sources for robustness
                let boxIndexToDelete = this.currentBoxIndex;
                
                // Fallback 1: Check the bbox selector value
                if (boxIndexToDelete < 0 || boxIndexToDelete >= bboxes.boxes.length) {
                    if (bboxSelector && bboxSelector.value !== "-1") {
                        boxIndexToDelete = parseInt(bboxSelector.value);
                    }
                }
                
                // Fallback 2: Check the editor's selectedBboxIndex
                if (boxIndexToDelete < 0 || boxIndexToDelete >= bboxes.boxes.length) {
                    if (editor && editor.selectedBboxIndex >= 0 && editor.selectedBboxIndex < bboxes.boxes.length) {
                        boxIndexToDelete = editor.selectedBboxIndex;
                    }
                }
                
                if (boxIndexToDelete >= 0 && boxIndexToDelete < bboxes.boxes.length) {
                    // Check if this is a multi-label box
                    const isMultiLabel = bboxes.group && 
                                       bboxes.group[boxIndexToDelete] !== null && 
                                       bboxes.group[boxIndexToDelete] !== undefined;
                    
                    if (isMultiLabel) {
                        // For multi-label boxes, delete all boxes in the same group
                        const groupId = bboxes.group[boxIndexToDelete];
                        
                        // Find all boxes in the same group
                        const boxesToDelete = [];
                        for (let i = 0; i < bboxes.group.length; i++) {
                            if (bboxes.group[i] === groupId) {
                                boxesToDelete.push(i);
                            }
                        }
                        
                        console.log(`Deleting multi-label group ${groupId}: boxes [${boxesToDelete.join(', ')}]`);
                        
                        // Sort in descending order to delete from end to beginning (preserves indices)
                        boxesToDelete.sort((a, b) => b - a);
                        
                        // Delete all boxes in the group
                        boxesToDelete.forEach(deletedIndex => {
                            bboxes.boxes.splice(deletedIndex, 1);
                            bboxes.scores.splice(deletedIndex, 1);
                            
                            if (bboxes.labels) {
                                bboxes.labels.splice(deletedIndex, 1);
                            }
                            
                            // Remove crowd flag if it exists
                            if (bboxes.crowd_flags) {
                                bboxes.crowd_flags.splice(deletedIndex, 1);
                            }
                            
                            // Remove reflected flag if it exists
                            if (bboxes.reflected_flags) {
                                bboxes.reflected_flags.splice(deletedIndex, 1);
                            }
                            
                            // Remove rendition flag if it exists
                            if (bboxes.rendition_flags) {
                                bboxes.rendition_flags.splice(deletedIndex, 1);
                            }

                            // Remove ocr_needed flag if it exists
                            if (bboxes.ocr_needed_flags) {
                                bboxes.ocr_needed_flags.splice(deletedIndex, 1);
                            }
                            
                            // Remove uncertain flag and possible_labels if they exist
                            if (bboxes.uncertain_flags) {
                                bboxes.uncertain_flags.splice(deletedIndex, 1);
                            }
                            
                            if (bboxes.possible_labels) {
                                bboxes.possible_labels.splice(deletedIndex, 1);
                            }
                            
                            // Also remove from gt if it exists
                            if (bboxes.gt) {
                                bboxes.gt.splice(deletedIndex, 1);
                            }
                            
                            // Also remove from group if it exists
                            if (bboxes.group) {
                                bboxes.group.splice(deletedIndex, 1);
                            }
                        });
                        
                        console.log(`Deleted multi-label group with ${boxesToDelete.length} boxes`);
                    } else {
                        // For single boxes, delete normally
                        const deletedIndex = boxIndexToDelete;
                        
                        // Remove box, score, label, and flags using splice (same as inline editor)
                        bboxes.boxes.splice(deletedIndex, 1);
                        bboxes.scores.splice(deletedIndex, 1);
                        
                        if (bboxes.labels) {
                            bboxes.labels.splice(deletedIndex, 1);
                        }
                        
                        // Remove crowd flag if it exists
                        if (bboxes.crowd_flags) {
                            bboxes.crowd_flags.splice(deletedIndex, 1);
                        }
                        
                        // Remove reflected flag if it exists
                        if (bboxes.reflected_flags) {
                            bboxes.reflected_flags.splice(deletedIndex, 1);
                        }
                        
                        // Remove rendition flag if it exists
                        if (bboxes.rendition_flags) {
                            bboxes.rendition_flags.splice(deletedIndex, 1);
                        }

                        // Remove ocr_needed flag if it exists
                        if (bboxes.ocr_needed_flags) {
                            bboxes.ocr_needed_flags.splice(deletedIndex, 1);
                        }
                        
                        // Remove uncertain flag and possible_labels if they exist
                        if (bboxes.uncertain_flags) {
                            bboxes.uncertain_flags.splice(deletedIndex, 1);
                        }
                        
                        if (bboxes.possible_labels) {
                            bboxes.possible_labels.splice(deletedIndex, 1);
                        }
                        
                        // Also remove from gt if it exists
                        if (bboxes.gt) {
                            bboxes.gt.splice(deletedIndex, 1);
                            console.log(`BBoxEditorUI: Removed box ${deletedIndex} from gt array`);
                        }
                        
                        // Also remove from group if it exists
                        if (bboxes.group) {
                            bboxes.group.splice(deletedIndex, 1);
                        }
                        
                        console.log(`Deleted single box ${deletedIndex}`);
                    }
                    
                    
                    // Log all boxes after deletion
                    console.log('Boxes after deletion:');
                    bboxes.boxes.forEach((box, i) => {
                        const label = bboxes.labels ? bboxes.labels[i] : 'unknown';
                        console.log(`  Box ${i}: [${box.join(', ')}] label: ${label}`);
                    });
                    
                    // Reset the current box index (same as inline editor)
                    this.currentBoxIndex = -1;
                    
                    // Update the editor's selection state (same as inline editor)
                    if (editor) {
                        editor.selectedBboxIndex = -1;
                        editor.bboxes = bboxes; // Update editor's reference to the modified bboxes
                        editor.redrawCanvas();
                    }
                    
                    // Update the global inline editor if it exists (same as inline editor does)
                    if (window.inlineEditor) {
                        window.inlineEditor.bboxes = bboxes;
                        window.inlineEditor.currentBoxIndex = -1;
                        
                        // Update the inline editor's main editor if connected
                        if (window.inlineEditor.editor) {
                            window.inlineEditor.editor.bboxes = bboxes;
                            window.inlineEditor.editor.selectedBboxIndex = -1;
                            window.inlineEditor.editor.redrawCanvas();
                        }
                    }
                    
                    // Update the UI controls
                    this.updateBboxSelector(bboxes, -1, editor.classLabels);
                    this.resetFormFields();
                    this.updatePreviewCanvas();
                    
                    // Trigger the change event on the bbox selector to ensure proper cleanup
                    if (bboxSelector) {
                        bboxSelector.value = "-1";
                        bboxSelector.dispatchEvent(new Event('change'));
                    }
                    
                    // Update hidden form fields if the function exists (mimic inline editor)
                    if (typeof window.updateHiddenBboxesField === 'function') {
                        window.updateHiddenBboxesField();
                    }
                    
                    console.log(`Delete: Successfully deleted box ${deletedIndex}, remaining boxes: ${bboxes.boxes.length}`);
                    console.log('=== DELETE OPERATION COMPLETE ===');
                } else {
                    console.error(`Delete: Cannot delete box - invalid index ${boxIndexToDelete}`);
                    console.log('=== DELETE OPERATION FAILED ===');
                }
            };
        }

        // Delete All button
        const deleteAllButton = document.getElementById('bbox-delete-all');
        if (deleteAllButton) {
            deleteAllButton.onclick = () => {
                // Remove all boxes, scores, labels, crowd flags and reflected flags from the arrays
                bboxes.boxes = [];
                bboxes.scores = [];
                if (bboxes.labels) bboxes.labels = [];
                if (bboxes.crowd_flags) bboxes.crowd_flags = [];
                if (bboxes.reflected_flags) bboxes.reflected_flags = [];
                if (bboxes.rendition_flags) bboxes.rendition_flags = [];
                if (bboxes.ocr_needed_flags) bboxes.ocr_needed_flags = [];
                if (bboxes.uncertain_flags) bboxes.uncertain_flags = [];

                // Also clear gt field if it exists
                if (bboxes.gt) {
                    bboxes.gt = [];
                    console.log('BBoxEditorUI: Cleared all boxes from gt array');
                }

                // Reset the current box index
                this.currentBoxIndex = -1;
                editor.selectedBboxIndex = -1;

                // Create a fresh copy of the bboxes object to ensure change detection
                editor.bboxes = JSON.parse(JSON.stringify(bboxes));

                // Force a complete redraw of the canvas
                editor.forceRedraw();

                // Update the dropdown selector
                this.updateBboxSelector(bboxes, -1, editor.classLabels);

                // Immediately clear form fields and redraw the canvas
                this.resetFormFields();
                this.updatePreviewCanvas();
                
                // Trigger the change event on the bbox selector to ensure proper cleanup
                const bboxSelector = document.getElementById('bbox-selector');
                if (bboxSelector) {
                    bboxSelector.value = "-1";
                    bboxSelector.dispatchEvent(new Event('change'));
                }
            };
        }

        // Note: Cancel button has been removed to prevent state desynchronization
        // All changes are now applied directly to the shared bboxes array

        // Crowd checkbox
        const crowdCheckbox = document.getElementById('bbox-crowd-checkbox');
        if (crowdCheckbox) {
            crowdCheckbox.onchange = () => {
                if (this.currentBoxIndex < 0) return;
                // Update the crowd_flags array based on the checkbox state
                editor.bboxes.crowd_flags[this.currentBoxIndex] = crowdCheckbox.checked;
                console.log(`Updated crowd flag for box ${this.currentBoxIndex} to: ${crowdCheckbox.checked}`);

                // Also sync with inline editor's checkbox
                const inlineCrowdCheckbox = document.getElementById('inline-crowd-checkbox');
                if (inlineCrowdCheckbox) {
                    inlineCrowdCheckbox.checked = crowdCheckbox.checked;
                    console.log(`Synced inline crowd checkbox to: ${crowdCheckbox.checked}`);
                }

                // Redraw the advanced editor canvas
                this.updatePreviewCanvas();
            };
        }

        // Reflected checkbox
        const reflectedCheckbox = document.getElementById('bbox-reflected-checkbox');
        if (reflectedCheckbox) {
            reflectedCheckbox.onchange = () => {
                if (this.currentBoxIndex < 0) return;
                // Update the reflected_flags array based on the checkbox state
                editor.bboxes.reflected_flags[this.currentBoxIndex] = reflectedCheckbox.checked;
                console.log(`Updated reflected flag for box ${this.currentBoxIndex} to: ${reflectedCheckbox.checked}`);

                // Also sync with inline editor's checkbox if it exists
                const inlineReflectedCheckbox = document.getElementById('inline-reflected-checkbox');
                if (inlineReflectedCheckbox) {
                    inlineReflectedCheckbox.checked = reflectedCheckbox.checked;
                    console.log(`Synced inline reflected checkbox to: ${reflectedCheckbox.checked}`);
                }

                // Redraw the advanced editor canvas
                this.updatePreviewCanvas();
            };
        }

        // Rendition checkbox
        const renditionCheckbox = document.getElementById('bbox-rendition-checkbox');
        if (renditionCheckbox) {
            renditionCheckbox.onchange = () => {
                if (this.currentBoxIndex < 0) return;
                // Update the rendition_flags array based on the checkbox state
                editor.bboxes.rendition_flags[this.currentBoxIndex] = renditionCheckbox.checked;
                console.log(`Updated rendition flag for box ${this.currentBoxIndex} to: ${renditionCheckbox.checked}`);

                // Also sync with inline editor's checkbox if it exists
                const inlineRenditionCheckbox = document.getElementById('inline-rendition-checkbox');
                if (inlineRenditionCheckbox) {
                    inlineRenditionCheckbox.checked = renditionCheckbox.checked;
                    console.log(`Synced inline rendition checkbox to: ${renditionCheckbox.checked}`);
                }

                // Redraw the advanced editor canvas
                this.updatePreviewCanvas();
            };
        }

        // OCR needed checkbox
        const ocrNeededCheckbox = document.getElementById('bbox-ocr-needed-checkbox');
        if (ocrNeededCheckbox) {
            ocrNeededCheckbox.onchange = () => {
                if (this.currentBoxIndex < 0) return;
                // Update the ocr_needed_flags array based on the checkbox state
                editor.bboxes.ocr_needed_flags[this.currentBoxIndex] = ocrNeededCheckbox.checked;
                console.log(`Updated ocr_needed flag for box ${this.currentBoxIndex} to: ${ocrNeededCheckbox.checked}`);

                // Also sync with inline editor's checkbox if it exists
                const inlineOcrNeededCheckbox = document.getElementById('inline-ocr-needed-checkbox');
                if (inlineOcrNeededCheckbox) {
                    inlineOcrNeededCheckbox.checked = ocrNeededCheckbox.checked;
                    console.log(`Synced inline ocr_needed checkbox to: ${ocrNeededCheckbox.checked}`);
                }

                // Redraw the advanced editor canvas
                this.updatePreviewCanvas();
            };
        }
        
        // Multi-Label Mode checkbox
        const multiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
        if (multiLabelCheckbox) {
            multiLabelCheckbox.onchange = () => {
                // Show/hide advanced multi-select dropdown
                const singleCont = document.getElementById('bbox-single-label-container');
                const multiCont = document.getElementById('bbox-multi-label-container');
                const multiSelect = document.getElementById('bbox-multi-label-selector');
                // Toggle single vs multi selector
                document.getElementById('bbox-single-label-container').style.display = multiLabelCheckbox.checked ? 'none' : 'block';
                // Always show multi-label dropdown - KEEP IT VISIBLE EVEN WHEN UNCHECKED
                document.getElementById('multi-label-selection-container').style.display = 'block';
                // Refresh canvas when multi-label selection changes
                const mlSelector = document.getElementById('bbox-multi-label-selector');
                if (mlSelector) {
                    mlSelector.onchange = () => this.updatePreviewCanvas();
                }
                if (this.currentBoxIndex < 0) return;
                
                // Initialize group array if it doesn't exist
                if (!editor.bboxes.group) {
                    editor.bboxes.group = new Array(editor.bboxes.boxes.length).fill(null);
                }
                
                // Update group ID based on checkbox state
                if (multiLabelCheckbox.checked) {
                    // Create a new group ID for this box using sequential numbering
                    let maxGroupId = 0;
                    if (editor.bboxes.group) {
                        editor.bboxes.group.forEach(groupId => {
                            if (groupId !== null && groupId !== undefined && groupId > maxGroupId) {
                                maxGroupId = groupId;
                            }
                        });
                    }
                    const groupId = maxGroupId + 1; // Start from 1, increment sequentially
                    editor.bboxes.group[this.currentBoxIndex] = groupId;
                    console.log(`Created new group ${groupId} for box ${this.currentBoxIndex}`);
                } else {
                    // Get the current group ID
                    const currentGroupId = editor.bboxes.group[this.currentBoxIndex];
                    
                    // If part of a group, find the box with the lowest label to keep
                    if (currentGroupId !== null && currentGroupId !== undefined) {
                        // Find all boxes in the same group with their labels
                        const groupBoxes = [];
                        for (let i = 0; i < editor.bboxes.group.length; i++) {
                            if (editor.bboxes.group[i] === currentGroupId) {
                                groupBoxes.push({
                                    index: i,
                                    label: editor.bboxes.labels ? editor.bboxes.labels[i] : 0
                                });
                            }
                        }

                        if (groupBoxes.length > 1) {
                            // Sort by label to find the box with the first/lowest label
                            groupBoxes.sort((a, b) => a.label - b.label);
                            const boxToKeep = groupBoxes[0]; // Keep the one with the lowest label
                            
                            console.log(`Converting multi-label group ${currentGroupId} to single-label. Keeping box ${boxToKeep.index} with label ${boxToKeep.label}`);
                            
                            // Find boxes to remove (all except the one to keep)
                            const boxesToRemove = groupBoxes
                                .filter(box => box.index !== boxToKeep.index)
                                .map(box => box.index)
                                .sort((a, b) => b - a); // Sort in descending order for safe removal

                            // Remove other boxes in the group
                            boxesToRemove.forEach(idx => {
                                this.removeBoxFromGroup(idx);
                            });

                            // After removing boxes, find the new index of the box we kept
                            // (indices shift when we remove boxes before the kept one)
                            let newKeptBoxIndex = boxToKeep.index;
                            boxesToRemove.forEach(removedIdx => {
                                if (removedIdx < boxToKeep.index) {
                                    newKeptBoxIndex--;
                                }
                            });

                            // Clear group ID for the kept box
                            if (newKeptBoxIndex < editor.bboxes.group.length) {
                                editor.bboxes.group[newKeptBoxIndex] = null;
                            }

                            // Update current selection to the kept box
                            this.currentBoxIndex = newKeptBoxIndex;
                            
                            console.log(`Kept box is now at index ${newKeptBoxIndex}, selection updated`);
                        } else {
                            // Only one box in group, just clear its group ID
                            editor.bboxes.group[this.currentBoxIndex] = null;
                            console.log(`Cleared group ID for single box ${this.currentBoxIndex}`);
                        }
                    }
                }
                
                // Also sync with inline editor's checkbox if it exists
                const inlineMultiLabelCheckbox = document.getElementById('inline-multi-label-checkbox');
                if (inlineMultiLabelCheckbox) {
                    inlineMultiLabelCheckbox.checked = multiLabelCheckbox.checked;
                    console.log(`Synced inline multi-label checkbox to: ${multiLabelCheckbox.checked}`);
                }
                
                // Update bbox selector to reflect any changes in selection
                this.updateBboxSelector(this.bboxes, this.currentBoxIndex, this.editor.classLabels);
                
                // Always populate the multi-label classes regardless of checkbox state
                // This keeps the dropdown visible but updates its contents based on the current box state
                if (multiLabelCheckbox.checked) {
                    this.populateMultiLabelClasses(this.currentBoxIndex);
                } else {
                    // Clear the dropdown content but keep it visible
                    const multiLabelContainer = document.getElementById('multi-label-selection-container');
                    if (multiLabelContainer) {
                        multiLabelContainer.innerHTML = '';
                    }
                }
                
                // Redraw the canvas
                this.updatePreviewCanvas();
                
                // Update the hidden field to save changes
                this.updateHiddenBboxesField(this.bboxes);
            };
        }

        // Class Numbers Only checkbox
        const classNumbersCheckbox = document.getElementById('bbox-class-numbers-checkbox');
        if (classNumbersCheckbox) {
            classNumbersCheckbox.onchange = () => {
                // Update the editor's class numbers only mode
                editor.setShowClassNumbersOnly(classNumbersCheckbox.checked);
                console.log(`Updated class numbers only mode to: ${classNumbersCheckbox.checked}`);

                // Also sync with inline editor's checkbox if it exists
                const inlineClassNumbersCheckbox = document.getElementById('inline-class-numbers-checkbox');
                if (inlineClassNumbersCheckbox) {
                    inlineClassNumbersCheckbox.checked = classNumbersCheckbox.checked;
                    console.log(`Synced inline class numbers checkbox to: ${classNumbersCheckbox.checked}`);
                }

                // Redraw the advanced editor canvas
                this.updatePreviewCanvas();
            };
        }

        // Setup input field change events
        this.setupInputEvents(bboxes, editor);
    }

    // Helper method to save current changes (used by both save and close buttons)
    static saveCurrentChanges(bboxes, editor) {
        if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.boxes.length) {
            const x1 = parseInt(document.getElementById('bbox-x1').value) || 0;
            const y1 = parseInt(document.getElementById('bbox-y1').value) || 0;
            const x2 = parseInt(document.getElementById('bbox-x2').value) || 0;
            const y2 = parseInt(document.getElementById('bbox-y2').value) || 0;

            // Check if this is a multi-label box BEFORE updating labels
            const isCurrentBoxMultiLabel = bboxes.group && 
                               bboxes.group[this.currentBoxIndex] !== null && 
                               bboxes.group[this.currentBoxIndex] !== undefined;

            // Get selected class - but only update labels for single-label boxes
            const classSelector = document.getElementById('bbox-class-selector');
            if (classSelector && !isCurrentBoxMultiLabel) {
                // Only update single-label boxes through the class selector
                // Multi-label boxes are managed exclusively through the multi-label interface
                const newClassId = parseInt(classSelector.value);
                bboxes.labels[this.currentBoxIndex] = newClassId;

                // Update uncertain flag based on class
                if (!bboxes.uncertain_flags) {
                    bboxes.uncertain_flags = new Array(bboxes.boxes.length).fill(false);
                }
                bboxes.uncertain_flags[this.currentBoxIndex] = (newClassId === -1);

                // Update gt field if it exists
                if (bboxes.gt && this.currentBoxIndex < bboxes.gt.length) {
                    bboxes.gt[this.currentBoxIndex] = newClassId;
                }
            } else if (isCurrentBoxMultiLabel) {
                // For multi-label boxes, preserve the existing labels
                console.log(`BBoxEditorUI: Preserving multi-label box labels for group ${bboxes.group[this.currentBoxIndex]}`);
            }

            // Update coordinates
            const newBox = [
                Math.min(x1, x2),
                Math.min(y1, y2),
                Math.max(x1, x2),
                Math.max(y1, y2)
            ];
            
            bboxes.boxes[this.currentBoxIndex] = newBox;
            
            // If this is a multi-label box, update ALL boxes in the same group
            if (isCurrentBoxMultiLabel) {
                const groupId = bboxes.group[this.currentBoxIndex];
                // Update all boxes in the same group to have the same coordinates
                bboxes.group.forEach((g, i) => {
                    if (g === groupId && i !== this.currentBoxIndex) {
                        bboxes.boxes[i] = [...newBox]; // Copy the new coordinates
                    }
                });
                console.log(`BBoxEditorUI: Updated coordinates for multi-label group ${groupId}`);
            }

            // Ensure the inline editor and main editor are using the same shared bboxes
            if (window.inlineEditor) {
                if (!Object.is(window.inlineEditor.bboxes, bboxes)) {
                    window.inlineEditor.bboxes = bboxes;
                }
                
                if (window.inlineEditor.editor && !Object.is(window.inlineEditor.editor.bboxes, bboxes)) {
                    window.inlineEditor.editor.bboxes = bboxes;
                }
                
                // Force redraw of inline editor
                if (window.inlineEditor.editor) {
                    window.inlineEditor.editor.redrawCanvas();
                }
            }

            // Make sure the main editor has the same bboxes reference
            if (editor && !Object.is(editor.bboxes, bboxes)) {
                editor.bboxes = bboxes;
            }
            
            // Redraw the main editor canvas
            if (editor) {
                editor.redrawCanvas();
            }
        }
    }

    static setupEnhancedClassSelector(boxIndex, bboxes, classLabels) {
        // Check for gt field first
        if (!bboxes.labels && bboxes.gt) {
            console.log("BBoxEditorUI: Using 'gt' field as labels");
            bboxes.labels = bboxes.gt;
        }
        // Ensure labels array exists in bboxes
        else if (!bboxes.labels) {
            bboxes.labels = Array(bboxes.boxes.length).fill(0);
        }

        // Ensure crowd flags exists in bboxes
        if (!bboxes.crowd_flags) {
            bboxes.crowd_flags = Array(bboxes.boxes.length).fill(false);
        }

        // Ensure reflected flags exists in bboxes
        if (!bboxes.reflected_flags) {
            bboxes.reflected_flags = Array(bboxes.boxes.length).fill(false);
        }

        // Ensure rendition flags exists in bboxes
        if (!bboxes.rendition_flags) {
            bboxes.rendition_flags = Array(bboxes.boxes.length).fill(false);
        }

        // Ensure ocr_needed flags exists in bboxes
        if (!bboxes.ocr_needed_flags) {
            bboxes.ocr_needed_flags = Array(bboxes.boxes.length).fill(false);
        }

        // Ensure uncertain_flags array exists in bboxes
        if (!bboxes.uncertain_flags) {
            bboxes.uncertain_flags = Array(bboxes.boxes.length).fill(false);
        }

        // Find the class selector input group
        const classInputGroup = document.querySelector('.bbox-editor-input-group:has(label[for="bbox-class-selector"])') ||
                               document.querySelector('.bbox-editor-input-group:nth-of-type(5)');

        if (!classInputGroup) {
            console.error('Class selector input group not found');
            return;
        }

        // Clear previous content (keeping only the label)
        const label = classInputGroup.querySelector('label');
        classInputGroup.innerHTML = '';
        if (label) classInputGroup.appendChild(label);

        // Create the custom class selector - a single input that acts as both search and dropdown
        const customSelector = document.createElement('div');
        customSelector.className = 'custom-class-selector';

        // Create the actual input field
        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.id = 'class-search-input';
        inputField.className = 'bbox-editor-selector';
        inputField.placeholder = 'Search for class...';
        inputField.autocomplete = 'off';

        // Add the dropdown icon
        const dropdownIcon = document.createElement('div');
        dropdownIcon.className = 'dropdown-icon';
        dropdownIcon.innerHTML = '▼';

        // Create the dropdown content container
        const dropdownContent = document.createElement('div');
        dropdownContent.className = 'dropdown-content';
        dropdownContent.style.display = 'none';

        // Create the hidden select element that maintains the actual selection
        const hiddenSelect = document.createElement('select');
        hiddenSelect.id = 'bbox-class-selector';
        hiddenSelect.style.display = 'none';

        // Add special Not Sure option (-1) for uncertain boxes
        const notSureOption = document.createElement('option');
        notSureOption.value = "-1";
        notSureOption.textContent = "Not Sure";
        hiddenSelect.appendChild(notSureOption);

        // Add the Not Sure option to dropdown content
        const notSureItem = document.createElement('div');
        notSureItem.className = 'dropdown-item';
        notSureItem.dataset.value = "-1";
        notSureItem.textContent = "Not Sure";
        notSureItem.dataset.searchtext = "not sure uncertain -1".toLowerCase();
        dropdownContent.appendChild(notSureItem);

        // Build the options and populate both the hidden select and dropdown content
        if (classLabels && Object.keys(classLabels).length > 0) {
            // If we have class labels, use them
            const sortedClassIds = Object.keys(classLabels).sort((a, b) => parseInt(a) - parseInt(b));

            sortedClassIds.forEach(classId => {
                // Skip -1 as we've already added it with special handling
                if (parseInt(classId) === -1) return;

                // Create option for the hidden select
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = `${classId} - ${classLabels[classId]}`;
                hiddenSelect.appendChild(option);

                // Create corresponding item for the dropdown
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.dataset.value = classId;
                item.textContent = `${classId} - ${classLabels[classId]}`;
                item.dataset.searchtext = `${classId} ${classLabels[classId]}`.toLowerCase();
                dropdownContent.appendChild(item);
            });
        } else {
            // Otherwise create generic options 0-999
            for (let i = 0; i < 1000; i++) {
                // Skip -1 as we've already added it with special handling
                if (i === -1) continue;

                // Create option for the hidden select
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `Class ${i}`;
                hiddenSelect.appendChild(option);

                // Create corresponding item for the dropdown
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.dataset.value = i.toString();
                item.textContent = `Class ${i}`;
                item.dataset.searchtext = `${i} class ${i}`.toLowerCase();
                dropdownContent.appendChild(item);
            }
        }

        // Add all elements to the DOM
        customSelector.appendChild(inputField);
        customSelector.appendChild(dropdownIcon);
        customSelector.appendChild(dropdownContent);
        classInputGroup.appendChild(customSelector);
        classInputGroup.appendChild(hiddenSelect);

        // Set the value if we have a valid box index
        if (boxIndex >= 0 && boxIndex < bboxes.labels.length) {
            const labelId = bboxes.labels[boxIndex];

            // Check if this is a multi-label box first
            const isMultiLabel = bboxes.group && 
                               bboxes.group[boxIndex] !== null && 
                               bboxes.group[boxIndex] !== undefined;

            if (isMultiLabel) {
                // For multi-label boxes, disable the single-label class selector and show a message
                hiddenSelect.value = labelId.toString(); // Keep the original value but don't use it
                inputField.value = "Multi-label box (use multi-label controls)";
                inputField.disabled = true;
                //inputField.style.fontStyle = "italic";
                //inputField.style.color = "#666";
                console.log(`BBoxEditorUI: Disabled single-label selector for multi-label box in group ${bboxes.group[boxIndex]}`);
            } else {
                // Check if this is an uncertain box
                const isUncertain = labelId === -1 ||
                                    (bboxes.uncertain_flags && bboxes.uncertain_flags[boxIndex]);

                if (isUncertain) {
                    // For uncertain boxes, show "Not Sure" and disable class selection
                    hiddenSelect.value = "-1";
                    inputField.value = "Not Sure";
                    inputField.disabled = true;
                    inputField.style.fontStyle = "normal";
                    inputField.style.color = "";

                    // Make sure the box is properly marked as uncertain
                    bboxes.labels[boxIndex] = -1;
                    if (!bboxes.uncertain_flags) {
                        bboxes.uncertain_flags = new Array(bboxes.boxes.length).fill(false);
                    }
                    bboxes.uncertain_flags[boxIndex] = true;
                } else {
                    // For regular single-label boxes
                    hiddenSelect.value = labelId.toString();
                    inputField.disabled = false;
                    inputField.style.fontStyle = "normal";
                    inputField.style.color = "";

                    if (classLabels && classLabels[labelId]) {
                        inputField.value = `${labelId} - ${classLabels[labelId]}`;
                    } else {
                        inputField.value = `Class ${labelId}`;
                    }
                }
            }
        }

        // Show/hide dropdown when input field is clicked or dropdown icon is clicked
        inputField.addEventListener('click', () => {
            // Don't show dropdown for Not Sure boxes or multi-label boxes
            if (inputField.disabled) return;

            dropdownContent.style.display = dropdownContent.style.display === 'none' ? 'block' : 'none';
        });

        dropdownIcon.addEventListener('click', () => {
            // Don't show dropdown for Not Sure boxes or multi-label boxes
            if (inputField.disabled) return;

            dropdownContent.style.display = dropdownContent.style.display === 'none' ? 'block' : 'none';
            if (dropdownContent.style.display === 'block') {
                inputField.focus();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!customSelector.contains(e.target)) {
                dropdownContent.style.display = 'none';
            }
        });

        // Filter dropdown items on input
        let preventDropdownOpen = false;
        inputField.addEventListener('input', (e) => {
            // Only handle input events for single-label boxes (not Not Sure or multi-label boxes)
            if (inputField.disabled) return;

            // Don't reopen dropdown if we just closed it after a selection
            if (preventDropdownOpen) {
                preventDropdownOpen = false;
                return;
            }

            const searchTerm = e.target.value.toLowerCase();
            const items = dropdownContent.querySelectorAll('.dropdown-item');

            // Show dropdown when typing
            dropdownContent.style.display = 'block';

            let matchFound = false;
            let firstMatchValue = null;

            items.forEach(item => {
                const searchText = item.dataset.searchtext;
                if (searchText.includes(searchTerm)) {
                    item.style.display = 'block';
                    if (!matchFound) {
                        matchFound = true;
                        firstMatchValue = item.dataset.value;
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                } else {
                    item.style.display = 'none';
                    item.classList.remove('selected');
                }
            });

            // Don't automatically set to Not Sure if search field is empty
            if (searchTerm === "") {
                return;
            }

            // Update the selection immediately on the first match
            if (matchFound && this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.labels.length) {
                const newClassId = parseInt(firstMatchValue);
                hiddenSelect.value = firstMatchValue;
                bboxes.labels[this.currentBoxIndex] = newClassId;

                // Update gt field if it exists
                if (bboxes.gt && this.currentBoxIndex < bboxes.gt.length) {
                    bboxes.gt[this.currentBoxIndex] = newClassId;
                    console.log(`BBoxEditorUI: Updated gt[${this.currentBoxIndex}] to class ${newClassId}`);
                }

                // Update the preview canvas to show the class change
                this.updatePreviewCanvas();

                // Update the bbox selector dropdown to reflect the changed class
                this.updateBboxSelector(bboxes, this.currentBoxIndex, this.editor.classLabels);

                // Update the main editor if available
                if (this.editor) {
                    this.editor.redrawCanvas();
                }
            }
        });

        // Handle click on dropdown items
        dropdownContent.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const selectedValue = item.dataset.value;
                const selectedText = item.textContent;

                // Set flag to prevent dropdown from reopening due to input event
                preventDropdownOpen = true;

                // Update input field with selected text
                inputField.value = selectedText;

                // Update hidden select value
                hiddenSelect.value = selectedValue;

                // Hide dropdown
                dropdownContent.style.display = 'none';

                // Blur the input field to deactivate it
                inputField.blur();

                // Update the bbox class if one is selected
                if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.labels.length) {
                    const newClassId = parseInt(selectedValue);
                    bboxes.labels[this.currentBoxIndex] = newClassId;

                    // If this is the Not Sure option (-1)
                    if (newClassId === -1) {
                        // Ensure uncertain_flags exists
                        if (!bboxes.uncertain_flags) {
                            bboxes.uncertain_flags = new Array(bboxes.boxes.length).fill(false);
                        }
                        bboxes.uncertain_flags[this.currentBoxIndex] = true;

                        // Disable the input field for Not Sure boxes
                        inputField.disabled = true;
                    } else {
                        // For regular class, make sure uncertain flag is false
                        if (bboxes.uncertain_flags) {
                            bboxes.uncertain_flags[this.currentBoxIndex] = false;
                        }

                        // Make sure input field is enabled
                        inputField.disabled = false;
                    }

                    // Update gt field if it exists
                    if (bboxes.gt && this.currentBoxIndex < bboxes.gt.length) {
                        bboxes.gt[this.currentBoxIndex] = newClassId;
                        console.log(`BBoxEditorUI: Updated gt[${this.currentBoxIndex}] to class ${newClassId}`);
                    }

                    // Update the preview canvas
                    this.updatePreviewCanvas();

                    // Update the bbox selector dropdown
                    this.updateBboxSelector(bboxes, this.currentBoxIndex, this.editor.classLabels);

                    // Update the main editor
                    if (this.editor) {
                        this.editor.redrawCanvas();
                    }
                }
            });
        });

        // Add keyboard navigation
        inputField.addEventListener('keydown', (e) => {
            // Don't handle keyboard events for Not Sure boxes
            if (inputField.disabled) return;

            if (dropdownContent.style.display === 'block') {
                const items = Array.from(dropdownContent.querySelectorAll('.dropdown-item')).filter(
                    item => item.style.display !== 'none'
                );
                const selectedItem = dropdownContent.querySelector('.dropdown-item.selected');
                const selectedIndex = selectedItem ? items.indexOf(selectedItem) : -1;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (items.length > 0) {
                        // Remove current selection
                        if (selectedItem) {
                            selectedItem.classList.remove('selected');
                        }

                        // Select next item (or first if none selected)
                        const nextIndex = selectedIndex < 0 || selectedIndex >= items.length - 1 ? 0 : selectedIndex + 1;
                        items[nextIndex].classList.add('selected');
                        items[nextIndex].scrollIntoView({ block: 'nearest' });
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (items.length > 0) {
                        // Remove current selection
                        if (selectedItem) {
                            selectedItem.classList.remove('selected');
                        }

                        // Select previous item (or last if none selected)
                        const prevIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
                        items[prevIndex].classList.add('selected');
                        items[prevIndex].scrollIntoView({ block: 'nearest' });
                    }
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedItem) {
                        // Set flag to prevent dropdown from reopening due to input event
                        preventDropdownOpen = true;
                        selectedItem.click();
                        // Ensure dropdown is closed after selection
                        dropdownContent.style.display = 'none';
                        // Blur the input field to deactivate it
                        inputField.blur();
                    } else if (items.length === 1) {
                        // If only one item visible, select it
                        preventDropdownOpen = true;
                        items[0].click();
                        // Ensure dropdown is closed after selection
                        dropdownContent.style.display = 'none';
                        // Blur the input field to deactivate it
                        inputField.blur();
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    dropdownContent.style.display = 'none';
                }
            }
        });
    }

    // Update the checkbox based on crowd flag
    static updateCrowdCheckbox(boxIndex) {
        const crowdCheckbox = document.getElementById('bbox-crowd-checkbox');
        if (crowdCheckbox && this.bboxes.crowd_flags) {
            crowdCheckbox.checked = this.bboxes.crowd_flags[boxIndex];
            console.log(`Set crowd checkbox to: ${crowdCheckbox.checked}`);
        }
    }

    // Update the checkbox based on multi-label status
    static updateMultiLabelCheckbox(boxIndex) {
        const multiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
        
        // Validate boxIndex
        if (boxIndex < 0 || !this.bboxes || !this.bboxes.group || boxIndex >= this.bboxes.group.length) {
            if (multiLabelCheckbox) {
                multiLabelCheckbox.checked = false;
            }
            // Clear the multi-label container
            const multiLabelContainer = document.getElementById('multi-label-selection-container');
            if (multiLabelContainer) {
                multiLabelContainer.innerHTML = '';
                multiLabelContainer.style.display = 'block';
            }
            // Show single-label container
            const singleLabelContainer = document.getElementById('bbox-single-label-container');
            if (singleLabelContainer) {
                singleLabelContainer.style.display = 'block';
            }
            return;
        }
        
        if (multiLabelCheckbox && this.bboxes.group) {
            // Check if this box is part of a multi-label group
            const isMultiLabel = this.bboxes.group[boxIndex] !== null && this.bboxes.group[boxIndex] !== undefined;
            multiLabelCheckbox.checked = isMultiLabel;
            console.log(`Set multi-label checkbox to: ${multiLabelCheckbox.checked}`);
            
            // Always keep the multi-label dropdown visible but update its content
            const multiLabelContainer = document.getElementById('multi-label-selection-container');
            if (multiLabelContainer) {
                multiLabelContainer.style.display = 'block';
                
                if (isMultiLabel) {
                    // Populate with actual classes for multi-label box
                    this.populateMultiLabelClasses(boxIndex);
                } else {
                    // Show disabled state but keep visible
                    multiLabelContainer.innerHTML = '';
                }
            }
            
            // Toggle single-label visibility based on multi-label state
            const singleLabelContainer = document.getElementById('bbox-single-label-container');
            if (singleLabelContainer) {
                singleLabelContainer.style.display = isMultiLabel ? 'none' : 'block';
            }
        }
    }
    
    // Update the checkbox based on reflected flag
    static updateReflectedCheckbox(boxIndex) {
        const reflectedCheckbox = document.getElementById('bbox-reflected-checkbox');
        if (reflectedCheckbox && this.bboxes.reflected_flags) {
            reflectedCheckbox.checked = this.bboxes.reflected_flags[boxIndex];
            console.log(`Set reflected checkbox to: ${reflectedCheckbox.checked}`);
        }
    }

    // Update the checkbox based on rendition flag
    static updateRenditionCheckbox(boxIndex) {
        const renditionCheckbox = document.getElementById('bbox-rendition-checkbox');
        if (renditionCheckbox && this.bboxes.rendition_flags) {
            renditionCheckbox.checked = this.bboxes.rendition_flags[boxIndex];
            console.log(`Set rendition checkbox to: ${renditionCheckbox.checked}`);
        }
    }

    // Update the checkbox based on ocr_needed flag
    static updateOcrNeededCheckbox(boxIndex) {
        const ocrNeededCheckbox = document.getElementById('bbox-ocr-needed-checkbox');
        if (ocrNeededCheckbox && this.bboxes.ocr_needed_flags) {
            ocrNeededCheckbox.checked = this.bboxes.ocr_needed_flags[boxIndex];
            console.log(`Set ocr_needed checkbox to: ${ocrNeededCheckbox.checked}`);
        }
    }

    // Update the checkbox based on class numbers only flag
    static updateClassNumbersCheckbox() {
        const classNumbersCheckbox = document.getElementById('bbox-class-numbers-checkbox');
        if (classNumbersCheckbox && this.editor) {
            classNumbersCheckbox.checked = this.editor.getShowClassNumbersOnly();
            console.log(`Set class numbers checkbox to: ${classNumbersCheckbox.checked}`);
            
            // Also update the inline editor's checkbox if it exists
            const inlineClassNumbersCheckbox = document.getElementById('inline-class-numbers-checkbox');
            if (inlineClassNumbersCheckbox) {
                inlineClassNumbersCheckbox.checked = classNumbersCheckbox.checked;
            }
        }
    }
    
    // Toggle the multi-label interface based on the checkbox state
    static toggleMultiLabelInterface(isMultiLabel, boxIndex) {
        // Get both containers
        const multiLabelContainer = document.getElementById('multi-label-selection-container');
        const singleLabelContainer = document.getElementById('bbox-single-label-container');
        
        if (!multiLabelContainer || !singleLabelContainer) {
            console.log("Warning: Could not find multi-label or single-label container");
            return; // If containers don't exist, exit early
        }
        
        // Show or hide the appropriate interface
        if (isMultiLabel) {
            // Hide single-label and show multi-label
            singleLabelContainer.style.display = 'none';
            multiLabelContainer.style.display = 'block';
            multiLabelContainer.style.position = 'relative';
            // Populate the multi-label interface with available classes
            this.populateMultiLabelClasses(boxIndex);
            console.log("Showing multi-label interface, hiding single-label");
        } else {
            // Show single-label and hide multi-label
            singleLabelContainer.style.display = 'block';
            multiLabelContainer.style.display = 'none';
            console.log("Showing single-label interface, hiding multi-label");
        }
    }
    
    // Populate the multi-label interface with available classes (rewritten to match inline editor approach)
    static populateMultiLabelClasses(boxIndex, preserveDropdownState = false) {
        const multiLabelContainer = document.getElementById('multi-label-selection-container');
        if (!multiLabelContainer || !this.bboxes || !this.editor || !this.editor.classLabels) {
            console.error('Cannot populate multi-label classes: missing required elements');
            return;
        }
        
        // Validate boxIndex
        if (boxIndex < 0 || boxIndex >= this.bboxes.boxes.length) {
            console.error(`Invalid boxIndex ${boxIndex} for populateMultiLabelClasses`);
            multiLabelContainer.innerHTML = '<label for="bbox-class-selector">Classes:</label>';
            return;
        }
        
        // If preserveDropdownState is true, check if dropdown exists and preserve its state
        let wasDropdownOpen = false;
        const existingDropdownOptions = multiLabelContainer.querySelector('.multi-label-dropdown-options');
        if (preserveDropdownState && existingDropdownOptions) {
            wasDropdownOpen = existingDropdownOptions.style.display === 'block';
        }
        
        // Remove old document click handler to avoid stale handlers hiding new dropdown
        const oldWrapper = multiLabelContainer.querySelector('.multi-label-dropdown-wrapper');
        if (oldWrapper && oldWrapper._closeHandler) {
            document.removeEventListener('click', oldWrapper._closeHandler);
        }
        // Clear existing content
        multiLabelContainer.innerHTML = '<label for="bbox-class-selector">Classes:</label>';
        
        // Create wrapper with unified input/dropdown pattern (similar to inline editor)
        const dropdownWrapper = document.createElement('div');
        dropdownWrapper.className = 'multi-label-dropdown-wrapper';
        dropdownWrapper.style.cssText = `
            position: relative;
            width: 100%;
        `;
        
        // Create search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'multi-label-search input-width-100';
        searchInput.placeholder = 'Search or click to select classes...';
        searchInput.autocomplete = 'off';
        searchInput.style.cssText = `
            cursor: pointer;
        `;
        
        // Create dropdown options container
        const dropdownOptions = document.createElement('div');
        dropdownOptions.className = 'multi-label-dropdown-options';
        // Apply styling for visibility and scrolling - STARTS HIDDEN
        dropdownOptions.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #ddd;
            border-top: none;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            border-radius: 0 0 4px 4px;
        `;
        
        // Get the group ID for the current box
        const groupId = this.bboxes.group[boxIndex];
        
        // Find all boxes with the same group ID (part of the same multi-label group)
        const groupBoxIndices = groupId !== null && groupId !== undefined ? 
            this.bboxes.group.map((g, i) => g === groupId ? i : -1).filter(i => i !== -1) : 
            [boxIndex];
        
        // Get selected labels for this group (as numbers for comparison)
        const selectedLabels = groupBoxIndices.map(idx => parseInt(this.bboxes.labels[idx]));
        console.log(`Multi-label box ${boxIndex} has labels: ${selectedLabels.join(',')}`);
        
        // Store all class options for filtering
        let allClassOptions = [];
        
        // Clear any previous checkboxes state by re-populating completely
        console.log(`Refreshing dropdown for box ${boxIndex}, clearing previous state`);
        
        // Show dropdown when clicking on search input and prevent it from closing
        searchInput.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownOptions.style.display = 'block';
        });
        
        // Add search filtering functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            
            // Filter dropdown options based on search term
            allClassOptions.forEach(optionDiv => {
                const label = optionDiv.querySelector('label');
                if (label) {
                    const labelText = label.textContent.toLowerCase();
                    const matches = labelText.includes(searchTerm);
                    optionDiv.style.display = matches ? 'flex' : 'none';
                }
            });
        });
        
        // Prevent clicks inside options from closing dropdown
        dropdownOptions.addEventListener('click', function(e) {
            e.stopPropagation();
        });
        
        // Create checkboxes for each class
        Object.entries(this.editor.classLabels).forEach(([classId, className]) => {
            const numericClassId = parseInt(classId);

            const optionDiv = document.createElement('div');
            optionDiv.className = 'multi-label-dropdown-option';
            optionDiv.style.cssText = `
                padding: 6px 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                border-bottom: 1px solid #eee;
                font-size: 14px;
            `;

            // Create checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `multi-label-class-${classId}`;
            checkbox.value = classId;
            checkbox.checked = selectedLabels.includes(numericClassId);
            checkbox.style.marginRight = '6px';
            checkbox.style.cssText = `
                height: 17px;
            `;

            // Create label
            const label = document.createElement('label');
            label.htmlFor = `multi-label-class-${classId}`;
            label.textContent = `${classId} - ${className}`;
            label.style.cursor = 'pointer';
            label.style.flex = '1';
            label.style.fontSize = '14px';

            // Add hover effect
            optionDiv.addEventListener('mouseenter', () => {
                optionDiv.style.backgroundColor = '#f5f5f5';
            });
            optionDiv.addEventListener('mouseleave', () => {
                optionDiv.style.backgroundColor = 'white';
            });

            // Handle clicks - unified approach to avoid double-triggering
            optionDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                // If clicking on the label or div (but not checkbox), toggle the checkbox
                if (e.target === label || e.target === optionDiv) {
                    checkbox.checked = !checkbox.checked;
                    this.handleMultiLabelClassSelection(boxIndex, numericClassId, checkbox.checked);
                }
                // If clicking on checkbox, let the browser handle the toggle, then process
                // Note: we don't call handleMultiLabelClassSelection here to avoid double-call
            });
            
            // Handle direct checkbox clicks
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                // Checkbox state is already updated by the browser, just handle the selection
                this.handleMultiLabelClassSelection(boxIndex, numericClassId, checkbox.checked);
            });

            optionDiv.appendChild(checkbox);
            optionDiv.appendChild(label);
            dropdownOptions.appendChild(optionDiv);
            allClassOptions.push(optionDiv);
        });
        
        // Close dropdown when clicking outside
        const closeHandler = (e) => {
            if (!dropdownWrapper.contains(e.target)) {
                dropdownOptions.style.display = 'none';
            }
        };
        document.addEventListener('click', closeHandler);
        dropdownWrapper._closeHandler = closeHandler;
        
        dropdownWrapper.appendChild(searchInput);
        dropdownWrapper.appendChild(dropdownOptions);
        multiLabelContainer.appendChild(dropdownWrapper);
        
        // Restore dropdown state if it was previously open
        if (preserveDropdownState && wasDropdownOpen) {
            const newDropdownOptions = multiLabelContainer.querySelector('.multi-label-dropdown-options');
            if (newDropdownOptions) {
                newDropdownOptions.style.display = 'block';
            }
        }
        
        console.log(`Advanced editor multi-label dropdown populated with ${Object.keys(this.editor.classLabels).length} classes for box ${boxIndex}`);
    }
    
    // Handle multi-label class selection (rewritten to match inline editor approach)
    static handleMultiLabelClassSelection(boxIndex, classIndex, isSelected) {
        if (!this.bboxes || !this.bboxes.group) {
            return;
        }
        
        // Get the current group ID
        let groupId = this.bboxes.group[boxIndex];
        
        // If no group exists and we're selecting a new class, create a new group ID
        if ((groupId === null || groupId === undefined) && isSelected) {
            groupId = Date.now(); // Use timestamp as a simple unique ID
            this.bboxes.group[boxIndex] = groupId;
        }
        
        if (isSelected) {
            // If this class is already selected for this group, don't add it again
            const existingBoxWithClass = this.findBoxInGroup(groupId, classIndex);
            if (existingBoxWithClass !== -1) {
                return; // Class already exists in this group
            }
            
            // Clone the current box and add it with the new class
            this.addBoxToGroup(boxIndex, groupId, classIndex);
        } else {
            // Remove the box with this class from the group
            const boxToRemove = this.findBoxInGroup(groupId, classIndex);
            if (boxToRemove !== -1) {
                // Check if we're removing the currently selected box
                const isRemovingCurrentBox = boxToRemove === this.currentBoxIndex;
                
                // Find another box in the same group to select if we're removing current box
                let newSelectedBox = -1;
                for (let i = 0; i < this.bboxes.group.length; i++) {
                    if (this.bboxes.group[i] === groupId && i !== boxToRemove) {
                        newSelectedBox = i;
                        break;
                    }
                }
                
                // Calculate the adjusted index for the replacement box after removal
                let adjustedNewSelectedBox = newSelectedBox;
                if (newSelectedBox !== -1 && newSelectedBox > boxToRemove) {
                    adjustedNewSelectedBox = newSelectedBox - 1;
                }
                
                
                console.log(`Removing box ${boxToRemove} with class ${classIndex} from group ${groupId}`);
                console.log(`Original current box: ${this.currentBoxIndex}, replacement: ${newSelectedBox}, adjusted: ${adjustedNewSelectedBox}`);
                
                // Preserve dropdown state when updating selection
                const dropdownOptions = document.querySelector('#multi-label-selection-container .multi-label-dropdown-options');
                const wasDropdownOpen = dropdownOptions && dropdownOptions.style.display === 'block';
                
                // Sync with inline editor BEFORE removal if removing current box
                if (window.inlineEditor && isRemovingCurrentBox && adjustedNewSelectedBox !== -1) {
                    window.inlineEditor.currentBoxIndex = adjustedNewSelectedBox;
                    console.log(`Pre-removal: Synced inline editor currentBoxIndex to ${adjustedNewSelectedBox}`);
                }
                
                // Remove the selected label box from group
                this.removeBoxFromGroup(boxToRemove);
                console.log(`Removed class ${classIndex} from group ${groupId}`);
                
                // Always maintain selection within the same group
                if (adjustedNewSelectedBox !== -1) {
                    // Update current box index to the replacement
                    this.currentBoxIndex = adjustedNewSelectedBox;
                    this.selectedIndex = adjustedNewSelectedBox;
                    
                    // Update the editor's selectedBboxIndex if it exists
                    if (this.editor) {
                        this.editor.selectedBboxIndex = adjustedNewSelectedBox;
                    }
                    
                    // CRITICAL: Sync the inline editor's currentBoxIndex after removal
                    if (window.inlineEditor) {
                        window.inlineEditor.currentBoxIndex = adjustedNewSelectedBox;
                        console.log(`Post-removal: Synced inline editor currentBoxIndex to ${adjustedNewSelectedBox}`);
                    }
                    
                    // Update the bbox selector to reflect the new selection
                    this.updateBboxSelector(this.bboxes, adjustedNewSelectedBox, this.editor ? this.editor.classLabels : {});
                    
                    // Update form fields for the new selection
                    const newBox = this.bboxes.boxes[adjustedNewSelectedBox];
                    this.updateBoxValues(newBox);
                    
                    // Update all the checkbox states for the new box
                    this.updateCrowdCheckbox(adjustedNewSelectedBox);
                    this.updateReflectedCheckbox(adjustedNewSelectedBox);
                    this.updateRenditionCheckbox(adjustedNewSelectedBox);
                    this.updateOcrNeededCheckbox(adjustedNewSelectedBox);
                    
                    // Re-populate the dropdown with preserved state
                    this.populateMultiLabelClasses(adjustedNewSelectedBox, true);
                    
                    console.log(`Selection maintained in same group at adjusted box ${adjustedNewSelectedBox}`);
                    
                    // Restore dropdown state after selection update
                    if (wasDropdownOpen) {
                        setTimeout(() => {
                            const newDropdownOptions = document.querySelector('#multi-label-selection-container .multi-label-dropdown-options');
                            if (newDropdownOptions) {
                                newDropdownOptions.style.display = 'block';
                                newDropdownOptions.classList.add('show');
                            }
                        }, 10); // Small delay to ensure DOM updates
                    }
                } else {
                    // No boxes left in group, clear selection in both editors
                    this.currentBoxIndex = -1;
                    if (this.editor) {
                        this.editor.selectedBboxIndex = -1;
                    }
                    if (window.inlineEditor) {
                        window.inlineEditor.currentBoxIndex = -1;
                        console.log(`Post-removal: Cleared inline editor selection`);
                    }
                    this.updateBboxSelector(this.bboxes, -1, this.editor.classLabels);
                    // Refresh the canvas to show selection cleared
                    this.updatePreviewCanvas();
                    console.log(`No other boxes in group, cleared selection`);
                }
            } else {
                console.log(`Box with class ${classIndex} not found in group ${groupId}`);
            }
        }
        
        // Redraw the canvas to show updated bbox labels
        this.updatePreviewCanvas();
        
        // Update the box selector to reflect changes (for additions)
        if (isSelected) {
            this.updateBboxSelector(this.bboxes, boxIndex, this.editor.classLabels);
        }
        
        // Update the hidden field
        this.updateHiddenBboxesField(this.bboxes);
        
        // Re-populate dropdown to reflect current state (only if not already done in removal case)
        if (isSelected || (this.currentBoxIndex === boxIndex)) {
            this.populateMultiLabelClasses(this.currentBoxIndex, true);
        }
    }

    // Find a box in a group with a specific class
    static findBoxInGroup(groupId, classIndex) {
        if (!this.bboxes || !this.bboxes.group || !this.bboxes.labels) {
            return -1;
        }
        
        return this.bboxes.group.findIndex((g, i) => 
            g === groupId && this.bboxes.labels[i] === classIndex);
    }
    
    // Add a box to a group with a new class
    static addBoxToGroup(sourceBoxIndex, groupId, newClassIndex) {
        // Clone the box attributes
        const box = [...this.bboxes.boxes[sourceBoxIndex]];
        const score = this.bboxes.scores[sourceBoxIndex];
        
        // Create a new box entry with the same coordinates but different class
        this.bboxes.boxes.push(box);
        this.bboxes.scores.push(score);
        this.bboxes.labels.push(newClassIndex);
        this.bboxes.group.push(groupId);
        
        // Remove OOD border if it exists (when adding a bbox after marking as "None of ImageNet")
        if (window.removeOODBorder) {
            window.removeOODBorder();
        }
        
        // Add other flags as well
        if (this.bboxes.crowd_flags) {
            this.bboxes.crowd_flags.push(this.bboxes.crowd_flags[sourceBoxIndex]);
        }
        if (this.bboxes.reflected_flags) {
            this.bboxes.reflected_flags.push(this.bboxes.reflected_flags[sourceBoxIndex]);
        }
        if (this.bboxes.rendition_flags) {
            this.bboxes.rendition_flags.push(this.bboxes.rendition_flags[sourceBoxIndex]);
        }
        if (this.bboxes.ocr_needed_flags) {
            this.bboxes.ocr_needed_flags.push(this.bboxes.ocr_needed_flags[sourceBoxIndex]);
        }
    }
    
    // Remove a box from a group
    static removeBoxFromGroup(boxIndex) {
        // Remove the box entry
        this.bboxes.boxes.splice(boxIndex, 1);
        this.bboxes.scores.splice(boxIndex, 1);
        this.bboxes.labels.splice(boxIndex, 1);
        this.bboxes.group.splice(boxIndex, 1);
        
        // Remove other flags as well
        if (this.bboxes.crowd_flags) {
            this.bboxes.crowd_flags.splice(boxIndex, 1);
        }
        if (this.bboxes.reflected_flags) {
            this.bboxes.reflected_flags.splice(boxIndex, 1);
        }
        if (this.bboxes.rendition_flags) {
            this.bboxes.rendition_flags.splice(boxIndex, 1);
        }
        if (this.bboxes.ocr_needed_flags) {
            this.bboxes.ocr_needed_flags.splice(boxIndex, 1);
        }
    }

    // Helper method to reset form fields when a box is deleted
    static resetFormFields() {
        document.getElementById('bbox-x1').value = '';
        document.getElementById('bbox-y1').value = '';
        document.getElementById('bbox-x2').value = '';
        document.getElementById('bbox-y2').value = '';

        // Reset search input
        const searchInput = document.getElementById('class-search-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.disabled = false;
        }

        // Reset class selector to default if possible
        const classSelector = document.getElementById('bbox-class-selector');
        if (classSelector && classSelector.options.length > 0) {
            classSelector.selectedIndex = 0;
        }

        // Clear box details display
        const boxDisplay = document.getElementById('box-details');
        if (boxDisplay) {
            boxDisplay.innerHTML = '<div class="no-box-selected">No box selected</div>';
        }
    }

    static setupInputEvents(bboxes, editor) {
        const x1Input = document.getElementById('bbox-x1');
        const y1Input = document.getElementById('bbox-y1');
        const x2Input = document.getElementById('bbox-x2');
        const y2Input = document.getElementById('bbox-y2');

        // Update box from coordinate inputs
        const updateBoxFromInputs = () => {
            if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.boxes.length) {
                const x1 = parseInt(x1Input.value) || 0;
                const y1 = parseInt(y1Input.value) || 0;
                const x2 = parseInt(x2Input.value) || 0;
                const y2 = parseInt(y2Input.value) || 0;

                // Make sure the coordinates make sense (x1 < x2, y1 < y2)
                const validX1 = Math.min(x1, x2);
                const validY1 = Math.min(y1, y2);
                const validX2 = Math.max(x1, x2);
                const validY2 = Math.max(y1, y2);

                const newBox = [validX1, validY1, validX2, validY2];
                bboxes.boxes[this.currentBoxIndex] = newBox;
                
                // If this is a multi-label box, update ALL boxes in the same group
                const isMultiLabel = bboxes.group && 
                                   bboxes.group[this.currentBoxIndex] !== null && 
                                   bboxes.group[this.currentBoxIndex] !== undefined;
                
                if (isMultiLabel) {
                    const groupId = bboxes.group[this.currentBoxIndex];
                    // Update all boxes in the same group to have the same coordinates
                    bboxes.group.forEach((g, i) => {
                        if (g === groupId && i !== this.currentBoxIndex) {
                            bboxes.boxes[i] = [...newBox]; // Copy the new coordinates
                        }
                    });
                    console.log(`BBoxEditorUI: Updated coordinates for multi-label group ${groupId} via input fields`);
                }

                // Update the inputs to show the validated values
                x1Input.value = validX1;
                y1Input.value = validY1;
                x2Input.value = validX2;
                y2Input.value = validY2;

                // Redraw the canvas
                editor.redrawCanvas();
                this.updatePreviewCanvas();
            }
        };

        // Add event listeners for input fields
        if (x1Input) x1Input.addEventListener('change', updateBoxFromInputs);
        if (y1Input) y1Input.addEventListener('change', updateBoxFromInputs);
        if (x2Input) x2Input.addEventListener('change', updateBoxFromInputs);
        if (y2Input) y2Input.addEventListener('change', updateBoxFromInputs);

        // Add event listener for bounding box selector
        const bboxSelector = document.getElementById('bbox-selector');
        if (bboxSelector) {
            bboxSelector.addEventListener('change', (e) => {
                const selectedIndex = parseInt(e.target.value);
                console.log(`[SELECTOR-CHANGE] BBox selector changed to: ${selectedIndex} (options count: ${bboxSelector.options.length})`);
                console.log(`[SELECTOR-CHANGE] Current bboxes.boxes.length: ${bboxes.boxes.length}`);
                
                if (selectedIndex >= 0 && selectedIndex < bboxes.boxes.length) {
                    // Update the current box index reference for the class
                    this.currentBoxIndex = selectedIndex;
                    console.log(`[SELECTOR-CHANGE] Updated currentBoxIndex to: ${selectedIndex}`);
                    
                    // Update the crowd checkbox
                    this.updateCrowdCheckbox(this.currentBoxIndex);

                    // Update the reflected checkbox
                    this.updateReflectedCheckbox(this.currentBoxIndex);

                    // Update the rendition checkbox
                    this.updateRenditionCheckbox(this.currentBoxIndex);

                    // Update the ocr_needed checkbox
                    this.updateOcrNeededCheckbox(this.currentBoxIndex);

                    // Update editor selection
                    editor.selectedBboxIndex = selectedIndex;
                    console.log(`[SELECTOR-CHANGE] Updated editor.selectedBboxIndex to: ${selectedIndex}`);

                    // Update UI values with the newly selected box values
                    this.updateBoxValues(bboxes.boxes[selectedIndex]);

                    // Check if this is an uncertain box
                    const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[selectedIndex]) ||
                                       (bboxes.labels && bboxes.labels[selectedIndex] === -1);

                    // Update class selector and search input
                    const classSelector = document.getElementById('bbox-class-selector');
                    const searchInput = document.getElementById('class-search-input');

                    if (isUncertain) {
                        // For uncertain boxes, show "Not Sure" and disable the input
                        if (classSelector) {
                            classSelector.value = "-1";
                        }

                        if (searchInput) {
                            searchInput.value = "Not Sure";
                            searchInput.disabled = true;
                        }
                    } else {
                        // For regular boxes, get the class ID
                        let labelId;
                        if (bboxes.labels && bboxes.labels[selectedIndex] !== undefined) {
                            labelId = bboxes.labels[selectedIndex];
                        } else if (bboxes.gt && bboxes.gt[selectedIndex] !== undefined) {
                            labelId = bboxes.gt[selectedIndex];
                            console.log(`BBoxEditorUI: Using gt[${selectedIndex}] (${labelId}) for class selector`);
                        } else {
                            labelId = 0; // Default to class 0
                        }

                        if (classSelector) {
                            classSelector.value = labelId.toString();
                        }

                        if (searchInput) {
                            searchInput.disabled = false; // Enable the input

                            if (editor.classLabels && editor.classLabels[labelId]) {
                                searchInput.value = `${labelId} - ${editor.classLabels[labelId]}`;
                            } else {
                                searchInput.value = `Class ${labelId}`;
                            }
                        }
                    }

                    // Update canvases
                    editor.redrawCanvas();
                    this.selectedIndex = selectedIndex;
                    this.updatePreviewCanvas();
                } else {
                    // No box selected (selectedIndex is -1 or invalid)
                    // Clear all form fields and reset editor state
                    this.currentBoxIndex = -1;
                    editor.selectedBboxIndex = -1;
                    
                    // Reset form fields
                    this.resetFormFields();
                    
                    // Reset checkboxes to unchecked state
                    const crowdCheckbox = document.getElementById('bbox-crowd-checkbox');
                    const reflectedCheckbox = document.getElementById('bbox-reflected-checkbox');
                    const renditionCheckbox = document.getElementById('bbox-rendition-checkbox');
                    
                    if (crowdCheckbox) crowdCheckbox.checked = false;
                    if (reflectedCheckbox) reflectedCheckbox.checked = false;
                    if (renditionCheckbox) renditionCheckbox.checked = false;
                    
                    // Clear canvas selection and redraw
                    editor.redrawCanvas();
                    this.selectedIndex = -1;
                    this.updatePreviewCanvas();
                    
                    console.log('BBoxEditorUI: Cleared selection, no box selected');
                }
            });
        }
    }

    static updateBoxValues(box) {
        if (!box) return;

        const x1Input = document.getElementById('bbox-x1');
        const y1Input = document.getElementById('bbox-y1');
        const x2Input = document.getElementById('bbox-x2');
        const y2Input = document.getElementById('bbox-y2');

        if (x1Input && y1Input && x2Input && y2Input) {
            x1Input.value = Math.round(box[0]);
            y1Input.value = Math.round(box[1]);
            x2Input.value = Math.round(box[2]);
            y2Input.value = Math.round(box[3]);
        }
    }

    static updateBboxSelector(bboxes, selectedIndex, classLabels) {
        const bboxSelector = document.getElementById('bbox-selector');
        if (!bboxSelector) return;

        // Clear existing options
        bboxSelector.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = "-1";
        defaultOption.text = "-- Select a box --";
        bboxSelector.appendChild(defaultOption);

        // Only one entry per multi-label group
        const seenGroups = new Set();
        bboxes.boxes.forEach((_, i) => {
            const option = document.createElement('option');
            option.value = i;

            // Check if this is an uncertain box - by flag or by label value of -1
            const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[i]) ||
                               (bboxes.labels && bboxes.labels[i] === -1);

            // Check if this is a multi-label box
            const isMultiLabel = bboxes.group && 
                              bboxes.group[i] !== null && 
                              bboxes.group[i] !== undefined;
            
            // Skip duplicate group entries - only show one box per multi-label group
            if (isMultiLabel) {
                const groupId = bboxes.group[i];
                if (seenGroups.has(groupId)) {
                    return; // Skip this box as we've already seen this group
                }
                seenGroups.add(groupId);
            }

            // Make sure uncertain_flags is set if label is -1
            if (bboxes.labels && bboxes.labels[i] === -1) {
                if (!bboxes.uncertain_flags) {
                    bboxes.uncertain_flags = new Array(bboxes.boxes.length).fill(false);
                }
                bboxes.uncertain_flags[i] = true;
            }

            let labelText = `Box ${i + 1}`;

            if (isUncertain) {
                // For uncertain boxes, just show "Not Sure"
                labelText += ` (Not Sure)`;
            } else if (isMultiLabel) {
                // For multi-label boxes, show comma-separated class IDs only (no class names)
                const groupId = bboxes.group[i];
                const groupBoxIndices = bboxes.group.map((g, idx) => 
                    g === groupId ? idx : -1).filter(idx => idx !== -1);
                
                // Get all labels in this group
                const labelIds = groupBoxIndices.map(idx => bboxes.labels[idx]);
                
                // Format: "Box #: comma,separated,ids" with no class names
                labelText = `Box ${i + 1}: ${labelIds.join(',')}`;
                console.log(`Box ${i + 1} is multi-label with IDs: ${labelIds.join(',')}`);
            } else {
                // For regular boxes, show the class name if available
                let labelId;
                if (bboxes.labels && bboxes.labels[i] !== undefined) {
                    labelId = bboxes.labels[i];
                } else if (bboxes.gt && bboxes.gt[i] !== undefined) {
                    labelId = bboxes.gt[i];
                    console.log(`BBoxEditorUI: Using gt[${i}] (${labelId}) for selector option`);
                } else {
                    labelId = 0; // Default
                }

                if (labelId !== undefined) {
                    const labelName = classLabels && classLabels[labelId] ? classLabels[labelId] : `Class ${labelId}`;
                    labelText += ` (${labelId} - ${labelName})`;
                } else {
                    labelText += ` (Score: ${bboxes.scores[i].toFixed(2)})`;
                }
            }

            option.text = labelText;
            
            // Select the exact box that matches the selectedIndex
            option.selected = i === selectedIndex;
            
            bboxSelector.appendChild(option);
        });
    }

    static initializeNotSureBoxes() {
        // Make sure the bboxes object is valid
        if (!this.bboxes || !this.bboxes.boxes) return;

        // Check for -1 labels and ensure they're properly marked as uncertain
        if (this.bboxes.labels) {
            // Ensure uncertain_flags array exists
            if (!this.bboxes.uncertain_flags) {
                this.bboxes.uncertain_flags = new Array(this.bboxes.boxes.length).fill(false);
            }

            // Check all labels for -1 values
            for (let i = 0; i < this.bboxes.labels.length; i++) {
                if (this.bboxes.labels[i] === -1) {
                    this.bboxes.uncertain_flags[i] = true;
                    console.log(`BBoxEditorUI: Box ${i} has label -1, marked as uncertain`);

                    // Ensure possible_labels array exists
                    if (!this.bboxes.possible_labels) {
                        this.bboxes.possible_labels = new Array(this.bboxes.boxes.length).fill([]);
                    }

                    // Make sure the possible_labels entry exists
                    if (i >= this.bboxes.possible_labels.length) {
                        while (this.bboxes.possible_labels.length <= i) {
                            this.bboxes.possible_labels.push([]);
                        }
                    }
                }
            }
        }
    }

    static initPreviewCanvas(previewCanvas, img, bboxes, selectedIndex) {
        this.previewCtx = previewCanvas.getContext('2d');
        this.bboxes = bboxes;
        this.selectedIndex = selectedIndex;
        this.img = img;

        // Make sure we have a labels array
        if (!bboxes.labels && bboxes.gt) {
            bboxes.labels = bboxes.gt;
            console.log("BBoxEditorUI: Using gt field as labels for preview canvas");
        }

        // Set initial size
        this.calculateScale(previewCanvas);
        this.updatePreviewCanvas();

        // Add event listeners for preview canvas clicks
        this.setupPreviewCanvasEvents(previewCanvas);
    }

    static calculateScale(previewCanvas) {
        const container = previewCanvas.parentElement;
        const containerStyle = window.getComputedStyle(container);
        const padding = parseFloat(containerStyle.padding) || 0;
        const maxWidth = container.clientWidth - (padding * 2);
        const maxHeight = container.clientHeight - (padding * 2);

        const imgRatio = this.img.naturalWidth / this.img.naturalHeight;
        const containerRatio = maxWidth / maxHeight;

        if (imgRatio > containerRatio) {
            // Image is wider than container
            this.scale = maxWidth / this.img.naturalWidth;
            this.offsetX = 0;
            this.offsetY = (maxHeight - (this.img.naturalHeight * this.scale)) / 2;
        } else {
            // Image is taller than container
            this.scale = maxHeight / this.img.naturalHeight;
            this.offsetX = (maxWidth - (this.img.naturalWidth * this.scale)) / 2;
            this.offsetY = 0;
        }

        previewCanvas.width = maxWidth;
        previewCanvas.height = maxHeight;
    }

    static updatePreviewCanvas(showTempBox = false) {
        if (!this.previewCtx || !this.img) return;

        // Helper function to determine box styles, now supporting multi-label color
        const getBoxStyle = (isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel = false) => {
            const styles = {
                normal:            { stroke: "#e74c3c", fill: "rgba(231, 76, 60, 0.85)", text: "white" },
                uncertain:         { stroke: "#FFCC00", fill: "rgba(255, 204, 0, 0.85)", text: "black" },
                crowd:             { stroke: "#9C27B0", fill: "rgba(156, 39, 176, 0.85)", text: "white" },
                reflected:         { stroke: "#20B2AA", fill: "rgba(32, 178, 170, 0.85)", text: "white" },
                rendition:         { stroke: "#FF7043", fill: "rgba(255, 112, 67, 0.85)", text: "white" },
                ocrNeeded:         { stroke: "#C0C0C0", fill: "rgba(192, 192, 192, 0.85)", text: "black" },
                crowdReflected:    { stroke: "#5E6DAD", fill: "rgba(94, 109, 173, 0.85)", text: "white" },
                crowdRendition:    { stroke: "#B39DDB", fill: "rgba(179, 157, 219, 0.85)", text: "white" },
                crowdOcrNeeded:    { stroke: "#D1C4E9", fill: "rgba(209, 196, 233, 0.85)", text: "black" },
                reflectedRendition:{ stroke: "#FF8A65", fill: "rgba(255, 138, 101, 0.85)", text: "white" },
                reflectedOcrNeeded: { stroke: "#B0BEC5", fill: "rgba(176, 190, 197, 0.85)", text: "black" },
                renditionOcrNeeded:{ stroke: "#FFAB91", fill: "rgba(255, 171, 145, 0.85)", text: "black" },
                crowdReflectedRendition:     { stroke: "#81C784", fill: "rgba(129, 199, 132, 0.85)", text: "white" },
                crowdReflectedOcrNeeded:     { stroke: "#E1BEE7", fill: "rgba(225, 190, 231, 0.85)", text: "black" },
                crowdRenditionOcrNeeded:     { stroke: "#FFE0B2", fill: "rgba(255, 224, 178, 0.85)", text: "black" },
                reflectedRenditionOcrNeeded: { stroke: "#F8BBD9", fill: "rgba(248, 187, 217, 0.85)", text: "black" },
                crowdReflectedRenditionOcrNeeded: { stroke: "#F0F4C3", fill: "rgba(240, 244, 195, 0.85)", text: "black" },
                selected:          { stroke: "#2196F3", fill: "rgba(33, 150, 243, 0.85)", text: "white" },
                multiLabel:        { stroke: "#4CAF50", fill: "rgba(76, 175, 80, 0.85)", text: "white" },
            };
            // Multi-label boxes always remain green regardless of flags or selection state
            if (isMultiLabel && !isUncertain) {
                return styles.multiLabel;
            }
            // Flag combinations
            if (isCrowd && isReflected && isRendition && isOcrNeeded) return styles.crowdReflectedRenditionOcrNeeded;
            if (isReflected && isRendition && isOcrNeeded) return styles.reflectedRenditionOcrNeeded;
            if (isCrowd && isRendition && isOcrNeeded) return styles.crowdRenditionOcrNeeded;
            if (isCrowd && isReflected && isOcrNeeded) return styles.crowdReflectedOcrNeeded;
            if (isCrowd && isReflected && isRendition) return styles.crowdReflectedRendition;
            if (isRendition && isOcrNeeded) return styles.renditionOcrNeeded;
            if (isReflected && isOcrNeeded) return styles.reflectedOcrNeeded;
            if (isCrowd && isOcrNeeded) return styles.crowdOcrNeeded;
            if (isCrowd && isReflected) return styles.crowdReflected;
            if (isCrowd && isRendition) return styles.crowdRendition;
            if (isReflected && isRendition) return styles.reflectedRendition;
            if (isOcrNeeded) return styles.ocrNeeded;
            if (isRendition) return styles.rendition;
            if (isReflected) return styles.reflected;
            if (isCrowd) return styles.crowd;
            if (isUncertain) return styles.uncertain;
            if (isSelected) return styles.selected;
            return styles.normal;
        };

        const ctx = this.previewCtx;
        const canvas = ctx.canvas;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw image
        ctx.drawImage(
            this.img,
            this.offsetX,
            this.offsetY,
            this.img.naturalWidth * this.scale,
            this.img.naturalHeight * this.scale
        );

        // Helper function to draw labels
        const drawLabel = (ctx, labelText, labelX, labelY, boxStyle) => {
            const fontSize = 16;
            const padding = 6;
            const cornerRadius = 4;

            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            const textWidth = ctx.measureText(labelText).width;

            // Draw rounded rectangle background
            ctx.fillStyle = boxStyle.fill;
            ctx.strokeStyle = boxStyle.stroke;
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
            ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
            ctx.arcTo(labelX + textWidth + padding, labelY - fontSize - padding, labelX + textWidth + padding, labelY - fontSize - padding + cornerRadius, cornerRadius);
            ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
            ctx.arcTo(labelX + textWidth + padding, labelY + padding, labelX + textWidth + padding - cornerRadius, labelY + padding, cornerRadius);
            ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
            ctx.arcTo(labelX - padding, labelY + padding, labelX - padding, labelY + padding - cornerRadius, cornerRadius);
            ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
            ctx.arcTo(labelX - padding, labelY - fontSize - padding, labelX - padding + cornerRadius, labelY - fontSize - padding, cornerRadius);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw text
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            ctx.fillStyle = boxStyle.text;
            ctx.fillText(labelText, labelX, labelY);
            ctx.shadowColor = 'transparent'; // Reset shadow
        };

        // Determine selected group to skip rendering group boxes before drawing selection
        const selectedGroupId = (this.selectedIndex >= 0 ? this.bboxes.group?.[this.selectedIndex] : null);
        // Group multi-label boxes and draw single boxes (matching inline editor behavior)
        const processedGroups = new Set();
        const singleBoxes = [];
        
        this.bboxes.boxes.forEach((box, i) => {
            if (i === this.selectedIndex) return;
            // Determine group ID for this box
            const groupId = this.bboxes.group?.[i];
            // Skip drawing boxes from the selected multi-label group
            if (selectedGroupId != null && groupId === selectedGroupId) return;
            
            // If this is part of a multi-label group and it's not already processed
        if (groupId !== null && groupId !== undefined) {
                // If we haven't processed this group yet
                if (!processedGroups.has(groupId)) {
                    processedGroups.add(groupId);
                    
                    // Find all boxes with this group ID
                    const groupBoxIndices = this.bboxes.group.map((g, idx) => 
                        g === groupId ? idx : -1).filter(idx => idx !== -1);
                    
                    // Get attributes from the first box in the group
                    const firstIndex = groupBoxIndices[0];
                    const isUncertain = this.bboxes.uncertain_flags?.[firstIndex] || this.bboxes.labels?.[firstIndex] === -1;
                    const isCrowd = this.bboxes.crowd_flags?.[firstIndex];
                    const isReflected = this.bboxes.reflected_flags?.[firstIndex];
                    const isRendition = this.bboxes.rendition_flags?.[firstIndex];
                    const isOcrNeeded = this.bboxes.ocr_needed_flags?.[firstIndex];
                    
                    // Style will be from the first box in the group
                    // Multi-label style
                    const boxStyle = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, false, true);
                    
                    // Combine labels from all boxes in the group
                    const labelIds = groupBoxIndices.map(idx => this.bboxes.labels?.[idx] ?? this.bboxes.gt?.[idx] ?? 0);
                    
                    let labelText;
                    if (isUncertain) {
                        labelText = "Not Sure";
                    } else {
                        // Always show comma-separated IDs for multi-label
                        labelText = labelIds.join(", ");
                    }
                    
                    // Limit label text to prevent excessive length
                    if (labelText.length > 50) {
                        labelText = labelText.substring(0, 47) + '...';
                    }
                    
                    // Draw box
                    ctx.strokeStyle = boxStyle.stroke;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(
                        box[0] * this.scale + this.offsetX,
                        box[1] * this.scale + this.offsetY,
                        (box[2] - box[0]) * this.scale,
                        (box[3] - box[1]) * this.scale
                    );

                    // Determine label position
                    const isAtTopEdge = box[1] <= 5;
                    const labelX = box[0] * this.scale + this.offsetX + 5;
                    const labelY = isAtTopEdge
                        ? (box[1] * this.scale + this.offsetY + 20)
                        : (box[1] * this.scale + this.offsetY - 8);

                    // Draw label
                    drawLabel(ctx, labelText, labelX, labelY, boxStyle);
                }
                // If this group was already processed, skip this box
            } else {
                // This is a single-label box, process normally
                singleBoxes.push(i);
            }
        });
        
        // Draw all single boxes (non-grouped boxes)
        singleBoxes.forEach(i => {
            const box = this.bboxes.boxes[i];
            const isUncertain = (this.bboxes.uncertain_flags && this.bboxes.uncertain_flags[i]) ||
                                (this.bboxes.labels && this.bboxes.labels[i] === -1);
            const isCrowd = this.bboxes.crowd_flags && this.bboxes.crowd_flags[i];
            const isReflected = this.bboxes.reflected_flags && this.bboxes.reflected_flags[i];
            const isRendition = this.bboxes.rendition_flags && this.bboxes.rendition_flags[i];
            const isOcrNeeded = this.bboxes.ocr_needed_flags && this.bboxes.ocr_needed_flags[i];
            
            const boxStyle = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, false);
            const labelId = this.bboxes.labels?.[i] ?? this.bboxes.gt?.[i] ?? 0;
            const labelName = this.editor?.classLabels?.[labelId] || `Class ${labelId}`;
            
            let labelText;
            if (isUncertain) {
                labelText = "Not Sure";
            } else if (this.editor && this.editor.getShowClassNumbersOnly()) {
                labelText = `${labelId}`;
            } else {
                labelText = `${labelId} - ${labelName}`;
            }
            
            // Draw box
            ctx.strokeStyle = boxStyle.stroke;
            ctx.lineWidth = 3;
            ctx.strokeRect(
                box[0] * this.scale + this.offsetX,
                box[1] * this.scale + this.offsetY,
                (box[2] - box[0]) * this.scale,
                (box[3] - box[1]) * this.scale
            );

            // Determine label position
            const isAtTopEdge = box[1] <= 5;
            const labelX = box[0] * this.scale + this.offsetX + 5;
            const labelY = isAtTopEdge
                ? (box[1] * this.scale + this.offsetY + 20)
                : (box[1] * this.scale + this.offsetY - 8);

            // Draw label
            drawLabel(ctx, labelText, labelX, labelY, boxStyle);
        });

        // Draw selected box
        if (this.selectedIndex >= 0 && this.selectedIndex < this.bboxes.boxes.length) {
            // Determine if selected is part of multi-label group
            const selIdx = this.selectedIndex;
            const selGroup = this.bboxes.group?.[selIdx];
            const isMulti = selGroup !== null && selGroup !== undefined;
            // Representative index for multi-label
            const repIdx = isMulti
                ? (this.bboxes.group.map((g,i) => g===selGroup? i:-1).filter(i=>i!==-1)[0] || selIdx)
                : selIdx;
            const box = this.bboxes.boxes[repIdx];
            // Flags from selected box
            const isUncertain = this.bboxes.uncertain_flags?.[selIdx] || this.bboxes.labels?.[selIdx]===-1;
            const isCrowd = this.bboxes.crowd_flags?.[selIdx];
            const isReflected = this.bboxes.reflected_flags?.[selIdx];
            const isRendition = this.bboxes.rendition_flags?.[selIdx];
            const isOcrNeeded = this.bboxes.ocr_needed_flags?.[selIdx];
            const isSelected = true;
            // Determine style: green border for multi-label selected, blue for single selection
            let boxStyle;
            if (isMulti) {
                // Multi-label selected: use green style (treat as non-selected multi-label)
                boxStyle = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, false, true);
            } else {
                // Single-label selected: use selected (blue)
                boxStyle = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, false);
            }
            // Draw box
            ctx.strokeStyle = boxStyle.stroke;
            ctx.lineWidth = 3;
            ctx.strokeRect(
                box[0]*this.scale+this.offsetX,
                box[1]*this.scale+this.offsetY,
                (box[2]-box[0])*this.scale,
                (box[3]-box[1])*this.scale
            );
            // Determine label text
            let labelText;
            if (isMulti) {
                const groupIndices = this.bboxes.group.map((g,i)=>g===selGroup?i:-1).filter(i=>i!==-1);
                const ids = groupIndices.map(i=>this.bboxes.labels?.[i]??this.bboxes.gt?.[i]??0);
                labelText = isUncertain?"Not Sure":ids.join(", ");
            } else {
                const labelId = this.bboxes.labels?.[selIdx] ?? this.bboxes.gt?.[selIdx] ?? 0;
                labelText = isUncertain?"Not Sure":(
                    this.editor&&this.editor.getShowClassNumbersOnly()?`${labelId}`:`${labelId} - ${this.editor?.classLabels?.[labelId]||`Class ${labelId}`}`
                );
            }
            // Draw label and handles
            const isAtTopEdge = box[1]<=5;
            const lx = box[0]*this.scale+this.offsetX+5;
            const ly = isAtTopEdge?box[1]*this.scale+this.offsetY+20:box[1]*this.scale+this.offsetY-8;
            drawLabel(ctx,labelText,lx,ly,boxStyle);
            this.drawHandles(
                ctx,
                box[0]*this.scale+this.offsetX,
                box[1]*this.scale+this.offsetY,
                (box[2]-box[0])*this.scale,
                (box[3]-box[1])*this.scale
            );
        }

        // Draw temporary box if needed
        if (showTempBox && this.tempBox) {
            this.checkNotSureMode();
            const tempBoxStyle = getBoxStyle(false, false, false, false, this.notSureMode, false);

            ctx.strokeStyle = tempBoxStyle.stroke;
            ctx.lineWidth = 2;

            const x = this.tempBox[0] * this.scale + this.offsetX;
            const y = this.tempBox[1] * this.scale + this.offsetY;
            const width = (this.tempBox[2] - this.tempBox[0]) * this.scale;
            const height = (this.tempBox[3] - this.tempBox[1]) * this.scale;

            ctx.strokeRect(x, y, width, height);
        }
    }

    static drawHandles(ctx, x, y, width, height) {
        const handleSize = 8;
        ctx.fillStyle = '#2196F3';

        // Top-left handle
        ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);

        // Top-right handle
        ctx.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);

        // Bottom-left handle
        ctx.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);

        // Bottom-right handle
        ctx.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
    }

    static findBoxByBorderOnly(x, y, borderWidth = 5) {
        // Only detect clicks on borders, not inside the box
        for (let i = 0; i < this.bboxes.boxes.length; i++) {
            const box = this.bboxes.boxes[i];

            // Convert box coordinates to canvas coordinates
            const sx1 = box[0] * this.scale + this.offsetX;
            const sy1 = box[1] * this.scale + this.offsetY;
            const sx2 = box[2] * this.scale + this.offsetX;
            const sy2 = box[3] * this.scale + this.offsetY;

            // Check if we clicked on any of the four borders
            const onLeftBorder = Math.abs(x - sx1) <= borderWidth && y >= sy1 && y <= sy2;
            const onRightBorder = Math.abs(x - sx2) <= borderWidth && y >= sy1 && y <= sy2;
            const onTopBorder = Math.abs(y - sy1) <= borderWidth && x >= sx1 && x <= sx2;
            const onBottomBorder = Math.abs(y - sy2) <= borderWidth && x >= sx1 && x <= sx2;

            if (onLeftBorder || onRightBorder || onTopBorder || onBottomBorder) {
                return i;
            }
        }
        return -1;
    }

    static setupPreviewCanvasEvents(canvas) {
        let isDragging = false;
        let isResizing = false;
        this.isDrawingNew = false; // Flag for drawing new bbox
        let resizeCorner = null;
        let startX, startY;
        let newBoxStart = { x: 0, y: 0 }; // Starting coordinates for new box

        // Helper to convert screen coordinates to image coordinates
        const toImageCoords = (screenX, screenY) => {
            return {
                x: Math.max(0, Math.min(this.img.naturalWidth, (screenX - this.offsetX) / this.scale)),
                y: Math.max(0, Math.min(this.img.naturalHeight, (screenY - this.offsetY) / this.scale))
            };
        };

        // Helper to check if a point is near a box corner
        const isNearCorner = (x, y, box, threshold = 10) => {
            // Convert box coordinates to screen coordinates
            const sx1 = box[0] * this.scale + this.offsetX;
            const sy1 = box[1] * this.scale + this.offsetY;
            const sx2 = box[2] * this.scale + this.offsetX;
            const sy2 = box[3] * this.scale + this.offsetY;

            // Check each corner
            if (Math.abs(x - sx1) < threshold && Math.abs(y - sy1) < threshold) {
                return 'topLeft';
            }
            if (Math.abs(x - sx2) < threshold && Math.abs(y - sy1) < threshold) {
                return 'topRight';
            }
            if (Math.abs(x - sx1) < threshold && Math.abs(y - sy2) < threshold) {
                return 'bottomLeft';
            }
            if (Math.abs(x - sx2) < threshold && Math.abs(y - sy2) < threshold) {
                return 'bottomRight';
            }

            return null;
        };

        // Helper to check if a point is near a box border (but not corner)
        const isNearBorder = (x, y, box, threshold = 10) => {
            // Convert box coordinates to screen coordinates
            const sx1 = box[0] * this.scale + this.offsetX;
            const sy1 = box[1] * this.scale + this.offsetY;
            const sx2 = box[2] * this.scale + this.offsetX;
            const sy2 = box[3] * this.scale + this.offsetY;

            // Define corner area to avoid overlap with isNearCorner
            const cornerArea = threshold + 2;

            // Check left border (avoiding corners)
            if (Math.abs(x - sx1) < threshold &&
                y > sy1 + cornerArea &&
                y < sy2 - cornerArea) {
                return 'left';
            }

            // Check right border (avoiding corners)
            if (Math.abs(x - sx2) < threshold &&
                y > sy1 + cornerArea &&
                y < sy2 - cornerArea) {
                return 'right';
            }

            // Check top border (avoiding corners)
            if (Math.abs(y - sy1) < threshold &&
                x > sx1 + cornerArea &&
                x < sx2 - cornerArea) {
                return 'top';
            }

            // Check bottom border (avoiding corners)
            if (Math.abs(y - sy2) < threshold &&
                x > sx1 + cornerArea &&
                x < sx2 - cornerArea) {
                return 'bottom';
            }

            return null;
        };

        // Add click event listener to the canvas for selecting boxes
        canvas.addEventListener('click', (e) => {
            // Don't process clicks when in the middle of drawing
            if (this.isDrawingNew) return;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Only find boxes by border click, not inside click
            const clickedBoxIndex = this.findBoxByBorderOnly(x, y, 8); // 8px border width for easier selection

            if (clickedBoxIndex !== -1) {
                // Update the current box index reference
                this.currentBoxIndex = clickedBoxIndex;
                this.selectedIndex = clickedBoxIndex;

                if (this.editor) {
                    this.editor.selectedBboxIndex = clickedBoxIndex;
                }

                // Update the crowd checkbox
                this.updateCrowdCheckbox(this.selectedIndex);

                // Update the reflected checkbox
                this.updateReflectedCheckbox(this.selectedIndex);

                // Update the rendition checkbox
                this.updateRenditionCheckbox(this.selectedIndex);

                // Update the ocr_needed checkbox
                this.updateOcrNeededCheckbox(this.selectedIndex);

                // Update UI
                this.updateBoxValues(this.bboxes.boxes[clickedBoxIndex]);

                // Check if this is an uncertain box
                const isUncertain = (this.bboxes.uncertain_flags &&
                                    this.bboxes.uncertain_flags[clickedBoxIndex]) ||
                                   (this.bboxes.labels &&
                                    this.bboxes.labels[clickedBoxIndex] === -1);

                // Update class selector
                const classSelector = document.getElementById('bbox-class-selector');
                const searchInput = document.getElementById('class-search-input');

                if (isUncertain) {
                    // For uncertain boxes, set to Not Sure and disable input
                    if (classSelector) {
                        classSelector.value = "-1";
                    }

                    if (searchInput) {
                        searchInput.value = "Not Sure";
                        searchInput.disabled = true;
                    }
                } else {
                    // For regular boxes, get the label ID
                    let labelId;
                    if (this.bboxes.labels && this.bboxes.labels[clickedBoxIndex] !== undefined) {
                        labelId = this.bboxes.labels[clickedBoxIndex];
                    } else if (this.bboxes.gt && this.bboxes.gt[clickedBoxIndex] !== undefined) {
                        labelId = this.bboxes.gt[clickedBoxIndex];
                        console.log(`BBoxEditorUI: Using gt[${clickedBoxIndex}] (${labelId}) for class selector`);
                    } else {
                        labelId = 0; // Default
                    }

                    if (classSelector) {
                        classSelector.value = labelId.toString();
                    }

                    // Update search input and make sure it's enabled
                    if (searchInput) {
                        searchInput.disabled = false;

                        if (this.editor && this.editor.classLabels && this.editor.classLabels[labelId]) {
                            searchInput.value = `${labelId} - ${this.editor.classLabels[labelId]}`;
                        } else {
                            searchInput.value = `Class ${labelId}`;
                        }
                    }
                }

                // Update bbox selector dropdown
                const bboxSelector = document.getElementById('bbox-selector');
                if (bboxSelector) {
                    // For multi-label boxes, find the representative option (first box in group)
                    const isClickedMultiLabel = this.bboxes.group && 
                                               this.bboxes.group[clickedBoxIndex] !== null && 
                                               this.bboxes.group[clickedBoxIndex] !== undefined;
                    
                    if (isClickedMultiLabel) {
                        const clickedGroupId = this.bboxes.group[clickedBoxIndex];
                        // Find the first box in this group (which should be the option we created)
                        const groupBoxIndices = this.bboxes.group.map((g, idx) => g === clickedGroupId ? idx : -1).filter(idx => idx !== -1);
                        const firstBoxInGroup = Math.min(...groupBoxIndices);
                        bboxSelector.value = firstBoxInGroup;
                    } else {
                        bboxSelector.value = clickedBoxIndex;
                    }
                }

                // Redraw canvas
                this.updatePreviewCanvas();
                if (this.editor) {
                    this.editor.redrawCanvas();
                }
            }
        });

        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Check if we're clicking on a corner of the selected box
            if (this.selectedIndex >= 0 && this.selectedIndex < this.bboxes.boxes.length) {
                const box = this.bboxes.boxes[this.selectedIndex];
                const corner = isNearCorner(x, y, box);

                if (corner) {
                    isResizing = true;
                    resizeCorner = corner;
                    startX = x;
                    startY = y;
                    e.preventDefault();
                    return;
                }

                // Check if we're clicking on a border of the selected box
                const border = isNearBorder(x, y, box);
                if (border) {
                    isDragging = true;
                    startX = x;
                    startY = y;
                    e.preventDefault();
                    return;
                }
            }

            // Check if we're clicking on any box border before starting to draw
            const boxIndex = this.findBoxByBorderOnly(x, y, 8);
            if (boxIndex !== -1) {
                // If we clicked on a box, don't start drawing
                return;
            }

            // If we get here, we're starting to draw a new box
            const imgCoords = toImageCoords(x, y);
            newBoxStart = { x: imgCoords.x, y: imgCoords.y };
            this.isDrawingNew = true;

            // Check for Not Sure mode state from inline editor
            this.checkNotSureMode();
            console.log("Drawing box with Not Sure mode:", this.notSureMode ? "ON" : "OFF");
        });

        // Add document-level mousemove listener to handle mouse movements outside canvas
        document.addEventListener('mousemove', (e) => {
            // Only process if we're in an active drawing/dragging/resizing operation
            if (!this.isDrawingNew && !isDragging && !isResizing) return;

            const rect = canvas.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;

            // Constrain coordinates to image boundaries (not canvas boundaries)
            // This allows proper drawing even when mouse goes outside the canvas
            const imageLeft = this.offsetX;
            const imageTop = this.offsetY;
            const imageRight = this.offsetX + (this.img.naturalWidth * this.scale);
            const imageBottom = this.offsetY + (this.img.naturalHeight * this.scale);
            
            x = Math.max(imageLeft, Math.min(imageRight, x));
            y = Math.max(imageTop, Math.min(imageBottom, y));

            // Handle resizing existing boxes
            if (isResizing && this.selectedIndex >= 0) {
                const box = this.bboxes.boxes[this.selectedIndex];
                const imgCoords = toImageCoords(x, y);

                switch (resizeCorner) {
                    case 'topLeft':
                        box[0] = Math.min(box[2] - 1, Math.max(0, imgCoords.x));
                        box[1] = Math.min(box[3] - 1, Math.max(0, imgCoords.y));
                        break;
                    case 'topRight':
                        box[2] = Math.max(box[0] + 1, Math.min(this.img.naturalWidth, imgCoords.x));
                        box[1] = Math.min(box[3] - 1, Math.max(0, imgCoords.y));
                        break;
                    case 'bottomLeft':
                        box[0] = Math.min(box[2] - 1, Math.max(0, imgCoords.x));
                        box[3] = Math.max(box[1] + 1, Math.min(this.img.naturalHeight, imgCoords.y));
                        break;
                    case 'bottomRight':
                        box[2] = Math.max(box[0] + 1, Math.min(this.img.naturalWidth, imgCoords.x));
                        box[3] = Math.max(box[1] + 1, Math.min(this.img.naturalHeight, imgCoords.y));
                        break;
                }

                // If this is a multi-label box, update ALL boxes in the same group
                const isMultiLabel = this.bboxes.group && 
                                   this.bboxes.group[this.selectedIndex] !== null && 
                                   this.bboxes.group[this.selectedIndex] !== undefined;
                
                if (isMultiLabel) {
                    const groupId = this.bboxes.group[this.selectedIndex];
                    // Update all boxes in the same group to have the same coordinates
                    this.bboxes.group.forEach((g, i) => {
                        if (g === groupId && i !== this.selectedIndex) {
                            this.bboxes.boxes[i] = [...box]; // Copy the new coordinates
                        }
                    });
                    console.log(`BBoxEditorUI: Updated coordinates for multi-label group ${groupId} during resizing`);
                }

                // Update the crowd checkbox
                this.updateCrowdCheckbox(this.selectedIndex);

                // Update the reflected checkbox
                this.updateReflectedCheckbox(this.selectedIndex);

                // Update the rendition checkbox
                this.updateRenditionCheckbox(this.selectedIndex);

                // Update the ocr_needed checkbox
                this.updateOcrNeededCheckbox(this.selectedIndex);

                // Update input fields
                this.updateBoxValues(box);
                this.updatePreviewCanvas();
                return;
            }

            // Handle dragging existing boxes
            if (isDragging && this.selectedIndex >= 0) {
                const box = this.bboxes.boxes[this.selectedIndex];
                const dx = (x - startX) / this.scale;
                const dy = (y - startY) / this.scale;

                // Calculate new box position
                const width = box[2] - box[0];
                const height = box[3] - box[1];

                // Constrain to image bounds
                let newX1 = Math.max(0, Math.min(this.img.naturalWidth - width, box[0] + dx));
                let newY1 = Math.max(0, Math.min(this.img.naturalHeight - height, box[1] + dy));

                const newBox = [newX1, newY1, newX1 + width, newY1 + height];
                
                // Update the current box
                this.bboxes.boxes[this.selectedIndex] = newBox;
                
                // If this is a multi-label box, update ALL boxes in the same group
                const isMultiLabel = this.bboxes.group && 
                                   this.bboxes.group[this.selectedIndex] !== null && 
                                   this.bboxes.group[this.selectedIndex] !== undefined;
                
                if (isMultiLabel) {
                    const groupId = this.bboxes.group[this.selectedIndex];
                    // Update all boxes in the same group to have the same coordinates
                    this.bboxes.group.forEach((g, i) => {
                        if (g === groupId && i !== this.selectedIndex) {
                            this.bboxes.boxes[i] = [...newBox]; // Copy the new coordinates
                        }
                    });
                    console.log(`BBoxEditorUI: Updated coordinates for multi-label group ${groupId} during dragging`);
                }

                // Update start position for next move
                startX = x;
                startY = y;

                // Update the crowd checkbox
                this.updateCrowdCheckbox(this.selectedIndex);

                // Update the reflected checkbox
                this.updateReflectedCheckbox(this.selectedIndex);

                // Update the rendition checkbox
                this.updateRenditionCheckbox(this.selectedIndex);

                // Update the ocr_needed checkbox
                this.updateOcrNeededCheckbox(this.selectedIndex);

                // Update input fields
                this.updateBoxValues(box);
                this.updatePreviewCanvas();
                return;
            }

            // Handle drawing a new box
            if (this.isDrawingNew) {
                const imgCoords = toImageCoords(x, y);

                // Create a temporary box for visualization
                this.tempBox = [
                    Math.min(newBoxStart.x, imgCoords.x),
                    Math.min(newBoxStart.y, imgCoords.y),
                    Math.max(newBoxStart.x, imgCoords.x),
                    Math.max(newBoxStart.y, imgCoords.y)
                ];

                // Redraw with the temporary box
                this.updatePreviewCanvas(true); // true = show temporary box
                return;
            }
        });

        // Add canvas-level mousemove for cursor updates (when not actively drawing/dragging)
        canvas.addEventListener('mousemove', (e) => {
            // Skip cursor updates if we're actively drawing, dragging, or resizing
            if (this.isDrawingNew || isDragging || isResizing) return;

            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Update cursor based on mouse position
            if (this.selectedIndex >= 0) {
                const box = this.bboxes.boxes[this.selectedIndex];
                const corner = isNearCorner(x, y, box);
                const border = isNearBorder(x, y, box);

                if (corner) {
                    switch (corner) {
                        case 'topLeft':
                        case 'bottomRight':
                            canvas.style.cursor = 'nwse-resize';
                            break;
                        case 'topRight':
                        case 'bottomLeft':
                            canvas.style.cursor = 'nesw-resize';
                            break;
                    }
                } else if (border) {
                    canvas.style.cursor = 'move';
                } else {
                    canvas.style.cursor = 'crosshair'; // Crosshair for drawing new boxes
                }
            } else {
                canvas.style.cursor = 'crosshair'; // Crosshair for drawing new boxes
            }
        });

        // Use document-level mouseup to catch mouse releases outside canvas
        document.addEventListener('mouseup', (e) => {
            // If we were drawing a new box, finalize it
            if (this.isDrawingNew && this.tempBox) {
                const width = this.tempBox[2] - this.tempBox[0];
                const height = this.tempBox[3] - this.tempBox[1];

                // Only create the box if it has some minimum size
                if (width > 5 && height > 5) {
                    // Deselect any previously selected box before creating a new Not Sure box
                    if (this.notSureMode) {
                        // Store the Not Sure state but clear selection
                        const wasInNotSureMode = this.notSureMode;
                        const savedPossibleLabels = [...this.possibleLabels];

                        // Reset the current selection
                        this.selectedIndex = -1;
                        this.currentBoxIndex = -1;

                        if (this.editor) {
                            this.editor.selectedBboxIndex = -1;
                        }

                        // Restore Not Sure state after clearing selection
                        this.notSureMode = wasInNotSureMode;
                        this.possibleLabels = savedPossibleLabels;
                    }

                    // Check Not Sure mode again to make sure we have the latest state
                    this.checkNotSureMode();
                    console.log("Finishing box with Not Sure mode:", this.notSureMode ? "ON" : "OFF");

                    // Add the new box with a default score
                    this.bboxes.boxes.push([...this.tempBox]);
                    this.bboxes.scores.push(100); // 100% confidence for user-drawn boxes
                    
                    // Remove OOD border if it exists (when adding a bbox after marking as "None of ImageNet")
                    if (window.removeOODBorder) {
                        window.removeOODBorder();
                    }

                    // Get index of the new box
                    const newIndex = this.bboxes.boxes.length - 1;

                    // Ensure all arrays exist with proper length
                    if (!this.bboxes.labels) {
                        this.bboxes.labels = new Array(newIndex).fill(0);
                    }

                    if (!this.bboxes.crowd_flags) {
                        this.bboxes.crowd_flags = new Array(newIndex).fill(false);
                    }
                    this.bboxes.crowd_flags.push(false);

                    if (!this.bboxes.reflected_flags) {
                        this.bboxes.reflected_flags = new Array(newIndex).fill(false);
                    }
                    this.bboxes.reflected_flags.push(false);

                    if (!this.bboxes.rendition_flags) {
                        this.bboxes.rendition_flags = new Array(newIndex).fill(false);
                    }
                    this.bboxes.rendition_flags.push(false);

                    if (!this.bboxes.ocr_needed_flags) {
                        this.bboxes.ocr_needed_flags = new Array(newIndex).fill(false);
                    }
                    this.bboxes.ocr_needed_flags.push(false);

                    if (!this.bboxes.uncertain_flags) {
                        this.bboxes.uncertain_flags = new Array(newIndex).fill(false);
                    }

                    if (!this.bboxes.possible_labels) {
                        this.bboxes.possible_labels = new Array(newIndex).fill([]);
                        this.bboxes.possible_labels.push([]);
                    } else {
                        this.bboxes.possible_labels.push([]);
                    }

                    // Initialize and extend group array for new boxes
                    if (!this.bboxes.group) {
                        this.bboxes.group = new Array(this.bboxes.boxes.length).fill(null);
                    } else if (this.bboxes.group.length < this.bboxes.boxes.length) {
                        // Extend existing array if needed - new boxes start as single-label (null group)
                        while (this.bboxes.group.length < this.bboxes.boxes.length) {
                            this.bboxes.group.push(null);
                        }
                    }

                    // Set class based on Not Sure mode
                    let classId;
                    // In the mouseup event listener, find where it creates Not Sure boxes and replace that section
                    if (this.notSureMode) {
                        // If Not Sure mode is active, make this a Not Sure box
                        classId = -1;
                        this.bboxes.uncertain_flags.push(true);

                        // Make sure the possible_labels array exists in the right format
                        if (!this.bboxes.possible_labels) {
                            this.bboxes.possible_labels = new Array(newIndex + 1).fill().map(() => []);
                        } else if (this.bboxes.possible_labels.length <= newIndex) {
                            // Extend the array if needed
                            while (this.bboxes.possible_labels.length <= newIndex) {
                                this.bboxes.possible_labels.push([]);
                            }
                        }

                        // Use the possible labels we retrieved
                        if (this.possibleLabels && this.possibleLabels.length > 0) {
                            // Convert all values to integers to be safe
                            this.bboxes.possible_labels[newIndex] = this.possibleLabels.map(val => parseInt(val));
                            console.log("Created Not Sure box with possible labels:", this.bboxes.possible_labels[newIndex]);
                        }

                        console.log("Created Not Sure box at index", newIndex);
                        console.log("DEBUG - possible_labels array:", this.bboxes.possible_labels);

                        // Turn off Not Sure mode after drawing one Not Sure box
                        this.turnOffNotSureMode();
                    } else {
                        // For regular boxes - use the helper function to determine class
                        if (typeof window.getClassForNewBBox === 'function') {
                            classId = window.getClassForNewBBox();
                            console.log(`Advanced editor: Using getClassForNewBBox helper, got class: ${classId}`);
                        } else if (window.groundTruthClassId !== undefined && window.groundTruthClassId !== null) {
                            classId = parseInt(window.groundTruthClassId);
                            console.log(`Advanced editor: Using global groundTruthClassId: ${classId}`);
                        } else if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
                            classId = parseInt(window.lastSelectedClassId);
                            console.log(`Advanced editor: Using global lastSelectedClassId: ${classId}`);
                        } else {
                            const classSelector = document.getElementById('bbox-class-selector');
                            if (classSelector && classSelector.value !== "-1") {
                                classId = parseInt(classSelector.value) || 0;
                                console.log(`Advanced editor: Using class selector value: ${classId}`);
                            } else {
                                // Default to 0 only if no other option is available
                                classId = 0;
                                console.log(`Advanced editor: Using default class 0`);
                            }
                        }

                        this.bboxes.uncertain_flags.push(false);
                    }

                    // Add the class to the labels array
                    this.bboxes.labels.push(classId);

                    // Also update gt array if it exists
                    if (this.bboxes.gt) {
                        if (this.bboxes.gt.length < newIndex) {
                            while (this.bboxes.gt.length < newIndex) {
                                this.bboxes.gt.push(0);
                            }
                        }
                        this.bboxes.gt.push(classId);
                        console.log(`Added new box to gt array with class ${classId}`);
                    }

                    // Select the new box
                    this.selectedIndex = newIndex;
                    this.currentBoxIndex = newIndex;

                    if (this.editor) {
                        this.editor.selectedBboxIndex = newIndex;
                    }

                    // Update UI
                    this.updateBoxValues(this.tempBox);
                    this.updateCrowdCheckbox(newIndex);
                    this.updateReflectedCheckbox(newIndex);
                    this.updateRenditionCheckbox(newIndex);
                    this.updateOcrNeededCheckbox(newIndex);

                    // Update bbox selector dropdown
                    this.updateBboxSelector(this.bboxes, newIndex, this.editor ? this.editor.classLabels : {});

                    // Update class selector and search input
                    const classSelector = document.getElementById('bbox-class-selector');
                    const searchInput = document.getElementById('class-search-input');

                    if (classSelector) {
                        classSelector.value = classId.toString();

                        if (searchInput) {
                            if (classId === -1) {
                                // For Not Sure boxes
                                searchInput.value = "Not Sure";
                                searchInput.disabled = true;
                            } else {
                                // For regular boxes
                                searchInput.disabled = false;
                                if (this.editor && this.editor.classLabels && this.editor.classLabels[classId]) {
                                    searchInput.value = `${classId} - ${this.editor.classLabels[classId]}`;
                                } else {
                                    searchInput.value = `Class ${classId}`;
                                }
                            }
                        }
                    }

                    // Update both the editor's canvas and preview canvas
                    this.updatePreviewCanvas(); // Update preview canvas to show the new box
                    if (this.editor) {
                        this.editor.redrawCanvas();
                    }

                    // Reset radio selection if one was used
                    if (window.lastSelectedClassId !== null && typeof window.resetRadioSelection === 'function') {
                        window.resetRadioSelection();
                    }
                }

                // Clean up temporary box
                delete this.tempBox;
                
                // Update preview canvas to clear temp box even if box wasn't created
                this.updatePreviewCanvas();
            }

            // Reset drawing state completely
            this.isDrawingNew = false;

            if ((isDragging || isResizing) && this.editor) {
                this.editor.redrawCanvas(); // Update the main canvas too
            }

            isDragging = false;
            isResizing = false;
            resizeCorner = null;
        });

        canvas.addEventListener('mouseleave', () => {
            if ((isDragging || isResizing || this.isDrawingNew) && this.editor) {
                this.editor.redrawCanvas(); // Update the main canvas too
            }

            isDragging = false;
            isResizing = false;
            this.isDrawingNew = false;
            resizeCorner = null;
            delete this.tempBox;
            canvas.style.cursor = 'default';
        });
    }

    // Method to save bboxes directly via AJAX
    static saveBboxes(bboxes) {
        // Get the current image name
        const imageNameInput = document.querySelector('input[name="image_name"]');
        const imageName = imageNameInput ? imageNameInput.value : 'unknown';

        // Get the username from the URL
        const pathParts = window.location.pathname.split('/');
        const username = pathParts[1]; // Assuming URL structure is /<username>/label

        // Format the data as required using the same format as inline-bbox-editor.js
        let bboxDataArray = [];

        // Determine if we have any uncertain boxes
        let hasUncertainBoxes = false;
        if (bboxes.uncertain_flags) {
            hasUncertainBoxes = bboxes.uncertain_flags.some(flag => flag === true);
        }
        if (!hasUncertainBoxes && bboxes.labels) {
            hasUncertainBoxes = bboxes.labels.some(label => label === -1);
        }

        // Set label_type based on whether we have uncertain boxes
        const labelType = hasUncertainBoxes ? "uncertain" : "basic";

        // Update hidden label_type field if it exists
        const labelTypeField = document.getElementById('label_type');
        if (labelTypeField) {
            labelTypeField.value = labelType;
        }

        bboxes.boxes.forEach((box, i) => {
            // Check if this box is uncertain - by flag or by label value of -1
            const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[i]) ||
                               (bboxes.labels && bboxes.labels[i] === -1);

            let bboxData = {
                coordinates: box,
                crowd_flag: bboxes.crowd_flags && bboxes.crowd_flags[i],
                reflected_flag: bboxes.reflected_flags && bboxes.reflected_flags[i]
            };

            if (isUncertain) {
                // For uncertain boxes, include possible_labels and uncertain_flag
                bboxData.uncertain_flag = true;

                // Get possible_labels array (ensure it's a simple array of integers)
                if (bboxes.possible_labels && i < bboxes.possible_labels.length && bboxes.possible_labels[i]) {
                    const possibleLabels = bboxes.possible_labels[i];
                    // Ensure it's a simple array of integers
                    if (Array.isArray(possibleLabels)) {
                        bboxData.possible_labels = possibleLabels.map(label => parseInt(label));
                        console.log(`Box ${i}: Using possible_labels:`, bboxData.possible_labels);
                    } else if (typeof possibleLabels === 'object') {
                        // Try to convert from object if necessary
                        const labelArray = [];
                        for (const key in possibleLabels) {
                            if (possibleLabels.hasOwnProperty(key)) {
                                labelArray.push(parseInt(key));
                            }
                        }
                        bboxData.possible_labels = labelArray;
                        console.log(`Box ${i}: Converted object to possible_labels:`, bboxData.possible_labels);
                    } else {
                        bboxData.possible_labels = [];
                        console.log(`Box ${i}: Could not determine possible_labels format, using empty array`);
                    }
                } else {
                    bboxData.possible_labels = []; // Empty array as fallback
                    console.log(`Box ${i}: No possible_labels found, using empty array`);
                }

                // Also set label to -1 for uncertain boxes
                bboxData.label = -1;
            } else {
                // For regular boxes, include label
                let label = 0;
                if (bboxes.labels && bboxes.labels[i] !== undefined) {
                    label = bboxes.labels[i];
                } else if (bboxes.gt && bboxes.gt[i] !== undefined) {
                    label = bboxes.gt[i];
                    console.log(`BBoxEditorUI: Using gt[${i}] (${label}) for saved data`);
                }

                bboxData.label = label;
            }

            bboxDataArray.push(bboxData);
        });

        // Create the object for the request with label_type
        const saveData = {
            image_name: imageName,
            bboxes: bboxDataArray,
            label_type: labelType
        };

        console.log(`BBoxEditorUI: Saving ${bboxDataArray.length} boxes with label_type: ${labelType}`);

        // Check if we're in sanity check mode
        const sanityModeElement = document.querySelector('input[name="sanity_check_mode"]');
        const sanityMode = sanityModeElement ? sanityModeElement.value : null;
        
        // Determine the save endpoint based on sanity mode
        const saveEndpoint = sanityMode ? `/${username}/save_bboxes_sanity/${sanityMode}` : `/${username}/save_bboxes`;
        
        console.log(`BBoxEditorUI: Using save endpoint: ${saveEndpoint}`);

        // Make AJAX call to save the bboxes
        fetch(saveEndpoint, {
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
            console.log('Bboxes saved successfully:', data);

            // Also update the hidden field for form submission
            this.updateHiddenBboxesField(bboxes, labelType);
        })
        .catch(error => {
            console.error('Error saving bboxes:', error);
        });
    }

    static updateHiddenBboxesField(bboxes, labelType) {
        const bboxesField = document.getElementById('bboxes-data-field');
        if (!bboxesField) return;

        // Format data for form field using the same format as inline-bbox-editor.js
        let bboxDataArray = [];

        bboxes.boxes.forEach((box, i) => {
            // Check if this box is uncertain - by flag or by label value of -1
            const isUncertain = (bboxes.uncertain_flags && bboxes.uncertain_flags[i]) ||
                               (bboxes.labels && bboxes.labels[i] === -1);

            let bboxData = {
                coordinates: box,
                crowd_flag: bboxes.crowd_flags && bboxes.crowd_flags[i],
                reflected_flag: bboxes.reflected_flags && bboxes.reflected_flags[i]
            };

            if (isUncertain) {
                // For uncertain boxes
                bboxData.uncertain_flag = true;
                bboxData.possible_labels = bboxes.possible_labels && bboxes.possible_labels[i] ?
                    bboxes.possible_labels[i] : [];
                // Also include label: -1 for uncertain boxes
                bboxData.label = -1;
            } else {
                // For regular boxes
                let label = 0;
                if (bboxes.labels && bboxes.labels[i] !== undefined) {
                    label = bboxes.labels[i];
                } else if (bboxes.gt && bboxes.gt[i] !== undefined) {
                    label = bboxes.gt[i];
                }

                bboxData.label = label;
            }

            bboxDataArray.push(bboxData);
        });

        // Create object with label_type (use parameter or determine from bboxes)
        if (!labelType) {
            // Determine if we have any uncertain boxes
            let hasUncertainBoxes = false;
            if (bboxes.uncertain_flags) {
                hasUncertainBoxes = bboxes.uncertain_flags.some(flag => flag === true);
            }
            if (!hasUncertainBoxes && bboxes.labels) {
                hasUncertainBoxes = bboxes.labels.some(label => label === -1);
            }

            labelType = hasUncertainBoxes ? "uncertain" : "basic";
        }

        const formData = {
            bboxes: bboxDataArray,
            label_type: labelType
        };

        // Update the hidden field with JSON string
        bboxesField.value = JSON.stringify(formData);
        console.log(`BBoxEditorUI: Updated hidden field with label_type: ${labelType}, bboxes: ${bboxDataArray.length}`);
    }

}

// Export the module for use in other scripts
window.BBoxEditorUI = BBoxEditorUI;

console.log('BBox Editor UI loaded with integrated searchable dropdown and ground truth support');