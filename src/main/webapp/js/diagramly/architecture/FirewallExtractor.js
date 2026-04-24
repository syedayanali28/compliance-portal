/**
 * Architecture firewall-request extractor.
 *
 * Walks every edge in the current diagram whose both endpoints are
 * component cells (not zone containers), determines whether a firewall
 * rule is required using the schema's firewallRules block, runs the
 * existing ArchitectureValidationEngine edge-rule check, and returns a
 * structured JSON object suitable for download or preview.
 */
(function()
{
	if (window.ArchitectureFirewallExtractor != null)
	{
		return;
	}

	var CONTAINER_TYPES = ['zone'];

	// ── helpers ───────────────────────────────────────────────────────────

	function getAttr(cell, name)
	{
		if (cell == null)
		{
			return null;
		}

		var val = cell.getAttribute(name);

		return (val != null && val !== '') ? val : null;
	}

	function cellLabel(cell)
	{
		if (cell == null)
		{
			return null;
		}

		var lbl = getAttr(cell, 'label');

		if (lbl != null)
		{
			return lbl;
		}

		var val = cell.value;

		if (val != null && typeof val === 'object' && val.getAttribute != null)
		{
			lbl = val.getAttribute('label');

			if (lbl != null && lbl !== '')
			{
				return lbl;
			}
		}

		if (typeof val === 'string' && val !== '')
		{
			return val;
		}

		return cell.id || null;
	}

	/**
	 * Returns true if the cell is a drawn component node (has archComponentId
	 * set and is NOT a zone container).
	 */
	function isComponentCell(cell)
	{
		if (cell == null || !cell.vertex)
		{
			return false;
		}

		var componentId = getAttr(cell, 'archComponentId');

		if (componentId == null)
		{
			return false;
		}

		var containerType = getAttr(cell, 'archContainerType');

		return CONTAINER_TYPES.indexOf(containerType) === -1;
	}

	/**
	 * Walks upward from cell through parent chain until a cell with
	 * archContainerType === 'zone' is found.  Returns { id, label } or null.
	 */
	function resolveZone(graph, cell)
	{
		var current = cell;

		while (current != null)
		{
			var containerType = getAttr(current, 'archContainerType');

			if (containerType === 'zone')
			{
				return {
					id:    getAttr(current, 'archZoneId') || current.id,
					label: cellLabel(current) || getAttr(current, 'archZoneId') || current.id
				};
			}

			var zoneId = getAttr(current, 'archZoneId');

			if (zoneId != null && containerType == null)
			{
				return {
					id:    zoneId,
					label: cellLabel(current) || zoneId
				};
			}

			current = graph.model.getParent(current);

			if (current == null || current === graph.model.root)
			{
				break;
			}
		}

		return null;
	}

	/**
	 * Reads protocol/port from edge attributes, then source/target, then defaults.
	 */
	function resolveProtocolPorts(edge, sourceCell, targetCell)
	{
		var protocol = getAttr(edge, 'Protocol') || getAttr(edge, 'protocol');
		var ports    = getAttr(edge, 'Port')     || getAttr(edge, 'port') || getAttr(edge, 'ports');

		if (protocol == null)
		{
			protocol = getAttr(sourceCell, 'Protocol') || getAttr(sourceCell, 'protocol') ||
			           getAttr(targetCell, 'Protocol') || getAttr(targetCell, 'protocol');
		}

		if (ports == null)
		{
			ports = getAttr(sourceCell, 'Port') || getAttr(sourceCell, 'port') || getAttr(sourceCell, 'ports') ||
			        getAttr(targetCell, 'Port') || getAttr(targetCell, 'port') || getAttr(targetCell, 'ports');
		}

		return {
			protocol: protocol || 'HTTPS',
			ports:    ports    || '443'
		};
	}

	// ── firewall rule evaluation ──────────────────────────────────────────

	function isArray(v)
	{
		return Object.prototype.toString.call(v) === '[object Array]';
	}

	function matchValue(ruleVal, actual)
	{
		if (ruleVal == null)
		{
			return true;
		}

		var values = isArray(ruleVal) ? ruleVal : [ruleVal];

		for (var i = 0; i < values.length; i++)
		{
			if (values[i] === '*' || values[i] === 'any')
			{
				return true;
			}

			if (String(values[i]) === String(actual))
			{
				return true;
			}
		}

		return false;
	}

	/**
	 * ctx: {
	 *   sameParent: bool,
	 *   sameZone: bool,
	 *   sourceZoneId: string|null,
	 *   destZoneId: string|null,
	 *   sourceCategory: string|null,
	 *   destCategory: string|null,
	 *   sourceComponentId: string|null,
	 *   destComponentId: string|null
	 * }
	 *
	 * Returns { required, firewallType, provider, reason, appliedRuleIds }
	 */
	function determineFirewallRequirement(firewallRules, ctx)
	{
		firewallRules = firewallRules || {};
		var rules     = (firewallRules.rules || []).slice();
		var dflt      = firewallRules.default || { required: true, firewallType: 'physical', provider: 'NSX' };

		rules.sort(function(a, b)
		{
			var pa = (a.priority != null) ? Number(a.priority) : 0;
			var pb = (b.priority != null) ? Number(b.priority) : 0;

			return pb - pa;
		});

		for (var i = 0; i < rules.length; i++)
		{
			var rule = rules[i];

			if (rule == null || rule.enabled === false)
			{
				continue;
			}

			var when = rule.when || {};

			// sameParent check
			if (when.sameParent != null && when.sameParent !== ctx.sameParent)
			{
				continue;
			}

			// sameZone check
			if (when.sameZone != null && when.sameZone !== ctx.sameZone)
			{
				continue;
			}

			// zoneId check — matches either source or dest zone
			if (when.zoneId != null)
			{
				var zoneMatch = matchValue(when.zoneId, ctx.sourceZoneId) ||
				                matchValue(when.zoneId, ctx.destZoneId);

				if (!zoneMatch)
				{
					continue;
				}
			}

			// fromCategory / toCategory / fromComponentId / toComponentId
			if (when.fromCategory != null && !matchValue(when.fromCategory, ctx.sourceCategory))
			{
				continue;
			}

			if (when.toCategory != null && !matchValue(when.toCategory, ctx.destCategory))
			{
				continue;
			}

			if (when.fromComponentId != null && !matchValue(when.fromComponentId, ctx.sourceComponentId))
			{
				continue;
			}

			if (when.toComponentId != null && !matchValue(when.toComponentId, ctx.destComponentId))
			{
				continue;
			}

			// Rule matched
			var eff = rule.effect || {};

			return {
				required:     eff.required !== false,
				firewallType: eff.firewallType || dflt.firewallType || 'physical',
				provider:     eff.provider     || dflt.provider     || 'NSX',
				reason:       eff.reason       || null,
				appliedRuleIds: [rule.id]
			};
		}

		// No rule matched — use default
		return {
			required:      dflt.required !== false,
			firewallType:  dflt.firewallType || 'physical',
			provider:      dflt.provider     || 'NSX',
			reason:        'Default firewall policy applied (no specific rule matched).',
			appliedRuleIds: ['__default__']
		};
	}

	// ── diagram JSON builder ──────────────────────────────────────────────

	function buildDiagramJson(graph, schema, diagramTitle)
	{
		var model    = graph.model;
		var nodes    = [];
		var edges    = [];
		var allCells = model.cells || {};

		for (var id in allCells)
		{
			if (!allCells.hasOwnProperty(id))
			{
				continue;
			}

			var cell = allCells[id];

			if (cell == null || cell === model.root)
			{
				continue;
			}

			if (cell.vertex)
			{
				var nodeObj = {
					id:     cell.id,
					label:  cellLabel(cell),
					parent: (cell.parent && cell.parent !== model.root) ? cell.parent.id : null
				};

				var geo = cell.geometry;

				if (geo != null)
				{
					nodeObj.geometry = { x: geo.x, y: geo.y, width: geo.width, height: geo.height };
				}

				// Collect all arch attributes
				var attrs = ['archZoneId', 'archContainerType', 'archComponentId', 'archCategory'];

				for (var a = 0; a < attrs.length; a++)
				{
					var attrVal = getAttr(cell, attrs[a]);

					if (attrVal != null)
					{
						nodeObj[attrs[a]] = attrVal;
					}
				}

				nodes.push(nodeObj);
			}
			else if (cell.edge)
			{
				var src = cell.source;
				var tgt = cell.target;

				var edgeObj = {
					id:       cell.id,
					label:    cellLabel(cell),
					source:   src ? src.id : null,
					target:   tgt ? tgt.id : null,
					protocol: getAttr(cell, 'Protocol') || getAttr(cell, 'protocol') || null,
					port:     getAttr(cell, 'Port')     || getAttr(cell, 'port')     || null
				};

				edges.push(edgeObj);
			}
		}

		return {
			generatedAt:   new Date().toISOString(),
			schemaVersion: (schema && schema.meta && schema.meta.version) || null,
			diagramTitle:  diagramTitle || 'Untitled',
			nodes:         nodes,
			edges:         edges
		};
	}

	// ── main extractor ────────────────────────────────────────────────────

	function extract(graph, schema)
	{
		var model         = graph.model;
		var firewallRules = (schema != null) ? schema.firewallRules : null;
		var edgeRules     = (schema != null && schema.rules != null) ? schema.rules : null;
		var allCells      = model.cells || {};

		var diagramTitle = null;

		try
		{
			if (graph.container != null)
			{
				var titleEl = document.title;

				if (titleEl)
				{
					diagramTitle = titleEl;
				}
			}
		}
		catch (e) { /* ignore */ }

		var rows             = [];
		var validationPassed = 0;
		var validationFailed = 0;
		var validationViolations = [];

		for (var id in allCells)
		{
			if (!allCells.hasOwnProperty(id))
			{
				continue;
			}

			var cell = allCells[id];

			if (cell == null || !cell.edge)
			{
				continue;
			}

			var sourceCell = cell.source;
			var targetCell = cell.target;

			if (sourceCell == null || targetCell == null)
			{
				continue;
			}

			if (!isComponentCell(sourceCell) || !isComponentCell(targetCell))
			{
				continue;
			}

			// Resolve zones
			var sourceZone = resolveZone(graph, sourceCell);
			var destZone   = resolveZone(graph, targetCell);

			var sourceZoneId    = sourceZone ? sourceZone.id    : null;
			var sourceZoneLabel = sourceZone ? sourceZone.label : null;
			var destZoneId      = destZone   ? destZone.id      : null;
			var destZoneLabel   = destZone   ? destZone.label   : null;

			// Determine same-parent
			var srcParent = model.getParent(sourceCell);
			var tgtParent = model.getParent(targetCell);
			var sameParent = (srcParent != null && tgtParent != null && srcParent.id === tgtParent.id);
			var sameZone   = (sourceZoneId != null && sourceZoneId === destZoneId);

			// Firewall classification
			var fwCtx = {
				sameParent:        sameParent,
				sameZone:          sameZone,
				sourceZoneId:      sourceZoneId,
				destZoneId:        destZoneId,
				sourceCategory:    getAttr(sourceCell, 'archCategory'),
				destCategory:      getAttr(targetCell, 'archCategory'),
				sourceComponentId: getAttr(sourceCell, 'archComponentId'),
				destComponentId:   getAttr(targetCell, 'archComponentId')
			};

			var fwResult = determineFirewallRequirement(firewallRules, fwCtx);

			if (!fwResult.required)
			{
				continue;
			}

			// Schema edge-rule validation (re-run on every extraction)
			var validationResult = { allowed: true, violations: [], matchedRules: [] };

			if (window.ArchitectureValidationEngine != null && edgeRules != null)
			{
				validationResult = window.ArchitectureValidationEngine.validateEdge(
					graph, schema, sourceCell, targetCell
				);
			}

			var violationRuleIds = [];

			for (var v = 0; v < (validationResult.violations || []).length; v++)
			{
				var viol = validationResult.violations[v];

				if (viol && viol.id)
				{
					violationRuleIds.push(viol.id);
				}
			}

			if (validationResult.allowed)
			{
				validationPassed++;
			}
			else
			{
				validationFailed++;
				validationViolations.push({
					edgeId:  cell.id,
					ruleIds: violationRuleIds,
					message: validationResult.message || null
				});
			}

			// Protocol/ports
			var pp = resolveProtocolPorts(cell, sourceCell, targetCell);

			// Connection type from edge attribute
			var connectionType = getAttr(cell, 'connectionType') || 'firewall-request';

			rows.push({
				sourceZoneId:         sourceZoneId,
				sourceZoneLabel:      sourceZoneLabel,
				sourceComponentId:    getAttr(sourceCell, 'archComponentId'),
				sourceComponentLabel: cellLabel(sourceCell),
				sourceCategory:       getAttr(sourceCell, 'archCategory'),
				destZoneId:           destZoneId,
				destZoneLabel:        destZoneLabel,
				destComponentId:      getAttr(targetCell, 'archComponentId'),
				destComponentLabel:   cellLabel(targetCell),
				destCategory:         getAttr(targetCell, 'archCategory'),
				firewallType:         fwResult.firewallType,
				provider:             fwResult.provider,
				firewallRuleReason:   fwResult.reason,
				protocol:             pp.protocol,
				ports:                pp.ports,
				direction:            'Outbound',
				connectionType:       connectionType,
				originalEdgeId:       cell.id,
				appliedRuleIds:       fwResult.appliedRuleIds,
				validation: {
					allowed:          validationResult.allowed,
					violationRuleIds: violationRuleIds,
					message:          validationResult.message || null
				}
			});
		}

		return {
			generatedAt:   new Date().toISOString(),
			schemaVersion: (schema && schema.meta && schema.meta.version) || null,
			diagramTitle:  diagramTitle || 'Untitled',
			schemaValidation: {
				edgesChecked: validationPassed + validationFailed,
				passed:       validationPassed,
				failed:       validationFailed,
				violations:   validationViolations
			},
			rows: rows
		};
	}

	window.ArchitectureFirewallExtractor =
	{
		extract:          extract,
		buildDiagramJson: buildDiagramJson
	};
})();
