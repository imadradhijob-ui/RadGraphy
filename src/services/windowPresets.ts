import { WindowPreset } from '../types/dicom';

export const DEFAULT_WINDOW_PRESETS: WindowPreset[] = [
  {
    id: 'ct_lung',
    name: 'CT Lung',
    arabicName: 'CT Lung (W:1500 C:-600)',
    windowCenter: -600,
    windowWidth: 1500,
    modality: 'CT',
    shortcut: '1'
  },
  {
    id: 'ct_bone',
    name: 'CT Bone',
    arabicName: 'CT Bone (W:1800 C:400)',
    windowCenter: 400,
    windowWidth: 1800,
    modality: 'CT',
    shortcut: '2'
  },
  {
    id: 'ct_brain',
    name: 'CT Brain',
    arabicName: 'CT Brain (W:80 C:40)',
    windowCenter: 40,
    windowWidth: 80,
    modality: 'CT',
    shortcut: '3'
  },
  {
    id: 'ct_soft_tissue',
    name: 'CT Soft Tissue',
    arabicName: 'CT Soft Tissue (W:400 C:40)',
    windowCenter: 40,
    windowWidth: 400,
    modality: 'CT',
    shortcut: '4'
  },
  {
    id: 'ct_mediastinum',
    name: 'CT Mediastinum',
    arabicName: 'CT Mediastinum (W:350 C:50)',
    windowCenter: 50,
    windowWidth: 350,
    modality: 'CT',
    shortcut: '5'
  },
  {
    id: 'ct_abdomen',
    name: 'CT Abdomen / Pelvis',
    arabicName: 'CT Abdomen (W:400 C:60)',
    windowCenter: 60,
    windowWidth: 400,
    modality: 'CT',
    shortcut: '6'
  },
  {
    id: 'ct_angio',
    name: 'CT Angiography',
    arabicName: 'CT Angio (W:600 C:300)',
    windowCenter: 300,
    windowWidth: 600,
    modality: 'CT',
    shortcut: '7'
  },
  {
    id: 'mr_t1',
    name: 'MRI T1',
    arabicName: 'MRI T1 (W:700 C:350)',
    windowCenter: 350,
    windowWidth: 700,
    modality: 'MR',
    shortcut: '8'
  },
  {
    id: 'mr_t2',
    name: 'MRI T2 / FLAIR',
    arabicName: 'MRI T2 (W:1200 C:600)',
    windowCenter: 600,
    windowWidth: 1200,
    modality: 'MR',
    shortcut: '9'
  },
  {
    id: 'dx_chest',
    name: 'X-Ray / DX Chest',
    arabicName: 'DX Chest (W:4096 C:2048)',
    windowCenter: 2048,
    windowWidth: 4096,
    modality: 'DX',
    shortcut: 'X'
  },
  {
    id: 'dx_bone',
    name: 'X-Ray / DX High Contrast',
    arabicName: 'DX High Contrast (W:2500 C:1500)',
    windowCenter: 1500,
    windowWidth: 2500,
    modality: 'DX',
    shortcut: 'C'
  },
  {
    id: 'us_standard',
    name: 'Ultrasound Standard',
    arabicName: 'Ultrasound (W:256 C:128)',
    windowCenter: 128,
    windowWidth: 256,
    modality: 'US',
    shortcut: 'U'
  },
  {
    id: 'auto_full',
    name: 'Full Dynamic Range',
    arabicName: 'Auto Full Dynamic Range',
    windowCenter: 128,
    windowWidth: 256,
    modality: 'ALL',
    shortcut: '0'
  }
];

export function getPresetsForModality(modality?: string): WindowPreset[] {
  if (!modality) return DEFAULT_WINDOW_PRESETS;
  return DEFAULT_WINDOW_PRESETS.filter(
    p => p.modality === 'ALL' || p.modality === modality
  );
}
