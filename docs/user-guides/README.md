# HKMA Architecture Review — User Guides

This folder contains end-user documentation for the HKMA architecture diagramming and firewall-review tooling, an extension of draw.io tailored to BTG's review workflow.

## Who should read what

| If you are… | Read this guide |
|---|---|
| **A BTG admin** managing projects and consolidating diagrams + firewall requests for review | [BTG Admin Guide](./btg-admin-guide.md) |
| **An architect or solution designer** who creates the architecture diagrams and produces firewall-request exports | [Architect Guide](./architect-guide.md) |
| Anyone who wants a **visual walkthrough** of the system end-to-end | [Screenshots Walkthrough](./screenshots-walkthrough.md) |

## What is this system?

A draw.io-based architecture diagramming tool, extended with:

1. **Schema-driven shape library** — predefined zones, component categories and styles aligned with HKMA's network architecture (OA, IDMZ, K8s, AWS Landing Zone, etc.).
2. **Validation rules** — declarative deny/allow rules that flag invalid connections or misplacements as you draw.
3. **Firewall request extractor** — automatically infers firewall requirements (intra-host, intra-zone, cross-zone) from a diagram and exports them as structured JSON.
4. **Projects Portal** — a standalone admin page (`projects.html`) where BTG admins create projects, link the architect's `.drawio` and firewall-request JSON files, and trigger LLM-assisted review.
5. **Backend analysis service** (`service/`) — Node.js poller that reads JIRA firewall-request tickets, correlates them to portal projects, runs an LLM analysis, and feeds the results back into the portal.

## Getting access

* **Canvas:** open <http://localhost:8080/index.html>
* **Projects Portal:** open <http://localhost:8080/projects.html>
* **Analysis Service:** runs on <http://localhost:3001> (start with `cd service && npm start`)

## Folder layout

```
docs/user-guides/
├── README.md                       ← this file
├── btg-admin-guide.md              ← BTG admin workflow
├── architect-guide.md              ← architect / designer workflow
├── screenshots-walkthrough.md      ← visual end-to-end tour
└── screenshots/                    ← all PNGs referenced from the walkthrough
```
