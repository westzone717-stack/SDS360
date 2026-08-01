// ─── Canonical SDS field schema ─────────────────────────────────────────────
// Matches the internal "SDS Summary" review-form layout exactly (not the full
// 16-section GHS format): top-level metadata + 6 fixed sections, most of them
// single-select / multi-select checklists rather than free text. One section
// ("Hazardous Ingredients") is a repeating group with a fixed set of columns.
//
// This is the single source of truth for the extraction prompt, the Mongoose
// schema, and the frontend editor/review UI.

export type SdsSectionType = 'text' | 'single_select' | 'multi_select' | 'ingredients';

export interface SdsSelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SdsMetaFieldDef {
  key: string;
  label: string;
}

export interface SdsIngredientColumnDef {
  key: string;
  label: string;
}

export interface SdsSectionDef {
  key: string;
  label: string;
  type: SdsSectionType;
  options?: SdsSelectOption[];
  ingredientFields?: SdsIngredientColumnDef[];
}

// ─── Top-level document metadata (plain text, not part of the review workflow) ──

export const SDS_METADATA_FIELDS: SdsMetaFieldDef[] = [
  { key: 'productName', label: 'Product name' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'entityBusinessName', label: 'Entity/Business Name' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'reviewDate', label: 'Review date' },
  { key: 'reviewBy', label: 'Review By' },
];

// ─── Hazardous Ingredients columns (one row per component) ─────────────────────

export const SDS_INGREDIENT_FIELDS: SdsIngredientColumnDef[] = [
  { key: 'casNumber', label: 'CAS Number' },
  { key: 'component', label: 'Component' },
  { key: 'concentration', label: 'Concentration' },
  { key: 'acgihTlvTwa', label: 'ACGIH TLV-TWA (Long-Term)' },
  { key: 'acgihTlvStel', label: 'ACGIH TLV-STEL (Short-Term)' },
  { key: 'acgihTlvC', label: 'ACGIH TLV-C' },
  { key: 'mbOelTwa', label: 'MB OEL-TWA (Long-Term)' },
  { key: 'mbOelStel', label: 'MB OEL-STEL (Short-Term)' },
  { key: 'mbOelC', label: 'MB OEL-C' },
];

const PHYSICAL_STATE_OPTIONS: SdsSelectOption[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'gas', label: 'Gas' },
  { value: 'aqueous', label: 'Aqueous' },
];

const PHYSICAL_HAZARD_CLASS_OPTIONS: SdsSelectOption[] = [
  { value: 'explosives', label: 'Explosives' },
  { value: 'flammableGases', label: 'Flammable gases' },
  { value: 'aerosols', label: 'Aerosols' },
  { value: 'oxidizingGases', label: 'Oxidizing gases' },
  { value: 'gasesUnderPressure', label: 'Gases under pressure' },
  { value: 'flammableLiquids', label: 'Flammable liquids' },
  { value: 'flammableSolids', label: 'Flammable solids' },
  { value: 'selfReactiveSubstances', label: 'Self-reactive substances and mixtures' },
  { value: 'pyrophoricLiquids', label: 'Pyrophoric liquids' },
  { value: 'pyrophoricSolids', label: 'Pyrophoric solids' },
  { value: 'selfHeatingSubstances', label: 'Self-heating substances and mixtures' },
  { value: 'waterReactive', label: 'Substances and mixtures which, in contact with water, emit flammable gases' },
  { value: 'oxidizingLiquids', label: 'Oxidizing liquids' },
  { value: 'oxidizingSolids', label: 'Oxidizing solids' },
  { value: 'organicPeroxides', label: 'Organic peroxides' },
  { value: 'corrosiveToMetals', label: 'Corrosive to metals' },
  { value: 'desensitizedExplosives', label: 'Desensitized explosives' },
];

