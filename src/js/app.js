import { CelpRunner, buildCelpTrials, CELP_TIMING } from './celp.js';
import { VstRunner, validateVstIntegrity } from './vst.js';
import { scoreVST, cleanRtData } from './irt-scoring.js';
import {
  downloadCSV, buildCelpTrialsCSV, buildVstTrialsCSV,
  buildSummaryCSV, makeFilename,
  sendByEmail, shareViaWebShareAPI
} from './csv-export.js';

const TEST_VERSION = 'NeoCELP-VST v1.4';
const STORAGE_KEY = 'neocelp_vst_participant_ids';

// ★ ここに研究者のメールアドレスを設定してください
const RESEARCHER_EMAIL = 'ahiro.research1006@gmail.com';
const RESEARCHER_NAME = '安藤 嘉';

const state = {
  mode: null,
  participant: {},
  cefrLevel: null,
  session: {},
  celpResult: null,
  vstResult: null,
  celpRawTrials: [],
  vstRawTrials: [],
  celpPracticeResults: [],
  practiceStats: null,
  browserInfo: null,
};

let celpItems = null;
let vstItems = null;
let celpRunner = null;
let vstRunner = null;

function detectBrowserInfo() {
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  if (/Mobile|Android|iPhone/i.test(ua)) deviceType = 'mobile';
  else if (/iPad|Tablet/i.test(ua)) deviceType = 'tablet';
  return {
    user_agent: ua,
    platform: navigator.platform || '',
    language: navigator.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    color_depth: window.screen.colorDepth,
    pixel_ratio: window.devicePixelRatio || 1,
    device_type: deviceType,
    touch_support: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };
}

function applyDeviceClass() {
  const info = state.browserInfo;
  if (info.device_type === 'mobile' || info.touch_support) {
    document.body.classList.add('is-touch-device');
  }
  if (info.device_type === 'mobile') {
    document.body.classList.add('is-mobile');
  }
  if (navigator.share && navigator.canShare) {
    document.body.classList.add('supports-web-share');
  }
}

