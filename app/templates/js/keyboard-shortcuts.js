// Keyboard shortcuts available in both Grid View and Detail View
const GLOBAL_SHORTCUTS = {
    'Arrow Left / A': 'Navigate to previous image/set',
    'Arrow Right / D': 'Navigate to next image/set',
    'Ctrl+S': 'Save current changes without navigation'
};

// Keyboard shortcuts available only in Detail View (user_label.html)
const DETAIL_VIEW_SHORTCUTS = {
    'Esc': 'Return to grid view',
    'Ctrl+G': 'Toggle Crowd of Instances flag for selected bbox',
    'Ctrl+R': 'Toggle Reflected Object flag for selected bbox', 
    'Ctrl+V': 'Toggle Rendition flag for selected bbox',
    'Ctrl+B': 'Toggle Text based flag for selected bbox',
    'Ctrl+X': 'Delete currently selected bounding box',
    'Shift+C': 'Copy and paste selected bounding box',
    'Ctrl+A': 'Create whole image bounding box',
    'Ctrl+Z': 'Activate "Not Sure" mode',
    'Shift+S': 'Mark image as "None of ImageNet classes"'
};

// Keyboard shortcuts available only in Grid View (img_grid.html)
const GRID_VIEW_SHORTCUTS = {
    // Currently only Ctrl+S is grid-specific, others are global
};

/**
 * Function to display all keyboard shortcuts in console
 * Useful for debugging and user reference
 */
function logKeyboardShortcuts() {
    console.group('🎹 Multilabelfy Keyboard Shortcuts');
    
    console.group('🌐 Global Shortcuts (All Views)');
    Object.entries(GLOBAL_SHORTCUTS).forEach(([key, description]) => {
        console.log(`${key.padEnd(20)} → ${description}`);
    });
    console.groupEnd();
    
    console.group('🔍 Detail View Only');
    Object.entries(DETAIL_VIEW_SHORTCUTS).forEach(([key, description]) => {
        console.log(`${key.padEnd(20)} → ${description}`);
    });
    console.groupEnd();
    
    if (Object.keys(GRID_VIEW_SHORTCUTS).length > 0) {
        console.group('📊 Grid View Only');
        Object.entries(GRID_VIEW_SHORTCUTS).forEach(([key, description]) => {
            console.log(`${key.padEnd(20)} → ${description}`);
        });
        console.groupEnd();
    }
    
    console.groupEnd();
}

/**
 * Function to create a help popup showing all keyboard shortcuts
 * Can be called from anywhere in the application
 */
function showKeyboardShortcutsHelp() {
    // Check if popup already exists
    let popup = document.getElementById('keyboard-shortcuts-help-popup');
    
    if (!popup) {
        // Create popup
        popup = document.createElement('div');
        popup.id = 'keyboard-shortcuts-help-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #007bff;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 99999;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            font-family: Arial, sans-serif;
            display: none;
        `;
        
        let shortcutsHtml = `
            <div style="text-align: right; margin-bottom: 15px;">
                <span onclick="closeKeyboardShortcutsHelp()" style="cursor: pointer; font-size: 24px; color: #999;">&times;</span>
            </div>
            <h2 style="margin-top: 0; color: #007bff; text-align: center;">🎹 Keyboard Shortcuts</h2>
            
            <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌐 Global Shortcuts</h3>
            <table style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
        `;
        
        Object.entries(GLOBAL_SHORTCUTS).forEach(([key, description]) => {
            shortcutsHtml += `
                <tr>
                    <td style="padding: 8px; font-family: monospace; background: #f8f9fa; border: 1px solid #dee2e6; font-weight: bold; width: 150px;">
                        ${key}
                    </td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">
                        ${description}
                    </td>
                </tr>
            `;
        });
        
        shortcutsHtml += `
            </table>
            
            <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔍 Detail View Shortcuts</h3>
            <table style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
        `;
        
        Object.entries(DETAIL_VIEW_SHORTCUTS).forEach(([key, description]) => {
            shortcutsHtml += `
                <tr>
                    <td style="padding: 8px; font-family: monospace; background: #f8f9fa; border: 1px solid #dee2e6; font-weight: bold; width: 150px;">
                        ${key}
                    </td>
                    <td style="padding: 8px; border: 1px solid #dee2e6;">
                        ${description}
                    </td>
                </tr>
            `;
        });
        
        shortcutsHtml += `
            </table>
            
            <p style="margin-top: 20px; font-size: 12px; color: #666; text-align: center;">
                Press <strong>F1</strong> to show/hide this help
            </p>
        `;
        
        popup.innerHTML = shortcutsHtml;
        document.body.appendChild(popup);
    }
    
    // Toggle visibility
    if (popup.style.display === 'none' || popup.style.display === '') {
        popup.style.display = 'block';
    } else {
        popup.style.display = 'none';
    }
}

/**
 * Function to close the keyboard shortcuts help popup
 */
function closeKeyboardShortcutsHelp() {
    const popup = document.getElementById('keyboard-shortcuts-help-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// Global keyboard shortcut to show help (F1)
document.addEventListener('keydown', function(event) {
    // Only trigger if not typing in an input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
        return;
    }
    
    if (event.key === 'F1') {
        event.preventDefault();
        showKeyboardShortcutsHelp();
    }
    
    // Close help popup with Escape if it's open
    if (event.key === 'Escape') {
        const popup = document.getElementById('keyboard-shortcuts-help-popup');
        if (popup && popup.style.display === 'block') {
            closeKeyboardShortcutsHelp();
            event.stopPropagation(); // Prevent other escape handlers
        }
    }
});

// Auto-log shortcuts on page load for development (disabled for production)
document.addEventListener('DOMContentLoaded', function() {
    // Logging disabled
});

// Make functions globally available
window.showKeyboardShortcutsHelp = showKeyboardShortcutsHelp;
window.closeKeyboardShortcutsHelp = closeKeyboardShortcutsHelp;
window.logKeyboardShortcuts = logKeyboardShortcuts;
