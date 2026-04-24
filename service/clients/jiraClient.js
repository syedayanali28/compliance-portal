'use strict';

const axios  = require('axios');
const path   = require('path');
const config = require('../config');

const FIXTURE_PATH = path.join(__dirname, '../fixtures/jira-issues.fixture.json');

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

  const jql = `project = "${config.jira.projectKey}" AND issuetype = "Firewall Request" AND status != Done ORDER BY created DESC`;
  const url  = `${config.jira.url}/rest/api/2/search`;

  try {
    const response = await axios.get(url, {
      params: { jql, maxResults: 100, fields: '*all' },
      auth:   { username: config.jira.user, password: config.jira.token },
      headers: { 'Accept': 'application/json' },
    });
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
      {
        auth:    { username: config.jira.user, password: config.jira.token },
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      }
    );
    console.log(`[jiraClient] Posted comment ${response.data.id} to ${issueKey}`);
    return response.data;
  } catch (err) {
    console.error(`[jiraClient] Failed to post comment to ${issueKey}:`, err.message);
    throw err;
  }
}

module.exports = { getFirewallIssues, postComment };