async function loadData() {
  const [celp, vst] = await Promise.all([
    fetch('./src/data/celp-items.json').then(r => r.json()),
    fetch('./src/data/vst-items.json').then(r => r.json()),
  ]);
  celpItems = celp;
  vstItems = vst;
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function getStoredIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function addStoredId(id, mode) {
  try {
    const ids = getStoredIds();
    ids.push({ id, mode, timestamp: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('localStorage への保存に失敗しました', e);
  }
}

function isIdDuplicate(id, mode) {
  const ids = getStoredIds();
  return ids.some(record => record.id === id && record.mode === mode);
}

function checkConsentForm() {
  const c1 = document.getElementById('consent-1').checked;
  const c2 = document.getElementById('consent-2').checked;
  const c3 = document.getElementById('consent-3').checked;
  document.getElementById('consent-btn').disabled = !(c1 && c2 && c3);
}

function submitConsent() {
  state.session.consent_agreed = true;
  state.session.consent_timestamp = new Date().toISOString();
  state.session.data_sharing_agreed = document.getElementById('consent-share').checked;
  show('s-mode');
}

function selectMode(mode) {
  state.mode = mode;
  show('s-info');
}

function getModeLabel(mode) {
  const labels = {
    'celp_only': 'NeoCELPのみ',
    'vst_only': 'NeoVST-NJ8のみ',
    'combined': '複合型テスト',
  };
  return labels[mode] || mode;
}

function checkInfoForm() {
  const id = document.getElementById('f-id').value.trim();
  const warningEl = document.getElementById('id-warning');
  const btn = document.getElementById('info-btn');
  if (id.length === 0) {
    warningEl.style.display = 'none';
    btn.disabled = true;
    return;
  }
  if (isIdDuplicate(id, state.mode)) {
    warningEl.style.display = 'block';
    warningEl.textContent = `⚠ このIDは「${getModeLabel(state.mode)}」で既に受験記録があります。別のIDを使用してください。`;
    btn.disabled = true;
  } else {
    warningEl.style.display = 'none';
    btn.disabled = false;
  }
}

function submitInfo() {
  const id = document.getElementById('f-id').value.trim();
  if (isIdDuplicate(id, state.mode)) {
    alert(`このIDは「${getModeLabel(state.mode)}」で既に受験済みです。別のIDを使用してください。`);
    return;
  }
  state.participant = {
    id,
    age: document.getElementById('f-age').value.trim(),
    gender: document.getElementById('f-gender').value,
    l1: document.getElementById('f-l1').value,
    learning_years: document.getElementById('f-years').value.trim(),
  };
  state.session = {
    ...state.session,
    test_version: TEST_VERSION,
    mode: state.mode,
    start_time: new Date().toISOString(),
    fixation_ms: CELP_TIMING.fixation,
    prime_ms: CELP_TIMING.prime,
    blank_ms: CELP_TIMING.blank,
  };
  if (state.mode === 'vst_only') {
    show('s-vst-instructions');
  } else {
    show('s-level');
  }
}

function selectLevel(level, el) {
  state.cefrLevel = level;
  state.session.cefr_level = level;
  document.querySelectorAll('.level-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('level-btn').disabled = false;
}

function showCelpInstructions() {
  show('s-celp-instructions');
}

function startCelpPractice() {
  const practicePool = celpItems.practice;
  const practiceItems = buildCelpTrials(practicePool, 8);
  const elements = {
    fix: document.getElementById('celp-fix'),
    prime: document.getElementById('celp-prime'),
    blank: document.getElementById('celp-blank'),
    target: document.getElementById('celp-target'),
    btnRow: document.getElementById('celp-btn-row'),
    feedback: document.getElementById('celp-feedback'),
  };
  document.getElementById('celp-phase').textContent = '練習';
  show('s-celp');
  celpRunner = new CelpRunner(elements, practiceItems, {
    onProgress: (i, n) => {
      document.getElementById('celp-prog-fill').style.width = `${(i / n) * 100}%`;
      document.getElementById('celp-prog-label').textContent = `${i} / ${n}`;
    },
    onComplete: (practiceResults) => {
      state.celpPracticeResults = practiceResults;
      const correctCount = practiceResults.filter(r => r.is_correct).length;
      const acc = Math.round((correctCount / practiceResults.length) * 100);
      const validRts = practiceResults.filter(r => r.is_correct && r.rt_ms > 100).map(r => r.rt_ms);
      const meanRt = validRts.length ? Math.round(validRts.reduce((a, b) => a + b, 0) / validRts.length) : 0;
      state.practiceStats = { total: practiceResults.length, correct: correctCount, accuracy: acc, mean_rt: meanRt };
      document.getElementById('practice-acc').textContent = `${acc}%`;
      document.getElementById('practice-msg').textContent = acc >= 75
        ? '練習お疲れ様でした。準備ができたら本試験を始めましょう。'
        : '練習の正答率がやや低めです。操作に慣れてから本試験を始めることをおすすめします。';
      show('s-celp-practice-end');
    },
  }, { showFeedback: true });
  celpRunner.start();
}

function startCelpMain() {
  const pool = celpItems[state.cefrLevel];
  const items = buildCelpTrials(pool, 40);
  const elements = {
    fix: document.getElementById('celp-fix'),
    prime: document.getElementById('celp-prime'),
    blank: document.getElementById('celp-blank'),
    target: document.getElementById('celp-target'),
    btnRow: document.getElementById('celp-btn-row'),
    feedback: document.getElementById('celp-feedback'),
  };
  document.getElementById('celp-phase').textContent = '本試験';
  show('s-celp');
  celpRunner = new CelpRunner(elements, items, {
    onProgress: (i, n) => {
      document.getElementById('celp-prog-fill').style.width = `${(i / n) * 100}%`;
      document.getElementById('celp-prog-label').textContent = `${i} / ${n}`;
    },
    onComplete: (results) => {
      state.celpRawTrials = results;
      state.celpResult = cleanRtData(results);
      if (state.mode === 'combined') show('s-celp-end');
      else finishSession();
    },
  }, { showFeedback: false });
  celpRunner.start();
}

function startVst() {
  const items = [...vstItems];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  const elements = {
    meaning: document.getElementById('vst-meaning'),
    pos: document.getElementById('vst-pos'),
    options: document.getElementById('vst-options'),
  };
  show('s-vst');
  vstRunner = new VstRunner(elements, items, {
    onProgress: (i, n) => {
      document.getElementById('vst-prog-fill').style.width = `${(i / n) * 100}%`;
      document.getElementById('vst-prog-label').textContent = `${i} / ${n}`;
    },
    onComplete: (results) => {
      state.vstRawTrials = results;
      const issues = validateVstIntegrity(results);
      if (issues.length > 0) console.error('VST整合性エラー:', issues);
      state.vstResult = scoreVST(results, vstItems);
      finishSession();
    },
  });
  vstRunner.start();
}

function continueToVst() {
  show('s-vst-instructions');
}

function finishSession() {
  addStoredId(state.participant.id, state.mode);
  showResult();
}

function vocabToCEFR(size) {
  if (size >= 6500) return { label: 'C1〜C2', short: 'C1+', desc: '上級〜熟練者' };
  if (size >= 4500) return { label: 'B2', short: 'B2', desc: '中上級' };
  if (size >= 3000) return { label: 'B1', short: 'B1', desc: '中級' };
  if (size >= 1500) return { label: 'A2', short: 'A2', desc: '初中級' };
  return { label: 'A1', short: 'A1', desc: '基礎' };
}

function vocabToEiken(size) {
  if (size >= 7500) return '英検 1 級相当';
  if (size >= 6000) return '英検 準1 級相当';
  if (size >= 4500) return '英検 2 級相当';
  if (size >= 3000) return '英検 準2 級相当';
  if (size >= 1500) return '英検 3 級相当';
  return '英検 4・5 級相当';
}

function vocabToTOEIC(size) {
  if (size >= 7000) return 'TOEIC 800+';
  if (size >= 5500) return 'TOEIC 700〜800';
  if (size >= 4000) return 'TOEIC 600〜700';
  if (size >= 2500) return 'TOEIC 450〜600';
  return 'TOEIC 〜450';
}

function celpToProficiency(acrrt, cv) {
  if (!acrrt) return null;
  if (acrrt < 800 && cv < 25) return { label: '熟達ゾーン', desc: '高速かつ安定。自動化が高度に達成されています。', tier: 'top' };
  if (acrrt < 1000 && cv < 30) return { label: '流暢ゾーン', desc: '実用的な会話速度。コミュニケーションに支障ありません。', tier: 'high' };
  if (acrrt < 1300 && cv < 35) return { label: '発展ゾーン', desc: '日常的な使用に十分。さらなる自動化の余地があります。', tier: 'mid' };
  if (acrrt < 1700) return { label: '基礎ゾーン', desc: '意味は理解できていますが、処理に時間がかかります。', tier: 'low' };
  return { label: '形成ゾーン', desc: '語彙意味への到達に時間が必要な段階です。継続的な練習が効果的です。', tier: 'beginner' };
}

function showResult() {
  show('s-result');
  const showCelp = state.celpResult !== null;
  const showVst = state.vstResult !== null;

  document.getElementById('result-celp-section').style.display = showCelp ? 'flex' : 'none';
  document.getElementById('result-vst-section').style.display = showVst ? 'flex' : 'none';

  if (showCelp) {
    const c = state.celpResult;
    document.getElementById('r-acrrt').textContent = c.acrrt || '—';
    document.getElementById('r-cv').textContent = c.cv;
    document.getElementById('r-priming').textContent = (c.priming_effect > 0 ? '+' : '') + c.priming_effect;
    document.getElementById('r-valid').textContent = `${c.n_valid} / ${c.total}`;
    document.getElementById('ex-wrong').textContent = `${c.n_wrong} 問`;
    document.getElementById('ex-fast').textContent = `${c.n_fast} 問`;
    document.getElementById('ex-outlier').textContent = `${c.n_outlier} 問`;
    document.getElementById('ex-valid').textContent = `${c.n_valid} 問`;

    const prof = celpToProficiency(c.acrrt, c.cv);
    const profCard = document.getElementById('celp-proficiency');
    if (prof) {
      profCard.style.display = 'block';
      profCard.className = `proficiency-card tier-${prof.tier}`;
      profCard.innerHTML = `
        <div class="prof-label">あなたのレベル</div>
        <div class="prof-zone">${prof.label}</div>
        <div class="prof-desc">${prof.desc}</div>
      `;
    }
  }

  if (showVst) {
    const v = state.vstResult;
    document.getElementById('r-vocab').textContent = v.estimated_vocab_size.toLocaleString();
    document.getElementById('r-theta').textContent = v.irt_theta;
    document.getElementById('r-se').textContent = `SE: ${v.standard_error ?? '—'}`;
    document.getElementById('r-vst-acc').textContent = `${v.accuracy_percent}%`;
    document.getElementById('r-raw').textContent = `${v.raw_score} / ${v.total_items}`;

    const cefr = vocabToCEFR(v.estimated_vocab_size);
    const eiken = vocabToEiken(v.estimated_vocab_size);
    const toeic = vocabToTOEIC(v.estimated_vocab_size);
    document.getElementById('badge-cefr').textContent = cefr.short;
    document.getElementById('badge-cefr-desc').textContent = `CEFR ${cefr.label} / ${cefr.desc}`;
    document.getElementById('badge-eiken').textContent = eiken;
    document.getElementById('badge-toeic').textContent = toeic;

    const lvBars = document.getElementById('level-bars');
    lvBars.innerHTML = '';
    for (let lv = 1; lv <= 8; lv++) {
      const correct = v.correct_by_level[`level_${lv}`];
      const est = v.vocab_size_by_level[`level_${lv}`];
      const pct = (correct / 20) * 100;
      lvBars.innerHTML += `
        <div class="level-bar-row">
          <span class="level-bar-name">Lv${lv}</span>
          <div class="level-bar-track"><div class="level-bar-fill" style="width:${pct}%"></div></div>
          <span class="level-bar-val">${correct}/20 → ${est}語</span>
        </div>`;
    }
  }

  let msg = '';
  if (showCelp && showVst) {
    msg = `推定語彙サイズ ${state.vstResult.estimated_vocab_size}語、平均処理速度 ${state.celpResult.acrrt}ms。`;
    if (state.celpResult.acrrt < 1000 && state.vstResult.estimated_vocab_size >= 4000) {
      msg += ' 語彙の広さと運用の流暢さの両方が高水準です。';
    } else if (state.celpResult.acrrt < 1200) {
      msg += ' 処理速度は良好です。語彙の幅をさらに広げることで総合的な力が伸びます。';
    } else {
      msg += ' まずは同じレベルの語に繰り返し触れて自動化を進めましょう。';
    }
  } else if (showCelp) {
    if (state.celpResult.acrrt < 1000) msg = '1秒以内の処理速度を達成しています。語彙の自動化が高い水準にあります。';
    else if (state.celpResult.acrrt < 1500) msg = '良好な処理速度です。継続的な学習でさらに自動化が進みます。';
    else msg = '意識的な処理段階にあります。同レベルの語彙への繰り返し接触を増やしましょう。';
  } else if (showVst) {
    const size = state.vstResult.estimated_vocab_size;
    if (size >= 6000) msg = '上級者レベルの語彙サイズです。専門的読解にも対応できます。';
    else if (size >= 4000) msg = '中上級レベル。学術文章の理解に十分な語彙力があります。';
    else if (size >= 2000) msg = '中級レベル。日常的なコミュニケーションには十分です。';
    else msg = '基礎レベル。高頻度語の学習を継続することが重要です。';
  }
  document.getElementById('r-message').textContent = msg;

  document.getElementById('researcher-email-display').textContent = RESEARCHER_EMAIL;
  document.getElementById('researcher-name-display').textContent = RESEARCHER_NAME;
}

function buildAllCsvBlobs() {
  const blobs = [];
  if (state.celpResult) {
    blobs.push({
      filename: makeFilename(state.participant, state.session, 'celp_trials'),
      content: buildCelpTrialsCSV(state.participant, state.session, state.celpResult.cleaned_trials, state.celpPracticeResults),
    });
  }
  if (state.vstResult) {
    blobs.push({
      filename: makeFilename(state.participant, state.session, 'vst_trials'),
      content: buildVstTrialsCSV(state.participant, state.session, state.vstRawTrials),
    });
  }
  blobs.push({
    filename: makeFilename(state.participant, state.session, 'summary'),
    content: buildSummaryCSV(state.participant, state.session, state.celpResult, state.vstResult, state.practiceStats, state.browserInfo),
  });
  return blobs;
}

function exportCelpTrials() {
  if (!state.celpResult) return;
  const csv = buildCelpTrialsCSV(
    state.participant, state.session,
    state.celpResult.cleaned_trials,
    state.celpPracticeResults
  );
  downloadCSV(makeFilename(state.participant, state.session, 'celp_trials'), csv);
  toast('CELP試行データをダウンロードしました');
}

function exportVstTrials() {
  if (!state.vstResult) return;
  const csv = buildVstTrialsCSV(state.participant, state.session, state.vstRawTrials);
  downloadCSV(makeFilename(state.participant, state.session, 'vst_trials'), csv);
  toast('VST試行データをダウンロードしました');
}

function exportSummary() {
  const csv = buildSummaryCSV(
    state.participant, state.session,
    state.celpResult, state.vstResult,
    state.practiceStats, state.browserInfo
  );
  downloadCSV(makeFilename(state.participant, state.session, 'summary'), csv);
  toast('集計データをダウンロードしました');
}

function sendDataByEmail() {
  const blobs = buildAllCsvBlobs();
  sendByEmail(RESEARCHER_EMAIL, state.participant, state.session, blobs);
  toast('CSVをダウンロード後、メールアプリが起動します。CSVを手動で添付してください');
}

async function shareDataViaApps() {
  try {
    const blobs = buildAllCsvBlobs();
    await shareViaWebShareAPI(state.participant, state.session, blobs);
    toast('共有が完了しました');
  } catch (err) {
    if (err.name === 'AbortError') {
      return;
    }
    console.error('共有エラー:', err);
    toast('共有に失敗しました。メール送信機能をお試しください');
  }
}

function restart() {
  Object.assign(state, {
    mode: null, participant: {}, cefrLevel: null, session: {},
    celpResult: null, vstResult: null,
    celpRawTrials: [], vstRawTrials: [],
    celpPracticeResults: [], practiceStats: null,
  });
  document.getElementById('f-id').value = '';
  document.getElementById('f-age').value = '';
  document.getElementById('f-gender').value = '';
  document.getElementById('f-l1').value = 'japanese';
  document.getElementById('f-years').value = '';
  document.querySelectorAll('.level-opt').forEach(o => o.classList.remove('selected'));
  document.getElementById('level-btn').disabled = true;
  document.getElementById('info-btn').disabled = true;
  document.getElementById('id-warning').style.display = 'none';
  show('s-mode');
}

document.addEventListener('keydown', (e) => {
  if (celpRunner && celpRunner.phase === 'target') {
    if (e.key === 'ArrowRight') celpRunner.respond(true);
    if (e.key === 'ArrowLeft') celpRunner.respond(false);
  }
});

window.checkConsentForm = checkConsentForm;
window.submitConsent = submitConsent;
window.selectMode = selectMode;
window.checkInfoForm = checkInfoForm;
window.submitInfo = submitInfo;
window.selectLevel = selectLevel;
window.showCelpInstructions = showCelpInstructions;
window.startCelpPractice = startCelpPractice;
window.startCelpMain = startCelpMain;
window.startVst = startVst;
window.continueToVst = continueToVst;
window.celpRespond = (b) => celpRunner && celpRunner.respond(b);
window.exportCelpTrials = exportCelpTrials;
window.exportVstTrials = exportVstTrials;
window.exportSummary = exportSummary;
window.sendDataByEmail = sendDataByEmail;
window.shareDataViaApps = shareDataViaApps;
window.restart = restart;

state.browserInfo = detectBrowserInfo();
applyDeviceClass();

loadData().then(() => {
  show('s-consent');
}).catch(err => {
  console.error('データ読み込みに失敗:', err);
  document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:red">データの読み込みに失敗しました。ブラウザのコンソールを確認してください。</div>';
});
