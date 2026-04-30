'use strict';

const axios  = require('axios');
const https  = require('https');
const path   = require('path');
const config = require('../config');

const FIXTURE_PATH = path.join(__dirname, '../fixtures/jira-issues.fixture.json');

function jiraAxiosOpts(extra) {
  const opts = Object.assign({}, extra);
  if (config.jira.tlsInsecure) {
    opts.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }
  return opts;
}

function getAuthHeaders() {
  const email = process.env.JIRA_USER_EMAIL || process.env.JIRA_EMAIL || '';
  if (email && config.jira.token) {
    const encoded = Buffer.from(`${email}:${config.jira.token}`).toString('base64');
    return {
      Accept: 'application/json',
      Authorization: `Basic ${encoded}`,
    };
  }
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${config.jira.token}`,
  };
}

/**
 * Fetch all open firewall-request issues from JIRA.
 * Falls back to fixture data when JIRA_URL is not configured.
 *
 * @returns {Promise<Array>} Array of JIRA issue objects
 */
async function getFirewallIssues() {
  if (config.jira.stubMode) {
    console.log('[jiraClient] STUB MODE — returning fixture issues');
    return require(FIXTURE_PATH);
  }

  let jql = config.jira.firewallJql;
  if (!jql) {
    const keys = config.jira.projectKey ? config.jira.projectKey.split(',').map(k => k.trim()).filter(Boolean) : [];
    
    let projectClause = '';
    if (keys.length > 1) {
      projectClause = `project IN (${keys.map(k => `"${k}"`).join(', ')}) AND `;
    } else if (keys.length === 1) {
      projectClause = `project = "${keys[0]}" AND `;
    }
    
    jql = `${projectClause}issuetype = "Firewall Request" AND status != Done ORDER BY created DESC`;
  }
  
  const url  = `${config.jira.url}/rest/api/2/search`;

  try {
    const response = await axios.get(url, jiraAxiosOpts({
      params: { jql, maxResults: 100, fields: '*all' },
      headers: getAuthHeaders(),
    }));
    console.log(`[jiraClient] Fetched ${response.data.issues.length} issues from JIRA`);
    return response.data.issues || [];
  } catch (err) {
    console.error('[jiraClient] Failed to fetch JIRA issues:', err.message);
    throw err;
  }
}

/**
 * Post an analysis comment to a JIRA issue.
 *
 * @param {string} issueKey  e.g. "FWREQ-101"
 * @param {string} body      Comment text (plain or Markdown)
 * @returns {Promise<object>} Created comment object
 */
async function postComment(issueKey, body) {
  if (config.jira.stubMode) {
    console.log(`[jiraClient] STUB MODE — skipping comment post to ${issueKey}`);
    return { id: 'stub-comment-id', body };
  }

  const url = `${config.jira.url}/rest/api/2/issue/${issueKey}/comment`;

  try {
    const response = await axios.post(
      url,
      { body },
      jiraAxiosOpts({
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      })
    );
    console.log(`[jiraClient] Posted comment ${response.data.id} to ${issueKey}`);
    return response.data;
  } catch (err) {
    console.error(`[jiraClient] Failed to post comment to ${issueKey}:`, err.message);
    throw err;
  }
}

async function searchProjects(q) {
  if (config.jira.stubMode) {
    return [
      { key: 'CSP', name: 'CSP Phase 2 API Programme' },
      { key: 'COREBANK', name: 'Core Banking Modernisation' },
      { key: 'STAFFPORTAL', name: 'Staff Intranet Portal' }
    ].filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.key.toLowerCase().includes(q.toLowerCase()));
  }

  const url = `${config.jira.url}/rest/api/2/project/search`;
  const response = await axios.get(url, jiraAxiosOpts({
    params: { query: q, maxResults: 20 },
    headers: getAuthHeaders(),
  }));
  return response.data.values || response.data || [];
}

async function searchArbIssues(q) {
  if (config.jira.stubMode) {
    return [
      { key: 'ARB-2024-031', summary: 'CSP Phase 2 Architecture Review', status: 'Open', url: `${config.jira.url || 'localhost'}/browse/ARB-2024-031` },
      { key: 'ARB-2024-045', summary: 'Core Banking Cloud Migration', status: 'In Review', url: `${config.jira.url || 'localhost'}/browse/ARB-2024-045` }
    ].filter(i => !q || i.summary.toLowerCase().includes(q.toLowerCase()) || i.key.toLowerCase().includes(q.toLowerCase()));
  }

  const jql = `issuetype = "Architecture Review" AND summary ~ "${q}"`;
  const url = `${config.jira.url}/rest/api/2/search`;
  const response = await axios.get(url, jiraAxiosOpts({
    params: { jql, maxResults: 20, fields: 'summary,status' },
    headers: getAuthHeaders(),
  }));
  return (response.data.issues || []).map(i => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
    url: `${config.jira.url}/browse/${i.key}`
  }));
}

async function searchIssues(projectKey, type) {
  if (config.jira.stubMode) {
    return [];
  }

  const jql = `project = "${projectKey}" AND issuetype = "${type}" AND status != Done`;
  const url = `${config.jira.url}/rest/api/2/search`;
  const response = await axios.get(url, jiraAxiosOpts({
    params: { jql, maxResults: 20, fields: 'summary,status' },
    headers: getAuthHeaders(),
  }));
  return response.data.issues || [];
}

const ISSUE_FIELDS =
  'summary,description,status,assignee,reporter,project,priority,created,updated,' +
  'customfield_sourceComponent,customfield_destComponent,customfield_protocol,customfield_port,' +
  'customfield_sourceZone,customfield_destZone';

/**
 * Fetch one issue by key (full fields used by the analysis engine).
 * @param {string} issueKey e.g. FWREQ-101
 * @returns {Promise<object|null>}
 */
async function getIssueByKey(issueKey) {
  const key = (issueKey || '').trim().toUpperCase();
  if (!key) return null;

  if (config.jira.stubMode) {
    const all = require(FIXTURE_PATH);
    const hit = all.find((i) => i.key === key);
    return hit || null;
  }

  const url = `${config.jira.url}/rest/api/2/issue/${encodeURIComponent(key)}`;
  try {
    const response = await axios.get(url, jiraAxiosOpts({
      params: { fields: ISSUE_FIELDS },
      headers: getAuthHeaders(),
    }));
    return { key: response.data.key, fields: response.data.fields };
  } catch (err) {
    console.error(`[jiraClient] getIssueByKey ${key}:`, err.message);
    return null;
  }
}

function issueToSearchHit(issue) {
  if (!issue || !issue.fields) return null;
  return {
    key: issue.key,
    summary: issue.fields.summary || '',
    status: issue.fields.status && issue.fields.status.name,
    jiraUrl: config.jira.url ? `${config.jira.url}/browse/${issue.key}` : null,
    projectKey: issue.fields.project && issue.fields.project.key,
  };
}

/**
 * Search firewall-class issues by key fragment or summary text.
 * @param {string} query
 * @param {number} [maxResults]
 * @returns {Promise<Array<{ key, summary, status, jiraUrl, projectKey }>>}
 */
async function searchFirewallRequests(query, maxResults = 25) {
  const q = (query || '').trim();
  if (!q) return [];

  if (config.jira.stubMode) {
    const all = require(FIXTURE_PATH);
    const lower = q.toLowerCase();
    const keyMatch = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(q);
    return all
      .filter((i) => {
        if (keyMatch) return i.key.toUpperCase() === q.toUpperCase();
        return (
          (i.key && i.key.toLowerCase().includes(lower)) ||
          (i.fields.summary && i.fields.summary.toLowerCase().includes(lower))
        );
      })
      .slice(0, maxResults)
      .map(issueToSearchHit);
  }

  const safe = q.replace(/"/g, '\\"');
  let jql;
  if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(q)) {
    jql = `key = "${safe.toUpperCase()}"`;
  } else {
    const scope =
      config.jira.firewallJql && config.jira.firewallJql.trim()
        ? `(${config.jira.firewallJql.trim()})`
        : 'issuetype = "Firewall Request"';
    jql =
      `${scope} AND (summary ~ "${safe}*" OR text ~ "${safe}*" OR key ~ "${safe}*") ` +
      'ORDER BY updated DESC';
  }

  const url = `${config.jira.url}/rest/api/2/search`;
  const response = await axios.get(url, jiraAxiosOpts({
    params: { jql, maxResults, fields: 'summary,status,project' },
    headers: getAuthHeaders(),
  }));
  const issues = response.data.issues || [];
  return issues
    .map((i) => issueToSearchHit(i))
    .filter(Boolean);
}

function buildArtefactBlock(projectName, drawioFileName, firewallFileName, updatedAt) {
  return `----
*Architecture Artefacts (auto-updated by HKMA Draw.io Portal)*
• Diagram file: {{${drawioFileName || 'None'}}}   (linked ${updatedAt})
• Firewall requests JSON: {{${firewallFileName || 'None'}}}   (linked ${updatedAt})
----`;
}

async function updateArbTicket({ arbJiraKey, projectName, drawioFileName, firewallFileName, updatedAt }) {
  if (config.jira.stubMode) {
    console.log(`[jiraClient] STUB — would update ARB ticket ${arbJiraKey} with artefact links`);
    return { stubbed: true, arbJiraKey };
  }

  // 1. Fetch current description
  const issueResponse = await axios.get(`${config.jira.url}/rest/api/2/issue/${arbJiraKey}`, jiraAxiosOpts({
    headers: getAuthHeaders(),
  }));
  const currentDesc = issueResponse.data.fields.description || '';

  // 2. Build artefact block
  const block = buildArtefactBlock(projectName, drawioFileName, firewallFileName, updatedAt);

  // 3. Replace existing block or append
  const newDesc = currentDesc.includes('----\n*Architecture Artefacts')
    ? currentDesc.replace(/----\n\*Architecture Artefacts[\s\S]*?----/, block)
    : `${currentDesc}\n\n${block}`;

  // 4. Update description
  await axios.put(
    `${config.jira.url}/rest/api/2/issue/${arbJiraKey}`,
    { fields: { description: newDesc } },
    jiraAxiosOpts({ headers: getAuthHeaders() })
  );

  if (config.poll.postJiraComments) {
    await axios.post(
      `${config.jira.url}/rest/api/2/issue/${arbJiraKey}/comment`,
      {
        body: `*Diagram and firewall request artefacts have been linked to project "${projectName}" in the HKMA Architecture Review Portal.*`
      },
      jiraAxiosOpts({ headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
    );
  }

  return { updated: true, arbJiraKey };
}

/**
 * Verify Jira URL and service account token. REST: GET /rest/api/2/myself
 * @returns {Promise<{ ok: boolean, displayName?: string, name?: string, error?: string }>}
 */
async function verifySession() {
  if (config.jira.stubMode) {
    return { ok: false, error: 'JIRA_BASE_URL not set; Jira is in stub mode.' };
  }
  if (!config.jira.token) {
    return { ok: false, error: 'JIRA_SERVICE_ACCOUNT_TOKEN is empty.' };
  }
  const url = `${config.jira.url}/rest/api/2/myself`;
  try {
    const response = await axios.get(url, jiraAxiosOpts({ headers: getAuthHeaders() }));
    return {
      ok: true,
      displayName: response.data.displayName,
      name: response.data.name,
      key: response.data.key,
    };
  } catch (err) {
    const code = err.response && err.response.status;
    const msg = (err.response && err.response.data && err.response.data.message) || err.message;
    return { ok: false, error: code ? `HTTP ${code}: ${msg}` : msg };
  }
}

module.exports = {
  getFirewallIssues,
  postComment,
  searchProjects,
  searchArbIssues,
  searchIssues,
  updateArbTicket,
  getIssueByKey,
  searchFirewallRequests,
  issueToSearchHit,
  verifySession,
};

