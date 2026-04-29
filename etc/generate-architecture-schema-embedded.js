/**
 * Writes js/diagramly/architecture/ArchitectureSchemaEmbedded.js from
 * schemas/architecture.schema.json (single source of truth for base firewall +
 * validation rules and the rest of the HKMA architecture schema). Run from repo root:
 *   node etc/generate-architecture-schema-embedded.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var srcJson = path.join(root, 'src', 'main', 'webapp', 'schemas', 'architecture.schema.json');
var outJs = path.join(root, 'src', 'main', 'webapp', 'js', 'diagramly', 'architecture', 'ArchitectureSchemaEmbedded.js');

var json = fs.readFileSync(srcJson, 'utf8');
JSON.parse(json); // validate

var banner =
	'/**\n' +
	' * Auto-generated from schemas/architecture.schema.json (canonical base,\n' +
	' * including firewallRules + rules). Do not edit by hand.\n' +
	' * Bundled so Architecture / Zones and Components work when the JSON file\n' +
	' * cannot be fetched (wrong base URL, file://, or missing static route).\n' +
	' * Regenerate: node etc/generate-architecture-schema-embedded.js\n' +
	' * Storage keys: js/diagramly/architecture/HKMAArchitectureConstants.js\n' +
	' */\n' +
	'(function()\n' +
	'{\n' +
	'\twindow.__HKMA_ARCHITECTURE_BASE_SCHEMA__ = ';

var footer = ';\n})();\n';

fs.writeFileSync(outJs, banner + json + footer, 'utf8');
console.log('Wrote', outJs);
