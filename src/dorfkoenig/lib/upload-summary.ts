export function formatUploadSuccessDetails(unitsCreated: number, unitsMerged = 0): string {
  const unitLabel = unitsCreated === 1
    ? '1 Informationseinheit gespeichert'
    : `${unitsCreated} Informationseinheiten gespeichert`;

  if (unitsMerged === 0) return unitLabel;

  const duplicateLabel = unitsMerged === 1
    ? '1 Duplikat erkannt'
    : `${unitsMerged} Duplikate erkannt`;

  return `${unitLabel}, ${duplicateLabel}`;
}
