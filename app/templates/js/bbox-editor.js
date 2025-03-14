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

        this.threshold = config.threshold || 0.5;
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

        this.bboxes.boxes.forEach((box, index) => {
            if (this.bboxes.scores[index] >= this.threshold) {
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
            }
        });
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
                if (this.bboxes.scores[index] >= this.threshold) {
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
                }
            });
        }
    }

    // Add method to find box by border only (for consistent border-only selection)
    findBoxByBorderOnly(x, y, borderWidth = 5) {
        // Only detect clicks on borders, not inside the box
        for (let i = this.bboxes.boxes.length - 1; i >= 0; i--) {
            if (this.bboxes.scores[i] < this.threshold) continue;

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