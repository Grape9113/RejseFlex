// Public illustrative knowledge. These records describe the demo workflow, not Danish transport rules.
export const demoRules = [
  {
    id: 'demo-inbound-first', type: 'calculation', appliesTo: 'booking-order',
    geographicScope: 'all', source: 'RejseFlex demo workflow', lastVerified: '2026-09-29',
    validFrom: '2026-01-01', validUntil: '2027-12-31',
    effect: { firstTaskId: 'inbound' },
    explanation: 'Start med sidste handicapkørsel. Toget afhænger af den faktiske afhentningstid, som endnu er ukendt.',
  },
];

export function evaluateRules(rules, { onDate, required = ['booking-order'], areaId = null }) {
  const applied = [];
  const uncertainties = [];
  for (const purpose of required) {
    const candidates = rules.filter((rule) => rule.appliesTo === purpose &&
      (rule.geographicScope === 'all' || rule.geographicScope === areaId));
    const current = candidates.find((rule) => rule.validFrom <= onDate && onDate <= rule.validUntil);
    if (current) applied.push({ ruleId: current.id, type: current.type, effect: current.effect,
      explanation: current.explanation, source: current.source, lastVerified: current.lastVerified });
    else uncertainties.push({ code: candidates.length ? 'expired-required-rule' : 'missing-required-rule',
      taskId: 'inbound', explanation: candidates.length
        ? 'Reglen for bookingrækkefølge er udløbet. Kontrollér rækkefølgen før bestilling.'
        : 'Regel for bookingrækkefølge mangler. Kontrollér rækkefølgen før bestilling.' });
  }
  return { applied, uncertainties };
}
