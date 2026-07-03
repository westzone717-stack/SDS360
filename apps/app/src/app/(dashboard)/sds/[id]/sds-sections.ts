export const SECTION_KEYS = [
  'identification', 'hazardIdentification', 'composition', 'firstAidMeasures',
  'fireFightingMeasures', 'accidentalReleaseMeasures', 'handlingAndStorage',
  'exposureControls', 'physicalAndChemicalProperties', 'stabilityAndReactivity',
  'toxicologicalInformation', 'ecologicalInformation', 'disposalConsiderations',
  'transportInformation', 'regulatoryInformation', 'otherInformation',
] as const;

export const SECTION_LABELS: Record<string, string> = {
  identification: '1. Identification',
  hazardIdentification: '2. Hazard(s) Identification',
  composition: '3. Composition / Ingredients',
  firstAidMeasures: '4. First-Aid Measures',
  fireFightingMeasures: '5. Fire-Fighting Measures',
  accidentalReleaseMeasures: '6. Accidental Release Measures',
  handlingAndStorage: '7. Handling and Storage',
  exposureControls: '8. Exposure Controls / Personal Protection',
  physicalAndChemicalProperties: '9. Physical & Chemical Properties',
  stabilityAndReactivity: '10. Stability and Reactivity',
  toxicologicalInformation: '11. Toxicological Information',
  ecologicalInformation: '12. Ecological Information',
  disposalConsiderations: '13. Disposal Considerations',
  transportInformation: '14. Transport Information',
  regulatoryInformation: '15. Regulatory Information',
  otherInformation: '16. Other Information',
};

export interface SectionData {
  key: string;
  content: string;
  confidence: number;
  fieldStatus: string;
}
