/**
 * Architecture validation engine for containment and edge rules.
 */
(function()
{
	if (window.ArchitectureValidationEngine != null)
	{
		return;
	}

	var INVALID_EVENT = 'architectureValidationInvalid';
	var isArray = (typeof Array.isArray === 'function') ?
		Array.isArray :
		function(value)
		{
			return Object.prototype.toString.call(value) === '[object Array]';
		};
	
	if (typeof mxUtils !== 'undefined' && typeof mxUtils.isArray !== 'function')
	{
		mxUtils.isArray = isArray;
	}

	function normalize(value)
	{
		return (value != null) ? String(value) : null;
	}

	function asArray(value)
	{
		if (value == null)
		{
			return [];
		}

		return isArray(value) ? value : [value];
	}

	function hasWildcard(values)
	{
		for (var i = 0; i < values.length; i++)
		{
			if (values[i] === '*' || values[i] === 'any')
			{
				return true;
			}
		}

		return false;
	}

	function matchValue(ruleValues, targetValue)
	{
		var values = asArray(ruleValues);

		if (values.length === 0 || hasWildcard(values))
		{
			return true;
		}

		for (var i = 0; i < values.length; i++)
		{
			if (normalize(values[i]) === normalize(targetValue))
			{
				return true;
			}
		}

		return false;
	}

	function createCellContext(graph, cell)
	{
		if (cell == null)
		{
			return {
				componentId: null,
				category: null,
				zoneId: null
			};
		}

		var componentId = graph.getAttributeForCell(cell, 'archComponentId', null);
		var category = graph.getAttributeForCell(cell, 'archCategory', null);
		var zoneId = graph.getAttributeForCell(cell, 'archZoneId', null);
		var parent = graph.model.getParent(cell);

		while (zoneId == null && parent != null)
		{
			zoneId = graph.getAttributeForCell(parent, 'archZoneId', null);
			parent = graph.model.getParent(parent);
		}

		return {
			componentId: componentId,
			category: category,
			zoneId: zoneId
		};
	}

	function shouldApplyRule(rule)
	{
		return rule != null && rule.enabled !== false;
	}

	function byPriorityDesc(a, b)
	{
		var pa = (a.priority != null) ? Number(a.priority) : 0;
		var pb = (b.priority != null) ? Number(b.priority) : 0;

		return pb - pa;
	}

	function evaluateRuleSet(rules, matchFn, defaultDecision)
	{
		var sorted = (rules || []).slice().sort(byPriorityDesc);
		var matched = [];
		var denies = [];
		var allows = [];

		for (var i = 0; i < sorted.length; i++)
		{
			var rule = sorted[i];

			if (!shouldApplyRule(rule) || !matchFn(rule))
			{
				continue;
			}

			matched.push(rule);

			if (rule.effect === 'deny')
			{
				denies.push(rule);
			}
			else if (rule.effect === 'allow')
			{
				allows.push(rule);
			}
		}

		var allowed = defaultDecision;
		var violations = [];

		if (denies.length > 0)
		{
			allowed = false;
			violations = denies;
		}
		else if (allows.length > 0)
		{
			allowed = true;
		}

		return {
			allowed: allowed,
			matchedRules: matched,
			violations: violations
		};
	}

	function violationMessage(violations)
	{
		if (violations == null || violations.length === 0)
		{
			return null;
		}

		var texts = [];

		for (var i = 0; i < violations.length; i++)
		{
			var rule = violations[i];
			var msg = (rule.message != null && rule.message.length > 0) ?
				rule.message : ('Rule "' + rule.id + '" was violated.');
			texts.push(msg);
		}

		return texts.join('\n');
	}

	function emitInvalid(graph, type, result)
	{
		graph.fireEvent(new mxEventObject(INVALID_EVENT,
			'type', type,
			'violations', result.violations || [],
			'matchedRules', result.matchedRules || []));
	}

	window.ArchitectureValidationEngine =
	{
		eventName: INVALID_EVENT,

		validateContainment: function(graph, schema, componentCell, containerCell)
		{
			var policies = (schema != null && schema.policies != null) ? schema.policies : {};
			var defaultAllow = !(
				policies.containment != null &&
				policies.containment.default === 'deny'
			);
			var rules = (schema != null && schema.rules != null) ?
				(schema.rules.containmentRules || []) : [];

			var comp = createCellContext(graph, componentCell);
			var zoneId = graph.getAttributeForCell(containerCell, 'archZoneId', null);
			var containerType = graph.getAttributeForCell(containerCell, 'archContainerType', null) || 'zone';

			var result = evaluateRuleSet(rules, function(rule)
			{
				var when = rule.when || {};

				return matchValue(when.componentId, comp.componentId) &&
					matchValue(when.componentCategory, comp.category) &&
					matchValue(when.zoneId, zoneId) &&
					matchValue(when.containerType, containerType);
			}, defaultAllow);

			result.message = violationMessage(result.violations);
			result.context = {
				componentId: comp.componentId,
				componentCategory: comp.category,
				containerZoneId: zoneId,
				containerType: containerType
			};

			if (!result.allowed)
			{
				emitInvalid(graph, 'containment', result);
			}

			return result;
		},

		validateEdge: function(graph, schema, sourceCell, targetCell)
		{
			var policies = (schema != null && schema.policies != null) ? schema.policies : {};
			var defaultAllow = !(
				policies.edge != null &&
				policies.edge.default === 'deny'
			);
			var rules = (schema != null && schema.rules != null) ?
				(schema.rules.edgeRules || []) : [];

			var source = createCellContext(graph, sourceCell);
			var target = createCellContext(graph, targetCell);

			var result = evaluateRuleSet(rules, function(rule)
			{
				var when = rule.when || {};

				return matchValue(when.fromComponentId, source.componentId) &&
					matchValue(when.fromCategory, source.category) &&
					matchValue(when.fromZoneId, source.zoneId) &&
					matchValue(when.toComponentId, target.componentId) &&
					matchValue(when.toCategory, target.category) &&
					matchValue(when.toZoneId, target.zoneId) &&
					matchValue(when.zoneContext, source.zoneId);
			}, defaultAllow);

			result.message = violationMessage(result.violations);
			result.context = {
				sourceComponentId: source.componentId,
				sourceCategory: source.category,
				sourceZoneId: source.zoneId,
				targetComponentId: target.componentId,
				targetCategory: target.category,
				targetZoneId: target.zoneId
			};

			if (!result.allowed)
			{
				emitInvalid(graph, 'edge', result);
			}

			return result;
		}
	};
})();
