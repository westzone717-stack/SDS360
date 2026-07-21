// ─── Canonical 3-level SDS field schema ────────────────────────────────────────
// Level 1: 16 GHS SDS sections (fixed keys, used throughout the codebase)
// Level 2: subsections within each section
// Level 3: discrete fields within each subsection
//
// This is the single source of truth for the extraction prompt, the Mongoose
// schema, and the frontend editor/review tree.

function toKey(label: string): string {
  const noLeadingNumber = label.replace(/^[\d.]+\s*/, '');
  const cleaned = noLeadingNumber.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const words = cleaned.split(' ').filter(Boolean);
  if (words.length === 0) return label.toLowerCase();
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export interface SdsFieldDef {
  key: string;
  label: string;
}

export interface SdsSubsectionDef {
  key: string;
  label: string;
  fields: SdsFieldDef[];
}

export interface SdsSectionDef {
  key: string;
  label: string;
  subsections: SdsSubsectionDef[];
}

interface RawSubsection {
  label: string;
  fields: string[];
}

interface RawSection {
  key: string;
  label: string;
  subsections: RawSubsection[];
}

const RAW_SCHEMA: RawSection[] = [
  {
    key: 'identification',
    label: '1. Identification',
    subsections: [
      { label: '1.1 Product Identification', fields: ['Product Identifier', 'Product Name', 'Product Code', 'Product Number', 'Catalogue Number', 'Synonym', 'Other Means of Identification'] },
      { label: '1.2 Recommended Use & Restrictions', fields: ['Recommended Use', 'Intended Use', 'Identified Use', 'Restrictions on Use', 'Uses Advised Against'] },
      { label: '1.3 Supplier/Manufacturer Information', fields: ['Supplier Name', 'Manufacturer Name', 'Distributor Name', 'Company Name', 'Address', 'City', 'State/Province', 'Postal Code', 'Country', 'Telephone', 'Fax', 'Email', 'Website'] },
      { label: '1.4 Emergency Contact', fields: ['Emergency Phone', 'Emergency Service Provider', 'CHEMTREC Number', 'Availability', 'Emergency Restrictions'] },
    ],
  },
  {
    key: 'hazardIdentification',
    label: '2. Hazard(s) Identification',
    subsections: [
      { label: '2.1 Hazard Classification', fields: ['GHS Classification', 'Physical Hazard Class', 'Health Hazard Class', 'Environmental Hazard Class', 'Hazard Category'] },
      { label: '2.2 GHS Label Elements', fields: ['Signal Word', 'Hazard Statements', 'Precautionary Statements', 'Supplemental Statements', 'Prevention Statements', 'Response Statements', 'Storage Statements', 'Disposal Statements'] },
      { label: '2.3 Pictograms', fields: ['Flame', 'Corrosion', 'Exploding Bomb', 'Gas Cylinder', 'Skull and Crossbones', 'Health Hazard', 'Exclamation Mark', 'Environment'] },
      { label: '2.4 Other Hazards', fields: ['HNOC', 'Other Physical Hazards', 'NFPA Rating', 'HMIS Rating'] },
      { label: '2.5 Unknown Acute Toxicity', fields: ['Unknown Toxicity Percentage', 'Unknown Acute Toxicity Mixture', 'Ingredients with Unknown Toxicity'] },
    ],
  },
  {
    key: 'composition',
    label: '3. Composition / Ingredients',
    subsections: [
      { label: '3.1 Substance/Mixture Status', fields: ['Substance', 'Mixture', 'Status Flag'] },
      { label: '3.2 Substance Information', fields: ['Chemical Name', 'Common Name', 'Synonym', 'CAS Number', 'EC Number', 'Index Number', 'UN Number', 'Molecular Formula', 'Molecular Weight', 'Purity'] },
      { label: '3.3 Mixture Composition/Ingredient Details', fields: ['Ingredient Name', 'Chemical Name', 'Common Name', 'CAS Number', 'EC Number', 'Index Number', 'UN Number', 'Concentration', 'Concentration Range', 'Classification'] },
      { label: '3.4 Hazardous Components', fields: ['Hazardous Ingredient Name', 'CAS Number', 'Concentration', 'Hazard Classification'] },
      { label: '3.5 Trade Secret/Proprietary Claims', fields: ['Trade Secret Claim', 'Proprietary Identifier', 'Withheld Ingredient', 'Withheld Concentration'] },
    ],
  },
  {
    key: 'firstAidMeasures',
    label: '4. First-Aid Measures',
    subsections: [
      { label: '4.1 Description of First Aid Measures', fields: ['Inhalation', 'Skin Contact', 'Eye Contact', 'Ingestion'] },
      { label: '4.2 Most Important Symptoms and Effects', fields: ['Acute Symptoms', 'Delayed Symptoms', 'Immediate Effects', 'Chronic Effects'] },
      { label: '4.3 Immediate Medical Attention/Special Treatment', fields: ['Immediate Medical Attention', 'Special Treatment', 'Notes to Physician'] },
    ],
  },
  {
    key: 'fireFightingMeasures',
    label: '5. Fire-Fighting Measures',
    subsections: [
      { label: '5.1 Extinguishing Media', fields: ['Suitable Extinguishing Media', 'Unsuitable Extinguishing Media'] },
      { label: '5.2 Specific Hazards Arising from the Chemical', fields: ['Specific Fire Hazards', 'Explosion Hazards', 'Fire and Explosion Hazards'] },
      { label: '5.3 Hazardous Combustion Products', fields: ['Combustion Products', 'Thermal Decomposition Products'] },
      { label: '5.4 Advice/Protection for Firefighters', fields: ['Protective Equipment', 'Special Protective Actions', 'Firefighting Procedures', 'Specific Tactics'] },
    ],
  },
  {
    key: 'accidentalReleaseMeasures',
    label: '6. Accidental Release Measures',
    subsections: [
      { label: '6.1 Personal Precautions, PPE & Emergency Procedures', fields: ['Personal Precautions', 'PPE Requirements', 'Evacuation', 'Ignition Control', 'Emergency Actions'] },
      { label: '6.2 Environmental Precautions', fields: ['Environmental Protection Measures', 'Environmental Impact', 'Prevent Entry to Drains', 'Prevent Release to Environment'] },
      { label: '6.3 Methods and Materials for Containment', fields: ['Containment Methods', 'Spill Control', 'Diking', 'Absorbent Material'] },
      { label: '6.4 Methods and Materials for Cleanup', fields: ['Cleanup Methods', 'Collection Method', 'Cleaning Material', 'Disposal of Spill Residue'] },
      { label: '6.5 Reference to Other Sections', fields: ['Reference to Section 8', 'Reference to Section 13'] },
    ],
  },
  {
    key: 'handlingAndStorage',
    label: '7. Handling and Storage',
    subsections: [
      { label: '7.1 Precautions for Safe Handling', fields: ['Handling Procedures', 'Safe Work Practices', 'Ventilation During Handling', 'Avoid Contact', 'Avoid Inhalation', 'Ignition Prevention'] },
      { label: '7.2 General Hygiene Measures', fields: ['Wash Hands', 'Remove Contaminated Clothing', 'No Eating or Drinking', 'Good Industrial Hygiene'] },
      { label: '7.3 Conditions for Safe Storage', fields: ['Storage Conditions', 'Storage Temperature', 'Storage Pressure', 'Humidity', 'Vessel Type', 'Keep Container Closed'] },
      { label: '7.4 Incompatibilities', fields: ['Incompatible Materials', 'Segregation Requirements', 'Materials to Avoid'] },
      { label: '7.5 Specific End Use(s)', fields: ['Specific End Use', 'Industrial Use', 'Professional Use'] },
    ],
  },
  {
    key: 'exposureControls',
    label: '8. Exposure Controls / Personal Protection',
    subsections: [
      { label: '8.1 Control Parameters/Exposure Limits', fields: ['Component', 'OSHA PEL', 'ACGIH TLV', 'NIOSH REL', 'TWA', 'STEL', 'Ceiling Limit', 'Biological Limits', 'Limit Value', 'Regulatory Body', 'Unit'] },
      { label: '8.2 Appropriate Engineering Controls', fields: ['Local Exhaust', 'General Ventilation', 'Closed System', 'Process Enclosure', 'Safety Shower', 'Eye Wash Station'] },
      { label: '8.3 Eye/Face Protection', fields: ['Safety Glasses', 'Chemical Goggles', 'Face Shield', 'Eye Protection Type', 'Specification'] },
      { label: '8.4 Hand Protection', fields: ['Glove Material', 'Breakthrough Time', 'Glove Thickness', 'Permeation Rate', 'Glove Type'] },
      { label: '8.5 Skin/Body Protection', fields: ['Protective Clothing', 'Protective Footwear', 'Apron', 'Body Protection Type'] },
      { label: '8.6 Respiratory Protection', fields: ['Respirator Type', 'Filter Type', 'Cartridge Type', 'Required Protection Factor'] },
      { label: '8.7 Thermal Hazards', fields: ['Heat Protection', 'Cold Protection'] },
      { label: '8.8 General Hygiene Measures', fields: ['Handwashing', 'Clothing Removal', 'Washing Facilities', 'Hygiene Practices'] },
    ],
  },
  {
    key: 'physicalAndChemicalProperties',
    label: '9. Physical and Chemical Properties',
    subsections: [
      { label: '9.1 Appearance/Physical State', fields: ['Appearance', 'Physical State', 'Form', 'Color', 'Colour'] },
      { label: '9.2 Odor Properties', fields: ['Odor', 'Odour', 'Odor Threshold', 'Odour Threshold'] },
      { label: '9.3 Acidity/Alkalinity', fields: ['pH'] },
      { label: '9.4 Phase Change Properties', fields: ['Melting Point', 'Freezing Point', 'Initial Boiling Point', 'Boiling Point', 'Boiling Range'] },
      { label: '9.5 Flammability Properties', fields: ['Flammability', 'Flash Point', 'Flash Point Method', 'Auto-Ignition Temperature', 'Upper Explosion Limit', 'Lower Explosion Limit', 'Upper Flammability Limit', 'Lower Flammability Limit'] },
      { label: '9.6 Vapor/Volatility Properties', fields: ['Evaporation Rate', 'Vapor Pressure', 'Vapour Pressure', 'Vapor Density', 'Vapour Density'] },
      { label: '9.7 Density Properties', fields: ['Density', 'Relative Density', 'Specific Gravity', 'Bulk Density'] },
      { label: '9.8 Solubility Properties', fields: ['Water Solubility', 'Solubility', 'Solubility in Other Solvents'] },
      { label: '9.9 Partition Properties', fields: ['Partition Coefficient', 'Log Kow', 'n-Octanol/Water Partition Coefficient'] },
      { label: '9.10 Thermal/Stability Properties', fields: ['Decomposition Temperature', 'Oxidizing Properties', 'Explosive Properties'] },
      { label: '9.11 Flow/Particle Properties', fields: ['Viscosity', 'Kinematic Viscosity', 'Dynamic Viscosity', 'Particle Characteristics', 'Particle Size'] },
      { label: '9.12 Other Physical/Chemical Properties', fields: ['Refractive Index', 'Surface Tension', 'Molecular Weight', 'VOC Content', 'Percent Volatile'] },
    ],
  },
  {
    key: 'stabilityAndReactivity',
    label: '10. Stability and Reactivity',
    subsections: [
      { label: '10.1 Reactivity', fields: ['Reactivity Information'] },
      { label: '10.2 Chemical Stability', fields: ['Stability Status', 'Stability Information'] },
      { label: '10.3 Possibility of Hazardous Reactions', fields: ['Hazardous Reactions', 'Reaction Description', 'Polymerization Risk'] },
      { label: '10.4 Conditions to Avoid', fields: ['Heat', 'Sparks', 'Open Flames', 'Static Discharge', 'Moisture', 'Light', 'Shock'] },
      { label: '10.5 Incompatible Materials', fields: ['Incompatible Substances', 'Materials to Avoid'] },
      { label: '10.6 Hazardous Decomposition Products', fields: ['Decomposition Products', 'Hazardous Thermal Decomposition Products'] },
    ],
  },
  {
    key: 'toxicologicalInformation',
    label: '11. Toxicological Information',
    subsections: [
      { label: '11.1 Likely Routes of Exposure', fields: ['Inhalation', 'Skin Contact', 'Eye Contact', 'Ingestion'] },
      { label: '11.2 Symptoms and Effects', fields: ['Acute Effects', 'Delayed Effects', 'Chronic Effects', 'Symptoms'] },
      { label: '11.3 Numerical Measures of Toxicity', fields: ['LD50', 'LC50', 'Oral LD50', 'Dermal LD50', 'Inhalation LC50', 'Species', 'Dose', 'Test Method'] },
      { label: '11.4 Acute Toxicity', fields: ['Acute Oral Toxicity', 'Acute Dermal Toxicity', 'Acute Inhalation Toxicity', 'ATE'] },
      { label: '11.5 Skin Corrosion/Irritation', fields: ['Skin Irritation', 'Skin Corrosion', 'Result', 'Test Method'] },
      { label: '11.6 Serious Eye Damage/Eye Irritation', fields: ['Eye Irritation', 'Eye Damage', 'Result', 'Test Method'] },
      { label: '11.7 Sensitization', fields: ['Respiratory Sensitization', 'Skin Sensitization', 'Result'] },
      { label: '11.8 Germ Cell Mutagenicity', fields: ['Mutagenicity', 'Genetic Toxicity', 'Result'] },
      { label: '11.9 Carcinogenicity', fields: ['Carcinogenicity', 'IARC Classification', 'NTP Classification', 'OSHA Carcinogen Status'] },
      { label: '11.10 Reproductive Toxicity', fields: ['Reproductive Toxicity', 'Developmental Toxicity', 'Fertility Effects'] },
      { label: '11.11 STOT', fields: ['STOT Single Exposure', 'STOT Repeated Exposure', 'Target Organ', 'Effect'] },
      { label: '11.12 Aspiration Hazard', fields: ['Aspiration Toxicity', 'Aspiration Hazard'] },
    ],
  },
  {
    key: 'ecologicalInformation',
    label: '12. Ecological Information',
    subsections: [
      { label: '12.1 Ecotoxicity', fields: ['Aquatic Toxicity', 'Terrestrial Toxicity', 'Fish Toxicity', 'Daphnia Toxicity', 'Algae Toxicity'] },
      { label: '12.2 Persistence and Degradability', fields: ['Persistence', 'Biodegradability', 'Degradability', 'Half-Life'] },
      { label: '12.3 Bioaccumulative Potential', fields: ['Bioaccumulation Potential', 'BCF', 'Log Kow'] },
      { label: '12.4 Mobility in Soil', fields: ['Mobility in Soil', 'Adsorption', 'Leaching'] },
      { label: '12.5 PBT/vPvB Assessment', fields: ['PBT Assessment', 'vPvB Assessment'] },
      { label: '12.6 Other Adverse Effects', fields: ['Ozone Depletion Potential', 'Photochemical Ozone Creation Potential', 'Global Warming Potential', 'Other Environmental Impact'] },
    ],
  },
  {
    key: 'disposalConsiderations',
    label: '13. Disposal Considerations',
    subsections: [
      { label: '13.1 Waste Treatment Methods', fields: ['Waste Treatment Method', 'Waste Disposal Method', 'Treatment Methods'] },
      { label: '13.2 Waste Classification', fields: ['Waste Classification', 'Waste Code', 'Hazardous Waste Status'] },
      { label: '13.3 Contaminated Packaging', fields: ['Container Disposal', 'Packaging Disposal', 'Empty Container Warning'] },
      { label: '13.4 Regulatory Disposal Information', fields: ['Disposal Requirements', 'Regional Disposal Regulations', 'Special Disposal Requirements'] },
    ],
  },
  {
    key: 'transportInformation',
    label: '14. Transport Information',
    subsections: [
      { label: '14.1 Basic Shipping Identification', fields: ['UN Number', 'UN Proper Shipping Name', 'Proper Shipping Name'] },
      { label: '14.2 Transport Classification', fields: ['Transport Hazard Class', 'Subsidiary Risk', 'Packing Group'] },
      { label: '14.3 Environmental Hazards', fields: ['Marine Pollutant', 'Environmental Hazard'] },
      { label: '14.4 Special Precautions for User', fields: ['Transport Precautions', 'Special Precautions'] },
      { label: '14.5 Transport Mode Information', fields: ['ADR', 'RID', 'IMDG', 'IATA', 'ICAO', 'DOT', 'TDG'] },
      { label: '14.6 Transport in Bulk', fields: ['Bulk Transport', 'MARPOL', 'IBC Code'] },
    ],
  },
  {
    key: 'regulatoryInformation',
    label: '15. Regulatory Information',
    subsections: [
      { label: '15.1 Safety, Health and Environmental Regulations', fields: ['National Regulations', 'Regional Regulations', 'Safety Regulations', 'Health Regulations', 'Environmental Regulations'] },
      { label: '15.2 Canada Regulations', fields: ['WHMIS Classification', 'DSL Status', 'NDSL Status', 'Canadian Inventory Status'] },
      { label: '15.3 United States Regulations', fields: ['OSHA Classification', 'TSCA Inventory Status', 'SARA', 'CERCLA', 'RCRA', 'CAA', 'CWA', 'California Proposition 65'] },
      { label: '15.4 European/International Regulations', fields: ['REACH Status', 'ECHA Information', 'CLP Classification', 'Chemical Safety Assessment'] },
      { label: '15.5 Inventory Status', fields: ['TSCA', 'DSL', 'NDSL', 'EINECS', 'ELINCS', 'ENCS', 'IECSC', 'KECL', 'PICCS', 'AICS'] },
      { label: '15.6 Other Regulatory Information', fields: ['VOC Regulations', 'Security Classification', 'Regional Restrictions'] },
      { label: '15.7 Chemical Safety Assessment', fields: ['Chemical Safety Assessment Completed', 'Chemical Safety Assessment Not Required'] },
    ],
  },
  {
    key: 'otherInformation',
    label: '16. Other Information',
    subsections: [
      { label: '16.1 Revision Information', fields: ['Revision Date', 'Preparation Date', 'Issue Date', 'Version', 'Supersedes Date'] },
      { label: '16.2 Document Metadata', fields: ['SDS Number', 'Document Number', 'Issuer', 'Prepared By', 'Reviewed By'] },
      { label: '16.3 Abbreviations and Acronyms', fields: ['Abbreviation List', 'Acronyms', 'Definitions'] },
      { label: '16.4 References', fields: ['Reference Documents', 'Data Sources', 'Literature References'] },
      { label: '16.5 Rating Systems', fields: ['NFPA Rating', 'HMIS Rating'] },
      { label: '16.6 Disclaimer', fields: ['Disclaimer Statement', 'Liability Statement'] },
    ],
  },
];

export const SDS_SCHEMA: SdsSectionDef[] = RAW_SCHEMA.map((section) => ({
  key: section.key,
  label: section.label,
  subsections: section.subsections.map((sub) => ({
    key: toKey(sub.label),
    label: sub.label,
    fields: sub.fields.map((f) => ({ key: toKey(f), label: f })),
  })),
}));

export const SDS_SECTION_KEYS = SDS_SCHEMA.map((s) => s.key);

export function getSdsSection(key: string): SdsSectionDef | undefined {
  return SDS_SCHEMA.find((s) => s.key === key);
}

// ─── Nested data (stored value) types ──────────────────────────────────────────

export interface SdsFieldData {
  content: string;
  confidence: number;
  fieldStatus: 'pending' | 'ai_approved' | 'human_approved';
  sourceLocation?: { page: number; excerpt: string };
}

export interface SdsSubsectionData {
  fields: Record<string, SdsFieldData>;
}

export interface SdsSectionData {
  subsections: Record<string, SdsSubsectionData>;
}

export type SdsSectionsMap = Record<string, SdsSectionData>;
