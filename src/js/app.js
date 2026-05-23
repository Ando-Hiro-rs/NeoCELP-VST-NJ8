import { CelpRunner, buildCelpTrials, CELP_TIMING } from './celp.js';
import { VstRunner, validateVstIntegrity } from './vst.js';
import { scoreVST, cleanRtData } from './irt-scoring.js';
import {
  downloadCSV, buildCelpTrialsCSV, buildVstTrialsCSV,
  buildSummaryCSV, makeFilename
} from './csv-export.js';

const TEST_VERSION = 'NeoCELP-VST v1.1';

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
};

let celpItems = null;
let vstItems = null;
let celpRunner = null;
let vstRunner = null;

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
  setTimeout(() => t.classList.remove('show'), 2000);
}

function selectMode(mode) {
  state.mode = mode;
  show('s-info');
}

function checkInfoForm() {
  const id = document.getElementById('f-id').value.trim();
  document.getElementById('info-btn').disabled = id.length === 0;
}

function submitInfo() {
  state.participant = {
    id: document.getElementById('f-id').value.trim(),
    age: document.getElementById('f-age').value.trim(),
    gender: document.getElementById('f-gender').value,
    l1: document.getElementById('f-l1').value,
    learning_years: document.getElementById('f-years').value.trim(),
  };
  state.session = {
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
      if (state.mode === 'combined') {
        show('s-celp-end');
      } else {
        showResult();
      }
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
      if (issues.length > 0) {
        console.error('VST整合性エラー:', issues);
      }
      state.vstResult = scoreVST(results, vstItems);
      showResult();
    },
  });
  vstRunner.start();
}

function continueToVst() {
  show('s-vst-instructions');
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
  }

  if (showVst) {
    const v = state.vstResult;
    document.getElementById('r-vocab').textContent = v.estimated_vocab_size.toLocaleString();
    document.getElementById('r-theta').textContent = v.irt_theta;
    document.getElementById('r-se').textContent = `SE: ${v.standard_error ?? '—'}`;
    document.getElementById('r-vst-acc').textContent = `${v.accuracy_percent}%`;
    document.getElementById('r-raw').textContent = `${v.raw_score} / ${v.total_items}`;

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
}

function exportCelpTrials() {
  if (!state.celpResult) return;
  const csv = buildCelpTrialsCSV(state.participant, state.session, state.celpResult.cleaned_trials);
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
  const csv = buildSummaryCSV(state.participant, state.session, state.celpResult, state.vstResult);
  downloadCSV(makeFilename(state.participant, state.session, 'summary'), csv);
  toast('集計データをダウンロードしました');
}

function restart() {
  Object.assign(state, {
    mode: null, participant: {}, cefrLevel: null, session: {},
    celpResult: null, vstResult: null,
    celpRawTrials: [], vstRawTrials: [],
    celpPracticeResults: [],
  });
  document.getElementById('f-id').value = '';
  document.getElementById('f-age').value = '';
  document.getElementById('f-gender').value = '';
  document.getElementById('f-l1').value = 'japanese';
  document.getElementById('f-years').value = '';
  document.querySelectorAll('.level-opt').forEach(o => o.classList.remove('selected'));
  document.getElementById('level-btn').disabled = true;
  document.getElementById('info-btn').disabled = true;
  show('s-mode');
}

document.addEventListener('keydown', (e) => {
  if (celpRunner && celpRunner.phase === 'target') {
    if (e.key === 'ArrowRight') celpRunner.respond(true);
    if (e.key === 'ArrowLeft') celpRunner.respond(false);
  }
});

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
window.restart = restart;

loadData().then(() => {
  show('s-mode');
}).catch(err => {
  console.error('データ読み込みに失敗:', err);
  document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:red">データの読み込みに失敗しました。ブラウザのコンソールを確認してください。</div>';
});
