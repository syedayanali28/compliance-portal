/**
 * Fills HKMA IdaC template (templates/idac-template.xlsx) "System Connections"
 * from firewall-requests JSON. Requires JSZip (js/vendor/jszip.min.js).
 * Exposed as window.ArchitectureFirewallIdac.
 */
(function()
{
	if (window.ArchitectureFirewallIdac != null)
	{
		return;
	}

	var TEMPLATE_URL = 'templates/idac-template.xlsx';
	var DATA_START_ROW = 2;
	var DATA_END_ROW = 201;
	var STYLE_BODY = '2';

	function escapeXml(s)
	{
		if (s == null)
		{
			return '';
		}

		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	function cleanLabel(value)
	{
		if (value == null)
		{
			return null;
		}

		var s = String(value).replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/^\s+|\s+$/g, '');

		return s || null;
	}

	function coerceIdacZone(zoneId, zoneLabel)
	{
		var z = ((zoneId != null ? zoneId : '') + ' ' + (zoneLabel != null ? zoneLabel : '')).toLowerCase();

		if (z.indexOf('internet') >= 0 || /\bext\b/.test(z) || z.indexOf('external') >= 0 || z.indexOf('public') >= 0)
		{
			return 'Internet';
		}

		if (z.indexOf('dmz') >= 0)
		{
			return 'DMZ';
		}

		return 'Intranet';
	}

	function coerceIdacProtocol(protocol)
	{
		if (protocol == null || protocol === '')
		{
			return null;
		}

		var u = String(protocol).replace(/^\s+|\s+$/g, '').toUpperCase();

		if (u === 'ANY')
		{
			return 'Any';
		}

		if (u === 'TCP' || u === 'UDP' || u === 'ICMP')
		{
			return u;
		}

		return 'TCP';
	}

	function coerceIdacDirection(direction)
	{
		if (direction == null || direction === '')
		{
			return null;
		}

		var m = { outbound: 'Outbound', inbound: 'Inbound', bidirectional: 'Bidirectional' };
		var k = String(direction).replace(/^\s+|\s+$/g, '').toLowerCase();

		return m[k] || direction;
	}

	function actionFromRow(row)
	{
		var v = row.validation || {};

		return (v.allowed === false) ? 'Deny' : 'Allow';
	}

	function buildJustification(row)
	{
		var parts = [];

		if (row.firewallRuleReason)
		{
			parts.push(String(row.firewallRuleReason));
		}

		var prov = row.provider;
		var ftype = row.firewallType;

		if (prov || ftype)
		{
			parts.push('Provider: ' + (prov || '—') + '; type: ' + (ftype || '—'));
		}

		if (row.originalEdgeId)
		{
			parts.push('Diagram edge: ' + row.originalEdgeId);
		}

		if (row.appliedRuleIds && row.appliedRuleIds.length)
		{
			parts.push('Rules: ' + row.appliedRuleIds.join(', '));
		}

		var msg = (row.validation && row.validation.message) ? row.validation.message : null;

		if (msg)
		{
			parts.push(String(msg));
		}

		return parts.length ? parts.join(' | ') : null;
	}

	function cellInlineStr(col, row, text, sAttr)
	{
		var ref = col + row;

		if (text == null || text === '')
		{
			return '<c r="' + ref + '" s="' + sAttr + '"/>';
		}

		return '<c r="' + ref + '" s="' + sAttr + '" t="inlineStr"><is><t>' + escapeXml(text) + '</t></is></c>';
	}

	function cellNumber(col, row, num, sAttr)
	{
		return '<c r="' + col + row + '" s="' + sAttr + '"><v>' + num + '</v></c>';
	}

	function buildDataRowXml(excelRow, row)
	{
		var r = String(excelRow);
		var cells = [];

		cells.push(cellNumber('A', r, excelRow - DATA_START_ROW + 1, STYLE_BODY));
		cells.push(cellInlineStr('B', r, cleanLabel(row.sourceComponentLabel), STYLE_BODY));
		cells.push(cellInlineStr('C', r, cleanLabel(row.sourceCategory), STYLE_BODY));
		cells.push(cellInlineStr('D', r, coerceIdacZone(row.sourceZoneId, row.sourceZoneLabel), STYLE_BODY));
		cells.push(cellInlineStr('E', r, null, STYLE_BODY));
		cells.push(cellInlineStr('F', r, cleanLabel(row.destComponentLabel), STYLE_BODY));
		cells.push(cellInlineStr('G', r, cleanLabel(row.destCategory), STYLE_BODY));
		cells.push(cellInlineStr('H', r, coerceIdacZone(row.destZoneId, row.destZoneLabel), STYLE_BODY));
		cells.push(cellInlineStr('I', r, null, STYLE_BODY));
		cells.push(cellInlineStr('J', r, coerceIdacDirection(row.direction), STYLE_BODY));
		cells.push(cellInlineStr('K', r, coerceIdacProtocol(row.protocol), STYLE_BODY));
		cells.push(cellInlineStr('L', r, cleanLabel(row.ports), STYLE_BODY));
		cells.push(cellInlineStr('M', r, actionFromRow(row), STYLE_BODY));
		cells.push(cellInlineStr('N', r, null, STYLE_BODY));
		cells.push(cellInlineStr('O', r, buildJustification(row), STYLE_BODY));
		cells.push(cellInlineStr('P', r, null, STYLE_BODY));
		cells.push(cellInlineStr('Q', r, null, STYLE_BODY));
		cells.push(cellInlineStr('R', r, null, STYLE_BODY));
		cells.push(cellInlineStr('S', r, null, STYLE_BODY));
		// T/U: architecture component IDs for tooling (JIRA correlation); not shown in template UI.
		cells.push(cellInlineStr('T', r, row.sourceComponentId != null ? String(row.sourceComponentId) : null, STYLE_BODY));
		cells.push(cellInlineStr('U', r, row.destComponentId != null ? String(row.destComponentId) : null, STYLE_BODY));

		return '<row r="' + r + '" spans="1:21" x14ac:dyDescent="0.25">' + cells.join('') + '</row>';
	}

	function patchSystemConnectionsSheetXml(originalXml, firewallData)
	{
		var headerMatch = originalXml.match(/<row r="1"[^>]*>[\s\S]*?<\/row>/);

		if (!headerMatch)
		{
			throw new Error('IdaC template: header row not found in System Connections sheet.');
		}

		var headerRow = headerMatch[0];
		var rows = (firewallData && firewallData.rows) ? firewallData.rows : [];
		var maxData = Math.min(rows.length, DATA_END_ROW - DATA_START_ROW + 1);
		var parts = ['<sheetData>', headerRow];
		var i;

		for (i = 0; i < maxData; i++)
		{
			parts.push(buildDataRowXml(DATA_START_ROW + i, rows[i]));
		}

		for (var emptyR = DATA_START_ROW + maxData; emptyR <= DATA_END_ROW; emptyR++)
		{
			parts.push('<row r="' + emptyR + '" spans="1:21" x14ac:dyDescent="0.25"/>');
		}

		parts.push('</sheetData>');

		return originalXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, parts.join(''));
	}

	function idacFilenameFromJsonName(jsonFilename)
	{
		if (jsonFilename == null || jsonFilename === '')
		{
			return 'firewall-requests-idac.xlsx';
		}

		return String(jsonFilename).replace(/\.json$/i, '') + '-idac.xlsx';
	}

	/**
	 * @param {object} firewallData  Output of ArchitectureFirewallExtractor.extract
	 * @param {function(Blob)} onDone
	 * @param {function(Error)} onError
	 */
	function buildXlsxBlob(firewallData, onDone, onError)
	{
		if (typeof JSZip === 'undefined')
		{
			onError(new Error('JSZip is not loaded.'));

			return;
		}

		var fail = (onError != null) ? onError : function() {};

		var tplFetch = new XMLHttpRequest();

		tplFetch.open('GET', TEMPLATE_URL);
		tplFetch.responseType = 'arraybuffer';

		tplFetch.onerror = function()
		{
			fail(new Error('Failed to load IdaC template from ' + TEMPLATE_URL));
		};

		tplFetch.onload = function()
		{
			if (tplFetch.status < 200 || tplFetch.status > 299)
			{
				fail(new Error('Template HTTP ' + tplFetch.status));

				return;
			}

			try
			{
				JSZip.loadAsync(tplFetch.response).then(function(zip)
				{
					return zip.file('xl/worksheets/sheet2.xml').async('string').then(function(sheetXml)
					{
						var patched = patchSystemConnectionsSheetXml(sheetXml, firewallData);

						zip.file('xl/worksheets/sheet2.xml', patched);

						return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
					});
				}).then(function(blob)
				{
					if (onDone != null)
					{
						onDone(blob);
					}
				}).catch(function(e)
				{
					fail(e || new Error('XLSX build failed'));
				});
			}
			catch (e)
			{
				fail(e);
			}
		};

		tplFetch.send();
	}

	/**
	 * @param {Blob} blob
	 * @param {function(string|null)} onDone  base64 without data: prefix
	 */
	function blobToBase64(blob, onDone, onError)
	{
		var reader = new FileReader();

		reader.onloadend = function()
		{
			var s = reader.result;

			if (typeof s !== 'string' || s.indexOf(',') < 0)
			{
				if (onError != null)
				{
					onError(new Error('Unexpected FileReader result'));
				}

				return;
			}

			if (onDone != null)
			{
				onDone(s.split(',')[1]);
			}
		};

		reader.onerror = function()
		{
			if (onError != null)
			{
				onError(new Error('FileReader failed'));
			}
		};

		reader.readAsDataURL(blob);
	}

	window.ArchitectureFirewallIdac = {
		TEMPLATE_URL: TEMPLATE_URL,
		buildXlsxBlob: buildXlsxBlob,
		blobToBase64: blobToBase64,
		idacFilenameFromJsonName: idacFilenameFromJsonName
	};
})();
