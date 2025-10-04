"""
Handles uploading and downloading checkbox selection data to/from Google Drive.
"""

import os
import json
import logging
import io
import csv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

# If modifying these scopes, delete the file token.json.
SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
]

class GoogleDriveService:
    def __init__(self, credentials_file=None, token_file=None):
        """
        Initialize Google Drive service.
        
        Args:
            credentials_file: Path to the credentials.json file from Google Cloud Console
            token_file: Path to store the token.json file for authenticated sessions
        """
        self.credentials_file = credentials_file or 'credentials.json'
        self.token_file = token_file or 'token.json'
        self.service = None
        self.sheets_service = None
        self.logger = logging.getLogger(__name__)
        
    def authenticate(self):
        """Authenticate and build the Google Drive and Sheets services."""
        creds = None
        
        # The file token.json stores the user's access and refresh tokens.
        if os.path.exists(self.token_file):
            creds = Credentials.from_authorized_user_file(self.token_file, SCOPES)
            
        # If there are no (valid) credentials available, let the user log in.
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except Exception as e:
                    self.logger.error(f"Error refreshing credentials: {e}")
                    # If refresh fails, re-authenticate
                    creds = None
                    
            if not creds:
                if not os.path.exists(self.credentials_file):
                    raise FileNotFoundError(f"Credentials file not found: {self.credentials_file}")
                    
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, SCOPES)
                creds = flow.run_local_server(port=0)
                
            # Save the credentials for the next run
            with open(self.token_file, 'w') as token:
                token.write(creds.to_json())
                
        self.service = build('drive', 'v3', credentials=creds)
        self.sheets_service = build('sheets', 'v4', credentials=creds)
        return True
        
    def get_or_create_folder(self, folder_name, parent_folder_id=None):
        """
        Get folder ID by name, or create it if it doesn't exist.
        
        Args:
            folder_name: Name of the folder
            parent_folder_id: ID of the parent folder (None for root)
            
        Returns:
            Folder ID
        """
        try:
            # Search for existing folder
            query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder'"
            if parent_folder_id:
                query += f" and parents='{parent_folder_id}'"
                
            results = self.service.files().list(q=query).execute()
            items = results.get('files', [])
            
            if items:
                return items[0]['id']
            else:
                # Create folder
                file_metadata = {
                    'name': folder_name,
                    'mimeType': 'application/vnd.google-apps.folder'
                }
                if parent_folder_id:
                    file_metadata['parents'] = [parent_folder_id]
                    
                folder = self.service.files().create(body=file_metadata).execute()
                return folder.get('id')
                
        except HttpError as error:
            self.logger.error(f"Error creating/getting folder: {error}")
            raise
            
    def upload_file(self, local_file_path, drive_file_name, folder_id=None):
        """
        Upload a file to Google Drive.
        
        Args:
            local_file_path: Path to the local file
            drive_file_name: Name for the file in Google Drive
            folder_id: ID of the folder to upload to (None for root)
            
        Returns:
            File ID of the uploaded file
        """
        try:
            file_metadata = {'name': drive_file_name}
            if folder_id:
                file_metadata['parents'] = [folder_id]
                
            media = MediaFileUpload(local_file_path, resumable=True)
            
            # Check if file already exists
            query = f"name='{drive_file_name}'"
            if folder_id:
                query += f" and parents='{folder_id}'"
                
            results = self.service.files().list(q=query).execute()
            items = results.get('files', [])
            
            if items:
                # Update existing file
                file_id = items[0]['id']
                file = self.service.files().update(
                    fileId=file_id,
                    media_body=media
                ).execute()
            else:
                # Create new file
                file = self.service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id'
                ).execute()
                
            return file.get('id')
            
        except HttpError as error:
            self.logger.error(f"Error uploading file: {error}")
            raise
            
    def download_file(self, file_id, local_file_path):
        """
        Download a file from Google Drive.
        
        Args:
            file_id: ID of the file in Google Drive
            local_file_path: Path where to save the downloaded file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            request = self.service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                
            # Write to local file
            with open(local_file_path, 'wb') as f:
                f.write(fh.getvalue())
                
            return True
            
        except HttpError as error:
            self.logger.error(f"Error downloading file: {error}")
            return False
            
    def find_file(self, file_name, folder_id=None):
        """
        Find a file by name in Google Drive.
        
        Args:
            file_name: Name of the file to find
            folder_id: ID of the folder to search in (None for all)
            
        Returns:
            File ID if found, None otherwise
        """
        try:
            query = f"name='{file_name}'"
            if folder_id:
                query += f" and parents='{folder_id}'"
                
            results = self.service.files().list(q=query).execute()
            items = results.get('files', [])
            
            return items[0]['id'] if items else None
            
        except HttpError as error:
            self.logger.error(f"Error finding file: {error}")
            return None
            
    def upload_user_data(self, username, local_data_dir, target_folder_id=None):
        """
        Upload checkbox selections file to Google Drive.
        
        Args:
            username: Username of the annotator
            local_data_dir: Local directory containing user data
            target_folder_id: Google Drive folder ID to save to (if None, uses default structure)
            
        Returns:
            Dictionary with upload results
        """
        results = {
            'success': True,
            'uploaded_files': [],
            'errors': []
        }
        
        try:
            if not self.service:
                self.authenticate()
                
            # Determine the target folder
            if target_folder_id:
                # Save directly to the specified folder
                user_folder_id = target_folder_id
                self.logger.info(f"Using specified folder ID: {target_folder_id}")
            else:
                # Use default structure: Multilabelfy_Data/username/
                app_folder_id = self.get_or_create_folder('Multilabelfy_Data')
                user_folder_id = self.get_or_create_folder(username, app_folder_id)
                self.logger.info(f"Using default folder structure for user: {username}")
            
            # Upload all checkbox_selections files (default + mode-specific)
            # Files to upload: checkbox_selections_<username>.json, checkbox_selections_<username>_S.json, checkbox_selections_<username>_M.json
            checkbox_files = [
                f"checkbox_selections_{username}.json",       # Default mode
                f"checkbox_selections_{username}_S.json",     # Sanity Check Mode 1
                f"checkbox_selections_{username}_M.json"      # Sanity Check Mode 2
            ]
            
            files_uploaded = False
            for checkbox_filename in checkbox_files:
                local_file_path = os.path.join(local_data_dir, checkbox_filename)
                
                if os.path.exists(local_file_path):
                    try:
                        file_id = self.upload_file(local_file_path, checkbox_filename, user_folder_id)
                        results['uploaded_files'].append({
                            'filename': checkbox_filename,
                            'file_id': file_id
                        })
                        self.logger.info(f"Successfully uploaded {checkbox_filename} for user {username}")
                        files_uploaded = True
                    except Exception as e:
                        results['errors'].append(f"Error uploading {checkbox_filename}: {str(e)}")
                        self.logger.warning(f"Failed to upload {checkbox_filename}: {str(e)}")
            
            # Only set success to False if NO files were uploaded at all
            if not files_uploaded:
                results['errors'].append(f"No checkbox selections files found for user {username}")
                results['success'] = False
                
        except Exception as e:
            results['success'] = False
            results['errors'].append(f"General error: {str(e)}")
            
        return results
        
    def download_user_data(self, username, local_data_dir, target_folder_id=None):
        """
        Download checkbox selections file from Google Drive.
        
        Args:
            username: Username of the annotator
            local_data_dir: Local directory to save downloaded data
            target_folder_id: Google Drive folder ID to download from (if None, uses default structure)
            
        Returns:
            Dictionary with download results
        """
        results = {
            'success': True,
            'downloaded_files': [],
            'errors': []
        }
        
        try:
            if not self.service:
                self.authenticate()
                
            # Determine the source folder
            if target_folder_id:
                # Download from the specified folder
                user_folder_id = target_folder_id
                self.logger.info(f"Using specified folder ID: {target_folder_id}")
            else:
                # Use default structure: Multilabelfy_Data/username/
                app_folder_id = self.get_or_create_folder('Multilabelfy_Data')
                user_folder_id = self.find_file(username, app_folder_id)
                if not user_folder_id:
                    results['errors'].append(f"No data found for user {username} on Google Drive")
                    results['success'] = False
                    return results
                self.logger.info(f"Using default folder structure for user: {username}")
                
            # Create local directory if it doesn't exist
            os.makedirs(local_data_dir, exist_ok=True)
            
            # Look for all checkbox_selections files (default + mode-specific)
            checkbox_files = [
                f"checkbox_selections_{username}.json",       # Default mode
                f"checkbox_selections_{username}_S.json",     # Sanity Check Mode 1
                f"checkbox_selections_{username}_M.json"      # Sanity Check Mode 2
            ]
            
            files_downloaded = False
            for checkbox_filename in checkbox_files:
                file_id = self.find_file(checkbox_filename, user_folder_id)
                
                if file_id:
                    local_file_path = os.path.join(local_data_dir, checkbox_filename)
                    try:
                        if self.download_file(file_id, local_file_path):
                            results['downloaded_files'].append(checkbox_filename)
                            self.logger.info(f"Successfully downloaded {checkbox_filename} for user {username}")
                            files_downloaded = True
                        else:
                            results['errors'].append(f"Failed to download {checkbox_filename}")
                            self.logger.warning(f"Failed to download {checkbox_filename}")
                    except Exception as e:
                        results['errors'].append(f"Error downloading {checkbox_filename}: {str(e)}")
                        self.logger.warning(f"Error downloading {checkbox_filename}: {str(e)}")
            
            # Only set success to False if NO files were downloaded at all
            if not files_downloaded:
                results['errors'].append(f"No checkbox selections files found for user {username} on Google Drive")
                results['success'] = False
                        
        except Exception as e:
            results['success'] = False
            results['errors'].append(f"General error: {str(e)}")
            
        return results
    
    def upload_to_sheets(self, data, spreadsheet_id, range_name):
        """
        Upload data to Google Sheets.
        
        Args:
            data: List of lists containing row data to upload
            spreadsheet_id: ID of the target Google Sheets spreadsheet
            range_name: A1 notation of the range to update (e.g., 'Sheet1!A1')
            
        Returns:
            Update response from the Sheets API
        """
        try:
            # Convert data to the format expected by the Sheets API
            body = {
                'values': data
            }
            
            # Call the Sheets API to update the data
            result = self.sheets_service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=range_name,
                valueInputOption='RAW',
                body=body
            ).execute()
            
            return result
            
        except HttpError as error:
            self.logger.error(f"Error uploading to Google Sheets: {error}")
            raise

    def create_time_tracking_sheet(self, username, session_data, folder_id=None):
        """
        Create a Google Sheet with time tracking data.
        
        Args:
            username: Username of the annotator
            session_data: Time tracking session data
            folder_id: Google Drive folder ID to save the sheet
            
        Returns:
            Dictionary with success status and sheet information
        """
        results = {
            'success': False,
            'sheet_id': None,
            'sheet_url': None,
            'errors': []
        }
        
        try:
            # Authenticate
            if not self.authenticate():
                results['errors'].append("Authentication failed")
                return results
            
            # Check for existing spreadsheet and delete it
            sheet_title = f"Time_Tracking_{username}_{session_data['session_id']}"
            existing_sheet_id = self.find_spreadsheet_by_name(sheet_title, folder_id)
            if existing_sheet_id:
                self.logger.info(f"Found existing spreadsheet {sheet_title}, deleting it")
                self.delete_file(existing_sheet_id)
                
            # Create spreadsheet with multiple sheets
            spreadsheet = {
                'properties': {
                    'title': sheet_title
                },
                'sheets': [
                    {
                        'properties': {
                            'title': 'Class Sessions',
                            'sheetId': 0
                        }
                    },
                    {
                        'properties': {
                            'title': 'Image Sessions',
                            'sheetId': 1
                        }
                    }
                ]
            }
            
            spreadsheet = self.sheets_service.spreadsheets().create(
                body=spreadsheet,
                fields='spreadsheetId'
            ).execute()
            
            sheet_id = spreadsheet.get('spreadsheetId')
            results['sheet_id'] = sheet_id
            results['sheet_url'] = f"https://docs.google.com/spreadsheets/d/{sheet_id}"
            
            # Prepare data for the sheet
            headers = [
                'Class ID', 'Class Name', 'Visit Number', 'Persistent Visit Number', 'Start Time', 'End Time',
                'Duration (seconds)', 'Grid Annotations', 'Grid Deannotations', 'Detail Views'
            ]
            
            # Prepare rows
            rows = [headers]
            
            for class_session in session_data.get('class_sessions', []):
                row = [
                    class_session.get('class_id', ''),
                    class_session.get('class_name', ''),
                    class_session.get('visit_number', 0),
                    class_session.get('persistent_visit_number', 0),
                    class_session.get('start_time', ''),
                    class_session.get('end_time', ''),
                    int(class_session.get('duration_seconds', 0)),  # Convert to int
                    class_session.get('grid_annotations', 0),
                    class_session.get('grid_deannotations', 0),
                    class_session.get('detail_views', 0)
                ]
                rows.append(row)
            
            # Add summary row
            if len(rows) > 1:
                summary_row = [
                    'SUMMARY', '', '', '', '', '',  # One more empty column for persistent visit number
                    sum(int(row[6]) for row in rows[1:]),    # Total duration 
                    sum(int(row[7]) for row in rows[1:]),    # Total grid annotations 
                    sum(int(row[8]) for row in rows[1:]),    # Total grid deannotations 
                    sum(int(row[9]) for row in rows[1:])     # Total detail views 
                ]
                rows.append(summary_row)
            
            # Update the sheet with class session data
            body = {
                'values': rows
            }
            
            self.sheets_service.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range='Class Sessions!A1',
                valueInputOption='RAW',
                body=body
            ).execute()
            
            # Prepare image session data
            image_headers = [
                'Class ID', 'Class Name', 'Image Name', 'Image Index',
                'Persistent Visit Number', 'Start Time', 'End Time', 'Duration (seconds)'
            ]
            
            image_rows = [image_headers]
            
            for class_session in session_data.get('class_sessions', []):
                class_id = class_session.get('class_id', '')
                class_name = class_session.get('class_name', '')
                
                for image_session in class_session.get('image_sessions', []):
                    image_row = [
                        class_id,
                        class_name,
                        image_session.get('image_name', ''),
                        image_session.get('image_index', ''),
                        image_session.get('persistent_visit_number', ''),
                        image_session.get('start_time', ''),
                        image_session.get('end_time', ''),
                        int(image_session.get('duration_seconds', 0))  # Convert to int
                    ]
                    image_rows.append(image_row)
            
            # Add image summary row
            if len(image_rows) > 1:
                image_summary_row = [
                    'SUMMARY', '', '', '', '',
                    '', '',  # Start/End time empty for summary
                    sum(int(row[7]) for row in image_rows[1:])  # Total duration
                ]
                image_rows.append(image_summary_row)
            
            # Update the image sessions sheet
            if len(image_rows) > 1:  # Only if there are image sessions
                image_body = {
                    'values': image_rows
                }
                
                self.sheets_service.spreadsheets().values().update(
                    spreadsheetId=sheet_id,
                    range='Image Sessions!A1',
                    valueInputOption='RAW',
                    body=image_body
                ).execute()
            
            # Format the header rows for both sheets
            format_requests = [
                # Format Class Sessions sheet header
                {
                    'repeatCell': {
                        'range': {
                            'sheetId': 0,
                            'startRowIndex': 0,
                            'endRowIndex': 1
                        },
                        'cell': {
                            'userEnteredFormat': {
                                'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9},
                                'textFormat': {'bold': True}
                            }
                        },
                        'fields': 'userEnteredFormat(backgroundColor,textFormat)'
                    }
                }
            ]
            
            # Add Image Sessions sheet header formatting if there are image sessions
            if len(image_rows) > 1:
                format_requests.append({
                    'repeatCell': {
                        'range': {
                            'sheetId': 1,
                            'startRowIndex': 0,
                            'endRowIndex': 1
                        },
                        'cell': {
                            'userEnteredFormat': {
                                'backgroundColor': {'red': 0.9, 'green': 0.9, 'blue': 0.9},
                                'textFormat': {'bold': True}
                            }
                        },
                        'fields': 'userEnteredFormat(backgroundColor,textFormat)'
                    }
                })
            
            format_request = {
                'requests': format_requests
            }
            
            self.sheets_service.spreadsheets().batchUpdate(
                spreadsheetId=sheet_id,
                body=format_request
            ).execute()
            
            # Move to specified folder if provided
            if folder_id:
                self.service.files().update(
                    fileId=sheet_id,
                    addParents=folder_id,
                    fields='id, parents'
                ).execute()
                
            results['success'] = True
            self.logger.info(f"Successfully created time tracking sheet for {username}")
            
        except HttpError as error:
            results['errors'].append(f"HTTP error creating sheet: {error}")
            self.logger.error(f"HTTP error creating sheet: {error}")
        except Exception as error:
            results['errors'].append(f"Error creating sheet: {error}")
            self.logger.error(f"Error creating sheet: {error}")
            
        return results
    
    def upload_time_tracking_json(self, username, session_data, local_data_dir, folder_id=None):
        """
        Upload time tracking JSON file to Google Drive.
        
        Args:
            username: Username of the annotator
            session_data: Time tracking session data
            local_data_dir: Local directory containing time tracking files
            folder_id: Google Drive folder ID to save to
            
        Returns:
            Dictionary with upload results
        """
        results = {
            'success': True,
            'uploaded_file': None,
            'errors': []
        }
        
        try:
            if not self.service:
                self.authenticate()
                
            # Determine target folder (same as Google Sheets)
            if folder_id:
                target_folder_id = folder_id
            else:
                # Use default time tracking folder structure
                app_folder_id = self.get_or_create_folder('Multilabelfy_Data')
                target_folder_id = self.get_or_create_folder('Time_Tracking', app_folder_id)
            
            # Find the time tracking JSON file for this session
            session_id = session_data.get('session_id')
            json_filename = f"time_tracking_{session_id}.json"
            local_file_path = os.path.join(local_data_dir, json_filename)
            
            if os.path.exists(local_file_path):
                try:
                    # Use session-specific filename to ensure uniqueness
                    drive_filename = f"Time_Tracking_{username}_{session_id}.json"
                    
                    file_id = self.upload_file(local_file_path, drive_filename, target_folder_id)
                    results['uploaded_file'] = {
                        'filename': drive_filename,
                        'file_id': file_id,
                        'local_path': local_file_path
                    }
                    self.logger.info(f"Successfully uploaded {drive_filename} for user {username}")
                except Exception as e:
                    results['errors'].append(f"Error uploading {json_filename}: {str(e)}")
                    results['success'] = False
            else:
                results['errors'].append(f"Time tracking JSON file not found: {local_file_path}")
                results['success'] = False
                
        except Exception as e:
            results['success'] = False
            results['errors'].append(f"General error uploading time tracking JSON: {str(e)}")
            
        return results

    def find_spreadsheet_by_name(self, name, folder_id=None):
        """
        Find a Google Sheets spreadsheet by name.
        
        Args:
            name: Name of the spreadsheet
            folder_id: ID of the folder to search in
            
        Returns:
            Spreadsheet ID if found, None otherwise
        """
        try:
            query = f"name='{name}' and mimeType='application/vnd.google-apps.spreadsheet'"
            if folder_id:
                query += f" and parents='{folder_id}'"
                
            results = self.service.files().list(q=query).execute()
            items = results.get('files', [])
            
            return items[0]['id'] if items else None
            
        except HttpError as error:
            self.logger.error(f"Error finding spreadsheet: {error}")
            return None
    
    def delete_file(self, file_id):
        """
        Delete a file from Google Drive.
        
        Args:
            file_id: ID of the file to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.service.files().delete(fileId=file_id).execute()
            return True
        except HttpError as error:
            self.logger.error(f"Error deleting file: {error}")
            return False
