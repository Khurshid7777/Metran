import type normsJson from '../content/norms.json';

export type Norms = typeof normsJson;

export type AgeCategory = 'preterm' | 'term_neonate' | 'child' | 'adult';
export type SampleType = 'arterial' | 'venous' | 'capillary' | 'cord_artery' | 'cord_vein';

export type Disorder =
  | 'metabolic_acidosis'
  | 'metabolic_alkalosis'
  | 'respiratory_acidosis'
  | 'respiratory_alkalosis';

export type PrimaryKind = Disorder | 'mixed_acidosis' | 'mixed_alkalosis' | 'none';
export type PhStatus = 'acidemia' | 'alkalemia' | 'normal';
export type Chronicity = 'acute' | 'chronic' | 'acute_on_chronic';
export type Compensation = 'adequate' | 'excessive' | 'insufficient';
export type DeltaClass = 'normal_ag' | 'mixed_ag' | 'pure_high_ag' | 'plus_met_alk';
export type AcidosisType = 'high_ag' | 'normal_ag' | 'mixed_ag';

export interface CordPair {
  pH: number;
  pCO2?: number;
  BE?: number;
}

export interface Ventilation {
  mode: 'conventional' | 'hfo';
  rate?: number;
}

/** All values in internal units: mmHg, mmol/L, g/L, fraction for FiO2. */
export interface AbgInput {
  pH: number;
  pCO2: number;
  sampleType: SampleType;
  ageCategory: AgeCategory;
  HCO3?: number;
  BE?: number;
  gestationalWeeks?: number;
  bpd?: boolean;
  weightKg?: number;
  ageYears?: number;
  Na?: number;
  K?: number;
  Cl?: number;
  albumin?: number;
  lactate?: number;
  glucose?: number;
  urea?: number;
  measuredOsm?: number;
  iCa?: number;
  Mg?: number;
  pO2?: number;
  SpO2?: number;
  SaO2?: number;
  /** Total haemoglobin ctHb, g/L. */
  Hb?: number;
  /** Co-oximetry fractions, %. */
  FCOHb?: number;
  FMetHb?: number;
  /** Total bilirubin ctBil, µmol/L. */
  bilirubin?: number;
  /** Postnatal age in hours (neonates, for bilirubin and glucose). */
  ageHours?: number;
  /** Neurotoxicity risk factors (AAP 2022): GA < 38 wk, albumin < 30 g/L, haemolysis, sepsis, instability. */
  biliRisk?: boolean;
  /** Analyzer's pO2(a)/FO2(I), mmHg — used to derive FiO2 when FiO2 is not entered. */
  pO2FO2?: number;
  /** End-tidal CO2, mmHg (dead space). */
  etCO2?: number;
  /** Phosphate, mmol/L (strong ion gap). */
  phosphate?: number;
  FiO2?: number;
  MAP?: number;
  PEEP?: number;
  Patm?: number;
  temperature?: number;
  cordPair?: CordPair;
  ventilation?: Ventilation;
}

export interface Settings {
  advanced: boolean;
  agWithK: boolean;
  agNormOverride?: [number, number];
  bicarbFactor?: number;
  patm?: number;
}

export type Severity = 'info' | 'warning' | 'critical' | 'block';

export interface Flag {
  code: string;
  severity: Severity;
  params?: Record<string, number | string>;
}

export type StepId =
  | 'consistency'
  | 'ph'
  | 'primary'
  | 'compensation'
  | 'anionGap'
  | 'deltaRatio'
  | 'osmolar'
  | 'stewart'
  | 'oxygenation'
  | 'labs';

export type StepStatus = 'done' | 'insufficient' | 'disabled';

export interface Step {
  id: StepId;
  status: StepStatus;
  value?: number;
  normalRange?: [number, number];
  verdict?: string;
  explanationKey: string;
  flags: Flag[];
  details: Record<string, number | string | boolean | undefined>;
}

export interface DisorderEntry {
  type: Disorder;
  role: 'primary' | 'secondary';
  source: 'primary' | 'compensation' | 'delta' | 'ag';
}

export interface DifferentialItem {
  group: string;
  causes: string[];
  checks: string[];
}

export interface BicarbResult {
  deficit: number;
  firstDose: number;
  concentration: '4.2' | '8.4';
  volumeMl: number;
  factor: number;
  blocked: boolean;
  blockers: Flag[];
  warnings: Flag[];
}

export interface VentResult {
  currentRate: number;
  targetPCO2: number;
  newRate: number;
  limits: [number, number];
  outOfLimits: boolean;
}

export interface TreatmentResult {
  available: boolean;
  potassium?: import('./labs').PotassiumPlan;
  calcium?: import('./labs').CalciumPlan;
  bicarbonate?: BicarbResult;
  ventilation?: VentResult;
  hfoHints: string[];
  causeHints: string[];
}

export interface SummaryPart {
  key: string;
  params?: Record<string, number | string>;
}

export interface InterpretationResult {
  blocked: boolean;
  inputErrors: InputError[];
  steps: Step[];
  phStatus?: PhStatus;
  primary: PrimaryKind;
  chronicity?: Chronicity;
  compensation?: Compensation;
  acidosisType?: AcidosisType;
  disorders: DisorderEntry[];
  secondary: Disorder[];
  flags: Flag[];
  differentials: DifferentialItem[];
  treatment?: TreatmentResult;
  summary: SummaryPart[];
  /** Formulas with the patient's numbers substituted. */
  workings: import('./workings').Working[];
  deficits: import('./deficits').Deficit[];
  bilirubin?: import('./bilirubin').BiliAssessment;
  /** Extended assessment: derived values with formulas and norms. */
  metrics: import('./extended').Metric[];
  computed: { HCO3: number; HCO3Calculated: boolean };
}

export interface InputError {
  field: string;
  code: 'out_of_range' | 'required' | 'not_a_number';
  range?: [number, number];
}

export interface Ctx {
  input: AbgInput;
  settings: Settings;
  norms: Norms;
  HCO3: number;
}
