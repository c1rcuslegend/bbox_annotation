/**
 * Patch for BBoxEditor and BBoxEditorUI to support auto-class selection
 */
document.addEventListener('DOMContentLoaded', function() {
    // Debug mode
    const DEBUG = true;

    function debug(message) {
        if (DEBUG) console.log(`[BBox Patch] ${message}`);
    }

    debug("Initializing BBox editor patches");

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

                        BBoxEditorUI.bboxes.labels[clickedBoxIndex] = window.lastSelectedClassId;

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
                    }
                }
            };

            // Add our click handler
            canvas.addEventListener('click', enhancedClickHandler);

            debug("Enhanced preview canvas click handler installed");
        };
    } else {
        debug("Warning: Could not find BBoxEditorUI.setupPreviewCanvasEvents to patch");
    }

    debug("BBox editor patches applied");
});