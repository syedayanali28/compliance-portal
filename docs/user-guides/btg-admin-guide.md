# BTG Admin Guide — Projects Portal

> **Audience:** BTG admins who consolidate architecture diagrams and IdaC firewall workbooks across teams, link them to portal records, drive **live JIRA** correlation, run **LLM firewall analysis**, and keep **ARB** tickets in sync with linked artefacts.  
> **Assumption (April 2026):** The analysis service on your **internal device** is fully configured with JIRA and LLM credentials (no stub mode in production). The portal talks to that service over HTTPS (or a tunnel) as described below.

## 1. What you can do as a BTG admin

| Capability | Where |
|---|---|
| Create / edit / archive projects | Projects Portal — main grid |
| **Search and pick a JIRA project** to fill **Project Code** (live) | New / Edit Project modal — **Search JIRA projects** |
| **Search and link an ARB JIRA ticket** to the project | New / Edit Project modal — **Search ARB tickets** |
| Assign team and people to a project | Project edit modal |
| Link a `.drawio` architecture diagram | Per-card **Link Diagram** |
| Link an **IdaC `.xlsx`** workbook (from **File → Export firewall (IdaC template)** on the canvas) | Per-card **Link IdaC workbook** |
| **Auto-update the linked ARB ticket in JIRA** when diagram or IdaC changes | After each successful link (non-blocking toast) |
| Open a linked diagram in the canvas | Per-card **Open in Canvas** |
| Inspect linked IdaC (download / open) | Per-card workbook strip |
| Trigger **JIRA poll + LLM** firewall analysis | Header **Run Analysis** |
| Push the projects snapshot to the analysis service | Header **Export Snapshot** |
| **See service health** (poll schedule, last run, LLM mode) | Header **status pill** (`GET /api/status`) |
| Review per-project LLM analysis results | Card **Analysis** panel |

## 2. Open the portal

Use any of these (same UI):

* **Local:** `http://localhost:8080/projects.html` (or the port your static server uses).
* **Internal / hosted:** your organisation’s draw.io deployment (for example an internal hostname or `*.vercel.app` preview).

### Pointing the portal at the analysis service

The portal script uses a **service base URL** (in code this is `SERVICE_URL`, typically `http://localhost:3001` during development). For production:

1. Run the Node **`service/`** on the **internal device** that can reach JIRA and the LLM API.
2. Set the portal’s base URL to that host (e.g. `https://analysis-internal.example.gov:3001`) — configure in your deployment branch (`projects.html` or build-time injection) so **Export Snapshot**, **Run Analysis**, **JIRA search**, **ARB update**, and **status** all hit the same origin you trust.
3. Ensure **CORS** on the service allows the portal’s origin (`GET`/`POST` on `/api/*`).

> Tip: All portal **project metadata and linked files** stay in the browser (`localStorage`, key `hkma.projects`). Export Snapshot regularly so the service can correlate JIRA issues to projects and ARB keys.

## 3. Create or edit a project

1. Click **+ New Project** (or **Edit** on a card).
2. Fill in the modal:
   * **Project Name** *(required)* — e.g. `CSP Phase 2`
   * **Search JIRA projects** — type part of a key or name; pick a row. **Project Code** fills with the JIRA project key (e.g. `CSP`). If the service is offline, type the code manually.
   * **Search ARB tickets** *(optional)* — find the Architecture Review ticket (e.g. `ARB-2024-031`). The card will show an ARB badge and enable **ARB auto-update** on link.
   * **Owning Team** — AS1, AS2, ITIS, ITDP, ITPSO, BTG, BSA, ITS, Other.
   * **Status** — Active / On Hold / Archived.
   * **People Assigned** — comma-separated names.
   * **Description** — free text.
3. Click **Save Project**.

Cards sort by status (Active → On Hold → Archived), then newest first.

## 4. Link diagrams and IdaC workbook

Each card has two primary link actions:

### 4.1 Link Diagram

1. Ask the architect for the `.drawio` file ([Architect Guide](./architect-guide.md)).
2. Click **Link Diagram** on the card.
3. Choose the file in the OS picker.
4. The card shows a green strip with **Open in Canvas**, **Download .drawio**, and unlink. Open-in-canvas uses a temporary `localStorage` draft; the canvas loads it via `index.html?openDraft=…`.

If an **ARB ticket** is linked on the project, the service receives **`POST /api/jira/arb-update`** (diagram filename and timestamp). Success toast: *ARB-… updated in JIRA*; failure is non-blocking with a clear message.

### 4.2 Link IdaC workbook

1. Ask the architect for the **IdaC `.xlsx`** produced from **File → Export firewall (IdaC template)** (firewall rules JSON is used inside the editor for extraction; the **stored** artefact for the portal is the workbook).
2. Click **Link IdaC workbook**.
3. Select the `.xlsx`. Invalid files are rejected with a toast.
4. The card shows a second strip with open/download/unlink for the workbook.

> The analysis service uses project metadata, diagram filename, and IdaC filename for correlation and LLM context. Re-run **Export Snapshot** after material changes.

## 5. Edit, search, filter

* **Edit** on a card → modal with current values (including JIRA/ARB fields).
* **Delete** → confirmation, then remove the project and its linked blobs from `localStorage`.
* **Search bar** — name, code, team, members, description.
* **Status** and **Team** filters — narrow the grid.

The toolbar count shows `X of Y projects` when filters apply.

## 6. JIRA poll and LLM analysis (production)

The analysis service:

