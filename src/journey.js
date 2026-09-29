// Public journey seam: a wish and replaceable train source yield one provisional demo plan.
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

export async function proposeJourney(wish, { trainSource = createDemoTrainSource() } = {}) {
  const [train] = await trainSource.findConnections(wish);
  if (!train) return { kind: 'no-train', message: 'Demotogkilden fandt ingen forbindelse. Prøv et andet tidspunkt.' };
  const firstLeg = {
    id: 'outbound', kind: 'handicapkørsel', from: wish.from, to: train.fromStation,
    plannedTime: null, bookingChannel: { kind: 'unknown' }, operator: { kind: 'unknown' },
    priceEstimate: { kind: 'unknown' },
  };
  const lastLeg = {
    id: 'inbound', kind: 'handicapkørsel', from: train.toStation, to: wish.to,
    plannedTime: null, bookingChannel: { kind: 'unknown' }, operator: { kind: 'unknown' },
    priceEstimate: { kind: 'unknown' },
  };
  const trainLeg = { id: 'train', kind: 'tog', ...train };
  const tasks = [
    { id: 'inbound', kind: 'handicapkørsel', status: 'klar til booking', dependsOn: [] },
    { id: 'train', kind: 'togvalg', status: 'ikke klar', dependsOn: ['inbound'] },
    { id: 'assistance', kind: 'Handicapservice', status: 'ikke klar', dependsOn: ['train'], trainId: train.id, bookingDeadline: { kind: 'unknown' }, meetingTime: { kind: 'unknown' } },
    { id: 'outbound', kind: 'handicapkørsel', status: 'ikke klar', dependsOn: ['assistance'] },
  ];
  return {
    kind: 'journey', origin: 'demo', feasibility: 'foreløbig', selected: false,
    wish, legs: [firstLeg, trainLeg, lastLeg], tasks,
    nextAction: {
      taskId: 'inbound', title: 'Afklar sidste handicapkørsel',
      explanation: 'Start med sidste handicapkørsel. Toget afhænger af den faktiske afhentningstid, som endnu er ukendt.',
      mode: 'demo',
    },
  };
}
