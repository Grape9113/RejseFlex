// Public journey seam: a wish and replaceable sources yield one provisional demo plan.
import { demoRules, evaluateRules } from './rules.js';
export function createDemoTrainSource() {
  return {
    async findConnections(wish) {
      const arrival = new Date(wish.arrival).getTime();
      const trainArrival = new Date(arrival - 90 * 60_000).toISOString();
      const trainDeparture = new Date(arrival - 180 * 60_000).toISOString();
      return [{
        id: 'illustrative-train',
        fromStation: { id: 'demo-start', name: 'Demostation ved start' },
        toStation: { id: 'demo-end', name: 'Demostation ved destination' },
        plannedDeparture: trainDeparture,
        plannedArrival: trainArrival,
        disruption: { kind: 'unknown' },
      }];
    },
  };
}

export async function proposeJourney(wish, { trainSource = createDemoTrainSource(), rules = demoRules,
  trafficAreaSource = { classify: async () => ({ kind: 'unknown' }) } } = {}) {
  const [train] = await trainSource.findConnections(wish);
  if (!train) return { kind: 'no-train', message: 'Demotogkilden fandt ingen forbindelse. Prøv et andet tidspunkt.' };
  const [fromArea, toArea] = await Promise.all([
    trafficAreaSource.classify(wish.from.coordinates), trafficAreaSource.classify(wish.to.coordinates),
  ]);
  const evaluated = evaluateRules(rules, { onDate: wish.arrival.slice(0, 10), areaId: toArea.areaId });
  const uncertainties = [...evaluated.uncertainties];
  for (const [taskId, area] of [['outbound', fromArea], ['inbound', toArea]]) {
    if (area.kind !== 'known') uncertainties.push({ code: 'unknown-traffic-area', taskId,
      explanation: `Trafikområde og trafikselskab for ${taskId === 'inbound' ? 'sidste' : 'første'} handicapkørsel er ukendt. Kontrollér området før bestilling.` });
    uncertainties.push({ code: 'unknown-price', taskId,
      explanation: `Pris for ${taskId === 'inbound' ? 'sidste' : 'første'} handicapkørsel er ukendt. Kontrollér pris hos trafikselskabet.` });
  }
  const firstLeg = {
    id: 'outbound', kind: 'handicapkørsel', from: wish.from, to: train.fromStation,
    plannedTime: null, bookingChannel: { kind: 'unknown' }, operator: fromArea.kind === 'known' ? fromArea.operator : { kind: 'unknown' },
    priceEstimate: { kind: 'unknown' },
  };
  const lastLeg = {
    id: 'inbound', kind: 'handicapkørsel', from: train.toStation, to: wish.to,
    plannedTime: null, bookingChannel: { kind: 'unknown' }, operator: toArea.kind === 'known' ? toArea.operator : { kind: 'unknown' },
    priceEstimate: { kind: 'unknown' },
  };
  const trainLeg = { id: 'train', kind: 'tog', ...train };
  const orderRule = evaluated.applied.find((item) => item.effect?.firstTaskId === 'inbound');
  const tasks = [
    { id: 'inbound', kind: 'handicapkørsel', status: orderRule && toArea.kind === 'known' ? 'klar til booking' : 'afventer brugerinput', dependsOn: [] },
    { id: 'train', kind: 'togvalg', status: 'ikke klar', dependsOn: ['inbound'] },
    { id: 'assistance', kind: 'Handicapservice', status: 'ikke klar', dependsOn: ['train'], trainId: train.id, bookingDeadline: { kind: 'unknown' }, meetingTime: { kind: 'unknown' } },
    { id: 'outbound', kind: 'handicapkørsel', status: 'ikke klar', dependsOn: ['assistance'] },
  ];
  const blocking = uncertainties.find((item) => item.taskId === 'inbound' && item.code !== 'unknown-price');
  return {
    kind: 'journey', origin: 'demo', feasibility: 'foreløbig', selected: false,
    wish, legs: [firstLeg, trainLeg, lastLeg], tasks, uncertainties, appliedRules: evaluated.applied,
    nextAction: {
      taskId: 'inbound', title: 'Afklar sidste handicapkørsel',
      explanation: [orderRule?.explanation, blocking?.explanation,
        'Tid, bookingkanal og pris for sidste handicapkørsel skal kontrolleres hos trafikselskabet.'].filter(Boolean).join(' '),
      mode: 'demo',
    },
  };
}
