/**
 * Inline Bounding Box Editor
 */
document.addEventListener('DOMContentLoaded', function() {
	console.log('Inline BBox Editor initializing');

	// DEBUG mode for extra logging
	const DEBUG = true;

	function debug(message) {
		if (DEBUG) console.log(`[BBox Editor] ${message}`);
	}

	// Get DOM elements for controls
	const inlineBboxSelector = document.getElementById('inline-bbox-selector');
	const inlineCrowdCheckbox = document.getElementById("inline-crowd-checkbox");
	const deleteBoxBtn = document.getElementById('inline-bbox-delete');
	const deleteAllBtn = document.getElementById('inline-bbox-delete-all');
	const cancelBtn = document.getElementById('inline-bbox-cancel');
	const openPopupBtn = document.getElementById('open-popup-editor');

	// Get the image container
	const imageContainer = document.getElementById('image-with-bboxes');

	// Initialize editor state
	const inlineEditor = {
		initialized: false,
		bboxes: null,
		editor: null,
		currentBoxIndex: -1,
		isDrawing: false,
		isDragging: false,
		isResizing: false,
		dragStartX: 0,
		dragStartY: 0,
		dragStartBox: null,
		resizeCorner: null,
		drawStartPos: { x: 0, y: 0 },
		classLabels: {},
		tempBox: null,
		canvasElement: null,
		lastSelectedClassId: null, // Track the last selected class ID
		bboxesField: null, // Hidden field for storing bbox data
		labelsInitialized: false,  // Track if labels have been initialized
		uncertaintyMode: false,    // Track if we're in uncertainty mode
		selectedUncertainClasses: [] // Store selected classes for uncertain boxes
	};

	// Track uncertainty mode globally to ensure it's accessible across functions
	window.uncertaintyMode = false;
	window.selectedUncertainClasses = [];

	// Setup uncertainty modal listener
	setupUncertaintyModal();

	function setupUncertaintyModal() {
		const uncertaintyModal = document.getElementById('uncertainty-modal-container');
		if (uncertaintyModal) {
			const confirmBtn = document.getElementById('confirm-uncertainty');
			if (confirmBtn) {
				// Remove any existing event listeners (to avoid duplicates)
				const newConfirmBtn = confirmBtn.cloneNode(true);
				confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

				// Add our handler
				newConfirmBtn.addEventListener('click', function() {
					// Collect selected classes as integer IDs only
					const selectedClassIds = [];
					const checkboxes = document.querySelectorAll('.uncertainty-class-checkbox:checked');

					checkboxes.forEach(checkbox => {
						const classId = parseInt(checkbox.value);
						if (!isNaN(classId)) {
							selectedClassIds.push(classId);
						}
					});

					// Store selected classes in both the editor instance and window
					inlineEditor.uncertaintyMode = true;
					inlineEditor.selectedUncertainClasses = selectedClassIds;

					window.uncertaintyMode = true;
					window.selectedUncertainClasses = selectedClassIds;

					// Set label_type to uncertain
					const labelTypeInput = document.getElementById('label_type');
					if (labelTypeInput) {
						labelTypeInput.value = 'uncertain';
					}

					// Store selected classes in the hidden input
					const selectedClassesInput = document.getElementById('selected_classes');
					if (selectedClassesInput) {
						selectedClassesInput.value = JSON.stringify(selectedClassIds);
					}

					// Hide the modal
					uncertaintyModal.classList.remove('show-modal');

					// Show notification to the user
					showCenterNotification('Uncertainty Mode', 'Now draw a bounding box for uncertain items');

					// Add visual indicator that uncertainty mode is active
					addUncertaintyModeIndicator();

					debug(`Uncertainty mode activated with classes: ${selectedClassIds.join(', ')}`);
				});
			}
		}
	}

	function addUncertaintyModeIndicator() {
		// Remove any existing indicator
		removeUncertaintyModeIndicator();

		// Create new indicator
		const indicator = document.createElement('div');
		indicator.id = 'uncertainty-mode-indicator';
		indicator.style.position = 'fixed';
		indicator.style.top = '10px';
		indicator.style.right = '10px';
		indicator.style.padding = '8px 12px';
		indicator.style.background = '#FFCC00';
		indicator.style.color = 'black';
		indicator.style.borderRadius = '4px';
		indicator.style.fontWeight = 'bold';
		indicator.style.zIndex = '9999';
		indicator.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
		indicator.textContent = 'NOT SURE MODE - Draw a box now';

		// Add pulsing animation with CSS
		indicator.style.animation = 'pulse 1.5s infinite';

		// Add animation keyframes if they don't exist
		if (!document.getElementById('uncertainty-animation')) {
			const style = document.createElement('style');
			style.id = 'uncertainty-animation';
			style.textContent = `
				@keyframes pulse {
					0% { opacity: 1; }
					50% { opacity: 0.7; }
					100% { opacity: 1; }
				}
			`;
			document.head.appendChild(style);
		}

		// Add indicator to the document
		document.body.appendChild(indicator);

		// Also add a border to the image container
		const imageContainer = document.querySelector('.image-editor-right');
		if (imageContainer) {
			imageContainer.style.border = '3px solid #FFCC00';
		}
	}

	function removeUncertaintyModeIndicator() {
		const indicator = document.getElementById('uncertainty-mode-indicator');
		if (indicator) {
			indicator.remove();
		}

		// Remove border from image container
		const imageContainer = document.querySelector('.image-editor-right');
		if (imageContainer) {
			imageContainer.style.border = '';
		}
	}

	function resetUncertaintyCheckboxes() {
		const checkboxes = document.querySelectorAll('.uncertainty-class-checkbox:checked');
		checkboxes.forEach(checkbox => {
			checkbox.checked = false;
		});

		// Clear the search field too
		const searchInput = document.getElementById('uncertainty-search-input');
		if (searchInput) {
			searchInput.value = '';
		}

		// Reset the stored selected classes
		inlineEditor.selectedUncertainClasses = [];
		window.selectedUncertainClasses = [];

		debug('Reset all uncertainty checkboxes');
	}

	// Load class labels
	const classesElement = document.getElementById('human-readable-classes');
	if (classesElement && classesElement.textContent) {
		try {
			inlineEditor.classLabels = JSON.parse(classesElement.textContent);
			debug(`Loaded ${Object.keys(inlineEditor.classLabels).length} class labels`);
		} catch (e) {
			console.error('Error parsing class labels:', e);
		}
	}

	// Load initial bounding boxes
	const bboxDataElement = document.getElementById('bbox-data');
	if (bboxDataElement && bboxDataElement.textContent) {
		try {
			inlineEditor.bboxes = JSON.parse(bboxDataElement.textContent);
			inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.bboxes));

			// Debug the loaded bboxes
			debug('Loaded bboxes:');
			debug(JSON.stringify(inlineEditor.bboxes));

			// Check for 'gt' field and use it as 'labels' if it exists
			if (inlineEditor.bboxes.gt && !inlineEditor.bboxes.labels) {
				debug('Found "gt" field - using as labels array');
				inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
				inlineEditor.labelsInitialized = true;
			}
			// Ensure labels array exists
			else if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.boxes) {
				debug('Creating missing labels array with default values');
				inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
				inlineEditor.labelsInitialized = true;
			}
			else if (inlineEditor.bboxes.labels) {
				debug(`Labels found: ${JSON.stringify(inlineEditor.bboxes.labels)}`);
				inlineEditor.labelsInitialized = true;
			}

			// Ensure crowd flags array exists
			if (!inlineEditor.bboxes.crowd_flags && inlineEditor.bboxes.boxes) {
				debug('Creating missing crowd flags array with default values');
				inlineEditor.bboxes.crowd_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			} else if (inlineEditor.bboxes.crowd_flags) {
				debug(`Crowd flags found: ${JSON.stringify(inlineEditor.bboxes.crowd_flags)}`);
			}

			// Ensure uncertain flags array exists
			if (!inlineEditor.bboxes.uncertain_flags && inlineEditor.bboxes.boxes) {
				debug('Creating missing uncertain flags array with default values');
				inlineEditor.bboxes.uncertain_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			}

			// Check for possible_labels array
			if (!inlineEditor.bboxes.possible_labels && inlineEditor.bboxes.boxes) {
				debug('Creating missing possible_labels array');
				inlineEditor.bboxes.possible_labels = new Array(inlineEditor.bboxes.boxes.length).fill([]);
			}

			// Check for label_type
			if (inlineEditor.bboxes.label_type) {
				debug(`Found label_type: ${inlineEditor.bboxes.label_type}`);
				// Update the hidden field
				const labelTypeField = document.getElementById('label_type');
				if (labelTypeField) {
					labelTypeField.value = inlineEditor.bboxes.label_type;
				}
			}

		} catch (e) {
			console.error('Error parsing bbox data:', e);
		}
	}

	// Create hidden form field for bboxes
	createBboxesField();

	// Add Save button to the control buttons div
	addSaveButton();

	// Hook up checkbox event listeners
	setupCategoryCheckboxListeners();

	// Hook up form submission to save bboxes
	setupFormSubmissionHandlers();

	// Create hidden form field for bboxes
	function createBboxesField() {
		// Check if it already exists
		let bboxesField = document.getElementById('bboxes-data-field');
		if (!bboxesField) {
			// Create the field
			bboxesField = document.createElement('input');
			bboxesField.type = 'hidden';
			bboxesField.id = 'bboxes-data-field';
			bboxesField.name = 'bboxes_data';

			// Add it to the form
			const form = document.getElementById('save');
			if (form) {
				form.appendChild(bboxesField);
				debug('Created hidden bboxes field');
			} else {
				console.error('Form not found, cannot add hidden bboxes field');
			}
		}

		// Store reference
		inlineEditor.bboxesField = bboxesField;
	}

	// Function to add a Save button
	function addSaveButton() {
		const controlButtons = document.querySelector('.control-buttons');
		if (!controlButtons) {
			console.error('Control buttons container not found');
			return;
		}

		// Create Save button
		const saveBtn = document.createElement('button');
		saveBtn.id = 'inline-bbox-save';
		saveBtn.className = 'editor-button save-btn';
		saveBtn.textContent = 'Save Changes';

		// Insert it before the Cancel button if it exists
		if (cancelBtn) {
			controlButtons.insertBefore(saveBtn, cancelBtn);
		} else {
			// Otherwise just append it
			controlButtons.appendChild(saveBtn);
		}

		// Add event listener with popup notification
		saveBtn.addEventListener('click', function() {
			saveBboxes();
			// Show a notification only for save action
			showCenterNotification('Bounding Boxes Saved', 'Your changes have been successfully saved');
		});

		debug('Save button added to controls');
	}

	// Center screen notification function
	function showCenterNotification(title, message) {
		// Remove any existing notification
		const existingNotification = document.getElementById('center-notification');
		if (existingNotification) {
			existingNotification.remove();
		}

		// Create notification container
		const notification = document.createElement('div');
		notification.id = 'center-notification';
		notification.style.position = 'fixed';
		notification.style.left = '50%';
		notification.style.top = '50%';
		notification.style.transform = 'translate(-50%, -50%)';
		notification.style.backgroundColor = 'rgba(33, 150, 243, 0.95)'; // Blue with slight transparency
		notification.style.color = 'white';
		notification.style.padding = '20px 30px';
		notification.style.borderRadius = '8px';
		notification.style.zIndex = '10000';
		notification.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
		notification.style.textAlign = 'center';
		notification.style.minWidth = '300px';
		notification.style.maxWidth = '90%';
		notification.style.pointerEvents = 'none'; // Don't interfere with clicks
		notification.style.fontFamily = 'Arial, sans-serif';
		notification.style.transition = 'opacity 0.3s, transform 0.3s';
		notification.style.opacity = '0';
		notification.style.transform = 'translate(-50%, -50%) scale(0.9)';

		// Create title element
		const titleElement = document.createElement('div');
		titleElement.textContent = title;
		titleElement.style.fontSize = '20px';
		titleElement.style.fontWeight = 'bold';
		titleElement.style.marginBottom = '10px';
		notification.appendChild(titleElement);

		// Create message element
		const messageElement = document.createElement('div');
		messageElement.textContent = message;
		messageElement.style.fontSize = '16px';
		notification.appendChild(messageElement);

		// Add an icon (checkmark)
		const icon = document.createElement('div');
		icon.innerHTML = '✓';
		icon.style.fontSize = '36px';
		icon.style.marginBottom = '10px';
		notification.insertBefore(icon, titleElement);

		// Add to document
		document.body.appendChild(notification);

		// Animate in
		setTimeout(() => {
			notification.style.opacity = '1';
			notification.style.transform = 'translate(-50%, -50%) scale(1)';
		}, 10);

		// Remove after 2 seconds with animation
		setTimeout(() => {
			notification.style.opacity = '0';
			notification.style.transform = 'translate(-50%, -50%) scale(0.9)';

			setTimeout(() => {
				notification.remove();
			}, 300);
		}, 2000);
	}

	// Setup form submission to save bboxes before navigating
	function setupFormSubmissionHandlers() {
		// Handle main form submission
		const form = document.getElementById('save');
		if (form) {
			form.addEventListener('submit', function(e) {
				// Prevent default submission to handle it manually
				e.preventDefault();

				// Save bboxes
				saveBboxes();

				// Update hidden field
				updateHiddenBboxesField();

				// Reset radio selection when navigating
				if (typeof window.resetRadioSelection === 'function') {
					window.resetRadioSelection();
					debug('Radio selection reset before form submission');
				}

				debug('Form submitted - saved bboxes and updated hidden field');

				// Continue with form submission after a slight delay
				setTimeout(() => {
					this.submit();
				}, 100);
			});

			debug('Added form submission handler');
		}

		// Handle direct next/prev button clicks
		// Since these might be outside the form or use JS navigation
		const allButtons = document.querySelectorAll('button');
		allButtons.forEach(button => {
			if (button.name === 'next' || button.textContent.includes('Next') ||
				button.getAttribute('data-action') === 'next') {
				button.addEventListener('click', function() {
					saveBboxes();
					updateHiddenBboxesField();

					// Reset radio selection
					if (typeof window.resetRadioSelection === 'function') {
						window.resetRadioSelection();
					}

					debug('Next button clicked - saved bboxes');
				});
			}
			else if (button.name === 'prev' || button.textContent.includes('Previous') ||
					 button.getAttribute('data-action') === 'prev') {
				button.addEventListener('click', function() {
					saveBboxes();
					updateHiddenBboxesField();

					// Reset radio selection
					if (typeof window.resetRadioSelection === 'function') {
						window.resetRadioSelection();
					}

					debug('Prev button clicked - saved bboxes');
				});
			}
		});
	}

	// Update hidden form field with bbox data
	function updateHiddenBboxesField() {
		if (!inlineEditor.bboxesField) {
			console.error('Hidden bboxes field not found');
			return;
		}

		// Format data for saving to form field
		let bboxDataArray = [];

		if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes || !inlineEditor.bboxes.scores) {
			console.error('Invalid bboxes data structure:', inlineEditor.bboxes);
			return;
		}

		// Check if we have any uncertain boxes
		let hasUncertainBoxes = false;
		if (inlineEditor.bboxes.uncertain_flags) {
			hasUncertainBoxes = inlineEditor.bboxes.uncertain_flags.some(flag => flag === true);
		}

        // Also check for -1 label values which indicate uncertain boxes
        if (!hasUncertainBoxes && inlineEditor.bboxes.labels) {
            hasUncertainBoxes = inlineEditor.bboxes.labels.some(label => label === -1);
        }

		// Set label_type to uncertain if any box is uncertain, otherwise basic
		const labelTypeField = document.getElementById('label_type');
		if (labelTypeField) {
			if (hasUncertainBoxes) {
				labelTypeField.value = "uncertain";
			} else {
				labelTypeField.value = "basic";
			}
		}

		// Debug current bboxes state
		debug(`Updating hidden field - current boxes: ${inlineEditor.bboxes.boxes.length}`);
		debug(`Current labels: ${JSON.stringify(inlineEditor.bboxes.labels)}`);

		inlineEditor.bboxes.boxes.forEach((box, i) => {
			const isUncertain = (inlineEditor.bboxes.uncertain_flags && inlineEditor.bboxes.uncertain_flags[i]) ||
                             (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] === -1);

			let bboxData = {
				coordinates: box,
				crowd_flag: inlineEditor.bboxes.crowd_flags && inlineEditor.bboxes.crowd_flags[i]
			};

			if (isUncertain) {
				// For uncertain boxes, include possible_labels and uncertain_flag
				bboxData.uncertain_flag = true;

				// Get possible_labels array (ensure it's a simple array of integers)
				if (inlineEditor.bboxes.possible_labels && inlineEditor.bboxes.possible_labels[i]) {
					const possibleLabels = inlineEditor.bboxes.possible_labels[i];
					// Ensure it's a simple array of integers
					if (Array.isArray(possibleLabels)) {
						bboxData.possible_labels = possibleLabels;
					} else {
						// Try to convert from object if necessary
						const labelArray = [];
						for (const key in possibleLabels) {
							if (possibleLabels.hasOwnProperty(key)) {
								labelArray.push(parseInt(key));
							}
						}
						bboxData.possible_labels = labelArray;
					}
				} else {
					bboxData.possible_labels = []; // Empty array as fallback
				}

                // Also set label to -1 for uncertain boxes
                bboxData.label = -1;
			} else {
				// For regular boxes, include label
				let label = 0;
				if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] !== undefined) {
					label = inlineEditor.bboxes.labels[i];
				} else if (inlineEditor.bboxes.gt && inlineEditor.bboxes.gt[i] !== undefined) {
					label = inlineEditor.bboxes.gt[i];
				}

				bboxData.label = label;
			}

			bboxDataArray.push(bboxData);
		});

		// Create an object with bboxes and label_type
		const labelType = labelTypeField ? labelTypeField.value : "basic";
		const formData = {
			bboxes: bboxDataArray,
			label_type: labelType
		};

		// Update the hidden field with JSON string
		inlineEditor.bboxesField.value = JSON.stringify(formData);
		debug(`Updated hidden field with label_type: ${labelType}, bboxes: ${bboxDataArray.length}`);
	}

	// Hook up checkbox event listeners
	function setupCategoryCheckboxListeners() {
		// Also check for the global lastSelectedClassId from checkbox.js
		if (window.lastSelectedClassId !== undefined) {
			inlineEditor.lastSelectedClassId = window.lastSelectedClassId;
			debug(`Found global lastSelectedClassId: ${inlineEditor.lastSelectedClassId}`);
		}

		// Find all category checkboxes
		const categoryCheckboxes = document.querySelectorAll('input[type="checkbox"][name="checkboxes"]');

		categoryCheckboxes.forEach(checkbox => {
			checkbox.addEventListener('change', function() {
				if (this.checked) {
					// Store the class ID when checkbox is checked
					inlineEditor.lastSelectedClassId = this.value;
					debug(`Checkbox changed - selected class ${inlineEditor.lastSelectedClassId} for next bounding box`);
				}
			});
		});

		debug(`Set up listeners for ${categoryCheckboxes.length} category checkboxes`);
	}

	// Hook up Advanced Editor button
	if (openPopupBtn) {
		openPopupBtn.addEventListener('click', function() {
			debug('Advanced Editor button clicked');

			// Get the modal element
			const modal = document.getElementById('bbox-modal-container');
			if (!modal) {
				console.error('Modal element not found');
				return;
			}

			// If we have a selected box, open the editor with that box
			if (inlineEditor.currentBoxIndex >= 0 &&
				inlineEditor.bboxes &&
				inlineEditor.currentBoxIndex < inlineEditor.bboxes.boxes.length) {

				debug(`Opening editor with box ${inlineEditor.currentBoxIndex}`);
				BBoxEditorUI.openModal(
					inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex],
					inlineEditor.currentBoxIndex,
					inlineEditor.bboxes,
					inlineEditor.editor
				);
			} else {
				// Otherwise open with no selection
				debug('Opening editor with no selection');
				BBoxEditorUI.openModal(
					null,
					-1,
					inlineEditor.bboxes,
					inlineEditor.editor
				);
			}

			// Show the modal
			modal.classList.add('show-modal');
		});
	}

	// Event listener for modal close to sync crowd checkbox state
	document.addEventListener('bbox-modal-closed', function(e) {
		debug('Advanced editor modal closed, syncing crowd checkbox state');

		// If we have a selected box, update the inline crowd checkbox
		if (inlineEditor.currentBoxIndex >= 0 && inlineEditor.bboxes &&
			inlineEditor.bboxes.crowd_flags &&
			inlineEditor.currentBoxIndex < inlineEditor.bboxes.crowd_flags.length) {

			// Get the current crowd flag state from the bboxes data
			const isCrowd = inlineEditor.bboxes.crowd_flags[inlineEditor.currentBoxIndex];

			// Update the inline checkbox
			if (inlineCrowdCheckbox) {
				inlineCrowdCheckbox.checked = isCrowd;
				debug(`Synced inline crowd checkbox to: ${isCrowd} after modal close`);
			}
		}
	});

	// Check for main editor and connect to it
	const checkForEditor = setInterval(() => {
		if (window.bboxEditor) {
			clearInterval(checkForEditor);
			connectToMainEditor();
		}
	}, 200);

	// Connect to the main editor once it's available
	function connectToMainEditor() {
		inlineEditor.editor = window.bboxEditor;

		debug('Main editor found, connecting...');

		// Ensure we don't lose label information
		// Make sure we have bboxes
		if (!inlineEditor.bboxes && inlineEditor.editor.bboxes) {
			debug('Using bboxes from main editor');
			inlineEditor.bboxes = inlineEditor.editor.bboxes;

			// Check if we need to create labels
			if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.boxes) {
				// Check for 'gt' field first
				if (inlineEditor.bboxes.gt) {
					debug('Using "gt" field as labels');
					inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
				} else {
					debug('Creating missing labels array for editor boxes');
					inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
				}
			}
		} else if (inlineEditor.editor.bboxes) {
			// We have our own bboxes, make sure editor uses them
			debug('Updating main editor with our bboxes');

			// Check for 'gt' field before processing labels
			if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.gt) {
				debug('Using our "gt" field as labels');
				inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
			}
			// Preserve labels if they exist in our bboxes
			else if (inlineEditor.bboxes.labels && !inlineEditor.editor.bboxes.labels) {
				debug('Preserving our labels when updating editor');
			}
			// If editor has labels but we don't, take them
			else if (!inlineEditor.bboxes.labels && inlineEditor.editor.bboxes.labels) {
				debug('Taking labels from editor');
				inlineEditor.bboxes.labels = [...inlineEditor.editor.bboxes.labels];
			}

			// Now update the editor
			inlineEditor.editor.bboxes = inlineEditor.bboxes;
		}

		// Store original bboxes for cancel functionality
		if (inlineEditor.editor.originalBboxes) {
			inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.editor.originalBboxes));
		} else {
			inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.bboxes));
		}

		// Make sure we have class labels
		if (Object.keys(inlineEditor.classLabels).length === 0 && inlineEditor.editor.classLabels) {
			inlineEditor.classLabels = inlineEditor.editor.classLabels;
		}

		// Make sure we have labels after connection
		if (inlineEditor.bboxes && inlineEditor.bboxes.boxes && !inlineEditor.bboxes.labels) {
			// Check for 'gt' field as final fallback
			if (inlineEditor.bboxes.gt) {
				debug('Using "gt" field as labels after connection check');
				inlineEditor.bboxes.labels = inlineEditor.bboxes.gt;
			} else {
				debug('Labels missing after connection, creating them now');
				inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
			}
		} else if (inlineEditor.bboxes && inlineEditor.bboxes.labels) {
			debug(`Labels after connection: ${JSON.stringify(inlineEditor.bboxes.labels)}`);
		}

		// Make sure we have uncertain flags and possible_labels after connection
		if (inlineEditor.bboxes && inlineEditor.bboxes.boxes) {
			if (!inlineEditor.bboxes.uncertain_flags) {
				debug('Creating uncertain_flags array after connection');
				inlineEditor.bboxes.uncertain_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			}

			if (!inlineEditor.bboxes.possible_labels) {
				debug('Creating possible_labels array after connection');
				inlineEditor.bboxes.possible_labels = new Array(inlineEditor.bboxes.boxes.length).fill([]);
			}
		}

		// Find the canvas element that the main editor created
		if (imageContainer) {
			const canvas = imageContainer.querySelector('canvas');
			if (canvas) {
				inlineEditor.canvasElement = canvas;
				debug('Found canvas element to attach events to');
			} else {
				console.error('Canvas element not found in image container');
			}
		}

		// Override the editor's redraw to handle uncertain boxes and our temp box
		const originalRedraw = inlineEditor.editor.redrawCanvas;
		inlineEditor.editor.redrawCanvas = function() {
			// Call original redraw to preserve current drawing logic
			originalRedraw.call(this);

			// Loop through all boxes to draw uncertain ones with yellow color
			if (this.bboxes && Array.isArray(this.bboxes.boxes)) {
				for (let i = 0; i < this.bboxes.boxes.length; i++) {
					// Skip the selected box as we'll draw it on top later
					if (i === this.selectedBboxIndex) continue;

					// Check if this is an uncertain box - by flag or by label value of -1
					const isUncertain = (this.bboxes.uncertain_flags && this.bboxes.uncertain_flags[i]) ||
										(this.bboxes.labels && this.bboxes.labels[i] === -1);

					if (isUncertain) {
						// Draw uncertain box with yellow color
						this.ctx.save();
						this.ctx.strokeStyle = '#FFCC00'; // Yellow
						this.ctx.lineWidth = 3;

						const box = this.bboxes.boxes[i];
						this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

						// Draw "Not Sure" label
						const labelX = box[0] + 5;
						const labelY = box[1] <= 5 ? box[1] + 20 : box[1] - 5;

						this.ctx.save();
						const fontSize = 14;
						const padding = 4;
						this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
						const labelText = "Not Sure";
						const textWidth = this.ctx.measureText(labelText).width;
						const cornerRadius = 3;

						// Yellow background for uncertain labels
						this.ctx.fillStyle = 'rgba(255, 204, 0, 0.85)';
						this.ctx.beginPath();
						this.ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
						this.ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
						this.ctx.arcTo(
							labelX + textWidth + padding,
							labelY - fontSize - padding,
							labelX + textWidth + padding,
							labelY - fontSize - padding + cornerRadius,
							cornerRadius
						);
						this.ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
						this.ctx.arcTo(
							labelX + textWidth + padding,
							labelY + padding,
							labelX + textWidth + padding - cornerRadius,
							labelY + padding,
							cornerRadius
						);
						this.ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
						this.ctx.arcTo(
							labelX - padding,
							labelY + padding,
							labelX - padding,
							labelY + padding - cornerRadius,
							cornerRadius
						);
						this.ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
						this.ctx.arcTo(
							labelX - padding,
							labelY - fontSize - padding,
							labelX - padding + cornerRadius,
							labelY - fontSize - padding,
							cornerRadius
						);
						this.ctx.closePath();
						this.ctx.fill();

						// Dark gold border
						this.ctx.strokeStyle = '#D4A700';
						this.ctx.lineWidth = 1;
						this.ctx.stroke();

						// Text in black for better contrast with yellow
						this.ctx.fillStyle = 'black';
						this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
						this.ctx.shadowBlur = 2;
						this.ctx.shadowOffsetX = 1;
						this.ctx.shadowOffsetY = 1;
						this.ctx.fillText(labelText, labelX, labelY);
						this.ctx.restore();

						this.ctx.restore();
					}
				}
			}

			// Draw selected box (if any) on top of everything
			if (
			  this.bboxes &&
			  Array.isArray(this.bboxes.boxes) &&
			  typeof this.selectedBboxIndex === 'number' &&
			  this.selectedBboxIndex >= 0 &&
			  this.selectedBboxIndex < this.bboxes.boxes.length
			) {
			  // Save context to re-draw the selected box
			  this.ctx.save();

			  const box = this.bboxes.boxes[this.selectedBboxIndex];

			  // Check if this is an uncertain box by flag or label
			  const isUncertain = (this.bboxes.uncertain_flags &&
                                 this.bboxes.uncertain_flags[this.selectedBboxIndex]) ||
								 (this.bboxes.labels &&
                                 this.bboxes.labels[this.selectedBboxIndex] === -1);

			  if (isUncertain) {
				  // Yellow for uncertain boxes
				  this.ctx.strokeStyle = '#caa109';
			  } else {
				  // Regular color for normal boxes (usually blue)
				  this.ctx.strokeStyle = '#2196F3';
			  }

			  this.ctx.lineWidth = 3;
			  this.ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

			  // Prepare label text based on whether it's uncertain or normal
			  let labelText;

			  if (isUncertain) {
				  labelText = "Not Sure";
			  } else {
				  // Get regular label info
				  let labelId = 0;
				  if (this.bboxes.labels && this.bboxes.labels[this.selectedBboxIndex] !== undefined) {
					labelId = this.bboxes.labels[this.selectedBboxIndex];
				  }
				  const labelName =
					this.classLabels && this.classLabels[labelId] ? this.classLabels[labelId] : labelId;
				  labelText = `${labelId} - ${labelName}`;
			  }

			  // Calculate label position similarly to the original drawing code
			  const isAtTopEdge = box[1] <= 5;
			  const labelX = box[0] + 5;
			  const labelY = isAtTopEdge ? box[1] + 20 : box[1] - 5;

			  // Save context for label drawing
			  this.ctx.save();
			  const fontSize = 14;
			  const padding = 4;
			  this.ctx.font = `bold ${fontSize}px Arial, sans-serif`;
			  const textWidth = this.ctx.measureText(labelText).width;
			  const cornerRadius = 3;

			  // Draw label background with different color based on box type
			  if (isUncertain) {
				this.ctx.fillStyle = 'rgba(255, 204, 0, 0.85)'; // Yellow for uncertain
			  } else {
				this.ctx.fillStyle = 'rgba(33, 150, 243, 0.85)'; // Blue for normal
			  }

			  this.ctx.beginPath();
			  this.ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
			  this.ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
			  this.ctx.arcTo(
				labelX + textWidth + padding,
				labelY - fontSize - padding,
				labelX + textWidth + padding,
				labelY - fontSize - padding + cornerRadius,
				cornerRadius
			  );
			  this.ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
			  this.ctx.arcTo(
				labelX + textWidth + padding,
				labelY + padding,
				labelX + textWidth + padding - cornerRadius,
				labelY + padding,
				cornerRadius
			  );
			  this.ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
			  this.ctx.arcTo(
				labelX - padding,
				labelY + padding,
				labelX - padding,
				labelY + padding - cornerRadius,
				cornerRadius
			  );
			  this.ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
			  this.ctx.arcTo(
				labelX - padding,
				labelY - fontSize - padding,
				labelX - padding + cornerRadius,
				labelY - fontSize - padding,
				cornerRadius
			  );
			  this.ctx.closePath();
			  this.ctx.fill();

			  // Draw subtle border around label background
			  if (isUncertain) {
				this.ctx.strokeStyle = '#D4A700'; // Dark gold for uncertain
				this.ctx.fillStyle = 'black'; // Black text for uncertain (better contrast with yellow)
			  } else {
				this.ctx.strokeStyle = '#1565C0'; // Dark blue for normal
				this.ctx.fillStyle = 'white'; // White text for normal
			  }

			  this.ctx.lineWidth = 1;
			  this.ctx.stroke();

			  // Draw the class label text with shadow for readability
			  this.ctx.shadowColor = isUncertain ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
			  this.ctx.shadowBlur = 2;
			  this.ctx.shadowOffsetX = 1;
			  this.ctx.shadowOffsetY = 1;
			  this.ctx.fillText(labelText, labelX, labelY);
			  this.ctx.restore();

			  // Restore the canvas context
			  this.ctx.restore();
			}

			// Draw temporary box if in drawing mode
			if (inlineEditor.isDrawing && inlineEditor.tempBox) {
			  // Use green for temporary box in normal mode, yellow in uncertainty mode
			  this.ctx.strokeStyle = (inlineEditor.uncertaintyMode || window.uncertaintyMode) ? '#FFCC00' : '#00FF00';
			  this.ctx.lineWidth = 2;
			  this.ctx.strokeRect(
				inlineEditor.tempBox[0],
				inlineEditor.tempBox[1],
				inlineEditor.tempBox[2] - inlineEditor.tempBox[0],
				inlineEditor.tempBox[3] - inlineEditor.tempBox[1]
			  );
			}
		};

		// Initialize UI
		setupEnhancedClassSelector(); // Use the new enhanced class selector instead
		updateBboxSelector();
		setupEventHandlers();

		// Setup image interactions - only if we found the canvas
		if (inlineEditor.canvasElement) {
			setupCanvasInteraction(inlineEditor.canvasElement);
		}

		// Update the hidden field with initial bbox data
		updateHiddenBboxesField();

		inlineEditor.initialized = true;
		debug('Inline editor initialized and connected to main editor');
	}

	// Setup event handlers for UI controls
	function setupEventHandlers() {
		// Delete box button
		if (deleteBoxBtn) {
			deleteBoxBtn.addEventListener('click', deleteCurrentBox);
		}

		if (deleteAllBtn) {
			deleteAllBtn.addEventListener('click', deleteAllBBoxes);
		}

		// Cancel changes button
		if (cancelBtn) {
			cancelBtn.addEventListener('click', cancelChanges);
		}

		// Bbox selector dropdown
		if (inlineBboxSelector) {
			inlineBboxSelector.addEventListener('change', function(e) {
				const selectedIndex = parseInt(e.target.value);
				if (!isNaN(selectedIndex) && selectedIndex >= 0) {
					selectBox(selectedIndex);
				}
			});
		}
	}

	// Setup the enhanced class selector with integrated search
	function setupEnhancedClassSelector() {
		// Find the container for the class selector (or create it if needed)
		let classInputGroup = document.querySelector('.control-group');
		if (!classInputGroup) {
			classInputGroup = document.createElement('div');
			classInputGroup.className = 'control-group';
			const controlButtons = document.querySelector('.control-buttons');
			if (controlButtons) {
				controlButtons.parentNode.insertBefore(classInputGroup, controlButtons);
			} else {
				const container = document.querySelector('.editor-controls');
				if (container) {
					container.appendChild(classInputGroup);
				}
			}
		}

		// Clear any previous elements related to class selection
		// but check first if they already exist to avoid removing other controls
		const existingClassSelector = document.getElementById('inline-class-selector');
		const existingClassSearch = document.getElementById('inline-class-search');

		if (existingClassSelector) {
			existingClassSelector.remove();
		}

		if (existingClassSearch) {
			existingClassSearch.parentElement.remove();
		}

		// Create the custom class selector - a container for the UI
		const customSelector = document.createElement('div');
		customSelector.className = 'custom-class-selector';

		// Create the actual input field
		const inputField = document.createElement('input');
		inputField.type = 'text';
		inputField.id = 'inline-class-search';
		inputField.className = 'class-search-input';
		inputField.placeholder = 'Search for class...';
		inputField.autocomplete = 'off';

		// Add the dropdown icon
		const dropdownIcon = document.createElement('div');
		dropdownIcon.className = 'dropdown-icon';
		dropdownIcon.innerHTML = '▼';

		// Create the dropdown content container
		const dropdownContent = document.createElement('div');
		dropdownContent.className = 'dropdown-content';

		// Create the hidden select element that maintains the actual selection
		const hiddenSelect = document.createElement('select');
		hiddenSelect.id = 'inline-class-selector';

		// Add special option for uncertain boxes
		const uncertainOption = document.createElement('option');
		uncertainOption.value = "-1";
		uncertainOption.textContent = "Not Sure";
		hiddenSelect.appendChild(uncertainOption);

		// Build the options and populate both the hidden select and dropdown content
		if (inlineEditor.classLabels && Object.keys(inlineEditor.classLabels).length > 0) {
			// If we have class labels, use them
			const sortedClassIds = Object.keys(inlineEditor.classLabels).sort((a, b) => parseInt(a) - parseInt(b));

			sortedClassIds.forEach(classId => {
				// Skip -1 as we've already added it
				if (parseInt(classId) === -1) return;

				// Create option for the hidden select
				const option = document.createElement('option');
				option.value = classId;
				option.textContent = `${classId} - ${inlineEditor.classLabels[classId]}`;
				hiddenSelect.appendChild(option);

				// Create corresponding item for the dropdown
				const item = document.createElement('div');
				item.className = 'dropdown-item';
				item.dataset.value = classId;
				item.textContent = `${classId} - ${inlineEditor.classLabels[classId]}`;
				item.dataset.searchtext = `${classId} ${inlineEditor.classLabels[classId]}`.toLowerCase();

				dropdownContent.appendChild(item);
			});
		} else {
			// Otherwise create generic options 0-999
			for (let i = 0; i < 1000; i++) {
				// Skip -1 as we've already added it
				if (i === -1) continue;

				// Create option for the hidden select
				const option = document.createElement('option');
				option.value = i;
				option.textContent = `Class ${i}`;
				hiddenSelect.appendChild(option);

				// Create corresponding item for the dropdown
				const item = document.createElement('div');
				item.className = 'dropdown-item';
				item.dataset.value = i.toString();
				item.textContent = `Class ${i}`;
				item.dataset.searchtext = `${i} class ${i}`.toLowerCase();

				dropdownContent.appendChild(item);
			}
		}

		// Add all elements to the DOM
		customSelector.appendChild(inputField);
		customSelector.appendChild(dropdownIcon);
		customSelector.appendChild(dropdownContent);
		classInputGroup.appendChild(customSelector);
		classInputGroup.appendChild(hiddenSelect);

		// Set the initial value if we have a valid box index
		if (inlineEditor.currentBoxIndex >= 0 &&
			inlineEditor.bboxes &&
			inlineEditor.bboxes.labels &&
			inlineEditor.currentBoxIndex < inlineEditor.bboxes.labels.length) {

			const labelId = inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex];

			// Special handling for uncertain boxes (labeled as -1)
			if (labelId === -1) {
				inputField.value = "Not Sure";
				inputField.disabled = true;
				hiddenSelect.value = "-1";
			} else {
				// Regular box
				hiddenSelect.value = labelId.toString();

				if (inlineEditor.classLabels && inlineEditor.classLabels[labelId]) {
					inputField.value = `${labelId} - ${inlineEditor.classLabels[labelId]}`;
				} else {
					inputField.value = `Class ${labelId}`;
				}
			}
		}

		// Show/hide dropdown when input field is clicked
		inputField.addEventListener('click', () => {
			dropdownContent.style.display = dropdownContent.style.display === 'none' ? 'block' : 'none';
		});

		// Close dropdown when clicking outside
		document.addEventListener('click', (e) => {
			if (!customSelector.contains(e.target)) {
				dropdownContent.style.display = 'none';
			}
		});

		// Filter dropdown items on input
		inputField.addEventListener('input', (e) => {
			const searchTerm = e.target.value.toLowerCase();
			const items = dropdownContent.querySelectorAll('.dropdown-item');

			// Show dropdown when typing
			dropdownContent.style.display = 'block';

			let matchFound = false;
			let firstMatchValue = null;

			items.forEach(item => {
				const searchText = item.dataset.searchtext;
				if (searchText.includes(searchTerm)) {
					item.style.display = 'block';
					if (!matchFound) {
						matchFound = true;
						firstMatchValue = item.dataset.value;
						item.classList.add('selected');
					} else {
						item.classList.remove('selected');
					}
				} else {
					item.style.display = 'none';
					item.classList.remove('selected');
				}
			});

			// Update the selection immediately on the first match
			if (matchFound && inlineEditor.currentBoxIndex >= 0 &&
				inlineEditor.bboxes && inlineEditor.bboxes.labels &&
				inlineEditor.currentBoxIndex < inlineEditor.bboxes.labels.length) {

				const newClassId = parseInt(firstMatchValue);
				hiddenSelect.value = firstMatchValue;
				inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex] = newClassId;

				// Update gt field if it exists
				if (inlineEditor.bboxes.gt && inlineEditor.currentBoxIndex < inlineEditor.bboxes.gt.length) {
					inlineEditor.bboxes.gt[inlineEditor.currentBoxIndex] = newClassId;
					debug(`Updated gt[${inlineEditor.currentBoxIndex}] to class ${newClassId}`);
				}

				// Update the UI to show the class change
				updateBboxSelector();

				// Update the main editor if available
				if (inlineEditor.editor) {
					inlineEditor.editor.redrawCanvas();
				}

				// Update hidden field for form submission
				updateHiddenBboxesField();
			}
		});

		// Handle click on dropdown items
		dropdownContent.querySelectorAll('.dropdown-item').forEach(item => {
			item.addEventListener('click', () => {
				const selectedValue = item.dataset.value;
				const selectedText = item.textContent;

				// Update input field with selected text
				inputField.value = selectedText;

				// Update hidden select value
				hiddenSelect.value = selectedValue;

				// Hide dropdown
				dropdownContent.style.display = 'none';

				// Update the bbox class if one is selected
				if (inlineEditor.currentBoxIndex >= 0 &&
					inlineEditor.bboxes && inlineEditor.bboxes.labels &&
					inlineEditor.currentBoxIndex < inlineEditor.bboxes.labels.length) {

					const newClassId = parseInt(selectedValue);
					inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex] = newClassId;

					// Update gt field if it exists
					if (inlineEditor.bboxes.gt && inlineEditor.currentBoxIndex < inlineEditor.bboxes.gt.length) {
						inlineEditor.bboxes.gt[inlineEditor.currentBoxIndex] = newClassId;
						debug(`Updated gt[${inlineEditor.currentBoxIndex}] to class ${newClassId}`);
					}

					// Update the UI
					updateBboxSelector();

					// Update the main editor
					if (inlineEditor.editor) {
						inlineEditor.editor.redrawCanvas();
					}

					// Update hidden field for form submission
					updateHiddenBboxesField();
				}
			});
		});

		// Add keyboard navigation
		inputField.addEventListener('keydown', (e) => {
			if (dropdownContent.style.display === 'block') {
				const items = Array.from(dropdownContent.querySelectorAll('.dropdown-item')).filter(
					item => item.style.display !== 'none'
				);
				const selectedItem = dropdownContent.querySelector('.dropdown-item.selected');
				const selectedIndex = selectedItem ? items.indexOf(selectedItem) : -1;

				if (e.key === 'ArrowDown') {
					e.preventDefault();
					if (items.length > 0) {
						// Remove current selection
						if (selectedItem) {
							selectedItem.classList.remove('selected');
						}

						// Select next item (or first if none selected)
						const nextIndex = selectedIndex < 0 || selectedIndex >= items.length - 1 ? 0 : selectedIndex + 1;
						items[nextIndex].classList.add('selected');
						items[nextIndex].scrollIntoView({ block: 'nearest' });
					}
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					if (items.length > 0) {
						// Remove current selection
						if (selectedItem) {
							selectedItem.classList.remove('selected');
						}

						// Select previous item (or last if none selected)
						const prevIndex = selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
						items[prevIndex].classList.add('selected');
						items[prevIndex].scrollIntoView({ block: 'nearest' });
					}
				} else if (e.key === 'Enter') {
					e.preventDefault();
					if (selectedItem) {
						selectedItem.click();
					} else if (items.length === 1) {
						// If only one item visible, select it
						items[0].click();
					}
				} else if (e.key === 'Escape') {
					e.preventDefault();
					dropdownContent.style.display = 'none';
				}
			}
		});

		debug('Enhanced class selector with integrated search set up');
	}

	// Update box selector dropdown
	function updateBboxSelector() {
		if (!inlineBboxSelector || !inlineEditor.bboxes) return;

		// Clear existing options
		inlineBboxSelector.innerHTML = '';

		// Add default option
		const defaultOption = document.createElement('option');
		defaultOption.value = "-1";
		defaultOption.text = "-- Select a box --";
		inlineBboxSelector.appendChild(defaultOption);


		// Add options for each box
		if (inlineEditor.bboxes.boxes && inlineEditor.bboxes.scores) {
			inlineEditor.bboxes.boxes.forEach((_, i) => {
				const option = document.createElement('option');
				option.value = i;

				// Check if this is an uncertain box - by flag or by label value of -1
				const isUncertain = (inlineEditor.bboxes.uncertain_flags &&
                                   inlineEditor.bboxes.uncertain_flags[i]) ||
								   (inlineEditor.bboxes.labels &&
                                   inlineEditor.bboxes.labels[i] === -1);

				let labelText = `Box ${i + 1}`;

				if (isUncertain) {
					// For uncertain boxes, just show "Not Sure"
					labelText = `Box ${i + 1}: Not Sure`;
				} else if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] !== undefined) {
					// For normal boxes, show the class name
					const labelId = inlineEditor.bboxes.labels[i];
					const labelName = inlineEditor.classLabels[labelId] || `Class ${labelId}`;
					labelText = `Box ${i + 1}: ${labelId} - ${labelName}`;
				}

				option.text = labelText;
				option.selected = i === inlineEditor.currentBoxIndex;
				inlineBboxSelector.appendChild(option);
			});
		}

		// Update selected value
		if (inlineEditor.currentBoxIndex >= 0) {
			inlineBboxSelector.value = inlineEditor.currentBoxIndex;
		} else {
			inlineBboxSelector.value = "-1";
		}
	}

	// Select a box
	function selectBox(boxIndex) {
		inlineEditor.currentBoxIndex = boxIndex;

		if (inlineEditor.editor) {
			inlineEditor.editor.selectedBboxIndex = boxIndex;
			inlineEditor.editor.redrawCanvas();
		}

		// Debug selected box and its label
		if (boxIndex >= 0 && inlineEditor.bboxes && inlineEditor.bboxes.labels) {
			debug(`Selected box ${boxIndex} with label: ${inlineEditor.bboxes.labels[boxIndex]}`);
		}

		// Update the checkbox based on crowd flag
		updateCrowdCheckbox(boxIndex);

		// Check if this is an uncertain box - either by flag or by label value
		const isUncertain = (inlineEditor.bboxes.uncertain_flags &&
							 inlineEditor.bboxes.uncertain_flags[boxIndex]) ||
							 (inlineEditor.bboxes.labels &&
							 inlineEditor.bboxes.labels[boxIndex] === -1);

		// Make sure the correct class is selected in the enhanced UI
		if (boxIndex >= 0) {
			// Handle differently based on whether it's uncertain or not
			if (isUncertain) {
				// For uncertain boxes, disable class selector and show "Not Sure"
				const searchInput = document.getElementById('inline-class-search');
				if (searchInput) {
					searchInput.value = "Not Sure";
					searchInput.disabled = true;
					debug('Set class search input to "Not Sure" and disabled for uncertain box');
				}

				// Set hidden select value
				const hiddenSelect = document.getElementById('inline-class-selector');
				if (hiddenSelect) {
					hiddenSelect.value = "-1"; // Special value for uncertain
				}

				// Close dropdown for uncertain boxes
				const dropdownContent = document.querySelector('.dropdown-content');
				if (dropdownContent) {
					dropdownContent.style.display = 'none';
				}
			} else if (inlineEditor.bboxes.labels && boxIndex < inlineEditor.bboxes.labels.length) {
				// For normal boxes, update with the actual class
				const labelId = inlineEditor.bboxes.labels[boxIndex];

				// Update the hidden select
				const hiddenSelect = document.getElementById('inline-class-selector');
				if (hiddenSelect) {
					hiddenSelect.value = labelId.toString();
				}

				// Update the visible input field
				const searchInput = document.getElementById('inline-class-search');
				if (searchInput) {
					searchInput.disabled = false; // Make sure it's enabled
					let displayText;
					if (inlineEditor.classLabels && inlineEditor.classLabels[labelId]) {
						displayText = `${labelId} - ${inlineEditor.classLabels[labelId]}`;
					} else {
						displayText = `Class ${labelId}`;
					}
					searchInput.value = displayText;
					debug(`Set class search input to: ${displayText}`);

					// Close dropdown when selecting a box
					const dropdownContent = document.querySelector('.dropdown-content');
					if (dropdownContent) {
						dropdownContent.style.display = 'none';

						// Update which item is marked as selected in the dropdown
						// First, remove the 'selected' class from all items
						const allItems = dropdownContent.querySelectorAll('.dropdown-item');
						allItems.forEach(item => {
							item.classList.remove('selected');
						});

						// Now add the 'selected' class to the matching item
						const selectedItem = dropdownContent.querySelector(`.dropdown-item[data-value="${labelId}"]`);
						if (selectedItem) {
							selectedItem.classList.add('selected');
							debug(`Updated dropdown selected item to class ${labelId}`);
						}
					}
				}
			}
		}

		debug(`Selected box ${boxIndex}`);
	}

	if (inlineCrowdCheckbox) {
		inlineCrowdCheckbox.addEventListener('change', handleCrowdCheckboxChange);
	}

	function handleCrowdCheckboxChange() {
		if (inlineEditor.currentBoxIndex < 0) return;

		// Update the crowd_flags array based on the checkbox state
		inlineEditor.bboxes.crowd_flags[inlineEditor.currentBoxIndex] = inlineCrowdCheckbox.checked;

		// Also update the checkbox in the advanced editor if it's open
		const advancedCrowdCheckbox = document.getElementById('bbox-crowd-checkbox');
		if (advancedCrowdCheckbox) {
			advancedCrowdCheckbox.checked = inlineCrowdCheckbox.checked;
			debug(`Synced advanced crowd checkbox to: ${inlineCrowdCheckbox.checked}`);
		}

		// Update hidden form field
		updateHiddenBboxesField();

		debug(`Updated crowd flag for box ${inlineEditor.currentBoxIndex} to: ${inlineCrowdCheckbox.checked}`);
	}

	function updateCrowdCheckbox(boxIndex) {
		if (inlineCrowdCheckbox && inlineEditor.bboxes.crowd_flags) {
			inlineCrowdCheckbox.checked = inlineEditor.bboxes.crowd_flags[boxIndex];
			debug(`Set crowd checkbox to: ${inlineCrowdCheckbox.checked}`);

			// Also update the advanced editor's checkbox if it exists
			const advancedCrowdCheckbox = document.getElementById('bbox-crowd-checkbox');
			if (advancedCrowdCheckbox) {
				advancedCrowdCheckbox.checked = inlineEditor.bboxes.crowd_flags[boxIndex];
				debug(`Synced advanced crowd checkbox to: ${inlineEditor.bboxes.crowd_flags[boxIndex]}`);
			}
		}
	}

	// Delete the current box
	function deleteCurrentBox() {
		if (inlineEditor.currentBoxIndex < 0 || !inlineEditor.bboxes ||
			inlineEditor.currentBoxIndex >= inlineEditor.bboxes.boxes.length) {
			debug('No box selected for deletion');
			return;
		}

		const deletedIndex = inlineEditor.currentBoxIndex;

		// Remove box, score, label, and flags
		inlineEditor.bboxes.boxes.splice(deletedIndex, 1);
		inlineEditor.bboxes.scores.splice(deletedIndex, 1);

		if (inlineEditor.bboxes.labels) {
			inlineEditor.bboxes.labels.splice(deletedIndex, 1);
		}

		// Remove crowd flag if it exists
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags.splice(deletedIndex, 1);
		}

		// Remove uncertain flag and possible_labels if they exist
		if (inlineEditor.bboxes.uncertain_flags) {
			inlineEditor.bboxes.uncertain_flags.splice(deletedIndex, 1);
		}

		if (inlineEditor.bboxes.possible_labels) {
			inlineEditor.bboxes.possible_labels.splice(deletedIndex, 1);
		}

		// Also remove from gt if it exists
		if (inlineEditor.bboxes.gt) {
			inlineEditor.bboxes.gt.splice(deletedIndex, 1);
		}

		// Reset selection
		inlineEditor.currentBoxIndex = -1;

		// Update the editor if available
		if (inlineEditor.editor) {
			inlineEditor.editor.selectedBboxIndex = -1;
			inlineEditor.editor.bboxes = inlineEditor.bboxes;
			inlineEditor.editor.redrawCanvas();
		}

		// Update UI
		updateBboxSelector();

		// Update hidden form field
		updateHiddenBboxesField();

		debug(`Deleted box ${deletedIndex}`);
	}

	function deleteAllBBoxes() {
		if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes) {
			debug('No bounding boxes to delete');
			return;
		}

		// Clear all bounding boxes, scores, labels, and flags
				inlineEditor.bboxes.boxes = [];
		inlineEditor.bboxes.scores = [];
		if (inlineEditor.bboxes.labels) {
			inlineEditor.bboxes.labels = [];
		}
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags = [];
		}
		if (inlineEditor.bboxes.uncertain_flags) {
			inlineEditor.bboxes.uncertain_flags = [];
		}
		if (inlineEditor.bboxes.possible_labels) {
			inlineEditor.bboxes.possible_labels = [];
		}
		if (inlineEditor.bboxes.gt) {
			inlineEditor.bboxes.gt = [];
		}

		// Reset label_type to basic when all boxes are deleted
		const labelTypeField = document.getElementById('label_type');
		if (labelTypeField) {
			labelTypeField.value = "basic";
		}

		// Reset selection
		inlineEditor.currentBoxIndex = -1;

		// Update the editor if available
		if (inlineEditor.editor) {
			inlineEditor.editor.selectedBboxIndex = -1;
			inlineEditor.editor.bboxes = inlineEditor.bboxes;
			inlineEditor.editor.redrawCanvas();
		}

		// Update UI
		updateBboxSelector();

		// Update hidden form field
		updateHiddenBboxesField();

		debug('Deleted all bounding boxes');
	}

	// Cancel all changes
	function cancelChanges() {
		if (!inlineEditor.originalBboxes) {
			debug('No original bboxes to restore');
			return;
		}

		// Restore original bboxes
		inlineEditor.bboxes = JSON.parse(JSON.stringify(inlineEditor.originalBboxes));

		// Reset selection
		inlineEditor.currentBoxIndex = -1;

		// Reset uncertainty mode
		inlineEditor.uncertaintyMode = false;
		window.uncertaintyMode = false;
		removeUncertaintyModeIndicator();

		// Update the editor
		if (inlineEditor.editor) {
			inlineEditor.editor.selectedBboxIndex = -1;
			inlineEditor.editor.bboxes = inlineEditor.bboxes;
			inlineEditor.editor.redrawCanvas();
		}

		// Update UI
		updateBboxSelector();

		// Update hidden form field
		updateHiddenBboxesField();

		debug('Cancelled all changes');
	}

	// Update class of selected box
	function updateSelectedBoxClass(classId) {
		if (inlineEditor.currentBoxIndex < 0 || !inlineEditor.bboxes ||
			inlineEditor.currentBoxIndex >= inlineEditor.bboxes.boxes.length) {
			return;
		}

		// Check if this is an uncertain box - don't update class for uncertain boxes
		const isUncertain = inlineEditor.bboxes.uncertain_flags &&
							inlineEditor.bboxes.uncertain_flags[inlineEditor.currentBoxIndex];

		if (isUncertain) {
			debug(`Box ${inlineEditor.currentBoxIndex} is uncertain - class update skipped`);
			return;
		}

		// Ensure labels array exists
		if (!inlineEditor.bboxes.labels) {
			inlineEditor.bboxes.labels = Array(inlineEditor.bboxes.boxes.length).fill(0);
			debug('Created missing labels array during class update');
		}

		// Update the class
		inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex] = classId;

		// If there's a "gt" field, update it too to keep them in sync
		if (inlineEditor.bboxes.gt) {
			inlineEditor.bboxes.gt[inlineEditor.currentBoxIndex] = classId;
			debug(`Updated gt field for box ${inlineEditor.currentBoxIndex} to class ${classId}`);
		}

		// Update the editor
		if (inlineEditor.editor) {
			inlineEditor.editor.bboxes = inlineEditor.bboxes;
			inlineEditor.editor.redrawCanvas();
		}

		// Update UI
		updateBboxSelector();

		// Update hidden field
		updateHiddenBboxesField();

		debug(`Updated box ${inlineEditor.currentBoxIndex} class to ${classId}`);
	}

	// Save boxes via AJAX
	function saveBboxes() {
		// Get the current image name
		const imageNameInput = document.querySelector('input[name="image_name"]');
		const imageName = imageNameInput ? imageNameInput.value : 'unknown';

		// Get username from URL
		const pathParts = window.location.pathname.split('/');
		const username = pathParts[1]; // Assuming URL structure is /<username>/label

		// Format data for saving
		let bboxDataArray = [];

		if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes || !inlineEditor.bboxes.scores) {
			console.error('Invalid bboxes data structure:', inlineEditor.bboxes);
			return;
		}

		// Determine if we have any uncertain boxes
		let hasUncertainBoxes = false;
		if (inlineEditor.bboxes.uncertain_flags) {
			hasUncertainBoxes = inlineEditor.bboxes.uncertain_flags.some(flag => flag === true);
		}

        // Also check for -1 label values which indicate uncertain boxes
        if (!hasUncertainBoxes && inlineEditor.bboxes.labels) {
            hasUncertainBoxes = inlineEditor.bboxes.labels.some(label => label === -1);
        }

		// Set the label_type based on whether we have uncertain boxes
		const labelTypeField = document.getElementById('label_type');
		if (labelTypeField) {
			labelTypeField.value = hasUncertainBoxes ? "uncertain" : "basic";
		}

		inlineEditor.bboxes.boxes.forEach((box, i) => {
			// Check if this box is uncertain - by flag or by label value
			const isUncertain = (inlineEditor.bboxes.uncertain_flags && inlineEditor.bboxes.uncertain_flags[i]) ||
                             (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] === -1);

			let bboxData = {
				coordinates: box,
				crowd_flag: inlineEditor.bboxes.crowd_flags && inlineEditor.bboxes.crowd_flags[i]
			};

			if (isUncertain) {
				// For uncertain boxes, include possible_labels and uncertain_flag
				bboxData.uncertain_flag = true;

				// Get possible_labels array (ensure it's a simple array of integers)
				if (inlineEditor.bboxes.possible_labels && inlineEditor.bboxes.possible_labels[i]) {
					const possibleLabels = inlineEditor.bboxes.possible_labels[i];
					// Ensure it's a simple array of integers
					if (Array.isArray(possibleLabels)) {
						bboxData.possible_labels = possibleLabels;
					} else {
						// Try to convert from object if necessary
						const labelArray = [];
						for (const key in possibleLabels) {
							if (possibleLabels.hasOwnProperty(key)) {
								labelArray.push(parseInt(key));
							}
						}
						bboxData.possible_labels = labelArray;
					}
				} else {
					bboxData.possible_labels = []; // Empty array as fallback
				}

                // Also set label to -1 for uncertain boxes
                bboxData.label = -1;
			} else {
				// For regular boxes, include label
				let label = 0;
				if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] !== undefined) {
					label = inlineEditor.bboxes.labels[i];
				} else if (inlineEditor.bboxes.gt && inlineEditor.bboxes.gt[i] !== undefined) {
					label = inlineEditor.bboxes.gt[i];
				}

				bboxData.label = label;
			}

			bboxDataArray.push(bboxData);
		});

		// Create the object with image_name, bboxes, and label_type
		const saveData = {
			image_name: imageName,
			bboxes: bboxDataArray,
			label_type: labelTypeField ? labelTypeField.value : "basic"
		};

		debug(`Saving ${bboxDataArray.length} bboxes with label_type: ${saveData.label_type}`);
		debug(`Save data preview: ${JSON.stringify(saveData).substring(0, 200)}...`);

		// Make AJAX call
		fetch(`/${username}/save_bboxes`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(saveData)
		})
		.then(response => {
			if (!response.ok) {
				throw new Error('Failed to save bboxes');
			}
			return response.json();
		})
		.then(data => {
			debug('Bboxes saved successfully via Ajax');

			// Update the hidden field for form submission
			updateHiddenBboxesField();

			// Update the original bboxes after a successful save
			inlineEditor.originalBboxes = JSON.parse(JSON.stringify(inlineEditor.bboxes));
		})
		.catch(error => {
			console.error('Error saving bboxes:', error);
			showCenterNotification('Error Saving', 'Failed to save bounding boxes. Please try again.');
		});
	}

	// Setup direct interaction with the canvas element
	function setupCanvasInteraction(canvasElement) {
		if (!canvasElement) {
			console.error('No canvas element provided for interaction setup');
			return;
		}

		debug('Setting up canvas interaction handlers');

		// Track if we're in an active operation (drawing/dragging/resizing)
		let isActiveOperation = false;

		// Helper function to get canvas coordinates
		function getCanvasCoordinates(event) {
			const rect = canvasElement.getBoundingClientRect();

			// Calculate scaling factor - use the canvas dimensions
			const scaleX = canvasElement.width / rect.width;
			const scaleY = canvasElement.height / rect.height;

			// Calculate position relative to the canvas
			let x = (event.clientX - rect.left) * scaleX;
			let y = (event.clientY - rect.top) * scaleY;

			// Constrain to canvas boundaries
			x = Math.max(0, Math.min(canvasElement.width, x));
			y = Math.max(0, Math.min(canvasElement.height, y));

			return { x, y };
		}

		// Mouse down - start drawing or selection
		canvasElement.addEventListener('mousedown', function(e) {
			e.preventDefault();

			// Set flag that we're in an active operation
			isActiveOperation = true;

			// Get coordinates
			const coords = getCanvasCoordinates(e);

			// Check if we clicked on an existing box
			const result = findBoxUnderCursor(coords.x, coords.y);

			if (result.found) {
				// We clicked on a box border or corner
				if (result.isCorner) {
					// Start resizing
					startResizing(result.index, result.corner, coords);
				} else if (result.isBorder) {
					// Start dragging
					startDragging(result.index, coords);
				}
				// We no longer have an option for interior clicks - only borders/corners
			} else {
				// Start drawing a new box
				startDrawing(coords);
			}
		});

		// Add mousemove listener to document to catch events outside canvas
		document.addEventListener('mousemove', function(e) {
			if (!inlineEditor.bboxes || !isActiveOperation) return;

			// Convert global coordinates to canvas coordinates
			const rect = canvasElement.getBoundingClientRect();

			// Calculate relative position and scale
			let x = (e.clientX - rect.left) * (canvasElement.width / rect.width);
			let y = (e.clientY - rect.top) * (canvasElement.height / rect.height);

			// Constrain to canvas boundaries
			x = Math.max(0, Math.min(canvasElement.width, x));
			y = Math.max(0, Math.min(canvasElement.height, y));

			const coords = { x, y };

			if (inlineEditor.isDrawing) {
				// Update drawing
				updateDrawing(coords);
			} else if (inlineEditor.isDragging) {
				// Update dragging
				updateDragging(coords);
			} else if (inlineEditor.isResizing) {
				// Update resizing
				updateResizing(coords);
			}
		});

		// The original canvas mousemove for cursor updates
		canvasElement.addEventListener('mousemove', function(e) {
			if (!inlineEditor.bboxes) return;

			const coords = getCanvasCoordinates(e);

			if (!isActiveOperation) {
				// Only update cursor when not in an active operation
				updateCursor(coords, canvasElement);
			}
		});

		// Mouse up - finish drawing/dragging/resizing
		document.addEventListener('mouseup', function() {
			if (!isActiveOperation) return;

			isActiveOperation = false;

			if (inlineEditor.isDrawing) {
				// Finish drawing
				finishDrawing();
			} else if (inlineEditor.isDragging) {
				// Finish dragging
				finishDragging();
			} else if (inlineEditor.isResizing) {
				// Finish resizing
				finishResizing();
			}
		});

		// Find box under cursor with detection for corners and borders
		// Only detect borders and corners, not interior clicks
		function findBoxUnderCursor(x, y) {
			const result = {
				found: false,
				index: -1,
				isCorner: false,
				isBorder: false,
				corner: null
			};

			if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes) return result;

			// Check corners of selected box first (for resizing)
			if (inlineEditor.currentBoxIndex >= 0 &&
				inlineEditor.currentBoxIndex < inlineEditor.bboxes.boxes.length) {

				const box = inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex];
				const cornerResult = isNearCorner(x, y, box);

				if (cornerResult) {
					result.found = true;
					result.index = inlineEditor.currentBoxIndex;
					result.isCorner = true;
					result.corner = cornerResult;
					return result;
				}

				// Check borders
				if (isNearBorder(x, y, box)) {
					result.found = true;
					result.index = inlineEditor.currentBoxIndex;
					result.isBorder = true;
					return result;
				}
			}

			// Check all boxes from top to bottom (visual layers)
			// Only check borders and corners, not inside box
			for (let i = inlineEditor.bboxes.boxes.length - 1; i >= 0; i--) {

				const box = inlineEditor.bboxes.boxes[i];

				// First check corners
				const cornerResult = isNearCorner(x, y, box);
				if (cornerResult) {
					result.found = true;
					result.index = i;
					result.isCorner = true;
					result.corner = cornerResult;
					return result;
				}

				// Then check borders
				if (isNearBorder(x, y, box)) {
					result.found = true;
					result.index = i;
					result.isBorder = true;
					return result;
				}
			}

			return result;
		}

		// Check if point is near box corner
		function isNearCorner(x, y, box) {
			const threshold = 10;

			// Check top-left corner
			if (Math.abs(x - box[0]) <= threshold && Math.abs(y - box[1]) <= threshold) {
				return 'topLeft';
			}

			// Check top-right corner
			if (Math.abs(x - box[2]) <= threshold && Math.abs(y - box[1]) <= threshold) {
				return 'topRight';
			}

			// Check bottom-left corner
			if (Math.abs(x - box[0]) <= threshold && Math.abs(y - box[3]) <= threshold) {
				return 'bottomLeft';
			}

			// Check bottom-right corner
			if (Math.abs(x - box[2]) <= threshold && Math.abs(y - box[3]) <= threshold) {
				return 'bottomRight';
			}

			return null;
		}

		// Check if point is near box border
		function isNearBorder(x, y, box) {
			const threshold = 5; // Increased from previous version

			// Left border
			if (Math.abs(x - box[0]) <= threshold && y >= box[1] && y <= box[3]) {
				return true;
			}

			// Right border
			if (Math.abs(x - box[2]) <= threshold && y >= box[1] && y <= box[3]) {
				return true;
			}

			// Top border
			if (Math.abs(y - box[1]) <= threshold && x >= box[0] && x <= box[2]) {
				return true;
			}

			// Bottom border
			return Math.abs(y - box[3]) <= threshold && x >= box[0] && x <= box[2];
		}

		// Update cursor based on mouse position
		function updateCursor(coords, element) {
			if (!inlineEditor.bboxes || !inlineEditor.bboxes.boxes) return;

			const result = findBoxUnderCursor(coords.x, coords.y);

			if (result.found) {
				if (result.isCorner) {
					// Set resize cursor based on corner
					switch (result.corner) {
						case 'topLeft':
						case 'bottomRight':
							element.style.cursor = 'nwse-resize';
							break;
						case 'topRight':
						case 'bottomLeft':
							element.style.cursor = 'nesw-resize';
							break;
					}
				} else if (result.isBorder) {
					// Set move cursor
					element.style.cursor = 'move';
				}
			} else {
				// Default cursor for drawing new boxes
				element.style.cursor = 'crosshair';
			}
		}

		// Drawing operations
		function startDrawing(coords) {
			inlineEditor.isDrawing = true;
			inlineEditor.drawStartPos = coords;
			debug(`Started drawing at x=${coords.x}, y=${coords.y}`);

			// Change tempBox color in the redraw function if in uncertainty mode
			if (inlineEditor.uncertaintyMode || window.uncertaintyMode) {
				debug('Drawing in uncertainty mode');
			}
		}

		function updateDrawing(coords) {
			if (!inlineEditor.isDrawing) return;

			// Create temporary box for visual feedback
			inlineEditor.tempBox = [
				Math.min(inlineEditor.drawStartPos.x, coords.x),
				Math.min(inlineEditor.drawStartPos.y, coords.y),
				Math.max(inlineEditor.drawStartPos.x, coords.x),
				Math.max(inlineEditor.drawStartPos.y, coords.y)
			];

			// Redraw with temporary box
			if (inlineEditor.editor) {
				inlineEditor.editor.redrawCanvas();
			}
		}

		function finishDrawing() {
			if (!inlineEditor.isDrawing) return;

			// Only create box if we have a temporary box and it has reasonable size
			if (inlineEditor.tempBox) {
				const width = inlineEditor.tempBox[2] - inlineEditor.tempBox[0];
				const height = inlineEditor.tempBox[3] - inlineEditor.tempBox[1];

				if (width > 5 && height > 5) {
					// Capture uncertainty mode state
					const isUncertainMode = inlineEditor.uncertaintyMode || window.uncertaintyMode;

					// Add the new box coordinates and score
					// IMPORTANT: Create a new array to avoid referencing the same array
					const newBox = [...inlineEditor.tempBox]; // Create a new array with copied values

					// Calculate the index BEFORE pushing anything
					const newBoxIndex = inlineEditor.bboxes.boxes.length;

					// Add the new box
					inlineEditor.bboxes.boxes.push(newBox);
					inlineEditor.bboxes.scores.push(100);

					// Make sure arrays exist with proper length
					if (!inlineEditor.bboxes.crowd_flags) {
						inlineEditor.bboxes.crowd_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					}

					if (!inlineEditor.bboxes.uncertain_flags) {
						inlineEditor.bboxes.uncertain_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					}

					if (!inlineEditor.bboxes.possible_labels) {
						inlineEditor.bboxes.possible_labels = new Array(inlineEditor.bboxes.boxes.length).fill([]);
					}

					if (!inlineEditor.bboxes.labels) {
						inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length).fill(0);
					}

					// Handle differently based on uncertainty mode
					if (isUncertainMode) {
						// For uncertain boxes
						// Push new values to arrays (don't modify existing items)
						inlineEditor.bboxes.crowd_flags.push(false);
						inlineEditor.bboxes.uncertain_flags[newBoxIndex] = true;

						// Get selected classes for uncertainty
						let selectedClasses = [];
						if (inlineEditor.selectedUncertainClasses && inlineEditor.selectedUncertainClasses.length) {
							// Use a copy to avoid reference issues
							selectedClasses = [...inlineEditor.selectedUncertainClasses];
						} else if (window.selectedUncertainClasses && window.selectedUncertainClasses.length) {
							selectedClasses = [...window.selectedUncertainClasses];
						}

						// Push new array of possible labels (not modifying existing ones)
						inlineEditor.bboxes.possible_labels[newBoxIndex] = selectedClasses;

						// Push -1 for the label (uncertain box)
						inlineEditor.bboxes.labels[newBoxIndex] = -1;

						// Update gt field if it exists
						if (inlineEditor.bboxes.gt) {
							if (inlineEditor.bboxes.gt.length < newBoxIndex) {
								// Fill with zeros if needed
								while (inlineEditor.bboxes.gt.length < newBoxIndex) {
									inlineEditor.bboxes.gt.push(0);
								}
							}
							inlineEditor.bboxes.gt[newBoxIndex] = -1; // Add -1 for uncertain
						}

						// Don't set the global label_type here - it will be handled by updateHiddenBboxesField
						// which checks all boxes to determine if any are uncertain

						debug(`Created uncertain box at index ${newBoxIndex}`);

						// Reset uncertainty mode
						inlineEditor.uncertaintyMode = false;
						window.uncertaintyMode = false;
						removeUncertaintyModeIndicator();
						resetUncertaintyCheckboxes();
					} else {
						// For regular boxes
						// Push new values to arrays (don't modify existing items)
						inlineEditor.bboxes.crowd_flags.push(false);
						inlineEditor.bboxes.uncertain_flags.push(false);
						inlineEditor.bboxes.possible_labels.push([]);

						// Get class ID for the new box
						let classId = 0;
						if (typeof window.getClassForNewBBox === 'function') {
							classId = window.getClassForNewBBox();
						} else if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
							classId = parseInt(window.lastSelectedClassId);
						} else if (window.groundTruthClassId !== undefined && window.groundTruthClassId !== null) {
							classId = parseInt(window.groundTruthClassId);
						} else if (inlineEditor.lastSelectedClassId !== null) {
							classId = parseInt(inlineEditor.lastSelectedClassId);
						}

						// Push the class ID as the label
						inlineEditor.bboxes.labels.push(classId);

						// Update gt field if it exists
						if (inlineEditor.bboxes.gt) {
							if (inlineEditor.bboxes.gt.length < newBoxIndex) {
								// Fill with zeros if needed
								while (inlineEditor.bboxes.gt.length < newBoxIndex) {
									inlineEditor.bboxes.gt.push(0);
								}
							}
							inlineEditor.bboxes.gt.push(classId);
						}

						debug(`Created regular box at index ${newBoxIndex} with class ${classId}`);
					}

					// Select the new box
					inlineEditor.currentBoxIndex = newBoxIndex;

					if (inlineEditor.editor) {
						inlineEditor.editor.selectedBboxIndex = newBoxIndex;
					}

					// Update UI
					updateBboxSelector();
					updateCrowdCheckbox(newBoxIndex);

					// Select the box to update UI elements properly
					selectBox(newBoxIndex);

					// Update form data
					updateHiddenBboxesField();

					// Reset radio selection if needed
					if (typeof window.resetRadioSelection === 'function') {
						window.resetRadioSelection();
					}
				}
			}

			// Clean up drawing state
			inlineEditor.isDrawing = false;
			inlineEditor.tempBox = null;

			if (inlineEditor.editor) {
				inlineEditor.editor.redrawCanvas();
			}
		}

		// Dragging operations
		function startDragging(boxIndex, coords) {
			inlineEditor.isDragging = true;
			inlineEditor.dragStartX = coords.x;
			inlineEditor.dragStartY = coords.y;
			inlineEditor.currentBoxIndex = boxIndex;

			// Store original box for dragging
			inlineEditor.dragStartBox = [...inlineEditor.bboxes.boxes[boxIndex]];

			// Update editor selection
			if (inlineEditor.editor) {
				inlineEditor.editor.selectedBboxIndex = boxIndex;
			}

			// Update UI
			updateBboxSelector();

			// Call selectBox to properly update all UI elements including class selector
			selectBox(boxIndex);

			debug(`Started dragging box ${boxIndex}`);
		}

		function updateDragging(coords) {
			if (!inlineEditor.isDragging || inlineEditor.currentBoxIndex < 0) return;

			// Calculate movement delta
			const deltaX = coords.x - inlineEditor.dragStartX;
			const deltaY = coords.y - inlineEditor.dragStartY;

			// Get original box dimensions
			const originalBox = inlineEditor.dragStartBox;
			const width = originalBox[2] - originalBox[0];
			const height = originalBox[3] - originalBox[1];

			// Calculate new position, constrained to canvas boundaries
			const newX1 = Math.max(0, Math.min(canvasElement.width - width, originalBox[0] + deltaX));
			const newY1 = Math.max(0, Math.min(canvasElement.height - height, originalBox[1] + deltaY));

			// Update the box
			inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = [
				newX1,
				newY1,
				newX1 + width,
				newY1 + height
			];

			// Redraw to show real-time updates
			if (inlineEditor.editor) {
				inlineEditor.editor.redrawCanvas();
			}
		}

		function finishDragging() {
			if (!inlineEditor.isDragging) return;

			// Clean up
			inlineEditor.isDragging = false;
			inlineEditor.dragStartBox = null;

			// Final redraw to ensure proper display
			if (inlineEditor.editor) {
				inlineEditor.editor.redrawCanvas();
			}

			// Update hidden field
			updateHiddenBboxesField();

			debug(`Finished dragging box ${inlineEditor.currentBoxIndex}`);
		}

		// Resizing operations
		function startResizing(boxIndex, corner, coords) {
			inlineEditor.isResizing = true;
			inlineEditor.resizeCorner = corner;
			inlineEditor.dragStartX = coords.x;
			inlineEditor.dragStartY = coords.y;
			inlineEditor.currentBoxIndex = boxIndex;

			// Store original box for resizing
			inlineEditor.dragStartBox = [...inlineEditor.bboxes.boxes[boxIndex]];

			// Update editor selection
			if (inlineEditor.editor) {
				inlineEditor.editor.selectedBboxIndex = boxIndex;
			}

			// Update UI
			updateBboxSelector();

			// Call selectBox to properly update all UI elements including class selector
			selectBox(boxIndex);

			debug(`Started resizing box ${boxIndex} from ${corner}`);
		}

		function updateResizing(coords) {
			if (!inlineEditor.isResizing || inlineEditor.currentBoxIndex < 0) return;

			const box = [...inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex]];

			// Update coordinates based on which corner is being dragged
			switch (inlineEditor.resizeCorner) {
				case 'topLeft':
					box[0] = Math.min(box[2] - 5, Math.max(0, coords.x));
					box[1] = Math.min(box[3] - 5, Math.max(0, coords.y));
					break;
				case 'topRight':
					box[2] = Math.max(box[0] + 5, Math.min(canvasElement.width, coords.x));
					box[1] = Math.min(box[3] - 5, Math.max(0, coords.y));
					break;
				case 'bottomLeft':
					box[0] = Math.min(box[2] - 5, Math.max(0, coords.x));
					box[3] = Math.max(box[1] + 5, Math.min(canvasElement.height, coords.y));
					break;
				case 'bottomRight':
					box[2] = Math.max(box[0] + 5, Math.min(canvasElement.width, coords.x));
					box[3] = Math.max(box[1] + 5, Math.min(canvasElement.height, coords.y));
					break;
			}

			// Update the box
			inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = box;

			// Redraw to show real-time updates
			if (inlineEditor.editor) {
				inlineEditor.editor.redrawCanvas();
			}
		}

		function finishResizing() {
			if (!inlineEditor.isResizing) return;

			// Clean up
			inlineEditor.isResizing = false;
			inlineEditor.resizeCorner = null;
			inlineEditor.dragStartBox = null;

			// Final redraw to ensure proper display
			if (inlineEditor.editor) {
				inlineEditor.editor.redrawCanvas();
			}

			// Update hidden field
			updateHiddenBboxesField();

			debug(`Finished resizing box ${inlineEditor.currentBoxIndex}`);
		}
	}

	// Make the inline editor object accessible globally
	window.inlineEditor = inlineEditor;

	// Initialize debug message to track class label handling
	debug("BBox Editor initialized with border-only selection, selective notifications, and uncertain box support");
});