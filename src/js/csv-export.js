export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function downloadCSV(filename, csv) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildCelpTrialsCSV(participant, session, mainTrials, practiceTrials = []) {
  const headers = [
    'participant_id', 'age', 'gender', 'l1', 'learning_years',
    'test_version', 'mode', 'cefr_level', 'test_datetime',
    'fixation_ms', 'prime_ms', 'blank_ms',
    'phase', 'trial_num', 'prime', 'target', 'condition',
    'response', 'is_correct', 'rt_ms', 'exclude_reason'
  ];
  const rows = [headers.join(',')];
  for (const t of practiceTrials) {
    const row = [
      participant.id, participant.age, participant.gender,
      participant.l1, participant.learning_years,
      session.test_version, session.mode, session.cefr_level,
      session.start_time, session.fixation_ms, session.prime_ms,
      session.blank_ms, 'practice', t.trial_num, t.prime, t.target, t.condition,
      t.response, t.is_correct ? 1 : 0, t.rt_ms, ''
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  for (const t of mainTrials) {
    const row = [
      participant.id, participant.age, participant.gender,
      participant.l1, participant.learning_years,
      session.test_version, session.mode, session.cefr_level,
      session.start_time, session.fixation_ms, session.prime_ms,
      session.blank_ms, 'main', t.trial_num, t.prime, t.target, t.condition,
      t.response, t.is_correct ? 1 : 0, t.rt_ms, t.exclude_reason || ''
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  return rows.join('\n');
}

export function buildVstTrialsCSV(participant, session, trials) {
  const headers = [
    'participant_id', 'age', 'gender', 'l1', 'learning_years',
    'test_version', 'mode', 'test_datetime',
    'item_id', 'level', 'pos', 'target_meaning_ja', 'correct_word',
    'option_pos_0', 'option_pos_1', 'option_pos_2', 'option_pos_3',
    'response_position', 'response_word', 'is_correct', 'response_time_ms'
  ];
  const rows = [headers.join(',')];
  for (const t of trials) {
    const row = [
      participant.id, participant.age, participant.gender,
      participant.l1, participant.learning_years,
      session.test_version, session.mode, session.start_time,
      t.item_id, t.level, t.pos, t.target_meaning_ja, t.correct_word,
      t.displayed_options[0], t.displayed_options[1],
      t.displayed_options[2], t.displayed_options[3],
      t.response_position, t.response_word,
      t.is_correct ? 1 : 0, t.response_time_ms
    ];
    rows.push(row.map(csvEscape).join(','));
  }
  return rows.join('\n');
}

export function buildSummaryCSV(participant, session, celpResult, vstResult, practiceStats, browserInfo) {
  const headers = ['key', 'value'];
  const rows = [headers.join(',')];
  const data = [
    ['participant_id', participant.id],
    ['age', participant.age],
    ['gender', participant.gender],
    ['l1', participant.l1],
    ['learning_years', participant.learning_years],
    ['test_version', session.test_version],
    ['mode', session.mode],
    ['test_datetime', session.start_time],
    ['consent_agreed', session.consent_agreed ? 1 : 0],
    ['consent_timestamp', session.consent_timestamp || ''],
    ['data_sharing_agreed', session.data_sharing_agreed ? 1 : 0],
  ];
  if (browserInfo) {
    data.push(
      ['browser_user_agent', browserInfo.user_agent],
      ['browser_platform', browserInfo.platform],
      ['browser_language', browserInfo.language],
      ['browser_timezone', browserInfo.timezone],
      ['screen_width', browserInfo.screen_width],
      ['screen_height', browserInfo.screen_height],
      ['screen_color_depth', browserInfo.color_depth],
      ['device_pixel_ratio', browserInfo.pixel_ratio],
      ['device_type', browserInfo.device_type],
      ['touch_support', browserInfo.touch_support ? 1 : 0],
    );
  }
  if (practiceStats) {
    data.push(
      ['celp_practice_total', practiceStats.total],
      ['celp_practice_correct', practiceStats.correct],
      ['celp_practice_accuracy_percent', practiceStats.accuracy],
      ['celp_practice_mean_rt_ms', practiceStats.mean_rt],
    );
  }
  if (celpResult) {
    data.push(
      ['celp_cefr_level', session.cefr_level],
      ['celp_total_trials', celpResult.total],
      ['celp_n_wrong', celpResult.n_wrong],
      ['celp_n_fast', celpResult.n_fast],
      ['celp_n_outlier', celpResult.n_outlier],
      ['celp_n_valid', celpResult.n_valid],
      ['celp_acrrt_ms', celpResult.acrrt],
      ['celp_sd_ms', celpResult.sd],
      ['celp_cv_percent', celpResult.cv],
      ['celp_synonym_mean_ms', celpResult.syn_mean],
      ['celp_nonsynonym_mean_ms', celpResult.nsyn_mean],
      ['celp_priming_effect_ms', celpResult.priming_effect],
    );
  }
  if (vstResult) {
    data.push(
      ['vst_raw_score', vstResult.raw_score],
      ['vst_total_items', vstResult.total_items],
      ['vst_accuracy_percent', vstResult.accuracy_percent],
      ['vst_irt_theta', vstResult.irt_theta],
      ['vst_standard_error', vstResult.standard_error],
      ['vst_estimated_vocab_size', vstResult.estimated_vocab_size],
    );
    for (let lv = 1; lv <= 8; lv++) {
      data.push([`vst_level_${lv}_correct`, vstResult.correct_by_level[`level_${lv}`]]);
      data.push([`vst_level_${lv}_estimated_words`, vstResult.vocab_size_by_level[`level_${lv}`]]);
    }
  }
  for (const [k, v] of data) {
    rows.push([csvEscape(k), csvEscape(v)].join(','));
  }
  return rows.join('\n');
}

export function makeFilename(participant, session, type) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${y}${m}${d}_${hh}${mm}${ss}`;
  const id = participant.id || 'anonymous';
  return `NeoCELP-VST_${id}_${session.mode}_${timestamp}_${type}.csv`;
}

export function sendByEmail(recipientEmail, participant, session, csvBlobs) {
  const subject = `NeoCELP-VST テスト結果 (${participant.id} / ${session.mode})`;
  const bodyLines = [
    `お世話になっております。`,
    ``,
    `NeoCELP & NeoVST-NJ8 のテスト結果を送付いたします。`,
    ``,
    `■ 受験者情報`,
    `  ID: ${participant.id}`,
    `  モード: ${session.mode}`,
    `  受験日時: ${session.start_time}`,
    ``,
    `■ 添付ファイル`,
    `  以下の CSV ファイルが添付されています:`,
  ];
  for (const blob of csvBlobs) {
    bodyLines.push(`  - ${blob.filename}`);
  }
  bodyLines.push(``);
  bodyLines.push(`本メールにファイルが添付されていない場合は、お手数ですがダウンロードしたファイルを手動で添付してください。`);
  bodyLines.push(``);
  bodyLines.push(`---`);
  bodyLines.push(`このメールは NeoCELP & NeoVST-NJ8 システムから自動生成されました。`);

  const body = bodyLines.join('\n');
  const mailtoUrl = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  for (const blob of csvBlobs) {
    downloadCSV(blob.filename, blob.content);
  }

  setTimeout(() => {
    window.location.href = mailtoUrl;
  }, 500);
}

export async function shareViaWebShareAPI(participant, session, csvBlobs) {
  if (!navigator.share || !navigator.canShare) {
    throw new Error('お使いのブラウザは共有機能に対応していません');
  }

  const files = csvBlobs.map(blob => {
    const bom = '\uFEFF';
    const fileContent = bom + blob.content;
    return new File([fileContent], blob.filename, { type: 'text/csv' });
  });

  const shareData = {
    title: `NeoCELP-VST テスト結果 (${participant.id})`,
    text: `NeoCELP & NeoVST-NJ8 テスト結果\n受験者ID: ${participant.id}\nモード: ${session.mode}\n受験日時: ${session.start_time}`,
    files: files,
  };

  if (!navigator.canShare(shareData)) {
    throw new Error('このデバイスではファイル共有がサポートされていません');
  }

  await navigator.share(shareData);
}
