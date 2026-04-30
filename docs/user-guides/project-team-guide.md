# Project Team Guide: Designing on the Architecture Canvas

**Audience:** Members of delivery and project teams who model solution designs on the HKMA extended draw.io canvas using approved infrastructure patterns.

**Outcome:** A diagram and IdaC firewall workbook you can hand to BTG for linkage in the **Projects Portal** and for review using JIRA and LLM workflows.

## 1. What project teams do here

| Activity | Where |
|---|---|
| Model environments using HKMA zones and components | Canvas left sidebar under **Architecture** |
| Connect applications and services with validated edges | Canvas drawing surface |
| Review effective rules for your organisation and diagram | **Firewall Rules Panel** in the browser |
| Override schema for a single diagram when permitted | **File** menu then **Architecture Admin** on the canvas |
| Export the native diagram file | **File** then **Export Diagram** as `.drawio` |
| Export firewall inputs in IdaC layout | **File** then **Export firewall** using the IdaC template |
| Save ongoing work | **File** then **Save** or **Save As** |

## 2. How this maps to HKMA IT infrastructure

The shape library reflects approved network and platform zones such as OA environments, DMZs, landing zones, data platforms, Kubernetes clusters, and supporting categories for databases, integration, security, and related services. Components carry identifiers that drive validation and firewall inference.

Organisation-wide firewall precedence and validation rules are curated in the **Firewall Rules Panel**. Those settings merge with the baseline schema before any diagram-specific edits you save inside the `.drawio` file.

## 3. Open the canvas

Open the canvas at the HTTPS URL where `index.html` is published (for example `https://portal.example.org/index.html`), or use the entry point your IT service supplies for the same deployment.

Use the menubar shortcuts to open **Firewall Rules Panel**, **Projects Portal**, or **LLM Analysis** in another tab when your role requires them. Daily modelling work stays in the main canvas tab.

## 4. Architecture library

The left sidebar exposes **Architecture** palettes:

* **Architecture Zones** lists HKMA zone containers. Expand the section, then drag a zone onto the page.
* **Architecture Components** lists application and platform shapes grouped by category. Drag a component into a zone so it nests correctly.

**To build a diagram**

1. Place zones first.
2. Drop components inside the owning zone.
3. Draw connectors between components. The editor applies validation rules from the effective schema.

Zones and components include metadata the firewalls exporter reads later, so keep labels legible and placement consistent with your security zone model.

## 5. Organisation rules and the Firewall Rules Panel

Open **Firewall Rules Panel** from the top strip on the canvas. There you can inspect and, if your role allows, edit the shared firewall chain and validation tabs for connection rules and placement rules. Saved changes apply locally in the browser and refresh other open diagram tabs.

If you only need a one-off exception for your diagram, use **File** then **Architecture Admin** after your process approves it. That dialog manages zones, components, categories, and styles scoped to the current page and persists into the `.drawio` file when you save.

## 6. Validation behaviour

The effective rule set combines the baseline schema, organisation overrides from the **Firewall Rules Panel**, and any per-diagram overrides you saved.

When you export firewall rows, the extractor runs the same validation engine. Violations may block export until you confirm you still want to proceed, or you resolve the underlying rule breach. Severity levels in rule definitions indicate whether an issue is an error, warning, or informational note.

Use validation outputs to correct placements and connections before handoff so reviewers see a clean package.

## 7. Export the IdaC firewall workbook

1. Finish the diagram to the level your governance step requires.
2. Choose **File** then **Export firewall** using the IdaC template. The preview shows counts and validation messages.
3. Download the generated `.xlsx` file.

That workbook accompanies the `.drawio` file when BTG links both artefacts to a portal project.

## 8. Save the diagram

Choose **File** then **Save** or **Save As**. The native format remains draw.io XML with your overrides embedded so the file reopens with the same schema extensions.

## 9. Handoff checklist

Before sending materials to BTG:

* Zones contain the intended component categories only.
* Connectors respect cross-zone guidance from your security architect.
* Validation shows no unresolved **Error** severities unless you have written approval.
* Project exceptions documented in **Architecture Admin** or in the **Firewall Rules Panel** match your change record.
* You deliver both the `.drawio` file and the IdaC `.xlsx` export.
* File names include the project code or another agreed label so BTG can match portal records quickly.

## 10. Where your edits are stored

| Item | Storage |
|---|---|
| Diagram content and per-page schema overrides | The `.drawio` file and supporting browser storage until saved |
| Organisation rule changes | Browser storage keys your platform team documents for the **Firewall Rules Panel** |
| Baseline schema | Shipped with the application. Only configuration teams change it through release management |

## 11. Common issues

| Symptom | What to try |
|---|---|
| Missing **Architecture** palettes | Hard refresh the page. Ask IT to confirm the deployment includes architecture extensions. |
| Styles look wrong | Verify the component category still matches an approved style reference in **Architecture Admin**. |
| Export warns about validation | Read the message list, adjust edges or membership, then export again. |
| **Firewall Rules Panel** does not reflect saved rules | Save again on that page. Confirm browser storage is not blocked by policy. |

## 12. Related guides

* [BTG Admin Guide](./btg-admin-guide.md) for linking files and running analysis.
* [Reviewer Guide](./reviewer-guide.md) for conversational LLM review.
* [Screenshots Walkthrough](./screenshots-walkthrough.md) for labelled figures across portal, canvas, firewall panel, and LLM pages.
