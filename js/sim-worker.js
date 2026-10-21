/* =====================================================================
   sim-worker.js  —  what the sims' second threads share
   ---------------------------------------------------------------------
   Most sims do their work in a second thread (a Web Worker, started
   by startWorker in js/sim-page.js), so the page stays smooth while
   the model runs. These helpers, which most of those workers share,
   are written once, here:

     makeRunLoop(steps, report, isDone)     Play, Pause, Step and Speed
     serveRun(sim)                          the messages to and from the
                                            page, the same for every sim
     newTrace(), keepSample(...)            the run so far, for the
                                            charts over time
     seededUniform(seed)                    random numbers tied to a
                                            seed and a place or step

   A worker can't see the page's scripts, so the page hands these
   functions to it in its list of helpers, for example
     runInWorker(pottsWorker, [newPotts, pottsStart, newTrace, keepSample], show)
   (runInWorker, in js/sim-page.js, adds makeRunLoop and serveRun, and
   startWorker copies their text into the worker). That is also why
   each one keeps its constants inside it. The page loads this file
   too, before the sim's own files: a sim that runs on the page itself
   (like Sinusoid-ish, whose steps are quick) uses the same run loop
   there.
   ===================================================================== */


// The run loop: while playing, every few milliseconds make the steps
// that are due, at most TICK_BUDGET milliseconds of work at a time,
// then report() to the page if anything happened. If the run falls
// behind, it catches up at most one second's worth of steps.
//   steps    one step of the run (a function), or a list of kinds of
//            step that each have their own speed: Sandpiles has two, a
//            topple and a grain of the storm. A step that can't be made
//            just now (a grain waiting for the pile to settle) returns
//            false, and is tried again later.
//   isDone   (optional) says the run can't go on (every cell colored,
//            say): then the loop pauses by itself.
// Returns the loop:
//   loop.play(speed)   play: the first kind of step "speed" times per
//                      second (Infinity: as many as fit), or change the
//                      speed while playing
//   loop.speeds[k]     the speed of the k-th kind of step (0: never)
//   loop.pause()
//   loop.step()        one step (of the first kind that can make one),
//                      then report()
//   loop.playing       is it playing?
//   loop.isDone()      can't the run go on? (isDone, or never)
//   loop.stopped       (optional) runs when the loop pauses by itself,
//                      or won't play because the run is done
function makeRunLoop(steps, report, isDone) {
  const TICK_BUDGET = 25;    // milliseconds of work between two reports
  const kinds = [].concat(steps);
  const done = isDone || function () { return false; };
  const loop = { playing: false, isDone: done, speeds: kinds.map(function (step, k) { return k === 0 ? 1 : 0; }) };
  const owed = kinds.map(function () { return 0; });   // steps of each kind due but not yet made
  let lastTick = 0, timer = null;

  // Make a step of kind k if one is due. Says whether one was made.
  function stepIfDue(k) {
    if (loop.speeds[k] === 0 || owed[k] < 1 || done() || kinds[k]() === false) return false;
    owed[k]--;
    return true;
  }

  function tick() {
    const now = performance.now();
    const until = now + TICK_BUDGET;
    loop.speeds.forEach(function (speed, k) {
      owed[k] = speed === Infinity ? Infinity
        : Math.min(owed[k] + speed * (now - lastTick) / 1000, Math.max(speed, 1));   // at most 1 second behind
    });
    lastTick = now;
    let moved = false, going = true;
    while (going && performance.now() < until) {
      going = false;
      for (let k = 0; k < kinds.length; k++) if (stepIfDue(k)) going = moved = true;
    }
    if (done()) stop();
    if (moved || !loop.playing) report();
    if (loop.playing) timer = setTimeout(tick, 10);   // come back a moment later
  }

  function stop() {
    loop.pause();
    if (loop.stopped) loop.stopped();
  }

  loop.play = function (speed) {
    loop.speeds[0] = speed;
    if (loop.playing) return;
    if (done()) { stop(); return; }
    loop.playing = true;
    loop.speeds.forEach(function (s, k) { owed[k] = s > 0 ? 1 : 0; });   // the first step comes at once
    lastTick = performance.now();
    timer = setTimeout(tick, 0);
  };

  loop.pause = function () {
    loop.playing = false;
    clearTimeout(timer);
  };

  loop.step = function () {
    for (let k = 0; k < kinds.length && !done(); k++) {
      if (loop.speeds[k] > 0 && kinds[k]() !== false) break;
    }
    report();
  };

  return loop;
}


