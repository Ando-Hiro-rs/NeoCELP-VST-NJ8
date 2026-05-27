import { VstRunner, validateVstIntegrity } from './vst.js';
import { scoreVST } from './irt-scoring.js';
import {
  downloadCSV, buildVstTrialsCSV,
  buildSummaryCSV, makeFilename,
  sendByEmail, shareViaWebShareAPI
} from './csv-export.js';

const TEST_VERSION = 'VST-NJ8 online vocabulary test fixed v2.0';
const STORAGE_KEY = 'neovst_participant_ids';

const RESEARCHER_EMAIL = 'ahiro.research1006@gmail.com';
const RESEARCHER_NAME = '安藤 嘉';

const state = {
  participant: {},
  session: {},
  vstResult: null,
  vstRawTrials: [],
  browserInfo: null,
};

let vstItems = null;
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
  vstItems = await fetch('./src/data/vst-items.json').then(r => r.json());
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
function addStoredId(id) {
  try {
    const ids = getStoredIds();
    ids.push({ id, timestamp: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn('localStorage への保存に失敗しました', e);
  }
}

function isIdDuplicate(id) {
  const ids = getStoredIds();
  return ids.some(record => record.id === id);
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
  show('s-info');
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
  if (isIdDuplicate(id)) {
    warningEl.style.display = 'block';
    warningEl.textContent = `⚠ このIDは既に受験記録があります。別のIDを使用してください。`;
    btn.disabled = true;
  } else {
    warningEl.style.display = 'none';
    btn.disabled = false;
  }
}

function submitInfo() {
  const id = document.getElementById('f-id').value.trim();
  if (isIdDuplicate(id)) {
    alert(`このIDは既に受験済みです。別のIDを使用してください。`);
    return;
  }
  state.participant = {
    id,
    age: document.getElementById('f-age').value.trim(),
    gender: document.getElementById('f-gender').value,
    l1: document.getElementById('f-l1').value,
    learning_years: document.getElementById('f-years').value.trim(),
    institution_type: document.getElementById('f-institution').value,
    major: document.getElementById('f-major').value,
    grade: document.getElementById('f-grade').value,
    english_start_age: document.getElementById('f-english-start').value.trim(),
    overseas_experience: document.getElementById('f-overseas').value,
    cert_type: document.getElementById('f-cert-type').value,
    cert_score: document.getElementById('f-cert-score').value.trim(),
    cert_date: document.getElementById('f-cert-date').value.trim(),
    english_use_frequency: document.getElementById('f-english-use').value,
    handedness: document.getElementById('f-handedness').value,
    condition_rating: document.getElementById('f-condition').value,
    device_type: document.getElementById('f-device').value,
    environment_type: document.getElementById('f-environment').value,
  };
  state.session = {
    ...state.session,
    test_version: TEST_VERSION,
    start_time: new Date().toISOString(),
  };
  show('s-vst-instructions');
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

function finishSession() {
  addStoredId(state.participant.id);
  showResult();
}

function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  const arrow = document.getElementById(sectionId + '-arrow');
  if (!section || !arrow) return;
  if (section.style.display === 'none' || section.style.display === '') {
    section.style.display = 'grid';
    arrow.textContent = '▼';
  } else {
    section.style.display = 'none';
    arrow.textContent = '▶';
  }
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

function showResult() {
  show('s-result');
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

  let msg = '';
  const size = v.estimated_vocab_size;
  if (size >= 6000) msg = '上級者レベルの語彙サイズです。専門的読解にも対応できます。';
  else if (size >= 4000) msg = '中上級レベル。学術文章の理解に十分な語彙力があります。';
  else if (size >= 2000) msg = '中級レベル。日常的なコミュニケーションには十分です。';
  else msg = '基礎レベル。高頻度語の学習を継続することが重要です。';
  document.getElementById('r-message').textContent = msg;

  document.getElementById('researcher-email-display').textContent = RESEARCHER_EMAIL;
  document.getElementById('researcher-name-display').textContent = RESEARCHER_NAME;
}

function buildAllCsvBlobs() {
  const blobs = [];
  if (state.vstResult) {
    blobs.push({
      filename: makeFilename(state.participant, state.session, 'vst_trials'),
      content: buildVstTrialsCSV(state.participant, state.session, state.vstRawTrials),
    });
  }
  blobs.push({
    filename: makeFilename(state.participant, state.session, 'summary'),
    content: buildSummaryCSV(state.participant, state.session, state.vstResult, state.browserInfo),
  });
  return blobs;
}

function exportVstTrials() {
  if (!state.vstResult) return;
  const csv = buildVstTrialsCSV(state.participant, state.session, state.vstRawTrials);
  downloadCSV(makeFilename(state.participant, state.session, 'vst_trials'), csv);
  toast('VST試行データをダウンロードしました');
}

function exportSummary() {
  const csv = buildSummaryCSV(state.participant, state.session, state.vstResult, state.browserInfo);
  downloadCSV(makeFilename(state.participant, state.session, 'summary'), csv);
  toast('集計データをダウンロードしました');
}

function sendDataByEmail() {
  const blobs = buildAllCsvBlobs();
  sendByEmail(RESEARCHER_EMAIL, state.participant, state.session, blobs);
  toast('CSVをダウンロード後、メールアプリが起動します');
}

async function shareDataViaApps() {
  try {
    const blobs = buildAllCsvBlobs();
    await shareViaWebShareAPI(state.participant, state.session, blobs);
    toast('共有が完了しました');
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('共有エラー:', err);
    toast('共有に失敗しました');
  }
}

function restart() {
  Object.assign(state, {
    participant: {}, session: {},
    vstResult: null, vstRawTrials: [],
  });
  const fieldsToReset = ['f-id', 'f-age', 'f-years', 'f-english-start', 'f-cert-score', 'f-cert-date'];
  fieldsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const selectsToReset = [
    'f-gender', 'f-institution', 'f-major', 'f-grade',
    'f-overseas', 'f-cert-type', 'f-english-use',
    'f-handedness', 'f-condition', 'f-device', 'f-environment'
  ];
  selectsToReset.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const l1El = document.getElementById('f-l1');
  if (l1El) l1El.value = 'japanese';
  document.getElementById('info-btn').disabled = true;
  document.getElementById('id-warning').style.display = 'none';
  show('s-consent');
}

window.checkConsentForm = checkConsentForm;
window.submitConsent = submitConsent;
window.checkInfoForm = checkInfoForm;
window.submitInfo = submitInfo;
window.startVst = startVst;
window.toggleSection = toggleSection;
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
  document.body.innerHTML = '<div style="padding:2rem;text-align:center;color:red">データの読み込みに失敗しました。</div>';
});
