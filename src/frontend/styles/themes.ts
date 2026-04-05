export const colors = {
  navy:        '#0d1f3c',
  navyLight:   '#1a3358',
  blue:        '#005eb8',
  blueLight:   '#e8f0fb',
  teal:        '#007a6e',
  tealLight:   '#e0f2f0',
  bg:          '#f4f6f9',
  surface:     '#ffffff',
  border:      '#dde3ec',
  borderLight: '#eef1f6',
  text:        '#0d1f3c',
  textMuted:   '#64748b',
  textLight:   '#94a3b8',
  success:     '#059669',
  successBg:   '#ecfdf5',
  warning:     '#d97706',
  warningBg:   '#fffbeb',
  danger:      '#dc2626',
  dangerBg:    '#fef2f2',
};

export const radius = { sm: '4px', md: '8px', lg: '12px' };

export const shadow = {
  sm: '0 1px 3px rgba(13,31,60,0.08)',
  md: '0 4px 12px rgba(13,31,60,0.10)',
  lg: '0 8px 24px rgba(13,31,60,0.12)',
};

export const font = "'Inter', system-ui, -apple-system, sans-serif";

// legacy — mantido para não quebrar imports antigos
export const defaultColors = {
  backgroundColor: colors.navy,
  color: '#ffffff',
};
