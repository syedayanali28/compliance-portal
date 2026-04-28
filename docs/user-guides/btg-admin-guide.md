# BTG Admin Guide — Projects Portal

> **Audience:** BTG admins who consolidate architecture diagrams and firewall requests across multiple project teams, link them to portal records, trigger LLM analysis, and prepare them for security review.

## 1. What you can do as a BTG admin

| Capability | Where |
|---|---|
| Create / edit / archive projects | Projects Portal — main grid |
| Assign team and people to a project | Project edit modal |
| Link a `.drawio` architecture diagram to a project | Per-card "Link Diagram" button |
| Link a firewall-requests JSON to a project | Per-card "Link Firewall JSON" button |
| Open a linked diagram in the canvas (read or edit) | Per-card "▶ Open in Canvas" |
| Inspect linked firewall JSON in a new tab | Per-card "▶ View JSON" |
| Trigger JIRA + LLM firewall analysis | Header "▶ Run Analysis" |
| Push the projects snapshot to the analysis service | Header "📤 Export Snapshot" |
| Review per-project LLM analysis results | Card "Analysis" panel |

## 2. Open the portal

Navigate to **<http://localhost:8080/projects.html>**.

You'll see a dark-themed dashboard with three regions:

* **Header** — title, navigation back to the canvas, snapshot/analysis buttons, "+ New Project".
* **Toolbar** — search field, status filter, team filter.
* **Grid** — one card per project.

> Tip: All portal data is stored in your browser's `localStorage` (key: `hkma.projects`). Export the snapshot regularly so the backend service can correlate JIRA issues to your projects.

## 3. Create a new project

1. Click **+ New Project** in the header.
2. Fill in the modal:
   * **Project Name** *(required)* — e.g. `CSP Phase 2`
   * **Project Code** — short code matching your JIRA project key (e.g. `CSP`). This is what the analysis service uses to match JIRA issues to your project.
   * **Owning Team** — AS1, AS2, ITIS, ITDP, ITPSO, BTG, BSA, ITS, Other.
   * **Status** — Active / On Hold / Archived.
   * **People Assigned** — comma-separated names.
   * **Description** — free text.
3. Click **Save Project**.

The new card appears in the grid. Cards are sorted by status (Active → On Hold → Archived) and then by creation time, newest first.

## 4. Link diagrams and firewall requests

Each card has two link buttons:

### 4.1 Link Diagram

1. Ask the architect to send you the `.drawio` file (see the [Architect Guide](./architect-guide.md)).
2. On the project card, click **🔗 Link Diagram**.
3. The OS file picker opens — choose the `.drawio` file.
4. The card now shows a green strip with the filename, link timestamp, and three actions:
   * **▶ Open in Canvas** — opens the diagram in a new tab. The portal writes the XML to a temporary `localStorage` draft key and the canvas auto-loads it.
   * **⬇ Download .drawio** — re-download the linked file.
   * **✕** — unlink (does *not* delete the file from disk).

### 4.2 Link Firewall JSON

1. Ask the architect to export the firewall-requests JSON (Extras → Architecture → **Extract Firewall Requests JSON**).
2. Click **📜 Link Firewall JSON**.
3. Choose the `.json` file. Invalid JSON is rejected with a toast.
4. The card now shows a second green strip with:
   * **▶ View JSON** — opens the JSON formatted in a new browser tab.
   * **⬇ Download .json**
   * **✕** — unlink.

> A project can have either or both linked. The analysis service uses the firewall JSON to match each JIRA issue to a specific firewall row and provide better LLM context.

## 5. Edit, search, filter

* **Edit** button on a card → re-opens the modal with the current values.
* **Delete** button → confirmation dialog, then removes the project (also clears its linked files from `localStorage`).
* **Search bar** matches name, code, team, members and description.
* **Status filter** and **Team filter** dropdowns narrow the grid.

The count label on the right of the toolbar shows `X of Y projects` when filters are active.

## 6. Run LLM firewall analysis

The Projects Portal can talk to a Node.js backend service that polls JIRA for open firewall-request tickets, correlates them to your projects, and runs an LLM analysis.

### 6.1 Prerequisites

```bash
cd service
copy .env.example .env     # fill in JIRA_URL / LLM_URL on the target device
npm install
npm start                  # listens on http://localhost:3001
```

If `JIRA_URL` or `LLM_URL` is left blank, the service runs in **stub mode** with three sample fixture issues — useful for demos.

