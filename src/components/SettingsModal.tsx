import React, { useState, useEffect } from 'react';
import {
  Settings,
  X,
  User,
  Hospital,
  Shield,
  Save,
  RotateCcw,
  CheckCircle,
  FileText,
  Phone,
  Mail,
  MapPin,
  Award
} from 'lucide-react';
import { UserProfileService, UserProfileSettings, DEFAULT_USER_PROFILE } from '../services/userProfileService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (profile: UserProfileSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated
}) => {
  const [profile, setProfile] = useState<UserProfileSettings>(DEFAULT_USER_PROFILE);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setProfile(UserProfileService.getProfile());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    UserProfileService.saveProfile(profile);
    setSavedSuccess(true);
    if (onProfileUpdated) {
      onProfileUpdated(profile);
    }
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    if (confirm('Reset all physician and institution details to default template?')) {
      setProfile(DEFAULT_USER_PROFILE);
      UserProfileService.saveProfile(DEFAULT_USER_PROFILE);
      if (onProfileUpdated) {
        onProfileUpdated(DEFAULT_USER_PROFILE);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none animate-fade-in">
      <div className="bg-radiant-panel border border-radiant-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-radiant-border flex items-center justify-between bg-gradient-to-r from-radiant-card to-radiant-panel">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-600/20 text-cyan-400 rounded-xl border border-cyan-500/40">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Physician & Institution Settings</span>
                <span className="px-2 py-0.5 bg-cyan-950 text-cyan-300 rounded text-[10px] font-mono border border-cyan-700">
                  Report Profile
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure your interpreting radiologist information and hospital branding for medical reports.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-radiant-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-200">
          {/* 1. Interpreting Radiologist Details */}
          <div className="bg-radiant-card/70 border border-radiant-border rounded-xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 font-bold text-sm text-cyan-300 border-b border-radiant-border/80 pb-2">
              <User className="w-4 h-4 text-cyan-400" />
              <span>Interpreting Radiologist Information</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Radiologist Full Name & Credentials *
                </label>
                <input
                  type="text"
                  required
                  value={profile.radiologistName}
                  onChange={(e) => setProfile({ ...profile, radiologistName: e.target.value })}
                  placeholder="e.g. Dr. John Doe, MD, FRCR"
                  className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-cyan-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Professional Title / Subspecialty
                </label>
                <input
                  type="text"
                  value={profile.radiologistTitle}
                  onChange={(e) => setProfile({ ...profile, radiologistTitle: e.target.value })}
                  placeholder="e.g. Consultant Musculoskeletal Radiologist"
                  className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Medical License / Registry Number
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={profile.radiologistLicense}
                    onChange={(e) => setProfile({ ...profile, radiologistLicense: e.target.value })}
                    placeholder="e.g. RAD-109482"
                    className="w-full bg-radiant-darkest border border-radiant-border rounded-lg pl-8 pr-3 py-2 text-slate-100 outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Physician Direct Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    placeholder="doctor@hospital.org"
                    className="w-full bg-radiant-darkest border border-radiant-border rounded-lg pl-8 pr-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Hospital & Institution Details */}
          <div className="bg-radiant-card/70 border border-radiant-border rounded-xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-300 border-b border-radiant-border/80 pb-2">
              <Hospital className="w-4 h-4 text-emerald-400" />
              <span>Hospital & Institution Branding</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Institution / Hospital Name *
                </label>
                <input
                  type="text"
                  required
                  value={profile.institutionName}
                  onChange={(e) => setProfile({ ...profile, institutionName: e.target.value })}
                  placeholder="e.g. Central University Hospital & Imaging Institute"
                  className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Department / Division
                </label>
                <input
                  type="text"
                  value={profile.department}
                  onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                  placeholder="e.g. Department of Radiology & Imaging Sciences"
                  className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Contact Telephone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="+1 (555) 019-2834"
                    className="w-full bg-radiant-darkest border border-radiant-border rounded-lg pl-8 pr-3 py-2 text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Facility Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={profile.address}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                    placeholder="1200 Healthcare Way, Suite 300, Medical City"
                    className="w-full bg-radiant-darkest border border-radiant-border rounded-lg pl-8 pr-3 py-2 text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Report Footer & Verification Statement */}
          <div className="bg-radiant-card/70 border border-radiant-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-purple-300 border-b border-radiant-border/80 pb-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <span>Report Statements & Compliance Notice</span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Electronic Verification & Attestation Statement
              </label>
              <textarea
                rows={2}
                value={profile.footerNote}
                onChange={(e) => setProfile({ ...profile, footerNote: e.target.value })}
                className="w-full bg-radiant-darkest border border-radiant-border rounded-lg p-2.5 text-slate-100 outline-none focus:border-purple-500 font-sans text-xs resize-none"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-radiant-hover rounded-lg transition-colors text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Defaults</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-radiant-card hover:bg-radiant-hover text-slate-300 rounded-lg transition-colors text-xs font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors text-xs font-bold shadow-lg shadow-cyan-600/30"
              >
                {savedSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Settings</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
