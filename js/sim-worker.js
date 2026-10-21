/* =====================================================================
   sim-worker.js  —  what the sims' second threads share
   ---------------------------------------------------------------------
   Most sims do their work in a second thread (a Web Worker, started
   by startWorker in js/sim-page.js), so the page stays smooth while
   the model runs. These helpers, which most of those workers share,
   are written once, here:

     makeRunLoop(oneStep, report, isDone)   Play, Pause and Speed
     newTrace(), keepSample(...)            the run so far, for the
                                            charts over time
     seededUniform(seed)                    random numbers tied to a
                                            seed and a place or step

   A worker can't see the page's scripts, so the page hands these
   functions to startWorker in its list of helpers, for example
     startWorker(pottsWorker, [newPotts, pottsStart, makeRunLoop, newTrace, keepSample])
   (startWorker copies their text into the worker). That is also why
   each one keeps its constants inside it. The page loads this file
   too, before the sim's own files.
   ===================================================================== */


// The run loop: while playing, every few milliseconds make the steps
// that are due ("speed" steps per second, or as many as fit with speed
// Infinity), at most TICK_BUDGET milliseconds of work at a time, then
// report() to the page. If the run falls behind, it catches up at most
// one second's worth of steps. isDone() (optional) says the run can't
// go on (every cell colored, say): then the loop pauses by itself.
// Returns the loop:
//   loop.play(speed)   play, or change the speed while playing
//   loop.pause()
//   loop.playing       is it playing?
function makeRunLoop(oneStep, report, isDone) {
  const TICK_BUDGET = 25;    // milliseconds of work between two reports
  const done = isDone || function () { return false; };
  const loop = { playing: false };
  let speed = 5, owed = 0, lastTick = 0, timer = null;   // owed: steps due but not yet made

  function tick() {
    const now = performance.now();
    const until = now + TICK_BUDGET;
    if (speed === Infinity) {
      do oneStep(); while (!done() && performance.now() < until);
    } else {
      owed = Math.min(owed + speed * (now - lastTick) / 1000, speed);   // at most 1 second behind
      while (owed >= 1 && !done() && performance.now() < until) { oneStep(); owed--; }
    }
    lastTick = now;
    if (done()) loop.pause();
    report();
    if (loop.playing) timer = setTimeout(tick, 10);   // come back a moment later
  }

  loop.play = function (newSpeed) {
    speed = newSpeed;
    if (loop.playing || done()) return;
    loop.playing = true;
    owed = 0;
    lastTick = performance.now();
    timer = setTimeout(tick, 0);
  };

  loop.pause = function () {
    loop.playing = false;
    clearTimeout(timer);
  };

  return loop;
}


// The run so far, for the charts over time. A "sample" is the time and
// a few numbers (or lists of numbers, like the size of each color).
// One is taken every trace.gap units of time. When there are more than
// MAX_SAMPLES, every other one is dropped and the gap doubles, so a
// long run keeps evenly spaced samples from start to end.
//   trace.times         the time of each sample
//   trace.lists[name]   the numbers of each sample, one after another
function newTrace() {
  return { times: [], lists: {}, gap: 1, next: 0 };
}

// Take a sample at "time" if one is due (or "now" is true). "values"
// gives each number, or list of numbers, by name, for example
//   keepSample(trace, time, { agree: 0.5, counts: [10, 20, 5] })
// A list must have the same length in every sample. "values" can also
// be a function that returns them, for numbers that take a while to
// work out (like the regions of a coloring): it is called only when a
// sample is due.
function keepSample(trace, time, values, now) {
  const MAX_SAMPLES = 1000;
  if (time < trace.next && !now) return;
  if (typeof values === "function") values = values();
  trace.times.push(time);
  for (const name in values) {
    if (!trace.lists[name]) trace.lists[name] = [];
    const list = trace.lists[name], value = values[name];
    if (typeof value === "number") list.push(value);
    else for (let k = 0; k < value.length; k++) list.push(value[k]);
  }
  trace.next = time + trace.gap;
  const count = trace.times.length;
  if (count > MAX_SAMPLES) {
    trace.times = trace.times.filter(function (x, k) { return k % 2 === 0; });
    for (const name in trace.lists) {
      const width = trace.lists[name].length / count;    // numbers per sample
      trace.lists[name] = trace.lists[name].filter(function (x, k) { return Math.floor(k / width) % 2 === 0; });
    }
    trace.gap *= 2;
  }
}


// Random numbers tied to a seed and to some whole numbers (a site's
// place and height, or a step number): random.uniform(a, b, ...) is a
// uniform number in (0, 1), always the same for the same seed and the
// same numbers. Unlike a random-number generator that runs through one
// list in order, any number can be asked for, in any order. So a sim
// can tie each random choice to *where* it is made, and that choice
// stays the same when a setting changes: that is what makes the
// sliders "coupled", changing the picture smoothly, like the p slider
// of Bernoulli percolation. random.textToNumbers(text) turns text (the
// seed, or a graph cell's name) into two whole numbers.
// How: a hash. Each number is folded into two running 32-bit hashes,
// scrambled with the last step of MurmurHash3, by Austin Appleby,
// public domain (github.com/aappleby/smhasher); the two together give
// 53 random bits.
function seededUniform(seed) {
  // Scramble a whole number (32 bits) so that every bit of the answer
  // depends on every bit of h.
  function scramble(h) {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return h ^ (h >>> 16);
  }
  // Fold whole number w into the running hash h.
  function fold(h, w) {
    return scramble(h ^ scramble(w + 0x9e3779b9));
  }
  function textToNumbers(text) {
    let h1 = 1, h2 = 2;
    for (let k = 0; k < text.length; k++) {
      h1 = fold(h1, text.charCodeAt(k));
      h2 = fold(h2, text.charCodeAt(k));
    }
    return [h1, h2];
  }
  const [seedA, seedB] = textToNumbers(String(seed));
  function uniform() {
    let h1 = seedA, h2 = seedB;
    for (let k = 0; k < arguments.length; k++) {
      h1 = fold(h1, arguments[k]);
      h2 = fold(h2, arguments[k]);
    }
    return ((h1 >>> 11) * 4294967296 + (h2 >>> 0) + 0.5) / 9007199254740992;
  }
  return { uniform: uniform, textToNumbers: textToNumbers };
}
