/**
 * Initialize the bounding box editor when the page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Get bounding box data from the backend
    const bboxes = JSON.parse(document.getElementById('bbox-data').textContent);
    const humanReadableClasses = JSON.parse(document.getElementById('human-readable-classes').textContent);

    const img = document.querySelector('#image-with-bboxes img');
    const canvas = document.createElement('canvas');

    // Create a map of class labels
    const classLabels = {};
    for (const [classId, className] of Object.entries(humanReadableClasses)) {
        classLabels[classId] = className;
    }

    // Check for gt field first and use it as labels if it exists
    if (bboxes.gt && !bboxes.labels) {
        console.log("Using 'gt' field as labels", bboxes.gt);
        bboxes.labels = bboxes.gt;
    }
    // Initialize labels array if it doesn't exist
    else if (!bboxes.labels) {
        bboxes.labels = Array(bboxes.boxes.length).fill(0);
    }

    // Debug the loaded labels for verification
    if (bboxes.labels) {
        console.log("Labels for boxes:", bboxes.labels);
    }
    if (bboxes.gt) {
        console.log("GT values for boxes:", bboxes.gt);
    }

    // Create the editor instance
    new BBoxEditor({
        bboxes: bboxes,
        img: img,
        canvas: canvas,
        classLabels: classLabels
    });

    // Save button to explicitly save bboxes
    const saveBboxButton = document.getElementById('save-bboxes');
    if (saveBboxButton) {
        saveBboxButton.addEventListener('click', function() {
            const bboxesInput = document.getElementById('bboxes-data');
            if (bboxesInput) {
                // Create a clean dictionary format for saving
                const saveData = {};
                bboxes.boxes.forEach((box, i) => {
                    // Check labels first, then gt, then default to 0
                    let label = 0;
                    if (bboxes.labels && bboxes.labels[i] !== undefined) {
                        label = bboxes.labels[i];
                    } else if (bboxes.gt && bboxes.gt[i] !== undefined) {
                        label = bboxes.gt[i];
                        console.log(`Using gt[${i}] (${label}) for saved data`);
                    }

                    saveData[i] = {
                        coordinates: box,
                        label: label
                    };
                });

                bboxesInput.value = JSON.stringify(saveData);
                console.log("Bounding box data saved:", saveData);
            }
        });
    }
});