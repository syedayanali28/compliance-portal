# Architect Guide — Drawing & Exporting Reviewable Diagrams

> **Audience:** Solution architects and engineers who design HKMA architecture diagrams and produce the `.drawio` + firewall-requests JSON artefacts that BTG admins consume in the Projects Portal.

## 1. What you'll do as an architect

| Task | Where |
|---|---|
| Compose diagrams using HKMA-aligned zones and components | Canvas — left sidebar "Architecture" library |
| Validate diagrams against deny/allow rules | Canvas — Extras → Architecture → Validate Architecture |
| Customise schema for one diagram (zones, components, styles, rules) | Catalog and Validation Rules dialogs |
| Extract firewall requests as JSON | Extras → Architecture → Extract Firewall Requests JSON |
| Save and hand off to BTG | Standard draw.io File → Save / Save As |

## 2. Open the canvas

Navigate to **<http://localhost:8080/index.html>**.

## 3. Use the Architecture sidebar library

The left sidebar contains an **Architecture** group at the top. Expand it to see five sub-sections:

1. **Zones** — large container shapes (swimlanes): OA Baremetal, OA Private Cloud, OA App DMZ, DMZ, AWS Landing Zone, Sources, IDMZ, G-net, ICLNet, Data Platform, K8s Cluster, K8s Namespace, Messaging Infrastructure.
2. **Component Categories** — Database, Backend, Frontend, Integration, Security, Middleware, Storage, Monitoring, External, IAM, Orchestration, AI, CI/CD.
3. **Components** — concrete shapes within each category (PostgreSQL, Kong API Gateway, Kubernetes, etc.).
4. **Validation Rules** — opens the rules dialog (see §6).
5. **Catalog Editor** — opens the schema catalog (see §5).

**To draw a diagram:**

1. Drag a zone onto the canvas.
2. Drag components onto the zone — they automatically become children of the zone (containment).
3. Connect components with edges.

## 4. Run validation as you draw

Open **Extras → Architecture → Validate Architecture**. The validation dialog opens with two tabs:

* **Edge Rules** — flag invalid connections (e.g. *External → Database direct* deny).
* **Containment Rules** — flag invalid placement (e.g. *External components in OA Baremetal* deny).

Each violation lists:

* The rule that fired
* Severity (🔴 Error / 🟡 Warning / 🔵 Info)
* The cells involved (clickable to navigate)
* The rule's user-facing message

> Validations run on the **effective** schema = base schema (`schemas/architecture.schema.json`) merged with per-diagram overrides.

## 5. Customise schema per diagram (Catalog Editor)

Open **Extras → Architecture → Edit Architecture Catalog**.

Tabs:

* **Zones** — add new zone (e.g. *Partner DMZ*), edit a zone's name/description/style, or delete an existing one.
* **Component Categories** — same for categories.
* **Components** — list of named instances within each category.
* **Styles** — raw style strings used to render zones and categories.
* **Firewall Rules** — declarative rules controlling firewall extraction (see §7).

All edits are stored as **overrides** on the current diagram page. They are written to:

1. The `.drawio` file's page attribute `archSchemaOverrides` — so handing off the file preserves your changes.
2. Browser `localStorage` under `hkma.schema.<pageId>` — so changes survive page refresh even before you save.

> The big blue **Save Diagram** button at the bottom of every dialog runs the standard draw.io save action so your overrides are persisted to disk.

## 6. Edit validation rules with the form UI

Open the catalog → **Validation Rules** tab, or **Extras → Architecture → Validation Rules**.

For each rule you can configure:

| Field | Control |
|---|---|
| **Rule ID** | Text input |
| **Enabled** | Checkbox |
| **Effect** | Radio: 🚫 Deny / ✅ Allow |
| **Severity** | Dropdown: 🔴 Error / 🟡 Warning / 🔵 Info |
| **Priority** | Number 1–9999 |
| **From Category / To Category** (edge rules) | Chip-toggle multi-select across all 13 component categories |
| **Same Zone / Cross Zone / Same Parent** (edge rules) | Checkboxes |
| **From Zone / To Zone** (edge rules) | Chip-toggle multi-select of all 13 zones |
| **Component Category / Placed In Zone** (placement rules) | Chip-toggle multi-selects |
| **Violation Message** | Text input |

