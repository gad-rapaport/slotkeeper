/*
 * Slotkeeper product film (20 s, 1920x1080). Monoline illustration: ink outlines, one accent per character,
 * a timeline whose slots lock. Story: two colleagues want the same slot -> both press Book on the real dialog
 * -> the timeline accepts one, turns the other away with a clear answer and a free slot -> 30 simultaneous
 * requests, one booking (the real simulation result) -> both have a slot.
 * The day layout (taken 08:30-09:00, 09:30-10:15, 13:30-15:00) matches the screenshot shown on the laptop.
 */
const { ease, prog, tw, life, rand, wave, h, place, createStage, attachPlayer } = Motion;

const C = {
  bg: '#f6f6fb',
  ink: '#1c1b3a',
  muted: '#5a5878',
  line: '#d9d7e8',
  indigo: '#4338ca',
  indigoSoft: '#eceefe',
  green: '#1d6440',
  greenSoft: '#e6f5ec',
  teal: '#0e7c66',
  taken: '#b9b7d0',
  red: '#9b1c1c',
  redSoft: '#fdecec',
  white: '#ffffff',
};
const DUR = 20;
const svg = document.getElementById('stage');
const stage = createStage({ duration: DUR, root: svg });
const S = {
  stroke: C.ink,
  'stroke-width': 5,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  fill: 'none',
};

