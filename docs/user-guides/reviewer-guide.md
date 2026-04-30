# Reviewer Guide: Firewall validity and reviewer workspace

**Audience:** Security reviewers, architecture approvers, and others who validate firewall requests in Jira against design artefacts and supporting links.

**Purpose:** This guide covers the **Reviewer workspace** (overview plus **New review**, **Analysed requests**, and **Assistant chat** pages) for structured firewall reviews, the **Firewall Rules Panel** for organisation-wide rules, and the optional **Assistant chat** host page.

## 1. How this fits the workflow

Project teams publish diagrams and IdaC exports. **BTG** maintains project records in the **Projects Portal** and links the diagram file and firewall workbook to each project.

**Reviewers** work mainly in the **Reviewer workspace**. There you search Jira for a firewall request, add context such as an ARB ticket you confirmed in Jira, run **validity analysis**, and read outcomes with confidence, reasoning, and source links. Completed reviews stay under **Analysed requests** so you do not repeat work without cause.

The analysis **service** must be running and reachable from your browser. It calls Jira and the LLM using credentials on the server. Use **Test Jira and LLM** on the **New review** page to confirm both probes succeed before a heavy review day.

The **Projects Portal** can still show an **Analysis** strip on each project card when the service has results; that view is for visibility. **Triggering** a fresh structured review for a specific ticket happens in the Reviewer workspace.

## 2. Firewall Rules Panel

Reviewers with permission to maintain organisation standards use **Firewall Rules Panel** from the top navigation on **Projects Portal**, **Reviewer workspace**, or the canvas.

**Firewall rules**

Use **Add rule** to create a row. Use **Edit** on a row to open the form. Use **Delete** to remove a row after browser confirmation.

**Validation rules**

Scroll to **Validation rules**. Choose **Connection rules** or **Placement rules**. Use **Add rule**, click a row to edit, or use the delete control with confirmation.

**Save**

Choose **Save changes** in the header to persist updates in this browser and refresh open diagram tabs.

Changes affect all diagrams that load the merged schema. Follow your change-management process for production edits.

Labelled screenshots are in the [Screenshots Walkthrough](./screenshots-walkthrough.md) Part 4.

## 3. Opening the Reviewer workspace

Use the same web host as the canvas and portal. In the top strip, choose **Reviewer workspace** next to **Projects Portal** and **Firewall Rules Panel**. That opens the **Overview** (`llm-analysis.html`) with links to three focused pages:

| Page | File | Purpose |
|------|------|---------|
| **Overview** | `llm-analysis.html` | Hub and short descriptions |
| **New review** | `llm-analysis-review.html` | Connectivity check, Jira search, context, sync, **Run validity analysis**, verdict |
| **Analysed requests** | `llm-analysis-history.html` | Stored reviews by Jira key |
| **Assistant chat** | `llm-analysis-chat.html` | Optional `POST /api/chat` |

Each page repeats the same sticky links so you can move between tasks without in-page hash navigation.

## 4. Connectivity check

Near the top, under **Analysis service connectivity**, choose **Test Jira and LLM**. The browser calls `GET /api/health/probes` on the analysis service. You should see JSON where `jira.ok` and `llm.ok` are both true when Jira credentials and the LLM endpoint work from the machine that runs the service.

If either probe fails, fix VPN, `service/.env`, or TLS settings on the service host before reviewing. From the `service` folder you can also run `npm run test:integrations` for the same checks in the terminal.

## 5. Prerequisites for structured reviews

| Requirement | Why it matters |
|---|---|
| Analysis service online | The UI calls the service for Jira search, snapshots, probes, and analysis |
| Jira reachable with a valid token | Search and ticket load use Jira REST |
| LLM configured on the service | Validity analysis uses the model unless the deployment is in stub mode |
| Portal artefacts for matching | **Sync portal data** pushes project metadata and diagram XML from the **same browser** that has the Projects Portal data so correlation and tools see current files |

BTG keeps portal records current. When they change links, use **Sync portal data** on **New review** so the server copy matches before you run analysis.

## 6. Structured review workflow

**Find the Jira ticket**

Use **Search Jira** with a summary fragment or key fragment, pick a result, or enter an issue key and **Load ticket**. A short preview confirms the ticket.

**Optional context**

* **Portal project override:** choose a project if auto-match from the server snapshot is wrong or stale after BTG edits.
* **ARB ticket key** and optional **URL:** record what you verified in Jira manually. Future releases may automate more lookup.
* **Extra link** label and URL for Confluence or other references.
* **Reviewer notes** for your own audit text. Notes are stored on the saved analysis record.

**Sync**

**Sync portal data** downloads a snapshot JSON and posts project list and diagram artefacts to the analysis service, similar to the older single-purpose export control. Run it when diagram or project linkage changed.

**Run validity analysis**

**Run validity analysis** sends the selected ticket and context to the service. The page shows a **verdict** with a confidence percentage, outcome label, **reasoning** bullets, full **analysis** text, and **source documents** links. The same run is merged into stored results by Jira key.

**History**

Open **Analysed requests** (`llm-analysis-history.html`) from the sticky links. Expand a row to reopen reasoning, narrative, and links. Re-running analysis on the same key updates the stored record.

## 7. Assistant chat

On **Assistant chat** (`llm-analysis-chat.html`), **Assistant chat** is optional. You ask questions in natural language; the service streams answers and may call tools such as **getProjectDiagram** when diagram XML exists in service artefacts after sync.

Chat does not replace the structured review path for a formal verdict on a Jira firewall row. Use it for follow-up questions once probes and sync are healthy.

## 8. Tools available to the assistant today

| Tool | Status | What it does |
|---|---|---|
| **getProjectDiagram** | Active | Loads draw.io XML for a project from analysis service artefacts, with fallbacks described in service code. |

The model is instructed to cite tools and to summarise at an architectural level.

## 9. Tools planned for future releases

Stubs in the service layer may return not-yet-implemented messages until wired.

| Tool | Planned capability |
|---|---|
| **getJiraContent** | Richer Jira field retrieval from chat. |
| **getFirewallRules** | Normalised firewall rows from IdaC after sync. |
| **getConfluenceContent** | Confluence excerpts by reference. |

Until live, verify Jira and wiki facts manually.

## 10. Professional use practices

* Run **Test Jira and LLM** and **Sync portal data** on **New review** when BTG announces artefact updates.
* State project codes and issue keys explicitly so matching stays unambiguous.
* Cross-check firewall conclusions against IdaC, live Jira, and ARB records.
* Do not paste secrets into chat or browser fields your security team forbids.

## 11. If something fails

| Symptom | What to try |
|---|---|
| Probes or chat report backend errors | Confirm the service is up, VPN is on, and `service/.env` has correct Jira and LLM variables. |
| Jira search empty or 401 | Confirm token type. Some setups need `JIRA_USER_EMAIL` with an API token as Basic auth. |
| Analysis lacks diagram context | **Sync portal data** on **New review** from this browser after BTG linked the diagram. |
| ETIMEDOUT to LLM host | Route to internal MaaS must work from the machine running the Node service. |
| Panel changes missing on canvas | **Save changes** on Firewall Rules Panel, then refresh the diagram tab. |

## 12. Related guides

* [BTG Admin Guide](./btg-admin-guide.md) for Projects Portal operations.
* [Project Team Guide](./project-team-guide.md) for diagrams and IdaC exports.
* [Screenshots Walkthrough](./screenshots-walkthrough.md) for labelled figures, including Reviewer workspace and portal.
