/**
 * HKMA Projects Portal - localStorage-backed project store.
 * Exposed as window.HKMAProjectStore.
 *
 * Storage key: hkma.projects  (JSON array of project records)
 *
 * Project record shape:
 * {
 *   id:          string   (UUID)
 *   name:        string   (required)
 *   code:        string
 *   team:        string   (AS1|AS2|ITIS|ITDP|ITPSO|BTG|BSA|ITS|Other)
 *   members:     string   (comma-separated names)
 *   status:      string   (Active|On Hold|Archived)
 *   description: string
 *   diagramXml: string|null
 *   firewallIdacXlsxBase64: string|null  (IdaC workbook — only firewall artefact stored)
 *   firewallIdacFilename:   string|null
 *   firewallLinkedAt:        string|null  (ISO date when IdaC was linked)
 *   linkedAt:    string|null  (ISO date)
 *   createdAt:   string  (ISO date)
 *   updatedAt:   string  (ISO date)
 * }
 */
(function()
{
	if (window.HKMAProjectStore != null)
	{
		return;
	}

	var STORAGE_KEY = 'hkma.projects';

	function generateId()
	{
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
		{
			return crypto.randomUUID();
		}

		// Fallback: time-based UUID v4 approximation
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c)
		{
			var r = Math.random() * 16 | 0;
			var v = (c === 'x') ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	function loadAll()
	{
		try
		{
			var raw = localStorage.getItem(STORAGE_KEY);

			if (raw == null || raw === '')
			{
				return [];
			}

			var parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		}
		catch (e)
		{
			return [];
		}
	}

	function persistAll(projects)
	{
		try
		{
			localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
			return true;
		}
		catch (e)
		{
			return false;
		}
	}

	var LEGACY_FW_JSON_STRIP_KEY = 'hkma.projects.legacyFirewallJsonStripped';

	/**
	 * Remove deprecated per-project firewallJson / firewallFilename from localStorage (one-time).
	 */
	function stripLegacyFirewallJsonFields()
	{
		try
		{
			if (localStorage.getItem(LEGACY_FW_JSON_STRIP_KEY) === '1')
			{
				return;
			}
		}
		catch (e)
		{
			return;
		}

		var all = loadAll();
		var changed = false;
		var i;
		var p;

		for (i = 0; i < all.length; i++)
		{
			p = all[i];

			if (p == null)
			{
				continue;
			}

			if (p.firewallJson !== undefined)
			{
				delete p.firewallJson;
				changed = true;
			}

			if (p.firewallFilename !== undefined)
			{
				delete p.firewallFilename;
				changed = true;
			}
		}

		if (changed)
		{
			persistAll(all);
		}

		try
		{
			// Mark complete even if nothing changed (avoids re-scanning every load).
			localStorage.setItem(LEGACY_FW_JSON_STRIP_KEY, '1');
		}
		catch (e2)
		{
			// ignore
		}
	}

	function getAll()
	{
		return loadAll();
	}

	function getById(id)
	{
		var all = loadAll();

		for (var i = 0; i < all.length; i++)
		{
			if (all[i].id === id)
			{
				return all[i];
			}
		}

		return null;
	}

	/**
	 * Insert or update a project record.
	 * If project.id is falsy, a new UUID is assigned and createdAt is set.
	 * updatedAt is always refreshed.
	 * Returns the saved project.
	 */
	function save(project)
	{
		var all = loadAll();
		var now = new Date().toISOString();

		if (!project.id)
		{
			project.id = generateId();
			project.createdAt = now;
		}

		project.updatedAt = now;

		var found = false;

		for (var i = 0; i < all.length; i++)
		{
			if (all[i].id === project.id)
			{
				all[i] = project;
				found = true;
				break;
			}
		}

		if (!found)
		{
			all.push(project);
		}

		persistAll(all);
		return project;
	}

	/**
	 * Delete a project by id. Returns true if found and removed.
	 */
	function deleteById(id)
	{
		var all = loadAll();
		var next = [];

		for (var i = 0; i < all.length; i++)
		{
			if (all[i].id !== id)
			{
				next.push(all[i]);
			}
		}

		if (next.length === all.length)
		{
			return false;
		}

		persistAll(next);
		return true;
	}

	/**
	 * One-time demo bootstrap (key: hkma.projects.demoBootstrap).
	 * Inserts fixed-ID sample projects only if those IDs are absent, so BTG edits/deletes persist.
	 * CSP row loads diagram from /demo/* when fetch succeeds; IdaC workbook is filled in by the portal (see projects.html).
	 */
	var DEMO_BOOTSTRAP_KEY = 'hkma.projects.demoBootstrap';

	function buildDemoSeedProjects(nowIso, diagramXml)
	{
		var cspLinkedAt = (diagramXml != null) ? nowIso : null;

		return [
			{
				id: '0c81aab9-a1f2-47e5-9638-0c881b7d6cf1',
				name: 'CSP Phase 2 Architecture',
				code: 'CSP',
				team: 'BTG',
				members: 'Ryan Chan, Raymond So',
				status: 'Active',
				description: 'Demo: CSP Phase 2 zones, Kong API Gateway, AI Portal BFF, and core integration — same scenario as the CSP walkthrough. Diagram and IdaC firewall workbook ship under demo/.',
				diagramXml: diagramXml != null ? diagramXml : null,
				diagramFilename: diagramXml != null ? 'csp-architecture-2.drawio' : null,
				firewallIdacXlsxBase64: null,
				firewallIdacFilename: null,
				firewallLinkedAt: null,
				linkedAt: cspLinkedAt,
				createdAt: '2026-04-27T04:32:26.329Z',
				updatedAt: nowIso
			},
			{
				id: 'acb9e644-471a-4922-b3f4-a4b450b83d44',
				name: 'Core Banking Modernisation',
				code: 'COREBANK',
				team: 'AS1',
				members: 'Carol Chan, David Ng',
				status: 'Active',
				description: 'Sample project: GL reconciliation, batch processor, and Oracle DB migration.',
				diagramXml: null,
				diagramFilename: null,
				firewallIdacXlsxBase64: null,
				firewallIdacFilename: null,
				firewallLinkedAt: null,
				linkedAt: null,
				createdAt: '2026-04-27T04:37:59.615Z',
				updatedAt: nowIso
			},
			{
				id: '685f1d00-57a4-4459-801e-369ad8522e1f',
				name: 'ARB Architecture Review',
				code: 'ARB',
				team: 'BTG',
				members: 'Eric Hui',
				status: 'On Hold',
				description: 'Sample project: quarterly architecture review board — on hold pending governance refresh.',
				diagramXml: null,
				diagramFilename: null,
				firewallIdacXlsxBase64: null,
				firewallIdacFilename: null,
				firewallLinkedAt: null,
				linkedAt: null,
				createdAt: '2026-04-27T04:38:27.993Z',
				updatedAt: nowIso
			}
		];
	}

	function mergeDemoSeedsIfMissing(diagramXml)
	{
		var nowIso = new Date().toISOString();
		var seeds = buildDemoSeedProjects(nowIso, diagramXml);
		var i;

		for (i = 0; i < seeds.length; i++)
		{
			if (getById(seeds[i].id) == null)
			{
				save(seeds[i]);
			}
		}

		try
		{
			localStorage.setItem(DEMO_BOOTSTRAP_KEY, '1');
		}
		catch (e)
		{
			// ignore
		}
	}

	/**
	 * @param {function(Error|null)=} callback  Called when done (sync or async).
	 */
	function bootstrapDemoProjectsIfNeeded(callback)
	{
		var cb = (typeof callback === 'function') ? callback : function() {};
		var already = false;

		try
		{
			already = localStorage.getItem(DEMO_BOOTSTRAP_KEY) === '1';
		}
		catch (e)
		{
			already = false;
		}

		if (already)
		{
			cb(null);
			return;
		}

		var diagramUrl = 'demo/csp-architecture-2.drawio';

		if (typeof fetch !== 'function')
		{
			mergeDemoSeedsIfMissing(null);
			cb(null);
			return;
		}

		fetch(diagramUrl).then(function(res)
		{
			if (!res.ok)
			{
				throw new Error('diagram HTTP ' + res.status);
			}

			return res.text();
		}).then(function(text)
		{
			mergeDemoSeedsIfMissing(text);
			cb(null);
		}).catch(function()
		{
			mergeDemoSeedsIfMissing(null);
			cb(null);
		});
	}

	window.HKMAProjectStore = {
		generateId: generateId,
		getAll: getAll,
		getById: getById,
		save: save,
		delete: deleteById,
		bootstrapDemoProjectsIfNeeded: bootstrapDemoProjectsIfNeeded,
		stripLegacyFirewallJsonFields: stripLegacyFirewallJsonFields
	};
})();
