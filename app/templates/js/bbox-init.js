/**
 * Initialize the bounding box editor when the page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Get bounding box data from the backend
    const bboxes = JSON.parse(document.getElementById('bbox-data').textContent);
    const threshold = parseFloat(document.getElementById('threshold').textContent);
    const humanReadableClasses = JSON.parse(document.getElementById('human-readable-classes').textContent);

    const img = document.querySelector('#image-with-bboxes img');
    const canvas = document.createElement('canvas');

    // Create a map of class labels
    const classLabels = {};
    for (const [classId, className] of Object.entries(humanReadableClasses)) {
        classLabels[classId] = className;
    }

    // Initialize labels array if it doesn't exist
    if (!bboxes.labels) {
        bboxes.labels = Array(bboxes.boxes.length).fill(0);
    }

    // Create the editor instance
    new BBoxEditor({
        bboxes: bboxes,
        threshold: threshold,
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
                    if (bboxes.scores[i] >= threshold) {
                        saveData[i] = {
                            coordinates: box,
                            label: bboxes.labels[i] || 0
                        };
                    }
                });

                bboxesInput.value = JSON.stringify(saveData);
                console.log("Bounding box data saved:", saveData);
            }
        });
    }
});