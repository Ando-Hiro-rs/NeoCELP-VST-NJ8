export const CELP_TIMING = {
  fixation: 2000,
  prime: 1600,
  blank: 600,
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildCelpTrials(pool, n) {
  const half = Math.floor(n / 2);
  const synSel = shuffle(pool.synonym).slice(0, half);
  const nonsynSel = shuffle(pool.nonsynonym).slice(0, n - half);
  const items = [];
  synSel.forEach(([p, t]) => items.push({
    prime: p, target: t, condition: 'synonym', isSyn: true
  }));
  nonsynSel.forEach(([p, t]) => items.push({
    prime: p, target: t, condition: 'nonsynonym', isSyn: false
  }));
  return shuffle(items);
}

export function measureTimerPrecision() {
  const samples = [];
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    samples.push(performance.now());
  }
  const end = performance.now();
  const diffs = [];
  for (let i = 1; i < samples.length; i++) {
    diffs.push(samples[i] - samples[i - 1]);
  }
  const meanDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length;
  return {
    resolution_ms: Math.round(meanDiff * 1000) / 1000,
    total_duration_ms: Math.round((end - start) * 100) / 100,
    sample_count: samples.length,
  };
}

export class CelpRunner {
  constructor(elements, items, callbacks, options = {}) {
    this.el = elements;
    this.items = items;
    this.callbacks = callbacks;
    this.showFeedback = options.showFeedback ?? true;
    this.idx = 0;
    this.phase = 'idle';
    this.rtStart = 0;
    this.timer = null;
    this.rafId = null;
    this.results = [];
    this.timing = {
      fix_start: 0,
      fix_actual_end: 0,
      prime_start: 0,
      prime_actual_end: 0,
      blank_start: 0,
      blank_actual_end: 0,
      target_onset: 0,
    };
  }

  start() {
    this.idx = 0;
    this.results = [];
    this.next();
  }

  scheduleAt(targetTime, callback) {
    const tick = () => {
      const now = performance.now();
      if (now >= targetTime) {
        callback(now);
      } else {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  next() {
    if (this.idx >= this.items.length) {
      this.callbacks.onComplete(this.results);
      return;
    }
    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(this.idx, this.items.length);
    }
    const item = this.items[this.idx];
    this.el.fix.style.display = 'flex';
    this.el.fix.textContent = '+';
    this.el.prime.style.display = 'none';
    this.el.blank.style.display = 'none';
    this.el.target.style.display = 'none';
    this.el.btnRow.style.display = 'none';
    this.el.feedback.textContent = '';
    this.phase = 'fix';

    this.timing.fix_start = performance.now();
    const fixTargetEnd = this.timing.fix_start + CELP_TIMING.fixation;

    this.scheduleAt(fixTargetEnd, (actualFixEnd) => {
      this.timing.fix_actual_end = actualFixEnd;
      this.el.fix.style.display = 'none';
      this.el.prime.style.display = 'flex';
      this.el.prime.textContent = item.prime.toLowerCase();
      this.phase = 'prime';

      requestAnimationFrame(() => {
        this.timing.prime_start = performance.now();
        const primeTargetEnd = this.timing.prime_start + CELP_TIMING.prime;

        this.scheduleAt(primeTargetEnd, (actualPrimeEnd) => {
          this.timing.prime_actual_end = actualPrimeEnd;
          this.el.prime.style.display = 'none';
          this.el.blank.style.display = 'flex';
          this.phase = 'blank';

          requestAnimationFrame(() => {
            this.timing.blank_start = performance.now();
            const blankTargetEnd = this.timing.blank_start + CELP_TIMING.blank;

            this.scheduleAt(blankTargetEnd, (actualBlankEnd) => {
              this.timing.blank_actual_end = actualBlankEnd;
              this.el.blank.style.display = 'none';
              this.el.target.style.display = 'flex';
              this.el.target.textContent = item.target.toLowerCase();
              this.el.btnRow.style.display = 'flex';

              requestAnimationFrame(() => {
                this.timing.target_onset = performance.now();
                this.phase = 'target';
                this.rtStart = this.timing.target_onset;
              });
            });
          });
        });
      });
    });
  }

  respond(respondedYes) {
    if (this.phase !== 'target') return;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    const responseTime = performance.now();
    const rt = Math.round(responseTime - this.rtStart);
    const item = this.items[this.idx];
    const correct = respondedYes === item.isSyn;

    if (this.showFeedback) {
      this.el.feedback.textContent = correct ? '✓ 正解' : '✗ 不正解';
      this.el.feedback.className = 'feedback-msg ' + (correct ? 'fb-correct' : 'fb-wrong');
    } else {
      this.el.feedback.textContent = '';
    }

    this.el.btnRow.style.display = 'none';

    const fixActual = this.timing.fix_actual_end - this.timing.fix_start;
    const primeActual = this.timing.prime_actual_end - this.timing.prime_start;
    const blankActual = this.timing.blank_actual_end - this.timing.blank_start;
    const fixDeviation = fixActual - CELP_TIMING.fixation;
    const primeDeviation = primeActual - CELP_TIMING.prime;
    const blankDeviation = blankActual - CELP_TIMING.blank;

    this.results.push({
      trial_num: this.idx + 1,
      prime: item.prime,
      target: item.target,
      condition: item.condition,
      response: respondedYes ? 'synonym' : 'nonsynonym',
      is_correct: correct,
      rt_ms: rt,
      fix_actual_ms: Math.round(fixActual * 100) / 100,
      prime_actual_ms: Math.round(primeActual * 100) / 100,
      blank_actual_ms: Math.round(blankActual * 100) / 100,
      fix_deviation_ms: Math.round(fixDeviation * 100) / 100,
      prime_deviation_ms: Math.round(primeDeviation * 100) / 100,
      blank_deviation_ms: Math.round(blankDeviation * 100) / 100,
      target_onset_ms: Math.round(this.timing.target_onset * 100) / 100,
    });
    this.idx++;
    const delay = this.showFeedback ? 600 : 300;
    this.timer = setTimeout(() => this.next(), delay);
  }

  cleanup() {
    if (this.timer) clearTimeout(this.timer);
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}

export function calculateTimingPrecision(trials) {
  if (trials.length === 0) return null;
  const fixDeviations = trials.map(t => Math.abs(t.fix_deviation_ms || 0));
  const primeDeviations = trials.map(t => Math.abs(t.prime_deviation_ms || 0));
  const blankDeviations = trials.map(t => Math.abs(t.blank_deviation_ms || 0));

  const calc = (arr) => ({
    mean: arr.reduce((s, v) => s + v, 0) / arr.length,
    max: Math.max(...arr),
    min: Math.min(...arr),
    above_50ms: arr.filter(v => v > 50).length,
    above_100ms: arr.filter(v => v > 100).length,
  });

  return {
    fixation: calc(fixDeviations),
    prime: calc(primeDeviations),
    blank: calc(blankDeviations),
    total_trials: trials.length,
  };
}
