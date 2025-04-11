/**
 * Bounding Box Editor
 * Manages the creation, editing, and visualization of bounding boxes
 * With support for gt field as class labels
 */
class BBoxEditor {
    constructor(config) {
        this.bboxes = config.bboxes || { boxes: [], scores: [], labels: [] };

        // Check for gt field and use it as labels if present
        if (this.bboxes.gt && !this.bboxes.labels) {
            console.log("BBoxEditor: Using 'gt' field as labels");
            this.bboxes.labels = this.bboxes.gt;
        }

        this.img = config.img;
        this.canvas = config.canvas || document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.selectedBboxIndex = -1;
        this.originalBboxes = JSON.parse(JSON.stringify(this.bboxes)); // Deep copy for reverting changes
        this.classLabels = config.classLabels || {};

        this.setupCanvas();
        // Make the editor globally accessible for inline editor to connect to
        window.bboxEditor = this;
    }

    setupCanvas() {
        if (this.img.complete) {
            this.onImageLoad();
        } else {
            this.img.onload = () => this.onImageLoad();
        }
    }

    onImageLoad() {
        this.canvas.width = this.img.naturalWidth;
        this.canvas.height = this.img.naturalHeight;
        this.canvas.style.cursor = 'crosshair'; // Change to crosshair for drawing
        this.canvas.className = 'thumbnail-main';
        this.redrawCanvas();
        this.img.parentNode.insertBefore(this.canvas, this.img);
        this.img.style.display = 'none';
    }