### 6.2 Export the projects snapshot

The analysis service needs to read your projects to correlate JIRA issues. To push your portal data to the service:

1. Click **📤 Export Snapshot** in the header.
2. The portal:
   * Downloads `projects-snapshot.json` to your Downloads folder (a backup).
   * `POST`s the same payload to `http://localhost:3001/api/projects/sync`.
3. A toast confirms the result. If the service is offline, the snapshot still downloads — you can drop it into `service/data/projects-snapshot.json` manually.

> Re-export every time you add a new project or update an existing project's code.

### 6.3 Trigger the analysis

1. Click **▶ Run Analysis** in the header.
2. The portal calls `POST /api/run`, which:
   * Fetches open firewall-request issues from JIRA (or fixture issues in stub mode).
   * Matches each issue to a project by JIRA project key (exact) or project name (fuzzy).
   * Calls the LLM (or returns a deterministic stub) for each issue.
   * Writes results to `service/data/analysis-results.json` (upsert by JIRA key).
3. After ~4 seconds the per-card analysis panels refresh.

### 6.4 Read the analysis on each card

The bottom strip of every project card shows the latest analysis results for that project:

| Indicator | Meaning |
|---|---|
| ✓ **Approved** (green) | LLM thinks this firewall request matches an explicit schema rule and is likely to be approved. |
| ⚠ **Clarification** (amber) | Validation rule violation detected — needs reviewer attention. |
| ↻ **Pending** (blue) | No specific schema rule matched; default firewall behaviour was applied. Manual review recommended. |

If the service is offline, you'll see *"Analysis service offline — start `service/` to enable."*

## 7. Common workflows

### Workflow A — receive a new diagram from an architect

1. Architect sends you `csp-phase2.drawio` and `csp-phase2-firewall-requests.json`.
2. In the portal, find the project (or create it if new).
3. Click **🔗 Link Diagram** → pick the `.drawio` file.
4. Click **📜 Link Firewall JSON** → pick the JSON.
5. Click **▶ Open in Canvas** to do a quick sanity check — verify zones, components and connections look right.
6. Click **📤 Export Snapshot** to push the new project metadata to the analysis service.
7. Click **▶ Run Analysis** to trigger JIRA poll + LLM analysis.
8. Review the per-card analysis panel after ~4 seconds.

### Workflow B — daily review

1. Open the portal in the morning.
2. The analysis panels auto-load from the service.
3. Filter by status `Active` to focus on in-flight projects.
4. For each card showing **⚠ Clarification**, click **▶ View JSON** on the firewall row to inspect the request, then click through to JIRA to comment / escalate.

### Workflow C — onboard a new BTG admin

1. Send them this guide.
2. Walk them through creating a sandbox project.
3. Show them how to link a sample `.drawio` (the architect can produce one in 5 minutes from the canvas).
4. Have them trigger Run Analysis in stub mode to see the full feedback loop.

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Card analysis panel shows "offline" | Service not running | `cd service && npm start` |
| Linked diagram opens an empty canvas | The `localStorage` draft key was already consumed by another tab | Click "Open in Canvas" again |
| File picker rejects the firewall JSON | Malformed JSON | Re-export from the architect's canvas (Extras → Architecture → Extract Firewall Requests JSON) |
| "Run Analysis" button stays grey | The `POST /api/run` call failed — service is down or CORS blocked | Check the service terminal log |
| Cards don't appear after creating a project | localStorage write blocked | Check browser settings (private mode often blocks `localStorage`) |

## 9. Where data lives

| Data | Location |
|---|---|
| Project records | Browser `localStorage`: key `hkma.projects` |
| Linked diagram XML | Same `localStorage` record (per-project field `diagramXml`) |
| Linked firewall (IdaC) | Same `localStorage` record (`firewallIdacXlsxBase64` + filename; rules JSON is not stored) |
| Open-in-canvas drafts (transient) | `localStorage`: keys starting with `hkma.opendraft.` |
| Projects snapshot consumed by service | `service/data/projects-snapshot.json` |
| Analysis results | `service/data/analysis-results.json` |
| Per-page schema overrides (set in the canvas) | Both `localStorage` (`hkma.schema.<pageId>`) **and** the `.drawio` file's page attribute |

## 10. Next steps

* Read the [Screenshots Walkthrough](./screenshots-walkthrough.md) for visuals of every step in this guide.
* If you also need to author or fix diagrams yourself, read the [Architect Guide](./architect-guide.md).