Click **Save Rule** to write the form back to overrides. The Delete button uses a tombstone (`{id, _delete: true}`) to remove a base-schema rule from this diagram while keeping it in the global schema.

## 7. Extract firewall requests

Once your diagram passes validation, open **Extras → Architecture → Extract Firewall Requests JSON**.

The extractor:

1. Walks every edge in the diagram.
2. Identifies the source and destination components, their categories, and their zones.
3. Applies the firewall rule chain (declared in `firewallRules.rules`, evaluated in priority order):
   * `sameParent: true` → no firewall (intra-host).
   * `sameZone: true` + `zoneId: [...]` → zone-specific virtual firewall (PSO, AWS SG, NSX micro-seg).
   * `sameZone: false` → cross-zone physical NSX (default).
4. Emits a row per edge:

```json
{
  "sourceComponentId": "integration-kong-api-gateway",
  "destComponentId": "backend-ai-portal-bff",
  "sourceZone": "k8s-cluster",
  "destZone": "k8s-cluster",
  "required": true,
  "firewallType": "virtual",
  "provider": "NSX",
  "appliedRuleIds": ["fw-k8s-same-zone"],
  "reason": "Intra Kubernetes cluster/namespace uses virtual NSX micro-segmentation.",
  "validation": { "allowed": true, "violationRuleIds": [] }
}
```

A preview dialog shows the formatted JSON; click **Download** to save `csp-phase2-firewall-requests.json` (or whatever your file is named).

## 8. Validation before download

If you click **Download Firewall Requests** while the diagram has open validation violations, the canvas first asks:

> *"This diagram has 3 validation violation(s). Continue exporting anyway?"*

You can:

* **OK** — export anyway (the violations are tagged in each row's `validation` block).
* **Cancel** — go fix the violations first.

## 9. Save the diagram as `.drawio`

Standard draw.io save: **File → Save** (`Ctrl+S`) or **File → Save As** to choose a path. The file format is native `.drawio` XML — drag-and-drop into any draw.io instance to re-open.

## 10. Hand-off checklist for BTG

Before sending your files to BTG admin, verify:

- [ ] All zones have a clear name and contain only the right component categories.
- [ ] No edge crosses a zone boundary without justification.
- [ ] Validation passes with zero **Error** severities (warnings are acceptable with a note).
- [ ] Firewall rules in the catalog reflect any project-specific exceptions.
- [ ] You produced both files:
  - [ ] `<project>.drawio` — the diagram itself
  - [ ] `<project>-firewall-requests.json` — the firewall extraction
- [ ] File names contain the project code so BTG can match them to the portal record.

## 11. Where data lives

| Data | Location |
|---|---|
| Base schema | `src/main/webapp/schemas/architecture.schema.json` (read-only at runtime) |
| Per-diagram overrides | `localStorage` (`hkma.schema.<pageId>`) **and** the `.drawio` file's page attribute `archSchemaOverrides` |
| Selected validation result | In-memory only — re-runs on every Validate click |

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| A component snaps to the wrong style | Check the catalog `Styles` tab — the component's `category` field must match a `category.<id>` style. |
| Edits to validation rules disappear after refresh | Check the browser console — if `localStorage` writes are blocked (private mode), only the diagram-file save will persist. |
| Firewall extractor produces a row with `provider: "none"` | The pair is intra-host (same parent) — that's expected. |
| Extractor reports "default rule applied" | No declared rule matched — consider adding a project-specific rule in the catalog. |
| Sidebar Architecture section is missing | The page may have failed to load `Sidebar-Architecture.js`. Hard-refresh (Ctrl+F5) and check the browser console. |

## 13. Next steps

* Read the [Screenshots Walkthrough](./screenshots-walkthrough.md) for visual examples of each step.
* When you're ready to hand off, give the BTG admin both files plus a short summary; they'll do the rest in the [Projects Portal](./btg-admin-guide.md).
