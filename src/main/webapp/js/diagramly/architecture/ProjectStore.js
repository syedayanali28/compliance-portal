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
 *   diagramJson: object|null
 *   firewallJson: object|null
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

	window.HKMAProjectStore = {
		generateId: generateId,
		getAll: getAll,
		getById: getById,
		save: save,
		delete: deleteById
	};
})();
