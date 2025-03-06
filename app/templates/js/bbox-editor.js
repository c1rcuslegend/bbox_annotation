/**
 * Bounding Box Editor
 * Manages the creation, editing, and visualization of bounding boxes
 * Fixed version: 2025-03-06 15:40:12
 */
class BBoxEditor {
    constructor(config) {
        this.bboxes = config.bboxes || { boxes: [], scores: [], labels: [] };
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
                const labelX = box[0];
                const labelY = box[1] - 5;

                // Prepare label text
                let labelText = `Box ${index + 1}`;
                if (this.bboxes.labels && this.bboxes.labels[index] !== undefined) {
                    const labelId = this.bboxes.labels[index];
                    const labelName = this.classLabels[labelId] || labelId;
                    labelText = `${labelId} - ${labelName}`; // Simplified format
                }

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
                    const labelX = box[0];
                    const labelY = box[1] - 5;

                    // Prepare label text
                    let labelText = `Box ${index + 1}`;
                    if (this.bboxes.labels && this.bboxes.labels[index] !== undefined) {
                        const labelId = this.bboxes.labels[index];
                        const labelName = this.classLabels[labelId] || labelId;
                        labelText = `${labelId} - ${labelName}`; // Simplified format
                    }

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
}