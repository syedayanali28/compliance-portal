/**
 * Architecture schema registry and override merge utilities.
 */
(function()
{
	if (window.ArchitectureSchemaRegistry != null)
	{
		return;
	}

	var DEFAULT_SCHEMA_URL = 'schemas/architecture.schema.json';
	var PAGE_OVERRIDE_ATTR = 'archSchemaOverrides';
	var CACHE_BUST = (urlParams['dev'] == '1') ? ('?_=' + new Date().getTime()) : '';
	var _baseSchema = null;
	var _effectiveSchema = null;
	var _loadError = null;

	/**
	 * Copy of schemas/architecture.schema.json bundled in ArchitectureSchemaEmbedded.js
	 * when the separate JSON request fails (clone on new machine, wrong document root).
	 */
	function getEmbeddedBaseSchema()
	{
		if (typeof window === 'undefined' || window.__HKMA_ARCHITECTURE_BASE_SCHEMA__ == null)
		{
			return null;
		}

		try
		{
			return JSON.parse(JSON.stringify(window.__HKMA_ARCHITECTURE_BASE_SCHEMA__));
		}
		catch (e)
		{
			return null;
		}
	}

	function adoptEmbeddedBaseIfMissing()
	{
		if (_baseSchema == null)
		{
			var emb = getEmbeddedBaseSchema();

			if (emb != null)
			{
				_baseSchema = emb;
				_loadError = null;
			}
		}
	}

	function safeClone(obj)
	{
		return (obj != null) ? JSON.parse(JSON.stringify(obj)) : null;
	}

	function mergeObjects(baseObj, overrideObj)
	{
		var result = {};
		var key;
		baseObj = baseObj || {};
		overrideObj = overrideObj || {};
		
		for (key in baseObj)
		{
			if (baseObj.hasOwnProperty(key))
			{
				result[key] = safeClone(baseObj[key]);
			}
		}
		
		for (key in overrideObj)
		{
			if (overrideObj.hasOwnProperty(key))
			{
				result[key] = safeClone(overrideObj[key]);
			}
		}
		
		return result;
	}

	function toMap(items)
	{
		var map = {};

		if (items != null)
		{
			for (var i = 0; i < items.length; i++)
			{
				if (items[i] != null && items[i].id != null)
				{
					map[items[i].id] = safeClone(items[i]);
				}
			}
		}

		return map;
	}

	function mapToArray(map)
	{
		var result = [];

		for (var key in map)
		{
			if (map.hasOwnProperty(key))
			{
				result.push(map[key]);
			}
		}

		return result;
	}

	function mergeById(baseItems, overrideItems)
	{
		var baseMap = toMap(baseItems);

		if (overrideItems != null)
		{
			for (var i = 0; i < overrideItems.length; i++)
			{
				var item = overrideItems[i];

				if (item == null || item.id == null)
				{
					continue;
				}

				if (item._delete === true)
				{
					delete baseMap[item.id];
				}
				else if (baseMap[item.id] != null)
				{
					baseMap[item.id] = mergeObjects(baseMap[item.id], item);
				}
				else
				{
					baseMap[item.id] = safeClone(item);
				}
			}
		}

		return mapToArray(baseMap);
	}

	function mergeStyles(baseStyles, overrideStyles)
	{
		var merged = {};
		var key;

		if (baseStyles != null)
		{
			for (key in baseStyles)
			{
				if (baseStyles.hasOwnProperty(key))
				{
					merged[key] = baseStyles[key];
				}
			}
		}

		if (overrideStyles != null)
		{
			for (key in overrideStyles)
			{
				if (overrideStyles.hasOwnProperty(key))
				{
					if (overrideStyles[key] == null)
					{
						delete merged[key];
					}
					else
					{
						merged[key] = overrideStyles[key];
					}
				}
			}
		}

		return merged;
	}

	function mergeFirewallRules(baseFirewallRules, overrideFirewallRules)
	{
		baseFirewallRules = baseFirewallRules || {};
		overrideFirewallRules = overrideFirewallRules || {};

		return {
			default: mergeObjects(
				baseFirewallRules.default || {},
				overrideFirewallRules.default || {}
			),
			rules: mergeById(
				baseFirewallRules.rules || [],
				overrideFirewallRules.rules || []
			)
		};
	}

	function mergeRules(baseRules, overrideRules)
	{
		baseRules = baseRules || {};
		overrideRules = overrideRules || {};

		return {
			edgeRules: mergeById(baseRules.edgeRules || [], overrideRules.edgeRules || []),
			containmentRules: mergeById(baseRules.containmentRules || [], overrideRules.containmentRules || [])
		};
	}

	function buildEffectiveSchema(baseSchema, overrides)
	{
		var result = safeClone(baseSchema) || {};
		overrides = overrides || {};

		result.meta = result.meta || {};
		result.meta.effectiveUpdatedAt = new Date().toISOString();
		result.meta.overrideSource = 'diagram';

		result.policies = mergeObjects(result.policies || {}, overrides.policies || {});
		result.zones = mergeById(result.zones || [], overrides.zones || []);
		result.componentCategories = mergeById(result.componentCategories || [], overrides.componentCategories || []);
		result.components = mergeById(result.components || [], overrides.components || []);
		result.styles = mergeStyles(result.styles || {}, overrides.styles || {});
		result.rules = mergeRules(result.rules || {}, overrides.rules || {});
		result.firewallRules = mergeFirewallRules(result.firewallRules || {}, overrides.firewallRules || {});

		return result;
	}

	function parseOverrides(raw)
	{
		if (raw == null || raw.length == 0)
		{
			return null;
		}

		try
		{
			return JSON.parse(raw);
		}
		catch (e)
		{
			if (window.console != null)
			{
				console.warn('Invalid architecture schema overrides JSON', e);
			}
		}

		return null;
	}

	function loadBaseSchema(callback)
	{
		if (_baseSchema != null)
		{
			callback(_baseSchema);
			return;
		}

		mxUtils.get(DEFAULT_SCHEMA_URL + CACHE_BUST, function(req)
		{
			try
			{
				_baseSchema = JSON.parse(req.getText());
			}
			catch (e)
			{
				_loadError = e;
			}

			adoptEmbeddedBaseIfMissing();
			callback(_baseSchema);
		},
		function()
		{
			_loadError = new Error('Unable to load architecture schema.');
			adoptEmbeddedBaseIfMissing();
			callback(_baseSchema);
		});
	}

	function loadBaseSchemaSync()
	{
		if (_baseSchema != null)
		{
			return _baseSchema;
		}

		try
		{
			var req = mxUtils.load(DEFAULT_SCHEMA_URL + CACHE_BUST);
			_baseSchema = JSON.parse(req.getText());
			_loadError = null;
		}
		catch (e)
		{
			_loadError = e;
			_baseSchema = null;
		}

		adoptEmbeddedBaseIfMissing();

		return _baseSchema;
	}

	function currentPage(ui)
	{
		return (ui != null) ? ui.currentPage : null;
	}

	window.ArchitectureSchemaRegistry =
	{
		load: function(ui, done)
		{
			loadBaseSchema(function(baseSchema)
			{
				var page = currentPage(ui);
				var overrides = (page != null && page.node != null) ?
					parseOverrides(page.node.getAttribute(PAGE_OVERRIDE_ATTR)) : null;
				_effectiveSchema = buildEffectiveSchema(baseSchema, overrides);

				if (typeof done === 'function')
				{
					done(_effectiveSchema, _loadError);
				}
			});
		},

		getBase: function()
		{
			return safeClone(_baseSchema);
		},

		loadSync: function(ui)
		{
			var baseSchema = loadBaseSchemaSync();
			var page = currentPage(ui);
			var overrides = (page != null && page.node != null) ?
				parseOverrides(page.node.getAttribute(PAGE_OVERRIDE_ATTR)) : null;
			_effectiveSchema = buildEffectiveSchema(baseSchema, overrides);

			return this.getEffective();
		},

		getEffective: function()
		{
			return safeClone(_effectiveSchema);
		},

		getOverrides: function(ui)
		{
			var page = currentPage(ui);

			if (page == null || page.node == null)
			{
				console.warn('[SchemaRegistry] getOverrides: no page or page.node');
				return null;
			}

			var raw = page.node.getAttribute(PAGE_OVERRIDE_ATTR);
			console.log('[SchemaRegistry] getOverrides raw attribute:', raw);
			return parseOverrides(raw);
		},

		setOverrides: function(ui, overrides)
		{
			var page = currentPage(ui);

			console.group('[SchemaRegistry] setOverrides called');
			console.log('  page:', page);
			console.log('  page.node:', page != null ? page.node : 'NULL — no page!');
			console.log('  overrides being written:', JSON.stringify(overrides, null, 2));

			if (page == null || page.node == null)
			{
				console.error('[SchemaRegistry] setOverrides ABORTED — no page or page.node');
				console.groupEnd();
				return;
			}

			if (overrides == null)
			{
				page.node.removeAttribute(PAGE_OVERRIDE_ATTR);
				console.log('  → removed attribute (overrides was null)');
			}
			else
			{
				var serialized = JSON.stringify(overrides);
				page.node.setAttribute(PAGE_OVERRIDE_ATTR, serialized);
				console.log('  → wrote attribute, length=' + serialized.length);
			}

			// Immediately read back to confirm round-trip
			var readBack = page.node.getAttribute(PAGE_OVERRIDE_ATTR);
			console.log('  → readBack from node:', readBack);

			_effectiveSchema = buildEffectiveSchema(_baseSchema, overrides);
			var effRules = _effectiveSchema && _effectiveSchema.rules;
			console.log('  → effective edgeRules after merge:', JSON.stringify(effRules && effRules.edgeRules));

			// Mark the diagram as modified so draw.io auto-save and the
			// dirty indicator pick up the override change.
			if (ui != null && ui.editor != null)
			{
				ui.editor.setModified(true);
				ui.editor.modified = true;
				console.log('  → editor.modified set to true');
			}
			else
			{
				console.warn('[SchemaRegistry] setOverrides: ui.editor is null, could not mark modified');
			}

			console.groupEnd();
		},

		refreshEffective: function(ui)
		{
			var overrides = this.getOverrides(ui);
			_effectiveSchema = buildEffectiveSchema(_baseSchema, overrides);

			return this.getEffective();
		},

		resolveStyle: function(styleRef)
		{
			if (_effectiveSchema != null && _effectiveSchema.styles != null)
			{
				return _effectiveSchema.styles[styleRef] || null;
			}

			return null;
		},

		getLoadError: function()
		{
			return _loadError;
		}
	};
})();
