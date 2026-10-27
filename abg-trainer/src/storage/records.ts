import { load, save } from './index';

export type Specialty = 'neonatologist' | 'pediatrician' | 'anesthesiologist' | 'nurse' | 'student' | 'resident';

export interface Profile {
  fullName: string;
  specialty: Specialty | '';
  institution: string;
  lang?: 'ru' | 'uz' | 'en';
}

export interface AnswerRecord {
  qid: string;
  stepId: string;
  answer: string;
  correct: boolean;
  points: number;
  max: number;
  hint: boolean;
}

export interface AttemptRecord {
  id: string;
  date: string;
  mode: 'trainer' | 'exam';
  level: number;
  caseId: string;
  seed?: number;
  examId?: string;
  answers: AnswerRecord[];
  timeMs: number;
  hintsUsed: number;
  score: number;
  maxScore: number;
  conclusionCorrect: boolean;
  hasSecondary: boolean;
  missedSecondary: boolean;
  albuminMasked: boolean;
  missedAlbumin: boolean;
}

export interface ExamRecord {
  examId: string;
  date: string;
  level: number;
  seed: number;
  cases: number;
  percent: number;
  passed: boolean;
  durationMs: number;
  certCode?: string;
  fullName?: string;
}

export const getProfile = (): Profile => load<Profile>('profile', { fullName: '', specialty: '', institution: '' });
export const setProfile = (p: Profile) => save('profile', p);
export const getAttempts = (): AttemptRecord[] => load<AttemptRecord[]>('attempts', []);
export const getExams = (): ExamRecord[] => load<ExamRecord[]>('exams', []);

export function addAttempt(a: AttemptRecord): void {
  save('attempts', [...getAttempts(), a]);
}

export function addExam(e: ExamRecord): void {
  save('exams', [...getExams(), e]);
}

export function updateExam(e: ExamRecord): void {
  save('exams', getExams().map((x) => (x.examId === e.examId ? e : x)));
}

/** Short hash (cyrb53), used for certificate codes. Pure JS so it works from file://. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function certificateCode(profile: Profile, exam: Pick<ExamRecord, 'examId' | 'level' | 'percent' | 'date'>): string {
  const raw = [profile.fullName, profile.specialty, profile.institution, exam.examId, exam.level, exam.percent, exam.date].join('|');
  const h = cyrb53(raw).toString(36).toUpperCase().padStart(11, '0');
  return `ABG-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8)}`;
}

export function findCertificate(code: string): ExamRecord | undefined {
  const c = code.trim().toUpperCase();
  return getExams().find((e) => e.certCode === c);
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const DAY = 86400000;

export interface Kpi {
  firstExamAccuracy: number | null;
  lastExamAccuracy: number | null;
  missedMixedRate: number | null;
  missedAlbuminRate: number | null;
  medianTimeByLevel: Record<string, number | null>;
  retention: { earlier: number; later: number; days: number } | null;
}

function examConclusionAccuracy(attempts: AttemptRecord[], examId: string): number | null {
  const list = attempts.filter((a) => a.examId === examId);
  return list.length ? list.filter((a) => a.conclusionCorrect).length / list.length : null;
}

export function computeKpi(attempts: AttemptRecord[], exams: ExamRecord[]): Kpi {
  const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const mixed = attempts.filter((a) => a.hasSecondary);
  const masked = attempts.filter((a) => a.albuminMasked);
  const medianTimeByLevel: Record<string, number | null> = {};
  for (const lvl of [1, 2, 3]) medianTimeByLevel[lvl] = median(attempts.filter((a) => a.level === lvl).map((a) => a.timeMs / 1000));
  let retention: Kpi['retention'] = null;
  if (last) {
    const earlier = [...sorted].reverse().find((e) => new Date(last.date).getTime() - new Date(e.date).getTime() >= 90 * DAY);
    if (earlier) {
      retention = { earlier: earlier.percent, later: last.percent, days: Math.round((new Date(last.date).getTime() - new Date(earlier.date).getTime()) / DAY) };
    }
  }
  return {
    firstExamAccuracy: first ? examConclusionAccuracy(attempts, first.examId) : null,
    lastExamAccuracy: last ? examConclusionAccuracy(attempts, last.examId) : null,
    missedMixedRate: mixed.length ? mixed.filter((a) => a.missedSecondary).length / mixed.length : null,
    missedAlbuminRate: masked.length ? masked.filter((a) => a.missedAlbumin).length / masked.length : null,
    medianTimeByLevel,
    retention,
  };
}

/** Accuracy per step: share of correct answers across all attempts. */
export function stepAccuracy(attempts: AttemptRecord[]): Record<string, { correct: number; total: number }> {
  const out: Record<string, { correct: number; total: number }> = {};
  for (const a of attempts) {
    for (const ans of a.answers) {
      const s = (out[ans.stepId] ??= { correct: 0, total: 0 });
      s.total++;
      if (ans.correct) s.correct++;
    }
  }
  return out;
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function exportCsv(profile: Profile, attempts: AttemptRecord[]): string {
  const head = [
    'fullName', 'specialty', 'institution', 'attemptId', 'date', 'mode', 'level', 'caseId', 'seed', 'examId',
    'timeSec', 'hintsUsed', 'score', 'maxScore', 'conclusionCorrect', 'hasSecondary', 'missedSecondary',
    'albuminMasked', 'missedAlbumin', 'qid', 'stepId', 'answer', 'correct', 'points', 'max', 'hint',
  ];
  const rows = [head.join(',')];
  for (const a of attempts) {
    for (const q of a.answers) {
      rows.push(
        [
          profile.fullName, profile.specialty, profile.institution, a.id, a.date, a.mode, a.level, a.caseId, a.seed, a.examId,
          Math.round(a.timeMs / 1000), a.hintsUsed, a.score, a.maxScore, a.conclusionCorrect, a.hasSecondary, a.missedSecondary,
          a.albuminMasked, a.missedAlbumin, q.qid, q.stepId, q.answer, q.correct, q.points, q.max, q.hint,
        ].map(csvCell).join(','),
      );
    }
  }
  return rows.join('\n');
}

export function exportJson(profile: Profile, attempts: AttemptRecord[], exams: ExamRecord[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), profile, kpi: computeKpi(attempts, exams), exams, attempts }, null, 2);
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