    // Modify the redrawCanvas method in BBoxEditor class
    redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.img, 0, 0);

        // Make sure crowd_flags exists before drawing
        if (this.bboxes && this.bboxes.boxes && !this.bboxes.crowd_flags) {
            console.log("BBoxEditor: Initializing missing crowd_flags array");
            this.bboxes.crowd_flags = new Array(this.bboxes.boxes.length).fill(false);
        }

        // First draw non-selected boxes
        this.bboxes.boxes.forEach((box, index) => {
            // Skip the selected box - we'll draw it last for better z-ordering
            if (index === this.selectedBboxIndex) return;

            // Check if this is an uncertain box - by flag or by label value of -1
            const isUncertain = (this.bboxes.uncertain_flags && this.bboxes.uncertain_flags[index]) ||
                               (this.bboxes.labels && this.bboxes.labels[index] === -1);

            // Check if this is a crowd box
            const isCrowd = this.bboxes.crowd_flags && this.bboxes.crowd_flags[index];

            // Set color based on box type
            if (isCrowd) {
                this.ctx.strokeStyle = '#9C27B0'; // Purple for crowd boxes
            } else if (isUncertain) {
                this.ctx.strokeStyle = '#FFCC00'; // Yellow for uncertain
            } else {
                this.ctx.strokeStyle = '#e74c3c'; // Red for normal
            }

            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

            // Check if box is at top edge
            const isAtTopEdge = box[1] <= 5; // within 5px of top edge

            // Position label inside the box if it's at top edge
            const labelX = box[0] + 5; // Add small padding from left edge
            const labelY = isAtTopEdge ? box[1] + 20 : box[1] - 5; // Move label inside box if at top edge

            // Prepare label text based on whether it's uncertain or regular
            let labelText;

            if (isUncertain) {
                labelText = "Not Sure";
            } else {
                // Get label ID with fallback to gt field if needed
                let labelId;
                if (this.bboxes.labels && this.bboxes.labels[index] !== undefined) {
                    labelId = this.bboxes.labels[index];
                } else if (this.bboxes.gt && this.bboxes.gt[index] !== undefined) {
                    labelId = this.bboxes.gt[index];
                } else {
                    labelId = 0; // Default fallback
                }

                // Prepare label text
                const labelName = this.classLabels[labelId] || `Class ${labelId}`;
                labelText = `${labelId} - ${labelName}`;
            }

            // Save current context state
            this.ctx.save();

            // Text properties
            const fontSize = 14;
            const padding = 4;
            this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            const textMetrics = this.ctx.measureText(labelText);
            const textWidth = textMetrics.width;

            // Background for better visibility - different colors for different types
            if (isCrowd) {
                this.ctx.fillStyle = 'rgba(156, 39, 176, 0.85)'; // Purple for crowd
            } else if (isUncertain) {
                this.ctx.fillStyle = 'rgba(255, 204, 0, 0.85)'; // Yellow for uncertain
            } else {
                this.ctx.fillStyle = 'rgba(231, 76, 60, 0.85)'; // Red for normal
            }

            // Draw rounded rectangle background
            const cornerRadius = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
            this.ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
            this.ctx.arcTo(labelX + textWidth + padding, labelY - fontSize - padding, labelX + textWidth + padding, labelY - fontSize - padding + cornerRadius, cornerRadius);
            this.ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
            this.ctx.arcTo(labelX + textWidth + padding, labelY + padding, labelX + textWidth + padding - cornerRadius, labelY + padding, cornerRadius);
            this.ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
            this.ctx.arcTo(labelX - padding, labelY + padding, labelX - padding, labelY + padding - cornerRadius, cornerRadius);
            this.ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
            this.ctx.arcTo(labelX - padding, labelY - fontSize - padding, labelX - padding + cornerRadius, labelY - fontSize - padding, cornerRadius);
            this.ctx.closePath();
            this.ctx.fill();

            // Add a subtle border with different color based on box type
            if (isCrowd) {
                this.ctx.strokeStyle = '#7B1FA2'; // Dark purple for crowd
                this.ctx.fillStyle = 'white'; // White text on purple background
            } else if (isUncertain) {
                this.ctx.strokeStyle = '#D4A700'; // Dark gold for uncertain
                this.ctx.fillStyle = 'black'; // Black text on yellow background
            } else {
                this.ctx.strokeStyle = '#c0392b'; // Dark red for normal
                this.ctx.fillStyle = 'white'; // White text on red background
            }

            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Draw text with shadow for depth
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;
            this.ctx.fillText(labelText, labelX, labelY);

            // Restore context
            this.ctx.restore();
        });

        // Draw the selected box last (if any) so it appears on top
        if (this.selectedBboxIndex >= 0 && this.selectedBboxIndex < this.bboxes.boxes.length) {
            const box = this.bboxes.boxes[this.selectedBboxIndex];

            // Check if this is an uncertain box - by flag or by label value of -1
            const isUncertain = (this.bboxes.uncertain_flags && this.bboxes.uncertain_flags[this.selectedBboxIndex]) ||
                               (this.bboxes.labels && this.bboxes.labels[this.selectedBboxIndex] === -1);

            // Check if this is a crowd box
            const isCrowd = this.bboxes.crowd_flags && this.bboxes.crowd_flags[this.selectedBboxIndex];

            // Set color based on box type (with highlight for selection)
            if (isCrowd) {
                this.ctx.strokeStyle = '#6A1B9A'; // Darker purple for selected crowd box
            } else if (isUncertain) {
                this.ctx.strokeStyle = '#B8860B'; // DarkGoldenRod for selected uncertain
            } else {
                this.ctx.strokeStyle = '#2196F3'; // Blue for normal selected
            }

            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

            // Check if box is at top edge
            const isAtTopEdge = box[1] <= 5;

            // Position label
            const labelX = box[0] + 5;
            const labelY = isAtTopEdge ? box[1] + 20 : box[1] - 5;

            // Prepare label text based on whether it's uncertain or regular
            let labelText;

            if (isUncertain) {
                labelText = "Not Sure";
            } else {
                // Get label ID with fallback
                let labelId;
                if (this.bboxes.labels && this.bboxes.labels[this.selectedBboxIndex] !== undefined) {
                    labelId = this.bboxes.labels[this.selectedBboxIndex];
                } else if (this.bboxes.gt && this.bboxes.gt[this.selectedBboxIndex] !== undefined) {
                    labelId = this.bboxes.gt[this.selectedBboxIndex];
                } else {
                    labelId = 0;
                }

                const labelName = this.classLabels[labelId] || `Class ${labelId}`;
                labelText = `${labelId} - ${labelName}`;
            }

            // Save context
            this.ctx.save();

            // Text properties
            const fontSize = 14;
            const padding = 4;
            this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            const textWidth = this.ctx.measureText(labelText).width;

            // Background with different colors for different types
            if (isCrowd) {
                this.ctx.fillStyle = 'rgba(106, 27, 154, 0.85)'; // Dark purple for selected crowd
            } else if (isUncertain) {
                this.ctx.fillStyle = 'rgba(184, 134, 11, 0.85)'; // DarkGoldenRod for selected uncertain
            } else {
                this.ctx.fillStyle = 'rgba(33, 150, 243, 0.85)'; // Blue for normal selected
            }

            // Draw rounded rectangle background
            const cornerRadius = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
            this.ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
            this.ctx.arcTo(labelX + textWidth + padding, labelY - fontSize - padding, labelX + textWidth + padding, labelY - fontSize - padding + cornerRadius, cornerRadius);
            this.ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
            this.ctx.arcTo(labelX + textWidth + padding, labelY + padding, labelX + textWidth + padding - cornerRadius, labelY + padding, cornerRadius);
            this.ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
            this.ctx.arcTo(labelX - padding, labelY + padding, labelX - padding, labelY + padding - cornerRadius, cornerRadius);
            this.ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
            this.ctx.arcTo(labelX - padding, labelY - fontSize - padding, labelX - padding + cornerRadius, labelY - fontSize - padding, cornerRadius);
            this.ctx.closePath();
            this.ctx.fill();

            // Add subtle border
            if (isCrowd) {
                this.ctx.strokeStyle = '#4A148C'; // Very dark purple for selected crowd
                this.ctx.fillStyle = 'white'; // White text
            } else if (isUncertain) {
                this.ctx.strokeStyle = '#8B6914'; // Even darker gold for uncertain
                this.ctx.fillStyle = 'white'; // White text on dark gold
            } else {
                this.ctx.strokeStyle = '#1565C0'; // Dark blue for selected normal
                this.ctx.fillStyle = 'white'; // White text on blue background
            }

            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Draw text
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;
            this.ctx.fillText(labelText, labelX, labelY);

            // Restore context
            this.ctx.restore();
        }
    }

