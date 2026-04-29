# Phase 5 — JIRA Integration, Live ARB Linking & LLM Hardening
## Implementation Plan

> **Purpose:** This document captures every outstanding change for Phase 5: (1) what was built in Phases 3 & 4,
> (2) remaining gaps in the LLM and JIRA poller, and (3) live JIRA project fetching in the portal plus automatic
> ARB ticket updates when artefacts are linked to a project.

### Where work happens (April 2026)

| Environment | Role |
|---|---|
| **Primary workstation** (e.g. canvas / draw.io fork in this repo) | Phases 3–4 UI: architecture sidebar, portal (`projects.html`), optional local `service/` for stub-only checks. |
| **Other internal device** | **Primary place to develop, configure, and test** JIRA + LLM integration: real `service/.env`, corporate JIRA and LLM endpoints, cron poller, and all Part B–D backend changes. That machine must be able to reach JIRA and the LLM API over the internal network (VPN as required). |

**Why split:** JIRA tokens, LLM keys, and HKMA network routes are often only valid from an approved internal host. Keep secrets on that device; do not commit `.env`.

**Integration contract between machines**

1. **Portal → service URL** — `projects.html` resolves the analysis service (e.g. `getServiceUrl()` or equivalent). On the workstation, point that base URL at the internal device’s reachable address (e.g. `https://analysis-internal.hkma.local:3001` or SSH tunnel). If the URL is wrong, the portal still works offline; JIRA search and ARB updates simply degrade (Part H).
2. **CORS** — If the portal is opened from a different origin than the service (e.g. file://, `localhost`, or Vercel), ensure `service/server.js` allows the portal origin in CORS for `GET/POST` on `/api/*` (add only hosts you trust).
3. **Repo sync** — Track Phase 5 code in `dev` (or your release branch) and pull on the internal device before testing; or push from the internal device back to GitHub so CI and the workstation stay aligned.

**Keeping this plan up to date** — When you finish a gap (B1–B7, C*, D*), tick it in your tracker and optionally add a one-line “Done — commit `abc1234`” note under that subsection so the next reader sees reality vs plan.

---

## Part A — What was built in Phases 3 & 4 (for reference)

### Phase 3 — Canvas architecture tooling

| Deliverable | Location |
|---|---|
| Schema-driven shape library (Zones, Components, Categories) | `src/main/webapp/js/diagramly/Sidebar-Architecture.js` |
| Architecture Catalog dialog (CRUD for zones / components / styles / firewall rules) | `src/main/webapp/js/diagramly/Dialogs.js` — `ArchitectureCatalogDialog` |
| Validation Rules dialog — form-based (rule ID, effect, severity, priority, from/to category chips, zone chips, violation message) | `Dialogs.js` — `ValidationRulesDialog` |
| Validation engine — edge rules + containment rules, merge with per-diagram overrides | `src/main/webapp/js/diagramly/SchemaRegistry.js`, `ValidationEngine.js` |
| Firewall extractor — walks edges, applies firewall rule chain, emits JSON rows | `src/main/webapp/js/diagramly/FirewallExtractor.js` |
| File menu entries — Export Diagram, Extract Firewall Requests JSON, Extract Firewall Analysis JSON, Architecture Admin, Projects Portal | `Menus.js` (File menu section) |
| View menu entries — Validation Rules, Run Validation Self-Test, Architecture Admin | `Menus.js` (View menu section) |
| Validation Self-Test — runs canonical fixture checks against the rule engine | `Dialogs.js` — `ValidationSelfTestDialog` |
| Per-diagram schema overrides — persisted to `localStorage` **and** `.drawio` page attribute `archSchemaOverrides` | `SchemaRegistry.js` — `mergeById` + tombstone pattern |

### Phase 4 — Projects Portal + backend service

| Deliverable | Location |
|---|---|
| Projects Portal (`projects.html`) — create/edit/delete/search/filter projects | `src/main/webapp/projects.html` + inline JS |
| Per-card file linking — `.drawio` diagram and firewall-requests JSON | Portal inline JS |
| Open-in-canvas integration — writes XML to `localStorage` draft, canvas auto-loads | Portal inline JS + canvas draft loader |
| Export Snapshot — downloads JSON + `POST /api/projects/sync` | Portal inline JS |
| Run Analysis button — `POST /api/run` | Portal inline JS |
| Per-card analysis panel — reads from `GET /api/analysis/:projectId` | Portal inline JS |
| Backend service (`service/`) — Express server, cron poller, JIRA client, LLM client, project correlator, analysis engine, result store | `service/server.js` and supporting modules |
| Stub mode — JIRA and LLM both fall back to fixture data when `.env` values are absent | `service/config.js` — `stubMode` flags |
| JIRA comment posting — optional, controlled by `POST_JIRA_COMMENTS=true` | `service/lib/analysisEngine.js` — `formatJiraComment` |

---

## Part B — Outstanding gaps in the JIRA poller and LLM integration

These are the items that are either incomplete, hardcoded/stubbed, or need hardening before production use.
**Verify fixes on the internal device** with live JIRA and LLM (see *Where work happens*); use stub mode on the workstation for UI-only iteration when the service URL is not pointed at a configured host.

### B1 — JIRA client: single project key limitation

**Current state:**
`service/config.js` reads a single `JIRA_FIREWALL_PROJECT_KEY` (default `FWREQ`). The JQL in
`jiraClient.getFirewallIssues()` queries one project at a time:
```js
const jql = `project = "${config.jira.projectKey}" AND issuetype = "Firewall Request" AND status != Done ...`;
```

**Problem:** HKMA has multiple JIRA projects (CSP, COREBANK, STAFFPORTAL, …) — the poller misses any
firewall request not filed in the single configured project.

**Fix needed:**
- Change `JIRA_FIREWALL_PROJECT_KEY` to accept a comma-separated list **or** remove the project filter
  entirely so the JQL queries all projects:
  ```
  issuetype = "Firewall Request" AND status != Done ORDER BY created DESC
  ```
- Update `config.js` to parse a `JIRA_FIREWALL_JQL` env var so ops can override the full query.

---

### B2 — Schema rules not passed to the LLM

**Current state:**
`service/lib/analysisEngine.js` line 43:
```js
schemaRules: {},   // TODO: load schema when service has access to architecture.schema.json
```

**Problem:** The LLM receives no base schema rules, so it cannot reason about standard deny/allow patterns
unless the matched firewall row carries that context.

**Fix needed:**
- Copy (or symlink) `src/main/webapp/schemas/architecture.schema.json` into `service/data/` at build/deploy
  time **or** expose it via a `GET /api/schema` endpoint in the web server.
- In `analysisEngine.buildContext`, read and attach `schemaRules.edgeRules` and
  `schemaRules.firewallRules.rules` to the LLM context payload.

---

### B3 — LLM prompt is undocumented and untyped

**Current state:**
`llmClient.analyseFirewallRequest` posts the entire `context` object as the HTTP body. There is no
documented prompt template; the LLM is expected to interpret raw JSON.

**Fix needed:**
- Add a `service/prompts/firewall-analysis.prompt.txt` template that wraps the JSON context into a clear
  natural-language prompt (role, task, output format).
- Inject the rendered prompt as a `prompt` field in the POST body alongside the raw context.
- Add a `LLM_PROMPT_PATH` config option so the prompt can be swapped without code changes.

---

### B4 — No retry / back-off on LLM failures

**Current state:**
`llmClient` catches errors and falls back to stub — permanently. A transient LLM timeout silently
produces stub output labelled `[LLM UNAVAILABLE — STUB FALLBACK]`.

**Fix needed:**
- Add a simple retry loop (3 attempts, exponential back-off: 2 s, 4 s, 8 s) before falling back to stub.
- Emit a `llmError` flag in the result record so the portal can surface a warning badge rather than showing
  stub output as real analysis.

---

### B5 — JIRA correlator: reverse fuzzy match is too loose

**Current state:**
`projectCorrelator.matchIssueToProject` strategy 2:
```js
jiraProjectName.includes(p.name.toLowerCase())
```
This matches "CSP Phase 2" portal project against any JIRA issue whose project name contains "csp phase 2"
— but will also false-match "Phase 2 CSP Testing" or similar.

**Fix needed:**
- Tighten the fuzzy rule: prefer Jaro-Winkler or token-set-ratio similarity > 0.8 (a lightweight
  `fast-fuzzy` or `fuse.js` package).
- Add a third matching strategy: check if `issue.key` prefix (the JIRA project key) appears as a substring
  of `project.code` (handles `FWREQ-101` → project code `CSP-FW`).

---

### B6 — Cron schedule is fixed at 08:00 daily; no on-demand trigger from portal

**Current state:**
`POLL_CRON` defaults to `0 8 * * *`. The portal's **▶ Run Analysis** button calls `POST /api/run` which
fires `runPoll()`, but there is no rate-limiting or cooldown — if a user clicks it twice in quick succession,
the second call is silently skipped (`_running` guard) with no feedback to the caller.

**Fix needed:**
- Return `{ skipped: true, reason: "already running" }` in the HTTP 200 from `POST /api/run` so the
  portal can display "Analysis already running…" instead of silently doing nothing.
- Add a `GET /api/status` endpoint exposing `{ running, lastRun, nextRun, stubMode }` so the portal
  can show a live status pill in the header.

---

### B7 — No `.env.example` committed to the repo

**Fix needed:**
Create `service/.env.example`:
```
# JIRA connection
JIRA_URL=https://your-org.atlassian.net
JIRA_USER=your-email@hkma.gov.hk
JIRA_TOKEN=your-api-token

# Optional: override the default firewall JQL
# JIRA_FIREWALL_JQL=issuetype = "Firewall Request" AND status != Done ORDER BY created DESC

# LLM endpoint
LLM_URL=https://your-llm-endpoint/v1/chat/completions
LLM_API_KEY=your-api-key

# Optional
POST_JIRA_COMMENTS=false
POLL_CRON=0 8 * * *
SERVICE_PORT=3001
```

---

## Part C — Live JIRA project fetching in the Projects Portal

**Goal:** Instead of BTG admins manually entering a project code that must exactly match a JIRA project key,
the portal offers a smart search box that queries JIRA directly, and lets the admin pick an ARB/project from
the results.

### C1 — New backend endpoint: `GET /api/jira/projects`

Add to `service/routes/jiraRoutes.js` (new file):

```js
// GET /api/jira/projects?q=CSP
// Returns JIRA projects whose key or name contains the query string.
router.get('/jira/projects', async (req, res) => {
  const q = (req.query.q || '').trim();
  // Calls JIRA /rest/api/2/project/search?query=<q>&maxResults=20
  // In stub mode: returns the three fixture project keys derived from jira-issues.fixture.json
});

// GET /api/jira/issues?projectKey=CSP&type=Firewall+Request
// Returns open issues for a given project (for preview in the portal).
router.get('/jira/issues', async (req, res) => { ... });
```

Mount in `server.js`:
```js
const jiraRoutes = require('./routes/jiraRoutes');
app.use('/api', jiraRoutes);
```

---

### C2 — Portal UI: JIRA project search field

**In `projects.html`, inside the "New / Edit Project" modal:**

Replace the plain text **Project Code** input with a combo field:

```
[ 🔍 Search JIRA projects... ]   ← type to query GET /api/jira/projects?q=<text>
                                      shows dropdown: "CSP — CSP Phase 2 API Programme"
                                                       "COREBANK — Core Banking Modernisation"
```

On selecting a result:
- Auto-fill **Project Code** with the JIRA project key (e.g. `CSP`).
- Auto-fill **Project Name** if the field is blank.
- Store the full JIRA project object (key, name, JIRA URL to the project) on the portal record.

**Graceful degradation:** if the service is offline, the field falls back to a plain text input (current
behaviour), so the portal works with no backend running.

---

### C3 — ARB ticket smart search

Some projects are tracked as **ARB (Architecture Review Board) tickets** in JIRA rather than as project
keys.  The portal should also allow an admin to link a specific JIRA ticket (e.g. `ARB-2024-031`) to a
project.

**In the modal, add an "ARB Ticket" field:**

```
[ 🔍 Search ARB tickets... ]   ← queries GET /api/jira/issues?projectKey=ARB&type=Architecture+Review
                                    shows: "ARB-2024-031 — CSP Phase 2 Architecture Review"
                                            "ARB-2024-045 — Core Banking Cloud Migration"
```

On selecting a result:
- Store `arbJiraKey` (e.g. `ARB-2024-031`) and `arbJiraUrl` on the portal project record.
- Display the ARB ticket as a clickable badge on the project card: `🏛 ARB-2024-031 ↗`.

**New endpoint needed:**
```
GET /api/jira/arb?q=<text>
// Searches issuetype = "Architecture Review" AND summary ~ "<text>"
// Returns key, summary, status, URL
```

---

## Part D — Automatic diagram & firewall JSON links written to the ARB ticket

**Goal:** When an architect links a `.drawio` file or firewall JSON to a project in the portal, the system
automatically adds a reference to the ARB ticket in JIRA so reviewers can find the artefacts without
asking for them.

### D1 — Trigger point

The update should fire when:
1. An admin clicks **🔗 Link Diagram** and a file is accepted, **OR**
2. An admin clicks **📜 Link Firewall JSON** and a file is accepted.

Both currently happen client-side (in `projects.html`). The portal will call a new service endpoint to
post the update.

### D2 — New service endpoint: `POST /api/jira/arb-update`

```
POST /api/jira/arb-update
Body: {
  arbJiraKey:       "ARB-2024-031",
  projectName:      "CSP Phase 2",
  drawioFileName:   "csp-phase2.drawio",        // or null if not updated
  firewallFileName: "csp-phase2-fw.json",       // or null if not updated
  updatedAt:        "2026-04-27T08:30:00.000Z"
}
```

The endpoint calls `jiraClient.updateArbTicket(...)` which:

1. **Searches for the ARB ticket** — calls `GET /rest/api/2/issue/<arbJiraKey>` to confirm it exists.
2. **Builds a description append block:**
   ```
   ----
   *Architecture Artefacts (auto-updated by HKMA Draw.io Portal)*
   • Diagram file: {{csp-phase2.drawio}}   (linked 27 Apr 2026)
   • Firewall requests JSON: {{csp-phase2-fw.json}}   (linked 27 Apr 2026)
   ----
   ```
3. **Appends (or replaces the existing block) in the JIRA ticket description** using
   `PUT /rest/api/2/issue/<key>` with the updated description body.
4. **Optionally posts a comment** (if `POST_JIRA_COMMENTS=true`):
   > *Diagram and firewall request artefacts have been linked to project "CSP Phase 2" in the HKMA
   > Architecture Review Portal by [BTG admin name].*

**Stub mode:** logs the would-be comment text to the console instead of calling JIRA.

---

### D3 — Portal changes

In `projects.html`, after a successful `linkDiagram` or `linkFirewallJson` operation, add:

```js
async function notifyArbTicket(project, updatePayload) {
  if (!project.arbJiraKey) return;          // no ARB linked → skip
  const serviceUrl = getServiceUrl();
  await fetch(`${serviceUrl}/api/jira/arb-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      arbJiraKey:       project.arbJiraKey,
      projectName:      project.name,
      ...updatePayload,
      updatedAt:        new Date().toISOString(),
    }),
  });
}
```

Show a toast on success: *"ARB-2024-031 updated in JIRA ✓"* and on failure: *"Could not update ARB ticket
(service offline)"* — non-blocking.

---

### D4 — New `jiraClient` function: `updateArbTicket`

Add to `service/clients/jiraClient.js`:

```js
/**
 * Append diagram/firewall artefact references to a JIRA ARB ticket description.
 */
