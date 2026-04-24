'use strict';

require('dotenv').config();

const config = {
  jira: {
    url:         process.env.JIRA_URL   || '',
    user:        process.env.JIRA_USER  || '',
    token:       process.env.JIRA_TOKEN || '',
    projectKey:  process.env.JIRA_FIREWALL_PROJECT_KEY || 'FWREQ',
    stubMode:    !process.env.JIRA_URL,
  },
  llm: {
    url:         process.env.LLM_URL     || '',
    apiKey:      process.env.LLM_API_KEY || '',
    stubMode:    !process.env.LLM_URL,
  },
  poll: {
    cron:             process.env.POLL_CRON         || '0 8 * * *',
    postJiraComments: process.env.POST_JIRA_COMMENTS === 'true',
  },
  service: {
    port: parseInt(process.env.SERVICE_PORT || '3001', 10),
  },
};

module.exports = config;
