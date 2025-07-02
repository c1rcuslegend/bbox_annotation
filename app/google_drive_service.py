"""
Handles uploading and downloading checkbox selection data to/from Google Drive.
"""

import os
import json
import logging
import io
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/drive.file']

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
        self.logger = logging.getLogger(__name__)
        
    def authenticate(self):
        """Authenticate and build the Google Drive service."""
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
            
            # Upload only the checkbox_selections_<username>.json file
            checkbox_filename = f"checkbox_selections_{username}.json"
            local_file_path = os.path.join(local_data_dir, checkbox_filename)
            
            if os.path.exists(local_file_path):
                try:
                    file_id = self.upload_file(local_file_path, checkbox_filename, user_folder_id)
                    results['uploaded_files'].append({
                        'filename': checkbox_filename,
                        'file_id': file_id
                    })
                    self.logger.info(f"Successfully uploaded {checkbox_filename} for user {username}")
                except Exception as e:
                    results['errors'].append(f"Error uploading {checkbox_filename}: {str(e)}")
                    results['success'] = False
            else:
                results['errors'].append(f"Checkbox selections file not found: {local_file_path}")
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
            
            # Look for the specific checkbox_selections_<username>.json file
            checkbox_filename = f"checkbox_selections_{username}.json"
            file_id = self.find_file(checkbox_filename, user_folder_id)
            
            if file_id:
                local_file_path = os.path.join(local_data_dir, checkbox_filename)
                try:
                    if self.download_file(file_id, local_file_path):
                        results['downloaded_files'].append(checkbox_filename)
                        self.logger.info(f"Successfully downloaded {checkbox_filename} for user {username}")
                    else:
                        results['errors'].append(f"Failed to download {checkbox_filename}")
                        results['success'] = False
                except Exception as e:
                    results['errors'].append(f"Error downloading {checkbox_filename}: {str(e)}")
                    results['success'] = False
            else:
                results['errors'].append(f"Checkbox selections file not found on Google Drive: {checkbox_filename}")
                results['success'] = False
                        
        except Exception as e:
            results['success'] = False
            results['errors'].append(f"General error: {str(e)}")
            
        return results
