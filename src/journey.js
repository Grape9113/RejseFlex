// Public journey seam: a wish and replaceable sources yield one provisional demo plan.
import { demoRules, evaluateRules } from './rules.js';
export function createDemoTrainSource() {
  return {
    async findConnections(wish, { beforeArrival } = {}) {
      const arrival = new Date(beforeArrival ?? wish.arrival).getTime();
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

function bookingAction(plan) {
  const inbound = plan.tasks.find((task) => task.id === 'inbound');
  if (plan.conflicts?.some((conflict) => conflict.code === 'assistance-train-changed')) return {
    taskId: 'assistance', title: 'Kontrollér Handicapservice-aftalen',
    explanation: 'Handicapservice er bekræftet til et andet tog. Kontrollér den eksterne aftale hos DSB, før du fortsætter. Appen ændrer ikke aftalen.', mode: 'demo',
  };
  if (plan.conflicts?.length) return {
    taskId: 'inbound', title: 'Tiderne passer ikke sammen',
    explanation: 'Det valgte tog kan ikke nå den oplyste afhentning. Kontakt trafikselskabet for at ændre aftalen eller find et andet tog. Bekræftede aftaler ændres ikke i appen.', mode: 'demo',
  };
  if (inbound?.actualBookingTime && inbound.status !== 'bestilt') return {
    taskId: 'inbound', title: 'Bekræft den eksterne bestilling',
    explanation: 'Afhentningstiden er registreret, men bestillingen er ikke bekræftet. Bekræft kun, hvis du har gennemført den hos trafikselskabet.', mode: 'demo',
  };
  if (inbound?.status === 'bestilt') return {
    taskId: 'train', title: 'Kontrollér togforslaget',
    explanation: 'Sidste handicapkørsel er bekræftet. Togforslaget er genberegnet, men nødvendig overgangsbuffer er ukendt og skal kontrolleres før bestilling.', mode: 'demo',
  };
  return plan.nextAction;
}

export async function recordBookingTime(plan, taskId, time, { trainSource = createDemoTrainSource() } = {}) {
  if (taskId !== 'inbound') throw new Error('Kun sidste handicapkørsel kan tidsregistreres i denne demo.');
  if (!Number.isFinite(Date.parse(time))) throw new Error('Angiv en gyldig afhentningstid.');
  const task = plan.tasks.find((item) => item.id === taskId);
  if (task?.status === 'bestilt') throw new Error('En bekræftet aftale kan ikke ændres automatisk.');
  const updated = structuredClone(plan);
  const inbound = updated.tasks.find((item) => item.id === taskId);
  inbound.actualBookingTime = time;
  inbound.status = 'afventer brugerinput';
  updated.legs.find((leg) => leg.id === taskId).actualBookingTime = time;
  const connections = await trainSource.findConnections(updated.wish, { beforeArrival: time });
  const candidate = [...connections].filter((connection) => Date.parse(connection.plannedArrival) <= Date.parse(time))
    .sort((a, b) => Date.parse(b.plannedArrival) - Date.parse(a.plannedArrival))[0];
  updated.uncertainties = updated.uncertainties.filter((item) => item.code !== 'unknown-transfer-buffer');
  updated.uncertainties.push({ code: 'unknown-transfer-buffer', taskId: 'train',
    explanation: 'Nødvendig overgangstid mellem togankomst og afhentning er ukendt. Kontrollér den med trafikselskabet.' });
  updated.conflicts = [];
  updated.feasibility = 'foreløbig';
  if (candidate) {
    updated.legs[1] = { id: 'train', kind: 'tog', ...candidate };
    const assistance = updated.tasks.find((item) => item.id === 'assistance');
    if (assistance.confirmed && assistance.trainId !== candidate.id) {
      updated.feasibility = 'konflikt';
      updated.conflicts.push({ code: 'assistance-train-changed', taskIds: ['train', 'assistance'],
        explanation: 'Handicapservice er bekræftet til et andet tog. Kontrollér den eksterne aftale hos DSB. RejseFlex ændrer den ikke.' });
    } else if (!assistance.confirmed) {
      assistance.trainId = candidate.id;
      assistance.stationIds = [candidate.fromStation.id, candidate.toStation.id];
    }
    updated.tasks.find((item) => item.id === 'train').status = 'afventer brugerinput';
  } else {
    updated.feasibility = 'konflikt';
    updated.tasks.find((item) => item.id === 'train').status = 'kræver genberegning';
    updated.conflicts.push({ code: 'no-train-before-pickup', taskIds: ['train', 'inbound'],
      explanation: 'Ingen demoforbindelse ankommer før den oplyste afhentning. Kontakt trafikselskabet om ændring, eller kontrollér andre tog.' });
  }
  updated.nextAction = bookingAction(updated);
  return updated;
}

export function confirmBooking(plan, taskId) {
  if (taskId !== 'inbound') throw new Error('Kun sidste handicapkørsel kan bekræftes i denne demo.');
  const updated = structuredClone(plan);
  const task = updated.tasks.find((item) => item.id === taskId);
  if (!task?.actualBookingTime) throw new Error('Registrér den oplyste afhentningstid først.');
  task.status = 'bestilt';
  task.confirmed = true;
  updated.nextAction = bookingAction(updated);
  return updated;
}

export function confirmAssistance(plan) {
  const updated = structuredClone(plan);
  const assistance = updated.tasks.find((task) => task.id === 'assistance');
  if (!assistance?.trainId) throw new Error('Vælg et tog før Handicapservice bekræftes.');
  assistance.status = 'bestilt';
  assistance.confirmed = true;
  updated.nextAction = bookingAction(updated);
  return updated;
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
    { id: 'assistance', kind: 'Handicapservice', status: 'ikke klar', dependsOn: ['train'], trainId: train.id,
      stationIds: [train.fromStation.id, train.toStation.id], bookingDeadline: { kind: 'unknown' },
      meetingTime: { kind: 'unknown' }, tips: [] },
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
