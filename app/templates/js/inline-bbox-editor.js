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
	const inlineCrowdCheckbox = document.getElementById('inline-crowd-checkbox');
	const inlineReflectedCheckbox = document.getElementById('inline-reflected-checkbox');
	const inlineRenditionCheckbox = document.getElementById('inline-rendition-checkbox');
	const inlineOcrNeededCheckbox = document.getElementById('inline-ocr-needed-checkbox');
    let inlineMultiLabelCheckbox = document.getElementById('inline-multi-label-checkbox');
	const inlineClassNumbersCheckbox = document.getElementById('inline-class-numbers-checkbox');
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
		selectedUncertainClasses: [], // Store selected classes for uncertain boxes
		isMultiLabelMode: false,   // Track if multi-label mode is active
		multiLabelClasses: [],     // Store selected classes for multi-label boxes
		nextGroupId: 1,            // Next available group ID for multi-label boxes
		updateBboxSelector: function() {
			// Just call the global function
			updateBboxSelector();
		}
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

					// Create or update the hidden div for possible labels
					function updatePossibleLabelsDiv() {
					  // Find or create the invisible div for possible labels
					  let possibleLabelsDiv = document.getElementById('stored-possible-labels');
					  if (!possibleLabelsDiv) {
						possibleLabelsDiv = document.createElement('div');
						possibleLabelsDiv.id = 'stored-possible-labels';
						possibleLabelsDiv.style.display = 'none';
						document.body.appendChild(possibleLabelsDiv);
					  }

					  // Store the selected possible labels in the div as a JSON string
					  possibleLabelsDiv.dataset.labels = JSON.stringify(selectedClassIds || []);
					  debug(`Stored possible labels in hidden div: ${selectedClassIds.join(', ')}`);
					}

					// Store the selected classes in the invisible div
					updatePossibleLabelsDiv();

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

		const possibleLabelsDiv = document.getElementById('stored-possible-labels');
		if (possibleLabelsDiv) {
		  possibleLabelsDiv.dataset.labels = '[]';
		  debug('Reset stored possible labels in hidden div');
		}

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
			for (let i = 0; i < inlineEditor.bboxes.labels.length; i++) {
				// Convert labels to integers if they are strings
				if (typeof inlineEditor.bboxes.labels[i] === 'string') {
					inlineEditor.bboxes.labels[i] = parseInt(inlineEditor.bboxes.labels[i]);
					debug(`Converted label at index ${i} to integer: ${inlineEditor.bboxes.labels[i]}`);
				}
			}

			// Ensure crowd flags array exists
			if (!inlineEditor.bboxes.crowd_flags && inlineEditor.bboxes.boxes) {
				debug('Creating missing crowd flags array with default values');
				inlineEditor.bboxes.crowd_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			} else if (inlineEditor.bboxes.crowd_flags) {
				debug(`Crowd flags found: ${JSON.stringify(inlineEditor.bboxes.crowd_flags)}`);
			}

			// Ensure reflected object flags array exists
			if (!inlineEditor.bboxes.reflected_flags && inlineEditor.bboxes.boxes) {
				debug('Creating missing reflected flags array with default values');
				inlineEditor.bboxes.reflected_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			} else if (inlineEditor.bboxes.reflected_flags) {
				debug(`Reflected flags found: ${JSON.stringify(inlineEditor.bboxes.reflected_flags)}`);
			}

			// Ensure rendition flags array exists
			if (!inlineEditor.bboxes.rendition_flags && inlineEditor.bboxes.boxes) {
				debug('Creating missing rendition flags array with default values');
				inlineEditor.bboxes.rendition_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			} else if (inlineEditor.bboxes.rendition_flags) {
				debug(`Rendition flags found: ${JSON.stringify(inlineEditor.bboxes.rendition_flags)}`);
			}

			// Ensure ocr_needed flags array exists
			if (!inlineEditor.bboxes.ocr_needed_flags && inlineEditor.bboxes.boxes) {
				debug('Creating missing ocr_needed flags array with default values');
				inlineEditor.bboxes.ocr_needed_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
			} else if (inlineEditor.bboxes.ocr_needed_flags) {
				debug(`OCR needed flags found: ${JSON.stringify(inlineEditor.bboxes.ocr_needed_flags)}`);
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
		// But preserve "ood" if it's already set
		const labelTypeField = document.getElementById('label_type');
		if (labelTypeField && labelTypeField.value !== 'ood') {
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
				crowd_flag: inlineEditor.bboxes.crowd_flags && inlineEditor.bboxes.crowd_flags[i],
				reflected_flag: inlineEditor.bboxes.reflected_flags && inlineEditor.bboxes.reflected_flags[i],
				rendition_flag: inlineEditor.bboxes.rendition_flags && inlineEditor.bboxes.rendition_flags[i],
				ocr_needed_flag: inlineEditor.bboxes.ocr_needed_flags && inlineEditor.bboxes.ocr_needed_flags[i]
			};

			// Add group id if this is part of a multi-label box
			if (inlineEditor.bboxes.group && inlineEditor.bboxes.group[i] !== null) {
				bboxData.group = inlineEditor.bboxes.group[i];
			}

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

	// Make the function globally accessible for keyboard shortcuts
	window.updateHiddenBboxesField = updateHiddenBboxesField;

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

	// Event listener for modal close to sync crowd and reflected checkboxes state
	document.addEventListener('bbox-modal-closed', function(e) {
		debug('Advanced editor modal closed, syncing crowd and reflected checkboxes state');

		// Sync the current box index from advanced editor first
		if (window.BBoxEditorUI && typeof window.BBoxEditorUI.currentBoxIndex !== 'undefined') {
			const advancedCurrentIndex = window.BBoxEditorUI.currentBoxIndex;
			if (advancedCurrentIndex !== inlineEditor.currentBoxIndex) {
				debug(`Syncing currentBoxIndex from advanced editor: ${inlineEditor.currentBoxIndex} -> ${advancedCurrentIndex}`);
				inlineEditor.currentBoxIndex = advancedCurrentIndex;
				
				// Also update the box selector to reflect the new selection
				if (typeof updateBboxSelector === 'function') {
					updateBboxSelector();
				}
			}
		}

		// Sync multi-label checkbox state as well
		if (inlineEditor.currentBoxIndex >= 0 && inlineEditor.bboxes &&
			inlineEditor.bboxes.group &&
			inlineEditor.currentBoxIndex < inlineEditor.bboxes.group.length) {

			// Get the current multi-label state from the bboxes data
			const isMultiLabel = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;

			// Update the inline multi-label checkbox
			if (inlineMultiLabelCheckbox) {
				inlineMultiLabelCheckbox.checked = isMultiLabel;
				debug(`Synced inline multi-label checkbox to: ${isMultiLabel} after modal close`);
			}

			// Update the dropdown visibility to reflect the current state
			updateDropdownVisibility(isMultiLabel);
		}

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

		// If we have a selected box, update the inline reflected checkbox
		if (inlineEditor.currentBoxIndex >= 0 && inlineEditor.bboxes &&
			inlineEditor.bboxes.reflected_flags &&
			inlineEditor.currentBoxIndex < inlineEditor.bboxes.reflected_flags.length) {

			// Get the current reflected flag state from the bboxes data
			const isReflected = inlineEditor.bboxes.reflected_flags[inlineEditor.currentBoxIndex];

			// Update the inline checkbox
			if (inlineReflectedCheckbox) {
				inlineReflectedCheckbox.checked = isReflected;
				debug(`Synced inline reflected checkbox to: ${isReflected} after modal close`);
			}
		}

		// If we have a selected box, update the inline rendition checkbox
		if (inlineEditor.currentBoxIndex >= 0 && inlineEditor.bboxes &&
			inlineEditor.bboxes.rendition_flags &&
			inlineEditor.currentBoxIndex < inlineEditor.bboxes.rendition_flags.length) {

			// Get the current rendition flag state from the bboxes data
			const isRendition = inlineEditor.bboxes.rendition_flags[inlineEditor.currentBoxIndex];

			// Update the inline checkbox
			if (inlineRenditionCheckbox) {
				inlineRenditionCheckbox.checked = isRendition;
				debug(`Synced inline rendition checkbox to: ${isRendition} after modal close`);
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

		// Helper function to determine box styles
		const getBoxStyle = (isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel = false) => {
			const styles = {
				normal: { stroke: "#e74c3c", fill: "rgba(231, 76, 60, 0.85)", text: "white" },
				uncertain: { stroke: "#FFCC00", fill: "rgba(255, 204, 0, 0.85)", text: "black" },
				crowd: { stroke: "#9C27B0", fill: "rgba(156, 39, 176, 0.85)", text: "white" },
				reflected: { stroke: "#20B2AA", fill: "rgba(32, 178, 170, 0.85)", text: "white" },
				rendition: { stroke: "#FF7043", fill: "rgba(255, 112, 67, 0.85)", text: "white" },
				ocrNeeded: { stroke: "#C0C0C0", fill: "rgba(192, 192, 192, 0.85)", text: "black" },
				multiLabel: { stroke: "#4CAF50", fill: "rgba(76, 175, 80, 0.85)", text: "white" },
				selected: { stroke: "#2196F3", fill: "rgba(33, 150, 243, 0.85)", text: "white" },
				// Two-flag combinations
				crowdReflected: { stroke: "#5E6DAD", fill: "rgba(94, 109, 173, 0.85)", text: "white" },
				crowdRendition: { stroke: "#B39DDB", fill: "rgba(179, 157, 219, 0.85)", text: "white" },
				crowdOcrNeeded: { stroke: "#D1C4E9", fill: "rgba(209, 196, 233, 0.85)", text: "black" },
				reflectedRendition: { stroke: "#FF8A65", fill: "rgba(255, 138, 101, 0.85)", text: "white" },
				reflectedOcrNeeded: { stroke: "#B0BEC5", fill: "rgba(176, 190, 197, 0.85)", text: "black" },
				renditionOcrNeeded: { stroke: "#FFAB91", fill: "rgba(255, 171, 145, 0.85)", text: "black" },
				// Three-flag combinations
				crowdReflectedRendition: { stroke: "#81C784", fill: "rgba(129, 199, 132, 0.85)", text: "white" },
				crowdReflectedOcrNeeded: { stroke: "#E1BEE7", fill: "rgba(225, 190, 231, 0.85)", text: "black" },
				crowdRenditionOcrNeeded: { stroke: "#FFE0B2", fill: "rgba(255, 224, 178, 0.85)", text: "black" },
				reflectedRenditionOcrNeeded: { stroke: "#F8BBD9", fill: "rgba(248, 187, 217, 0.85)", text: "black" },
				// Four-flag combination
				crowdReflectedRenditionOcrNeeded: { stroke: "#F0F4C3", fill: "rgba(240, 244, 195, 0.85)", text: "black" },
			};

			// Multi-label boxes always remain green regardless of flags or selection state
			if (isMultiLabel && !isUncertain) {
				return styles.multiLabel;
			}

			// Flag combinations - exact same order as advanced editor for consistency
			if (isCrowd && isReflected && isRendition && isOcrNeeded) return styles.crowdReflectedRenditionOcrNeeded;
			if (isReflected && isRendition && isOcrNeeded) return styles.reflectedRenditionOcrNeeded;
			if (isCrowd && isRendition && isOcrNeeded) return styles.crowdRenditionOcrNeeded;
			if (isCrowd && isReflected && isOcrNeeded) return styles.crowdReflectedOcrNeeded;
			if (isCrowd && isReflected && isRendition) return styles.crowdReflectedRendition;
			if (isRendition && isOcrNeeded) return styles.renditionOcrNeeded;
			if (isReflected && isOcrNeeded) return styles.reflectedOcrNeeded;
			if (isCrowd && isOcrNeeded) return styles.crowdOcrNeeded;
			if (isCrowd && isReflected) return styles.crowdReflected;
			if (isCrowd && isRendition) return styles.crowdRendition;
			if (isReflected && isRendition) return styles.reflectedRendition;
			if (isOcrNeeded) return styles.ocrNeeded;
			if (isRendition) return styles.rendition;
			if (isReflected) return styles.reflected;
			if (isCrowd) return styles.crowd;
			if (isUncertain) return styles.uncertain;
			if (isSelected) return styles.selected;
			return styles.normal;
		};

		// Ensure we don't lose label information and sync bboxes
		if (!inlineEditor.bboxes && inlineEditor.editor.bboxes) {
			debug('Using bboxes from main editor');
			inlineEditor.bboxes = inlineEditor.editor.bboxes;

			// Check if we need to create labels
			if (!inlineEditor.bboxes.labels && inlineEditor.bboxes.boxes) {
				if (inlineEditor.bboxes.gt) {
					// Check for 'gt' field first
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

			// Preserve labels if they exist in our bboxes
			} else if (inlineEditor.bboxes.labels && !inlineEditor.editor.bboxes.labels) {
				debug('Preserving our labels when updating editor');

			// If editor has labels, but we don't, take them
			} else if (!inlineEditor.bboxes.labels && inlineEditor.editor.bboxes.labels) {
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

		// Create a consolidated rendering function that all code paths will use
		function drawUnifiedBBox(ctx, box, style, labelText, isAtTopEdge) {
			// Draw box with appropriate line width for selection
			ctx.strokeStyle = style.stroke;
			ctx.lineWidth = style.lineWidth || 3;
			ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);

			// Position label
			const padding = 3;
			const fontSize = 12; 
			const labelX = box[0] + 3;
			const labelY = isAtTopEdge ? box[1] + 16 : box[1] - 3;

			// Draw label background
			ctx.save();
			ctx.font = `bold ${fontSize}px Arial, sans-serif`;
			const textWidth = ctx.measureText(labelText).width;
			ctx.fillStyle = style.fill;
			ctx.strokeStyle = style.stroke;

			const cornerRadius = 2;
			ctx.beginPath();
			ctx.moveTo(labelX - padding + cornerRadius, labelY - fontSize - padding);
			ctx.lineTo(labelX + textWidth + padding - cornerRadius, labelY - fontSize - padding);
			ctx.arcTo(labelX + textWidth + padding, labelY - fontSize - padding, labelX + textWidth + padding, labelY - fontSize - padding + cornerRadius, cornerRadius);
			ctx.lineTo(labelX + textWidth + padding, labelY + padding - cornerRadius);
			ctx.arcTo(labelX + textWidth + padding, labelY + padding, labelX + textWidth + padding - cornerRadius, labelY + padding, cornerRadius);
			ctx.lineTo(labelX - padding + cornerRadius, labelY + padding);
			ctx.arcTo(labelX - padding, labelY + padding, labelX - padding, labelY + padding - cornerRadius, cornerRadius);
			ctx.lineTo(labelX - padding, labelY - fontSize - padding + cornerRadius);
			ctx.arcTo(labelX - padding, labelY - fontSize - padding, labelX - padding + cornerRadius, labelY - fontSize - padding, cornerRadius);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();

			// Draw label text
			ctx.fillStyle = style.text;
			ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
			ctx.shadowBlur = 1;
			ctx.shadowOffsetX = 0.5;
			ctx.shadowOffsetY = 0.5;
			
			// Update font weight if specified in the style
			if (style.fontWeight) {
				ctx.font = `${style.fontWeight} ${fontSize}px Arial, sans-serif`;
			}
			
			// Special styling for "NO LABELS"
			if (labelText === "NO LABELS") {
				ctx.fillStyle = '#666';
				ctx.font = `italic ${fontSize}px Arial, sans-serif`;
			}
			
			ctx.fillText(labelText, labelX, labelY);
			ctx.restore();
		}

		// Get the box style based on flags
		function getUnifiedBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel) {
			const styles = {
				normal: { stroke: "#e74c3c", fill: "rgba(231, 76, 60, 0.85)", text: "white" },
				uncertain: { stroke: "#FFCC00", fill: "rgba(255, 204, 0, 0.85)", text: "black" },
				crowd: { stroke: "#9C27B0", fill: "rgba(156, 39, 176, 0.85)", text: "white" },
				reflected: { stroke: "#20B2AA", fill: "rgba(32, 178, 170, 0.85)", text: "white" },
				rendition: { stroke: "#FF7043", fill: "rgba(255, 112, 67, 0.85)", text: "white" },
				ocrNeeded: { stroke: "#C0C0C0", fill: "rgba(192, 192, 192, 0.85)", text: "black" },
				multiLabel: { stroke: "#4CAF50", fill: "rgba(76, 175, 80, 0.85)", text: "white" },
				selected: { stroke: "#2196F3", fill: "rgba(33, 150, 243, 0.85)", text: "white" },
				// Two-flag combinations
				crowdReflected: { stroke: "#5E6DAD", fill: "rgba(94, 109, 173, 0.85)", text: "white" },
				crowdRendition: { stroke: "#B39DDB", fill: "rgba(179, 157, 219, 0.85)", text: "white" },
				crowdOcrNeeded: { stroke: "#D1C4E9", fill: "rgba(209, 196, 233, 0.85)", text: "black" },
				reflectedRendition: { stroke: "#FF8A65", fill: "rgba(255, 138, 101, 0.85)", text: "white" },
				reflectedOcrNeeded: { stroke: "#B0BEC5", fill: "rgba(176, 190, 197, 0.85)", text: "black" },
				renditionOcrNeeded: { stroke: "#FFAB91", fill: "rgba(255, 171, 145, 0.85)", text: "black" },
				// Three-flag combinations
				crowdReflectedRendition: { stroke: "#81C784", fill: "rgba(129, 199, 132, 0.85)", text: "white" },
				crowdReflectedOcrNeeded: { stroke: "#E1BEE7", fill: "rgba(225, 190, 231, 0.85)", text: "black" },
				crowdRenditionOcrNeeded: { stroke: "#FFE0B2", fill: "rgba(255, 224, 178, 0.85)", text: "black" },
				reflectedRenditionOcrNeeded: { stroke: "#F8BBD9", fill: "rgba(248, 187, 217, 0.85)", text: "black" },
				// Four-flag combination
				crowdReflectedRenditionOcrNeeded: { stroke: "#F0F4C3", fill: "rgba(240, 244, 195, 0.85)", text: "black" },
			};

			// Multi-label boxes always remain green regardless of flags or selection state
			if (isMultiLabel && !isUncertain) {
				return {
					stroke: styles.multiLabel.stroke,
					fill: styles.multiLabel.fill,
					text: styles.multiLabel.text,
					lineWidth: isSelected ? 5 : 3  // Still use thicker border when selected
				};
			}

			// Flag combinations - exact same order as advanced editor for consistency
			let baseStyle;
			if (isCrowd && isReflected && isRendition && isOcrNeeded) {
				baseStyle = styles.crowdReflectedRenditionOcrNeeded;
			} else if (isReflected && isRendition && isOcrNeeded) {
				baseStyle = styles.reflectedRenditionOcrNeeded;
			} else if (isCrowd && isRendition && isOcrNeeded) {
				baseStyle = styles.crowdRenditionOcrNeeded;
			} else if (isCrowd && isReflected && isOcrNeeded) {
				baseStyle = styles.crowdReflectedOcrNeeded;
			} else if (isCrowd && isReflected && isRendition) {
				baseStyle = styles.crowdReflectedRendition;
			} else if (isRendition && isOcrNeeded) {
				baseStyle = styles.renditionOcrNeeded;
			} else if (isReflected && isOcrNeeded) {
				baseStyle = styles.reflectedOcrNeeded;
			} else if (isCrowd && isOcrNeeded) {
				baseStyle = styles.crowdOcrNeeded;
			} else if (isCrowd && isReflected) {
				baseStyle = styles.crowdReflected;
			} else if (isCrowd && isRendition) {
				baseStyle = styles.crowdRendition;
			} else if (isReflected && isRendition) {
				baseStyle = styles.reflectedRendition;
			} else if (isOcrNeeded) {
				baseStyle = styles.ocrNeeded;
			} else if (isRendition) {
				baseStyle = styles.rendition;
			} else if (isReflected) {
				baseStyle = styles.reflected;
			} else if (isCrowd) {
				baseStyle = styles.crowd;
			} else if (isUncertain) {
				baseStyle = styles.uncertain;
			} else if (isSelected) {
				baseStyle = styles.selected;
			} else {
				baseStyle = styles.normal;
			}
			
			// Return result with lineWidth for selection indication
			return {
				stroke: baseStyle.stroke,
				fill: baseStyle.fill,
				text: baseStyle.text,
				lineWidth: isSelected ? 5 : 3  // Use thicker border for selected boxes
			};
		};

		// Override the editor's redraw to handle uncertain boxes, multi-label boxes, and our temp box
		const originalRedraw = inlineEditor.editor.redrawCanvas;
		inlineEditor.editor.redrawCanvas = function () {
			// Start fresh - clear and draw the image
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
			this.ctx.drawImage(this.img, 0, 0);

			// Skip original redraw since we'll handle everything here
			// originalRedraw.call(this);
			
			if (!this.bboxes || !Array.isArray(this.bboxes.boxes)) {
				return;
			}
			
			// First pass: identify which boxes are part of a multi-label group
			const groupedBoxes = new Map();
			
			if (this.bboxes.group) {
				for (let i = 0; i < this.bboxes.boxes.length; i++) {
					const groupId = this.bboxes.group[i];
					if (groupId !== null) {
						if (!groupedBoxes.has(groupId)) {
							groupedBoxes.set(groupId, []);
						}
						groupedBoxes.get(groupId).push(i);
					}
				}
			}
			
			// First draw regular boxes (non-multi-label, non-selected)
			this.bboxes.boxes.forEach((box, i) => {
				// Skip selected box - we'll draw it last
				if (i === this.selectedBboxIndex) return;
				
				// Skip if this is part of a multi-label group and not the first box in the group
				const groupId = this.bboxes.group?.[i];
				if (groupId !== null && groupId !== undefined) {
					const groupIndices = groupedBoxes.get(groupId);
					if (groupIndices && groupIndices[0] !== i) {
						return; // Only draw the first box in each group
					}
				}
				
				const isUncertain = this.bboxes.uncertain_flags?.[i] || this.bboxes.labels?.[i] === -1;
				const isCrowd = this.bboxes.crowd_flags?.[i];
				const isReflected = this.bboxes.reflected_flags?.[i];
				const isRendition = this.bboxes.rendition_flags?.[i];
				const isOcrNeeded = this.bboxes.ocr_needed_flags?.[i];
				const isMultiLabel = groupId !== null && groupId !== undefined;
				const isSelected = false; // Always false here since we're skipping the selected box
				
				// Get unified style for box
				const style = getUnifiedBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel);
				
				// Prepare label text
				let labelId, labelText, labelName;
				
				if (isMultiLabel) {
					// For multi-label boxes, always show class IDs
					const groupId = this.bboxes.group[i];
					const groupIndices = groupedBoxes.get(groupId);
					
					// Always show the list of class IDs
					let classIds = [];
					if (groupIndices) {
						groupIndices.forEach(idx => {
							if (this.bboxes.labels[idx] !== undefined) {
								classIds.push(this.bboxes.labels[idx]);
							}
						});
					}
					if (classIds.length > 0) {
						labelText = classIds.join(', ');
						if (labelText.length > 30) {
							labelText = labelText.substring(0, 27) + '...';
						}
					} else {
						labelText = "NO LABELS";
					}
				} else if (isUncertain) {
					// For uncertain boxes
					labelText = 'Not Sure';
				} else {
					// For regular boxes
					labelId = this.bboxes.labels?.[i] ?? (this.bboxes.gt?.[i] ?? 0);
					labelName = this.classLabels?.[labelId] ?? `Class ${labelId}`;
					
					if (this.showClassNumbersOnly) {
						labelText = `${labelId}`;
					} else {
						labelText = `${labelId} - ${labelName}`;
						
						// Limit label text to 30 characters
						if (labelText.length > 30) {
							labelText = labelText.substring(0, 27) + '...';
						}
					}
				}
				
				// Draw the box and label using our unified function
				const isAtTopEdge = box[1] <= 5;
				drawUnifiedBBox(this.ctx, box, style, labelText, isAtTopEdge);
			});
			
			// Draw selected box (if any) on top
			if (this.selectedBboxIndex >= 0 && this.selectedBboxIndex < this.bboxes.boxes.length) {
				const i = this.selectedBboxIndex;
				const box = this.bboxes.boxes[i];
				
				const isUncertain = this.bboxes.uncertain_flags?.[i] || this.bboxes.labels?.[i] === -1;
				const isCrowd = this.bboxes.crowd_flags?.[i];
				const isReflected = this.bboxes.reflected_flags?.[i];
				const isRendition = this.bboxes.rendition_flags?.[i];
				const isOcrNeeded = this.bboxes.ocr_needed_flags?.[i];
				const isSelected = true;
				const selGroup = this.bboxes.group?.[i];
				const isMultiLabel = selGroup !== null && selGroup !== undefined;
				
				// Get unified style for selected box, preserving multi-label styling
				const style = getUnifiedBoxStyle(isCrowd, isReflected, isRendition, isOcrNeeded, isUncertain, isSelected, isMultiLabel);
				
				// Prepare label text
				let labelId, labelText, labelName;
				
				if (isMultiLabel) {
					// For multi-label boxes, always show class IDs
					const groupId = this.bboxes.group[i];
					const groupIndices = groupedBoxes.get(groupId);
					
					// Always show the list of class IDs
					let classIds = [];
					if (groupIndices) {
						groupIndices.forEach(idx => {
							if (this.bboxes.labels[idx] !== undefined) {
								classIds.push(this.bboxes.labels[idx]);
							}
						});
					}
					if (classIds.length > 0) {
						labelText = classIds.join(', ');
						if (labelText.length > 30) {
							labelText = labelText.substring(0, 27) + '...';
						}
					} else {
						labelText = "NO LABELS";
					}
				} else if (isUncertain) {
					// For uncertain boxes
					labelText = 'Not Sure';
				} else {
					// For regular boxes
					labelId = this.bboxes.labels?.[i] ?? (this.bboxes.gt?.[i] ?? 0);
					labelName = this.classLabels?.[labelId] ?? `Class ${labelId}`;
					
					if (this.showClassNumbersOnly) {
						labelText = `${labelId}`;
					} else {
						labelText = `${labelId} - ${labelName}`;
						
						// Limit label text to 30 characters
						if (labelText.length > 30) {
							labelText = labelText.substring(0, 27) + '...';
						}
					}
				}
				
				// Draw the box and label using our unified function
				const isAtTopEdge = box[1] <= 5;
				drawUnifiedBBox(this.ctx, box, style, labelText, isAtTopEdge);
			}
			
			// If we're in drawing mode and have a temp box, draw it
			if (inlineEditor.isDrawing && inlineEditor.tempBox) {
				const tempBox = inlineEditor.tempBox;
				const style = { stroke: '#00FF00', fill: 'rgba(0, 255, 0, 0.5)', text: 'black' };
				const labelText = 'Drawing...';
				const isAtTopEdge = tempBox[1] <= 5;
				
				drawUnifiedBBox(this.ctx, tempBox, style, labelText, isAtTopEdge);
			}

			if (inlineEditor.isDrawing && inlineEditor.tempBox) {
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

		setupEnhancedClassSelector();
		updateBboxSelector();
		setupEventHandlers();

		// Initialize class numbers checkbox if the editor exists
		if (inlineEditor.editor && inlineClassNumbersCheckbox) {
			inlineClassNumbersCheckbox.checked = inlineEditor.editor.getShowClassNumbersOnly();
		}

		if (inlineEditor.canvasElement) {
			setupCanvasInteraction(inlineEditor.canvasElement);
		}

		updateHiddenBboxesField();
		
		// Initialize multi-label mode
		initMultiLabelMode();
		
		// Create multi-label class selector (initially hidden)
		createMultiLabelClassSelector();

		// Initialize checkboxes as disabled (no box selected initially)
		updateCheckboxesEnabledState(false);

		// Auto-select first box if boxes exist to ensure label pre-selection works
		if (inlineEditor.bboxes && inlineEditor.bboxes.boxes && inlineEditor.bboxes.boxes.length > 0) {
			debug('Auto-selecting first box for proper initialization');
			selectBox(0);
		}

		inlineEditor.initialized = true;
		debug('Inline editor initialized and connected to main editor');
	}

	// Setup event handlers for UI controls
	// Initialize multi-label mode functionality
	function initMultiLabelMode() {
		// Find the maximum group id in existing bboxes to ensure unique ids
		inlineEditor.nextGroupId = 1;
		if (inlineEditor.bboxes && inlineEditor.bboxes.boxes) {
			inlineEditor.bboxes.boxes.forEach((box, i) => {
				if (inlineEditor.bboxes.group && inlineEditor.bboxes.group[i]) {
					inlineEditor.nextGroupId = Math.max(inlineEditor.nextGroupId, inlineEditor.bboxes.group[i] + 1);
				}
			});
		}

		// Ensure group array exists
		if (inlineEditor.bboxes && inlineEditor.bboxes.boxes && !inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group = new Array(inlineEditor.bboxes.boxes.length).fill(null);
		}

		debug(`Multi-label mode initialized with nextGroupId: ${inlineEditor.nextGroupId}`);
	}

	// Create or update the multi-label class selector
	function createMultiLabelClassSelector() {
		// Check if we already have a multi-label class selector
		let multiLabelContainer = document.getElementById('multi-label-class-container');
		
		// If it doesn't exist, create it
		if (!multiLabelContainer) {
			multiLabelContainer = document.createElement('div');
			multiLabelContainer.id = 'multi-label-class-container';
			multiLabelContainer.className = 'multi-label-class-container';
			
			// Create a title
			const title = document.createElement('div');
			title.className = 'multi-label-title';
			title.textContent = 'Select Classes:';
			multiLabelContainer.appendChild(title);
			
			// Create the checkbox container
			const checkboxContainer = document.createElement('div');
			checkboxContainer.className = 'multi-label-checkbox-container';
			checkboxContainer.id = 'multi-label-checkbox-container';
			multiLabelContainer.appendChild(checkboxContainer);
			
			// Find a good place to insert the container
			const controlsContainer = document.querySelector('.control-container') || document.querySelector('.image-editor-controls');
			if (controlsContainer) {
				// Insert it after the class selector
				const classSelector = document.querySelector('.class-selector-container') || inlineBboxSelector?.parentElement;
				if (classSelector && classSelector.nextElementSibling) {
					controlsContainer.insertBefore(multiLabelContainer, classSelector.nextElementSibling);
				} else {
					controlsContainer.appendChild(multiLabelContainer);
				}
			}
			
			// Initially hide it
			multiLabelContainer.style.display = 'none';
		}
		
		return multiLabelContainer;
	}

	// Update the multi-label checkboxes based on current box
	function updateMultiLabelCheckboxes() {
		if (!inlineEditor.isMultiLabelMode || inlineEditor.currentBoxIndex < 0) return;
		
		// Create or get the container
		const multiLabelContainer = createMultiLabelClassSelector();
		const checkboxContainer = document.getElementById('multi-label-checkbox-container');
		if (!checkboxContainer) return;
		
		// Clear existing checkboxes
		checkboxContainer.innerHTML = '';
		
		// Get the current box's group id
		const currentGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
		
		// If no group id or this is a new multi-label box, return
		if (currentGroupId === null) return;
		
		// Find all boxes with this group id and collect their labels as numbers
		const groupLabels = [];
		inlineEditor.bboxes.boxes.forEach((box, i) => {
			if (inlineEditor.bboxes.group[i] === currentGroupId && inlineEditor.bboxes.labels[i] !== undefined) {
				groupLabels.push(parseInt(inlineEditor.bboxes.labels[i]));
			}
		});
		
		// Create checkboxes for all available class labels
		Object.entries(inlineEditor.classLabels).forEach(([id, name]) => {
			// Create wrapper for each checkbox
			const checkboxWrapper = document.createElement('div');
			checkboxWrapper.className = 'multi-label-checkbox-wrapper';
			
			// Create the checkbox
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.className = 'multi-label-class-checkbox';
			checkbox.id = `multi-label-class-${id}`;
			checkbox.value = id;
			checkbox.checked = groupLabels.includes(parseInt(id));
			
			// Create the label
			const label = document.createElement('label');
			label.htmlFor = `multi-label-class-${id}`;
			label.textContent = `${id} - ${name}`;
			
			// Add event listener to checkbox
			checkbox.addEventListener('change', (e) => {
				const classId = parseInt(e.target.value);
				const isChecked = e.target.checked;
				
				if (isChecked) {
					addLabelToMultiLabelBox(classId);
				} else {
					removeLabelFromMultiLabelBox(classId);
				}
			});
			
			// Add to container
			checkboxWrapper.appendChild(checkbox);
			checkboxWrapper.appendChild(label);
			checkboxContainer.appendChild(checkboxWrapper);
		});
		
		// Show the container
		multiLabelContainer.style.display = 'block';
	}

	// Add a label to the current multi-label box
	function addLabelToMultiLabelBox(classId) {
		if (!inlineEditor.isMultiLabelMode || inlineEditor.currentBoxIndex < 0) return;
		
		// Get the current box details
		const currentBox = inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex];
		let currentGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
		
		// If this is a new multi-label box, assign a group id
		if (currentGroupId === null) {
			currentGroupId = inlineEditor.nextGroupId++;
			inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] = currentGroupId;
		}
		
		// Check if this label already exists for this group
		let labelExists = false;
		inlineEditor.bboxes.boxes.forEach((box, i) => {
			if (inlineEditor.bboxes.group[i] === currentGroupId && 
				inlineEditor.bboxes.labels[i] === classId) {
				labelExists = true;
			}
		});
		
		// If label already exists, don't add it again
		if (labelExists) return;
		
		// Create a new box with the same coordinates but different class
		const newBoxIndex = inlineEditor.bboxes.boxes.length;
		inlineEditor.bboxes.boxes.push([...currentBox]);
		inlineEditor.bboxes.labels.push(classId);
		inlineEditor.bboxes.scores.push(1.0);
		
		// Remove OOD border if it exists (when adding a bbox after marking as "None of ImageNet")
		if (window.removeOODBorder) {
			window.removeOODBorder();
		}
		
		// Make sure to copy all flags
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags.push(inlineEditor.bboxes.crowd_flags[inlineEditor.currentBoxIndex]);
		}
		if (inlineEditor.bboxes.reflected_flags) {
			inlineEditor.bboxes.reflected_flags.push(inlineEditor.bboxes.reflected_flags[inlineEditor.currentBoxIndex]);
		}
		if (inlineEditor.bboxes.rendition_flags) {
			inlineEditor.bboxes.rendition_flags.push(inlineEditor.bboxes.rendition_flags[inlineEditor.currentBoxIndex]);
		}
		if (inlineEditor.bboxes.ocr_needed_flags) {
			inlineEditor.bboxes.ocr_needed_flags.push(inlineEditor.bboxes.ocr_needed_flags[inlineEditor.currentBoxIndex]);
		}
		if (inlineEditor.bboxes.uncertain_flags) {
			inlineEditor.bboxes.uncertain_flags.push(inlineEditor.bboxes.uncertain_flags[inlineEditor.currentBoxIndex]);
		}
		if (inlineEditor.bboxes.possible_labels) {
			inlineEditor.bboxes.possible_labels.push(inlineEditor.bboxes.possible_labels[inlineEditor.currentBoxIndex] || []);
		}
		
		// Add the group id to the new box
		if (!inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group = new Array(inlineEditor.bboxes.boxes.length).fill(null);
		}
		inlineEditor.bboxes.group[newBoxIndex] = currentGroupId;
		
		// Update the editor
		inlineEditor.editor.bboxes = inlineEditor.bboxes;
		inlineEditor.editor.redrawCanvas();
		
		debug(`Added class ${classId} to multi-label box with group ${currentGroupId}`);
	}

	// Remove a label from the current multi-label box
	function removeLabelFromMultiLabelBox(classId) {
		if (!inlineEditor.isMultiLabelMode || inlineEditor.currentBoxIndex < 0) return;
		
		// Get the current box's group id
		const currentGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
		
		if (currentGroupId === null) return;
		
		// Find and remove the box with this label in the same group
		let indexToRemove = -1;
		inlineEditor.bboxes.boxes.forEach((box, i) => {
			if (inlineEditor.bboxes.group[i] === currentGroupId && 
				inlineEditor.bboxes.labels[i] === classId) {
				indexToRemove = i;
			}
		});
		
		if (indexToRemove >= 0) {
			// Remove the box
			inlineEditor.bboxes.boxes.splice(indexToRemove, 1);
			inlineEditor.bboxes.labels.splice(indexToRemove, 1);
			inlineEditor.bboxes.scores.splice(indexToRemove, 1);
			inlineEditor.bboxes.group.splice(indexToRemove, 1);
			
			// Remove from all flag arrays
			if (inlineEditor.bboxes.crowd_flags) {
				inlineEditor.bboxes.crowd_flags.splice(indexToRemove, 1);
			}
			if (inlineEditor.bboxes.reflected_flags) {
				inlineEditor.bboxes.reflected_flags.splice(indexToRemove, 1);
			}
			if (inlineEditor.bboxes.rendition_flags) {
				inlineEditor.bboxes.rendition_flags.splice(indexToRemove, 1);
			}
			if (inlineEditor.bboxes.ocr_needed_flags) {
				inlineEditor.bboxes.ocr_needed_flags.splice(indexToRemove, 1);
			}
			if (inlineEditor.bboxes.uncertain_flags) {
				inlineEditor.bboxes.uncertain_flags.splice(indexToRemove, 1);
			}
			if (inlineEditor.bboxes.possible_labels) {
				inlineEditor.bboxes.possible_labels.splice(indexToRemove, 1);
			}
			
			// Check if this was the current box
			if (indexToRemove === inlineEditor.currentBoxIndex) {
				// Find another box in the same group
				let newSelection = -1;
				inlineEditor.bboxes.boxes.forEach((box, i) => {
					if (inlineEditor.bboxes.group[i] === currentGroupId) {
						newSelection = i;
					}
				});
				
				inlineEditor.currentBoxIndex = newSelection;
				updateUIForSelectedBox();
			} else if (indexToRemove < inlineEditor.currentBoxIndex) {
				// Adjust current box index if we removed a box before it
				inlineEditor.currentBoxIndex--;
			}
			
			// Update the editor
			inlineEditor.editor.bboxes = inlineEditor.bboxes;
			inlineEditor.editor.selectedBboxIndex = inlineEditor.currentBoxIndex;
			inlineEditor.editor.redrawCanvas();
			
			debug(`Removed class ${classId} from multi-label box with group ${currentGroupId}`);
			
			// Update the bbox selector
			updateBboxSelector();
		}
	}

	// Toggle multi-label mode
	function toggleMultiLabelMode(enable) {
		// CRITICAL: Preserve current box selection when switching modes
		const preservedBoxIndex = inlineEditor.currentBoxIndex;
		
		inlineEditor.isMultiLabelMode = enable;
		
		// Show or hide the multi-label class selector
		const multiLabelContainer = document.getElementById('multi-label-class-container');
		if (multiLabelContainer) {
			multiLabelContainer.style.display = enable ? 'block' : 'none';
		}
		
		// CRITICAL: Restore preserved box selection after mode switch
		if (preservedBoxIndex >= 0) {
			inlineEditor.currentBoxIndex = preservedBoxIndex;
		}
		
		// If enabling, create and populate the multi-label class selector
		if (enable && inlineEditor.currentBoxIndex >= 0) {
			updateMultiLabelCheckboxes();
		}
		
		// Update canvas to reflect the maintained selection
		if (inlineEditor.editor && inlineEditor.editor.redrawCanvas) {
			inlineEditor.editor.redrawCanvas();
		}
		
		debug(`Multi-label mode ${enable ? 'enabled' : 'disabled'}. Preserved box selection: ${preservedBoxIndex}`);
	}

// Dropdown UI management for multi-label mode
function updateDropdownVisibility(forceMultiLabel = null) {
	// CRITICAL: Preserve current box selection during dropdown visibility changes
	const preservedBoxIndex = inlineEditor.currentBoxIndex;
	
	// Find the class selector (single-label) and multi-label container
	const classSearchContainer = document.querySelector('.custom-class-selector') ||
								document.getElementById('single-label-selector-container');
	let multiContainer = document.getElementById('inline-multi-label-selection-container');
	
	// Always ensure the original bbox selector remains visible and functional
	const boxSelector = document.getElementById('inline-bbox-selector');
	if (boxSelector) {
		const boxSelectorContainer = boxSelector.closest('.control-group');
		if (boxSelectorContainer) {
			boxSelectorContainer.style.display = 'block';
			boxSelectorContainer.style.position = 'relative'; // Ensure proper positioning
		}
		// Also ensure the selector itself is visible
		boxSelector.style.display = 'block';
	}
	
	console.log(`[BBox Editor] updateDropdownVisibility called. forceMultiLabel: ${forceMultiLabel}, multi-label checkbox checked: ${inlineMultiLabelCheckbox && inlineMultiLabelCheckbox.checked}`);
	// Determine if we should show multi-label interface
	let isCurrentBoxMultiLabel;
	if (forceMultiLabel !== null) {
		// If explicitly forced, use that value
		isCurrentBoxMultiLabel = forceMultiLabel;
	} else {
		// Otherwise check the checkbox state first, then group ID
		if (inlineMultiLabelCheckbox && inlineMultiLabelCheckbox.checked) {
			isCurrentBoxMultiLabel = true;
		} else {
			// Check if current box is multi-label based on group ID
			isCurrentBoxMultiLabel = preservedBoxIndex >= 0 && 
								   inlineEditor.bboxes && 
								   inlineEditor.bboxes.group && 
								   inlineEditor.bboxes.group[preservedBoxIndex] !== null &&
								   inlineEditor.bboxes.group[preservedBoxIndex] !== undefined;
		}
	}
	
	console.log(`[BBox Editor] isCurrentBoxMultiLabel = ${isCurrentBoxMultiLabel}`);
	if (isCurrentBoxMultiLabel) {
		console.log(`[BBox Editor] Entering multi-label branch for box ${preservedBoxIndex}`);
		// Multi-label mode: hide class search, show/create multi-label dropdown
		if (classSearchContainer) classSearchContainer.style.display = 'none';
		
		// Create multi-label container if it doesn't exist
		if (!multiContainer) {
			multiContainer = document.createElement('div');
			multiContainer.id = 'inline-multi-label-selection-container';
			multiContainer.className = 'control-group';
			multiContainer.style.position = 'relative'; // Fix positioning issue
			
			// Find a proper insertion point in the controls area
			const controlsContainer = document.querySelector('.editor-controls') || 
									 document.querySelector('.control-container') ||
									 document.querySelector('.image-editor-left');
			
			if (controlsContainer) {
				// Insert it after the class search container
				if (classSearchContainer && classSearchContainer.parentNode === controlsContainer) {
					controlsContainer.insertBefore(multiContainer, classSearchContainer.nextSibling);
				} else {
					controlsContainer.insertBefore(multiContainer, controlsContainer.firstChild);
				}
			} else {
				// Fallback: add to body but with proper positioning
				document.body.appendChild(multiContainer);
			}
			console.log('Created new multi-label container in updateDropdownVisibility');
		}
		
		if (multiContainer) {
			multiContainer.style.display = 'block';
			multiContainer.style.position = 'relative'; // Ensure it stays in place
			console.log(`[BBox Editor] Populating multi-label dropdown for box ${preservedBoxIndex}`);
			// Populate the multi-label classes when showing
			populateMultiLabelClasses(inlineEditor._preservingDropdownState || false);
		}
		
		// Update the multi-label checkbox to reflect the state (but don't trigger events)
		// Only update checkbox if we're not forcing a specific state from external call
		if (forceMultiLabel === null) {
			if (inlineMultiLabelCheckbox && !inlineMultiLabelCheckbox.checked) {
				inlineMultiLabelCheckbox.checked = true;
			}
		}
	} else {
		console.log(`[BBox Editor] Entering single-label branch for box ${preservedBoxIndex}`);
		// Single-label mode: show class search, hide multi-label dropdown
		if (classSearchContainer) {
			classSearchContainer.style.display = 'block';
			classSearchContainer.style.position = 'relative'; // Ensure proper positioning
		}
		if (multiContainer) {
			multiContainer.style.display = 'none';
		}
		
		// Update the multi-label checkbox to reflect the state (but don't trigger events)
		// Only update checkbox if we're not forcing a specific state from external call
		if (forceMultiLabel === null) {
			if (inlineMultiLabelCheckbox && inlineMultiLabelCheckbox.checked) {
				inlineMultiLabelCheckbox.checked = false;
			}
		}
	}
	
	// CRITICAL: Restore preserved box selection after UI change
	if (preservedBoxIndex >= 0) {
		inlineEditor.currentBoxIndex = preservedBoxIndex;
	}
	
	debug(`Updated dropdown visibility - isMultiLabel: ${isCurrentBoxMultiLabel}, preservedBox: ${preservedBoxIndex}, forced: ${forceMultiLabel}`);
}	// Call updateDropdownVisibility whenever multi-label mode changes
	// Note: Only attach ONE event listener to avoid conflicts
   if (inlineMultiLabelCheckbox) {
	   // Replace with a cloned checkbox to clear existing listeners
	   const newCheckbox = inlineMultiLabelCheckbox.cloneNode(true);
	   inlineMultiLabelCheckbox.replaceWith(newCheckbox);
	   // Update variable to point to the new element
	   inlineMultiLabelCheckbox = newCheckbox;
	   // Attach change handler
	   inlineMultiLabelCheckbox.addEventListener('change', handleMultiLabelCheckboxChange);
   }

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

		// Multi-label checkbox - handled elsewhere to avoid conflicts

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
		let preventDropdownOpen = false;
		inputField.addEventListener('input', (e) => {
			// Don't reopen dropdown if we just closed it after a selection
			if (preventDropdownOpen) {
				preventDropdownOpen = false;
				return;
			}
			
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

				// Set flag to prevent dropdown from reopening due to input event
				preventDropdownOpen = true;

				// Update input field with selected text
				inputField.value = selectedText;

				// Update hidden select value
				hiddenSelect.value = selectedValue;

				// Hide dropdown
				dropdownContent.style.display = 'none';

				// Blur the input field to deactivate it
				inputField.blur();

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
						// Set flag to prevent dropdown from reopening due to input event
						preventDropdownOpen = true;
						selectedItem.click();
						// Ensure dropdown is closed after selection
						dropdownContent.style.display = 'none';
						// Blur the input field to deactivate it
						inputField.blur();
					} else if (items.length === 1) {
						// If only one item visible, select it
						preventDropdownOpen = true;
						items[0].click();
						// Ensure dropdown is closed after selection
						dropdownContent.style.display = 'none';
						// Blur the input field to deactivate it
						inputField.blur();
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
		inlineBboxSelector.innerHTML = '';
		const defaultOption = document.createElement('option');
		defaultOption.value = "-1";
		defaultOption.text = "-- Select a box --";
		inlineBboxSelector.appendChild(defaultOption);
		
		if (inlineEditor.bboxes.boxes && inlineEditor.bboxes.scores) {
			const processedGroups = new Set(); // Track which multi-label groups we've already added
			
			inlineEditor.bboxes.boxes.forEach((_, i) => {
				const isUncertain = (inlineEditor.bboxes.uncertain_flags && inlineEditor.bboxes.uncertain_flags[i]) || (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] === -1);
				const isMultiLabel = inlineEditor.bboxes.group && inlineEditor.bboxes.group[i] !== null && inlineEditor.bboxes.group[i] !== undefined;
				
				// For multi-label boxes, only show the group once (skip if we've already processed this group)
				if (isMultiLabel) {
					const groupId = inlineEditor.bboxes.group[i];
					if (processedGroups.has(groupId)) {
						return; // Skip this box, we've already added an option for this group
					}
					processedGroups.add(groupId);
				}
				
				const option = document.createElement('option');
				option.value = i;
				let labelText;
				
				if (isUncertain) {
					labelText = `Box ${i + 1}: Not Sure`;
				} else if (isMultiLabel) {
					// Multi-label: show comma-separated class IDs only (no class names)
					const groupId = inlineEditor.bboxes.group[i];
					const groupBoxIndices = inlineEditor.bboxes.group.map((g, idx) => g === groupId ? idx : -1).filter(idx => idx !== -1);
					const labelIds = groupBoxIndices
						.map(idx => inlineEditor.bboxes.labels[idx])
						.filter(label => label !== undefined && label !== null);
					
					// Find the first box in the group for numbering
					const firstBoxIndex = Math.min(...groupBoxIndices);
					
					if (labelIds.length > 0) {
						labelText = `Box ${firstBoxIndex + 1}: ${labelIds.join(',')}`;
					} else {
						labelText = `Box ${firstBoxIndex + 1}: NO LABELS`;
					}
					console.log(`Multi-label box ${firstBoxIndex + 1} has labels: ${labelIds.length > 0 ? labelIds.join(',') : 'NO LABELS'}`);
				} else if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] !== undefined) {
					const labelId = inlineEditor.bboxes.labels[i];
					const labelName = inlineEditor.classLabels[labelId] || `Class ${labelId}`;
					labelText = `Box ${i + 1}: ${labelId} - ${labelName}`;
				}
				
				option.text = labelText;
				
				// Apply multi-label green background color to match the box
				if (isMultiLabel) {
					option.style.backgroundColor = 'rgba(76, 175, 80, 0.85)'; // Same green as multiLabel style
					option.style.color = 'white';
				}
				
				// For multi-label boxes, check if the current box is in the same group
				if (isMultiLabel) {
					const groupId = inlineEditor.bboxes.group[i];
					const currentBoxGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
					option.selected = (groupId === currentBoxGroupId);
				} else {
					option.selected = i === inlineEditor.currentBoxIndex;
				}
				
				inlineBboxSelector.appendChild(option);
			});
		}
		
		if (inlineEditor.currentBoxIndex >= 0) {
			// For multi-label boxes, find the representative option (first box in group)
			const isCurrentMultiLabel = inlineEditor.bboxes.group && 
										inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
										inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;
			
			if (isCurrentMultiLabel) {
				const currentGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
				// Find the first box in this group (which should be the option we created)
				const groupBoxIndices = inlineEditor.bboxes.group.map((g, idx) => g === currentGroupId ? idx : -1).filter(idx => idx !== -1);
				const firstBoxInGroup = Math.min(...groupBoxIndices);
				inlineBboxSelector.value = firstBoxInGroup;
			} else {
				inlineBboxSelector.value = inlineEditor.currentBoxIndex;
			}
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

		// Update checkbox enabled state based on box selection
		updateCheckboxesEnabledState(boxIndex >= 0);

		// Debug selected box and its label
		if (boxIndex >= 0 && inlineEditor.bboxes && inlineEditor.bboxes.labels) {
			debug(`Selected box ${boxIndex} with label: ${inlineEditor.bboxes.labels[boxIndex]}`);
			
			// Update checkboxes based on the selected box
			updateCrowdCheckbox(boxIndex);
			updateReflectedCheckbox(boxIndex);
			updateRenditionCheckbox(boxIndex);
			updateOcrNeededCheckbox(boxIndex);
			updateMultiLabelCheckbox(boxIndex);
			
			// Update dropdown visibility when bbox selection changes
			updateDropdownVisibility();
			
			// Make sure class numbers checkbox reflects the editor's current setting
			if (inlineEditor.editor && inlineClassNumbersCheckbox) {
				inlineClassNumbersCheckbox.checked = inlineEditor.editor.getShowClassNumbersOnly();
			}

			// Check if this is an uncertain box - either by flag or by label value
			const isUncertain = (inlineEditor.bboxes.uncertain_flags &&
								 inlineEditor.bboxes.uncertain_flags[boxIndex]) ||
								 (inlineEditor.bboxes.labels &&
								 inlineEditor.bboxes.labels[boxIndex] === -1);

			// Make sure the correct class is selected in the enhanced UI
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

	function updateCheckboxesEnabledState(hasBoxSelected) {
		// Enable/disable all checkboxes except the simplified label names checkbox
		const checkboxes = [
			inlineCrowdCheckbox,
			inlineReflectedCheckbox,
			inlineRenditionCheckbox,
			inlineOcrNeededCheckbox,
			inlineMultiLabelCheckbox
		];
		
		checkboxes.forEach(checkbox => {
			if (checkbox) {
				checkbox.disabled = !hasBoxSelected;
				// Visual feedback for disabled state
				if (!hasBoxSelected) {
					checkbox.style.opacity = '0.5';
					checkbox.style.cursor = 'not-allowed';
				} else {
					checkbox.style.opacity = '1';
					checkbox.style.cursor = 'pointer';
				}
			}
		});
		
		// The class numbers checkbox (simplified label names) should always be enabled
		if (inlineClassNumbersCheckbox) {
			inlineClassNumbersCheckbox.disabled = false;
			inlineClassNumbersCheckbox.style.opacity = '1';
			inlineClassNumbersCheckbox.style.cursor = 'pointer';
		}
	}

	if (inlineCrowdCheckbox) {
		inlineCrowdCheckbox.addEventListener('change', handleCrowdCheckboxChange);
	}

	if (inlineReflectedCheckbox) {
		inlineReflectedCheckbox.addEventListener('change', handleReflectedCheckboxChange);
	}

	if (inlineRenditionCheckbox) {
		inlineRenditionCheckbox.addEventListener('change', handleRenditionCheckboxChange);
	}

	if (inlineOcrNeededCheckbox) {
		inlineOcrNeededCheckbox.addEventListener('change', handleOcrNeededCheckboxChange);
	}
	
	// Multi-label checkbox event is handled above to avoid duplicates

	if (inlineClassNumbersCheckbox) {
		inlineClassNumbersCheckbox.addEventListener('change', handleClassNumbersCheckboxChange);
	}

	function handleCrowdCheckboxChange() {
		if (inlineCrowdCheckbox.disabled || inlineEditor.currentBoxIndex < 0) return;
		inlineEditor.bboxes.crowd_flags[inlineEditor.currentBoxIndex] = inlineCrowdCheckbox.checked;
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
		}
		updateHiddenBboxesField();
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

	function handleReflectedCheckboxChange() {
		if (inlineReflectedCheckbox.disabled || inlineEditor.currentBoxIndex < 0) return;
		inlineEditor.bboxes.reflected_flags[inlineEditor.currentBoxIndex] = inlineReflectedCheckbox.checked;
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
		}
		updateHiddenBboxesField();
	}

	function updateReflectedCheckbox(boxIndex) {
		if (inlineReflectedCheckbox && inlineEditor.bboxes.reflected_flags) {
			inlineReflectedCheckbox.checked = inlineEditor.bboxes.reflected_flags[boxIndex];
			debug(`Set reflected checkbox to: ${inlineReflectedCheckbox.checked}`);

			// Also update the advanced editor's checkbox if it exists
			const advancedReflectedCheckbox = document.getElementById('bbox-reflected-checkbox');
			if (advancedReflectedCheckbox) {
				advancedReflectedCheckbox.checked = inlineEditor.bboxes.reflected_flags[boxIndex];
				debug(`Synced advanced reflected checkbox to: ${inlineEditor.bboxes.reflected_flags[boxIndex]}`);
			}
		}
	}

	function handleRenditionCheckboxChange() {
		if (inlineRenditionCheckbox.disabled || inlineEditor.currentBoxIndex < 0) return;
		inlineEditor.bboxes.rendition_flags[inlineEditor.currentBoxIndex] = inlineRenditionCheckbox.checked;
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
		}
		updateHiddenBboxesField();
	}

	function updateRenditionCheckbox(boxIndex) {
		if (inlineRenditionCheckbox && inlineEditor.bboxes.rendition_flags) {
			inlineRenditionCheckbox.checked = inlineEditor.bboxes.rendition_flags[boxIndex];
			debug(`Set rendition checkbox to: ${inlineRenditionCheckbox.checked}`);

			// Also update the advanced editor's checkbox if it exists
			const advancedRenditionCheckbox = document.getElementById('bbox-rendition-checkbox');
			if (advancedRenditionCheckbox) {
				advancedRenditionCheckbox.checked = inlineEditor.bboxes.rendition_flags[boxIndex];
				debug(`Synced advanced rendition checkbox to: ${inlineEditor.bboxes.rendition_flags[boxIndex]}`);
			}
		}
	}

	function handleOcrNeededCheckboxChange() {
		if (inlineOcrNeededCheckbox.disabled || inlineEditor.currentBoxIndex < 0) return;
		inlineEditor.bboxes.ocr_needed_flags[inlineEditor.currentBoxIndex] = inlineOcrNeededCheckbox.checked;
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
		}
		updateHiddenBboxesField();
	}

	function updateOcrNeededCheckbox(boxIndex) {
		if (inlineOcrNeededCheckbox && inlineEditor.bboxes.ocr_needed_flags) {
			inlineOcrNeededCheckbox.checked = inlineEditor.bboxes.ocr_needed_flags[boxIndex];
			debug(`Set ocr_needed checkbox to: ${inlineOcrNeededCheckbox.checked}`);

			// Also update the advanced editor's checkbox if it exists
			const advancedOcrNeededCheckbox = document.getElementById('bbox-ocr-needed-checkbox');
			if (advancedOcrNeededCheckbox) {
				advancedOcrNeededCheckbox.checked = inlineEditor.bboxes.ocr_needed_flags[boxIndex];
				debug(`Synced advanced ocr_needed checkbox to: ${inlineEditor.bboxes.ocr_needed_flags[boxIndex]}`);
			}
		}
	}
	
	function updateMultiLabelCheckbox(boxIndex) {
		if (inlineMultiLabelCheckbox && inlineEditor.bboxes.group) {
			// Check if this box is part of a multi-label group
			const isMultiLabel = inlineEditor.bboxes.group[boxIndex] !== null && 
								inlineEditor.bboxes.group[boxIndex] !== undefined;
			inlineMultiLabelCheckbox.checked = isMultiLabel;
			debug(`Set multi-label checkbox to: ${inlineMultiLabelCheckbox.checked}`);
			
			// Update dropdown visibility instead of toggle interface
			updateDropdownVisibility();
			
			// Also update the advanced editor's checkbox if it exists
			const advancedMultiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
			if (advancedMultiLabelCheckbox) {
				advancedMultiLabelCheckbox.checked = isMultiLabel;
				debug(`Synced advanced multi-label checkbox to: ${isMultiLabel}`);
			}
		}
	}

	function handleClassNumbersCheckboxChange() {
		// Pass the checkbox state to the editor
		if (inlineEditor.editor) {
			inlineEditor.editor.setShowClassNumbersOnly(inlineClassNumbersCheckbox.checked);
			
			// Update the advanced editor's checkbox 
			const advancedClassNumbersCheckbox = document.getElementById('bbox-class-numbers-checkbox');
			if (advancedClassNumbersCheckbox) {
				advancedClassNumbersCheckbox.checked = inlineClassNumbersCheckbox.checked;
			}
			
			// Redraw the canvas with the new setting
			inlineEditor.editor.redrawCanvas();
			
			debug(`Updated class numbers only mode to: ${inlineClassNumbersCheckbox.checked}`);
		}
	}
	
	function handleMultiLabelCheckboxChange() {
		// Prevent action if checkbox is disabled
		if (inlineMultiLabelCheckbox.disabled) {
			console.log('Multi-label checkbox is disabled - no action taken');
			return;
		}
		
		if (inlineEditor.currentBoxIndex < 0) {
			console.error('No box selected for multi-label mode toggle');
			return;
		}
		
		debug(`Multi-label checkbox changed to: ${inlineMultiLabelCheckbox.checked} for box ${inlineEditor.currentBoxIndex}`);
		
		// Initialize group array if it doesn't exist
		if (!inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group = new Array(inlineEditor.bboxes.boxes.length).fill(null);
			debug('Initialized group array');
		}
		
		// Update based on checkbox state
		if (inlineMultiLabelCheckbox.checked) {
			// Create a new group ID for this box - but DON'T automatically add any labels
			const groupId = Date.now(); // Use timestamp as unique ID
			inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] = groupId;
			
			// IMPORTANT: Do NOT automatically add ground truth or existing labels
			// The user must explicitly select labels from the dropdown
			console.log(`Enabled multi-label mode for box ${inlineEditor.currentBoxIndex} with group ${groupId}`);
			console.log('User must now select labels from the dropdown - no automatic addition');
			
			// Update dropdown visibility to show multi-label interface (force it to true)
			updateDropdownVisibility(true);
			
			// Update the bbox selector to show multi-label format
			if (typeof inlineEditor.updateBboxSelector === 'function') {
				inlineEditor.updateBboxSelector();
			} else {
				// Use the global function if the method doesn't exist on the object
				updateBboxSelector();
			}
		} else {
			// Get the current group ID
			const currentGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
			
			// If part of a group, find and remove all boxes in this group except the current one
			if (currentGroupId !== null && currentGroupId !== undefined) {
				// Get all boxes in this group
				const groupBoxes = inlineEditor.bboxes.group
					.map((g, i) => g === currentGroupId ? i : -1)
					.filter(i => i !== -1 && i !== inlineEditor.currentBoxIndex)
					.sort((a, b) => b - a); // Sort in descending order for safe removal
				
				// Count how many boxes with indices lower than current will be removed
				const removedBoxesBeforeCurrent = groupBoxes.filter(idx => idx < inlineEditor.currentBoxIndex).length;
				
				debug(`Removing ${groupBoxes.length} boxes from group ${currentGroupId}, ${removedBoxesBeforeCurrent} are before current box ${inlineEditor.currentBoxIndex}`);
				
				// Remove all other boxes in this group
				groupBoxes.forEach(idx => {
					removeBoxFromGroup(idx);
				});
				
				// Adjust currentBoxIndex to account for removed boxes with lower indices
				inlineEditor.currentBoxIndex -= removedBoxesBeforeCurrent;
				
				// Remove group ID from current box (making it a single-label box)
				inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] = null;
				debug(`Removed group for box ${inlineEditor.currentBoxIndex}, adjusted index by -${removedBoxesBeforeCurrent}. Box is now single-label.`);
				
				// Update the main editor's bboxes to keep them in sync
				if (inlineEditor.editor) {
					inlineEditor.editor.bboxes = inlineEditor.bboxes;
				}
			}
			
			// Update dropdown visibility to hide multi-label interface (force it to false)
			updateDropdownVisibility(false);
			
			// Update the bbox selector to show single-label format
			if (typeof inlineEditor.updateBboxSelector === 'function') {
				inlineEditor.updateBboxSelector();
			} else {
				// Use the global function if the method doesn't exist on the object
				updateBboxSelector();
			}
		}
		
		// Update the advanced editor's checkbox if it exists
		const advancedMultiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
		if (advancedMultiLabelCheckbox) {
			advancedMultiLabelCheckbox.checked = inlineMultiLabelCheckbox.checked;
			debug(`Synced advanced multi-label checkbox to: ${inlineMultiLabelCheckbox.checked}`);
		}
		
		// Redraw the canvas
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
			debug(`Redrawing canvas after multi-label checkbox change to ${inlineMultiLabelCheckbox.checked}`);
		}
		
		// Update hidden form field
		updateHiddenBboxesField();
	}
	
	function removeBoxFromGroup(boxIndex) {
		// Remove the box entry
		inlineEditor.bboxes.boxes.splice(boxIndex, 1);
		inlineEditor.bboxes.scores.splice(boxIndex, 1);
		inlineEditor.bboxes.labels.splice(boxIndex, 1);
		inlineEditor.bboxes.group.splice(boxIndex, 1);
		
		// Remove other flags as well
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags.splice(boxIndex, 1);
		}
		if (inlineEditor.bboxes.reflected_flags) {
			inlineEditor.bboxes.reflected_flags.splice(boxIndex, 1);
		}
		if (inlineEditor.bboxes.rendition_flags) {
			inlineEditor.bboxes.rendition_flags.splice(boxIndex, 1);
		}
		if (inlineEditor.bboxes.ocr_needed_flags) {
			inlineEditor.bboxes.ocr_needed_flags.splice(boxIndex, 1);
		}
		if (inlineEditor.bboxes.uncertain_flags) {
			inlineEditor.bboxes.uncertain_flags.splice(boxIndex, 1);
		}
		if (inlineEditor.bboxes.possible_labels) {
			inlineEditor.bboxes.possible_labels.splice(boxIndex, 1);
		}
		
		// Update editor's selectedBboxIndex to match the inline editor
		// This ensures both editors stay in sync
		if (inlineEditor.editor) {
			// If the removed box was before the current selection, adjust the editor's index
			if (boxIndex < inlineEditor.currentBoxIndex) {
				inlineEditor.editor.selectedBboxIndex = inlineEditor.currentBoxIndex - 1;
			} else if (boxIndex === inlineEditor.currentBoxIndex) {
				// The selected box was removed, this should be handled by the caller
				inlineEditor.editor.selectedBboxIndex = -1;
			} else {
				// The removed box was after the current selection, no change needed
				inlineEditor.editor.selectedBboxIndex = inlineEditor.currentBoxIndex;
			}
		}
		
		debug(`Removed box at index ${boxIndex} from all arrays`);
	}
	
	function toggleMultiLabelInterface(show) {
		let multiLabelContainer = document.getElementById('inline-multi-label-selection-container');
		let singleLabelContainer = document.getElementById('single-label-selector-container') || 
								  document.querySelector('.custom-class-selector')?.parentElement;
		
		console.log('Toggle containers:', {
			multiLabelContainer: multiLabelContainer,
			singleLabelContainer: singleLabelContainer,
			allContainers: document.querySelectorAll('.control-group')
		});
		
		if (!multiLabelContainer) {
			console.error('Could not find multi-label container. ID: inline-multi-label-selection-container');
			// Try with alternative IDs that might exist
			const altMultiLabelContainer = document.querySelector('.multi-label-checkboxes') ||
										  document.querySelector('[id*="multi-label"]');
			if (altMultiLabelContainer) {
				console.log('Found alternative multi-label container:', altMultiLabelContainer);
				// Continue with the alternative container
				multiLabelContainer = altMultiLabelContainer;
			} else {
				// Create the container if it doesn't exist
				multiLabelContainer = document.createElement('div');
				multiLabelContainer.id = 'inline-multi-label-selection-container';
				multiLabelContainer.className = 'control-group';
				multiLabelContainer.style.display = 'none';
				multiLabelContainer.style.position = 'absolute';
				multiLabelContainer.style.background = 'white';
				multiLabelContainer.style.border = '1px solid #aaa';
				multiLabelContainer.style.padding = '10px';
				multiLabelContainer.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
				multiLabelContainer.style.maxHeight = '300px';
				multiLabelContainer.style.overflowY = 'auto';
				multiLabelContainer.style.borderRadius = '4px';
				multiLabelContainer.style.zIndex = '999';
				
				const checkboxesContainer = document.createElement('div');
				checkboxesContainer.className = 'multi-label-checkboxes';
				checkboxesContainer.style.display = 'flex';
				checkboxesContainer.style.flexDirection = 'column';
				checkboxesContainer.style.gap = '5px';
				
				multiLabelContainer.appendChild(checkboxesContainer);
				
				// Add it to the editor area
				const editorArea = document.querySelector('.editor-controls') || document.body;
				editorArea.appendChild(multiLabelContainer);
				console.log('Created new multi-label container');
			}
		}
		
		if (!singleLabelContainer) {
			console.error('Could not find single-label container. ID: single-label-selector-container');
			// Try with alternative IDs that might exist
			const altSingleLabelContainer = document.querySelector('.editor-selector')?.parentNode ||
										   document.getElementById('inline-class-search')?.parentNode;
			if (altSingleLabelContainer) {
				console.log('Found alternative single-label container:', altSingleLabelContainer);
				// Continue with the alternative container
				singleLabelContainer = altSingleLabelContainer;
			}
		}
		
		if (!multiLabelContainer || !singleLabelContainer) {
			console.error('Could not find multi-label or single-label container in inline editor');
			console.log('multiLabelContainer:', multiLabelContainer);
			console.log('singleLabelContainer:', singleLabelContainer);
			return;
		}
		
		if (show) {
			// Position the multi-label container exactly where the single-label container is
			// Get the coordinates and dimensions first, with null checks
			let singleRect, parentRect;
			
			try {
				singleRect = singleLabelContainer.getBoundingClientRect();
				parentRect = singleLabelContainer.offsetParent ? 
					singleLabelContainer.offsetParent.getBoundingClientRect() : 
					{ top: 0, left: 0 };
			} catch (error) {
				console.error('Error getting container dimensions:', error);
				// Fallback positioning
				singleRect = { top: 0, left: 0, width: 200 };
				parentRect = { top: 0, left: 0 };
			}
			
			// Hide single-label and show multi-label
			singleLabelContainer.style.display = 'none';
			
			// Position the multi-label container
			multiLabelContainer.style.display = 'block';
			multiLabelContainer.style.position = 'absolute';
			multiLabelContainer.style.top = (singleRect.top - parentRect.top) + 'px';
			multiLabelContainer.style.left = (singleRect.left - parentRect.left) + 'px';
			multiLabelContainer.style.width = singleRect.width + 'px';
			multiLabelContainer.style.minWidth = '200px'; // Ensure it's visible
			multiLabelContainer.style.zIndex = '999'; // Ensure it's on top
			
			console.log('Showing multi-label interface in inline editor at position:', {
				top: (singleRect.top - parentRect.top) + 'px',
				left: (singleRect.left - parentRect.left) + 'px',
				width: singleRect.width + 'px'
			});
			
			// Populate with checkboxes
			populateMultiLabelClasses(inlineEditor._preservingDropdownState || false);
			
			// Also update the advanced editor if it's open
			// Sync with advanced editor if it's open
			const advancedSingleLabelContainer = document.getElementById('bbox-single-label-container');
			const advancedMultiLabelContainer = document.getElementById('multi-label-selection-container');
			if (advancedSingleLabelContainer && advancedMultiLabelContainer) {
				advancedSingleLabelContainer.style.display = 'none';
				advancedMultiLabelContainer.style.display = 'block';
				
				// Ensure BBoxEditorUI also knows we're in multi-label mode
				if (window.BBoxEditorUI && window.BBoxEditorUI.editor) {
					console.log('Syncing multi-label mode with advanced editor');
					const multiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
					if (multiLabelCheckbox) {
						multiLabelCheckbox.checked = true;
					}
				}
			}
		} else {
			// Show single-label and hide multi-label
			multiLabelContainer.style.display = 'none';
			singleLabelContainer.style.display = 'block';
			
			// Sync with advanced editor if it's open
			const advancedSingleLabelContainer = document.getElementById('bbox-single-label-container');
			const advancedMultiLabelContainer = document.getElementById('multi-label-selection-container');
			if (advancedSingleLabelContainer && advancedMultiLabelContainer) {
				advancedSingleLabelContainer.style.display = 'block';
				advancedMultiLabelContainer.style.display = 'none';
				
				// Ensure BBoxEditorUI also knows we're in single-label mode
				if (window.BBoxEditorUI && window.BBoxEditorUI.editor) {
					console.log('Syncing single-label mode with advanced editor');
					const multiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
					if (multiLabelCheckbox) {
						multiLabelCheckbox.checked = false;
					}
				}
			}
		}
	}
	
	function populateMultiLabelClasses(preserveDropdownState = false) {
		const multiLabelContainer = document.getElementById('inline-multi-label-selection-container');
		if (!multiLabelContainer || !inlineEditor.bboxes) {
			console.error('Multi-label container or bboxes not found');
			return;
		}
		
		// If preserveDropdownState is true, check if dropdown exists and preserve its state
		let wasDropdownOpen = false;
		const existingDropdownOptions = multiLabelContainer.querySelector('.multi-label-dropdown-options');
		if (preserveDropdownState && existingDropdownOptions) {
			wasDropdownOpen = existingDropdownOptions.style.display === 'block';
		}
		
		// Clean up any existing event handlers
		const existingWrapper = multiLabelContainer.querySelector('.multi-label-dropdown-wrapper');
		if (existingWrapper && existingWrapper._closeHandler) {
			document.removeEventListener('click', existingWrapper._closeHandler);
		}
		
		// Clear existing content
		multiLabelContainer.innerHTML = '';
		console.log('Populating multi-label classes. Container found:', multiLabelContainer);
		
		// Create wrapper with unified input/dropdown pattern (inspired by grid-view)
		const dropdownWrapper = document.createElement('div');
		dropdownWrapper.className = 'multi-label-dropdown-wrapper';
		dropdownWrapper.style.cssText = `
			position: relative;
			width: 100%;
		`;
		
		// Create unified search input that handles both search and dropdown (grid-view pattern)
		const searchInput = document.createElement('input');
		searchInput.type = 'text';
		searchInput.className = 'editor-selector multi-label-search';
		searchInput.placeholder = 'Search or click to select classes...';
		searchInput.autocomplete = 'off';
		searchInput.style.cssText = `
			cursor: pointer;
		`;
		// Match width of single-label search input
		const singleInput = document.getElementById('inline-class-search');
		if (singleInput) {
			const w = window.getComputedStyle(singleInput).width;
			searchInput.style.width = w;
		}
		
		// Create dropdown options container
		const dropdownOptions = document.createElement('div');
		dropdownOptions.className = 'multi-label-dropdown-options';
		dropdownOptions.style.cssText = `
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			background: white;
			border: 1px solid #ddd;
			border-top: none;
			max-height: 200px;
			overflow-y: auto;
			z-index: 1000;
			display: none;
			box-shadow: 0 2px 5px rgba(0,0,0,0.2);
			border-radius: 0 0 4px 4px;
		`;
		
		// Get current selected labels and GT box information
		const groupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
		const groupBoxIndices = groupId !== null && groupId !== undefined ? 
			inlineEditor.bboxes.group.map((g, i) => g === groupId ? i : -1).filter(i => i !== -1) : 
			[inlineEditor.currentBoxIndex];
		// Convert labels to numbers for comparison
		const selectedLabels = groupBoxIndices.map(idx => parseInt(inlineEditor.bboxes.labels[idx]));
		
		// Get the current box's label to highlight it (instead of GT)
		let currentBoxLabel = null;
		if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex] !== undefined) {
			currentBoxLabel = inlineEditor.bboxes.labels[inlineEditor.currentBoxIndex];
		}
		
		// Store all class options for filtering
		let allClassOptions = [];
		
		// Update search placeholder (simplified - no class count)
		function updateSelectedLabelsDisplay() {
			searchInput.placeholder = 'Search or click to select classes...';
		}
		
		// Function to filter dropdown options based on search
		function filterDropdownOptions(searchTerm) {
			allClassOptions.forEach(optionDiv => {
				const label = optionDiv.querySelector('label').textContent.toLowerCase();
				const matches = label.includes(searchTerm.toLowerCase());
				optionDiv.style.display = matches ? 'flex' : 'none';
			});
		}
		
		// Handle search input
		searchInput.addEventListener('input', (e) => {
			filterDropdownOptions(e.target.value);
		});
		
		// Show options on input focus or click
		searchInput.addEventListener('focus', function() {
			dropdownOptions.classList.add('show');
			dropdownOptions.style.display = 'block';
		});
		
		searchInput.addEventListener('click', function() {
			dropdownOptions.classList.add('show');
			dropdownOptions.style.display = 'block';
		});
		
		// Populate dropdown with class options
		if (!inlineEditor.classLabels || Object.keys(inlineEditor.classLabels).length === 0) {
			// Try to recover class labels from selector
			const classSelector = document.getElementById('inline-class-selector');
			if (classSelector) {
				const options = Array.from(classSelector.options);
				inlineEditor.classLabels = {};
				options.forEach(option => {
					if (option.value && option.value !== "-1") {
						const parts = option.text.split(' - ');
						if (parts.length >= 2) {
							const classId = parts[0].trim();
							const className = parts[1].trim();
							inlineEditor.classLabels[classId] = className;
						}
					}
				});
			}
		}
		
		Object.keys(inlineEditor.classLabels).forEach(classId => {
			const className = inlineEditor.classLabels[classId];
			const isCurrentBoxLabel = parseInt(classId) === currentBoxLabel;
			
			const optionDiv = document.createElement('div');
			optionDiv.className = 'multi-label-dropdown-option';
			optionDiv.style.cssText = `
				padding: 6px 8px;
				cursor: pointer;
				display: flex;
				align-items: center;
				border-bottom: 1px solid #eee;
				font-size: 14px;
				${isCurrentBoxLabel ? 'background-color: #e3f2fd;' : ''}
			`;
			
			// Create checkbox
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = `multi-label-class-${classId}`;
			checkbox.value = classId;
			// Check if this class is selected in any box of the current group
			const isClassSelected = selectedLabels.includes(parseInt(classId));
			checkbox.checked = isClassSelected;
			checkbox.style.marginRight = '6px';
			
			// Create label
			const label = document.createElement('label');
			label.htmlFor = `multi-label-class-${classId}`;
			label.textContent = `${classId} - ${className}${isCurrentBoxLabel ? ' (Current)' : ''}`;
			label.style.cursor = 'pointer';
			label.style.flex = '1';
			label.style.fontSize = '14px';
			if (isCurrentBoxLabel) {
				label.style.fontWeight = 'bold';
			}
			
			// Add hover effect
			optionDiv.addEventListener('mouseenter', () => {
				optionDiv.style.backgroundColor = isCurrentBoxLabel ? '#bbdefb' : '#f5f5f5';
			});
			optionDiv.addEventListener('mouseleave', () => {
				optionDiv.style.backgroundColor = isCurrentBoxLabel ? '#e3f2fd' : 'white';
			});
			
			// Handle clicks - only respond to direct checkbox clicks
			optionDiv.addEventListener('click', (e) => {
				e.stopPropagation();
				// Only handle if clicking directly on the checkbox
				if (e.target === checkbox) {
					// Allow unchecking any labels including current box label
					if (isCurrentBoxLabel && !checkbox.checked) {
						console.log('Current box label unchecked:', classId);
					}
					handleMultiLabelClassSelection(parseInt(classId), checkbox.checked);
					updateSelectedLabelsDisplay();
				}
			});
			
			// Handle checkbox clicks to prevent double-toggling
			checkbox.addEventListener('click', (e) => {
				e.stopPropagation();
				// Checkbox state is already updated by the browser, just handle the selection
				handleMultiLabelClassSelection(parseInt(classId), checkbox.checked);
				updateSelectedLabelsDisplay();
			});
			
			optionDiv.appendChild(checkbox);
			optionDiv.appendChild(label);
			dropdownOptions.appendChild(optionDiv);
			allClassOptions.push(optionDiv);
		});
		
		// Close dropdown when clicking outside
		const closeDropdownHandler = (e) => {
			if (!dropdownWrapper.contains(e.target)) {
				dropdownOptions.style.display = 'none';
				dropdownOptions.classList.remove('show');
			}
		};
		
		// Remove any existing handlers first to prevent duplicates
		document.removeEventListener('click', closeDropdownHandler);
		document.addEventListener('click', closeDropdownHandler);
		
		// Store reference for cleanup
		dropdownWrapper._closeHandler = closeDropdownHandler;
		
		// Initial display update
		updateSelectedLabelsDisplay();
		
		// Assemble the dropdown components (no class label)
		dropdownWrapper.appendChild(searchInput);
		dropdownWrapper.appendChild(dropdownOptions);
		multiLabelContainer.appendChild(dropdownWrapper);
		
		// Ensure it's visible
		multiLabelContainer.style.display = 'block';
		
		// Restore dropdown state if it was previously open
		if (preserveDropdownState && wasDropdownOpen) {
			const newDropdownOptions = multiLabelContainer.querySelector('.multi-label-dropdown-options');
			if (newDropdownOptions) {
				newDropdownOptions.style.display = 'block';
				newDropdownOptions.classList.add('show');
			}
		}
		
		debug(`Multi-label dropdown populated with ${Object.keys(inlineEditor.classLabels).length} classes. Current box label: ${currentBoxLabel}`);
	}
	
	function handleMultiLabelClassSelection(classId, isSelected) {
		if (!inlineEditor.bboxes || !inlineEditor.bboxes.group || inlineEditor.currentBoxIndex < 0) {
			console.error('Cannot handle multi-label selection: invalid state');
			return;
		}
		
		// Get the current group ID
		let groupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
		
		console.log(`Multi-label selection: class ${classId}, selected: ${isSelected}, group: ${groupId}, box: ${inlineEditor.currentBoxIndex}`);
		
		// Prevent automatic addition of ground truth or default labels
		// Only process explicit user selections
		
		if (isSelected) {
			// If no group exists, create a new group ID using sequential numbering
			if (groupId === null || groupId === undefined) {
				groupId = inlineEditor.nextGroupId++;
				inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] = groupId;
				console.log(`Created new group ${groupId} for box ${inlineEditor.currentBoxIndex}`);
			}
			
			// Check if this class is already selected for this group
			const existingBoxWithClass = findBoxInGroup(groupId, classId);
			if (existingBoxWithClass !== -1) {
				console.log(`Class ${classId} already exists in group ${groupId}`);
				return; // Class already exists in this group
			}
			
			// Add the class by cloning the current box with the new class
			addBoxToGroup(inlineEditor.currentBoxIndex, groupId, classId);
			console.log(`Added class ${classId} to group ${groupId}`);
		} else {
			// Remove the box with this class from the group
			if (groupId !== null && groupId !== undefined) {
				const boxToRemove = findBoxInGroup(groupId, classId);
				if (boxToRemove !== -1) {
					// Find a replacement box in the same group BEFORE removal
					// to ensure we maintain selection within the group
					let newSelectedBox = -1;
					for (let i = 0; i < inlineEditor.bboxes.group.length; i++) {
						if (inlineEditor.bboxes.group[i] === groupId && i !== boxToRemove) {
							newSelectedBox = i;
							break;
						}
					}
					
					// Calculate the adjusted index for the replacement box after removal
					let adjustedNewSelectedBox = newSelectedBox;
					if (newSelectedBox !== -1 && newSelectedBox > boxToRemove) {
						adjustedNewSelectedBox = newSelectedBox - 1;
					}
					
					console.log(`Removing box ${boxToRemove} with class ${classId} from group ${groupId}`);
					console.log(`Original current box: ${inlineEditor.currentBoxIndex}, replacement: ${newSelectedBox}, adjusted: ${adjustedNewSelectedBox}`);
					
					// Remove the selected label box from group
					removeBoxFromGroup(boxToRemove);
					console.log(`Removed class ${classId} from group ${groupId}`);
					
					// Always maintain selection within the same group
					if (adjustedNewSelectedBox !== -1) {
						// Preserve dropdown state when updating selection
						const dropdownOptions = document.querySelector('.multi-label-dropdown-options');
						const wasDropdownOpen = dropdownOptions && dropdownOptions.style.display === 'block';
						
						// Temporarily set a flag to prevent dropdown recreation
						inlineEditor._preservingDropdownState = true;
						
						// Use selectBox function to ensure all UI updates happen correctly
						selectBox(adjustedNewSelectedBox);
						console.log(`Selection maintained in same group at adjusted box ${adjustedNewSelectedBox}`);
						
						// Clear the flag
						inlineEditor._preservingDropdownState = false;
						
						// Restore dropdown state after selection update
						if (wasDropdownOpen) {
							const newDropdownOptions = document.querySelector('.multi-label-dropdown-options');
							if (newDropdownOptions) {
								newDropdownOptions.style.display = 'block';
								newDropdownOptions.classList.add('show');
							}
						}
					} else {
						// No boxes left in group, clear selection
						selectBox(-1);
						console.log(`No other boxes in group, cleared selection`);
					}
					
					// Refresh the bbox selector
					if (typeof inlineEditor.updateBboxSelector === 'function') {
						inlineEditor.updateBboxSelector();
					} else {
						updateBboxSelector();
					}
				}
				
				// Check if there are any boxes left in the group with actual labels
				const remainingBoxesWithLabels = inlineEditor.bboxes.group
					.map((g, idx) => ({ group: g, index: idx, label: inlineEditor.bboxes.labels[idx] }))
					.filter(item => item.group === groupId && item.label !== undefined && item.label !== null);
				
				// Only remove the group ID if there are no boxes with labels left
				// This allows boxes to remain as "NO LABELS" multi-label boxes
				if (remainingBoxesWithLabels.length === 0) {
					// Keep the current box visible but ensure it shows "NO LABELS"
					console.log(`Group ${groupId} now has no labels - will show "NO LABELS"`);
				}
			}
		}
		
		// Redraw the canvas
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
		}
		
		// Update the bbox selector
		if (typeof inlineEditor.updateBboxSelector === 'function') {
			inlineEditor.updateBboxSelector();
		} else {
			// Use the global function if the method doesn't exist on the object
			updateBboxSelector();
		}
		
		// Update the hidden field
		updateHiddenBboxesField();
		
		console.log('Multi-label box updated, refreshed selector and canvas');
	}
	
	function findBoxInGroup(groupId, classId) {
		if (!inlineEditor.bboxes || !inlineEditor.bboxes.group || !inlineEditor.bboxes.labels) {
			return -1;
		}
		
		return inlineEditor.bboxes.group.findIndex((g, i) => 
			g === groupId && inlineEditor.bboxes.labels[i] === classId);
	}
	
	function addBoxToGroup(sourceBoxIndex, groupId, newClassId) {
		// Clone the box attributes
		const box = [...inlineEditor.bboxes.boxes[sourceBoxIndex]];
		const score = inlineEditor.bboxes.scores[sourceBoxIndex];
		
		// Create a new box entry with the same coordinates but different class
		inlineEditor.bboxes.boxes.push(box);
		inlineEditor.bboxes.scores.push(score);
		inlineEditor.bboxes.labels.push(newClassId);
		inlineEditor.bboxes.group.push(groupId);
		
		// Remove OOD border if it exists (when adding a bbox after marking as "None of ImageNet")
		if (window.removeOODBorder) {
			window.removeOODBorder();
		}
		
		// Add other flags as well
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags.push(inlineEditor.bboxes.crowd_flags[sourceBoxIndex]);
		}
		if (inlineEditor.bboxes.reflected_flags) {
			inlineEditor.bboxes.reflected_flags.push(inlineEditor.bboxes.reflected_flags[sourceBoxIndex]);
		}
		if (inlineEditor.bboxes.rendition_flags) {
			inlineEditor.bboxes.rendition_flags.push(inlineEditor.bboxes.rendition_flags[sourceBoxIndex]);
		}
		if (inlineEditor.bboxes.ocr_needed_flags) {
			inlineEditor.bboxes.ocr_needed_flags.push(inlineEditor.bboxes.ocr_needed_flags[sourceBoxIndex]);
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
		
		// Check if this is part of a multi-label group
		const isMultiLabel = inlineEditor.bboxes.group && 
							inlineEditor.bboxes.group[deletedIndex] !== null && 
							inlineEditor.bboxes.group[deletedIndex] !== undefined;
		
		if (isMultiLabel) {
			// Delete entire multi-label group
			const groupId = inlineEditor.bboxes.group[deletedIndex];
			deleteMultiLabelGroup(groupId);
		} else {
			// Delete single box
			deleteSingleBox(deletedIndex);
		}

		// Reset selection
		inlineEditor.currentBoxIndex = -1;

		// Disable checkboxes since no box is selected
		updateCheckboxesEnabledState(false);

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

		debug(`Deleted box/group at index ${deletedIndex}`);
	}
	
	function deleteMultiLabelGroup(groupId) {
		if (!inlineEditor.bboxes || !inlineEditor.bboxes.group) return;
		
		// Find all boxes in this group and collect their indices (sorted descending for safe removal)
		const boxIndicesInGroup = [];
		inlineEditor.bboxes.group.forEach((g, i) => {
			if (g === groupId) {
				boxIndicesInGroup.push(i);
			}
		});
		
		// Sort in descending order to avoid index shifting issues during removal
		boxIndicesInGroup.sort((a, b) => b - a);
		
		// Remove all boxes in the group, but handle index updates carefully
		// Since we're deleting in descending order, we need to avoid the automatic
		// index updates in deleteSingleBox for all but the last deletion
		boxIndicesInGroup.forEach((index, i) => {
			const isLastDeletion = i === boxIndicesInGroup.length - 1;
			
			// Manually remove the data without calling deleteSingleBox's index update logic
			inlineEditor.bboxes.boxes.splice(index, 1);
			inlineEditor.bboxes.scores.splice(index, 1);

			if (inlineEditor.bboxes.labels) {
				inlineEditor.bboxes.labels.splice(index, 1);
			}

			if (inlineEditor.bboxes.group) {
				inlineEditor.bboxes.group.splice(index, 1);
			}

			if (inlineEditor.bboxes.crowd_flags) {
				inlineEditor.bboxes.crowd_flags.splice(index, 1);
			}

			if (inlineEditor.bboxes.reflected_flags) {
				inlineEditor.bboxes.reflected_flags.splice(index, 1);
			}

			if (inlineEditor.bboxes.rendition_flags) {
				inlineEditor.bboxes.rendition_flags.splice(index, 1);
			}

			if (inlineEditor.bboxes.uncertain_flags) {
				inlineEditor.bboxes.uncertain_flags.splice(index, 1);
			}

			if (inlineEditor.bboxes.possible_labels) {
				inlineEditor.bboxes.possible_labels.splice(index, 1);
			}

			if (inlineEditor.bboxes.gt) {
				inlineEditor.bboxes.gt.splice(index, 1);
			}
		});
		
		// Now handle index updates once at the end
		// Find the lowest index that was deleted (since we sorted descending, it's the last one)
		const lowestDeletedIndex = boxIndicesInGroup[boxIndicesInGroup.length - 1];
		const numDeletedBoxes = boxIndicesInGroup.length;
		
		// Update currentBoxIndex
		if (boxIndicesInGroup.includes(inlineEditor.currentBoxIndex)) {
			inlineEditor.currentBoxIndex = -1; // Selected box was part of the deleted group
		} else if (inlineEditor.currentBoxIndex > lowestDeletedIndex) {
			// Adjust for all the boxes that were deleted before this index
			const numDeletedBefore = boxIndicesInGroup.filter(deletedIndex => deletedIndex < inlineEditor.currentBoxIndex).length;
			inlineEditor.currentBoxIndex -= numDeletedBefore;
		}

		// Update editor's selectedBboxIndex
		if (inlineEditor.editor) {
			if (boxIndicesInGroup.includes(inlineEditor.editor.selectedBboxIndex)) {
				inlineEditor.editor.selectedBboxIndex = -1; // Selected box was part of the deleted group
			} else if (inlineEditor.editor.selectedBboxIndex > lowestDeletedIndex) {
				// Adjust for all the boxes that were deleted before this index
				const numDeletedBefore = boxIndicesInGroup.filter(deletedIndex => deletedIndex < inlineEditor.editor.selectedBboxIndex).length;
				inlineEditor.editor.selectedBboxIndex -= numDeletedBefore;
			}
		}
		
		debug(`Deleted multi-label group ${groupId} with ${boxIndicesInGroup.length} boxes`);
	}
	
	function deleteSingleBox(index) {
		// Remove box, score, label, and flags
		inlineEditor.bboxes.boxes.splice(index, 1);
		inlineEditor.bboxes.scores.splice(index, 1);

		if (inlineEditor.bboxes.labels) {
			inlineEditor.bboxes.labels.splice(index, 1);
		}

		// Remove group info if it exists
		if (inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group.splice(index, 1);
		}

		// Remove crowd flag if it exists
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags.splice(index, 1);
		}

		// Remove reflected object flag if it exists
		if (inlineEditor.bboxes.reflected_flags) {
			inlineEditor.bboxes.reflected_flags.splice(index, 1);
		}

		// Remove rendition flag if it exists
		if (inlineEditor.bboxes.rendition_flags) {
			inlineEditor.bboxes.rendition_flags.splice(index, 1);
		}

		// Remove uncertain flag and possible_labels if they exist
		if (inlineEditor.bboxes.uncertain_flags) {
			inlineEditor.bboxes.uncertain_flags.splice(index, 1);
		}

		if (inlineEditor.bboxes.possible_labels) {
			inlineEditor.bboxes.possible_labels.splice(index, 1);
		}

		// Also remove from gt if it exists
		if (inlineEditor.bboxes.gt) {
			inlineEditor.bboxes.gt.splice(index, 1);
		}

		// Update stored indices after deletion
		// All indices greater than the deleted index need to be decremented
		
		// Update currentBoxIndex
		if (inlineEditor.currentBoxIndex > index) {
			inlineEditor.currentBoxIndex--;
		} else if (inlineEditor.currentBoxIndex === index) {
			inlineEditor.currentBoxIndex = -1; // The selected box was deleted
		}

		// Update editor's selectedBboxIndex
		if (inlineEditor.editor) {
			if (inlineEditor.editor.selectedBboxIndex > index) {
				inlineEditor.editor.selectedBboxIndex--;
			} else if (inlineEditor.editor.selectedBboxIndex === index) {
				inlineEditor.editor.selectedBboxIndex = -1; // The selected box was deleted
			}
		}

		debug(`Deleted single box at index ${index}, updated indices accordingly`);
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
		if (inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group = [];
		}
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags = [];
		}
		if (inlineEditor.bboxes.reflected_flags) {
			inlineEditor.bboxes.reflected_flags = [];
		}
		if (inlineEditor.bboxes.rendition_flags) {
			inlineEditor.bboxes.rendition_flags = [];
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

		// Disable checkboxes since no box is selected
		updateCheckboxesEnabledState(false);

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

		// Build the bbox data array (same logic as updateHiddenBboxesField)
		for (let i = 0; i < inlineEditor.bboxes.boxes.length; i++) {
			if (!inlineEditor.bboxes.boxes[i]) {
				continue; // Skip if box is null/undefined
			}

			// Check if this is an uncertain box
			let isUncertain = false;
			if (inlineEditor.bboxes.uncertain_flags && inlineEditor.bboxes.uncertain_flags[i]) {
				isUncertain = true;
			}
			if (inlineEditor.bboxes.labels && inlineEditor.bboxes.labels[i] === -1) {
				isUncertain = true;
			}

			const bboxData = {
				coordinates: inlineEditor.bboxes.boxes[i],
				crowd_flag: inlineEditor.bboxes.crowd_flags && inlineEditor.bboxes.crowd_flags[i],
				reflected_flag: inlineEditor.bboxes.reflected_flags && inlineEditor.bboxes.reflected_flags[i],
				rendition_flag: inlineEditor.bboxes.rendition_flags && inlineEditor.bboxes.rendition_flags[i],
				ocr_needed_flag: inlineEditor.bboxes.ocr_needed_flags && inlineEditor.bboxes.ocr_needed_flags[i]
			};

			// Add group id if this is part of a multi-label box
			if (inlineEditor.bboxes.group && inlineEditor.bboxes.group[i] !== null) {
				bboxData.group = inlineEditor.bboxes.group[i];
			}

			if (isUncertain) {
				// For uncertain boxes, include possible_labels and uncertain_flag
				bboxData.uncertain_flag = true;

				// Get possible_labels array
				if (inlineEditor.bboxes.possible_labels && inlineEditor.bboxes.possible_labels[i]) {
					const possibleLabels = inlineEditor.bboxes.possible_labels[i];
					if (Array.isArray(possibleLabels)) {
						bboxData.possible_labels = possibleLabels;
					} else {
						const labelArray = [];
						for (const key in possibleLabels) {
							if (possibleLabels.hasOwnProperty(key)) {
								labelArray.push(parseInt(key));
							}
						}
						bboxData.possible_labels = labelArray;
					}
				} else {
					bboxData.possible_labels = [];
				}

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
		const labelType = hasUncertainBoxes ? "uncertain" : "basic";
		if (labelTypeField) {
			labelTypeField.value = labelType;
		}

		// Create the save data object
		const saveData = {
			image_name: imageName,
			bboxes: bboxDataArray,
			label_type: labelType
		};

		debug(`Saving ${bboxDataArray.length} bboxes with label_type: ${saveData.label_type}`);
		debug(`Save data preview: ${JSON.stringify(saveData).substring(0, 200)}...`);

		// Check if we're in sanity check mode
		const sanityModeElement = document.querySelector('input[name="sanity_check_mode"]');
		const sanityMode = sanityModeElement ? sanityModeElement.value : null;
		
		// Determine the save endpoint based on sanity mode
		const saveEndpoint = sanityMode ? `/${username}/save_bboxes_sanity/${sanityMode}` : `/${username}/save_bboxes`;
		
		debug(`Using save endpoint: ${saveEndpoint}`);

		// Make AJAX call
		fetch(saveEndpoint, {
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
					
					// Remove OOD border if it exists (when adding a bbox after marking as "None of ImageNet")
					if (window.removeOODBorder) {
						window.removeOODBorder();
					}

					// Make sure arrays exist with proper length
					if (!inlineEditor.bboxes.crowd_flags) {
						inlineEditor.bboxes.crowd_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					} else if (inlineEditor.bboxes.crowd_flags.length < inlineEditor.bboxes.boxes.length) {
						// Extend existing array if needed
						while (inlineEditor.bboxes.crowd_flags.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.crowd_flags.push(false);
						}
					}

					if (!inlineEditor.bboxes.reflected_flags) {
						inlineEditor.bboxes.reflected_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					} else if (inlineEditor.bboxes.reflected_flags.length < inlineEditor.bboxes.boxes.length) {
						// Extend existing array if needed
						while (inlineEditor.bboxes.reflected_flags.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.reflected_flags.push(false);
						}
					}

					if (!inlineEditor.bboxes.rendition_flags) {
						inlineEditor.bboxes.rendition_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					} else if (inlineEditor.bboxes.rendition_flags.length < inlineEditor.bboxes.boxes.length) {
						// Extend existing array if needed
						while (inlineEditor.bboxes.rendition_flags.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.rendition_flags.push(false);
						}
					}

					if (!inlineEditor.bboxes.ocr_needed_flags) {
						inlineEditor.bboxes.ocr_needed_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					} else if (inlineEditor.bboxes.ocr_needed_flags.length < inlineEditor.bboxes.boxes.length) {
						// Extend existing array if needed
						while (inlineEditor.bboxes.ocr_needed_flags.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.ocr_needed_flags.push(false);
						}
					}

					if (!inlineEditor.bboxes.uncertain_flags) {
						inlineEditor.bboxes.uncertain_flags = new Array(inlineEditor.bboxes.boxes.length).fill(false);
					} else if (inlineEditor.bboxes.uncertain_flags.length < inlineEditor.bboxes.boxes.length) {
						// Extend existing array if needed
						while (inlineEditor.bboxes.uncertain_flags.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.uncertain_flags.push(false);
						}
					}

					if (!inlineEditor.bboxes.possible_labels) {
						// Create array with independent empty arrays for each position
						inlineEditor.bboxes.possible_labels = Array.from({ length: inlineEditor.bboxes.boxes.length }, () => []);
					} else if (inlineEditor.bboxes.possible_labels.length < inlineEditor.bboxes.boxes.length) {
						// Make sure array is expanded if needed before we add a new box
						while (inlineEditor.bboxes.possible_labels.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.possible_labels.push([]);
						}
					}

					if (!inlineEditor.bboxes.labels) {
						inlineEditor.bboxes.labels = new Array(inlineEditor.bboxes.boxes.length - 1).fill(0);
					} else if (inlineEditor.bboxes.labels.length < inlineEditor.bboxes.boxes.length - 1) {
						// Extend existing array if needed, but don't fill the new spot yet
						while (inlineEditor.bboxes.labels.length < inlineEditor.bboxes.boxes.length - 1) {
							inlineEditor.bboxes.labels.push(0);
						}
					}

					// Initialize and extend group array for new boxes
					if (!inlineEditor.bboxes.group) {
						inlineEditor.bboxes.group = new Array(inlineEditor.bboxes.boxes.length).fill(null);
					} else if (inlineEditor.bboxes.group.length < inlineEditor.bboxes.boxes.length) {
						// Extend existing array if needed - new boxes start as single-label (null group)
						while (inlineEditor.bboxes.group.length < inlineEditor.bboxes.boxes.length) {
							inlineEditor.bboxes.group.push(null);
						}
					}

					// Handle differently based on uncertainty mode
					if (isUncertainMode) {
						// For uncertain boxes
						// Push new values to arrays (don't modify existing items)
						inlineEditor.bboxes.crowd_flags.push(false);
						inlineEditor.bboxes.reflected_flags.push(false);
						inlineEditor.bboxes.rendition_flags.push(false);
						inlineEditor.bboxes.ocr_needed_flags.push(false);
						inlineEditor.bboxes.uncertain_flags[newBoxIndex] = true;

						// Get selected classes for uncertainty
						let selectedClasses = [];
						if (inlineEditor.selectedUncertainClasses && inlineEditor.selectedUncertainClasses.length) {
							// Use a deep copy to avoid reference issues
							selectedClasses = JSON.parse(JSON.stringify(inlineEditor.selectedUncertainClasses));
						} else if (window.selectedUncertainClasses && window.selectedUncertainClasses.length) {
							selectedClasses = JSON.parse(JSON.stringify(window.selectedUncertainClasses));
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
						inlineEditor.bboxes.reflected_flags.push(false);
						inlineEditor.bboxes.rendition_flags.push(false);
						inlineEditor.bboxes.ocr_needed_flags.push(false);
						inlineEditor.bboxes.uncertain_flags.push(false);
						inlineEditor.bboxes.possible_labels.push([]);

						// Get class ID for the new box - use helper function first
						let classId;
						if (typeof window.getClassForNewBBox === 'function') {
							classId = window.getClassForNewBBox();
							console.log(`Inline editor: Using getClassForNewBBox helper, got class: ${classId}`);
						} else if (window.lastSelectedClassId !== undefined && window.lastSelectedClassId !== null) {
							classId = parseInt(window.lastSelectedClassId);
							console.log(`Inline editor: Using global lastSelectedClassId: ${classId}`);
						} else if (window.groundTruthClassId !== undefined && window.groundTruthClassId !== null) {
							classId = parseInt(window.groundTruthClassId);
							console.log(`Inline editor: Using global groundTruthClassId: ${classId}`);
						} else if (inlineEditor.lastSelectedClassId !== null) {
							classId = parseInt(inlineEditor.lastSelectedClassId);
							console.log(`Inline editor: Using inlineEditor lastSelectedClassId: ${classId}`);
						} else {
							// Default to 0 only if no other option is available
							classId = 0;
							console.log(`Inline editor: Using default class 0`);
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
					updateReflectedCheckbox(newBoxIndex);
					updateRenditionCheckbox(newBoxIndex);
					updateOcrNeededCheckbox(newBoxIndex);

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
			const newBox = [
				newX1,
				newY1,
				newX1 + width,
				newY1 + height
			];
			
			inlineEditor.bboxes.boxes[inlineEditor.currentBoxIndex] = newBox;
			
			// If this is a multi-label box, update ALL boxes in the same group
			const isMultiLabel = inlineEditor.bboxes.group && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;
			
			if (isMultiLabel) {
				const groupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
				// Update all boxes in the same group to have the same coordinates
				inlineEditor.bboxes.group.forEach((g, i) => {
					if (g === groupId && i !== inlineEditor.currentBoxIndex) {
						inlineEditor.bboxes.boxes[i] = [...newBox]; // Copy the new coordinates
					}
				});
				debug(`Updated coordinates for multi-label group ${groupId} during dragging`);
			}

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
			
			// If this is a multi-label box, update ALL boxes in the same group
			const isMultiLabel = inlineEditor.bboxes.group && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;
			
			if (isMultiLabel) {
				const groupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
				// Update all boxes in the same group to have the same coordinates
				inlineEditor.bboxes.group.forEach((g, i) => {
					if (g === groupId && i !== inlineEditor.currentBoxIndex) {
						inlineEditor.bboxes.boxes[i] = [...box]; // Copy the new coordinates
					}
				});
				debug(`Updated coordinates for multi-label group ${groupId} during resizing`);
			}

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

	// Add keyboard shortcuts
	document.addEventListener('keydown', function(e) {
		// Only process shortcuts when the focus is not on an input field
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
			return;
		}

		// Ctrl+Alt: Open multi-label dropdown for multi-label boxes (similar to single-label dropdown for regular boxes)
		if (e.ctrlKey && e.altKey && inlineEditor.currentBoxIndex >= 0) {
			e.preventDefault();
			
			// Check if this is a multi-label box
			const isMultiLabel = inlineEditor.bboxes.group && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
								inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;
			
			if (isMultiLabel) {
				// Focus on the multi-label search input and show dropdown
				const multiLabelContainer = document.getElementById('multi-label-selection-container');
				const searchInput = multiLabelContainer?.querySelector('.multi-label-search');
				const dropdownOptions = multiLabelContainer?.querySelector('.multi-label-dropdown-options');
				
				if (searchInput && dropdownOptions) {
					searchInput.focus();
					dropdownOptions.style.display = 'block';
					console.log('Opened multi-label dropdown via Ctrl+Alt');
				}
			} else {
				// For single-label boxes, focus on the regular class selector
				const classSearchInput = document.getElementById('class-search-input');
				if (classSearchInput) {
					classSearchInput.focus();
					// Trigger click to show dropdown
					classSearchInput.click();
					console.log('Opened single-label dropdown via Ctrl+Alt');
				}
			}
		}
	});

	function toggleMultiLabelMode() {
		if (inlineEditor.currentBoxIndex < 0 || !inlineEditor.bboxes) {
			console.log('No box selected for multi-label toggle');
			return;
		}

		// Initialize group array if it doesn't exist
		if (!inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group = new Array(inlineEditor.bboxes.boxes.length).fill(null);
		}

		const currentGroupId = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex];
		const isCurrentlyMultiLabel = currentGroupId !== null && currentGroupId !== undefined;

		if (isCurrentlyMultiLabel) {
			// Convert from multi-label to single-label
			// Find all boxes in the same group with their labels
			const groupBoxes = [];
			for (let i = 0; i < inlineEditor.bboxes.group.length; i++) {
				if (inlineEditor.bboxes.group[i] === currentGroupId) {
					groupBoxes.push({
						index: i,
						label: inlineEditor.bboxes.labels ? inlineEditor.bboxes.labels[i] : 0
					});
				}
			}

			if (groupBoxes.length > 1) {
				// Sort by label to find the box with the first/lowest label
				groupBoxes.sort((a, b) => a.label - b.label);
				const boxToKeep = groupBoxes[0]; // Keep the one with the lowest label
				
				console.log(`Converting multi-label group ${currentGroupId} to single-label. Keeping box ${boxToKeep.index} with label ${boxToKeep.label}`);
				
				// Find boxes to remove (all except the one to keep)
				const boxesToRemove = groupBoxes
					.filter(box => box.index !== boxToKeep.index)
					.map(box => box.index)
					.sort((a, b) => b - a); // Sort in descending order for safe removal

				// Remove other boxes in the group
				boxesToRemove.forEach(idx => {
					removeBoxFromGroup(idx);
				});

				// After removing boxes, find the new index of the box we kept
				// (indices shift when we remove boxes before the kept one)
				let newKeptBoxIndex = boxToKeep.index;
				boxesToRemove.forEach(removedIdx => {
					if (removedIdx < boxToKeep.index) {
						newKeptBoxIndex--;
					}
				});

				// Clear group ID for the kept box
				if (newKeptBoxIndex < inlineEditor.bboxes.group.length) {
					inlineEditor.bboxes.group[newKeptBoxIndex] = null;
				}

				// Update current selection to the kept box
				inlineEditor.currentBoxIndex = newKeptBoxIndex;
				
				console.log(`Kept box is now at index ${newKeptBoxIndex}, selection updated`);
			} else {
				// Only one box in group, just clear its group ID
				inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] = null;
				console.log(`Cleared group ID for single box ${inlineEditor.currentBoxIndex}`);
			}
		} else {
			// Convert from single-label to multi-label
			// Find the next available group ID (ensure uniqueness)
			let maxGroupId = 0;
			if (inlineEditor.bboxes.group) {
				inlineEditor.bboxes.group.forEach(groupId => {
					if (groupId !== null && groupId !== undefined && typeof groupId === 'number' && groupId > maxGroupId) {
						maxGroupId = groupId;
					}
				});
			}
			const newGroupId = maxGroupId + 1;
			
			// Assign group ID to current box
			inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] = newGroupId;
			console.log(`Converted box ${inlineEditor.currentBoxIndex} to multi-label with group ID ${newGroupId}`);
		}

		// Update the multi-label checkbox if it exists and sync UI
		const multiLabelCheckbox = document.getElementById('inline-multi-label-checkbox');
		if (multiLabelCheckbox) {
			const newIsMultiLabel = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
									inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;
			console.log(`Setting inline checkbox to ${newIsMultiLabel} for box ${inlineEditor.currentBoxIndex}`);
			multiLabelCheckbox.checked = newIsMultiLabel;
			
			// Manually update UI since we're programmatically setting the checkbox
			// Force the dropdown visibility to update
			console.log(`Calling updateDropdownVisibility with forced state: ${newIsMultiLabel}`);
			updateDropdownVisibility(newIsMultiLabel);
		}

		// Update the advanced editor's checkbox if it exists
		const advancedMultiLabelCheckbox = document.getElementById('bbox-multi-label-checkbox');
		if (advancedMultiLabelCheckbox) {
			const newIsMultiLabel = inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== null && 
									inlineEditor.bboxes.group[inlineEditor.currentBoxIndex] !== undefined;
			advancedMultiLabelCheckbox.checked = newIsMultiLabel;
			
			// Trigger the advanced mode UI update by calling its change handler
			const singleLabelContainer = document.getElementById('bbox-single-label-container');
			const multiLabelContainer = document.getElementById('multi-label-selection-container');
			if (singleLabelContainer && multiLabelContainer) {
				singleLabelContainer.style.display = newIsMultiLabel ? 'none' : 'block';
				multiLabelContainer.style.display = 'block';
				
				// Populate or clear the multi-label container
				if (newIsMultiLabel && window.BBoxEditorUI && window.BBoxEditorUI.populateMultiLabelClasses) {
					window.BBoxEditorUI.populateMultiLabelClasses(inlineEditor.currentBoxIndex);
				} else if (!newIsMultiLabel && multiLabelContainer) {
					multiLabelContainer.innerHTML = '';
				}
				
				// Update the advanced mode canvas if it exists
				if (window.BBoxEditorUI && window.BBoxEditorUI.updatePreviewCanvas) {
					window.BBoxEditorUI.updatePreviewCanvas();
				}
			}
		}

		// Update bbox selector to reflect the current selection
		updateBboxSelector();

		// Update canvas
		if (inlineEditor.editor) {
			inlineEditor.editor.redrawCanvas();
		}

		// Update hidden field
		updateHiddenBboxesField();
	}

	// Helper function to remove a box from a group (similar to advanced editor)
	function removeBoxFromGroup(boxIndex) {
		if (!inlineEditor.bboxes || boxIndex < 0 || boxIndex >= inlineEditor.bboxes.boxes.length) {
			console.warn(`Invalid boxIndex ${boxIndex} for removeBoxFromGroup`);
			return;
		}

		console.log(`Removing box ${boxIndex} from group`);

		// Remove from all arrays
		inlineEditor.bboxes.boxes.splice(boxIndex, 1);
		inlineEditor.bboxes.scores.splice(boxIndex, 1);
		
		if (inlineEditor.bboxes.labels) {
			inlineEditor.bboxes.labels.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.crowd_flags) {
			inlineEditor.bboxes.crowd_flags.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.reflected_flags) {
			inlineEditor.bboxes.reflected_flags.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.rendition_flags) {
			inlineEditor.bboxes.rendition_flags.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.ocr_needed_flags) {
			inlineEditor.bboxes.ocr_needed_flags.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.uncertain_flags) {
			inlineEditor.bboxes.uncertain_flags.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.possible_labels) {
			inlineEditor.bboxes.possible_labels.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.gt) {
			inlineEditor.bboxes.gt.splice(boxIndex, 1);
		}
		
		if (inlineEditor.bboxes.group) {
			inlineEditor.bboxes.group.splice(boxIndex, 1);
		}

		console.log(`Successfully removed box, ${inlineEditor.bboxes.boxes.length} boxes remaining`);
	}

	// Make the inline editor object accessible globally
	window.inlineEditor = inlineEditor;

	// Initialize debug message to track class label handling
	debug("BBox Editor initialized with border-only selection, selective notifications, uncertain box support, and keyboard shortcuts (Ctrl+Alt for dropdown)");
	
	// Expose the inline editor's toggle function to global scope for keyboard shortcuts
	window.inlineToggleMultiLabelMode = toggleMultiLabelMode;
});