1. **Polls JIRA** on the configured schedule for open **Firewall Request** issues (JQL configurable; multi-project supported).
2. **Correlates** each issue to a portal project (project key, tightened fuzzy name match, optional code hints).
3. **Builds LLM context** including architecture **schema rules** loaded from `service/data/architecture.schema.json` (or API).
4. **Calls the LLM** using the documented prompt template, with **retries and back-off** on transient failures; surfaces **`llmError`** when analysis could not complete (so you do not mistake a failure for a real “Approved” stub).
5. **Persists** results for `GET /api/analysis/:projectId`.

### 6.1 Prerequisites (internal device)

```bash
cd service
copy .env.example .env    # JIRA_URL, JIRA_USER, JIRA_TOKEN, LLM_URL, LLM_API_KEY, optional JIRA_FIREWALL_JQL
npm install
npm start                   # listens on SERVICE_PORT (default 3001)
```

Production: **do not** leave `JIRA_URL` or `LLM_URL` blank (that is **stub mode**, three fixture issues — useful only for demos on a laptop).

### 6.2 Export Snapshot

1. Click **Export Snapshot**.
2. The portal downloads `projects-snapshot.json` and **POST**s the payload to `{SERVICE_URL}/api/projects/sync`.
3. A toast confirms. If the service is offline, the file still downloads — you can manually place it under `service/data/` on the internal host if needed.

Re-export whenever project codes, ARB keys, or membership change materially.

### 6.3 Run Analysis

1. Click **Run Analysis**.
2. The portal calls **`POST /api/run`**. If a poll is already running, the API returns **`{ skipped: true, reason: "…" }`** and the UI can show *Analysis already running…* (no silent second click).
3. When complete, cards refresh from **`GET /api/analysis/:id`**. The header status pill updates **last run / next run**.

### 6.4 Read outcomes on each card

| Indicator | Meaning |
|---|---|
| **Approved** (green) | LLM + schema context indicate the request aligns with allow rules. |
| **Clarification** (amber) | Validation or policy ambiguity — reviewer action. |
| **Pending** (blue) | Default path — manual review. |
| **Warning / LLM error** | LLM unavailable after retries — not a silent stub; retry or check service logs. |

Stub/demo mode still appends a small *(stub)* hint on timestamps when enabled.

## 7. Common workflows

### Workflow A — new architecture package from an architect

1. Receive `csp-phase2.drawio` and `csp-phase2-…-idac.xlsx`.
2. Create or open the project; use **JIRA search** to bind **CSP** and optional **ARB-…**.
3. **Link Diagram** and **Link IdaC workbook**.
4. Confirm ARB toast (JIRA updated).
5. **Open in Canvas** for a quick sanity check.
6. **Export Snapshot** → **Run Analysis** → review the analysis strip.

### Workflow B — daily triage

1. Open the portal; confirm the header **status** is **Online**.
2. Filter **Active** projects.
3. For each **Clarification** row, open JIRA from the issue key, inspect the IdaC row, add comments as needed.

### Workflow C — onboard a new BTG admin

1. Share this guide and the [Screenshots Walkthrough](./screenshots-walkthrough.md).
2. Walk through a sandbox project with **stub mode** on a laptop (optional).
3. Repeat on the **internal device** with read-only JIRA and a single test issue before turning on comment posting (`POST_JIRA_COMMENTS`).

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Header shows **offline** | Service down, wrong `SERVICE_URL`, or network | Start `service/`; fix URL / VPN / CORS |
| JIRA search dropdown empty | Auth failure or JIRA API blocked | Check `.env` token and enterprise firewall |
| **Run Analysis** appears to do nothing | Second click while poll running | Read toast / status pill for **skipped** |
| Analysis text shows **LLM error** | Endpoint timeout or 429 after retries | Check LLM quota and logs; retry |
| ARB update toast failed | `arbJiraKey` invalid or JIRA permission | Verify ticket exists; check write scope |
| Linked diagram opens empty canvas | Draft key consumed | Click **Open in Canvas** again |
| IdaC link rejected | Wrong file type or corrupt xlsx | Re-export IdaC template from canvas |
| No cards after save | `localStorage` blocked | Browser privacy settings |

## 9. Where data lives

Field names for **ARB / JIRA search** follow your shipped `projects.html` and `ProjectStore.js` once those properties are added; until then, treat ARB and JIRA picker rows as described in [Phase 5 implementation plan](../PHASE5-IMPLEMENTATION-PLAN.md).

| Data | Location |
|---|---|
| Project records | Browser `localStorage`: key `hkma.projects` |
| Linked diagram XML | Same record (`diagramXml`, etc.) |
| Linked IdaC workbook | Same record (`firewallIdacXlsxBase64`, filename, timestamps) |
| ARB / JIRA linkage | On project record (keys such as `arbJiraKey` / `arbJiraUrl` when the modal ships them) |
| Open-in-canvas drafts (transient) | `localStorage`: keys `hkma.opendraft.*` |
| Snapshot on server | `service/data/projects-snapshot.json` |
| Analysis results | `service/data/analysis-results.json` |
| Per-page schema overrides (canvas) | `localStorage` + `.drawio` page attribute |

## 10. Next steps

* [Screenshots Walkthrough](./screenshots-walkthrough.md) — visuals for portal and canvas, including **29–31** for integrated JIRA/LLM UI.
* [Architect Guide](./architect-guide.md) — diagram and IdaC export for architects.
* [Phase 5 implementation plan](../PHASE5-IMPLEMENTATION-PLAN.md) — engineering backlog and endpoint checklist (for developers).