// A sim's second thread, the same for every sim: the messages the page
// sends it (through runInWorker, js/sim-page.js) and what it answers.
// "sim" says what the sim itself does:
//   sim.setup(message)   start a new run, from the page's settings
//   sim.steps            one step of the run (or a list: makeRunLoop)
//   sim.isDone()         (optional) the run can't go on
//   sim.report(send)     send what the page should see now, with
//                        send(values, handOver): "values" is an object of
//                        named numbers and lists, and "handOver"
//                        (optional) lists the buffers of typed lists made
//                        just for this message, which are handed over to
//                        the page instead of copied
//   sim.messages         (optional) the sim's own messages, by type, e.g.
//                        { params: function (message, loop) { ... } }
// The page sends
//   { type: "setup", run, ... }     a new run, paused ("run" numbers them)
//   { type: "play", speed, id }     "id" numbers the page's presses of
//   { type: "pause", id }           Play and Pause
//   { type: "step" }
//   and the sim's own messages.
// After each of them, and as it plays, the page gets
//   { type: "state", run, playing, playId, done, ...the values }
// "run" lets the page skip leftovers of an older run, "playing" with
// "playId" (the last Play or Pause the worker got) says whether it
// paused by itself after the page's last press, and "done" says the run
// can't go on (sim.isDone). Before the first setup there is nothing to
// run, so nothing else is answered. Returns the run loop (loop.playing
// says whether it plays).
function serveRun(sim) {
  let run = 0, playId = 0, started = false;
  const loop = makeRunLoop(sim.steps, report, sim.isDone);

  function report() {
    sim.report(function (values, handOver) {
      self.postMessage(Object.assign({ type: "state", run: run, playing: loop.playing, playId: playId,
                                       done: loop.isDone() }, values),
                       handOver || []);
    });
  }

  self.onmessage = function (event) {
    const m = event.data;
    if (m.type === "play" || m.type === "pause") playId = m.id;
    if (m.type === "setup") {
      loop.pause();
      run = m.run;
      sim.setup(m);
      started = true;
    } else if (!started) {
      return;
    } else if (m.type === "play") {
      loop.play(m.speed);
      if (loop.playing) return;    // (it reports as it plays)
    } else if (m.type === "pause") {
      loop.pause();
    } else if (m.type === "step") {
      loop.step();
      return;                      // (the step reported)
    } else {
      sim.messages[m.type](m, loop);
    }
    report();
  };
  return loop;
}


// The run so far, for the charts over time. A "sample" is the time and
// a few numbers (or lists of numbers, like the size of each color).
// One is taken every trace.gap units of time. When there are more than
// "most" (1000, unless newTrace is given another number), every other
// one is dropped and the gap doubles, so a long run keeps evenly spaced
// samples from start to end.
//   trace.times         the time of each sample
//   trace.lists[name]   the numbers of each sample, one after another
function newTrace(most) {
  return { times: [], lists: {}, gap: 1, next: 0, most: most || 1000 };
}

// Take a sample at "time" if one is due (or "now" is true). "values"
// gives each number, or list of numbers, by name, for example
//   keepSample(trace, time, { agree: 0.5, counts: [10, 20, 5] })
// A list must have the same length in every sample. "values" can also
// be a function that returns them, for numbers that take a while to
// work out (like the regions of a coloring): it is called only when a
// sample is due.
function keepSample(trace, time, values, now) {
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
  if (count > trace.most) {
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