async function updateArbTicket({ arbJiraKey, projectName, drawioFileName, firewallFileName, updatedAt }) {
  if (config.jira.stubMode) {
    console.log(`[jiraClient] STUB — would update ARB ticket ${arbJiraKey} with artefact links`);
    return { stubbed: true };
  }

  // 1. Fetch current description
  const issue = await axios.get(`${config.jira.url}/rest/api/2/issue/${arbJiraKey}`, { auth: ... });
  const currentDesc = issue.data.fields.description || '';

  // 2. Build artefact block
  const block = buildArtefactBlock(projectName, drawioFileName, firewallFileName, updatedAt);

  // 3. Replace existing block or append
  const MARKER = '----\n*Architecture Artefacts';
  const newDesc = currentDesc.includes(MARKER)
    ? currentDesc.replace(/----\n\*Architecture Artefacts[\s\S]*?----/, block)
    : `${currentDesc}\n\n${block}`;

  // 4. Update description
  await axios.put(`${config.jira.url}/rest/api/2/issue/${arbJiraKey}`, {
    fields: { description: newDesc }
  }, { auth: ... });

  return { updated: true, arbJiraKey };
}
```

---

## Part E — File storage: diagrams linked to projects are kept locally but referenced in JIRA

**Current behaviour:**
- Diagrams are stored in browser `localStorage` (in-memory; cleared on browser reset).
- There is no server-side copy.

**Desired behaviour:**
- Diagrams remain primarily local (architect's machine / browser).
- When a BTG admin links one to a portal project **and** that project has an ARB ticket, the file's name
  and link are written to the ARB ticket description automatically (Part D above).
- The portal project record should also store a `drawioFileHash` (SHA-256 of the file content) so
  future links to the same content can be detected and the ARB ticket update skipped if nothing changed.

**What NOT to do (out of scope for Phase 5):**
- Do **not** upload diagram files to JIRA as attachments in Phase 5 — the diagrams may contain sensitive
  architectural details and upload permissions need separate sign-off.

---

## Part F — Summary of all new/changed files

| File | Change type | Description |
|---|---|---|
| `service/config.js` | Modify | Add `JIRA_FIREWALL_JQL` env var; parse multi-value project key; add `arbProject` config |
| `service/.env.example` | **New** | Document all env vars with comments |
| `service/clients/jiraClient.js` | Modify | Add `searchProjects(q)`, `searchArbIssues(q)`, `getIssue(key)`, `updateArbTicket(...)` functions; expand `getFirewallIssues` to use custom JQL |
| `service/clients/llmClient.js` | Modify | Add retry loop (3× with back-off); add `llmError` flag to result; load prompt template |
| `service/prompts/firewall-analysis.prompt.txt` | **New** | Natural-language prompt template wrapping the context JSON |
| `service/lib/projectCorrelator.js` | Modify | Tighten fuzzy match; add third strategy (key prefix match) |
| `service/lib/analysisEngine.js` | Modify | Load and attach `architecture.schema.json` to LLM context (`schemaRules` field) |
| `service/jobs/firewallPoller.js` | Modify | Return `{ skipped, reason }` on duplicate trigger; expose `nextRun` in `getStatus()` |
| `service/routes/jiraRoutes.js` | **New** | `GET /api/jira/projects`, `GET /api/jira/issues`, `GET /api/jira/arb`, `POST /api/jira/arb-update` |
| `service/routes/analysisRoutes.js` | Modify | `GET /api/status` endpoint; surface `skipped` in `POST /api/run` response |
| `service/server.js` | Modify | Mount `jiraRoutes`; update startup banner with new endpoints |
| `service/data/architecture.schema.json` | **New** (copy) | Copy from `src/main/webapp/schemas/architecture.schema.json` at deploy time |
| `src/main/webapp/projects.html` | Modify | JIRA project search combo; ARB ticket field + search; `notifyArbTicket()` on link; `GET /api/status` status pill in header |

---

## Part G — Suggested implementation order

Order assumes **backend-heavy steps on the internal device** (JIRA/LLM live) and **portal UI** on either machine, with the browser pointed at a service URL that hits the internal device.

```
Step 1  B7   — Add .env.example (5 min, prerequisite for everything else) — any machine; commit to repo
Step 2  B1   — Fix JQL / multi-project config (30 min) — internal device + real JIRA
Step 3  B6   — Return skipped/status from poller (30 min) — internal device; verify with GET /api/status
Step 4  C1   — Add jiraRoutes.js (GET /api/jira/projects + GET /api/jira/arb) (1–2 h) — internal device
Step 5  C2   — Portal JIRA search combo in modal (2–3 h) — workstation; test against internal service URL
Step 6  C3   — Portal ARB ticket field in modal (1–2 h) — workstation; test against internal service URL
Step 7  D2   — POST /api/jira/arb-update endpoint (2 h) — internal device
Step 8  D3+D4 — Portal notifyArbTicket() + jiraClient.updateArbTicket() (2 h) — split: portal JS vs jiraClient
Step 9  B2   — Attach schema rules to LLM context (1 h) — internal device (schema file on same host as service)
Step 10 B3   — Add prompt template (1 h) — internal device
Step 11 B4   — LLM retry loop (1 h) — internal device (exercise real LLM timeouts/429s)
Step 12 B5   — Tighten project correlator fuzzy match (1 h) — internal device with fixture + real issue samples
```

**Total estimated effort:** ~2 days of focused development (add buffer for internal network / token approval on first connect).

**Smoke checklist on the internal device (before signing off Phase 5)**

1. `GET /api/status` returns expected `stubMode`, `lastRun`, and not stuck `running: true` after a poll completes.  
2. `POST /api/run` with poller idle returns success; second concurrent call returns `skipped` with reason (B6).  
3. One real firewall issue row: LLM path returns non-stub JSON **or** explicit `llmError` after retries (B4).  
4. JQL returns issues from more than one JIRA project when configured (B1).  
5. From the workstation browser: portal modal JIRA search returns rows when service URL points at internal device (C2).

---

## Part H — Stub / offline behaviour for each new feature

| Feature | Stub behaviour when service offline |
|---|---|
| JIRA project search combo | Falls back to plain text input; no dropdown shown |
| ARB ticket search | Falls back to plain text input |
| ARB ticket auto-update on link | Toast: *"ARB update skipped — service offline"*; link still saved locally |
| `GET /api/status` | Portal header shows grey "service offline" pill |
| Schema rules in LLM context | Empty `schemaRules: {}` (current behaviour) — graceful degradation |
| LLM retry | After 3 failures, falls back to stub with `llmError: true` flag |

---

> **Note for the implementing developer:** All Phase 5 changes are purely additive. No existing Phase 3 or
> Phase 4 behaviour is removed or broken. The portal continues to work fully offline (with no service
> running) for all its current features; Phase 5 capabilities are progressive enhancements that surface
> when the service is available and configured.

Implement and **integration-test** JIRA + LLM behaviour on the **internal device** where credentials and
network policy are valid; use the primary workstation for canvas/portal UI and point its service base URL
at that internal host (or tunnel) for end-to-end checks. Update this document’s gap sections when items
ship so the plan stays the single source of truth for Phase 5 scope.
