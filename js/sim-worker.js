/* =====================================================================
   sim-worker.js  —  what the sims' second threads share
   ---------------------------------------------------------------------
   Most sims do their work in a second thread (a Web Worker, started
   by startWorker in js/sim-page.js), so the page stays smooth while
   the model runs. These two helpers were copied into six of those
   workers; now they are written once, here:

     makeRunLoop(oneStep, report, isDone)   Play, Pause and Speed
     newTrace(), keepSample(...)            the run so far, for the
                                            charts over time

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
// A list must have the same length in every sample.
function keepSample(trace, time, values, now) {
  const MAX_SAMPLES = 1000;
  if (time < trace.next && !now) return;
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
    const even = function (x, k) { return k % 2 === 0; };
    trace.times = trace.times.filter(even);
    for (const name in trace.lists) {
      const width = trace.lists[name].length / count;    // numbers per sample
      trace.lists[name] = trace.lists[name].filter(function (x, k) { return Math.floor(k / width) % 2 === 0; });
    }
    trace.gap *= 2;
  }
}
