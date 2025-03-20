/**
 * Handles the UI for the bounding box editor modal
 * Updated to use ground truth class for new boxes
 */
class BBoxEditorUI {
    static openModal(box, boxIndex, bboxes, editor) {
        const modal = document.getElementById('bbox-modal-container');
        const previewCanvas = document.getElementById('bbox-preview-canvas');
        if (!modal || !previewCanvas) {
            console.error('Modal or preview canvas not found');
            return;
        }

        // Store editor reference and current box index for use in event handlers
        this.editor = editor;
        this.currentBoxIndex = boxIndex;

        // Handle gt field - ensure labels array exists
        if (!bboxes.labels && bboxes.gt) {
            console.log("BBoxEditorUI: Using 'gt' field as labels");
            bboxes.labels = bboxes.gt;
        }

        // Show the modal
        modal.classList.add('show-modal');

        // Set up the enhanced class selector dropdown with search
        this.setupEnhancedClassSelector(boxIndex, bboxes, editor.classLabels);

        // Set up event listeners
        this.setupEventListeners(bboxes, editor);

        // Populate input fields
        this.updateBoxValues(box);

        // Initialize the preview canvas
        this.initPreviewCanvas(previewCanvas, editor.img, bboxes, boxIndex, editor.threshold);

        // Update bbox selector with available boxes
        this.updateBboxSelector(bboxes, boxIndex, editor.threshold, editor.classLabels);
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
        else if (!bboxes.crowd_flags) {
            bboxes.crowd_flags = Array(bboxes.boxes.length).fill(false);
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

        // Create search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'class-search-input';
        searchInput.placeholder = 'Search for class...';
        searchInput.className = 'bbox-editor-selector';
        searchInput.style.marginBottom = '5px';

        // Create the select element
        const selectElem = document.createElement('select');
        selectElem.id = 'bbox-class-selector';
        selectElem.className = 'bbox-editor-selector';

        // Populate with class options
        if (classLabels && Object.keys(classLabels).length > 0) {
            // If we have class labels, use them
            const sortedClassIds = Object.keys(classLabels).sort((a, b) => parseInt(a) - parseInt(b));

            sortedClassIds.forEach(classId => {
                const option = document.createElement('option');
                option.value = classId;
                option.textContent = `${classId} - ${classLabels[classId]}`;
                option.dataset.searchtext = `${classId} ${classLabels[classId]}`.toLowerCase();
                selectElem.appendChild(option);
            });
        } else {
            // Otherwise create generic options 0-999
            for (let i = 0; i < 1000; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.text = `Class ${i}`;
                option.dataset.searchtext = `${i} class ${i}`.toLowerCase();
                selectElem.appendChild(option);
            }
        }

        // Set the value if we have a valid box index
        if (boxIndex >= 0 && boxIndex < bboxes.labels.length) {
            selectElem.value = bboxes.labels[boxIndex];

            if (classLabels && classLabels[bboxes.labels[boxIndex]]) {
                searchInput.value = `${bboxes.labels[boxIndex]} - ${classLabels[bboxes.labels[boxIndex]]}`;
            } else {
                searchInput.value = `Class ${bboxes.labels[boxIndex]}`;
            }
        }

        // Add search functionality
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();

            if (searchTerm) {
                // Filter options based on search term
                let firstMatchFound = false;

                Array.from(selectElem.options).forEach(option => {
                    const matchesSearch = option.dataset.searchtext.includes(searchTerm);

                    // Don't hide options in the actual select element as that's not well-supported
                    // Instead, we'll just select the first matching option
                    if (matchesSearch && !firstMatchFound) {
                        option.selected = true;
                        firstMatchFound = true;

                        // Immediately apply the class change to the selected box
                        if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.labels.length) {
                            const newClassId = parseInt(option.value);
                            bboxes.labels[this.currentBoxIndex] = newClassId;

                            // Update gt field if it exists
                            if (bboxes.gt && this.currentBoxIndex < bboxes.gt.length) {
                                bboxes.gt[this.currentBoxIndex] = newClassId;
                                console.log(`BBoxEditorUI: Updated gt[${this.currentBoxIndex}] to class ${newClassId}`);
                            }

                            // Update the preview canvas to show the class change
                            this.updatePreviewCanvas();

                            // Update the main editor if available
                            if (this.editor) {
                                this.editor.redrawCanvas();
                            }
                        }
                    }
                });
            }
        });

        // Set search input value when select changes
        selectElem.addEventListener('change', () => {
            const selectedOption = selectElem.options[selectElem.selectedIndex];
            if (selectedOption) {
                searchInput.value = selectedOption.textContent;

                // Also update the label for the selected bbox if one is selected
                if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.labels.length) {
                    const newClassId = parseInt(selectedOption.value);
                    bboxes.labels[this.currentBoxIndex] = newClassId;

                    // Update gt field if it exists
                    if (bboxes.gt && this.currentBoxIndex < bboxes.gt.length) {
                        bboxes.gt[this.currentBoxIndex] = newClassId;
                        console.log(`BBoxEditorUI: Updated gt[${this.currentBoxIndex}] to class ${newClassId}`);
                    }

                    this.updatePreviewCanvas();
                }
            }
        });

        // Add elements to the class input group
        classInputGroup.appendChild(searchInput);
        classInputGroup.appendChild(selectElem);
    }

    static setupEventListeners(bboxes, editor) {
        // Close button
        const closeButton = document.querySelector('.bbox-editor-close');
        if (closeButton) {
            closeButton.onclick = () => {
                document.getElementById('bbox-modal-container').classList.remove('show-modal');
            };
        }

        // Save button
        const saveButton = document.getElementById('bbox-update');
        if (saveButton) {
            saveButton.onclick = () => {
                if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.boxes.length) {
                    const x1 = parseInt(document.getElementById('bbox-x1').value) || 0;
                    const y1 = parseInt(document.getElementById('bbox-y1').value) || 0;
                    const x2 = parseInt(document.getElementById('bbox-x2').value) || 0;
                    const y2 = parseInt(document.getElementById('bbox-y2').value) || 0;

                    // Get selected class
                    const classSelector = document.getElementById('bbox-class-selector');
                    const newClassId = parseInt(classSelector.value);
                    bboxes.labels[this.currentBoxIndex] = newClassId;

                    // Update gt field if it exists
                    if (bboxes.gt && this.currentBoxIndex < bboxes.gt.length) {
                        bboxes.gt[this.currentBoxIndex] = newClassId;
                        console.log(`BBoxEditorUI: Updated gt[${this.currentBoxIndex}] to class ${newClassId}`);
                    }

                    // Update coordinates
                    bboxes.boxes[this.currentBoxIndex] = [
                        Math.min(x1, x2),
                        Math.min(y1, y2),
                        Math.max(x1, x2),
                        Math.max(y1, y2)
                    ];

                    // Save bboxes via AJAX
                    this.saveBboxes(bboxes, editor.threshold);

                    editor.redrawCanvas();
                    document.getElementById('bbox-modal-container').classList.remove('show-modal');
                }
            };
        }

        // Delete button
        const deleteButton = document.getElementById('bbox-delete');
        if (deleteButton) {
            deleteButton.onclick = () => {
                if (this.currentBoxIndex >= 0 && this.currentBoxIndex < bboxes.boxes.length) {
                    // Store the index being deleted
                    const deletedIndex = this.currentBoxIndex;

                                        // Remove box, score and label from the arrays
                    bboxes.boxes.splice(deletedIndex, 1);
                    bboxes.scores.splice(deletedIndex, 1);
                    if (bboxes.labels) bboxes.labels.splice(deletedIndex, 1);

                    // Also remove crowd flag if it exists
                    if (bboxes.crowd_flags) bboxes.crowd_flags.splice(deletedIndex, 1);

                    // Also update gt field if it exists
                    if (bboxes.gt) {
                        bboxes.gt.splice(deletedIndex, 1);
                        console.log(`BBoxEditorUI: Removed box ${deletedIndex} from gt array`);
                    }

                    // Reset the current box index
                    this.currentBoxIndex = -1;
                    editor.selectedBboxIndex = -1;

                    // Create a fresh copy of the bboxes object to ensure change detection
                    editor.bboxes = JSON.parse(JSON.stringify(bboxes));

                    // Force a complete redraw of the canvas
                    editor.forceRedraw();

                    // Update the dropdown selector
                    this.updateBboxSelector(bboxes, -1, editor.threshold, editor.classLabels);

                    // Immediately clear form fields and redraw the canvas
                    this.resetFormFields();
                    this.updatePreviewCanvas();
                }
            };
        }

        // Delete All button
        const deleteAllButton = document.getElementById('bbox-delete-all');
        if (deleteAllButton) {
            deleteAllButton.onclick = () => {
                // Remove all boxes, scores, labels and crowd flags from the arrays
                bboxes.boxes = [];
                bboxes.scores = [];
                if (bboxes.labels) bboxes.labels = [];
                if (bboxes.crowd_flags) bboxes.crowd_flags = [];

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
                this.updateBboxSelector(bboxes, -1, editor.threshold, editor.classLabels);

                // Immediately clear form fields and redraw the canvas
                this.resetFormFields();
                this.updatePreviewCanvas();
            };
        }

        // Cancel button
        const cancelButton = document.getElementById('bbox-cancel');
        if (cancelButton) {
            cancelButton.onclick = () => {
                // Restore the original bboxes data with a fresh copy
                bboxes.boxes = [...editor.originalBboxes.boxes];
                bboxes.scores = [...editor.originalBboxes.scores];

                if (editor.originalBboxes.labels) {
                    bboxes.labels = [...editor.originalBboxes.labels];
                }

                // Restore gt array if it exists
                if (editor.originalBboxes.gt) {
                    bboxes.gt = [...editor.originalBboxes.gt];
                    console.log("BBoxEditorUI: Restored gt array from original data");
                }

                // Update the editor's reference
                editor.bboxes = bboxes;

                // Force a complete redraw
                editor.forceRedraw();

                document.getElementById('bbox-modal-container').classList.remove('show-modal');
            };
        }

        // Crowd checkbox
        const crowdCheckbox = document.getElementById('bbox-crowd-checkbox');
        if (crowdCheckbox) {
            crowdCheckbox.onchange = () => {
                if (this.currentBoxIndex < 0) return;
                // Update the crowd_flags array based on the checkbox state
                editor.bboxes.crowd_flags[this.currentBoxIndex] = crowdCheckbox.checked;
                console.log(`Updated crowd flag for box ${this.currentBoxIndex} to: ${crowdCheckbox.checked}`);
            };
        }

        // Setup input field change events
        this.setupInputEvents(bboxes, editor);
    }

    // Update the checkbox based on crowd flag
    static updateCrowdCheckbox(boxIndex) {
        const crowdCheckbox = document.getElementById('bbox-crowd-checkbox');
        if (crowdCheckbox && this.bboxes.crowd_flags) {
            crowdCheckbox.checked = this.bboxes.crowd_flags[boxIndex];
            console.log(`Set crowd checkbox to: ${crowdCheckbox.checked}`);
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

                bboxes.boxes[this.currentBoxIndex] = [validX1, validY1, validX2, validY2];

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
                if (selectedIndex >= 0 && selectedIndex < bboxes.boxes.length) {
                    // Update the current box index reference for the class
                    this.currentBoxIndex = selectedIndex;
                    // Update the crowd checkbox
                    this.updateCrowdCheckbox(this.currentBoxIndex);

                    // Update editor selection
                    editor.selectedBboxIndex = selectedIndex;

                    // Update UI values with the newly selected box values
                    this.updateBoxValues(bboxes.boxes[selectedIndex]);

                    // Update class selector and search input
                    const classSelector = document.getElementById('bbox-class-selector');
                    const searchInput = document.getElementById('class-search-input');

                    // Check labels first, then gt if labels doesn't exist
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

                        // Update search input too
                        if (searchInput) {
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

    static updateBboxSelector(bboxes, selectedIndex, threshold, classLabels) {
        const bboxSelector = document.getElementById('bbox-selector');
        if (!bboxSelector) return;

        bboxSelector.innerHTML = '';
        bboxes.boxes.forEach((_, i) => {
            if (bboxes.scores[i] >= threshold) {
                const option = document.createElement('option');
                option.value = i;

                // Try labels first, then gt
                let labelId;
                let labelText = `Box ${i + 1}`;

                if (bboxes.labels && bboxes.labels[i] !== undefined) {
                    labelId = bboxes.labels[i];
                } else if (bboxes.gt && bboxes.gt[i] !== undefined) {
                    labelId = bboxes.gt[i];
                    console.log(`BBoxEditorUI: Using gt[${i}] (${labelId}) for selector option`);
                } else {
                    labelId = 0; // Default
                }

                if (labelId !== undefined) {
                    const labelName = classLabels[labelId] || `Class ${labelId}`;
                    labelText += ` (${labelId} - ${labelName})`;
                } else {
                    labelText += ` (Score: ${bboxes.scores[i].toFixed(2)})`;
                }

                option.text = labelText;
                option.selected = i === selectedIndex;
                bboxSelector.appendChild(option);
            }
        });
    }

    static initPreviewCanvas(previewCanvas, img, bboxes, selectedIndex, threshold) {
        this.previewCtx = previewCanvas.getContext('2d');
        this.bboxes = bboxes;
        this.selectedIndex = selectedIndex;
        this.img = img;
        this.threshold = threshold;

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

        // Draw existing boxes
        this.bboxes.boxes.forEach((box, i) => {
            if (this.bboxes.scores[i] >= this.threshold) {
                // Determine if this box is selected
                const isSelected = i === this.selectedIndex;

                // Set box styles
                ctx.strokeStyle = isSelected ? '#2196F3' : '#e74c3c';
                ctx.lineWidth = isSelected ? 3 : 2;

                const x = box[0] * this.scale + this.offsetX;
                const y = box[1] * this.scale + this.offsetY;
                const width = (box[2] - box[0]) * this.scale;
                const height = (box[3] - box[1]) * this.scale;

                // Draw the box
                ctx.strokeRect(x, y, width, height);

                // Draw handles for selected box
                if (isSelected) {
                    this.drawHandles(ctx, x, y, width, height);
                }

                // Check if box is at top edge or is a whole-image box
                const isAtTopEdge = box[1] <= 5; // within 5px of top edge
                const isWholeImage = box[0] <= 5 && box[1] <= 5 &&
                                   Math.abs(box[2] - this.img.naturalWidth) <= 5 &&
                                   Math.abs(box[3] - this.img.naturalHeight) <= 5;

                // Position label inside the box if it's at top edge
                const labelX = x + 5; // Add small padding from left edge
                const labelY = isAtTopEdge ? y + 20 : y - 8; // Move label inside box if at top edge

                // Get label ID with fallback to gt field if needed
                let labelId;
                if (this.bboxes.labels && this.bboxes.labels[i] !== undefined) {
                    labelId = this.bboxes.labels[i];
                } else if (this.bboxes.gt && this.bboxes.gt[i] !== undefined) {
                    labelId = this.bboxes.gt[i];
                    console.log(`BBoxEditorUI: Using gt[${i}] (${labelId}) for label display`);
                } else {
                    labelId = 0; // Default fallback
                }

                // Prepare label text
                const labelName = this.editor.classLabels[labelId] || labelId;
                const labelText = `${labelId} - ${labelName}`; // Simplified format

                // Save current context state
                ctx.save();

                // Text properties
                const fontSize = 16;
                const padding = 6;
                ctx.font = `bold ${fontSize}px Arial, sans-serif`;

                // Calculate text metrics for background
                const textMetrics = ctx.measureText(labelText);
                const textWidth = textMetrics.width;

                // Background for better visibility
                ctx.fillStyle = isSelected ? 'rgba(33, 150, 243, 0.85)' : 'rgba(231, 76, 60, 0.85)';

                // Create rounded rectangle path
                const cornerRadius = 4;
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

                // Add a subtle border
                ctx.strokeStyle = isSelected ? '#1565C0' : '#c0392b';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Draw text with shadow for depth
                ctx.fillStyle = 'white';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                ctx.fillText(labelText, labelX, labelY);

                // Restore context
                ctx.restore();
            }
        });

        // Draw temporary box if needed
        if (showTempBox && this.tempBox) {
            ctx.strokeStyle = '#00FF00'; // Green for new boxes
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
            if (this.bboxes.scores[i] >= this.threshold) {
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

                // Update UI
                this.updateBoxValues(this.bboxes.boxes[clickedBoxIndex]);

                // Update class selector
                const classSelector = document.getElementById('bbox-class-selector');
                const searchInput = document.getElementById('class-search-input');

                // Try labels first, then gt
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

                    // Update search input too
                    if (searchInput) {
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
                    bboxSelector.value = clickedBoxIndex;
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

            // If we didn't click on any existing box border or corner, start drawing a new box
            const imgCoords = toImageCoords(x, y);
            newBoxStart = { x: imgCoords.x, y: imgCoords.y };
            this.isDrawingNew = true;
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

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

                // Update the crowd checkbox
                this.updateCrowdCheckbox(this.selectedIndex);

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

                box[0] = newX1;
                box[1] = newY1;
                box[2] = newX1 + width;
                box[3] = newY1 + height;

                // Update start position for next move
                startX = x;
                startY = y;

                // Update the crowd checkbox
                this.updateCrowdCheckbox(this.selectedIndex);

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
                    // Changed to move cursor for borders
                    canvas.style.cursor = 'move';
                } else {
                    canvas.style.cursor = 'crosshair'; // Crosshair for drawing new boxes
                }
            } else {
                canvas.style.cursor = 'crosshair'; // Crosshair for drawing new boxes
            }
        });

        canvas.addEventListener('mouseup', (e) => {
            // If we were drawing a new box, finalize it
            if (this.isDrawingNew && this.tempBox) {
                const width = this.tempBox[2] - this.tempBox[0];
                const height = this.tempBox[3] - this.tempBox[1];

                // Only create the box if it has some minimum size
                if (width > 5 && height > 5) {
                    // Add the new box with a default score
                    this.bboxes.boxes.push([...this.tempBox]);
                    this.bboxes.scores.push(100); // 100% confidence for user-drawn boxes

                    // Get default class ID using our helper function
                    let classId = 0;

                    // Use the global helper function if available, which handles ground truth and radio selection
                    if (typeof window.getClassForNewBBox === 'function') {
                        classId = window.getClassForNewBBox();
                        console.log(`Advanced editor: Using getClassForNewBBox helper, got class: ${classId}`);
                    } else {
                        // Fallback to using ground truth directly or class selector
                        // First check for ground truth data element
                        const gtDataElement = document.getElementById('ground-truth-data');
                        if (gtDataElement && gtDataElement.textContent) {
                            try {
                                const gtClassId = parseInt(gtDataElement.textContent.trim());
                                if (!isNaN(gtClassId)) {
                                    classId = gtClassId;
                                    console.log(`Advanced editor: Using ground truth class ID from data element: ${classId}`);
                                }
                            } catch (e) {
                                console.error('Error parsing ground truth class ID:', e);
                            }
                        }
                        // Then check for global groundTruthClassId
                        else if (window.groundTruthClassId !== undefined && window.groundTruthClassId !== null) {
                            classId = parseInt(window.groundTruthClassId);
                            console.log(`Advanced editor: Using global groundTruthClassId: ${classId}`);
                        }
                        // Then try the global lastSelectedClassId
                        else if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
                            classId = parseInt(window.lastSelectedClassId);
                            console.log(`Advanced editor: Using global lastSelectedClassId: ${classId}`);
                        }
                        // Finally try the class selector
                        else {
                            const classSelector = document.getElementById('bbox-class-selector');
                            if (classSelector) {
                                classId = parseInt(classSelector.value) || 0;
                                console.log(`Advanced editor: Using class selector value: ${classId}`);
                            }
                        }
                    }

                    // Add label
                    if (!this.bboxes.labels) {
                        this.bboxes.labels = Array(this.bboxes.boxes.length - 1).fill(0);
                    }
                    this.bboxes.labels.push(classId);

                    // Also update gt array if it exists
                    if (this.bboxes.gt) {
                        this.bboxes.gt.push(classId);
                        console.log(`Advanced editor: Added new box to gt array with class ${classId}`);
                    }

                    // Select the new box
                    this.selectedIndex = this.bboxes.boxes.length - 1;
                    this.currentBoxIndex = this.selectedIndex;

                    if (this.editor) {
                        this.editor.selectedBboxIndex = this.selectedIndex;
                    }

                    // Add the new box's crowd flag
                    this.bboxes.crowd_flags.push(false);
                    this.updateCrowdCheckbox(this.selectedIndex);

                    // Update UI
                    this.updateBoxValues(this.tempBox);

                    // Update bbox selector dropdown
                    this.updateBboxSelector(this.bboxes, this.selectedIndex, this.threshold, this.editor ? this.editor.classLabels : {});

                    // Update class selector
                    const classSelector = document.getElementById('bbox-class-selector');
                    if (classSelector) {
                        classSelector.value = classId.toString();

                        // Update search input too
                        const searchInput = document.getElementById('class-search-input');
                        if (searchInput) {
                            if (this.editor && this.editor.classLabels && this.editor.classLabels[classId]) {
                                searchInput.value = `${classId} - ${this.editor.classLabels[classId]}`;
                            } else {
                                searchInput.value = `Class ${classId}`;
                            }
                        }
                    }

                    // Update the editor's canvas
                    if (this.editor) {
                        this.editor.redrawCanvas();
                    }

                    // Reset radio selection if one was used
                    if (window.lastSelectedClassId !== null && typeof window.resetRadioSelection === 'function') {
                        window.resetRadioSelection();
                        console.log('Advanced editor: Radio button selection reset after drawing box');
                    }
                }

                delete this.tempBox;
            }

            if ((isDragging || isResizing) && this.editor) {
                this.editor.redrawCanvas(); // Update the main canvas too
            }

            isDragging = false;
            isResizing = false;
            this.isDrawingNew = false;
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
    static saveBboxes(bboxes, threshold) {
        // Get the current image name
        const imageNameInput = document.querySelector('input[name="image_name"]');
        const imageName = imageNameInput ? imageNameInput.value : 'unknown';

        // Get the username from the URL
        const pathParts = window.location.pathname.split('/');
        const username = pathParts[1]; // Assuming URL structure is /<username>/label

        // Format the data as required: only including bboxes above threshold
        let bboxDataArray = [];
        bboxes.boxes.forEach((box, i) => {
            // Only include boxes above threshold
            if (bboxes.scores[i] >= threshold) {
                // Check labels first, then gt, then default to 0
                let label = 0;
                if (bboxes.labels && bboxes.labels[i] !== undefined) {
                    label = bboxes.labels[i];
                } else if (bboxes.gt && bboxes.gt[i] !== undefined) {
                    label = bboxes.gt[i];
                    console.log(`BBoxEditorUI: Using gt[${i}] (${label}) for saved data`);
                }

                bboxDataArray.push({
                    coordinates: box,
                    label: label,
                    crowd_flag: this.bboxes.crowd_flags && this.bboxes.crowd_flags[i]
                });
            }
        });

        // Create the object for the request
        const saveData = {
            image_name: imageName,
            bboxes: bboxDataArray
        };

        // Make AJAX call to save the bboxes
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
            console.log('Bboxes saved successfully:', data);
        })
        .catch(error => {
            console.error('Error saving bboxes:', error);
        });
    }
}

// Export the module for use in other scripts
window.BBoxEditorUI = BBoxEditorUI;

console.log('BBox Editor UI loaded with ground truth class support and radio button integration');