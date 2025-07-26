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
        this.showClassNumbersOnly = false; 

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

        // Ensure crowd_flags and reflected_flags arrays exist
        if (this.bboxes?.boxes && !this.bboxes.crowd_flags) {
            console.log("BBoxEditor: Initializing missing crowd_flags array");
            this.bboxes.crowd_flags = new Array(this.bboxes.boxes.length).fill(false);
        }
        if (this.bboxes?.boxes && !this.bboxes.reflected_flags) {
            console.log("BBoxEditor: Initializing missing reflected_flags array");
            this.bboxes.reflected_flags = new Array(this.bboxes.boxes.length).fill(false);
        }
        if (this.bboxes?.boxes && !this.bboxes.rendition_flags) {
            console.log("BBoxEditor: Initializing missing rendition_flags array");
            this.bboxes.rendition_flags = new Array(this.bboxes.boxes.length).fill(false);
        }

        const getBoxStyle = (isCrowd, isReflected, isRendition, isUncertain, isSelected) => {
            const styles = {
                normal: { stroke: "#e74c3c", fill: "rgba(231, 76, 60, 0.85)", text: "white" },
                uncertain: { stroke: "#FFCC00", fill: "rgba(255, 204, 0, 0.85)", text: "black" },
                crowd: { stroke: "#9C27B0", fill: "rgba(156, 39, 176, 0.85)", text: "white" },
                reflected: { stroke: "#20B2AA", fill: "rgba(32, 178, 170, 0.85)", text: "white" },
                rendition: { stroke: "#FF7043", fill: "rgba(255, 112, 67, 0.85)", text: "white" },
                crowdReflected: { stroke: "#5E6DAD", fill: "rgba(94, 109, 173, 0.85)", text: "white" },
                crowdRendition: { stroke: "#B39DDB", fill: "rgba(179, 157, 219, 0.85)", text: "white" },
                reflectedRendition: { stroke: "#FF8A65", fill: "rgba(255, 138, 101, 0.85)", text: "white" },
                crowdReflectedRendition: { stroke: "#81C784", fill: "rgba(129, 199, 132, 0.85)", text: "white" },
                selected: { stroke: "#2196F3", fill: "rgba(33, 150, 243, 0.85)", text: "white" },
            };

            // Check for three-flag combination first
            if (isCrowd && isReflected && isRendition) return styles.crowdReflectedRendition;
            // Then two-flag combinations
            if (isCrowd && isReflected) return styles.crowdReflected;
            if (isCrowd && isRendition) return styles.crowdRendition;
            if (isReflected && isRendition) return styles.reflectedRendition;
            // Then single flags
            if (isRendition) return styles.rendition;
            if (isReflected) return styles.reflected;
            if (isCrowd) return styles.crowd;
            if (isUncertain) return styles.uncertain;
            if (isSelected) return styles.selected;
            return styles.normal;
        };

        const drawBox = (box, style, labelText, isAtTopEdge) => {
            // Draw box
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

            // Position label
            const padding = 3;
            const fontSize = 12; 
            const labelX = box[0] + 3; // Slightly reduced offset
            const labelY = isAtTopEdge ? box[1] + 16 : box[1] - 3; // Adjusted for smaller font

            // Draw label background
            this.ctx.save();
            this.ctx.font = `bold ${fontSize}px Arial, sans-serif`; // Set font BEFORE measuring
            const textWidth = this.ctx.measureText(labelText).width; // Measure AFTER setting font
            this.ctx.fillStyle = style.fill;
            this.ctx.strokeStyle = style.stroke;

            const cornerRadius = 2; // Smaller radius for smaller font
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
            this.ctx.stroke();

            // Draw label text
            this.ctx.fillStyle = style.text;
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; // Slightly reduced shadow opacity
            this.ctx.shadowBlur = 1; // Reduced shadow blur for smaller text
            this.ctx.shadowOffsetX = 0.5; // Smaller shadow offset
            this.ctx.shadowOffsetY = 0.5;
            this.ctx.fillText(labelText, labelX, labelY);
            this.ctx.restore();
        };

        // Draw all boxes
        this.bboxes.boxes.forEach((box, index) => {
            const isUncertain = this.bboxes.uncertain_flags?.[index] || this.bboxes.labels?.[index] === -1;
            const isCrowd = this.bboxes.crowd_flags?.[index];
            const isReflected = this.bboxes.reflected_flags?.[index];
            const isRendition = this.bboxes.rendition_flags?.[index];
            const isSelected = index === this.selectedBboxIndex;

            // Skip selected box for now
            if (isSelected) return;

            const style = getBoxStyle(isCrowd, isReflected, isRendition, isUncertain, false);
            const labelId = this.bboxes.labels?.[index] ?? this.bboxes.gt?.[index] ?? 0;
            const labelName = this.classLabels[labelId] || `Class ${labelId}`;
            
            let labelText;
            if (isUncertain) {
                labelText = "Not Sure";
            } else if (this.showClassNumbersOnly) {
                labelText = `${labelId}`;
            } else {
                labelText = `${labelId} - ${labelName}`;
            }
            
            // Limit label text to 30 characters
            if (labelText.length > 30) {
                labelText = labelText.substring(0, 27) + '...';
            }
            
            const isAtTopEdge = box[1] <= 5;  // within 5px of top edge

            drawBox(box, style, labelText, isAtTopEdge);
        });

        // Draw the selected box (if any) last
        if (this.selectedBboxIndex >= 0 && this.selectedBboxIndex < this.bboxes.boxes.length) {
            const box = this.bboxes.boxes[this.selectedBboxIndex];
            const isUncertain = this.bboxes.uncertain_flags?.[this.selectedBboxIndex] || this.bboxes.labels?.[this.selectedBboxIndex] === -1;
            const isCrowd = this.bboxes.crowd_flags?.[this.selectedBboxIndex];
            const isReflected = this.bboxes.reflected_flags?.[this.selectedBboxIndex];
            const isRendition = this.bboxes.rendition_flags?.[this.selectedBboxIndex];

            const style = getBoxStyle(isCrowd, isReflected, isRendition, isUncertain, true);
            const labelId = this.bboxes.labels?.[this.selectedBboxIndex] ?? this.bboxes.gt?.[this.selectedBboxIndex] ?? 0;
            const labelName = this.classLabels[labelId] || `Class ${labelId}`;
            
            let labelText;
            if (isUncertain) {
                labelText = "Not Sure";
            } else if (this.showClassNumbersOnly) {
                labelText = `${labelId}`;
            } else {
                labelText = `${labelId} - ${labelName}`;
            }
            
            // Limit label text to 30 characters
            if (labelText.length > 30) {
                labelText = labelText.substring(0, 27) + '...';
            }
            
            const isAtTopEdge = box[1] <= 5;

            drawBox(box, style, labelText, isAtTopEdge);
        }
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
                const labelX = box[0] + 3; // Slightly reduced offset
                const labelY = isAtTopEdge ? box[1] + 16 : box[1] - 3; // Adjusted for smaller font


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
                const labelName = this.classLabels[labelId] || `Class ${labelId}`;
                let labelText;
                if (this.showClassNumbersOnly) {
                    labelText = `${labelId}`;
                } else {
                    labelText = `${labelId} - ${labelName}`;
                }
                
                // Limit label text to 30 characters
                if (labelText.length > 30) {
                    labelText = labelText.substring(0, 27) + '...';
                }

                // Save current context state
                this.ctx.save();

                // Text properties
                const fontSize = 12; 
                const padding = 3;
                this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
                const textMetrics = this.ctx.measureText(labelText);
                const textWidth = textMetrics.width;

                // Background for better visibility
                this.ctx.fillStyle = isSelected ? 'rgba(33, 150, 243, 0.85)' : 'rgba(231, 76, 60, 0.85)';

                // Draw rounded rectangle background
                const cornerRadius = 2; // Smaller radius for smaller font
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
                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; // Slightly reduced shadow opacity
                this.ctx.shadowBlur = 1; // Reduced shadow blur for smaller text
                this.ctx.shadowOffsetX = 0.5; // Smaller shadow offset
                this.ctx.shadowOffsetY = 0.5;
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

    // Method to toggle class numbers only display
    setShowClassNumbersOnly(enabled) {
        this.showClassNumbersOnly = enabled;
        this.redrawCanvas();
    }

    // Method to get current display mode
    getShowClassNumbersOnly() {
        return this.showClassNumbersOnly;
    }
}