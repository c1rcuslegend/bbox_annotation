/**
 * Patch for BBoxEditor and BBoxEditorUI to support auto-class selection
 * with gt field support
 */
document.addEventListener('DOMContentLoaded', function() {
    // Debug mode
    const DEBUG = true;

    function debug(message) {
        if (DEBUG) console.log(`[BBox Patch] ${message}`);
    }

    debug("Initializing BBox editor patches with gt field support");

    // Patch BBoxEditor's handleCanvasClick to not auto-select boxes
    BBoxEditor.prototype.handleCanvasClick = function(event) {
        debug("Patched handleCanvasClick called");

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const actualX = x * scaleX;
        const actualY = y * scaleY;

        // PATCH: Don't auto-select any box, only check for border clicks
        // PATCH: Don't select first box if no box was clicked
        this.selectedBboxIndex = this.findBoxByBorderOnly(actualX, actualY);

        // Store original state before showing editor
        this.originalBboxes = JSON.parse(JSON.stringify(this.bboxes));

        // PATCH: Don't require a valid box to open the editor
        // Just open the editor without any box selected
        this.showBboxEditor(null, -1);
        this.redrawCanvas();

        event.stopPropagation();
    };

    // Patch BBoxEditorUI's setupPreviewCanvasEvents to apply last selected class
    const originalSetupPreviewCanvasEvents = BBoxEditorUI.setupPreviewCanvasEvents;
    if (originalSetupPreviewCanvasEvents) {
        BBoxEditorUI.setupPreviewCanvasEvents = function(canvas) {
            // Call original implementation
            originalSetupPreviewCanvasEvents.call(this, canvas);

            // Add our enhanced click handler to apply class when a box is clicked
            const enhancedClickHandler = function(e) {
                // Get coordinates
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // Check if we clicked on a box border
                const clickedBoxIndex = BBoxEditorUI.findBoxByBorderOnly(x, y, 8);

                if (clickedBoxIndex !== -1) {
                    debug(`Box ${clickedBoxIndex} clicked in preview canvas`);

                    // Apply the last selected class if available
                    if (window.lastSelectedClassId !== null) {
                        debug(`Applying class ${window.lastSelectedClassId} to box ${clickedBoxIndex}`);

                        // Update the class in the bboxes object
                        if (!BBoxEditorUI.bboxes.labels) {
                            BBoxEditorUI.bboxes.labels = Array(BBoxEditorUI.bboxes.boxes.length).fill(0);
                        }

                        // Set the new class ID
                        const newClassId = parseInt(window.lastSelectedClassId);
                        BBoxEditorUI.bboxes.labels[clickedBoxIndex] = newClassId;

                        // Also update gt field if it exists
                        if (BBoxEditorUI.bboxes.gt && clickedBoxIndex < BBoxEditorUI.bboxes.gt.length) {
                            BBoxEditorUI.bboxes.gt[clickedBoxIndex] = newClassId;
                            debug(`Updated gt[${clickedBoxIndex}] to class ${newClassId}`);
                        }

                        // Update the class selector UI
                        const classSelector = document.getElementById('bbox-class-selector');
                        const searchInput = document.getElementById('class-search-input');

                        if (classSelector) {
                            classSelector.value = window.lastSelectedClassId;
                            classSelector.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        if (searchInput) {
                            const classLabels = BBoxEditorUI.editor ? BBoxEditorUI.editor.classLabels : {};
                            if (classLabels && classLabels[window.lastSelectedClassId]) {
                                searchInput.value = `${window.lastSelectedClassId} - ${classLabels[window.lastSelectedClassId]}`;
                            } else {
                                searchInput.value = `Class ${window.lastSelectedClassId}`;
                            }
                            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        // Clear the last selected class
                        window.lastSelectedClassId = null;

                        // Redraw the canvas
                        BBoxEditorUI.updatePreviewCanvas();

                        // Also update the main editor if available
                        if (BBoxEditorUI.editor) {
                            BBoxEditorUI.editor.redrawCanvas();
                        }
                    }
                }
            };

            // Add our click handler
            canvas.addEventListener('click', enhancedClickHandler);

            debug("Enhanced preview canvas click handler installed with gt field support");
        };
    } else {
        debug("Warning: Could not find BBoxEditorUI.setupPreviewCanvasEvents to patch");
    }

    // Patch findBoxByBorderOnly function if it doesn't exist
    if (!BBoxEditorUI.findBoxByBorderOnly) {
        debug("Adding missing findBoxByBorderOnly method to BBoxEditorUI");
        BBoxEditorUI.findBoxByBorderOnly = function(x, y, borderWidth = 5) {
            // Only detect clicks on borders, not inside the box
            if (!this.bboxes || !this.bboxes.boxes) return -1;

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
        };
    }

    debug("BBox editor patches applied with gt field support");
});