svg.appendChild(
  h('defs', {}, [
    h(
      'pattern',
      { id: 'hatch', width: 18, height: 18, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      [
        h('rect', { width: 18, height: 18, fill: '#eceaf3' }),
        h('line', { x1: 0, y1: 0, x2: 0, y2: 18, stroke: C.taken, 'stroke-width': 6 }),
      ],
    ),
    h('pattern', { id: 'dots', width: 40, height: 40, patternUnits: 'userSpaceOnUse' }, [
      h('circle', { cx: 2, cy: 2, r: 2, fill: '#dcdbea' }),
    ]),
    h('clipPath', { id: 'screen' }, [h('rect', { x: 0, y: 0, width: 1056, height: 660, rx: 10 })]),
  ]),
);
svg.appendChild(h('rect', { width: 1920, height: 1080, fill: C.bg }));
svg.appendChild(h('rect', { width: 1920, height: 1080, fill: 'url(#dots)' }));

// ---------- monoline people at desks ----------
function seated(accent, flip) {
  const g = h('g');
  const inner = h('g', { transform: flip ? 'scale(-1 1)' : '' });
  g.appendChild(inner);
  // chair, desk, laptop
  inner.appendChild(h('path', { d: 'M-120 0 V-150 M-120 -150 H-40 M-60 -150 V0', ...S }));
  inner.appendChild(h('path', { d: 'M40 -170 H330 M60 -170 V0 M310 -170 V0', ...S }));
  inner.appendChild(h('path', { d: 'M150 -170 L190 -280 H310 L280 -170 Z', ...S, fill: C.white }));
  // body: one accent fill, everything else outline
  inner.appendChild(
    h('path', {
      d: 'M-110 -160 C-120 -260 -40 -300 -10 -290 C30 -280 40 -230 30 -160 Z',
      ...S,
      fill: accent,
    }),
  );
  const head = h('circle', { cx: -40, cy: -345, r: 42, ...S, fill: C.white });
  inner.appendChild(head);
  const hair = h('path', { d: 'M-82 -350 C-80 -400 -10 -400 0 -360', ...S });
  inner.appendChild(hair);
  const eye = h('circle', { cx: -14, cy: -348, r: 4, fill: C.ink });
  inner.appendChild(eye);
  const mouth = h('path', { ...S, 'stroke-width': 4 });
  inner.appendChild(mouth);
  inner.appendChild(h('path', { d: 'M-90 -150 C-60 -110 20 -120 60 -40 L60 0', ...S }));
  const arm = h('path', { ...S, 'stroke-width': 6 });
  inner.appendChild(arm);
  return {
    g,
    pose(reach, smile, nod) {
      const hx = 30 + reach * 120;
      const hy = -200 - reach * 10;
      arm.setAttribute('d', `M-30 -250 C10 -230 ${hx - 40} ${hy + 20} ${hx} ${hy}`);
      mouth.setAttribute('d', `M-30 -322 Q-16 ${(-322 + smile * 10).toFixed(1)} -4 -322`);
      head.setAttribute('transform', `rotate(${nod.toFixed(2)} -40 -300)`);
      hair.setAttribute('transform', `rotate(${nod.toFixed(2)} -40 -300)`);
      eye.setAttribute('transform', `rotate(${nod.toFixed(2)} -40 -300)`);
      mouth.setAttribute('transform', `rotate(${nod.toFixed(2)} -40 -300)`);
    },
  };
}
const people = h('g');
svg.appendChild(people);
const maya = seated(C.indigo, false);
const omer = seated(C.teal, true);
people.appendChild(maya.g);
people.appendChild(omer.g);
const wish = (x, color) => {
  const g = h('g', {}, [
    h('rect', { x: -170, y: -60, width: 340, height: 110, rx: 30, ...S, fill: C.white }),
    h('path', { d: 'M-20 50 L0 80 L20 50', ...S, fill: C.white }),
    h('text', {
      y: -10,
      'text-anchor': 'middle',
      'font-size': 30,
      'font-weight': 800,
      fill: C.ink,
      text: 'Yarkon room',
    }),
    h('text', { y: 30, 'text-anchor': 'middle', 'font-size': 30, class: 'mono', fill: color, text: '09:00' }),
  ]);
  people.appendChild(g);
  return g;
};
const wishA = wish(0, C.indigo);
const wishB = wish(0, C.teal);
const clock = h('g', {}, [
  h('circle', { r: 70, ...S, fill: C.white }),
  h('path', { d: 'M0 0 L0 -48', ...S, 'stroke-width': 7 }),
  h('path', { d: 'M0 0 L-34 0', ...S, 'stroke-width': 7 }),
  h('text', { y: 120, 'text-anchor': 'middle', 'font-size': 26, fill: C.muted, text: 'Israel time (GMT+3)' }),
]);
people.appendChild(clock);
const checks = [0, 1].map(() => {
  const g = h('g', {}, [
    h('circle', { r: 34, fill: C.greenSoft, stroke: C.green, 'stroke-width': 5 }),
    h('path', { d: 'M-14 0 L-4 12 L16 -12', ...S, stroke: C.green, 'stroke-width': 7 }),
  ]);
  people.appendChild(g);
  return g;
});
const slips = [
  ['09:00-09:30', C.indigo, 'Maya'],
  ['10:15-10:45', C.teal, 'Omer'],
].map(([time, color, who]) => {
  const g = h('g', {}, [
    h('rect', { x: -170, y: -50, width: 340, height: 100, rx: 18, fill: C.white, ...S, 'stroke-width': 4 }),
    h('rect', { x: -170, y: -50, width: 14, height: 100, rx: 7, fill: color }),
    h('text', { x: -136, y: -6, 'font-size': 26, 'font-weight': 800, fill: C.ink, text: `Yarkon · ${who}` }),
    h('text', { x: -136, y: 30, 'font-size': 26, class: 'mono', fill: color, text: time }),
  ]);
  people.appendChild(g);
  return g;
});

// ---------- the real booking dialog on a laptop ----------
const device = h('g');
svg.appendChild(device);
device.appendChild(h('rect', { x: -30, y: -30, width: 1116, height: 720, rx: 34, ...S, fill: C.ink }));
const shot = h('image', {
  href: '../docs/screenshots/booking-dialog.png',
  x: 0,
  y: 0,
  width: 1056,
  height: 660,
  'clip-path': 'url(#screen)',
  preserveAspectRatio: 'xMidYMin slice',
});
device.appendChild(shot);
device.appendChild(h('path', { d: 'M-140 690 H1196 L1150 740 H-94 Z', ...S, fill: C.white }));
const k = 1056 / 1440;
const bookBtn = { x: 720 * k, y: 601 * k };
const ring = h('rect', {
  x: 500 * k - 8,
  y: 581 * k - 8,
  width: 440 * k + 16,
  height: 40 * k + 16,
  rx: 14,
  fill: 'none',
  stroke: '#f0b429',
  'stroke-width': 6,
});
device.appendChild(ring);
const cursor = (label, color) =>
  h('g', {}, [
    h('path', {
      d: 'M0 0 L0 40 L11 31 L19 50 L26 47 L18 29 L32 29 Z',
      fill: C.white,
      stroke: C.ink,
      'stroke-width': 3,
    }),
    h('rect', { x: 26, y: 42, width: 92, height: 38, rx: 10, fill: color }),
    h('text', {
      x: 72,
      y: 69,
      'text-anchor': 'middle',
      'font-size': 22,
      'font-weight': 800,
      fill: C.white,
      text: label,
    }),
  ]);
const curA = cursor('Maya', C.indigo);
const curB = cursor('Omer', C.teal);
device.appendChild(curA);
device.appendChild(curB);

// ---------- requests travelling to the timeline ----------
const token = (color, label) =>
  h('g', {}, [
    h('rect', {
      x: -150,
      y: -34,
      width: 300,
      height: 68,
      rx: 34,
      fill: C.white,
      stroke: color,
      'stroke-width': 5,
    }),
    h('text', { y: 10, 'text-anchor': 'middle', 'font-size': 24, class: 'mono', fill: color, text: label }),
  ]);
const tokA = token(C.indigo, 'POST /api/bookings');
const tokB = token(C.teal, 'POST /api/bookings');
svg.appendChild(tokA);
svg.appendChild(tokB);

// ---------- timeline 08:00-19:00 ----------
const tl = h('g');
svg.appendChild(tl);
const X0 = 160;
const X1 = 1760;
const Y = 620;
const xAt = (hh) => X0 + ((hh - 8) / 11) * (X1 - X0);
tl.appendChild(h('rect', { x: X0, y: Y - 70, width: X1 - X0, height: 140, rx: 18, fill: C.greenSoft }));
const busy = [
  [8.5, 9],
  [9.5, 10.25],
  [13.5, 15],
];
busy.forEach(([a, b]) =>
  tl.appendChild(
    h('rect', {
      x: xAt(a),
      y: Y - 70,
      width: xAt(b) - xAt(a),
      height: 140,
      fill: 'url(#hatch)',
      stroke: C.taken,
      'stroke-width': 2,
    }),
  ),
);
for (let hh = 8; hh <= 19; hh++) {
  tl.appendChild(
    h('line', { x1: xAt(hh), x2: xAt(hh), y1: Y + 70, y2: Y + 92, stroke: C.ink, 'stroke-width': 3 }),
  );
  tl.appendChild(
    h('text', {
      x: xAt(hh),
      y: Y + 126,
      'text-anchor': 'middle',
      'font-size': 24,
      class: 'mono',
      fill: C.muted,
      text: `${String(hh).padStart(2, '0')}:00`,
    }),
  );
}
tl.appendChild(h('rect', { x: X0, y: Y - 70, width: X1 - X0, height: 140, rx: 18, ...S, 'stroke-width': 4 }));
tl.appendChild(
  h('text', {
    x: X1,
    y: Y - 175,
    'text-anchor': 'end',
    'font-size': 34,
    'font-weight': 800,
    fill: C.ink,
    text: 'Yarkon room · Mon 5 Oct',
  }),
);
// The app's colour key (Free, Taken, Yours).
[
  ['Free', C.greenSoft],
  ['Taken', 'url(#hatch)'],
  ['Yours', C.indigo],
].forEach(([label, fill], i) => {
  const x = X1 - 560 + i * 200;
  tl.appendChild(
    h('rect', { x, y: Y + 180, width: 40, height: 40, rx: 8, fill, stroke: C.ink, 'stroke-width': 3 }),
  );
  tl.appendChild(h('text', { x: x + 56, y: Y + 210, 'font-size': 28, fill: C.ink, text: label }));
});
const slotA = h('g');
const slotB = h('g');
tl.appendChild(slotA);
tl.appendChild(slotB);
function lockedBlock(g, a, b, color, who) {
  g.appendChild(h('rect', { x: xAt(a), y: Y - 70, width: xAt(b) - xAt(a), height: 140, fill: color }));
  g.appendChild(
    h('text', {
      x: (xAt(a) + xAt(b)) / 2,
      y: Y + 10,
      'text-anchor': 'middle',
      'font-size': 24,
      'font-weight': 800,
      fill: C.white,
      text: who,
    }),
  );
  const lock = h('g', { transform: `translate(${(xAt(a) + xAt(b)) / 2} ${Y - 110})` });
  lock.appendChild(
    h('rect', {
      x: -26,
      y: -16,
      width: 52,
      height: 40,
      rx: 8,
      fill: C.white,
      stroke: color,
      'stroke-width': 5,
    }),
  );
  const shackle = h('path', {
    d: 'M-14 -16 V-30 A14 14 0 0 1 14 -30 V-16',
    fill: 'none',
    stroke: color,
    'stroke-width': 5,
    'stroke-linecap': 'round',
  });
  lock.appendChild(shackle);
  g.appendChild(lock);
  return { lock, shackle };
}
const lockA = lockedBlock(slotA, 9, 9.5, C.indigo, 'Maya');
const lockB = lockedBlock(slotB, 10.25, 10.75, C.teal, 'Omer');
const refusal = h('g', {}, [
  h('rect', {
    x: 0,
    y: 0,
    width: 600,
    height: 92,
    rx: 16,
    fill: C.redSoft,
    stroke: C.red,
    'stroke-width': 4,
  }),
  h('text', {
    x: 24,
    y: 40,
    'font-size': 26,
    'font-weight': 800,
    fill: C.red,
    text: '409 · No longer free at that time',
  }),
  h('text', {
    x: 24,
    y: 74,
    'font-size': 22,
    fill: C.red,
    text: 'Pick another slot; the schedule has been refreshed.',
  }),
]);
tl.appendChild(refusal);
const constraintTag = h('text', {
  'font-size': 24,
  class: 'mono',
  fill: C.muted,
  text: 'EXCLUDE USING gist (resource_id WITH =, period WITH &&)',
});
tl.appendChild(constraintTag);

// ---------- 30 simultaneous requests ----------
const rain = h('g');
svg.appendChild(rain);
const BX = 720;
const bucket = h('g', {}, [
  h('rect', { x: -180, y: -70, width: 360, height: 140, rx: 18, fill: C.greenSoft, ...S, 'stroke-width': 4 }),
  h('text', {
    y: 120,
    'text-anchor': 'middle',
    'font-size': 26,
    class: 'mono',
    fill: C.muted,
    text: 'one slot',
  }),
]);
rain.appendChild(bucket);
const winner = h('rect', { x: BX - 180, y: 570, width: 360, height: 140, rx: 18, fill: C.indigo });
rain.appendChild(winner);
const drops = [];
for (let i = 0; i < 30; i++) {
  const d = h('rect', {
    x: -26,
    y: -18,
    width: 52,
    height: 36,
    rx: 10,
    fill: C.white,
    stroke: i === 11 ? C.indigo : C.muted,
    'stroke-width': 4,
  });
  rain.appendChild(d);
  drops.push(d);
}
const tally = h('g');
rain.appendChild(tally);
[
  ['30', 'simultaneous requests', C.ink],
  ['1', 'booking', C.indigo],
  ['29', 'clean 409 conflicts', C.red],
  ['0', 'unexpected responses', C.green],
].forEach(([n, label, color], i) => {
  const row = h('g', { transform: `translate(0 ${i * 70})` }, [
    h('text', {
      x: 0,
      y: 0,
      'text-anchor': 'end',
      'font-size': 52,
      'font-weight': 800,
      class: 'mono',
      fill: color,
      text: n,
    }),
    h('text', { x: 24, y: -6, 'font-size': 30, fill: C.ink, text: label }),
  ]);
  tally.appendChild(row);
});

// ---------- end card ----------
const end = h('g');
svg.appendChild(end);
end.appendChild(h('rect', { width: 1920, height: 1080, fill: C.bg }));
const mark = h('g', {}, [
  h('rect', { x: -86, y: -86, width: 172, height: 172, rx: 40, fill: C.indigo }),
  h('path', {
    d: 'M-46 -36 H46 M-46 0 H12 M-46 36 H28',
    stroke: C.white,
    'stroke-width': 16,
    'stroke-linecap': 'round',
  }),
]);
end.appendChild(mark);
const title = h('text', {
  x: 960,
  y: 610,
  'text-anchor': 'middle',
  'font-size': 120,
  'font-weight': 800,
  fill: C.ink,
  text: 'Slotkeeper',
});
const tag = h('text', {
  x: 960,
  y: 680,
  'text-anchor': 'middle',
  'font-size': 40,
  fill: C.muted,
  text: 'Book rooms, desks and equipment without double bookings',
});
const repo = h('text', {
  x: 960,
  y: 770,
  'text-anchor': 'middle',
  'font-size': 32,
  class: 'mono',
  fill: C.indigo,
  text: 'github.com/gad-rapaport/slotkeeper',
});
[title, tag, repo].forEach((e) => end.appendChild(e));

// ---------- captions ----------
const capText = h('text', { x: 120, y: 112, 'font-size': 58, 'font-weight': 800, fill: C.ink });
const capBar = h('rect', { x: 120, y: 136, height: 8, rx: 4, fill: C.indigo });
svg.appendChild(capText);
svg.appendChild(capBar);
const CAPS = [
  [0.6, 3.6, 'Two people. One room. The same 09:00.'],
  [4.2, 7.8, 'Both press Book at the same moment.'],
  [8.4, 10.6, 'The database lets exactly one in.'],
  [10.8, 12.6, 'The other gets a clear answer and a free slot.'],
  [12.9, 15.2, '30 requests at once: one booking, no errors.'],
  [15.6, 17.6, 'No double bookings. No surprises.'],
];

stage.add((t) => {
  // People scene: 0-3.9 and again 15.4-17.8.
  const peopleOn = Math.max(life(t, 0, 3.9, 0.4, 0.4), life(t, 15.4, 17.9, 0.4, 0.3));
  people.setAttribute('opacity', peopleOn.toFixed(3));
  const late = t > 15;
  place(maya.g, { x: 330, y: 900 });
  place(omer.g, { x: 1590, y: 900 });
  const reach = late ? 0 : ease.inOutCubic(prog(t, 1.4, 0.6));
  maya.pose(reach, late ? 1 : -0.3, wave(t, 3, 2));
  omer.pose(reach, late ? 1 : -0.3, wave(t, 3.4, 2, 1));
  place(wishA, {
    x: 420,
    y: 430 + wave(t, 2.6, 6),
    s: tw(t, 1.0, 0.5, 0.4, 1, ease.outBack),
    o: late ? 0 : prog(t, 1.0, 0.3),
  });
  place(wishB, {
    x: 1500,
    y: 430 + wave(t, 2.6, 6, 0.8),
    s: tw(t, 1.2, 0.5, 0.4, 1, ease.outBack),
    o: late ? 0 : prog(t, 1.2, 0.3),
  });
  place(clock, { x: 960, y: 560, s: tw(t, 0.4, 0.6, 0.6, 1, ease.outBack), o: late ? 0 : 1 });
  clock.children[1].setAttribute(
    'transform',
    `rotate(${tw(t, 0.4, 2.6, -120, 0, ease.outCubic).toFixed(1)})`,
  );
  checks.forEach((c, i) =>
    place(c, {
      x: i ? 1470 : 450,
      y: 560,
      s: tw(t, 16.0 + i * 0.2, 0.4, 0.3, 1, ease.outBack),
      o: late ? prog(t, 16.0 + i * 0.2, 0.2) : 0,
    }),
  );
  slips.forEach((s, i) =>
    place(s, {
      x: i ? 1500 : 420,
      y: tw(t, 16.3 + i * 0.2, 0.5, 400, 380, ease.outBack),
      o: late ? prog(t, 16.3 + i * 0.2, 0.3) : 0,
    }),
  );

  // Device with the real dialog: 3.9-8.4.
  const devOn = life(t, 3.9, 8.3, 0.5, 0.35);
  place(device, {
    x: 432,
    y: 260 + (1 - ease.outCubic(prog(t, 3.9, 0.6))) * 160 + ease.inCubic(prog(t, 7.9, 0.5)) * 120,
    o: devOn,
  });
  const meet = ease.inOutCubic(prog(t, 4.8, 1.0));
  place(curA, { x: 80 * (1 - meet) + (bookBtn.x - 40) * meet, y: 560 * (1 - meet) + bookBtn.y * meet });
  place(curB, {
    x: 960 * (1 - meet) + (bookBtn.x + 40) * meet,
    y: 120 * (1 - meet) + (bookBtn.y + 6) * meet,
  });
  const click = 1 - 0.2 * Math.sin(prog(t, 6.0, 0.25) * Math.PI);
  [curA, curB].forEach((c) =>
    c.setAttribute('transform', c.getAttribute('transform') + ` scale(${click.toFixed(3)})`),
  );
  ring.setAttribute('opacity', life(t, 5.9, 7.0, 0.1, 0.4).toFixed(3));

  // Tokens fly from the dialog to the timeline.
  const bx = 432 + bookBtn.x;
  const by = 260 + bookBtn.y;
  const fly = (start, target) => [
    tw(t, start, 1.2, bx, target[0], ease.inOutCubic),
    tw(t, start, 1.2, by, target[1], ease.inOutCubic) - Math.sin(prog(t, start, 1.2) * Math.PI) * 120,
  ];
  const landA = [(xAt(9) + xAt(9.5)) / 2, Y];
  let [ax, ay] = fly(6.4, [landA[0], Y - 220]);
  if (t > 7.6) [ax, ay] = [landA[0], tw(t, 8.6, 0.5, Y - 220, Y, ease.inCubic)];
  place(tokA, { x: ax, y: ay, s: t > 8.6 ? tw(t, 8.6, 0.5, 1, 0.5) : 1, o: life(t, 6.3, 9.1, 0.2, 0.05) });
  // Omer: same target, bounces at 9.2, slides to 10:15 and drops at 10.6.
  let bxo;
  let byo;
  if (t < 9.1) {
    [bxo, byo] = fly(6.6, [landA[0] + 40, Y - 330]);
    if (t > 7.8) [bxo, byo] = [landA[0] + 40, tw(t, 8.8, 0.35, Y - 330, Y - 140, ease.inCubic)];
  } else if (t < 10.2) {
    bxo = tw(t, 9.4, 0.8, landA[0] + 40, (xAt(10.25) + xAt(10.75)) / 2, ease.inOutCubic);
    byo =
      Y - 140 - Math.sin(prog(t, 9.1, 0.5) * Math.PI) * 120 - prog(t, 9.1, 0.3) * 120 + prog(t, 9.4, 0.8) * 0;
  } else {
    bxo = (xAt(10.25) + xAt(10.75)) / 2;
    byo = tw(t, 10.2, 0.4, Y - 260, Y, ease.inCubic);
  }
  place(tokB, {
    x: bxo,
    y: byo,
    s: t > 10.2 ? tw(t, 10.2, 0.4, 1, 0.5) : 1,
    o: life(t, 6.5, 10.6, 0.2, 0.05),
  });

  // Timeline and locks.
  const tlOn = life(t, 8.25, 12.9, 0.4, 0.4);
  place(tl, { y: (1 - ease.outCubic(prog(t, 8.25, 0.6))) * 120, o: tlOn });
  slotA.setAttribute('opacity', prog(t, 9.05, 0.15).toFixed(3));
  slotB.setAttribute('opacity', prog(t, 10.55, 0.15).toFixed(3));
  const closeA = ease.outBack(prog(t, 9.2, 0.35));
  lockA.shackle.setAttribute('transform', `translate(0 ${(-14 + 14 * closeA).toFixed(1)})`);
  const closeB = ease.outBack(prog(t, 10.7, 0.35));
  lockB.shackle.setAttribute('transform', `translate(0 ${(-14 + 14 * closeB).toFixed(1)})`);
  place(refusal, {
    x: xAt(12),
    y: Y - 320 + tw(t, 9.15, 0.3, 30, 0, ease.outBack),
    o: life(t, 9.15, 10.4, 0.15, 0.3),
  });
  place(constraintTag, { x: X0, y: Y + 210, o: life(t, 9.3, 12.8, 0.4, 0.3) });

  // Thirty requests rain onto one slot: one sticks, the rest bounce away.
  const rainOn = life(t, 12.8, 15.35, 0.3, 0.3);
  rain.setAttribute('opacity', rainOn.toFixed(3));
  drops.forEach((d, i) => {
    const start = 13.0 + rand(i) * 0.5;
    const fall = prog(t, start, 0.45);
    const x0 = BX + (rand(i + 50) - 0.5) * 600;
    const win = i === 11;
    if (fall < 1) {
      place(d, {
        x: x0 + (BX - x0) * ease.inQuad(fall),
        y: 230 + 340 * ease.inQuad(fall),
        r: rand(i) * 40,
        o: fall > 0 ? 1 : 0,
      });
    } else if (win) {
      place(d, { x: BX, y: 570, o: 1 - prog(t, start + 0.45, 0.2) });
    } else {
      const b = prog(t, start + 0.45, 0.7);
      const side = rand(i + 9) > 0.5 ? 1 : -1;
      place(d, {
        x: BX + side * (60 + b * (200 + rand(i + 3) * 300)),
        y: 570 - Math.sin(b * Math.PI) * (120 + rand(i) * 80) + b * 260,
        r: side * b * 200,
        o: 1 - b,
      });
    }
  });
  winner.setAttribute('opacity', prog(t, 13.5, 0.2).toFixed(3));
  tally.childNodes.forEach((row, i) => row.setAttribute('opacity', prog(t, 13.8 + i * 0.25, 0.3).toFixed(3)));
  place(tally, { x: 1180, y: 520 });
  place(bucket, { x: BX, y: 640 });

  // End.
  end.setAttribute('opacity', prog(t, 17.8, 0.5).toFixed(3));
  place(mark, { x: 960, y: 380, s: tw(t, 18.0, 0.6, 0.4, 1, ease.outBack), r: tw(t, 18.0, 0.6, 20, 0) });
  [title, tag, repo].forEach((e, i) =>
    place(e, { y: tw(t, 18.3 + i * 0.15, 0.5, 30, 0), o: prog(t, 18.3 + i * 0.15, 0.4) }),
  );

  const cap = CAPS.find(([a, b]) => t >= a && t <= b);
  if (cap) {
    const o = life(t, cap[0], cap[1], 0.25, 0.25);
    capText.textContent = cap[2];
    place(capText, { x: tw(t, cap[0], 0.4, -20, 0), o });
    capBar.setAttribute('width', (ease.outCubic(prog(t, cap[0] + 0.1, 0.5)) * 140).toFixed(1));
    capBar.setAttribute('opacity', o.toFixed(3));
  } else {
    capText.setAttribute('opacity', 0);
    capBar.setAttribute('opacity', 0);
  }
});

attachPlayer(stage);
