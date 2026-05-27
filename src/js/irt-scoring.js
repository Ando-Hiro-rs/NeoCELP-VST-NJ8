export const LEVEL_PARAMS = {
  1: { a: 2.2090, b: -2.2060, c: 0.0742 },
  2: { a: 2.8727, b: -1.5120, c: 0.0801 },
  3: { a: 2.0053, b: -0.7011, c: 0.1202 },
  4: { a: 2.7199, b: -0.0750, c: 0.1302 },
  5: { a: 2.1835, b:  0.7484, c: 0.0968 },
  6: { a: 1.9354, b:  1.1518, c: 0.0830 },
  7: { a: 2.2150, b:  1.5036, c: 0.1234 },
  8: { a: 2.2096, b:  2.0890, c: 0.1476 },
};

export function probCorrect(theta, a, b, c) {
  return c + (1 - c) / (1 + Math.exp(-1.7 * a * (theta - b)));
}

export function estimateTheta(responses, itemBank, options = {}) {
  const min = options.min ?? -3.0;
  const max = options.max ?? 3.0;
  const step = options.step ?? 0.1;
  const correction = options.correction ?? 0.2;
  const itemMap = new Map(itemBank.map(it => [it.id, it]));
  let bestTheta = min;
  let bestLL = -Infinity;
  const nSteps = Math.round((max - min) / step) + 1;
  for (let i = 0; i < nSteps; i++) {
    const theta = min + i * step;
    let ll = 0;
    for (const r of responses) {
      const item = itemMap.get(r.item_id);
      if (!item) continue;
      const p = Math.max(1e-10, Math.min(1 - 1e-10,
                probCorrect(theta, item.a, item.b, item.c)));
      ll += r.is_correct ? Math.log(p) : Math.log(1 - p);
    }
    if (ll > bestLL) { bestLL = ll; bestTheta = theta; }
  }
  return {
    theta: bestTheta + correction,
    theta_raw: bestTheta,
    log_likelihood: bestLL,
  };
}

export function estimateVocabSize(theta) {
  const perLevel = {};
  let total = 0;
  for (let lv = 1; lv <= 8; lv++) {
    const p = LEVEL_PARAMS[lv];
    const est = Math.round(probCorrect(theta, p.a, p.b, p.c) * 1000);
    perLevel[`level_${lv}`] = est;
    total += est;
  }
  return { total_vocab_size: total, per_level: perLevel };
}

export function computeStandardError(theta, responses, itemBank) {
  const itemMap = new Map(itemBank.map(it => [it.id, it]));
  let info = 0;
  for (const r of responses) {
    const item = itemMap.get(r.item_id);
    if (!item) continue;
    const p = Math.max(1e-10, Math.min(1 - 1e-10,
              probCorrect(theta, item.a, item.b, item.c)));
    const numer = (1.7 * item.a * (p - item.c)) / (1 - item.c);
    info += (numer ** 2) * (1 - p) / p;
  }
  return info > 0 ? 1 / Math.sqrt(info) : NaN;
}

export function scoreVST(responses, itemBank) {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new Error('応答データが空です');
  }
  const rawScore = responses.filter(r => r.is_correct).length;
  const thetaResult = estimateTheta(responses, itemBank);
  const vocabResult = estimateVocabSize(thetaResult.theta);
  const se = computeStandardError(thetaResult.theta, responses, itemBank);
  const correctByLevel = {};
  for (let lv = 1; lv <= 8; lv++) correctByLevel[`level_${lv}`] = 0;
  const itemMap = new Map(itemBank.map(it => [it.id, it]));
  for (const r of responses) {
    if (r.is_correct) {
      const item = itemMap.get(r.item_id);
      if (item) correctByLevel[`level_${item.level}`]++;
    }
  }
  return {
    raw_score: rawScore,
    total_items: responses.length,
    accuracy_percent: Math.round((rawScore / responses.length) * 1000) / 10,
    irt_theta: Math.round(thetaResult.theta * 100) / 100,
    irt_theta_raw: Math.round(thetaResult.theta_raw * 100) / 100,
    standard_error: isNaN(se) ? null : Math.round(se * 1000) / 1000,
    estimated_vocab_size: vocabResult.total_vocab_size,
    vocab_size_by_level: vocabResult.per_level,
    correct_by_level: correctByLevel,
    log_likelihood: Math.round(thetaResult.log_likelihood * 1000) / 1000,
  };
}


  const rts = afterFast.map(t => t.rt_ms);
  const meanPre = rts.reduce((s, v) => s + v, 0) / rts.length;
  const sdPre = Math.sqrt(rts.reduce((s, v) => s + (v - meanPre) ** 2, 0) / (rts.length - 1));
  const lower = meanPre - sdThreshold * sdPre;
  const upper = meanPre + sdThreshold * sdPre;
  const finalValid = afterFast.filter(t => t.rt_ms >= lower && t.rt_ms <= upper);
  const nOutlier = afterFast.length - finalValid.length;
  const finalRTs = finalValid.map(t => t.rt_ms);
  const acrrt = finalRTs.reduce((s, v) => s + v, 0) / finalRTs.length;
  const sdFinal = Math.sqrt(finalRTs.reduce((s, v) => s + (v - acrrt) ** 2, 0) / (finalRTs.length - 1));
  const cv = acrrt > 0 ? (sdFinal / acrrt) * 100 : 0;
  const synRTs = finalValid.filter(t => t.condition === 'synonym').map(t => t.rt_ms);
  const nsynRTs = finalValid.filter(t => t.condition === 'nonsynonym').map(t => t.rt_ms);
  const synMean = synRTs.length ? synRTs.reduce((s, v) => s + v, 0) / synRTs.length : 0;
  const nsynMean = nsynRTs.length ? nsynRTs.reduce((s, v) => s + v, 0) / nsynRTs.length : 0;
  const priming = nsynMean - synMean;
  const cleanedTrials = trials.map(t => {
    let reason = '';
    if (!t.is_correct) reason = 'wrong';
    else if (t.rt_ms <= fastThreshold) reason = 'fast';
    else if (t.rt_ms < lower || t.rt_ms > upper) reason = 'outlier';
    return { ...t, exclude_reason: reason };
  });
  return {
    total, n_wrong: nWrong, n_fast: nFast, n_outlier: nOutlier,
    n_valid: finalValid.length,
    acrrt: Math.round(acrrt),
    sd: Math.round(sdFinal),
    cv: Math.round(cv * 10) / 10,
    priming_effect: Math.round(priming),
    syn_mean: Math.round(synMean),
    nsyn_mean: Math.round(nsynMean),
    cleaned_trials: cleanedTrials,
  };
}
