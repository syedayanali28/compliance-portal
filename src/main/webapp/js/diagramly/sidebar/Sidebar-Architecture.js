/**
 * Company architecture palette built from source-of-truth schema.
 */
(function()
{
	Sidebar.prototype.addArchitecturePalette = function()
	{
		var registry = window.ArchitectureSchemaRegistry;
		
		if (registry == null)
		{
			return;
		}
		
		var schema = registry.getEffective() || registry.loadSync(this.editorUi);
		
		if (schema == null)
		{
			return;
		}
		
		var graph = this.editorUi.editor.graph;
		var sb = this;
		var zoneFns = [];
		var componentFns = [];

		this.setCurrentSearchEntryLibrary('architecture', 'zones');
		
		for (var i = 0; i < (schema.zones || []).length; i++)
		{
			(function(zone)
			{
				var style = registry.resolveStyle(zone.styleRef) ||
					'swimlane;rounded=1;container=1;collapsible=0;html=1;whiteSpace=wrap;';
				var tags = 'architecture zone ' + zone.id + ' ' + (zone.name || '');

				zoneFns.push(sb.addEntry(tags, function()
				{
					var cell = new mxCell(zone.name || zone.id,
						new mxGeometry(0, 0, 320, 200), style);
					cell.vertex = true;
					
					cell.setValue(mxUtils.createXmlDocument().createElement('object'));
					cell.setAttribute('label', zone.name || zone.id);
					cell.setAttribute('archZoneId', zone.id);
					cell.setAttribute('archContainerType', 'zone');
					cell.setAttribute('placeholders', '1');
					
					return sb.createVertexTemplateFromCells([cell], 320, 200, zone.name || zone.id);
				}));
			})(schema.zones[i]);
		}

		this.addPalette('architectureZones', 'Architecture / Zones', true, mxUtils.bind(this, function(content)
		{
			for (var i = 0; i < zoneFns.length; i++)
			{
				content.appendChild(zoneFns[i](content));
			}
		}));

		this.setCurrentSearchEntryLibrary('architecture', 'components');
		
		var categoryMap = {};
		var categories = schema.componentCategories || [];
		
		for (var c = 0; c < categories.length; c++)
		{
			if (categories[c] != null && categories[c].id != null)
			{
				categoryMap[categories[c].id] = categories[c];
			}
		}
		
		for (var j = 0; j < (schema.components || []).length; j++)
		{
			(function(component)
			{
				var category = categoryMap[component.category] || {id: component.category, styleRef: null};
				var style = registry.resolveStyle(component.shapeRef || category.styleRef) ||
					'rounded=1;whiteSpace=wrap;html=1;';
				var tags = 'architecture component ' + component.id + ' ' + component.category + ' ' + (component.label || '');
				
				componentFns.push(sb.addEntry(tags, function()
				{
					var cell = new mxCell(component.label || component.id,
						new mxGeometry(0, 0, 170, 60), style);
					cell.vertex = true;
					cell.setValue(mxUtils.createXmlDocument().createElement('object'));
					cell.setAttribute('label', component.label || component.id);
					cell.setAttribute('archComponentId', component.id);
					cell.setAttribute('archCategory', component.category);
					cell.setAttribute('placeholders', '1');
					
					return sb.createVertexTemplateFromCells([cell], 170, 60, component.label || component.id);
				}));
			})(schema.components[j]);
		}

		this.addPalette('architectureComponents', 'Architecture / Components', false, mxUtils.bind(this, function(content)
		{
			for (var i = 0; i < componentFns.length; i++)
			{
				content.appendChild(componentFns[i](content));
			}
		}));

		if (this.palettes.architectureZones != null && this.palettes.architectureZones[0] != null)
		{
			this.palettes.architectureZones[0].setAttribute('title',
				'Schema-driven zone containers with containment validation.');
		}
		
		if (this.palettes.architectureComponents != null && this.palettes.architectureComponents[0] != null)
		{
			this.palettes.architectureComponents[0].setAttribute('title',
				'Schema-driven components with edge and placement validation.');
		}
		
		this.setCurrentSearchEntryLibrary();
		
		graph.setArchitectureSchema(schema);
	};
})();
