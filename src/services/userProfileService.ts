export interface UserProfileSettings {
  radiologistName: string;
  radiologistTitle: string;
  radiologistLicense: string;
  institutionName: string;
  department: string;
  address: string;
  phone: string;
  email: string;
  headerNote: string;
  footerNote: string;
}

export const DEFAULT_USER_PROFILE: UserProfileSettings = {
  radiologistName: 'Dr. Diagnostic Radiologist, MD, FRCR',
  radiologistTitle: 'Senior Consultant Radiologist',
  radiologistLicense: 'RAD-984210',
  institutionName: 'Metropolitan Hospital & Diagnostic Imaging Center',
  department: 'Department of Radiology & Nuclear Medicine',
  address: '100 Medical Center Blvd, Suite 400',
  phone: '+1 (555) 234-5678',
  email: 'radiology@hospital-imaging.org',
  headerNote: 'CONFIDENTIAL MEDICAL DIAGNOSTIC REPORT',
  footerNote: 'This report was interpreted and electronically verified on RadGraph Calibrated PACS Workstation.'
};

const STORAGE_KEY = 'radgraph_user_profile_settings';

export class UserProfileService {
  static getProfile(): UserProfileSettings {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_USER_PROFILE, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not load user profile settings:', e);
    }
    return { ...DEFAULT_USER_PROFILE };
  }

  static saveProfile(profile: UserProfileSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.error('Could not save user profile settings:', e);
    }
  }
}