const HEALTH_EFFECT_OPTIONS: SdsSelectOption[] = [
  { value: 'irritation', label: 'Irritation', description: 'Temporary inflammation of the skin, eyes, or respiratory tract.' },
  { value: 'corrosion', label: 'Corrosion', description: 'Permanent damage to skin or eyes.' },
  { value: 'acuteToxicity', label: 'Acute toxicity', description: 'Harmful effects from a single or short-term exposure.' },
  { value: 'chronicToxicity', label: 'Chronic toxicity', description: 'Harmful effects from repeated or long-term exposure.' },
  { value: 'carcinogenicity', label: 'Carcinogenicity', description: 'Ability to cause cancer.' },
  { value: 'mutagenicity', label: 'Mutagenicity (Genotoxicity)', description: 'Ability to damage DNA or cause genetic mutations.' },
  { value: 'reproductiveToxicity', label: 'Reproductive toxicity', description: 'Harm to fertility or sexual function.' },
  { value: 'developmentalToxicity', label: 'Developmental toxicity (Teratogenicity)', description: 'Harm to a developing embryo or fetus.' },
  { value: 'respiratoryToxicity', label: 'Respiratory toxicity', description: 'Damage to the lungs or airways, including effects such as chronic lung disease or impaired breathing.' },
  { value: 'sensitization', label: 'Sensitization (Allergic effects)', description: 'Skin or respiratory allergic reactions after exposure.' },
  { value: 'neurotoxicity', label: 'Neurotoxicity', description: 'Damage to the brain, spinal cord, or peripheral nerves.' },
  { value: 'immunotoxicity', label: 'Immunotoxicity', description: 'Damage to or suppression of the immune system, or abnormal immune responses.' },
  { value: 'asphyxiation', label: 'Asphyxiation', description: 'Reduced oxygen supply to the body due to oxygen displacement or interference with oxygen transport.' },
  { value: 'organToxicity', label: 'Organ toxicity', description: 'Liver, kidney, heart, blood endocrine effects' },
  { value: 'endocrineDisruption', label: 'Endocrine disruption', description: 'Hormone interference' },
];

const LABEL_COLOR_OPTIONS: SdsSelectOption[] = [
  { value: 'white', label: 'White', description: 'Very Low — Minimal hazard; routine precautions.' },
  { value: 'green', label: 'Green', description: 'Low — Low risk; standard safe work practices.' },
  { value: 'yellow', label: 'Yellow', description: 'Moderate — Moderate risk; additional controls or PPE required.' },
  { value: 'orange', label: 'Orange', description: 'High — Significant risk; strict controls, trained personnel, and appropriate PPE required.' },
  { value: 'red', label: 'Red', description: 'Very High / Extreme — Serious or potentially life-threatening hazard; highest level of controls and emergency preparedness required.' },
];

const PPE_OPTIONS: SdsSelectOption[] = [
  { value: 'handProtection', label: 'Hand Protection', description: 'Should use if repeated or significant contact' },
  { value: 'eyeProtection', label: 'Eye Protection', description: 'Should be worn whenever there is a risk of eye exposure' },
  { value: 'respiratoryProtection', label: 'Respiratory Protection', description: 'Recommended if more than 50% OEL. Must if more than 100% OEL.' },
  { value: 'skinBodyProtection', label: 'Skin & Body Protection', description: 'Should use if repeated or significant contact' },
];

export const SDS_SCHEMA: SdsSectionDef[] = [
  { key: 'physicalState', label: 'Physical State', type: 'single_select', options: PHYSICAL_STATE_OPTIONS },
  { key: 'hazardousIngredients', label: 'Hazardous Ingredients', type: 'ingredients', ingredientFields: SDS_INGREDIENT_FIELDS },
  { key: 'physicalHazardClasses', label: 'Physical Hazard Classes', type: 'multi_select', options: PHYSICAL_HAZARD_CLASS_OPTIONS },
  { key: 'healthEffects', label: 'Health Effects', type: 'multi_select', options: HEALTH_EFFECT_OPTIONS },
  { key: 'labelColor', label: 'Label Color', type: 'single_select', options: LABEL_COLOR_OPTIONS },
  { key: 'ppeRecommendations', label: 'PPE Recommendations', type: 'multi_select', options: PPE_OPTIONS },
];

export const SDS_SECTION_KEYS = SDS_SCHEMA.map((s) => s.key);

export function getSdsSection(key: string): SdsSectionDef | undefined {
  return SDS_SCHEMA.find((s) => s.key === key);
}

// ─── Nested data (stored value) types ──────────────────────────────────────────

export interface SdsIngredient {
  casNumber: string;
  component: string;
  concentration: string;
  acgihTlvTwa: string;
  acgihTlvStel: string;
  acgihTlvC: string;
  mbOelTwa: string;
  mbOelStel: string;
  mbOelC: string;
}

export const EMPTY_INGREDIENT: SdsIngredient = {
  casNumber: '', component: '', concentration: '',
  acgihTlvTwa: '', acgihTlvStel: '', acgihTlvC: '',
  mbOelTwa: '', mbOelStel: '', mbOelC: '',
};

export interface SdsSectionData {
  // Exactly one of these is populated, matching the section's `type`.
  value?: string;           // text / single_select
  values?: string[];        // multi_select
  items?: SdsIngredient[];  // ingredients
  confidence: number;
  fieldStatus: 'pending' | 'ai_approved' | 'human_approved';
  sourceLocation?: { page: number; excerpt: string };
}

export type SdsSectionsMap = Record<string, SdsSectionData>;

export interface SdsMetadata {
  productName: string;
  supplier: string;
  entityBusinessName: string;
  quantity: string;
  reviewDate: string;
  reviewBy: string;
}
