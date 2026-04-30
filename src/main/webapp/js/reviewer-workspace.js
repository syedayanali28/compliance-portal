(function () {
  'use strict';

  var PAGE = document.body.getAttribute('data-reviewer-page') || 'hub';

  function applyDemoConnectivityCopy() {
    var hint = document.getElementById('analysisConnectivityHint');
    if (!hint || !window.HKMA_getDemoMode || !window.HKMA_getDemoMode()) return;
    hint.innerHTML =
      '<strong>Client demo mode</strong> — <strong>Test Jira and LLM</strong> shows simulated success. To use a real service, open this app on <code>http://localhost</code> (demo defaults off there), run <code>npm start</code> in <code>service/</code>, and configure Jira + LLM in <code>service/.env</code>, or set <code>localStorage.hkmaDemoMode = &quot;false&quot;</code> on this host.';
  }
  applyDemoConnectivityCopy();

  if (PAGE === 'hub') {
    return;
  }

  var SERVICE_URL = 'http://localhost:3001';
  var store = window.HKMAProjectStore;

  var selectedIssueKey = null;
  var messages = [];

  function showToast(msg, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 4000);
  }

  function downloadJson(data, filename) {
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function exportProjectsSnapshot() {
    if (!store || typeof store.getAll !== 'function') {
      showToast('Project store unavailable.', 'error');
      return;
    }
    var projects = store.getAll();
    var snapshot = projects.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        team: p.team,
        status: p.status,
        members: p.members,
        description: p.description,
        firewallIdacFilename: p.firewallIdacFilename || null,
        diagramFilename: p.diagramFilename || null,
        linkedAt: p.linkedAt || null,
        firewallLinkedAt: p.firewallLinkedAt || null,
        createdAt: p.createdAt || null,
      };
    });
    downloadJson(snapshot, 'projects-snapshot.json');
    var artefactRows = projects
      .filter(function (p) {
        return p.diagramXml;
      })
      .map(function (p) {
        return { id: p.id, diagramXml: p.diagramXml, diagramFilename: p.diagramFilename || null };
      });
    function pushDiagramArtefacts() {
      if (artefactRows.length === 0) return Promise.resolve({ ok: true, skipped: true });
      return fetch(SERVICE_URL + '/api/projects/artefacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artefacts: artefactRows }),
      }).then(function (ar) {
        return { ok: ar.ok, skipped: false };
      });
    }
    fetch(SERVICE_URL + '/api/projects/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    })
      .then(function (res) {
        if (!res.ok) {
          showToast('Snapshot downloaded; sync returned HTTP ' + res.status + '.', 'info');
          return null;
        }
        return pushDiagramArtefacts().then(function (ar) {
          var base = 'Portal data synced (' + snapshot.length + ' projects)';
          if (ar.skipped) showToast(base + '.', 'success');
          else if (ar.ok) showToast(base + ', ' + artefactRows.length + ' diagram(s) for LLM.', 'success');
          else showToast(base + '; diagram push failed.', 'info');
        });
      })
      .catch(function () {
        showToast('Snapshot downloaded; service offline — save file to service/data/ if needed.', 'info');
      });
  }

  function fillProjectSelect() {
    var sel = document.getElementById('projectSelect');
    if (!sel) return;
    var first = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (first) sel.appendChild(first);
    if (!store || typeof store.getAll !== 'function') return;
    store.getAll().forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = (p.name || 'Untitled') + (p.code ? ' (' + p.code + ')' : '');
      sel.appendChild(opt);
    });
  }

  function setPreview(data) {
    var el = document.getElementById('issuePreview');
    if (!el) return;
    if (!data || !data.key) {
      el.classList.remove('visible');
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<strong>' +
      esc(data.key) +
      '</strong> — ' +
      esc(data.summary || '') +
      '<br /><span style="color: var(--muted); font-size: 13px;">' +
      esc(data.status || '') +
      (data.projectKey ? ' · Project: ' + esc(data.projectKey) : '') +
      (data.jiraUrl
        ? ' · <a href="' + escAttr(data.jiraUrl) + '" target="_blank" rel="noopener">Open in Jira</a>'
        : '') +
      '</span>';
    el.classList.add('visible');
  }

  function esc(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
  }

  function selectIssue(key, previewData) {
    selectedIssueKey = (key || '').trim().toUpperCase();
    var issueInput = document.getElementById('issueKeyInput');
    if (issueInput) issueInput.value = selectedIssueKey;
    var hits = document.querySelectorAll('.search-hit');
    hits.forEach(function (h) {
      h.classList.toggle('selected', h.getAttribute('data-key') === selectedIssueKey);
    });
    if (previewData) setPreview(previewData);
    else loadIssuePreview(selectedIssueKey);
  }

  function loadIssuePreview(key) {
    if (!key) return;
    fetch(SERVICE_URL + '/api/jira/firewall/' + encodeURIComponent(key))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(setPreview)
      .catch(function () {
        setPreview({
          key: key,
          summary: '(Could not load preview — check service / Jira.)',
          status: '',
        });
      });
  }

  function runSearch() {
    var input = document.getElementById('jiraSearchInput');
    var q = input ? input.value.trim() : '';
    if (!q) {
      showToast('Enter a search term or issue key.', 'info');
      return;
    }
    var box = document.getElementById('searchResults');
    if (!box) return;
    box.innerHTML = '<div class="search-hit" style="cursor: default; color: var(--muted);">Searching…</div>';
    box.classList.add('visible');
    fetch(SERVICE_URL + '/api/jira/firewall-search?q=' + encodeURIComponent(q))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var results = data.results || [];
        box.innerHTML = '';
        if (!results.length) {
          box.innerHTML = '<div class="search-hit" style="cursor: default;">No issues found.</div>';
          return;
        }
        results.forEach(function (hit) {
          var div = document.createElement('div');
          div.className = 'search-hit';
          div.setAttribute('data-key', hit.key);
          div.innerHTML =
            '<div class="key">' +
            esc(hit.key) +
            '</div>' +
            '<div class="sum">' +
            esc(hit.summary) +
            '</div>' +
            '<div class="meta">' +
            esc(hit.status || '') +
            (hit.projectKey ? ' · ' + esc(hit.projectKey) : '') +
            '</div>';
          div.addEventListener('click', function () {
            selectIssue(hit.key, hit);
          });
          box.appendChild(div);
        });
      })
      .catch(function () {
        box.innerHTML =
          '<div class="search-hit" style="cursor: default; color: var(--danger);">Search failed — is the analysis service running?</div>';
      });
  }

  function outcomeLabel(o) {
    return (
      {
        likely_approved: 'Likely valid',
        requires_clarification: 'Not valid / clarify',
        pending_review: 'Needs manual review',
      }[o] ||
      o ||
      'Unknown'
    );
  }

  function outcomeClass(o) {
    return 'outcome-' + (o || 'pending_review').replace(/[^a-z_]/gi, '_');
  }

  function renderVerdict(record) {
    var panel = document.getElementById('verdictPanel');
    if (!panel) return;
    panel.classList.add('visible');
    var pct = typeof record.confidencePercent === 'number' ? record.confidencePercent : 55;
    var ring = document.getElementById('scoreRing');
    if (ring)
      ring.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
    var c = 'var(--accent)';
    if (record.outcome === 'likely_approved') c = 'var(--ok)';
    else if (record.outcome === 'requires_clarification') c = 'var(--danger)';
    else if (record.outcome === 'pending_review') c = 'var(--warn)';
    if (ring) ring.style.setProperty('--c', c);
    var scoreLabel = document.getElementById('scoreLabel');
    if (scoreLabel) scoreLabel.textContent = pct + '%';
    var verdictKey = document.getElementById('verdictKey');
    if (verdictKey) verdictKey.textContent = record.jiraKey;
    var badge = document.getElementById('outcomeBadge');
    if (badge) {
      badge.textContent = outcomeLabel(record.outcome);
      badge.className = 'outcome-badge ' + outcomeClass(record.outcome);
    }
    var verdictHint = document.getElementById('verdictHint');
    if (verdictHint)
      verdictHint.textContent = record.llmStub
        ? 'Demo / stub LLM — replace with live model in service/.env for production-grade text.'
        : '';

    var ul = document.getElementById('reasoningList');
    if (ul) {
      ul.innerHTML = '';
      var steps =
        record.reasoningSteps && record.reasoningSteps.length
          ? record.reasoningSteps
          : ['(No separate reasoning steps returned — see full analysis below.)'];
      steps.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s;
        ul.appendChild(li);
      });
    }
    var analysisBody = document.getElementById('analysisBody');
    if (analysisBody) analysisBody.textContent = record.analysis || '';

    var docs = document.getElementById('verdictDocs');
    if (docs) {
      docs.innerHTML = '';
      (record.sourceDocuments || []).forEach(function (d) {
        if (d.url) {
          var a = document.createElement('a');
          a.href = d.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = d.label + ' →';
          docs.appendChild(a);
        } else {
          var span = document.createElement('div');
          span.className = 'muted';
          span.textContent = d.label + (d.note ? ' — ' + d.note : '');
          docs.appendChild(span);
        }
      });
      if (record.reviewerNotes) {
        var n = document.createElement('div');
        n.className = 'muted';
        n.style.marginTop = '8px';
        n.textContent = 'Your notes: ' + record.reviewerNotes;
        docs.appendChild(n);
      }
    }
  }

  function renderHistory(list) {
    var host = document.getElementById('historyList');
    if (!host) return;
    host.innerHTML = '';
    if (!list || !list.length) {
      var emptyMsg =
        PAGE === 'history'
          ? 'No analyses yet. Complete a review on the <a href="llm-analysis-review.html">New review</a> page.'
          : 'No analyses yet. Complete a review — results are stored on the analysis service.';
      host.innerHTML = '<div class="empty-state">' + emptyMsg + '</div>';
      return;
    }
    list.forEach(function (r) {
      var det = document.createElement('details');
      det.className = 'history-card';
      if (sessionStorage.getItem('expand-' + r.jiraKey) === '1') det.open = true;
      var pct = typeof r.confidencePercent === 'number' ? r.confidencePercent : '—';
      var sum = (r.jiraIssue && r.jiraIssue.summary) || '';
      det.innerHTML =
        '<summary>' +
        '<span class="left"><strong>' +
        esc(r.jiraKey) +
        '</strong> <span class="pct-pill">' +
        esc(String(pct)) +
        '%</span></span>' +
        '<span class="outcome-badge ' +
        esc(outcomeClass(r.outcome)) +
        '">' +
        esc(outcomeLabel(r.outcome)) +
        '</span>' +
        '</summary>' +
        '<div class="history-body"><div class="history-body-inner">' +
        '<div class="muted" style="font-size: 13px; margin-bottom: 10px;">' +
        esc(sum) +
        '</div>' +
        '<div class="muted" style="font-size: 12px;">Analysed ' +
        esc(fmtDate(r.analysedAt)) +
        (r.llmStub ? ' · stub' : '') +
        '</div>' +
        '<ul class="reasoning-list">' +
        (r.reasoningSteps || [])
          .map(function (s) {
            return '<li>' + esc(s) + '</li>';
          })
          .join('') +
        '</ul>' +
        '<div class="analysis-body" style="border: none; padding-top: 8px; white-space: pre-wrap;">' +
        esc(r.analysis || '') +
        '</div>' +
        '<div class="doc-list" style="margin-top: 12px;">' +
        (r.sourceDocuments || [])
          .map(function (d) {
            return d.url
              ? '<a href="' +
                  escAttr(d.url) +
                  '" target="_blank" rel="noopener">' +
                  esc(d.label) +
                  ' →</a>'
              : '<div class="muted">' +
                  esc(d.label) +
                  (d.note ? ' — ' + esc(d.note) : '') +
                  '</div>';
          })
          .join('') +
        '</div>' +
        '</div></div>';
      det.addEventListener('toggle', function () {
        sessionStorage.setItem('expand-' + r.jiraKey, det.open ? '1' : '0');
      });
      host.appendChild(det);
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return iso;
    }
  }

  function loadHistory() {
    var host = document.getElementById('historyList');
    if (!host) return;
    fetch(SERVICE_URL + '/api/analysis')
      .then(function (r) {
        return r.json();
      })
      .then(renderHistory)
      .catch(function () {
        host.innerHTML =
          '<div class="empty-state">Cannot load history — start the Node service on port 3001.</div>';
      });
  }

  function runReview() {
    var key =
      selectedIssueKey ||
      (document.getElementById('issueKeyInput') && document.getElementById('issueKeyInput').value.trim().toUpperCase());
    if (!key) {
      showToast('Select or enter a firewall Jira ticket first.', 'error');
      return;
    }
    var btn = document.getElementById('runReviewBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Analysing…';
    }
    var projectSel = document.getElementById('projectSelect');
    var body = {
      jiraKey: key,
      projectId: projectSel && projectSel.value ? projectSel.value : undefined,
      linkedArbKey:
        document.getElementById('arbKeyInput') &&
        document.getElementById('arbKeyInput').value.trim()
          ? document.getElementById('arbKeyInput').value.trim()
          : undefined,
      linkedArbUrl:
        document.getElementById('arbUrlInput') &&
        document.getElementById('arbUrlInput').value.trim()
          ? document.getElementById('arbUrlInput').value.trim()
          : undefined,
      additionalDocLabel:
        document.getElementById('extraLabelInput') &&
        document.getElementById('extraLabelInput').value.trim()
          ? document.getElementById('extraLabelInput').value.trim()
          : undefined,
      additionalDocUrl:
        document.getElementById('extraUrlInput') &&
        document.getElementById('extraUrlInput').value.trim()
          ? document.getElementById('extraUrlInput').value.trim()
          : undefined,
      reviewerNotes:
        document.getElementById('reviewerNotesInput') &&
        document.getElementById('reviewerNotesInput').value.trim()
          ? document.getElementById('reviewerNotesInput').value.trim()
          : undefined,
    };
    fetch(SERVICE_URL + '/api/analysis/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok)
          return r.json().then(function (j) {
            throw new Error(j.error || 'HTTP ' + r.status);
          });
        return r.json();
      })
      .then(function (record) {
        renderVerdict(record);
        showToast('Analysis saved. Opening Analysed requests…', 'success');
        setTimeout(function () {
          window.location.href = 'llm-analysis-history.html';
        }, 2500);
      })
      .catch(function (err) {
        showToast(err.message || 'Analysis failed', 'error');
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run validity analysis';
        }
      });
  }

  var searchBtn = document.getElementById('jiraSearchBtn');
  if (searchBtn) searchBtn.addEventListener('click', runSearch);
  var searchInput = document.getElementById('jiraSearchInput');
  if (searchInput)
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });
  var loadIssueBtn = document.getElementById('loadIssueBtn');
  if (loadIssueBtn)
    loadIssueBtn.addEventListener('click', function () {
      var inp = document.getElementById('issueKeyInput');
      var k = inp ? inp.value.trim().toUpperCase() : '';
      selectIssue(k, null);
    });
  var issueKeyInput = document.getElementById('issueKeyInput');
  if (issueKeyInput)
    issueKeyInput.addEventListener('change', function () {
      var inp = document.getElementById('issueKeyInput');
      selectedIssueKey = inp ? inp.value.trim().toUpperCase() : '';
    });
  var syncBtn = document.getElementById('syncPortalBtn');
  if (syncBtn) syncBtn.addEventListener('click', exportProjectsSnapshot);
  var runBtn = document.getElementById('runReviewBtn');
  if (runBtn) runBtn.addEventListener('click', runReview);

  var probeBtn = document.getElementById('probeBtn');
  if (probeBtn)
    probeBtn.addEventListener('click', function () {
      var pre = document.getElementById('probeResult');
      if (pre) {
        pre.style.display = 'block';
        pre.textContent = 'Checking…';
      }
      fetch(SERVICE_URL + '/api/health/probes')
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (x) {
          if (pre) pre.textContent = JSON.stringify(x.j, null, 2);
          if (x.j && x.j.jira && x.j.jira.ok && x.j.llm && x.j.llm.ok) {
            showToast('Jira and LLM reachable from the service.', 'success');
          } else {
            showToast('One or both probes failed. See details below.', 'error');
          }
        })
        .catch(function () {
          if (pre)
            pre.textContent =
              'Could not reach ' + SERVICE_URL + '. Start the service with npm start in the service folder.';
          showToast('Analysis service not running or blocked.', 'error');
        });
    });

  if (PAGE === 'review') {
    fillProjectSelect();
  }

  if (PAGE === 'history') {
    loadHistory();
  }

  if (PAGE === 'chat') {
    var chatOutput = document.getElementById('chatOutput');
    var form = document.getElementById('chatForm');
    var input = document.getElementById('userInput');
    var sendBtn = document.getElementById('sendBtn');

    function appendChat(role, html) {
      if (!chatOutput) return;
      var div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerHTML = html;
      chatOutput.appendChild(div);
      chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    if (chatOutput && form && input && sendBtn) {
      appendChat(
        'assistant',
        window.HKMA_getDemoMode && window.HKMA_getDemoMode()
          ? '<strong>Client demo mode</strong> — replies are generated in the browser. With demo off and the Node service running, chat streams from your configured LLM.'
          : 'Chat is available here if you connect an LLM in <code>service/.env</code>. The structured review is on the <a href="llm-analysis-review.html">New review</a> page.'
      );

      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var text = input.value.trim();
        if (!text) return;
        input.value = '';
        sendBtn.disabled = true;
        appendChat('user', esc(text).replace(/\n/g, '<br/>'));
        messages.push({ role: 'user', content: text });
        var asstDiv = document.createElement('div');
        asstDiv.className = 'message assistant';
        asstDiv.innerHTML = '<i>Thinking…</i>';
        chatOutput.appendChild(asstDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
        try {
          var response = await fetch(SERVICE_URL + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages }),
          });
          if (!response.ok) throw new Error('Backend status ' + response.status);
          asstDiv.innerHTML = '';
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var botContent = '';
          while (true) {
            var chunk = await reader.read();
            if (chunk.done) break;
            botContent += decoder.decode(chunk.value, { stream: true });
            var formatted =
              esc(botContent)
                .replace(/```(?:[a-z]*)\n([\s\S]*?)```/g, function (_, code) {
                  return '<pre class="code">' + code + '</pre>';
                })
                .replace(/\n/g, '<br/>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            asstDiv.innerHTML = formatted;
            chatOutput.scrollTop = chatOutput.scrollHeight;
          }
          messages.push({ role: 'assistant', content: botContent });
        } catch (err) {
          asstDiv.innerHTML = '<span style="color:var(--danger)">' + esc(err.message) + '</span>';
        } finally {
          sendBtn.disabled = false;
          input.focus();
        }
      });
    }
  }
})();
