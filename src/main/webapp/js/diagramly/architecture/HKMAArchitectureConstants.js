/**
 * HKMA — single declaration for where architecture firewall + validation rules
 * are stored and how consumers stay in sync.
 *
 * Canonical base definitions (default firewall chain + validation rules, zones,
 * components, …): **schemas/architecture.schema.json** only.
 * Regenerate the offline bundle with:
 *   node etc/generate-architecture-schema-embedded.js
 *
 * Organisation-wide edits from the Firewall Rules Panel merge on top of that
 * base and are persisted under GLOBAL_OVERRIDES_LS_KEY only (never duplicate
 * full rule sets in a second JSON file).
 */
(function()
{
	window.HKMAArchitectureConstants = {
		GLOBAL_OVERRIDES_LS_KEY: 'hkma.architecture.globalOverrides',
		PAGE_OVERRIDE_ATTR: 'archSchemaOverrides',
		DEFAULT_SCHEMA_RELATIVE_URL: 'schemas/architecture.schema.json',
		BROADCAST_CHANNEL_NAME: 'hkma-architecture-global'
	};
})();
