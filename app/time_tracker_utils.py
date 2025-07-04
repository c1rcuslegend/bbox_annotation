"""
Time tracking utility for annotator activities.
Tracks time spent on each class and activity type.
"""

import time
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

class TimeTracker:
    def __init__(self, username: str):
        self.username = username
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.current_class_id = None
        self.current_session_start = None
        self.current_image_id = None
        self.current_image_start = None
        self.is_first_class_session = True  # Flag to track first class session
        self.session_data = {
            'session_id': self.session_id,
            'username': username,
            'start_time': datetime.now().isoformat(),
            'class_sessions': []
        }
        self.current_class_session = None
        self.persistent_visits = self._load_persistent_visits()
        
    def _load_persistent_visits(self):
        """Load persistent visit counts from file"""
        try:
            try:
                from .config import ANNOTATORS_ROOT_DIRECTORY
            except ImportError:
                # Fallback for when not running as a module
                from config import ANNOTATORS_ROOT_DIRECTORY
            
            user_dir = os.path.join(ANNOTATORS_ROOT_DIRECTORY, self.username)
            visits_file = os.path.join(user_dir, "persistent_visits.json")
            
            if os.path.exists(visits_file):
                with open(visits_file, 'r') as f:
                    return json.load(f)
            else:
                return {
                    'class_visits': {},  # class_id -> total_visits
                    'image_visits': {}   # image_name -> total_visits
                }
        except Exception as e:
            print(f"Error loading persistent visits: {e}")
            return {'class_visits': {}, 'image_visits': {}}
    
    def _save_persistent_visits(self):
        """Save persistent visit counts to file"""
        try:
            try:
                from .config import ANNOTATORS_ROOT_DIRECTORY
            except ImportError:
                # Fallback for when not running as a module
                from config import ANNOTATORS_ROOT_DIRECTORY
                
            user_dir = os.path.join(ANNOTATORS_ROOT_DIRECTORY, self.username)
            os.makedirs(user_dir, exist_ok=True)
            visits_file = os.path.join(user_dir, "persistent_visits.json")
            
            with open(visits_file, 'w') as f:
                json.dump(self.persistent_visits, f, indent=2)
        except Exception as e:
            print(f"Error saving persistent visits: {e}")
        
    def start_class_session(self, class_id: str, class_name: str):
        """Start tracking a new class session"""
        # End current session if exists
        if self.current_class_session:
            self.end_class_session()
            
        self.current_class_id = class_id
        self.current_session_start = time.time()
        
        # Get current persistent visit count before potentially incrementing
        current_visits = self.persistent_visits['class_visits'].get(class_id, 0)
        
        # Only increment persistent visit count if this is NOT the first class session
        # The first class session when the app starts doesn't count as a new visit
        if not self.is_first_class_session:
            self.persistent_visits['class_visits'][class_id] = current_visits + 1
            self._save_persistent_visits()
            persistent_visit_number = current_visits + 1
        else:
            # For the first class session, use the existing count or 1 if it's the first time ever
            if current_visits == 0:
                # This is the very first time visiting this class
                self.persistent_visits['class_visits'][class_id] = 1
                self._save_persistent_visits()
                persistent_visit_number = 1
            else:
                # This class has been visited before, don't increment for first session
                persistent_visit_number = current_visits
            self.is_first_class_session = False  # Mark that we've passed the first session
        
        # Find session-specific visit count
        session_visit_count = len([s for s in self.session_data['class_sessions'] if s['class_id'] == class_id])
        
        self.current_class_session = {
            'class_id': class_id,
            'class_name': class_name,
            'visit_number': session_visit_count + 1,
            'persistent_visit_number': persistent_visit_number,
            'start_time': datetime.now().isoformat(),
            'end_time': None,
            'duration_seconds': 0,
            'grid_annotations': 0,  # +1 for check, -1 for uncheck
            'grid_deannotations': 0,
            'detail_views': 0,  # Count of detail view opens
            'activities': [],
            'image_sessions': []  # Track individual image sessions in detail mode
        }
        
    def end_class_session(self):
        """End current class session and save duration"""
        if self.current_class_session and self.current_session_start:
            # End any active image session first
            if self.current_image_id and self.current_image_start:
                self.end_image_session()
                
            duration = time.time() - self.current_session_start
            self.current_class_session['duration_seconds'] = int(duration)  # Store as integer
            self.current_class_session['end_time'] = datetime.now().isoformat()
            
            # Add to session data
            self.session_data['class_sessions'].append(self.current_class_session)
            
            # Save to file
            self._save_session_data()
            
            self.current_class_session = None
            self.current_session_start = None
            
    def log_activity(self, activity_type: str, details: Dict[str, Any] = None):
        """Log an activity in the current class session"""
        if not self.current_class_session:
            return
            
        activity = {
            'timestamp': datetime.now().isoformat(),
            'activity_type': activity_type,
            'details': details or {}
        }
        
        self.current_class_session['activities'].append(activity)
        
        # Update counters based on activity type
        if activity_type == 'grid_annotation':
            self.current_class_session['grid_annotations'] += 1
        elif activity_type == 'grid_deannotation':
            self.current_class_session['grid_deannotations'] += 1
        elif activity_type == 'detail_view_open':
            self.current_class_session['detail_views'] += 1
            
    def _save_session_data(self):
        """Save session data to JSON file"""
        try:
            try:
                from .config import ANNOTATORS_ROOT_DIRECTORY
            except ImportError:
                # Fallback for when not running as a module
                from config import ANNOTATORS_ROOT_DIRECTORY
                
            user_dir = os.path.join(ANNOTATORS_ROOT_DIRECTORY, self.username)
            os.makedirs(user_dir, exist_ok=True)
            
            file_path = os.path.join(user_dir, f"time_tracking_{self.session_id}.json")
            
            with open(file_path, 'w') as f:
                json.dump(self.session_data, f, indent=2)
                
        except Exception as e:
            print(f"Error saving time tracking data: {e}")
            
    def get_session_file_path(self) -> str:
        """Get the path to the current session file"""
        try:
            from .config import ANNOTATORS_ROOT_DIRECTORY
        except ImportError:
            # Fallback for when not running as a module
            from config import ANNOTATORS_ROOT_DIRECTORY
            
        user_dir = os.path.join(ANNOTATORS_ROOT_DIRECTORY, self.username)
        return os.path.join(user_dir, f"time_tracking_{self.session_id}.json")
        
    def finalize_session(self):
        """Finalize the current session"""
        # End any active image session first
        if self.current_image_id and self.current_image_start:
            self.end_image_session()
            
        if self.current_class_session:
            self.end_class_session()
            
        self.session_data['end_time'] = datetime.now().isoformat()
        self._save_session_data()
        
    def start_image_session(self, image_name: str, image_index: int = None):
        """Start tracking time spent on a specific image in detail mode"""
        # Only start if we're not already tracking this exact image
        if self.current_image_id == image_name:
            return  # Already tracking this image, don't create duplicate
            
        # End current image session if exists (with a small delay to avoid same timestamp)
        if self.current_image_id and self.current_image_start:
            # Add a small delay to ensure different timestamps
            time.sleep(0.001)
            self.end_image_session()
            
        self.current_image_id = image_name
        self.current_image_start = time.time()
        
        # Update persistent visit count for this image
        current_visits = self.persistent_visits['image_visits'].get(image_name, 0)
        self.persistent_visits['image_visits'][image_name] = current_visits + 1
        self._save_persistent_visits()
        
        # Log the start in activities - simplified to just detail_view_open
        self.log_activity('detail_view_open', {
            'image_name': image_name,
            'image_index': image_index,
            'persistent_visit_number': self.persistent_visits['image_visits'][image_name]
        })
        
    def end_image_session(self):
        """End current image session and save duration"""
        if not self.current_class_session or not self.current_image_id or not self.current_image_start:
            return
            
        duration = time.time() - self.current_image_start
        
        # Find the start activity to get image details
        start_activity = None
        for activity in reversed(self.current_class_session['activities']):
            if (activity['activity_type'] == 'detail_view_open' and 
                activity['details'].get('image_name') == self.current_image_id):
                start_activity = activity
                break
        
        image_session = {
            'image_name': self.current_image_id,
            'image_index': start_activity['details'].get('image_index') if start_activity else None,
            'persistent_visit_number': start_activity['details'].get('persistent_visit_number') if start_activity else None,
            'start_time': datetime.fromtimestamp(self.current_image_start).isoformat(),
            'end_time': datetime.now().isoformat(),
            'duration_seconds': int(duration)  # Store as integer
        }
        
        self.current_class_session['image_sessions'].append(image_session)
        
        # Log the end in activities - simplified to just detail_view_close
        self.log_activity('detail_view_close', {
            'image_name': self.current_image_id,
            'duration_seconds': int(duration)  # Store as integer
        })
        
        self.current_image_id = None
        self.current_image_start = None

    def should_start_new_class_session(self, class_id: str) -> bool:
        """Check if we should start a new class session (only for actual class changes)"""
        return self.current_class_id != class_id
        
    def start_class_session_if_changed(self, class_id: str, class_name: str):
        """Start a new class session only if the class has actually changed"""
        if self.should_start_new_class_session(class_id):
            self.start_class_session(class_id, class_name)


# Global time tracker instance
_time_tracker = None

def get_time_tracker() -> TimeTracker:
    """Get the global time tracker instance"""
    global _time_tracker
    if _time_tracker is None:
        try:
            from .config import UPLOAD_USERNAME
        except ImportError:
            # Fallback for when not running as a module
            from config import UPLOAD_USERNAME
        _time_tracker = TimeTracker(UPLOAD_USERNAME)
    return _time_tracker

def initialize_time_tracker(username: str = None):
    """Initialize or reinitialize the time tracker"""
    global _time_tracker
    if username is None:
        try:
            from .config import UPLOAD_USERNAME
        except ImportError:
            # Fallback for when not running as a module
            from config import UPLOAD_USERNAME
        username = UPLOAD_USERNAME
    _time_tracker = TimeTracker(username)
    return _time_tracker
