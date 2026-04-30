export type LabelPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type CardSize = 'sm' | 'md' | 'lg';
export type PaperTheme = 'light' | 'dark';

export interface PaperOptions {
  showNumber: boolean;
  showName: boolean;
  showSmiles: boolean;
  showMW: boolean;
  numberPos: LabelPosition;
  namePos: LabelPosition;
  smilesPos: LabelPosition;
  mwPos: LabelPosition;
  cardSize: CardSize;
  theme: PaperTheme;
  bgColor: 'white' | 'transparent';
}

export const defaultPaperOptions: PaperOptions = {
  showNumber: true,
  showName: true,
  showSmiles: false,
  showMW: false,
  numberPos: 'top-left',
  namePos: 'bottom-center',
  smilesPos: 'bottom-center',
  mwPos: 'bottom-right',
  cardSize: 'md',
  theme: 'light',
  bgColor: 'white',
};

export const cardSizes: Record<CardSize, { width: number; imgSize: number; label: string }> = {
  sm: { width: 150, imgSize: 130, label: 'Small' },
  md: { width: 200, imgSize: 180, label: 'Medium' },
  lg: { width: 280, imgSize: 250, label: 'Large' },
};
