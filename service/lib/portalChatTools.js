'use strict';

const fs   = require('fs');
const path = require('path');
const { tool } = require('ai');
const { z }    = require('zod');

const {
  readProjectsSnapshot,
  getDiagramArtefact,
} = require('./resultStore');

const MAX_DIAGRAM_CHARS = 150000;

const DEMO_CSP_DRAWIO = path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'main',
  'webapp',
  'demo',
  'csp-architecture-2.drawio'
);

function normalise(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve a project from the portal snapshot (id, code, or fuzzy name match).
 * @param {string} projectCode
 * @param {string} [projectId]
 * @returns {object|null}
 */
function findProjectInSnapshot(projectCode, projectId) {
  const projects = readProjectsSnapshot();
  const codeN = normalise(projectCode);
  const idN   = normalise(projectId);

  if (idN) {
    const byId = projects.find((p) => normalise(p.id) === idN);
    if (byId) return byId;
  }
  if (codeN) {
    const byCode = projects.find((p) => normalise(p.code) === codeN);
    if (byCode) return byCode;
    const byName = projects.find((p) => normalise(p.name) === codeN);
    if (byName) return byName;
  }
  return null;
}

/**
 * Build tools for the portal LLM chat. Extend this object to register Jira / Confluence / firewall JSON tools later.
 * @returns {Record<string, ReturnType<typeof tool>>}
 */
function buildPortalChatTools() {
  return {
    getProjectDiagram: tool({
      description:
        'Load the draw.io (mxGraph) XML for a project. Pass projectCode (e.g. CSP) and optionally projectId (UUID from the portal). Uses diagrams pushed from the Projects Portal (Export Snapshot) or a built-in CSP demo file.',
      parameters: z.object({
        projectCode: z
          .string()
          .describe('Project code or exact project name, e.g. CSP'),
        projectId: z
          .string()
          .optional()
          .describe('Optional portal project id (UUID) for disambiguation'),
      }),
      execute: async ({ projectCode, projectId }) => {
        const project = findProjectInSnapshot(projectCode, projectId);
        const artefact = project
          ? getDiagramArtefact(project.id)
          : getDiagramArtefact(null, projectCode);

        let xml = artefact && artefact.diagramXml;
        let source = 'portal-artefacts';

        if (!xml && project && project.diagramXml) {
          xml = project.diagramXml;
          source = 'projects-snapshot';
        }

        if (!xml && normalise(projectCode) === 'csp' && fs.existsSync(DEMO_CSP_DRAWIO)) {
          xml = fs.readFileSync(DEMO_CSP_DRAWIO, 'utf8');
          source = 'bundled-demo-csp';
        }

        if (!xml) {
          return (
            `No diagram is available for "${projectCode}". ` +
            'Link a .drawio file in the Projects Portal and use Export Snapshot so the analysis service receives diagram artefacts.'
          );
        }

        let truncated = false;
        if (xml.length > MAX_DIAGRAM_CHARS) {
          xml = xml.slice(0, MAX_DIAGRAM_CHARS);
          truncated = true;
        }

        return {
          projectCode: project ? project.code : projectCode,
          projectId: project ? project.id : null,
          diagramFilename: (artefact && artefact.diagramFilename) || (project && project.diagramFilename) || null,
          source,
          truncated,
          xml,
        };
      },
    }),

    getJiraContent: tool({
      description:
        'Placeholder: fetch Jira issue or project content. Implement in a future iteration.',
      parameters: z.object({ jiraKey: z.string() }),
      execute: async () =>
        'Jira tool not wired yet. When available, this will return issue descriptions and firewall request links.',
    }),

    getFirewallRules: tool({
      description:
        'Placeholder: fetch parsed firewall / IdaC rules for a project. Implement in a future iteration.',
      parameters: z.object({ projectCode: z.string() }),
      execute: async () =>
        'Firewall rules JSON tool not wired yet. When available, this will return normalised rows from the linked IdaC workbook.',
    }),

    getConfluenceContent: tool({
      description:
        'Placeholder: fetch Confluence pages related to a project. Implement in a future iteration.',
      parameters: z.object({ projectCode: z.string() }),
      execute: async () =>
        'Confluence tool not wired yet. When available, this will return page excerpts linked to the project.',
    }),
  };
}

module.exports = { buildPortalChatTools, findProjectInSnapshot };
