/**
 * Bounding Box Editor
 * Manages the creation, editing, and visualization of bounding boxes
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
        this.bindEvents();
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
        this.canvas.style.cursor = 'pointer';
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

                // Show label info for each box
                this.ctx.fillStyle = this.selectedBboxIndex === index ? '#2196F3' : '#e74c3c';
                this.ctx.font = '12px Arial';

                let labelText = `Box ${index + 1}`;
                if (this.bboxes.labels && this.bboxes.labels[index] !== undefined) {
                    const labelId = this.bboxes.labels[index];
                    const labelName = this.classLabels[labelId] || labelId;
                    labelText += ` (${labelId} - ${labelName})`;
                }

                this.ctx.fillText(labelText, box[0], box[1] - 5);
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

                    // Show label info for each box
                    this.ctx.fillStyle = this.selectedBboxIndex === index ? '#2196F3' : '#e74c3c';
                    this.ctx.font = '12px Arial';

                    let labelText = `Box ${index + 1}`;
                    if (this.bboxes.labels && this.bboxes.labels[index] !== undefined) {
                        const labelId = this.bboxes.labels[index];
                        const labelName = this.classLabels[labelId] || labelId;
                        labelText += ` (${labelId} - ${labelName})`;
                    }

                    this.ctx.fillText(labelText, box[0], box[1] - 5);
                }
            });
        }
    }

    bindEvents() {
        this.canvas.addEventListener('click', (event) => this.handleCanvasClick(event));
    }

    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const actualX = x * scaleX;
        const actualY = y * scaleY;

        // Only detect clicks on borders, not inside the box
        let clickedBoxIndex = this.findBoxByBorderOnly(actualX, actualY);

        // If no box was clicked, select the first box above threshold (default behavior)
        if (clickedBoxIndex === -1) {
            for (let i = 0; i < this.bboxes.boxes.length; i++) {
                if (this.bboxes.scores[i] >= this.threshold) {
                    clickedBoxIndex = i;
                    break;
                }
            }
        }

        this.selectedBboxIndex = clickedBoxIndex;

        // Store original state before showing editor
        this.originalBboxes = JSON.parse(JSON.stringify(this.bboxes));

        // Make sure we have a valid box to edit
        if (this.selectedBboxIndex >= 0 && this.selectedBboxIndex < this.bboxes.boxes.length) {
            this.showBboxEditor(this.bboxes.boxes[this.selectedBboxIndex], this.selectedBboxIndex);
            this.redrawCanvas();
        }
        event.stopPropagation();
    }

    // Helper function to detect clicks only on box borders
    findBoxByBorderOnly(x, y, borderWidth = 5) {
        // Only detect clicks on borders, not inside the box
        for (let i = 0; i < this.bboxes.boxes.length; i++) {
            if (this.bboxes.scores[i] >= this.threshold) {
                const box = this.bboxes.boxes[i];

                // Check if click is near any of the four borders
                const onLeftBorder = Math.abs(x - box[0]) <= borderWidth && y >= box[1] && y <= box[3];
                const onRightBorder = Math.abs(x - box[2]) <= borderWidth && y >= box[1] && y <= box[3];
                const onTopBorder = Math.abs(y - box[1]) <= borderWidth && x >= box[0] && x <= box[2];
                const onBottomBorder = Math.abs(y - box[3]) <= borderWidth && x >= box[0] && x <= box[2];

                if (onLeftBorder || onRightBorder || onTopBorder || onBottomBorder) {
                    return i;
                }
            }
        }
        return -1;
    }

    showBboxEditor(box, index = -1) {
        const modal = document.getElementById('bbox-modal-container');
        if (!modal) {
            console.error('Modal not found in the DOM');
            return;
        }

        BBoxEditorUI.openModal(box, index, this.bboxes, this);
    }

}