# HKMA Architecture Review: User Guides

This folder contains end-user documentation for the HKMA architecture diagramming and firewall review tooling. It extends draw.io for structured zones, validation, IdaC firewall export, portal linkage, and LLM assisted review.

## Who should read what

| If you are… | Read this guide |
|---|---|
| **A BTG admin** managing projects and consolidating artefacts | [BTG Admin Guide](./btg-admin-guide.md) |
| **On a project or delivery team** modelling designs on the canvas with HKMA patterns | [Project Team Guide](./project-team-guide.md) |
| **A reviewer** using the Reviewer workspace for Jira-backed validity analysis and optional assistant chat | [Reviewer Guide](./reviewer-guide.md) |
| Anyone wanting a **visual tour** of the main screens | [Screenshots Walkthrough](./screenshots-walkthrough.md) |

## What is this system?

A draw.io-based architecture editor with:

1. **Schema-driven libraries** for HKMA zones and components.
2. **Validation** for connections and placement using shared and diagram-specific rules.
3. **Firewall export** to an IdaC template workbook from validated diagrams.
4. **Projects Portal** for BTG to register projects and link `.drawio` and IdaC workbook files.
5. **Reviewer workspace** for firewall reviewers to search Jira, sync portal data to the service, run validity analysis, and browse completed reviews, plus optional assistant chat.
6. **Analysis service** that correlates Jira work, runs LLM review, and serves `/api` for the portal and Reviewer workspace.

## Getting access

**Static web UI.** End users open the editor and portal wherever your organisation publishes the front-end build, for example:

* Canvas: `https://portal.example.org/index.html`
* Projects Portal: `https://portal.example.org/projects.html`
* The same host normally serves **Firewall Rules Panel** and **Reviewer workspace** under their usual paths. Replace `portal.example.org` with your real hostname.

**Analysis service on your infrastructure.** The Node **service** runs on a server or container your operations team controls, at an HTTPS base URL that can reach Jira and the LLM API. When you publish the web assets, configure the portal and Reviewer workspace scripts so every `fetch` uses that analysis base URL. The browser then calls your API host from each user session.

**CORS.** The analysis service must allow the static web UI’s origin on the `/api` routes the portal and chat page use.

**Local development:** run the web app from a static server and point the client at `http://localhost:3001` (or another local port) while iterating.

## Folder layout

```
docs/user-guides/
├── README.md
├── btg-admin-guide.md
├── project-team-guide.md
├── reviewer-guide.md
├── screenshots-walkthrough.md
└── screenshots/
```
