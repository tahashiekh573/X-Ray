import type { LabelSnapshot } from '@/features/rendering/screenshot';

/** Latest on-screen labels, used by the screenshot compositor. */
export const latestLabels: { items: LabelSnapshot[] } = { items: [] };
