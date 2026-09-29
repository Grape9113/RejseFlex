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

// Presentation guidance for the illustrative workflow. Transport-specific advice belongs here.
export const demoTaskGuidance = {
  inbound: { title: 'Afklar sidste handicapkørsel', explanation: 'Tid, bookingkanal og pris for sidste handicapkørsel skal kontrolleres hos trafikselskabet.', pending: { title: 'Bekræft den eksterne bestilling', explanation: 'Afhentningstiden er registreret, men bestillingen er ikke bekræftet. Bekræft kun, hvis du har gennemført den hos trafikselskabet.' } },
  train: { title: 'Kontrollér togforslaget', explanation: 'Togforslaget er genberegnet. Kontrollér forbindelsen og den ukendte overgangsbuffer før du markerer togvalget som kontrolleret.' },
  assistance: { title: 'Afklar Handicapservice', explanation: 'Kontrollér frist og mødetid hos DSB, og bekræft kun en gennemført ekstern bestilling.' },
  outbound: { title: 'Afklar første handicapkørsel', explanation: 'Kontrollér trafikområde, bookingkanal og nødvendig tid til afgangsstationen hos trafikselskabet. Togtider og overgangsbuffer er fortsat illustrative eller ukendte.' },
};
export const demoConflictGuidance = {
  'assistance-train-changed': { taskId: 'assistance', title: 'Kontrollér Handicapservice-aftalen', explanation: 'Handicapservice er bekræftet til en anden togplan. Kontrollér den eksterne aftale hos DSB, før du fortsætter. Appen ændrer ikke aftalen.' },
  'no-train-before-pickup': { taskId: 'inbound', title: 'Tiderne passer ikke sammen', explanation: 'Det valgte tog kan ikke nå den oplyste afhentning. Kontakt trafikselskabet for at ændre aftalen eller find et andet tog. Bekræftede aftaler ændres ikke i appen.' },
};
