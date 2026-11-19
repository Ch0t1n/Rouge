/** Ids estables del Modo Demo (los comparten la fiesta y el evento corporativo): los links /join, /u… no cambian. */
export const demoId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const DEMO_IDS = {
  event: demoId(1000),
  organizer: demoId(999),
  manager: demoId(990),
  bartender: demoId(991),
  waiter: demoId(992),
  security: demoId(993),
  me: demoId(1),
  squadMain: demoId(2001),
  squadVip: demoId(2002),
  brand: demoId(3001),
  promoter: demoId(994),
} as const;
