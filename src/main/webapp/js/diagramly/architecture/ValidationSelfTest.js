/**
 * Architecture validation self-test runner using fixtures.
 */
(function()
{
	if (window.ArchitectureValidationSelfTest != null)
	{
		return;
	}

	function makeCell(attrs)
	{
		attrs = attrs || {};
		var cell = new mxCell('', new mxGeometry(0, 0, 120, 40), '');
		cell.vertex = true;
		cell.setValue(mxUtils.createXmlDocument().createElement('object'));

		for (var key in attrs)
		{
			if (attrs.hasOwnProperty(key) && attrs[key] != null)
			{
				cell.setAttribute(key, attrs[key]);
			}
		}

		return cell;
	}

	function runCase(graph, testCase)
	{
		var schema = testCase.schema || {};
		var result;
		
		if (testCase.type === 'edge')
		{
			var source = makeCell({
				archComponentId: testCase.source.componentId,
				archCategory: testCase.source.category,
				archZoneId: testCase.source.zoneId
			});
			var target = makeCell({
				archComponentId: testCase.target.componentId,
				archCategory: testCase.target.category,
				archZoneId: testCase.target.zoneId
			});
			graph.addCell(source);
			graph.addCell(target);
			result = window.ArchitectureValidationEngine.validateEdge(graph, schema, source, target);
		}
		else
		{
			var zone = makeCell({
				archZoneId: testCase.container.zoneId,
				archContainerType: testCase.container.containerType
			});
			var component = makeCell({
				archComponentId: testCase.component.componentId,
				archCategory: testCase.component.category,
				archZoneId: testCase.component.zoneId
			});
			graph.addCell(zone);
			graph.addCell(component, zone);
			result = window.ArchitectureValidationEngine.validateContainment(graph, schema, component, zone);
		}

		var pass = (result.allowed === testCase.expectAllowed);
		
		if (pass && testCase.expectViolationRuleId != null)
		{
			var found = false;
			
			for (var i = 0; i < (result.violations || []).length; i++)
			{
				if (result.violations[i].id === testCase.expectViolationRuleId)
				{
					found = true;
					break;
				}
			}
			
			pass = found;
		}

		return {
			id: testCase.id,
			pass: pass,
			result: result
		};
	}

	window.ArchitectureValidationSelfTest =
	{
		run: function(graph, fixtures)
		{
			var results = [];
			var cases = (fixtures != null && fixtures.cases != null) ? fixtures.cases : [];
			
			for (var i = 0; i < cases.length; i++)
			{
				results.push(runCase(graph, cases[i]));
			}
			
			return results;
		}
	};
})();
