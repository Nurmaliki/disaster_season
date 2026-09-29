/**
 * Client-safe risk vocabulary.
 *
 * The Risk Engine lives on the server, but the disclaimer and level labels must
 * be renderable in the browser (the about page, the risk card). Keeping these
 * strings here — with no server imports — avoids pulling server code into the
 * client bundle.
 */

export const RISK_DISCLAIMER =
	'Skor Risiko merupakan indikator aplikasi berdasarkan data yang tersedia dan bukan peringatan resmi. ' +
	'Ikuti informasi resmi BMKG, BNPB, BPBD, dan PVMBG.';

export const RISK_LEVEL_LABELS = {
	low: 'Rendah',
	moderate: 'Sedang',
	high: 'Tinggi',
	very_high: 'Sangat Tinggi'
} as const;

export const RISK_LEVEL_BANDS = {
	low: { min: 0, max: 25, label: RISK_LEVEL_LABELS.low },
	moderate: { min: 26, max: 50, label: RISK_LEVEL_LABELS.moderate },
	high: { min: 51, max: 75, label: RISK_LEVEL_LABELS.high },
	very_high: { min: 76, max: 100, label: RISK_LEVEL_LABELS.very_high }
} as const;
