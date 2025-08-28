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

    // Define getBoxStyle as a class method so it can be used by both redrawCanvas and forceRedraw
    getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel = false) {
        const styles = {
            normal: { stroke: "#e74c3c", fill: "rgba(231, 76, 60, 0.85)", text: "white" },
            uncertain: { stroke: "#FFCC00", fill: "rgba(255, 204, 0, 0.85)", text: "black" },
            crowd: { stroke: "#9C27B0", fill: "rgba(156, 39, 176, 0.85)", text: "white" },
            reflected: { stroke: "#20B2AA", fill: "rgba(32, 178, 170, 0.85)", text: "white" },
            rendition: { stroke: "#FF7043", fill: "rgba(255, 112, 67, 0.85)", text: "white" },
            ocrNeeded: { stroke: "#C0C0C0", fill: "rgba(192, 192, 192, 0.85)", text: "black" },
            crowdReflected: { stroke: "#5E6DAD", fill: "rgba(94, 109, 173, 0.85)", text: "white" },
            crowdRendition: { stroke: "#B39DDB", fill: "rgba(179, 157, 219, 0.85)", text: "white" },
            crowdOcrNeeded: { stroke: "#D1C4E9", fill: "rgba(209, 196, 233, 0.85)", text: "black" },
            reflectedRendition: { stroke: "#FF8A65", fill: "rgba(255, 138, 101, 0.85)", text: "white" },
            reflectedOcrNeeded: { stroke: "#B0BEC5", fill: "rgba(176, 190, 197, 0.85)", text: "black" },
            renditionOcrNeeded: { stroke: "#FFAB91", fill: "rgba(255, 171, 145, 0.85)", text: "black" },
            crowdReflectedRendition: { stroke: "#81C784", fill: "rgba(129, 199, 132, 0.85)", text: "white" },
            crowdReflectedOcrNeeded: { stroke: "#E1BEE7", fill: "rgba(225, 190, 231, 0.85)", text: "black" },
            crowdRenditionOcrNeeded: { stroke: "#FFE0B2", fill: "rgba(255, 224, 178, 0.85)", text: "black" },
            reflectedRenditionOcrNeeded: { stroke: "#F8BBD9", fill: "rgba(248, 187, 217, 0.85)", text: "black" },
            crowdReflectedRenditionOcrNeeded: { stroke: "#F0F4C3", fill: "rgba(240, 244, 195, 0.85)", text: "black" },
            selected: { stroke: "#2196F3", fill: "rgba(33, 150, 243, 0.85)", text: "white" },
            multiLabel: { stroke: "#4CAF50", fill: "rgba(76, 175, 80, 0.85)", text: "white" },
        };

        // Multi-label boxes get green color unless they have other specific states
        if (isMultiLabel && !isUncertain && !isSelected) {
            return styles.multiLabel;
        }
        
        // Check for four-flag combination first
        if (isCrowd && isReflected && isRendition && isOcrNeeded) return styles.crowdReflectedRenditionOcrNeeded;
        // Then three-flag combinations
        if (isReflected && isRendition && isOcrNeeded) return styles.reflectedRenditionOcrNeeded;
        if (isCrowd && isRendition && isOcrNeeded) return styles.crowdRenditionOcrNeeded;
        if (isCrowd && isReflected && isOcrNeeded) return styles.crowdReflectedOcrNeeded;
        if (isCrowd && isReflected && isRendition) return styles.crowdReflectedRendition;
        // Then two-flag combinations
        if (isRendition && isOcrNeeded) return styles.renditionOcrNeeded;
        if (isReflected && isOcrNeeded) return styles.reflectedOcrNeeded;
        if (isCrowd && isOcrNeeded) return styles.crowdOcrNeeded;
        if (isCrowd && isReflected) return styles.crowdReflected;
        if (isCrowd && isRendition) return styles.crowdRendition;
        if (isReflected && isRendition) return styles.reflectedRendition;
        // Then single flags
        if (isOcrNeeded) return styles.ocrNeeded;
        if (isRendition) return styles.rendition;
        if (isReflected) return styles.reflected;
        if (isCrowd) return styles.crowd;
        if (isUncertain) return styles.uncertain;
        if (isSelected) return styles.selected;
        return styles.normal;
    }

    // Modify the redrawCanvas method in BBoxEditor class
    redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.img, 0, 0);

        // Ensure all necessary arrays exist
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
        if (this.bboxes?.boxes && !this.bboxes.ocr_needed_flags) {
            console.log("BBoxEditor: Initializing missing ocr_needed_flags array");
            this.bboxes.ocr_needed_flags = new Array(this.bboxes.boxes.length).fill(false);
        }
        if (this.bboxes?.boxes && !this.bboxes.group) {
            console.log("BBoxEditor: Initializing missing group array for multi-label support");
            this.bboxes.group = new Array(this.bboxes.boxes.length).fill(null);
        }

        // Use the class method for styling
        const getBoxStyle = this.getBoxStyle.bind(this);

        const drawBox = (box, style, labelText, isAtTopEdge, thickness = 3) => {
            // Draw box
            this.ctx.strokeStyle = style.stroke;
            // Apply border thickness
            this.ctx.lineWidth = thickness;
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

        // Process boxes to identify multi-label groups
        // Determine if there's a selected multi-label group to avoid duplicate drawing
        const selectedGroupId = (this.selectedBboxIndex >= 0 ? this.bboxes.group?.[this.selectedBboxIndex] : null);
        const processedGroups = new Set();
        const singleBoxes = [];
        
        // First pass: identify boxes that need to be drawn and group multi-label boxes
        this.bboxes.boxes.forEach((box, index) => {
            const isSelected = index === this.selectedBboxIndex;
            
            // Skip selected box for first pass, we'll draw it last
            if (isSelected) return;
            // Get group ID for this box
            const groupId = this.bboxes.group?.[index];
            // Skip drawing any boxes belonging to the selected multi-label group to avoid duplicate overlay
            if (selectedGroupId != null && groupId === selectedGroupId) return;
            
            // If this is part of a non-selected multi-label group and it's not already processed
            if (groupId !== null && groupId !== undefined) {
                // If we haven't processed this group yet
                if (!processedGroups.has(groupId)) {
                    processedGroups.add(groupId);
                    
                    // Find all boxes with this group ID
                    const groupBoxIndices = this.bboxes.group.map((g, i) => 
                        g === groupId ? i : -1).filter(i => i !== -1);
                    
                    // Get attributes from the first box in the group
                    const firstIndex = groupBoxIndices[0];
                    const isUncertain = this.bboxes.uncertain_flags?.[firstIndex] || this.bboxes.labels?.[firstIndex] === -1;
                    const isCrowd = this.bboxes.crowd_flags?.[firstIndex];
                    const isReflected = this.bboxes.reflected_flags?.[firstIndex];
                    const isRendition = this.bboxes.rendition_flags?.[firstIndex];
                    const isOcrNeeded = this.bboxes.ocr_needed_flags?.[firstIndex];
                    
                    // Style will be from the first box in the group
                    const isMultiLabel = true;
                    const style = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, false, isMultiLabel);
                    
                    // Combine labels from all boxes in the group
                    const labelIds = groupBoxIndices.map(idx => this.bboxes.labels?.[idx] ?? this.bboxes.gt?.[idx] ?? 0);
                    
                    let labelText;
                    if (isUncertain) {
                        labelText = "Not Sure";
                    } else if (this.showClassNumbersOnly) {
                        labelText = labelIds.join(", ");
                    } else {
                        // For multi-label boxes, always show only class IDs
                        labelText = labelIds.join(", ");
                    }
                    
                    // Limit label text to prevent excessive length
                    if (labelText.length > 50) {
                        labelText = labelText.substring(0, 47) + '...';
                    }
                    
                    const isAtTopEdge = box[1] <= 5;  // within 5px of top edge
                    
                    // Draw the box with multi-label information
                    drawBox(box, style, labelText, isAtTopEdge);
                }
                // If this group was already processed, skip this box
            } else {
                // This is a single-label box, process normally
                singleBoxes.push(index);
            }
        });
        
        // Draw all single boxes (non-grouped boxes)
        singleBoxes.forEach(index => {
            const box = this.bboxes.boxes[index];
            const isUncertain = this.bboxes.uncertain_flags?.[index] || this.bboxes.labels?.[index] === -1;
            const isCrowd = this.bboxes.crowd_flags?.[index];
            const isReflected = this.bboxes.reflected_flags?.[index];
            const isRendition = this.bboxes.rendition_flags?.[index];
            const isOcrNeeded = this.bboxes.ocr_needed_flags?.[index];
            
            const style = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, false, false);
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
            const selIdx = this.selectedBboxIndex;
            const selGroup = this.bboxes.group?.[selIdx];
            const isMulti = selGroup !== null && selGroup !== undefined;
            const isUncertain = this.bboxes.uncertain_flags?.[selIdx] || this.bboxes.labels?.[selIdx] === -1;
            const isCrowd = this.bboxes.crowd_flags?.[selIdx];
            const isReflected = this.bboxes.reflected_flags?.[selIdx];
            const isRendition = this.bboxes.rendition_flags?.[selIdx];
            const isOcrNeeded = this.bboxes.ocr_needed_flags?.[selIdx];
            let box, labelText;

            if (isMulti) {
                // Representative box for multi-label group selection
                const groupIndices = this.bboxes.group.map((g, i) => g === selGroup ? i : -1).filter(i => i !== -1);
                const repIdx = Math.min(...groupIndices);
                box = this.bboxes.boxes[repIdx];
                const labelIds = groupIndices.map(i => this.bboxes.labels?.[i] ?? this.bboxes.gt?.[i] ?? 0);
                labelText = isUncertain ? "Not Sure" : labelIds.join(", ");
            } else {
                // Single box selection
                box = this.bboxes.boxes[selIdx];
                const labelId = this.bboxes.labels?.[selIdx] ?? this.bboxes.gt?.[selIdx] ?? 0;
                if (isUncertain) {
                    labelText = "Not Sure";
                } else if (this.showClassNumbersOnly) {
                    labelText = `${labelId}`;
                } else {
                    const name = this.classLabels[labelId] || `Class ${labelId}`;
                    labelText = `${labelId} - ${name}`;
                }
                if (labelText.length > 30) labelText = labelText.substring(0, 27) + '...';
            }

            const style = getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, true, isMulti);
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
                // Get flag states for proper styling
                const isUncertain = this.bboxes.uncertain_flags?.[index] || this.bboxes.labels?.[index] === -1;
                const isCrowd = this.bboxes.crowd_flags?.[index];
                const isReflected = this.bboxes.reflected_flags?.[index];
                const isRendition = this.bboxes.rendition_flags?.[index];
                const isOcrNeeded = this.bboxes.ocr_needed_flags?.[index];
                const isSelected = this.selectedBboxIndex === index;
                const groupId = this.bboxes.group?.[index];
                const isMultiLabel = groupId !== null && groupId !== undefined;

                // Use the same styling function as redrawCanvas
                const style = this.getBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel);
                
                // Draw box with proper styling
                this.ctx.strokeStyle = style.stroke;
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

                // Show label info for each box with enhanced readability

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
                let labelText;
                if (isMultiLabel) {
                    // For multi-label boxes, show only comma-separated class IDs
                    const groupBoxIndices = this.bboxes.group.map((g, i) => 
                        g === groupId ? i : -1).filter(i => i !== -1);
                    const labelIds = groupBoxIndices.map(idx => this.bboxes.labels?.[idx] ?? this.bboxes.gt?.[idx] ?? 0);
                    labelText = labelIds.join(", ");
                } else {
                    // For regular boxes, follow normal logic
                    const labelName = this.classLabels[labelId] || `Class ${labelId}`;
                    if (this.showClassNumbersOnly) {
                        labelText = `${labelId}`;
                    } else {
                        labelText = `${labelId} - ${labelName}`;
                    }
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
                this.ctx.fillStyle = style.fill;

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
                this.ctx.strokeStyle = style.stroke;
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                // Draw text with shadow for depth
                this.ctx.fillStyle = style.text;
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
        const clickedBoxIndex = this.findBoxByBorderOnly(actualX, actualY);
        
        // Select the actual clicked box, no group representative logic
        this.selectedBboxIndex = clickedBoxIndex;

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