// Force a complete redraw of the canvas with the same Not Sure box handling
forceRedraw() {
    // Just call redrawCanvas to avoid duplicating all the logic
    this.redrawCanvas();
}

// Add an initialize method to handle Not Sure boxes on load
// Call this after the constructor
initializeNotSureBoxes() {
    // Check for -1 labels and ensure they're properly marked as uncertain
    if (this.bboxes && this.bboxes.labels && this.bboxes.labels.length > 0) {
        // Ensure uncertain_flags array exists
        if (!this.bboxes.uncertain_flags) {
            this.bboxes.uncertain_flags = new Array(this.bboxes.boxes.length).fill(false);
        }

        // Set uncertain_flags for any box with label -1
        for (let i = 0; i < this.bboxes.labels.length; i++) {
            if (this.bboxes.labels[i] === -1) {
                this.bboxes.uncertain_flags[i] = true;
                console.log(`Box ${i} has label -1, marked as uncertain`);

                // Ensure possible_labels array exists
                if (!this.bboxes.possible_labels) {
                    this.bboxes.possible_labels = new Array(this.bboxes.boxes.length).fill([]);
                }

                // Add default empty array for possible_labels if needed
                if (i >= this.bboxes.possible_labels.length || !this.bboxes.possible_labels[i]) {
                    if (this.bboxes.possible_labels.length <= i) {
                        // Extend the array if needed
                        while (this.bboxes.possible_labels.length <= i) {
                            this.bboxes.possible_labels.push([]);
                        }
                    } else {
                        this.bboxes.possible_labels[i] = [];
                    }
                }
            }
        }
    }
}

    // Force a complete redraw of the canvas
    forceRedraw() {
        // Clear everything
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Start fresh with the base image
        this.ctx.drawImage(this.img, 0, 0);

        // Draw only the boxes that still exist and meet the threshold
        if (this.bboxes && this.bboxes.boxes) {
            this.bboxes.boxes.forEach((box, index) => {
                // Use different color for selected box
                this.ctx.strokeStyle = this.selectedBboxIndex === index ? '#2196F3' : '#e74c3c';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

                // Show label info for each box with enhanced readability
                const isSelected = this.selectedBboxIndex === index;

                // Check if box is at top edge or is a whole-image box
                const isAtTopEdge = box[1] <= 5; // within 5px of top edge
                const isWholeImage = box[0] <= 5 && box[1] <= 5 &&
                                     Math.abs(box[2] - this.canvas.width) <= 5 &&
                                     Math.abs(box[3] - this.canvas.height) <= 5;

                // Position label inside the box if it's at top edge
                const labelX = box[0] + 5; // Add small padding from left edge
                const labelY = isAtTopEdge ? box[1] + 20 : box[1] - 5; // Move label inside box if at top edge


                // Get label ID with fallback to gt field if needed
                let labelId;
                if (this.bboxes.labels && this.bboxes.labels[index] !== undefined) {
                    labelId = this.bboxes.labels[index];
                } else if (this.bboxes.gt && this.bboxes.gt[index] !== undefined) {
                    labelId = this.bboxes.gt[index];
                    console.log(`BBoxEditor: Using gt[${index}] (${labelId}) for display`);
                } else {
                    labelId = 0; // Default fallback
                }

                // Prepare label text
                const labelName = this.classLabels[labelId] || labelId;
                const labelText = `${labelId} - ${labelName}`; // Simplified format

                // Save current context state
                this.ctx.save();

                // Text properties
                const fontSize = 14;
                const padding = 4;
                this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                const textMetrics = this.ctx.measureText(labelText);
                const textWidth = textMetrics.width;

                // Background for better visibility
                this.ctx.fillStyle = isSelected ? 'rgba(33, 150, 243, 0.85)' : 'rgba(231, 76, 60, 0.85)';

                // Draw rounded rectangle background
                const cornerRadius = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
                this.ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
                this.ctx.arcTo(labelX + textWidth + padding, labelY - fontSize - padding, labelX + textWidth + padding, labelY - fontSize - padding + cornerRadius, cornerRadius);
                this.ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
                this.ctx.arcTo(labelX + textWidth + padding, labelY + padding, labelX + textWidth + padding - cornerRadius, labelY + padding, cornerRadius);
                this.ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
                this.ctx.arcTo(labelX - padding, labelY + padding, labelX - padding, labelY + padding - cornerRadius, cornerRadius);
                this.ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
                this.ctx.arcTo(labelX - padding, labelY - fontSize - padding, labelX - padding + cornerRadius, labelY - fontSize - padding, cornerRadius);
                this.ctx.closePath();
                this.ctx.fill();

                // Add a subtle border
                this.ctx.strokeStyle = isSelected ? '#1565C0' : '#c0392b';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                // Draw text with shadow for depth
                this.ctx.fillStyle = 'white';
                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                this.ctx.shadowBlur = 2;
                this.ctx.shadowOffsetX = 1;
                this.ctx.shadowOffsetY = 1;
                this.ctx.fillText(labelText, labelX, labelY);

                // Restore context
                this.ctx.restore();
            });
        }
    }

    // Add method to find box by border only (for consistent border-only selection)
    findBoxByBorderOnly(x, y, borderWidth = 5) {
        // Only detect clicks on borders, not inside the box
        for (let i = this.bboxes.boxes.length - 1; i >= 0; i--) {

            const box = this.bboxes.boxes[i];

            // Check left border
            if (Math.abs(x - box[0]) <= borderWidth && y >= box[1] && y <= box[3]) {
                return i;
            }

            // Check right border
            if (Math.abs(x - box[2]) <= borderWidth && y >= box[1] && y <= box[3]) {
                return i;
            }

            // Check top border
            if (Math.abs(y - box[1]) <= borderWidth && x >= box[0] && x <= box[2]) {
                return i;
            }

            // Check bottom border
            if (Math.abs(y - box[3]) <= borderWidth && x >= box[0] && x <= box[2]) {
                return i;
            }
        }

        return -1;
    }

    // Add method to show the editor (placeholder for patching in class auto-selection)
    showBboxEditor(box, boxIndex) {
        // This is a placeholder method that will be extended by patching
        // It will be used to open the modal editor with the selected box
        if (typeof BBoxEditorUI !== 'undefined') {
            BBoxEditorUI.openModal(box, boxIndex, this.bboxes, this);
        }
    }

    // Add method to handle canvas clicks (placeholder for patching)
    handleCanvasClick(event) {
        // This is a placeholder method that will be extended by patching
        // Default implementation would select a box and open the editor
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const actualX = x * scaleX;
        const actualY = y * scaleY;

        // Select a box by border click
        this.selectedBboxIndex = this.findBoxByBorderOnly(actualX, actualY);

        // Store original state before showing editor
        this.originalBboxes = JSON.parse(JSON.stringify(this.bboxes));

        // Show the editor with the selected box
        if (this.selectedBboxIndex >= 0) {
            const selectedBox = this.bboxes.boxes[this.selectedBboxIndex];
            this.showBboxEditor(selectedBox, this.selectedBboxIndex);
        } else {
            this.showBboxEditor(null, -1);
        }

        this.redrawCanvas();

        event.stopPropagation();
    }
}